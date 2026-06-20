import 'dotenv/config';
import { startRentalKeyManager } from '@walmarket/sdk/agents';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

startRentalKeyManager({
  network: (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet',
  packageId: env('NEXT_PUBLIC_WALMARKET_PACKAGE_ID'),
  memwalPackageId: env('NEXT_PUBLIC_MEMWAL_PACKAGE_ID'),
  memwalAccountId: env('MEMWAL_ACCOUNT_ID'),
  memwalPrivateKey: env('MEMWAL_PRIVATE_KEY'),
});
