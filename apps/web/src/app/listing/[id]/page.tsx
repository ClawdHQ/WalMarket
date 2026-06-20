'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
  ChevronRight, Brain, Calendar, Hash, User, ExternalLink,
  ShoppingCart, Loader2, AlertCircle, CheckCircle2, Copy, Check, ArrowLeft,
} from 'lucide-react';
import { useZkLogin } from '@/hooks/use-zk-login';
import { getWalMarketClient } from '@/lib/sui-client';
import { QueryWidget } from '@/components/query-widget';
import { ExportPanel } from '@/components/export-panel';
import { CATEGORIES, CATEGORY_COLORS, SUISCAN_BASE, FAUCET_URL } from '@/lib/constants';
import { formatSui, formatEpochAge, formatEpochDate, formatAddress, suiscanTx } from '@/lib/format';
import { MemWalConnector } from '@walmarket/sdk';
import type { MemoryListing } from '@walmarket/sdk';

const DELEGATE_KEY_PREFIX = 'walmarket:delegateKey:';

function saveDelegateKey(accessId: string, privateKeyHex: string) {
  try { localStorage.setItem(`${DELEGATE_KEY_PREFIX}${accessId}`, privateKeyHex); } catch {}
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-slate-500 text-xs font-medium uppercase tracking-wide flex-shrink-0">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function CopyText({ value, display }: { value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors font-mono text-xs"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      <span>{display ?? value}</span>
      {copied ? <Check size={11} className="text-brand-400" /> : <Copy size={11} className="text-slate-600" />}
    </button>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address, signer } = useZkLogin();

  const [listing, setListing] = useState<MemoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<{
    digest: string;
    accessId: string;
    privateKeyHex: string;
  } | null>(null);

  useEffect(() => {
    getWalMarketClient().getListingById(id)
      .then(l => { setListing(l); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleBuy() {
    if (!signer || !address || !listing?.salePriceMist) return;
    setTxLoading(true);
    setError(null);
    try {
      const client = getWalMarketClient();
      const { publicKey, privateKey } = MemWalConnector.generateDelegateKey();
      const { digest, accessId } = await client.purchaseListingWithAccess(
        signer, listing.id, listing.salePriceMist, publicKey,
      );
      const privateKeyHex = Buffer.from(privateKey).toString('hex');
      saveDelegateKey(accessId, privateKeyHex);
      setPurchaseResult({ digest, accessId, privateKeyHex });
      setListing(prev => prev ? { ...prev, isActive: false, owner: address } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setTxLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-4 w-48" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="card p-6 space-y-4">
            <div className="skeleton h-6 w-20 rounded-full" />
            <div className="skeleton h-6 w-3/4" />
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-3 w-full" />)}
            </div>
          </div>
          <div className="card p-6 skeleton min-h-[300px]" />
          <div className="card p-6 skeleton min-h-[200px]" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="card p-12 text-center space-y-4">
        <AlertCircle size={32} className="text-red-400 mx-auto" />
        <p className="text-red-400 font-medium">Listing not found</p>
        <Link href="/marketplace" className="btn-ghost text-brand-400">
          <ArrowLeft size={14} /> Back to marketplace
        </Link>
      </div>
    );
  }

  const cat = CATEGORIES[listing.category] ?? 'General';
  const catColor = CATEGORY_COLORS[listing.category] ?? CATEGORY_COLORS[4];

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Breadcrumb ────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/marketplace" className="hover:text-white transition-colors">Marketplace</Link>
        <ChevronRight size={12} />
        <span className="text-slate-300 truncate max-w-xs">{listing.title}</span>
      </nav>

      {/* ── Main grid ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Left: Listing metadata */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-6 space-y-5">
            {/* Category + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx('badge', catColor)}>{cat}</span>
              {!listing.isActive && !purchaseResult && (
                <span className="badge-red">Sold</span>
              )}
              {purchaseResult && (
                <span className="badge-brand">Purchased</span>
              )}
            </div>

            {/* Title + description */}
            <div>
              <h1 className="text-xl font-bold text-white leading-snug">{listing.title}</h1>
              {listing.description && (
                <p className="text-slate-400 text-sm leading-relaxed mt-2">{listing.description}</p>
              )}
            </div>

            {/* Metadata rows */}
            <div className="divide-y divide-white/5">
              <MetaRow label="Memories">
                <div className="flex items-center gap-1.5 text-white font-semibold">
                  <Brain size={13} className="text-brand-400" />
                  <span className="font-tabular">{listing.memoryCount.toLocaleString()}</span>
                </div>
              </MetaRow>
              <MetaRow label="Oldest data">
                <div className="flex items-center gap-1.5 text-slate-300 text-xs">
                  <Calendar size={11} />
                  {listing.oldestMemoryEpoch
                    ? `${formatEpochDate(listing.oldestMemoryEpoch)} (${formatEpochAge(listing.oldestMemoryEpoch)})`
                    : 'Unknown'}
                </div>
              </MetaRow>
              <MetaRow label="Namespace">
                <div className="flex items-center gap-1 text-xs">
                  <Hash size={11} className="text-slate-600" />
                  <CopyText value={listing.namespace} display={listing.namespace.slice(0, 22) + (listing.namespace.length > 22 ? '…' : '')} />
                </div>
              </MetaRow>
              <MetaRow label="Seller">
                <a
                  href={`${SUISCAN_BASE}/address/${listing.owner}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors font-mono text-xs"
                >
                  <User size={11} />
                  {formatAddress(listing.owner)}
                  <ExternalLink size={10} />
                </a>
              </MetaRow>
              <MetaRow label="On-chain">
                <a
                  href={`${SUISCAN_BASE}/object/${listing.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors font-mono text-xs"
                >
                  {formatAddress(listing.id)}
                  <ExternalLink size={10} />
                </a>
              </MetaRow>
            </div>
          </div>
        </div>

        {/* Center: Query */}
        <div className="lg:col-span-1">
          <QueryWidget listingId={listing.id} />
        </div>

        {/* Right: Purchase */}
        <div className="lg:col-span-1 space-y-4">
          {/* Purchase card */}
          {listing.salePriceMist !== null && listing.isActive && !purchaseResult && (
            <div className="card p-6 space-y-4 border-brand-500/20 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-brand-500/5 to-transparent" />
              <div className="relative space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <ShoppingCart size={15} className="text-brand-400" />
                  Buy permanent access
                </h3>

                <div>
                  <p className="text-slate-500 text-xs mb-1">Price</p>
                  <p className="text-3xl font-bold text-brand-300 font-tabular">
                    {formatSui(listing.salePriceMist)}
                  </p>
                  <p className="text-slate-600 text-xs mt-1">2.5% marketplace fee applies</p>
                </div>

                <ul className="space-y-1.5 text-xs text-slate-400">
                  {['Permanent, irrevocable access', 'Export to 12+ agent frameworks', 'Cryptographic delegate key delivery', 'On-chain proof of ownership'].map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 size={11} className="text-brand-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {!address ? (
                  <p className="text-yellow-400 text-sm text-center py-2 bg-yellow-500/8 rounded-xl border border-yellow-500/15">
                    Sign in with Google to purchase
                  </p>
                ) : (
                  <button
                    onClick={() => void handleBuy()}
                    disabled={txLoading}
                    className="btn-primary w-full py-3 text-base"
                  >
                    {txLoading ? (
                      <><Loader2 size={16} className="animate-spin" /> Processing…</>
                    ) : (
                      <><ShoppingCart size={16} /> Buy for {formatSui(listing.salePriceMist)}</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Success */}
          {purchaseResult && (
            <div className="card p-5 space-y-3 border-brand-500/25 bg-brand-500/5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-brand-400" />
                <p className="text-brand-300 font-semibold">Purchase complete!</p>
              </div>
              <a
                href={suiscanTx(purchaseResult.digest)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
              >
                <ExternalLink size={11} />
                {purchaseResult.digest.slice(0, 24)}…
              </a>
              <p className="text-xs text-slate-500">Your delegate key has been saved. Export your memory below.</p>
            </div>
          )}

          {/* Sold (not by us) */}
          {!listing.isActive && !purchaseResult && (
            <div className="card p-5">
              <p className="text-slate-500 text-sm text-center">This listing has been sold.</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="card p-4 border-red-500/20 bg-red-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400" />
                <p className="text-red-400 text-sm font-medium">Transaction failed</p>
              </div>
              <p className="text-red-400/70 text-xs">{error}</p>
              {error.toLowerCase().includes('insufficient') && (
                <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="text-xs text-brand-400 hover:underline flex items-center gap-1">
                  <ExternalLink size={11} /> Get testnet SUI from faucet
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Export panel — shown after purchase ───────────────── */}
      {purchaseResult && (
        <div className="animate-slide-up">
          <ExportPanel context={{
            namespace: listing.namespace,
            accountId: listing.accountId,
            privateKey: purchaseResult.privateKeyHex,
            listingTitle: listing.title,
            memoryCount: listing.memoryCount,
          }} />
        </div>
      )}
    </div>
  );
}
