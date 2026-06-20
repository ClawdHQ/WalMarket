import 'dotenv/config';
import { startQueryResponder } from '@walmarket/sdk/agents';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

startQueryResponder({
  network: (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet',
  packageId: env('NEXT_PUBLIC_WALMARKET_PACKAGE_ID'),
  latestPackageId: process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID,
  registryId: env('NEXT_PUBLIC_WALMARKET_REGISTRY_ID'),
  memwalRelayerUrl: env('MEMWAL_RELAYER_URL'),
  // This must be the same keypair set as `operator` on each of your listings
  // via set_operator (run from the Sell page after creating a listing) — see
  // README.md for the full per-seller onboarding flow.
  agentPrivateKey: env('MEMWAL_PRIVATE_KEY'),
});
