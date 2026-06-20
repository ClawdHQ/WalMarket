import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Transaction } from '@mysten/sui/transactions';
import { MemWalConnector } from '../memwal-connector.js';
import { WalMarketClient, type Signer } from '../walmarket-client.js';

export interface QueryResponderConfig {
  network: 'testnet' | 'mainnet';
  packageId: string;
  // Package ID of the most recent `sui client upgrade`, if any — moveCall
  // targets need this to pick up post-publish behavior changes (e.g. the
  // MAX_FREE_QUERIES cap), since each upgrade is a separate immutable package
  // object and the original ID's bytecode never changes. Defaults to packageId.
  latestPackageId?: string;
  registryId: string;
  memwalRelayerUrl: string;
  // The seller's own dedicated agent keypair — must match the `operator`
  // address set on each of their listings via set_operator (defaults to the
  // listing owner if set_operator was never called). This is intentionally a
  // different identity than the seller's zkLogin wallet: it's a long-lived
  // key this process can sign with autonomously.
  agentPrivateKey: string;
  pollIntervalMs?: number;
  logger?: Pick<typeof console, 'log' | 'error' | 'warn'>;
}

interface QueryRequestedEvent {
  listing_id: string;
  requester: string;
  query_id: string;
}

type EventCursor = { txDigest: string; eventSeq: string } | null;

// Starts polling for QueryRequested events and keeps running until the
// process exits. Safe to call from a long-lived Node process (CLI agent or a
// Next.js server via instrumentation.ts) — not suitable for serverless/edge
// runtimes that don't keep a process alive between requests.
//
// Every seller runs their OWN instance of this with their OWN agentPrivateKey
// (self-hosted, non-custodial — see rental-key-manager-service.ts for the
// matching delegate-key-registration half). Since QueryRequested events are
// global per package (Sui events have no per-seller scoping), each instance
// filters to only the listings whose `operator` matches its own derived
// address — otherwise every seller's agent would attempt every other
// seller's queries and fail submit_query_response's operator check on each.
export function startQueryResponder(config: QueryResponderConfig): void {
  const { network, packageId, memwalRelayerUrl, pollIntervalMs = 5000 } = config;
  const log = config.logger ?? console;

  const client = new SuiClient({ url: getFullnodeUrl(network) });
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(config.agentPrivateKey.replace('0x', ''), 'hex'));
  const agentAddress = keypair.getPublicKey().toSuiAddress();

  const signer: Signer = {
    getAddress: () => agentAddress,
    toSuiAddress: () => keypair.toSuiAddress(),
    signPersonalMessage: (message: Uint8Array) => keypair.signPersonalMessage(message),
    signAndExecuteTransaction: async (opts: { transaction: Transaction }) => {
      opts.transaction.setSenderIfNotSet(agentAddress);
      const bytes = await opts.transaction.build({ client });
      const { signature } = await keypair.signTransaction(bytes);
      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showEvents: true },
        requestType: 'WaitForLocalExecution',
      });
      return { digest: result.digest, effects: result.effects, events: result.events ?? undefined };
    },
  };

  const walmarket = new WalMarketClient(client, {
    packageId,
    latestPackageId: config.latestPackageId ?? packageId,
    registryId: config.registryId,
    network,
  });

  async function getListingDetails(listingId: string): Promise<{ operator: string; namespace: string; accountId: string } | null> {
    const obj = await client.getObject({ id: listingId, options: { showContent: true } });
    if (obj.data?.content?.dataType !== 'moveObject') return null;
    const f = obj.data.content.fields as Record<string, unknown>;
    return {
      operator: (f['operator'] as string) ?? (f['owner'] as string),
      namespace: f['namespace'] as string,
      accountId: f['account_id'] as string,
    };
  }

  const handledQueryIds = new Set<string>();

  async function handleQueryRequested(event: { parsedJson: unknown }): Promise<void> {
    const { listing_id, requester, query_id } = event.parsedJson as QueryRequestedEvent;
    if (handledQueryIds.has(query_id)) return;
    handledQueryIds.add(query_id);

    const listing = await getListingDetails(listing_id);
    if (!listing) return;

    // Not our listing — some other seller's agent owns this one. Skip
    // silently; this is expected/routine in a multi-seller marketplace, not
    // an error.
    if (listing.operator !== agentAddress) return;

    log.log(`\n[QueryResponder] QueryRequested: ${query_id}`);
    log.log(`  Listing: ${listing_id}`);
    log.log(`  Requester: ${requester}`);

    try {
      const obj = await client.getObject({ id: query_id, options: { showContent: true } });
      if (obj.data?.content?.dataType !== 'moveObject') {
        log.error(`  Could not load QueryRequest ${query_id} — skipping`);
        return;
      }
      const message = (obj.data.content.fields as Record<string, unknown>)['message'] as string;
      log.log(`  Message: "${message}"`);

      const connector = new MemWalConnector({
        accountId: listing.accountId,
        namespace: listing.namespace,
        relayerUrl: memwalRelayerUrl,
        privateKey: config.agentPrivateKey,
      });

      const { answer, memoriesUsed } = await connector.ask(message, listing.namespace, listing.accountId);
      log.log(`  Answer (${memoriesUsed} memories used): "${answer.slice(0, 80)}${answer.length > 80 ? '…' : ''}"`);

      await walmarket.submitQueryResponse(signer, listing_id, query_id, answer, memoriesUsed);
      log.log(`  ✓ Response submitted on-chain for query ${query_id}`);
    } catch (e) {
      log.error(`  Error answering query:`, e);
    }
  }

  let cursor: EventCursor = null;

  async function initCursor(): Promise<void> {
    try {
      const res = await client.queryEvents({
        query: { MoveEventType: `${packageId}::walmarket::QueryRequested` },
        limit: 1,
        order: 'descending',
      });
      if (res.data.length > 0 && res.nextCursor) {
        cursor = res.nextCursor as EventCursor;
        log.log('[QueryResponder] Caught up to latest event — listening for new queries…');
      } else {
        log.log('[QueryResponder] No existing query events — waiting for first query…');
      }
    } catch (e) {
      log.warn('[QueryResponder] Could not initialise cursor:', e);
    }
  }

  async function poll(): Promise<void> {
    try {
      const events = await client.queryEvents({
        query: { MoveEventType: `${packageId}::walmarket::QueryRequested` },
        cursor,
        limit: 20,
        order: 'ascending',
      });

      for (const event of events.data) {
        await handleQueryRequested(event as { parsedJson: unknown });
      }

      if (events.nextCursor) {
        cursor = events.nextCursor as EventCursor;
      }
    } catch (e) {
      log.error('[QueryResponder] Poll error:', e);
    }
  }

  log.log('WalMarket Query Responder');
  log.log(`Network: ${network}`);
  log.log(`Agent:   ${agentAddress}`);

  void initCursor().then(() => {
    setInterval(() => void poll(), pollIntervalMs);
    void poll();
  });
}
