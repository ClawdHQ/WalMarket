'use client';
import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal, Loader2, RefreshCw, ShoppingBag } from 'lucide-react';
import { clsx } from 'clsx';
import { ListingCard } from '@/components/listing-card';
import { useListingsStore } from '@/store/listings';
import { getWalMarketClient } from '@/lib/sui-client';
import { CATEGORIES } from '@/lib/constants';
import { formatSui } from '@/lib/format';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'memories', label: 'Most memories' },
  { value: 'oldest-data', label: 'Oldest data' },
] as const;

function ListingCardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-4 w-16" />
      </div>
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-3 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
      <div className="flex justify-between items-center pt-2 border-t border-white/5">
        <div className="skeleton h-5 w-16" />
        <div className="skeleton h-4 w-14" />
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const {
    loading, error,
    selectedCategory, sortBy, searchQuery,
    setCategory, setSortBy, setSearchQuery,
    setListings, setLoading, setError, upsertListing,
    getFiltered,
  } = useListingsStore();

  const [totalVolume, setTotalVolume] = useState<bigint | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    const client = getWalMarketClient();
    setLoading(true);

    // Fetch registry stats in parallel
    client.getRegistryStats().then(s => {
      setTotalCount(s.listingCount);
      setTotalVolume(s.totalVolumeMist);
    }).catch(() => null);

    client.indexer.start().then(() => {
      setListings(client.indexer.getAll());
      setLoading(false);
    }).catch(e => {
      setError(e instanceof Error ? e.message : 'Failed to load listings');
      setLoading(false);
    });

    const unsub = client.indexer.subscribe(listing => upsertListing(listing));
    return () => {
      unsub();
      client.indexer.stop();
    };
  }, []);

  const listings = getFiltered();

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page header ───────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-white">Memory Marketplace</h1>
        <p className="text-slate-500 text-sm">Discover and acquire AI agent memory namespaces on Sui</p>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────── */}
      {(totalCount !== null || totalVolume !== null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total listings', value: totalCount?.toString() ?? '—' },
            { label: 'Active now', value: listings.filter(l => l.isActive).length.toString() },
            { label: 'Total volume', value: totalVolume !== null ? formatSui(totalVolume) : '—' },
            { label: 'Export targets', value: '12+' },
          ].map(s => (
            <div key={s.label} className="card px-4 py-3 space-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">{s.label}</p>
              <p className="text-white font-bold text-lg font-tabular">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search + sort row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 pr-3 h-9 text-sm"
              placeholder="Search listings…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs ml-auto">
            <SlidersHorizontal size={13} className="text-slate-500" />
            <span className="text-slate-500 font-medium">Sort:</span>
            {SORT_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setSortBy(o.value)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs transition-all',
                  sortBy === o.value
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory(null)}
            className={clsx(
              'badge transition-all',
              selectedCategory === null
                ? 'badge-brand'
                : 'badge-gray hover:badge-brand',
            )}
          >
            All categories
          </button>
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat}
              onClick={() => setCategory(i)}
              className={clsx(
                'badge transition-all',
                selectedCategory === i ? 'badge-brand' : 'badge-gray hover:badge-brand',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Result count */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {loading ? 'Loading…' : `${listings.length} listing${listings.length !== 1 ? 's' : ''} found`}
          </span>
          {loading && <RefreshCw size={12} className="animate-spin text-brand-500" />}
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      )}

      {error && (
        <div className="card border-red-500/20 bg-red-500/5 p-5 flex items-start gap-3">
          <div className="w-1 self-stretch rounded bg-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-400 text-sm font-medium">Failed to load listings</p>
            <p className="text-red-400/70 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="card p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto">
            <ShoppingBag size={24} className="text-brand-400" />
          </div>
          <div>
            <p className="text-white font-semibold">No listings found</p>
            <p className="text-slate-500 text-sm mt-1">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : selectedCategory !== null
                  ? 'No listings in this category'
                  : 'Be the first to list a memory namespace'}
            </p>
          </div>
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map(l => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}

    </div>
  );
}
