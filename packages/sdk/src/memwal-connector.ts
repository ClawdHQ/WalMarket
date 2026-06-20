import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

export interface MemWalConnectorConfig {
  accountId: string;
  namespace: string;
  relayerUrl: string;
  privateKey: string;
}

export interface RecallResult {
  score: number;
  content: string;
  id: string;
}

export interface AnalyzedFact {
  id: string;
  text: string;
}

// Real shape of @mysten-incubation/memwal's MemWal client (factory `MemWal.create`,
// private constructor — there is no exported `MemWalClient`). Declared narrowly to
// just the methods this connector calls; `key` accepts a `0x`-prefixed or bare hex
// string directly (MemWal strips the prefix internally).
interface MemWalInstance {
  rememberAndWait(text: string, namespace?: string): Promise<{ blob_id: string }>;
  recall(params: { query: string; limit?: number; namespace?: string }): Promise<{
    results: { blob_id: string; text: string; distance: number }[];
  }>;
  analyze(text: string, namespace?: string): Promise<{ facts: { id: string; text: string }[] }>;
  // `signedRequest` is the SDK's own internal HTTP method — every public call
  // (recall, analyze, remember, restore) routes through it, including the
  // Seal `x-seal-session` build relayer-mode routes need to decrypt. It's
  // marked `private` in the package's .d.ts, but that's TypeScript-only and
  // erased at runtime (the compiled JS has it as a normal prototype method).
  // The relayer exposes POST /api/ask (recall + LLM-generated answer) per
  // docs.wal.app/walrus-memory/relayer/api-reference, but this SDK version
  // (0.0.7, confirmed latest on npm) hasn't added a public `ask()` wrapper
  // for it yet. Calling signedRequest directly reuses the exact proven
  // signing + Seal-session path instead of reimplementing it.
  signedRequest(
    method: 'POST',
    path: '/api/ask',
    body: { question: string; limit?: number; namespace?: string },
  ): Promise<{ answer: string; memories_used: number; memories: { blob_id: string; text: string; distance: number }[] }>;
}

interface MemWalModule {
  MemWal: { create(config: { key: string; accountId: string; serverUrl?: string; namespace?: string }): MemWalInstance };
}

// Thin wrapper over @mysten-incubation/memwal's MemWal.create() factory.
// We dynamic-import to avoid bundling issues when memwal isn't installed.
async function getMemWal(): Promise<MemWalModule> {
  return (await import('@mysten-incubation/memwal')) as unknown as MemWalModule;
}

function distanceToScore(distance: number): number {
  // MemWal returns a vector distance (lower = more similar); the connector's
  // RecallResult.score is "higher = better match" in [0, 1] for downstream
  // percentage display. Clamp in case the metric's range ever puts distance
  // above 1.
  return Math.max(0, 1 - distance);
}

export class MemWalConnector {
  private readonly config: MemWalConnectorConfig;
  private client: MemWalInstance | null = null;

  constructor(config: MemWalConnectorConfig) {
    this.config = config;
  }

  private async getClient(): Promise<MemWalInstance> {
    if (this.client) return this.client;
    const memwal = await getMemWal();
    this.client = memwal.MemWal.create({
      key: this.config.privateKey,
      accountId: this.config.accountId,
      serverUrl: this.config.relayerUrl,
      namespace: this.config.namespace,
    });
    return this.client;
  }

  // Stores a memory and waits for the background job (embed → encrypt → upload →
  // index) to finish, returning the Walrus blob ID it was stored under.
  async remember(content: string): Promise<string> {
    const client = await this.getClient();
    const result = await client.rememberAndWait(content);
    return result.blob_id;
  }

  async recall(query: string, topK = 5): Promise<RecallResult[]> {
    const client = await this.getClient();
    const { results } = await client.recall({ query, limit: topK });
    return results.map(r => ({ score: distanceToScore(r.distance), content: r.text, id: r.blob_id }));
  }

  // Extracts discrete facts from free-form conversation text and stores each one,
  // returning the facts that were found.
  async analyze(text: string): Promise<AnalyzedFact[]> {
    const client = await this.getClient();
    const { facts } = await client.analyze(text);
    return facts.map(f => ({ id: f.id, text: f.text }));
  }

  // Try-before-you-buy query: recall + LLM-generated answer (MemWal's
  // /api/ask), scoped to a specific listing's account/namespace — used by the
  // seller's own query-responder agent, signed with the seller's delegate
  // key, never exposed to the buyer directly.
  async ask(
    question: string,
    namespace: string,
    accountId: string,
    limit = 5,
  ): Promise<{ answer: string; memoriesUsed: number }> {
    const memwal = await getMemWal();
    const askClient = memwal.MemWal.create({
      key: this.config.privateKey,
      accountId,
      serverUrl: this.config.relayerUrl,
      namespace,
    });
    const result = await askClient.signedRequest('POST', '/api/ask', { question, limit, namespace });
    return { answer: result.answer, memoriesUsed: result.memories_used };
  }

  static generateDelegateKey(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    const keypair = Ed25519Keypair.generate();
    return {
      publicKey: keypair.getPublicKey().toRawBytes(),
      privateKey: decodeSuiPrivateKey(keypair.getSecretKey()).secretKey,
    };
  }
}
