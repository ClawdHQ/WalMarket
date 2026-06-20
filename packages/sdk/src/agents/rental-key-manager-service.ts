import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { addDelegateKey as addDelegateKeyOnChain, removeDelegateKey as removeDelegateKeyOnChain } from '@mysten-incubation/memwal/account';
import { isPermanentAccess } from '../types.js';

export interface RentalKeyManagerConfig {
  network: 'testnet' | 'mainnet';
  packageId: string;
  // Delegate keys live on MemWal's own account contract, not WalMarket's —
  // addDelegateKey/removeDelegateKey call `{memwalPackageId}::account::*_delegate_key`.
  memwalPackageId: string;
  memwalAccountId: string;
  memwalPrivateKey: string;
  pollIntervalMs?: number;
  logger?: Pick<typeof console, 'log' | 'error' | 'warn'>;
}

type EventId = { txDigest: string; eventSeq: string };

interface RentStartedEvent {
  listing_id: string;
  renter: string;
  access_id: string;
  expires_at: string;
}

interface RentExpiredEvent {
  access_id: string;
}

// Starts polling for RentStarted/RentExpired events and keeps running until the
// process exits. Safe to call from a long-lived Node process (CLI agent or a
// Next.js server via instrumentation.ts) — not suitable for serverless/edge
// runtimes that don't keep a process alive between requests.
export function startRentalKeyManager(config: RentalKeyManagerConfig): void {
  const { network, packageId, memwalPackageId, memwalAccountId, memwalPrivateKey, pollIntervalMs = 5000 } = config;
  const log = config.logger ?? console;

  const client = new SuiClient({ url: getFullnodeUrl(network) });
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(memwalPrivateKey.replace('0x', ''), 'hex'));
  const sender = keypair.getPublicKey().toSuiAddress();

  // NOTE: add_delegate_key/remove_delegate_key are scoped to the MemWal *account*
  // (`{packageId}::account::add_delegate_key(account, public_key)` — no namespace
  // argument), not to an individual namespace. Since all of this marketplace's seed
  // listings share one account_id across multiple namespaces, a granted delegate key
  // authenticates against the whole account — namespace-level isolation between a
  // rented/bought listing and the seller's other listings depends on MemWal's relayer-
  // side authorization, not on anything WalMarket's contract or this agent controls.
  async function addDelegateKey(pubkey: Uint8Array): Promise<void> {
    await addDelegateKeyOnChain({
      packageId: memwalPackageId,
      accountId: memwalAccountId,
      publicKey: pubkey,
      label: 'WalMarket Rental',
      suiPrivateKey: keypair.getSecretKey(),
      suiNetwork: network,
    });
  }

  async function removeDelegateKey(pubkey: Uint8Array): Promise<void> {
    await removeDelegateKeyOnChain({
      packageId: memwalPackageId,
      accountId: memwalAccountId,
      publicKey: pubkey,
      suiPrivateKey: keypair.getSecretKey(),
      suiNetwork: network,
    });
  }

  async function getAccessDetails(accessId: string): Promise<{ namespace: string; accountId: string; delegateKeyPublic: number[] } | null> {
    const obj = await client.getObject({ id: accessId, options: { showContent: true } });
    if (obj.data?.content?.dataType !== 'moveObject') return null;
    const f = obj.data.content.fields as Record<string, unknown>;
    return {
      namespace: f['namespace'] as string,
      accountId: f['account_id'] as string,
      delegateKeyPublic: f['delegate_key_public'] as number[],
    };
  }

  // Guards against the startup race between the immediate `poll()` call and the
  // first interval tick: both can start before either has advanced the cursor,
  // fetching the same historical events and double-submitting add_delegate_key
  // (the second submission then aborts on-chain, harmlessly, since the key is
  // already registered — but it spams errors).
  const handledAccessIds = new Set<string>();

  async function handleRentStarted(event: { parsedJson: unknown }): Promise<void> {
    const { renter, access_id, expires_at } = event.parsedJson as RentStartedEvent;
    if (handledAccessIds.has(access_id)) return;
    handledAccessIds.add(access_id);

    const expiresAt = Number(expires_at);
    log.log(`\n[RentalKeyManager] RentStarted: ${access_id}`);
    log.log(`  Renter: ${renter}`);
    log.log(`  Expires: ${isPermanentAccess(expiresAt) ? 'never (permanent purchase)' : new Date(expiresAt).toISOString()}`);

    // The renter/buyer generates their OWN delegate keypair client-side and submits
    // only the public half on-chain — it's baked into RentAccess.delegate_key_public
    // at creation (the contract has no setter to change it later), and they already
    // hold the matching private key (shown to them at rent/purchase time). So our
    // only job is to register *that exact* public key with MemWal; minting a
    // different one here would leave the renter holding a key that was never
    // registered — permanently non-functional, with no on-chain path to reconcile.
    const details = await getAccessDetails(access_id);
    if (!details) {
      log.error(`  Could not load RentAccess ${access_id} — skipping`);
      return;
    }

    // RentStarted is a global event — every seller's agent sees every
    // purchase/rental across the whole marketplace, not just their own.
    // Skip anything that isn't for our own MemWal account; this is routine
    // in a multi-seller marketplace, not an error.
    if (details.accountId !== memwalAccountId) return;

    const { namespace, delegateKeyPublic } = details;
    const pubkey = new Uint8Array(delegateKeyPublic);
    log.log(`  Renter's delegate key: 0x${Buffer.from(pubkey).toString('hex').slice(0, 20)}…`);

    try {
      await addDelegateKey(pubkey);
      log.log(`  Registered with MemWal account (namespace: ${namespace})`);
      log.log(`  ${renter.slice(0, 10)}… can query it now via the Playground using the key shown at rent/purchase time.`);

      // NOTE: confirm_rent is intentionally NOT called here — it asserts
      // access.renter == sender, so only the access holder can call it (an on-chain
      // "I received working access" acknowledgment). The Playground's confirm-access
      // action is where that happens, once the renter/buyer has run a query successfully.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // MoveAbort code 4 in the account module = agent is not the account owner.
      if (msg.includes('MoveAbort') && /,\s*4\)/.test(msg)) {
        log.error(`  ✗ add_delegate_key failed (code 4): agent is not the MemWal account owner.`);
        log.error(`    Run: cd apps/demo-agent && npm run create-account`);
      } else {
        log.error(`  Error handling rental:`, e);
      }
    }
  }

  async function handleRentExpired(event: { parsedJson: unknown }): Promise<void> {
    const { access_id } = event.parsedJson as RentExpiredEvent;
    log.log(`\n[RentalKeyManager] RentExpired: ${access_id}`);

    const details = await getAccessDetails(access_id);
    if (!details) return;

    try {
      const pubkey = new Uint8Array(details.delegateKeyPublic);
      await removeDelegateKey(pubkey);
      log.log(`  Removed delegate key from namespace: ${details.namespace}`);
    } catch (e) {
      log.error(`  Error removing delegate key:`, e);
    }
  }

  let rentStartedCursor: EventId | undefined;
  let rentExpiredCursor: EventId | undefined;

  async function poll(): Promise<void> {
    try {
      const startedEvents = await client.queryEvents({
        query: { MoveEventType: `${packageId}::walmarket::RentStarted` },
        cursor: rentStartedCursor ?? null,
        limit: 20,
      });
      for (const e of startedEvents.data) await handleRentStarted(e as { parsedJson: unknown });
      if (startedEvents.data.length > 0) {
        // nextCursor is null on the last page — save the last event's id so the next
        // poll starts from there instead of re-processing all events from genesis.
        rentStartedCursor = startedEvents.nextCursor ?? startedEvents.data[startedEvents.data.length - 1]?.id ?? rentStartedCursor;
      }

      const expiredEvents = await client.queryEvents({
        query: { MoveEventType: `${packageId}::walmarket::RentExpired` },
        cursor: rentExpiredCursor ?? null,
        limit: 20,
      });
      for (const e of expiredEvents.data) await handleRentExpired(e as { parsedJson: unknown });
      if (expiredEvents.data.length > 0) {
        rentExpiredCursor = expiredEvents.nextCursor ?? expiredEvents.data[expiredEvents.data.length - 1]?.id ?? rentExpiredCursor;
      }
    } catch (e) {
      log.error('[RentalKeyManager] Poll error:', e);
    }
  }

  log.log('WalMarket Rental Key Manager');
  log.log(`Network: ${network}`);
  log.log(`Agent: ${sender}`);
  log.log('Listening for RentStarted and RentExpired events…\n');

  setInterval(() => void poll(), pollIntervalMs);
  void poll();
}
