'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
  LayoutDashboard, ListPlus, ShoppingBag, TrendingUp, ExternalLink,
  Package, ChevronRight, Loader2, Download,
} from 'lucide-react';
import { useZkLogin } from '@/hooks/use-zk-login';
import { getWalMarketClient } from '@/lib/sui-client';
import { CopyableAddress } from '@/components/copyable-address';
import { ExportPanel } from '@/components/export-panel';
import { formatSui, suiscanTx } from '@/lib/format';
import { SUISCAN_BASE } from '@/lib/constants';
import type { MemoryListing, RentAccess } from '@walmarket/sdk';

const DELEGATE_KEY_PREFIX = 'walmarket:delegateKey:';

function loadDelegateKey(accessId: string): string {
  try { return localStorage.getItem(`${DELEGATE_KEY_PREFIX}${accessId}`) ?? ''; } catch { return ''; }
}

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={clsx('card p-5 space-y-3', accent && 'border-brand-500/25')}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div>
        <p className={clsx('text-2xl font-bold font-tabular', accent ? 'text-brand-300' : 'text-white')}>{value}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ListingRow({ listing, onDelist, delistLoading, txDigest }: {
  listing: MemoryListing;
  onDelist: (id: string) => void;
  delistLoading: boolean;
  txDigest?: string;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/3 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
        <Package size={13} className="text-brand-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-medium truncate">{listing.title}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-slate-600 text-xs font-mono">{listing.id.slice(0, 14)}…</span>
          {listing.salePriceMist && (
            <span className="text-slate-500 text-xs">{formatSui(listing.salePriceMist)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={clsx('badge', listing.isActive ? 'badge-brand' : 'badge-gray')}>
          {listing.isActive ? 'Active' : 'Sold'}
        </span>
        <Link href={`/listing/${listing.id}`} className="btn-ghost text-xs p-1.5 text-slate-500">
          <ChevronRight size={14} />
        </Link>
        {listing.isActive && (
          <button
            onClick={() => onDelist(listing.id)}
            disabled={delistLoading}
            className="btn-danger text-xs px-2.5 py-1"
          >
            {delistLoading ? <Loader2 size={12} className="animate-spin" /> : 'Delist'}
          </button>
        )}
        {txDigest && (
          <a href={suiscanTx(txDigest)} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-slate-400">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { address, signer } = useZkLogin();
  const [tab, setTab] = useState<'listings' | 'purchases'>('listings');
  const [myListings, setMyListings] = useState<MemoryListing[]>([]);
  const [myPurchases, setMyPurchases] = useState<RentAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [delistLoading, setDelistLoading] = useState<string | null>(null);
  const [txDigests, setTxDigests] = useState<Record<string, string>>({});
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    const client = getWalMarketClient();
    client.setWalletAddress(address);
    Promise.all([client.getMyListings(), client.getMyRentals()])
      .then(([listings, purchases]) => { setMyListings(listings); setMyPurchases(purchases); })
      .finally(() => setLoading(false));
  }, [address]);

  async function handleDelist(listingId: string) {
    if (!signer) return;
    setDelistLoading(listingId);
    try {
      const { digest } = await getWalMarketClient().delist(signer, listingId);
      setTxDigests(p => ({ ...p, [listingId]: digest }));
      setMyListings(p => p.map(l => l.id === listingId ? { ...l, isActive: false } : l));
    } finally {
      setDelistLoading(null);
    }
  }

  const totalEarnings = myListings
    .filter(l => !l.isActive && l.salePriceMist !== null)
    .reduce((s, l) => s + (l.salePriceMist ?? 0n), 0n);

  const activeListings = myListings.filter(l => l.isActive).length;

  if (!address) {
    return (
      <div className="card p-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto">
          <LayoutDashboard size={24} className="text-brand-400" />
        </div>
        <div>
          <p className="text-white font-semibold">Sign in to view your dashboard</p>
          <p className="text-slate-500 text-sm mt-1">Track your listings, purchases, and earnings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-slate-500 text-sm">Wallet:</span>
            <CopyableAddress address={address} className="text-slate-400 text-sm hover:text-white transition-colors font-mono" />
          </div>
        </div>
        <Link href="/sell" className="btn-primary text-sm">
          <ListPlus size={15} />
          New listing
        </Link>
      </div>

      {/* ── Stats ─────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total listings"
            value={myListings.length.toString()}
            icon={<Package size={13} className="text-brand-400" />}
          />
          <StatCard
            label="Active now"
            value={activeListings.toString()}
            sub="accepting offers"
            icon={<ShoppingBag size={13} className="text-brand-400" />}
            accent={activeListings > 0}
          />
          <StatCard
            label="Earnings"
            value={formatSui(totalEarnings)}
            sub="from sold listings"
            icon={<TrendingUp size={13} className="text-brand-400" />}
            accent={totalEarnings > 0n}
          />
          <StatCard
            label="Purchases"
            value={myPurchases.length.toString()}
            sub="namespaces owned"
            icon={<Download size={13} className="text-brand-400" />}
          />
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-white/8 pb-0">
        {([
          { key: 'listings', label: `My Listings (${myListings.length})` },
          { key: 'purchases', label: `Purchases (${myPurchases.length})` },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all',
              tab === t.key
                ? 'border-brand-500 text-brand-300'
                : 'border-transparent text-slate-500 hover:text-slate-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading your data…</span>
        </div>
      )}

      {/* ── Listings tab ──────────────────────────────────────── */}
      {!loading && tab === 'listings' && (
        <div className="space-y-2">
          {myListings.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <Package size={28} className="text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">No listings yet.</p>
              <Link href="/sell" className="btn-primary text-sm inline-flex">
                <ListPlus size={14} /> Create your first listing
              </Link>
            </div>
          ) : (
            <div className="card divide-y divide-white/5 overflow-hidden">
              {myListings.map(l => (
                <ListingRow
                  key={l.id}
                  listing={l}
                  onDelist={handleDelist}
                  delistLoading={delistLoading === l.id}
                  txDigest={txDigests[l.id]}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Purchases tab ─────────────────────────────────────── */}
      {!loading && tab === 'purchases' && (
        <div className="space-y-4">
          {myPurchases.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <ShoppingBag size={28} className="text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">No purchased namespaces yet.</p>
              <Link href="/marketplace" className="btn-primary text-sm inline-flex">
                <ShoppingBag size={14} /> Browse marketplace
              </Link>
            </div>
          ) : (
            myPurchases.map(p => {
              const delegateKey = loadDelegateKey(p.id);
              const isExporting = exportingId === p.id;
              return (
                <div key={p.id} className="card overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-semibold font-mono truncate">{p.namespace}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="badge-brand">Permanent</span>
                        <a
                          href={`${SUISCAN_BASE}/object/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                        >
                          On-chain <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => setExportingId(isExporting ? null : p.id)}
                      className={clsx(
                        'btn text-xs px-4 py-2 rounded-lg border',
                        isExporting
                          ? 'btn-primary'
                          : 'btn-secondary',
                      )}
                    >
                      <Download size={13} />
                      {isExporting ? 'Hide export' : 'Export'}
                    </button>
                  </div>

                  {isExporting && (
                    <div className="border-t border-white/6">
                      {delegateKey ? (
                        <ExportPanel context={{
                          namespace: p.namespace,
                          accountId: p.accountId,
                          privateKey: delegateKey,
                          listingTitle: p.namespace,
                          memoryCount: 0,
                        }} />
                      ) : (
                        <div className="p-5">
                          <p className="text-slate-400 text-sm mb-3">
                            Enter your delegate private key to generate export snippets:
                          </p>
                          <DelegateKeyInput accessId={p.id} namespace={p.namespace} accountId={p.accountId} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function DelegateKeyInput({ accessId, namespace, accountId }: { accessId: string; namespace: string; accountId: string }) {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  if (saved) {
    return <ExportPanel context={{ namespace, accountId, privateKey: key.trim(), listingTitle: namespace, memoryCount: 0 }} />;
  }

  return (
    <div className="flex gap-2">
      <input
        className="input font-mono text-xs"
        placeholder="Delegate private key (64 hex chars)"
        value={key}
        onChange={e => setKey(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && key.trim()) setSaved(true); }}
      />
      <button
        onClick={() => { if (key.trim()) { try { localStorage.setItem(`walmarket:delegateKey:${accessId}`, key.trim()); } catch {} setSaved(true); } }}
        disabled={!key.trim()}
        className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
      >
        Load
      </button>
    </div>
  );
}
