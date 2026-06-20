import type { SuiClient, EventId } from '@mysten/sui/client';
import type { MemoryListing, ListingFilter } from './types.js';

type Callback = (listing: MemoryListing) => void;

function parseListing(id: string, fields: Record<string, unknown>): MemoryListing {
  return {
    id,
    owner: fields['owner'] as string,
    operator: (fields['operator'] as string) ?? (fields['owner'] as string),
    accountId: (fields['account_id'] as string) ?? '',
    namespace: (fields['namespace'] as string) ?? '',
    title: fields['title'] as string,
    description: (fields['description'] as string) ?? '',
    category: Number(fields['category'] ?? 0),
    memoryCount: Number(fields['memory_count'] ?? 0),
    oldestMemoryEpoch: Number(fields['oldest_memory_epoch'] ?? 0),
    salePriceMist: fields['sale_price_mist'] != null ? BigInt(fields['sale_price_mist'] as string) : null,
    rentPricePerHourMist: fields['rent_price_per_hour_mist'] != null ? BigInt(fields['rent_price_per_hour_mist'] as string) : null,
    pricePerQueryMist: fields['price_per_query_mist'] != null ? BigInt(fields['price_per_query_mist'] as string) : null,
    isActive: (fields['is_active'] as boolean) ?? true,
    createdAt: Number(fields['created_at'] ?? 0),
    ratingSum: Number(fields['total_rating_sum'] ?? 0),
    reviewCount: Number(fields['review_count'] ?? 0),
  };
}

export class EventIndexer {
  private readonly client: SuiClient;
  private readonly packageId: string;
  private readonly store = new Map<string, MemoryListing>();
  private readonly callbacks: Callback[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(client: SuiClient, packageId: string) {
    this.client = client;
    this.packageId = packageId;
  }

  async start(pollMs = 5000): Promise<void> {
    await this.fetchAll();
    this.pollInterval = setInterval(() => void this.fetchAll(), pollMs);
  }

  stop(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  subscribe(callback: Callback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  getAll(filter?: ListingFilter): MemoryListing[] {
    let results = Array.from(this.store.values());
    if (filter?.category !== undefined) results = results.filter(l => l.category === filter.category);
    if (filter?.onlyActive) results = results.filter(l => l.isActive);
    if (filter?.owner) results = results.filter(l => l.owner === filter.owner);
    return results;
  }

  getById(id: string): MemoryListing | undefined {
    return this.store.get(id);
  }

  getByCategory(category: number): MemoryListing[] {
    return this.getAll({ category, onlyActive: true });
  }

  private async fetchAll(): Promise<void> {
    try {
      let cursor: EventId | null | undefined = undefined;
      const types = [
        `${this.packageId}::walmarket::ListingCreated`,
        `${this.packageId}::walmarket::ListingUpdated`,
        `${this.packageId}::walmarket::ListingDelisted`,
        `${this.packageId}::walmarket::ListingSold`,
      ];

      for (const eventType of types) {
        cursor = undefined;
        do {
          const page = await this.client.queryEvents({
            query: { MoveEventType: eventType },
            cursor: cursor ?? null,
            limit: 50,
          });

          for (const evt of page.data) {
            const fields = evt.parsedJson as Record<string, unknown>;
            const listingId = fields['listing_id'] as string;
            if (!listingId) continue;

            if (eventType.endsWith('ListingCreated')) {
              if (this.store.has(listingId)) continue;
              // The event itself only carries {listing_id, owner, title, category} —
              // far fewer fields than MemoryListing needs — so fetch the live object,
              // which has the full field set (namespace, prices, memory count, etc).
              const obj = await this.client.getObject({ id: listingId, options: { showContent: true } });
              if (obj.data?.content?.dataType !== 'moveObject') continue;
              const objFields = (obj.data.content as { fields: Record<string, unknown> }).fields;
              const listing = parseListing(listingId, objFields);
              this.store.set(listingId, listing);
              this.callbacks.forEach(cb => cb(listing));
            } else if (eventType.endsWith('ListingDelisted')) {
              const existing = this.store.get(listingId);
              if (existing) this.store.set(listingId, { ...existing, isActive: false });
            } else if (eventType.endsWith('ListingSold')) {
              const buyer = fields['buyer'] as string;
              const existing = this.store.get(listingId);
              if (existing) this.store.set(listingId, { ...existing, owner: buyer, isActive: false });
            }
          }

          cursor = page.nextCursor;
          if (!page.hasNextPage) break;
        } while (cursor !== undefined);
      }
    } catch (err) {
      console.error('[EventIndexer] fetch error:', err);
    }
  }
}
