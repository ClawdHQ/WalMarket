// Lightweight fetch-based client for autonomous AI agents.
// No browser dependencies — works in Node.js, Deno, Bun, and edge runtimes.
import type { RecallResult } from './memwal-connector.js';

export interface AgentClientConfig {
  // Base URL of a WalMarket deployment, e.g. 'https://walmarket.app'
  baseUrl: string;
}

export interface SerializedListing {
  id: string;
  owner: string;
  accountId: string;
  namespace: string;
  title: string;
  description: string;
  category: number;
  categoryLabel: string;
  memoryCount: number;
  oldestMemoryEpoch: number;
  salePriceMist: string | null;
  salePriceSui: string | null;
  rentPricePerHourMist: string | null;
  rentPricePerHourSui: string | null;
  isActive: boolean;
  createdAt: number;
}

export interface PaymentDetails {
  scheme: string;
  version: string;
  network: string;
  rpc: string;
  packageId: string;
  latestPackageId: string;
  registryId: string;
  listingId: string;
  purchase: {
    function: string;
    amountMist: string;
    amountSui: string;
    moveCallTarget: string;
    args: string[];
  } | null;
  rent: {
    function: string;
    pricePerHourMist: string;
    pricePerHourSui: string;
    moveCallTarget: string;
    args: string[];
  } | null;
  query: {
    function: string;
    maxFreeQueries: number;
    moveCallTarget: string;
    args: string[];
    checkAnswerEndpoint: string;
    freeQueriesUsedEndpoint: string;
  };
  instructions: string[];
}

export interface QueryAnswer {
  ok: boolean;
  queryId: string;
  answer: string | null;
  memoriesUsed: number;
  pending: boolean;
}

export interface BrowseFilter {
  category?: number;
  onlyActive?: boolean;
  limit?: number;
  cursor?: number;
}

export interface BrowseResult {
  listings: SerializedListing[];
  total: number;
  cursor: number;
  next: number | null;
  _meta: {
    network: string;
    packageId: string;
    latestPackageId: string;
    registryId: string;
    rpc: string;
  };
}

export interface AccessInfo {
  ok: boolean;
  accessId: string | null;
  listingId: string;
  namespace: string;
  accountId: string;
  owner: string;
  memoryCount: number;
  delegateKeyHex: string;
}

export class Payment402Error extends Error {
  readonly status = 402;
  readonly payment: PaymentDetails;

  constructor(payment: PaymentDetails) {
    super('Payment required — see .payment for move-call details');
    this.name = 'Payment402Error';
    this.payment = payment;
  }
}

// AgentClient — machine-native WalMarket HTTP client.
//
// Typical agent flow (no OAuth, no human in the loop):
//   const client = new AgentClient({ baseUrl: 'https://walmarket.app' });
//   const { listings } = await client.browse({ category: 1 });
//   const { payment } = await client.getListing(listings[0].id);
//   // ... build & sign Sui tx using payment details ...
//   const access = await client.verifyAccess({ listingId, txDigest, delegateKeyHex });
//   const results = await client.recall({ ...access, query: '...', delegateKey: delegateKeyHex });
export class AgentClient {
  constructor(private readonly config: AgentClientConfig) {}

  private url(path: string): string {
    return `${this.config.baseUrl}${path}`;
  }

  // Browse active listings.
  async browse(filter: BrowseFilter = {}): Promise<BrowseResult> {
    const params = new URLSearchParams();
    if (filter.category !== undefined) params.set('category', String(filter.category));
    if (filter.onlyActive !== undefined) params.set('onlyActive', String(filter.onlyActive));
    if (filter.limit !== undefined) params.set('limit', String(filter.limit));
    if (filter.cursor !== undefined) params.set('cursor', String(filter.cursor));

    const res = await fetch(this.url(`/api/agent/listings?${params}`));
    if (!res.ok) throw new Error(`Browse failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<BrowseResult>;
  }

  // Get a single listing with full payment instruction object. Pass your own
  // address to also get freeQueriesUsed — how many of your 1 free test message(s)
  // you've already spent on this listing.
  async getListing(
    listingId: string,
    address?: string,
  ): Promise<{ listing: SerializedListing; freeQueriesUsed: number | null; payment: PaymentDetails }> {
    const qs = address ? `?address=${encodeURIComponent(address)}` : '';
    const res = await fetch(this.url(`/api/agent/listings/${listingId}${qs}`));
    if (!res.ok) throw new Error(`Listing fetch failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ listing: SerializedListing; freeQueriesUsed: number | null; payment: PaymentDetails }>;
  }

  // Try-before-you-buy: submit your own signed Sui tx calling payment.query.moveCallTarget
  // first (this client doesn't hold your keys), then poll this with the queryId from the
  // QueryRequested event until `answer` is non-null.
  async getQueryAnswer(queryId: string): Promise<QueryAnswer> {
    const res = await fetch(this.url(`/api/agent/query/${queryId}`));
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? `Query answer fetch failed: ${res.status}`);
    }
    return res.json() as Promise<QueryAnswer>;
  }

  // Verify on-chain purchase or rental, get access metadata (namespace + accountId).
  // Throws Payment402Error if txDigest is missing, containing full payment instructions.
  async verifyAccess(params: {
    listingId: string;
    txDigest?: string;
    delegateKeyHex?: string;
  }): Promise<AccessInfo> {
    const res = await fetch(this.url('/api/agent/access'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.status === 402) {
      const body = await res.json() as { payment: PaymentDetails };
      throw new Payment402Error(body.payment);
    }
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? `Access verification failed: ${res.status}`);
    }
    return res.json() as Promise<AccessInfo>;
  }

  // Query a purchased or rented namespace.
  async recall(params: {
    namespace: string;
    accountId: string;
    delegateKey: string;
    query: string;
    limit?: number;
  }): Promise<RecallResult[]> {
    const res = await fetch(this.url('/api/agent/recall'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? `Recall failed: ${res.status}`);
    }
    const { results } = await res.json() as { results: RecallResult[] };
    return results;
  }
}
