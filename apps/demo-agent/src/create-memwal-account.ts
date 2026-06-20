/**
 * One-shot script: creates a new MemWalAccount owned by the agent key.
 *
 * Run once, then:
 *   1. Copy the printed Account ID into MEMWAL_ACCOUNT_ID in both .env files.
 *   2. Re-seed memories:  npm run seed
 *   3. Re-create the WalMarket listing via the /sell page (it reads MEMWAL_ACCOUNT_ID).
 *
 * Why: add_delegate_key requires ctx.sender() == account.owner in the MemWal contract.
 * The account created on memory.walrus.xyz is owned by your personal wallet, not the agent.
 * Creating a fresh account here makes the agent the owner so the rental-key-manager can
 * register and revoke renter delegate keys automatically.
 */
import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createAccount, addDelegateKey } from '@mysten-incubation/memwal/account';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet';
const MEMWAL_PACKAGE_ID = env('NEXT_PUBLIC_MEMWAL_PACKAGE_ID');
const MEMWAL_REGISTRY_ID = env('NEXT_PUBLIC_MEMWAL_REGISTRY_ID');
// Build keypair then pass the Bech32-encoded secret key that the SDK's decodeSuiPrivateKey expects.
const keypair = Ed25519Keypair.fromSecretKey(
  Buffer.from(env('MEMWAL_PRIVATE_KEY').replace(/^0x/, ''), 'hex'),
);

async function main() {
  console.log(`Creating MemWal account on ${NETWORK}…`);
  console.log(`  Signer: ${keypair.getPublicKey().toSuiAddress()}`);
  const result = await createAccount({
    packageId: MEMWAL_PACKAGE_ID,
    registryId: MEMWAL_REGISTRY_ID,
    suiPrivateKey: keypair.getSecretKey(),
    suiNetwork: NETWORK,
  });

  console.log('\n✓ MemWal account created');
  console.log(`  Account ID : ${result.accountId}`);
  console.log(`  Tx digest  : ${result.digest}`);

  // The account owner's raw key is NOT automatically usable with MemWal.create() —
  // the relayer authenticates signed requests against account.delegate_keys, not
  // account.owner directly (the SDK's own account.js example shows generating a
  // *separate* delegate key for this reason). Self-registering this key as its own
  // delegate is what makes MEMWAL_PRIVATE_KEY usable directly for seeding/asking,
  // without needing to juggle a second keypair.
  console.log('\nRegistering this key as its own delegate (required before it can call the relayer)…');
  const delegate = await addDelegateKey({
    packageId: MEMWAL_PACKAGE_ID,
    accountId: result.accountId,
    suiPrivateKey: keypair.getSecretKey(),
    suiNetwork: NETWORK,
    publicKey: keypair.getPublicKey().toRawBytes(),
    label: 'self (owner key)',
  });
  console.log(`  ✓ Self-delegate registered (tx ${delegate.digest.slice(0, 12)}…)`);

  console.log('\nNext steps:');
  console.log(`  1. Set MEMWAL_ACCOUNT_ID=${result.accountId} in apps/demo-agent/.env and the root .env`);
  console.log('  2. Re-seed memories:   cd apps/demo-agent && npm run seed');
  console.log('  3. Create your WalMarket listing via the /sell page (signed by your normal wallet)');
  console.log(`  4. From that listing's manage page, authorize this agent to answer queries:`);
  console.log(`     "Connect your seller agent" → paste in ${keypair.getPublicKey().toSuiAddress()}`);
  console.log('     (calls set_operator — see apps/demo-agent/README.md for why this is a separate step)');
}

main().catch(console.error);
