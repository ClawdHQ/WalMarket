import type { SuiClient } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export interface ExecuteOptions {
  client: SuiClient;
  tx: Transaction;
  signer: { signTransaction: (tx: { bytes: string }) => Promise<{ bytes: string; signature: string }> };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function executeTx(opts: ExecuteOptions, attempt = 1): Promise<{ digest: string; events: unknown[] }> {
  try {
    const bytes = await opts.tx.build({ client: opts.client });
    const { bytes: signedBytes, signature } = await opts.signer.signTransaction({ bytes: Buffer.from(bytes).toString('base64') });

    const result = await opts.client.executeTransactionBlock({
      transactionBlock: signedBytes,
      signature,
      options: { showEffects: true, showEvents: true },
      requestType: 'WaitForLocalExecution',
    });

    return {
      digest: result.digest,
      events: result.events ?? [],
    };
  } catch (err) {
    if (attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return executeTx(opts, attempt + 1);
    }
    throw err;
  }
}

export function suiscanUrl(digest: string, network = 'testnet'): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

export function mist(sui: number): bigint {
  return BigInt(Math.round(sui * 1_000_000_000));
}

export function suiFromMist(mist: bigint): string {
  return (Number(mist) / 1_000_000_000).toFixed(4);
}
