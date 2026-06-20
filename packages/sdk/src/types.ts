export const CATEGORIES = ['Research', 'Trading', 'Legal', 'Code', 'General'] as const;
export type Category = typeof CATEGORIES[number];

export interface MemoryListing {
  id: string;
  owner: string;
  operator: string;
  accountId: string;
  namespace: string;
  title: string;
  description: string;
  category: number;
  memoryCount: number;
  oldestMemoryEpoch: number;
  salePriceMist: bigint | null;
  rentPricePerHourMist: bigint | null;
  // Streaming/pay-per-query price — null means the seller hasn't opted in.
  pricePerQueryMist: bigint | null;
  isActive: boolean;
  createdAt: number;
  // On-chain reputation: sum/count rather than a precomputed average — compute
  // reviewCount > 0 ? ratingSum / reviewCount : null yourself.
  ratingSum: number;
  reviewCount: number;
}

export interface Review {
  id: string;
  listingId: string;
  reviewer: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface RentAccess {
  id: string;
  listingId: string;
  renter: string;
  delegateKeyPublic: Uint8Array;
  expiresAt: number;
  namespace: string;
  accountId: string;
}

// Outright purchases mint a RentAccess whose expires_at is the on-chain sentinel
// u64::MAX (~1.8e19), so they share the rental access/Seal pathway instead of a
// parallel one (see purchase_listing_with_access). JS numbers can't represent
// u64::MAX exactly — Number(fields['expires_at']) rounds it — but the rounded
// value still lands many orders of magnitude past Number.MAX_SAFE_INTEGER, while
// the longest possible timed rental (720h ≈ 2.6e9 ms from now) lands many orders
// of magnitude below it. The threshold separates the two cases exactly in practice.
export function isPermanentAccess(expiresAt: number): boolean {
  return expiresAt > Number.MAX_SAFE_INTEGER;
}

export interface ListingFilter {
  category?: number;
  onlyActive?: boolean;
  owner?: string;
  minPrice?: bigint;
  maxPrice?: bigint;
}

export interface CreateListingParams {
  accountId: string;
  namespace: string;
  title: string;
  description: string;
  category: number;
  memoryCount: number;
  oldestMemoryEpoch: number;
  salePriceMist?: bigint;
  rentPricePerHourMist?: bigint;
  pricePerQueryMist?: bigint;
}

export interface RentParams {
  listingId: string;
  durationHours: number;
  delegateKeyPublic: Uint8Array;
}

export interface TransactionResult {
  digest: string;
  effects: unknown;
  events: SuiEvent[];
}

export interface SuiEvent {
  type: string;
  parsedJson: Record<string, unknown>;
}

export interface QueryResult {
  message: string;
  answer: string;
  memoriesUsed: number;
}

export interface MemWalConfig {
  privateKey: string;
  accountId: string;
  relayerUrl: string;
  packageId: string;
  registryId: string;
}
