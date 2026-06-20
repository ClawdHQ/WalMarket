import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { EventIndexer } from './event-indexer.js';
import type { MemoryListing, RentAccess, Review, CreateListingParams, RentParams, ListingFilter } from './types.js';

const SUI_CLOCK_ID = '0x6';

export interface WalMarketConfig {
  // Original/defining package ID — stable across upgrades. Required for event-type
  // and struct-type queries (Sui ties type identity to the package a type was first
  // defined in, not the package version that produced a given instance).
  packageId: string;
  // Current published-at package ID. Only the latest version's bytecode contains
  // functions added after the original publish (e.g. purchase_listing_with_access,
  // seal_approve), so moveCalls targeting those must use this ID. Defaults to
  // `packageId` — fine for packages that haven't been upgraded yet.
  latestPackageId?: string;
  registryId: string;
  network?: string;
}

export type Signer = {
  getAddress(): Promise<string> | string;
  signAndExecuteTransaction(opts: {
    transaction: Transaction;
    options?: Record<string, boolean>;
  }): Promise<{ digest: string; effects?: unknown; events?: unknown[] }>;
  // The two members below back SealAccess.decryptDelegateKey's Seal SessionKey flow
  // (proving address ownership to key servers via a signed PersonalMessage) — a
  // distinct signing intent from transaction execution above. Sui keypair-backed
  // signers implement both natively; useZkLogin's signer implements them by wrapping
  // an ephemeral-keypair signature in a zkLogin proof, mirroring signAndExecuteTransaction.
  toSuiAddress(): string;
  signPersonalMessage(message: Uint8Array): Promise<{ signature: string }>;
};

export class WalMarketClient {
  private readonly client: SuiClient;
  private readonly config: WalMarketConfig;
  readonly indexer: EventIndexer;
  private walletAddress: string | null = null;

  constructor(client: SuiClient, config: WalMarketConfig) {
    this.client = client;
    this.config = config;
    this.indexer = new EventIndexer(client, config.packageId);
  }

  setWalletAddress(addr: string): void {
    this.walletAddress = addr;
  }

  // Package ID to target for moveCalls that may not exist in the original publish.
  private get latestPackageId(): string {
    return this.config.latestPackageId ?? this.config.packageId;
  }

  // ─── Listings ──────────────────────────────────────────────────────────────

  async getAllListings(filter?: ListingFilter): Promise<MemoryListing[]> {
    return this.indexer.getAll(filter);
  }

  async getListingById(listingId: string): Promise<MemoryListing | null> {
    const cached = this.indexer.getById(listingId);
    if (cached) return cached;
    // Fallback: fetch object directly
    try {
      const obj = await this.client.getObject({
        id: listingId,
        options: { showContent: true },
      });
      if (obj.data?.content?.dataType !== 'moveObject') return null;
      const fields = obj.data.content.fields as Record<string, unknown>;
      return this.parseListingObject(listingId, fields);
    } catch {
      return null;
    }
  }

  async getMyListings(): Promise<MemoryListing[]> {
    if (!this.walletAddress) return [];
    return this.indexer.getAll({ owner: this.walletAddress });
  }

  async getMyRentals(): Promise<RentAccess[]> {
    if (!this.walletAddress) return [];
    const objects = await this.client.getOwnedObjects({
      owner: this.walletAddress,
      filter: { StructType: `${this.config.packageId}::walmarket::RentAccess` },
      options: { showContent: true },
    });
    return objects.data
      .filter(o => o.data?.content?.dataType === 'moveObject')
      .map(o => {
        const f = (o.data!.content as { fields: Record<string, unknown> }).fields;
        return {
          id: o.data!.objectId,
          listingId: f['listing_id'] as string,
          renter: f['renter'] as string,
          delegateKeyPublic: Uint8Array.from(f['delegate_key_public'] as number[]),
          expiresAt: Number(f['expires_at']),
          namespace: f['namespace'] as string,
          accountId: f['account_id'] as string,
        };
      });
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  async createListing(signer: Signer, params: CreateListingParams): Promise<{ digest: string; listingId: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);

    const salePriceArg = params.salePriceMist !== undefined
      ? tx.pure.option('u64', params.salePriceMist)
      : tx.pure.option('u64', null);
    const rentPriceArg = params.rentPricePerHourMist !== undefined
      ? tx.pure.option('u64', params.rentPricePerHourMist)
      : tx.pure.option('u64', null);
    const queryPriceArg = params.pricePerQueryMist !== undefined
      ? tx.pure.option('u64', params.pricePerQueryMist)
      : tx.pure.option('u64', null);

    tx.moveCall({
      target: `${this.config.packageId}::walmarket::create_listing`,
      arguments: [
        tx.object(this.config.registryId),
        tx.pure.string(params.accountId),
        tx.pure.string(params.namespace),
        tx.pure.string(params.title),
        tx.pure.string(params.description),
        tx.pure.u8(params.category),
        tx.pure.u64(params.memoryCount),
        tx.pure.u64(params.oldestMemoryEpoch),
        salePriceArg,
        rentPriceArg,
        queryPriceArg,
        clock,
      ],
    });

    const result = await signer.signAndExecuteTransaction({
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });

    const events = (result.events ?? []) as Array<{ type: string; parsedJson: Record<string, unknown> }>;
    const created = events.find(e => e.type.endsWith('::ListingCreated'));
    const listingId = (created?.parsedJson?.['listing_id'] as string) ?? '';

    return { digest: result.digest, listingId };
  }

  async purchaseListing(
    signer: Signer,
    listingId: string,
    priceMist: bigint,
  ): Promise<{ digest: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);

    tx.moveCall({
      target: `${this.config.packageId}::walmarket::purchase_listing`,
      arguments: [
        tx.object(this.config.registryId),
        tx.object(listingId),
        coin,
        clock,
      ],
    });

    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    return { digest: result.digest };
  }

  // Outright purchase that also grants the buyer a permanent RentAccess (expires_at
  // = u64::MAX), so bought namespaces flow through the same delegate-key-grant +
  // Seal-decrypt pathway as rentals — one access mechanism for both, see
  // purchase_listing_with_access in the Move contract. Requires the post-upgrade
  // bytecode, hence `latestPackageId`.
  async purchaseListingWithAccess(
    signer: Signer,
    listingId: string,
    priceMist: bigint,
    delegateKeyPublic: Uint8Array,
  ): Promise<{ digest: string; accessId: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);

    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::purchase_listing_with_access`,
      arguments: [
        tx.object(this.config.registryId),
        tx.object(listingId),
        coin,
        tx.pure.vector('u8', Array.from(delegateKeyPublic)),
        clock,
      ],
    });

    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    const events = (result.events ?? []) as Array<{ type: string; parsedJson: Record<string, unknown> }>;
    const rentEvt = events.find(e => e.type.endsWith('::RentStarted'));
    const accessId = (rentEvt?.parsedJson?.['access_id'] as string) ?? '';

    return { digest: result.digest, accessId };
  }

  async rentListing(
    signer: Signer,
    params: RentParams & { totalPriceMist: bigint },
  ): Promise<{ digest: string; accessId: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(params.totalPriceMist)]);

    tx.moveCall({
      target: `${this.config.packageId}::walmarket::rent_listing`,
      arguments: [
        tx.object(this.config.registryId),
        tx.object(params.listingId),
        coin,
        tx.pure.u64(params.durationHours),
        tx.pure.vector('u8', Array.from(params.delegateKeyPublic)),
        clock,
      ],
    });

    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    const events = (result.events ?? []) as Array<{ type: string; parsedJson: Record<string, unknown> }>;
    const rentEvt = events.find(e => e.type.endsWith('::RentStarted'));
    const accessId = (rentEvt?.parsedJson?.['access_id'] as string) ?? '';

    return { digest: result.digest, accessId };
  }

  // Called by the access HOLDER (renter or buyer) once they've verified their
  // delegate key actually works — an on-chain "I received working access"
  // acknowledgment. confirm_rent asserts access.renter == sender, so this can
  // only ever be called by whoever the access was minted for.
  async confirmRent(signer: Signer, accessId: string): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.config.packageId}::walmarket::confirm_rent`,
      arguments: [tx.object(accessId)],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    return { digest: result.digest };
  }

  async requestQuery(
    signer: Signer,
    listingId: string,
    message: string,
  ): Promise<{ digest: string; queryId: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);

    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::request_query`,
      arguments: [
        tx.object(listingId),
        tx.pure.string(message),
        clock,
      ],
    });

    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    const events = (result.events ?? []) as Array<{ type: string; parsedJson: Record<string, unknown> }>;
    const queryEvt = events.find(e => e.type.endsWith('::QueryRequested'));
    const queryId = (queryEvt?.parsedJson?.['query_id'] as string) ?? '';

    return { digest: result.digest, queryId };
  }

  // Streaming/pay-per-query: unlike requestQuery, never capped — pays
  // listing.price_per_query_mist per message and reuses the exact same
  // QueryRequest/QueryRequested pathway, so the seller's existing
  // query-responder agent answers these with zero changes on its end.
  async payPerQuery(
    signer: Signer,
    listingId: string,
    message: string,
    priceMist: bigint,
  ): Promise<{ digest: string; queryId: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);

    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::pay_per_query`,
      arguments: [
        tx.object(this.config.registryId),
        tx.object(listingId),
        coin,
        tx.pure.string(message),
        clock,
      ],
    });

    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    const events = (result.events ?? []) as Array<{ type: string; parsedJson: Record<string, unknown> }>;
    const queryEvt = events.find(e => e.type.endsWith('::QueryRequested'));
    const queryId = (queryEvt?.parsedJson?.['query_id'] as string) ?? '';

    return { digest: result.digest, queryId };
  }

  // Called by the listing's operator (the seller's own agent keypair, not
  // necessarily their zkLogin owner wallet — see set_operator) after running
  // the actual MemWal /api/ask call.
  async submitQueryResponse(
    signer: Signer,
    listingId: string,
    queryId: string,
    answer: string,
    memoriesUsed: number,
  ): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::submit_query_response`,
      arguments: [
        tx.object(listingId),
        tx.object(queryId),
        tx.pure.string(answer),
        tx.pure.u64(memoriesUsed),
      ],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true, showEvents: true } });
    return { digest: result.digest };
  }

  // Authorizes `operator` (typically the seller's dedicated agent keypair) to
  // call submitQueryResponse on this listing's behalf. Only the listing owner
  // (the seller's zkLogin wallet) can call this.
  async setOperator(signer: Signer, listingId: string, operator: string): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::set_operator`,
      arguments: [tx.object(listingId), tx.pure.address(operator)],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true } });
    return { digest: result.digest };
  }

  // On-chain reputation: only succeeds if `accessId` is a RentAccess the caller
  // actually holds for this exact listing (submit_review's ENotAccessHolder
  // guard) — proof of a real purchase/rental, not an anonymous claim.
  async submitReview(
    signer: Signer,
    listingId: string,
    accessId: string,
    rating: number,
    comment: string,
  ): Promise<{ digest: string }> {
    const tx = new Transaction();
    const clock = tx.object(SUI_CLOCK_ID);
    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::submit_review`,
      arguments: [
        tx.object(listingId),
        tx.object(accessId),
        tx.pure.u8(rating),
        tx.pure.string(comment),
        clock,
      ],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx, options: { showEffects: true } });
    return { digest: result.digest };
  }

  // Reviews are shared objects (like QueryRequest) — there's no per-listing
  // index on-chain, so this filters the global ReviewSubmitted event stream by
  // listing_id, then fetches each matching Review object directly (the event
  // itself only carries listing_id/reviewer/rating/review_id, not the comment
  // text). Fine at hackathon scale — a high-traffic "recent reviews" feed would
  // want EventIndexer-style caching instead of refetching on every call.
  async getReviewsForListing(listingId: string, limit = 50): Promise<Review[]> {
    const events = await this.client.queryEvents({
      query: { MoveEventType: `${this.config.packageId}::walmarket::ReviewSubmitted` },
      limit: 1000,
      order: 'descending',
    });
    const reviewIds = events.data
      .filter(e => (e.parsedJson as Record<string, unknown>)['listing_id'] === listingId)
      .slice(0, limit)
      .map(e => (e.parsedJson as Record<string, unknown>)['review_id'] as string);

    if (reviewIds.length === 0) return [];

    const objects = await this.client.multiGetObjects({ ids: reviewIds, options: { showContent: true } });
    return objects
      .filter(o => o.data?.content?.dataType === 'moveObject')
      .map(o => {
        const f = (o.data!.content as { fields: Record<string, unknown> }).fields;
        return {
          id: o.data!.objectId,
          listingId: f['listing_id'] as string,
          reviewer: f['reviewer'] as string,
          rating: Number(f['rating'] ?? 0),
          comment: f['comment'] as string,
          createdAt: Number(f['created_at'] ?? 0),
        };
      });
  }

  // Direct object read — the frontend polls this instead of any off-chain
  // relay. `answer` is null until the seller's agent calls submitQueryResponse.
  async getQueryResponse(queryId: string): Promise<{ answer: string | null; memoriesUsed: number }> {
    const obj = await this.client.getObject({ id: queryId, options: { showContent: true } });
    if (obj.data?.content?.dataType !== 'moveObject') return { answer: null, memoriesUsed: 0 };
    const fields = obj.data.content.fields as Record<string, unknown>;
    const answerField = fields['answer'] as { fields?: { vec?: string[] }; vec?: string[] } | string | null;
    // Sui JSON-RPC represents a populated Option<String> as { fields: { vec: [<value>] } }
    // (or sometimes the unwrapped `{ vec: [...] }` shape depending on SDK version) and an
    // empty one as null — unlike Option<u64>, which unwraps to a bare value (see the
    // sale_price_mist comment in parseListingObject below).
    let answer: string | null = null;
    if (answerField && typeof answerField === 'object') {
      const vec = ('fields' in answerField ? answerField.fields?.vec : answerField.vec) ?? [];
      answer = vec[0] ?? null;
    } else if (typeof answerField === 'string') {
      answer = answerField;
    }
    return { answer, memoriesUsed: Number(fields['memories_used'] ?? 0) };
  }

  async getFreeQueriesUsed(listingId: string, address: string): Promise<number> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.latestPackageId}::walmarket::listing_free_queries_used`,
      arguments: [tx.object(listingId), tx.pure.address(address)],
    });
    const result = await this.client.devInspectTransactionBlock({
      sender: address,
      transactionBlock: tx,
    });
    const returnVal = result.results?.[0]?.returnValues?.[0];
    if (!returnVal) return 0;
    const [bytes] = returnVal;
    // u64 BCS-encoded as little-endian bytes.
    let value = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      value = (value << 8n) | BigInt(bytes[i]);
    }
    return Number(value);
  }

  async expireRent(signer: Signer, accessId: string): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.config.packageId}::walmarket::expire_rent`,
      arguments: [tx.object(accessId), tx.object(SUI_CLOCK_ID)],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx });
    return { digest: result.digest };
  }

  async updatePricing(
    signer: Signer,
    listingId: string,
    salePriceMist: bigint | null,
    rentPricePerHourMist: bigint | null,
    pricePerQueryMist: bigint | null = null,
  ): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.config.packageId}::walmarket::update_pricing`,
      arguments: [
        tx.object(listingId),
        tx.pure.option('u64', salePriceMist),
        tx.pure.option('u64', rentPricePerHourMist),
        tx.pure.option('u64', pricePerQueryMist),
      ],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx });
    return { digest: result.digest };
  }

  async delist(signer: Signer, listingId: string): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.config.packageId}::walmarket::delist`,
      arguments: [tx.object(listingId)],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx });
    return { digest: result.digest };
  }

  // ─── Registry stats ────────────────────────────────────────────────────────

  async getRegistryStats(): Promise<{ listingCount: number; totalVolumeMist: bigint }> {
    const obj = await this.client.getObject({
      id: this.config.registryId,
      options: { showContent: true },
    });
    if (obj.data?.content?.dataType !== 'moveObject') {
      return { listingCount: 0, totalVolumeMist: 0n };
    }
    const fields = obj.data.content.fields as Record<string, unknown>;
    return {
      listingCount: Number(fields['listing_count'] ?? 0),
      totalVolumeMist: BigInt((fields['total_volume_mist'] as string | number | bigint) ?? 0),
    };
  }

  private parseListingObject(id: string, fields: Record<string, unknown>): MemoryListing {
    // Sui's JSON-RPC unwraps a populated Move Option<u64> to the bare value (a string,
    // since u64 exceeds JS number precision) and an empty one to null — NOT the raw
    // `{ fields: { vec: [...] } }` BCS-struct shape.
    return {
      id,
      owner: fields['owner'] as string,
      operator: (fields['operator'] as string) ?? (fields['owner'] as string),
      accountId: fields['account_id'] as string,
      namespace: fields['namespace'] as string,
      title: fields['title'] as string,
      description: fields['description'] as string,
      category: Number(fields['category'] ?? 0),
      memoryCount: Number(fields['memory_count'] ?? 0),
      oldestMemoryEpoch: Number(fields['oldest_memory_epoch'] ?? 0),
      salePriceMist: fields['sale_price_mist'] != null ? BigInt(fields['sale_price_mist'] as string) : null,
      rentPricePerHourMist: fields['rent_price_per_hour_mist'] != null ? BigInt(fields['rent_price_per_hour_mist'] as string) : null,
      pricePerQueryMist: fields['price_per_query_mist'] != null ? BigInt(fields['price_per_query_mist'] as string) : null,
      isActive: fields['is_active'] as boolean,
      createdAt: Number(fields['created_at'] ?? 0),
      ratingSum: Number(fields['total_rating_sum'] ?? 0),
      reviewCount: Number(fields['review_count'] ?? 0),
    };
  }
}
