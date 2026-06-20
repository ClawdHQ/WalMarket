'use client';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Brain, ArrowRight, Clock } from 'lucide-react';
import { CATEGORIES, CATEGORY_COLORS } from '@/lib/constants';
import { formatSui, formatEpochAge, formatAddress } from '@/lib/format';
import type { MemoryListing } from '@walmarket/sdk';

export function ListingCard({ listing }: { listing: MemoryListing }) {
  const cat = CATEGORIES[listing.category] ?? 'General';
  const catColor = CATEGORY_COLORS[listing.category] ?? CATEGORY_COLORS[4];

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="card-hover flex flex-col p-5 gap-3 group relative overflow-hidden"
    >
      {/* Gradient top accent on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 bg-gradient-to-r from-brand-400 via-brand-500 to-accent-500" />

      {/* Category + memory count row */}
      <div className="flex items-center justify-between gap-2">
        <span className={clsx('badge', catColor)}>{cat}</span>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Brain size={11} />
          <span className="font-tabular">{listing.memoryCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-white font-semibold text-sm leading-snug group-hover:text-brand-300 transition-colors line-clamp-2 min-h-[2.5rem]">
        {listing.title}
      </h3>

      {/* Description */}
      {listing.description && (
        <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">
          {listing.description}
        </p>
      )}

      {/* Provenance */}
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <Clock size={10} />
        <span>Data from {formatEpochAge(listing.oldestMemoryEpoch)}</span>
      </div>

      {/* Price & CTA */}
      <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between gap-2">
        <div>
          {listing.salePriceMist !== null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-brand-300 font-bold text-base">{formatSui(listing.salePriceMist)}</span>
              <span className="text-slate-600 text-[10px]">buy</span>
            </div>
          ) : (
            <span className="text-slate-600 text-xs">No sale price</span>
          )}
          {!listing.isActive && (
            <span className="badge-red text-[10px] mt-0.5">Sold</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-slate-600 group-hover:text-brand-400 transition-colors font-medium">
          Ask <ArrowRight size={12} />
        </div>
      </div>

      {/* Seller */}
      <p className="text-[10px] text-slate-700 font-mono truncate">
        {formatAddress(listing.owner, 5)}
      </p>
    </Link>
  );
}
