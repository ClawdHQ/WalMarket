// Server-only. Persists WalMarket-managed sellers' MemWal account keys, encrypted
// at rest. WalMarket fully owns these MemWal accounts (it created them — MemWal's
// account.owner is permanent and non-transferable, so this is the only way to get
// owner-level access on a seller's behalf, which is what lets the same agent both
// answer test queries AND register buyers' delegate keys after purchase).
//
// All Node-only imports (better-sqlite3, node:crypto, node:fs, node:path) are
// deferred behind webpackIgnore'd dynamic imports rather than static top-level
// imports. This file is reachable from instrumentation.ts, which Next bundles for
// the Edge runtime by default regardless of whether that code path ever actually
// runs there (the runtime guard in instrumentation.ts's register() already
// prevents execution under Edge) — without this, the Edge bundling pass fails
// outright trying to resolve these.
import type BetterSqlite3 from 'better-sqlite3';

let _db: BetterSqlite3.Database | null = null;

async function getDb(): Promise<BetterSqlite3.Database> {
  if (_db) return _db;
  const { default: Database } = await import(/* webpackIgnore: true */ 'better-sqlite3');
  const { mkdirSync } = await import(/* webpackIgnore: true */ 'fs');
  const { dirname, join } = await import(/* webpackIgnore: true */ 'path');
  const dbPath = join(process.cwd(), '.data', 'managed-agents.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS managed_accounts (
      account_id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      operator_address TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      listing_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  return _db;
}

async function getEncryptionKey(): Promise<Buffer> {
  const hex = process.env.MANAGED_AGENT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'MANAGED_AGENT_ENCRYPTION_KEY must be set to a 32-byte hex string (64 chars). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(hex, 'hex');
}

// AES-256-GCM: random 12-byte IV per encryption, auth tag appended — stored as
// `iv:authTag:ciphertext` (all hex) in one column.
async function encrypt(plaintext: string): Promise<string> {
  const { createCipheriv, randomBytes } = await import(/* webpackIgnore: true */ 'crypto');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

async function decrypt(stored: string): Promise<string> {
  const { createDecipheriv } = await import(/* webpackIgnore: true */ 'crypto');
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  const decipher = createDecipheriv('aes-256-gcm', await getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

export interface ManagedAccount {
  accountId: string;
  namespace: string;
  operatorAddress: string;
  privateKeyHex: string;
  listingId: string | null;
  createdAt: number;
}

export async function saveManagedAccount(account: Omit<ManagedAccount, 'createdAt'>): Promise<void> {
  const db = await getDb();
  db
    .prepare(
      `INSERT INTO managed_accounts (account_id, namespace, operator_address, encrypted_key, listing_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(account.accountId, account.namespace, account.operatorAddress, await encrypt(account.privateKeyHex), account.listingId, Date.now());
}

export async function attachListingId(accountId: string, listingId: string): Promise<void> {
  const db = await getDb();
  db.prepare(`UPDATE managed_accounts SET listing_id = ? WHERE account_id = ?`).run(listingId, accountId);
}

interface Row {
  account_id: string;
  namespace: string;
  operator_address: string;
  encrypted_key: string;
  listing_id: string | null;
  created_at: number;
}

async function rowToAccount(row: Row): Promise<ManagedAccount> {
  return {
    accountId: row.account_id,
    namespace: row.namespace,
    operatorAddress: row.operator_address,
    privateKeyHex: await decrypt(row.encrypted_key),
    listingId: row.listing_id,
    createdAt: row.created_at,
  };
}

export async function getAllManagedAccounts(): Promise<ManagedAccount[]> {
  const db = await getDb();
  const rows = db.prepare(`SELECT * FROM managed_accounts`).all() as Row[];
  return Promise.all(rows.map(rowToAccount));
}

export async function getManagedAccount(accountId: string): Promise<ManagedAccount | null> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM managed_accounts WHERE account_id = ?`).get(accountId) as Row | undefined;
  return row ? rowToAccount(row) : null;
}
