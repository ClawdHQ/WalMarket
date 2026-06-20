import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { WalMarketClient } from '@walmarket/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet';
const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
const keypair = Ed25519Keypair.fromSecretKey(
  Buffer.from(env('MEMWAL_PRIVATE_KEY').replace('0x', ''), 'hex')
);
const sender = keypair.getPublicKey().toSuiAddress();

const walmarket = new WalMarketClient(client, {
  packageId: env('NEXT_PUBLIC_WALMARKET_PACKAGE_ID'),
  registryId: env('NEXT_PUBLIC_WALMARKET_REGISTRY_ID'),
  network: NETWORK,
});

const signer = {
  getAddress: () => sender,
  signAndExecuteTransaction: async (opts: { transaction: Transaction; options?: Record<string, boolean> }) => {
    opts.transaction.setSenderIfNotSet(sender);
    const bytes = await opts.transaction.build({ client });
    const { signature } = await keypair.signTransaction(bytes);
    return client.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: { showEffects: true, showEvents: true },
      requestType: 'WaitForLocalExecution',
    });
  },
};

interface SeedMeta {
  namespace: string;
  title: string;
  description: string;
  category: number;
  salePriceSui: number;
  rentPricePerHourSui: number;
  file: string;
}

const SEEDS: SeedMeta[] = [
  {
    namespace: 'sui-defi-research',
    title: '6mo Sui DeFi Research Agent',
    description: 'Deep knowledge of Sui DeFi ecosystem: protocols, TVL trends, tokenomics, and trading patterns accumulated over 6 months of active research.',
    category: 1, // Trading
    salePriceSui: 5,
    rentPricePerHourSui: 0.05,
    file: 'sui-defi-research.json',
  },
  {
    namespace: 'move-dev-knowledge',
    title: 'Move Smart Contract Knowledge Base',
    description: 'Comprehensive Move development knowledge: object model, abilities, PTBs, testing patterns, security best practices, and Sui-specific idioms.',
    category: 3, // Code
    salePriceSui: 3,
    rentPricePerHourSui: 0.03,
    file: 'move-dev-knowledge.json',
  },
  {
    namespace: 'web3-market-intel',
    title: 'Web3 Market Intelligence Archive',
    description: 'Market intelligence across crypto categories: price trends, protocol metrics, funding rounds, and emerging narratives tracked from 2024-2026.',
    category: 0, // Research
    salePriceSui: 4,
    rentPricePerHourSui: 0.04,
    file: 'web3-market-intel.json',
  },
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// The relayer enforces a per-delegate-key rate limit ("30 weighted-requests/min"),
// shared across all namespaces since they're all seeded with the same MEMWAL_PRIVATE_KEY.
// On a 429 it tells us exactly how long to back off via `retry_after_seconds` — honor that.
async function rememberWithBackoff(mc: { remember(text: string): Promise<unknown> }, text: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await mc.remember(text);
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retryMatch = message.match(/"retry_after_seconds"\s*:\s*(\d+)/);
      if (!retryMatch || attempt > 5) throw e;
      const waitMs = Number(retryMatch[1]) * 1000 + 2000; // small buffer past the server's window
      console.log(`    Rate limited — waiting ${Math.round(waitMs / 1000)}s before retry (attempt ${attempt}/5)`);
      await sleep(waitMs);
    }
  }
}

async function seedMemories(namespace: string, memories: string[]): Promise<void> {
  const relayerUrl = env('MEMWAL_RELAYER_URL');
  const accountId = env('MEMWAL_ACCOUNT_ID');

  // Dynamic import to avoid requiring memwal at build time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memwal = await import('@mysten-incubation/memwal') as any;
  const mc = memwal.MemWal.create({
    key: Buffer.from(env('MEMWAL_PRIVATE_KEY').replace('0x', ''), 'hex'),
    accountId,
    serverUrl: relayerUrl,
    namespace,
  });

  console.log(`Seeding ${memories.length} memories into namespace: ${namespace}`);
  for (let i = 0; i < memories.length; i++) {
    await rememberWithBackoff(mc, memories[i]);
    // Pace at ~24 weighted-requests/min (under the shared 30/min delegate-key limit)
    // so we rarely need the backoff path at all across all 120 memories in this run.
    if (i < memories.length - 1) await sleep(2500);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${memories.length}`);
  }
  console.log(`  Done.`);
}

async function createListing(meta: SeedMeta): Promise<void> {
  const memories: string[] = JSON.parse(
    readFileSync(join(__dirname, '../seeds', meta.file), 'utf8')
  );

  const accountId = env('MEMWAL_ACCOUNT_ID');
  const oldestEpoch = Date.now() - 18 * 30 * 24 * 60 * 60 * 1000; // 18 months ago

  // All 120 memories were already stored successfully in an earlier run that failed
  // only at the on-chain createListing step (missing tx sender, now fixed below) —
  // skip re-storing them to avoid duplicates and burning relayer rate-limit budget again.
  if (process.env.SKIP_MEMORY_SEED !== 'true') {
    await seedMemories(meta.namespace, memories);
  } else {
    console.log(`Skipping memory seeding for ${meta.namespace} (SKIP_MEMORY_SEED=true) — already stored`);
  }

  const { digest, listingId } = await walmarket.createListing(signer as never, {
    accountId,
    namespace: meta.namespace,
    title: meta.title,
    description: meta.description,
    category: meta.category,
    memoryCount: memories.length,
    oldestMemoryEpoch: oldestEpoch,
    salePriceMist: BigInt(meta.salePriceSui * 1_000_000_000),
    rentPricePerHourMist: BigInt(Math.round(meta.rentPricePerHourSui * 1_000_000_000)),
  });

  console.log(`Created listing: ${meta.title}`);
  console.log(`  Listing ID: ${listingId}`);
  console.log(`  Tx: ${digest}`);
  console.log(`  Suiscan: https://suiscan.xyz/${NETWORK}/tx/${digest}\n`);
}

async function main() {
  console.log('WalMarket Demo Seeder');
  console.log(`Network: ${NETWORK}`);
  console.log(`Sender: ${sender}\n`);

  for (const seed of SEEDS) {
    try {
      await createListing(seed);
    } catch (e) {
      console.error(`Failed to seed ${seed.namespace}:`, e);
    }
  }

  console.log('Seeding complete!');
}

main().catch(console.error);
