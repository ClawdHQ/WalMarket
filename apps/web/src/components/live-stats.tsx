'use client';
import { useEffect, useState } from 'react';
import { Layers, TrendingUp, ShoppingBag } from 'lucide-react';
import { getWalMarketClient } from '@/lib/sui-client';
import { formatSui } from '@/lib/format';

interface RegistryStats {
  listingCount: number;
  totalVolumeMist: bigint;
}

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 mb-1 text-slate-500">
        {icon}
        <span className="text-xs font-medium uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white font-tabular">{value}</p>
    </div>
  );
}

export function LiveStats() {
  const [stats, setStats] = useState<RegistryStats | null>(null);

  useEffect(() => {
    getWalMarketClient()
      .getRegistryStats()
      .then(setStats)
      .catch(() => null);
  }, []);

  if (!stats) {
    return (
      <div className="flex justify-center gap-12 pt-8">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="skeleton h-3 w-24 mb-1" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-10 pt-8 animate-fade-in">
      <StatItem
        icon={<ShoppingBag size={13} />}
        value={stats.listingCount.toLocaleString()}
        label="Total listings"
      />
      <div className="hidden sm:block w-px bg-white/8 self-stretch" />
      <StatItem
        icon={<TrendingUp size={13} />}
        value={formatSui(stats.totalVolumeMist)}
        label="Volume"
      />
      <div className="hidden sm:block w-px bg-white/8 self-stretch" />
      <StatItem
        icon={<Layers size={13} />}
        value="12+"
        label="Export targets"
      />
    </div>
  );
}
