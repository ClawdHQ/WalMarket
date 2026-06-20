'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
  Terminal, Key, Loader2, Send, CheckCircle2, AlertCircle,
  ExternalLink, Trash2, ShoppingBag, ChevronRight, Bot, User,
} from 'lucide-react';
import { useZkLogin } from '@/hooks/use-zk-login';
import { getWalMarketClient } from '@/lib/sui-client';
import { formatExpiry, suiscanTx } from '@/lib/format';
import { isPermanentAccess } from '@walmarket/sdk';
import type { RentAccess, MemoryListing } from '@walmarket/sdk';

const KEY_STORAGE_PREFIX = 'walmarket:playground:key:';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  memoriesUsed?: number;
}

function loadSavedKey(accessId: string): string | null {
  try { return window.localStorage.getItem(KEY_STORAGE_PREFIX + accessId); } catch { return null; }
}

function normalizeKeyHex(input: string): string | null {
  const hex = input.trim().replace(/^0[xX]/, '');
  return /^[0-9a-fA-F]{64}$/.test(hex) ? hex : null;
}

export default function PlaygroundPage() {
  const { address, signer } = useZkLogin();

  const [accesses, setAccesses] = useState<RentAccess[]>([]);
  const [listings, setListings] = useState<Record<string, MemoryListing | null>>({});
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [keyInput, setKeyInput] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmDigest, setConfirmDigest] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    const client = getWalMarketClient();
    client.setWalletAddress(address);
    client.getMyRentals().then(async rentals => {
      setAccesses(rentals);
      const pairs = await Promise.all(
        rentals.map(async r => [r.listingId, await client.getListingById(r.listingId)] as const)
      );
      setListings(Object.fromEntries(pairs));
      setSelectedId(prev => prev ?? rentals[0]?.id ?? null);
    }).finally(() => setLoading(false));
  }, [address]);

  const selected = accesses.find(a => a.id === selectedId) ?? null;
  const expired = selected ? !isPermanentAccess(selected.expiresAt) && selected.expiresAt < Date.now() : false;

  function selectAccess(id: string) {
    setSelectedId(id);
    setQuery('');
    setTurns([]);
    setQueryError(null);
    setKeyError(null);
    setConfirmDigest(null);
    setConfirmError(null);
    const saved = loadSavedKey(id);
    setActiveKey(saved);
    setKeyInput(saved ?? '');
  }

  function handleUnlock() {
    if (!selected) return;
    const hex = normalizeKeyHex(keyInput);
    if (!hex) { setKeyError('Paste the 64-character hex private key shown when you rented or bought this access.'); return; }
    try { window.localStorage.setItem(KEY_STORAGE_PREFIX + selected.id, hex); } catch {}
    setActiveKey(hex);
    setKeyError(null);
  }

  function handleForgetKey() {
    if (!selected) return;
    try { window.localStorage.removeItem(KEY_STORAGE_PREFIX + selected.id); } catch {}
    setActiveKey(null);
    setKeyInput('');
  }

  async function handleQuery() {
    if (!selected || !activeKey || !query.trim()) return;
    const question = query.trim();
    setQueryLoading(true);
    setQueryError(null);
    setTurns(prev => [...prev, { role: 'user', content: question }]);
    setQuery('');
    try {
      const res = await fetch('/api/memwal/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selected.accountId, namespace: selected.namespace, delegateKey: activeKey, question, limit: 5 }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error?: string };
        throw new Error(error ?? `HTTP ${res.status}`);
      }
      const { answer, memoriesUsed } = await res.json() as { answer: string; memoriesUsed: number };
      setTurns(prev => [...prev, { role: 'assistant', content: answer, memoriesUsed }]);
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : 'Query failed — brand-new keys may need a minute to register.');
    } finally {
      setQueryLoading(false);
    }
  }

  async function handleConfirm() {
    if (!selected || !signer) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const { digest } = await getWalMarketClient().confirmRent(signer, selected.id);
      setConfirmDigest(digest);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Confirmation failed');
    } finally {
      setConfirming(false);
    }
  }

  if (!address) {
    return (
      <div className="card p-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center mx-auto">
          <Terminal size={24} className="text-accent-400" />
        </div>
        <div>
          <p className="text-white font-semibold">Sign in to open your Playground</p>
          <p className="text-slate-500 text-sm mt-1">Query memories from access you own, directly in real time</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Playground</h1>
        <p className="text-slate-500 text-sm mt-1">
          Query the memories behind your purchased or rented namespaces — live, using your delegate key.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading your access…</span>
        </div>
      )}

      {!loading && accesses.length === 0 && (
        <div className="card p-12 text-center space-y-4">
          <ShoppingBag size={28} className="text-slate-600 mx-auto" />
          <div>
            <p className="text-slate-400 font-medium text-sm">No memory access yet</p>
            <p className="text-slate-600 text-xs mt-1">Purchase or rent a namespace from the marketplace first</p>
          </div>
          <Link href="/marketplace" className="btn-primary text-sm inline-flex">
            <ShoppingBag size={14} /> Browse marketplace
          </Link>
        </div>
      )}

      {!loading && accesses.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── Access list ───────────────────────────────────── */}
          <div className="lg:col-span-1 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium px-1">Your access</p>
            {accesses.map(a => {
              const l = listings[a.listingId];
              const isExpired = !isPermanentAccess(a.expiresAt) && a.expiresAt < Date.now();
              const active = a.id === selectedId;
              const hasKey = !!loadSavedKey(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => selectAccess(a.id)}
                  className={clsx(
                    'w-full text-left card p-4 transition-all duration-200',
                    active
                      ? 'border-brand-500/40 bg-brand-500/8'
                      : 'hover:border-white/12',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{l?.title ?? a.namespace}</p>
                      <p className="text-slate-600 text-xs font-mono mt-0.5 truncate">{a.namespace}</p>
                    </div>
                    {active && <ChevronRight size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={clsx(
                      'badge',
                      isExpired ? 'badge-red' : isPermanentAccess(a.expiresAt) ? 'badge-brand' : 'badge-purple',
                    )}>
                      {isPermanentAccess(a.expiresAt) ? 'Permanent' : isExpired ? 'Expired' : formatExpiry(a.expiresAt)}
                    </span>
                    {hasKey && !isExpired && (
                      <span className="badge-gray text-[10px]">Key saved</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Active panel ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {!selected ? (
              <div className="card p-10 text-center text-slate-500 text-sm">
                Select an access on the left to get started
              </div>
            ) : (
              <>
                {/* Access header */}
                <div className="card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{listings[selected.listingId]?.title ?? selected.namespace}</p>
                      <p className="text-slate-500 text-xs font-mono mt-0.5">{selected.namespace}</p>
                    </div>
                    <span className={clsx('badge flex-shrink-0', expired ? 'badge-red' : 'badge-brand')}>
                      {formatExpiry(selected.expiresAt)}
                    </span>
                  </div>

                  {expired && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15 text-xs text-red-400">
                      <AlertCircle size={13} />
                      This access has expired — queries will fail.
                    </div>
                  )}

                  {/* Key unlock */}
                  {!activeKey ? (
                    <div className="space-y-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <Key size={13} className="text-slate-500" />
                        <p className="text-xs text-slate-400">
                          Paste the delegate private key shown when you rented or bought this access. Saved locally in your browser.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={keyInput}
                          onChange={e => setKeyInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
                          placeholder="0x… (64 hex characters)"
                          className="input font-mono text-xs"
                        />
                        <button onClick={handleUnlock} className="btn-primary text-sm px-4 whitespace-nowrap">
                          <Key size={13} /> Unlock
                        </button>
                      </div>
                      {keyError && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5">
                          <AlertCircle size={12} /> {keyError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-brand-400" />
                        <span className="badge-brand">Key loaded</span>
                        <span className="font-mono text-xs text-slate-600">
                          {activeKey.slice(0, 8)}…{activeKey.slice(-6)}
                        </span>
                      </div>
                      <button onClick={handleForgetKey} className="btn-danger text-xs flex items-center gap-1">
                        <Trash2 size={11} /> Forget
                      </button>
                    </div>
                  )}
                </div>

                {/* Chat interface */}
                {activeKey && (
                  <div className="card p-5 space-y-4">
                    <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                      <Terminal size={14} className="text-accent-400" />
                      Chat with this memory
                    </h3>

                    {turns.length > 0 && (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {turns.map((t, i) => (
                          <div key={i} className={clsx('flex gap-2.5', t.role === 'user' && 'justify-end')}>
                            {t.role === 'assistant' && (
                              <div className="w-7 h-7 rounded-full bg-accent-500/15 border border-accent-500/25 flex items-center justify-center flex-shrink-0">
                                <Bot size={13} className="text-accent-400" />
                              </div>
                            )}
                            <div className={clsx(
                              'rounded-xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]',
                              t.role === 'user'
                                ? 'bg-brand-500/15 border border-brand-500/20 text-slate-100'
                                : 'bg-white/[0.04] border border-white/8 text-slate-300',
                            )}>
                              {t.content}
                              {t.role === 'assistant' && typeof t.memoriesUsed === 'number' && (
                                <p className="text-[10px] text-slate-600 mt-1.5">
                                  Drew on {t.memoriesUsed} {t.memoriesUsed === 1 ? 'memory' : 'memories'}
                                </p>
                              )}
                            </div>
                            {t.role === 'user' && (
                              <div className="w-7 h-7 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center flex-shrink-0">
                                <User size={13} className="text-brand-400" />
                              </div>
                            )}
                          </div>
                        ))}
                        {queryLoading && (
                          <div className="flex gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-accent-500/15 border border-accent-500/25 flex items-center justify-center flex-shrink-0">
                              <Bot size={13} className="text-accent-400" />
                            </div>
                            <div className="rounded-xl px-3.5 py-2.5 bg-white/[0.04] border border-white/8 flex items-center">
                              <Loader2 size={13} className="animate-spin text-slate-500" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleQuery(); }}
                        placeholder="Ask this memory anything…"
                        className="input text-sm"
                        disabled={queryLoading}
                      />
                      <button
                        onClick={() => void handleQuery()}
                        disabled={queryLoading || !query.trim()}
                        className="btn-primary px-4 whitespace-nowrap"
                      >
                        {queryLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      </button>
                    </div>
                    {queryError && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15 text-xs text-red-400">
                        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                        {queryError}
                      </div>
                    )}
                  </div>
                )}

                {/* Confirm receipt */}
                {!expired && (
                  <div className="card p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-white text-sm font-medium">Confirm access on-chain</p>
                      <p className="text-slate-500 text-xs mt-0.5">Once your key works, confirm receipt to the seller.</p>
                    </div>
                    <button
                      onClick={() => void handleConfirm()}
                      disabled={confirming || !signer}
                      className="btn-accent text-sm shrink-0"
                    >
                      {confirming ? <><Loader2 size={13} className="animate-spin" /> Confirming…</> : <>Confirm receipt</>}
                    </button>
                  </div>
                )}
                {confirmDigest && (
                  <div className="card p-3 border-brand-500/20 bg-brand-500/5">
                    <a
                      href={suiscanTx(confirmDigest)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-brand-400 hover:underline font-mono"
                    >
                      <ExternalLink size={11} />
                      Confirmed: {confirmDigest.slice(0, 24)}…
                    </a>
                  </div>
                )}
                {confirmError && (
                  <p className="text-red-400 text-xs flex items-center gap-1.5">
                    <AlertCircle size={12} /> {confirmError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
