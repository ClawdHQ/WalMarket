export const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
export const SUI_RPC_URL = `https://fullnode.${SUI_NETWORK}.sui.io`;

export const WALMARKET_PACKAGE_ID = process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID ?? '';
// Current published-at package ID (changes on each `sui client upgrade`, unlike the
// original/defining ID above). Needed for moveCall targets added after the original
// publish (e.g. purchase_listing_with_access) and for Seal's packageId, since
// seal_approve only exists in the upgraded bytecode. Falls back to the original ID
// so the app still runs (minus the new functions) if this var is ever unset.
export const WALMARKET_LATEST_PACKAGE_ID = process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID || WALMARKET_PACKAGE_ID;
export const WALMARKET_REGISTRY_ID = process.env.NEXT_PUBLIC_WALMARKET_REGISTRY_ID ?? '';

export const MEMWAL_PACKAGE_ID = process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID ?? '0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6';
export const MEMWAL_REGISTRY_ID = process.env.NEXT_PUBLIC_MEMWAL_REGISTRY_ID ?? '0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437';
export const MEMWAL_RELAYER_URL = process.env.NEXT_PUBLIC_MEMWAL_RELAYER_URL ?? 'https://relayer-staging.memory.walrus.xyz';

export const WALRUS_AGGREGATOR = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ?? 'https://aggregator.walrus-testnet.walrus.space';
export const WALRUS_PUBLISHER = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER ?? 'https://publisher.walrus-testnet.walrus.space';

export const SEAL_KEY_SERVERS = [
  process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_0 ?? 'https://seal-key-server-0.testnet.mystenlab.com',
  process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_1 ?? 'https://seal-key-server-1.testnet.mystenlab.com',
];

export const FAUCET_URL = 'https://faucet.testnet.sui.io/';
export const SUISCAN_BASE = `https://suiscan.xyz/${SUI_NETWORK}`;

export const CATEGORIES = ['Research', 'Trading', 'Legal', 'Code', 'General'];
export const CATEGORY_COLORS = [
  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'bg-green-500/20 text-green-300 border-green-500/30',
  'bg-gray-500/20 text-gray-300 border-gray-500/30',
];

export const QUERY_TIMEOUT_MS = 60_000;
export const MAX_FREE_QUERIES = 1;
