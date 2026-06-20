'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Brain } from 'lucide-react';
import { clsx } from 'clsx';
import { getWalMarketClient } from '@/lib/sui-client';
import { CATEGORIES, CATEGORY_COLORS } from '@/lib/constants';
import { formatSui, formatEpochAge, formatAddress } from '@/lib/format';
import type { MemoryListing } from '@walmarket/sdk';

function FeaturedCard({ listing }: { listing: MemoryListing }) {
  const cat = CATEGORIES[listing.category] ?? 'General';
  const catColor = CATEGORY_COLORS[listing.category] ?? CATEGORY_COLORS[4];

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="card-hover flex flex-col p-5 gap-4 group relative overflow-hidden"
    >
      {/* Gradient top bar */}
      <div
        className={clsx(
          'absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          'bg-gradient-to-r from-brand-400 to-accent-500',
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
            <Brain size={16} className="text-brand-400" />
          </div>
          <div>
            <span className={clsx('badge text-[10px]', catColor)}>{cat}</span>
          </div>
        </div>
        <span className="text-xs text-slate-500 font-tabular">
          {listing.memoryCount.toLocaleString()} mem
        </span>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-white font-semibold text-sm leading-snug group-hover:text-brand-300 transition-colors line-clamp-2">
          {listing.title}
        </h3>
        <p className="text-slate-500 text-xs mt-1 line-clamp-2 leading-relaxed">
          {listing.description}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-white/5">
        <div>
          {listing.salePriceMist !== null && (
            <p className="text-brand-300 font-bold">{formatSui(listing.salePriceMist)}</p>
          )}
          <p className="text-slate-600 text-[10px] mt-0.5">{formatEpochAge(listing.oldestMemoryEpoch)}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-brand-400 transition-colors">
          View <ArrowRight size={12} />
        </div>
      </div>

      <p className="text-[10px] text-slate-700 font-mono truncate">{formatAddress(listing.owner, 5)}</p>
    </Link>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="skeleton w-9 h-9 rounded-xl" />
        <div className="skeleton h-4 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-3 w-3/4" />
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-white/5">
        <div className="skeleton h-5 w-16" />
        <div className="skeleton h-4 w-12" />
      </div>
    </div>
  );
}

export function FeaturedListings() {
  const [listings, setListings] = useState<MemoryListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getWalMarketClient();
    client.indexer.start()
      .then(() => {
        const all = client.indexer.getAll({ onlyActive: true });
        setListings(all.slice(0, 3));
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <FeaturedSkeleton key={i} />)}
      </div>
    );
  }

  if (listings.length === 0) return null;

  return (
    <div className="section animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Live on Testnet</h2>
          <p className="text-slate-500 text-sm mt-1">Real listings deployed on Sui testnet</p>
        </div>
        <Link href="/marketplace" className="btn-ghost flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300">
          View all <ArrowRight size={14} />
        </Link>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {listings.map(l => <FeaturedCard key={l.id} listing={l} />)}
      </div>
    </div>
  );
}
