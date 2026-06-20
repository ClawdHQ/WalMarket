// Server-only. Provisions a brand-new, WalMarket-owned MemWal account for sellers
// who don't want to run anything themselves: generates a dedicated keypair (MemWal
// only allows one account per address, so every managed seller needs its own),
// creates the account, self-registers that same key as its own delegate (required
// before it can call the relayer — see apps/demo-agent/src/create-memwal-account.ts
// for the same fix applied to the self-hosted path), ingests the seller's pasted
// memory content, and persists the encrypted key so the runtime can pick it up.
//
// Node-only packages (@mysten-incubation/memwal/*, @walmarket/sdk/agents) are
// deferred behind webpackIgnore'd dynamic imports rather than static top-level
// imports — see the comment in managed-store.ts for why (this file is reachable
// from instrumentation.ts, which Next bundles for Edge by default).
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { saveManagedAccount, attachListingId, getAllManagedAccounts, type ManagedAccount } from './managed-store';

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet';
const MEMWAL_PACKAGE_ID = process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID ?? '';
const MEMWAL_REGISTRY_ID = process.env.NEXT_PUBLIC_MEMWAL_REGISTRY_ID ?? '';
const MEMWAL_RELAYER_URL = process.env.MEMWAL_RELAYER_URL ?? '';
const WALMARKET_PACKAGE_ID = process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID ?? '';
const WALMARKET_LATEST_PACKAGE_ID = process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID || WALMARKET_PACKAGE_ID;
const WALMARKET_REGISTRY_ID = process.env.NEXT_PUBLIC_WALMARKET_REGISTRY_ID ?? '';
// Falls back to the demo agent's own funded key so this works out of the box on
// testnet — a real deployment should set its own treasury key with a balance it
// actively monitors/tops up.
const TREASURY_PRIVATE_KEY = process.env.WALMARKET_TREASURY_PRIVATE_KEY || process.env.MEMWAL_PRIVATE_KEY || '';
// Gas to seed each freshly generated managed-seller keypair with — enough for
// create_account + add_delegate_key now, plus future submit_query_response /
// add_delegate_key(for buyers) calls for a good while.
const FUNDING_AMOUNT_MIST = 200_000_000; // 0.2 SUI

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fundNewAccount(recipientAddress: string): Promise<void> {
  if (!TREASURY_PRIVATE_KEY) {
    throw new Error('No treasury key configured (set WALMARKET_TREASURY_PRIVATE_KEY or MEMWAL_PRIVATE_KEY)');
  }
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const treasury = Ed25519Keypair.fromSecretKey(Buffer.from(TREASURY_PRIVATE_KEY.replace(/^0x/, ''), 'hex'));
  const sender = treasury.getPublicKey().toSuiAddress();

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [FUNDING_AMOUNT_MIST]);
  tx.transferObjects([coin], recipientAddress);
  tx.setSenderIfNotSet(sender);
  const bytes = await tx.build({ client });
  const { signature } = await treasury.signTransaction(bytes);
  await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true },
    requestType: 'WaitForLocalExecution',
  });
}

interface MemWalConnectorLike {
  remember(text: string): Promise<string>;
}

async function rememberWithBackoff(connector: MemWalConnectorLike, text: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await connector.remember(text);
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retryMatch = message.match(/"retry_after_seconds"\s*:\s*(\d+)/);
      if (!retryMatch || attempt > 5) throw e;
      await sleep(Number(retryMatch[1]) * 1000 + 2000);
    }
  }
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'namespace';
}

export interface ProvisionResult {
  accountId: string;
  namespace: string;
  operatorAddress: string;
  memoryCount: number;
}

export async function provisionManagedAccount(memories: string[], namespaceHint: string): Promise<ProvisionResult> {
  if (memories.length === 0) throw new Error('At least one memory is required');

  const { createAccount, addDelegateKey } = await import(/* webpackIgnore: true */ '@mysten-incubation/memwal/account');
  const { MemWalConnector } = await import(/* webpackIgnore: true */ '@walmarket/sdk');

  const keypair = Ed25519Keypair.generate();
  const operatorAddress = keypair.getPublicKey().toSuiAddress();
  const namespace = `${slugify(namespaceHint)}-${operatorAddress.slice(2, 8)}`;
  // getSecretKey() returns the bech32 "suiprivkey1..." form, which is what the
  // MemWal account SDK's `suiPrivateKey` option wants — but MemWalConnector and
  // the agent services expect raw hex.
  const privateKeyHex = Buffer.from(decodeSuiPrivateKey(keypair.getSecretKey()).secretKey).toString('hex');

  // A brand-new keypair has zero gas — fund it before it can sign anything.
  await fundNewAccount(operatorAddress);

  const { accountId } = await createAccount({
    packageId: MEMWAL_PACKAGE_ID,
    registryId: MEMWAL_REGISTRY_ID,
    suiPrivateKey: keypair.getSecretKey(),
    suiNetwork: NETWORK,
  });

  // Self-delegate: the relayer authenticates against account.delegate_keys, not
  // account.owner directly, so even the owner's own key needs this before it can
  // call /api/ask, /api/recall, etc.
  await addDelegateKey({
    packageId: MEMWAL_PACKAGE_ID,
    accountId,
    suiPrivateKey: keypair.getSecretKey(),
    suiNetwork: NETWORK,
    publicKey: keypair.getPublicKey().toRawBytes(),
    label: 'WalMarket-managed',
  });

  const connector = new MemWalConnector({
    accountId,
    namespace,
    relayerUrl: MEMWAL_RELAYER_URL,
    privateKey: privateKeyHex,
  }) as MemWalConnectorLike;

  for (let i = 0; i < memories.length; i++) {
    await rememberWithBackoff(connector, memories[i]);
    if (i < memories.length - 1) await sleep(2500); // stay under the relayer's per-key rate limit
  }

  await saveManagedAccount({
    accountId,
    namespace,
    operatorAddress,
    privateKeyHex,
    listingId: null,
  });

  await startAgentForManagedAccount({
    accountId,
    namespace,
    operatorAddress,
    privateKeyHex,
    listingId: null,
    createdAt: Date.now(),
  });

  return { accountId, namespace, operatorAddress, memoryCount: memories.length };
}

export async function recordListingId(accountId: string, listingId: string): Promise<void> {
  await attachListingId(accountId, listingId);
}

const startedAccountIds = new Set<string>();

async function startAgentForManagedAccount(account: ManagedAccount): Promise<void> {
  if (startedAccountIds.has(account.accountId)) return;
  startedAccountIds.add(account.accountId);

  const { startQueryResponder, startRentalKeyManager } = await import(/* webpackIgnore: true */ '@walmarket/sdk/agents');

  const logger = {
    log: (...a: unknown[]) => console.log(`[Managed:${account.accountId.slice(0, 10)}]`, ...a),
    error: console.error,
    warn: console.warn,
  };

  startQueryResponder({
    network: NETWORK,
    packageId: WALMARKET_PACKAGE_ID,
    latestPackageId: WALMARKET_LATEST_PACKAGE_ID,
    registryId: WALMARKET_REGISTRY_ID,
    memwalRelayerUrl: MEMWAL_RELAYER_URL,
    agentPrivateKey: account.privateKeyHex,
    logger,
  });

  startRentalKeyManager({
    network: NETWORK,
    packageId: WALMARKET_PACKAGE_ID,
    memwalPackageId: MEMWAL_PACKAGE_ID,
    memwalAccountId: account.accountId,
    memwalPrivateKey: account.privateKeyHex,
    logger,
  });
}

// Called once at server boot — resumes the agent loop for every previously
// provisioned managed seller, so a server restart doesn't strand anyone.
export async function startManagedAgentRuntime(): Promise<void> {
  for (const account of await getAllManagedAccounts()) {
    await startAgentForManagedAccount(account);
  }
}
