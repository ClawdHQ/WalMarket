import 'dotenv/config';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalMarketClient } from '@walmarket/sdk';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet';
const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

async function startQueryResponder() {
  await import('./query-responder.js');
}

async function startRentalKeyManager() {
  await import('./rental-key-manager.js');
}

console.log('WalMarket Seller Agent — Starting all services');
console.log(`Network: ${NETWORK}`);
console.log('Services: query-responder, rental-key-manager\n');

Promise.allSettled([
  startQueryResponder(),
  startRentalKeyManager(),
]).then(results => {
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Service ${i} failed:`, r.reason);
    }
  });
});
