'use client';
import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
  Info, Tag, Database, DollarSign, Check, ChevronRight, ChevronLeft,
  Loader2, ExternalLink, ListPlus, Brain, Bot, KeyRound, ShieldCheck,
} from 'lucide-react';
import { useZkLogin } from '@/hooks/use-zk-login';
import { getWalMarketClient } from '@/lib/sui-client';
import { CATEGORIES, CATEGORY_COLORS } from '@/lib/constants';
import { suiscanTx, formatSui } from '@/lib/format';
import { mist } from '@walmarket/sdk';

type SellMode = 'managed' | 'self-hosted';

interface CreateForm {
  title: string;
  description: string;
  category: number;
  accountId: string;
  namespace: string;
  memoriesText: string;
  memoryCount: string;
  oldestMemoryDate: string;
  price: string;
  queryPrice: string;
}

const DEFAULT_FORM: CreateForm = {
  title: '', description: '', category: 0,
  accountId: '', namespace: '', memoriesText: '',
  memoryCount: '', oldestMemoryDate: '',
  price: '', queryPrice: '',
};

// Splits pasted content into individual memories — paragraphs (blank-line
// separated) if present, otherwise one memory per non-empty line.
function splitMemories(text: string): string[] {
  const byParagraph = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (byParagraph.length > 1) return byParagraph;
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

const STEPS = [
  { id: 'info', label: 'Listing info', icon: Info },
  { id: 'memwal', label: 'MemWal details', icon: Database },
  { id: 'pricing', label: 'Pricing', icon: Tag },
  { id: 'review', label: 'Review', icon: Check },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto scrollbar-hidden pb-1">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.id} className="flex items-center flex-shrink-0">
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              active ? 'text-brand-300 bg-brand-500/15 border border-brand-500/25' :
                done ? 'text-brand-400 bg-brand-500/8' :
                  'text-slate-500',
            )}>
              {done ? <Check size={12} /> : <Icon size={12} />}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-slate-700 mx-1 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-slate-500 text-xs font-medium">{label}</span>
      <span className="text-slate-200 text-xs text-right font-mono max-w-[60%] break-all">{value}</span>
    </div>
  );
}

export default function SellPage() {
  const { address, signer } = useZkLogin();
  const [mode, setMode] = useState<SellMode>('managed');
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ digest: string; listingId: string; managed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operatorAddress, setOperatorAddress] = useState('');
  const [connectingAgent, setConnectingAgent] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  function set(field: keyof CreateForm, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const managedMemories = splitMemories(form.memoriesText);

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!form.title.trim()) return 'Title is required';
    }
    if (s === 1) {
      if (mode === 'managed') {
        if (managedMemories.length === 0) return 'Paste at least one memory';
      } else {
        if (!form.accountId.trim()) return 'Account ID is required';
        if (!form.namespace.trim()) return 'Namespace is required';
      }
    }
    if (s === 2) {
      if (!form.price || Number(form.price) <= 0) return 'Price must be greater than 0';
      if (form.queryPrice && Number(form.queryPrice) <= 0) return 'Pay-per-query price must be greater than 0, or left blank';
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setError(null);
    setStep(s => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    if (!signer) { setError('Sign in with Google first'); return; }
    setSubmitting(true);
    setError(null);
    try {
      let accountId = form.accountId;
      let namespace = form.namespace;
      let memoryCount = Number(form.memoryCount) || 0;
      let managedOperatorAddress: string | null = null;

      if (mode === 'managed') {
        setProgress('Provisioning your managed account — creating a MemWal account and storing your memories (this can take a minute)…');
        const provisionRes = await fetch('/api/managed-memory/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memories: managedMemories, namespaceHint: form.title }),
        });
        if (!provisionRes.ok) {
          const body = await provisionRes.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to provision managed account');
        }
        const provisioned = await provisionRes.json() as { accountId: string; namespace: string; operatorAddress: string; memoryCount: number };
        accountId = provisioned.accountId;
        namespace = provisioned.namespace;
        memoryCount = provisioned.memoryCount;
        managedOperatorAddress = provisioned.operatorAddress;
      }

      setProgress('Publishing your listing on-chain…');
      const res = await getWalMarketClient().createListing(signer, {
        accountId,
        namespace,
        title: form.title,
        description: form.description,
        category: form.category,
        memoryCount,
        oldestMemoryEpoch: form.oldestMemoryDate ? new Date(form.oldestMemoryDate).getTime() : Date.now(),
        salePriceMist: mist(Number(form.price)),
        rentPricePerHourMist: undefined,
        pricePerQueryMist: form.queryPrice ? mist(Number(form.queryPrice)) : undefined,
      });

      if (managedOperatorAddress) {
        setProgress('Authorizing WalMarket to answer queries on your behalf…');
        await getWalMarketClient().setOperator(signer, res.listingId, managedOperatorAddress);
        await fetch('/api/managed-memory/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, listingId: res.listingId }),
        }).catch(() => {}); // bookkeeping only — never block the listing on this
        setAgentConnected(true);
      }

      setResult({ ...res, managed: mode === 'managed' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create listing');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  async function handleConnectAgent() {
    if (!signer || !result) return;
    if (!operatorAddress.trim()) { setAgentError('Paste in your agent\'s Sui address'); return; }
    setConnectingAgent(true);
    setAgentError(null);
    try {
      await getWalMarketClient().setOperator(signer, result.listingId, operatorAddress.trim());
      setAgentConnected(true);
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Failed to connect agent');
    } finally {
      setConnectingAgent(false);
    }
  }

  const priceMist = form.price ? mist(Number(form.price)) : null;
  const cat = CATEGORIES[form.category] ?? 'General';

  /* ── Success screen ─────────────────────────────────────────── */
  if (result) {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="card p-10 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center mx-auto">
            <Check size={28} className="text-brand-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-brand-300">Listing published!</h2>
            <p className="text-slate-400 text-sm mt-2">Your memory namespace is now live on Sui testnet</p>
          </div>
          <a
            href={suiscanTx(result.digest)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white font-mono transition-colors"
          >
            <ExternalLink size={12} />
            {result.digest.slice(0, 28)}…
          </a>

          {result.managed ? (
            <div className="text-left rounded-xl border border-brand-500/20 bg-brand-500/8 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand-400" />
                <h3 className="text-white font-semibold text-sm">Managed by WalMarket</h3>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                WalMarket created a dedicated MemWal account for this listing and is already answering buyer
                queries and registering purchases automatically. There's nothing else to set up.
              </p>
            </div>
          ) : (
            /* Connect your seller agent */
            <div className="text-left rounded-xl border border-white/8 bg-white/[0.02] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-accent-400" />
                <h3 className="text-white font-semibold text-sm">Connect your seller agent</h3>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">
                WalMarket never holds your MemWal key. To let buyers chat with your memory and to register their
                access automatically, run your own agent (<code className="font-mono text-[11px] bg-white/5 px-1 py-0.5 rounded">apps/demo-agent</code> — see its README) and authorize
                its Sui address below. This is separate from your wallet, and you can change it any time.
              </p>
              {agentConnected ? (
                <div className="flex items-center gap-2 text-brand-400 text-xs py-1">
                  <Check size={13} /> Agent connected — it can now answer queries for this listing.
                </div>
              ) : (
                <>
                  <input
                    className="input font-mono text-xs"
                    placeholder="Agent Sui address (0x…)"
                    value={operatorAddress}
                    onChange={e => setOperatorAddress(e.target.value)}
                    disabled={connectingAgent}
                  />
                  {agentError && <p className="text-red-400 text-xs">{agentError}</p>}
                  <button
                    onClick={() => void handleConnectAgent()}
                    disabled={connectingAgent}
                    className="btn-secondary text-xs w-full"
                  >
                    {connectingAgent ? <><Loader2 size={12} className="animate-spin" /> Connecting…</> : 'Connect agent'}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-center flex-wrap">
            <Link href={`/listing/${result.listingId}`} className="btn-primary text-sm">
              <ExternalLink size={14} /> View listing
            </Link>
            <button
              onClick={() => {
                setResult(null); setForm(DEFAULT_FORM); setStep(0); setMode('managed');
                setAgentConnected(false); setOperatorAddress(''); setAgentError(null);
              }}
              className="btn-secondary text-sm"
            >
              List another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">List a Memory Namespace</h1>
        <p className="text-slate-500 text-sm mt-1">
          Buyers pay once and get permanent access — exportable to Claude, ChatGPT, Cursor, LangChain, and more.
        </p>
      </div>

      <StepIndicator current={step} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Form ───────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="card p-6 space-y-5">

            {/* Step 0: Basic info */}
            {step === 0 && (
              <div className="space-y-5 animate-fade-in">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Info size={15} className="text-brand-400" /> Listing info
                </h2>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">Title *</label>
                  <input
                    className="input"
                    placeholder="e.g. 18-month Sui DeFi Research Agent"
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">Description</label>
                  <textarea
                    rows={3}
                    className="input resize-none"
                    placeholder="Describe the knowledge domain this agent has mastered…"
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set('category', i)}
                        className={clsx(
                          'badge cursor-pointer transition-all',
                          form.category === i ? CATEGORY_COLORS[i] : 'badge-gray hover:badge-brand',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: MemWal details */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Database size={15} className="text-brand-400" /> Your memory
                </h2>

                {/* Mode toggle */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('managed')}
                    className={clsx(
                      'text-left p-3.5 rounded-xl border transition-all space-y-1.5',
                      mode === 'managed' ? 'border-brand-500/40 bg-brand-500/8' : 'border-white/8 hover:border-white/15',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className={mode === 'managed' ? 'text-brand-400' : 'text-slate-500'} />
                      <span className="text-sm font-semibold text-white">Let WalMarket handle it</span>
                      <span className="badge-brand text-[9px] ml-auto">Recommended</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Paste your memories below. We create and run everything — no MemWal account, no agent to host.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('self-hosted')}
                    className={clsx(
                      'text-left p-3.5 rounded-xl border transition-all space-y-1.5',
                      mode === 'self-hosted' ? 'border-accent-500/40 bg-accent-500/8' : 'border-white/8 hover:border-white/15',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <KeyRound size={14} className={mode === 'self-hosted' ? 'text-accent-400' : 'text-slate-500'} />
                      <span className="text-sm font-semibold text-white">I'll run my own agent</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      You already have a MemWal account and want full custody — see apps/demo-agent.
                    </p>
                  </button>
                </div>

                {mode === 'managed' ? (
                  <>
                    <div className="p-3 rounded-xl bg-brand-500/6 border border-brand-500/15">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        WalMarket creates a dedicated MemWal account for this listing, stores your memories in it,
                        and runs the agent that answers buyer queries and registers purchases — automatically.
                        You never see or manage any keys.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Memories *</label>
                      <textarea
                        rows={10}
                        className="input resize-none font-mono text-xs leading-relaxed"
                        placeholder={'One memory per paragraph (blank line between each), e.g.:\n\nCetus is the leading concentrated-liquidity DEX on Sui, with the deepest SUI/USDC pool.\n\nPyth Network provides Sui’s primary on-chain price oracle, updated sub-second.\n\n...'}
                        value={form.memoriesText}
                        onChange={e => set('memoriesText', e.target.value)}
                      />
                      <p className="text-[11px] text-slate-600">
                        {managedMemories.length} memor{managedMemories.length === 1 ? 'y' : 'ies'} detected
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-accent-500/6 border border-accent-500/15">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Find your <strong className="text-accent-300">Account ID</strong> and{' '}
                        <strong className="text-accent-300">Namespace</strong> at{' '}
                        <a href="https://memory.walrus.xyz" target="_blank" rel="noreferrer" className="text-accent-400 hover:underline inline-flex items-center gap-0.5">
                          memory.walrus.xyz <ExternalLink size={10} />
                        </a>
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Account ID *</label>
                      <input
                        className="input font-mono text-xs"
                        placeholder="0x…"
                        value={form.accountId}
                        onChange={e => set('accountId', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Namespace *</label>
                      <input
                        className="input font-mono text-sm"
                        placeholder="sui-defi-research"
                        value={form.namespace}
                        onChange={e => set('namespace', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-medium">Memory count (approx.)</label>
                        <input
                          type="number"
                          min="1"
                          className="input"
                          placeholder="120"
                          value={form.memoryCount}
                          onChange={e => set('memoryCount', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-medium">Oldest memory date</label>
                        <input
                          type="date"
                          className="input"
                          value={form.oldestMemoryDate}
                          onChange={e => set('oldestMemoryDate', e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 2: Pricing */}
            {step === 2 && (
              <div className="space-y-5 animate-fade-in">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <DollarSign size={15} className="text-brand-400" /> Set your price
                </h2>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">Sale price (SUI) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input pr-14"
                      placeholder="5.00"
                      value={form.price}
                      onChange={e => set('price', e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold">SUI</span>
                  </div>
                </div>
                {priceMist && (
                  <div className="card p-4 space-y-2">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Earnings breakdown</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Sale price</span><span className="text-white">{formatSui(priceMist)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Marketplace fee (2.5%)</span><span className="text-red-400">-{formatSui(priceMist * 250n / 10000n)}</span></div>
                      <div className="flex justify-between font-semibold border-t border-white/5 pt-2 mt-2"><span className="text-slate-300">You receive</span><span className="text-brand-300">{formatSui(priceMist * 9750n / 10000n)}</span></div>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <label className="text-xs text-slate-400 font-medium">Pay-per-query price (optional)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="input pr-14"
                      placeholder="0.01"
                      value={form.queryPrice}
                      onChange={e => set('queryPrice', e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold">SUI</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Lets buyers (including other agents) keep chatting for a small fee per message instead of buying full access —
                    unlimited, unlike the one free test question every listing already gets.
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  Buyers get permanent, irrevocable access. Export to Claude, ChatGPT, Cursor, LangChain, and 8+ more frameworks.
                </p>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-5 animate-fade-in">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Check size={15} className="text-brand-400" /> Review & publish
                </h2>
                <div className="card p-4 divide-y divide-white/5">
                  <ReviewRow label="Title" value={form.title} />
                  <ReviewRow label="Category" value={cat} />
                  <ReviewRow label="Hosting" value={mode === 'managed' ? 'Managed by WalMarket' : 'Self-hosted'} />
                  {mode === 'managed' ? (
                    <ReviewRow label="Memories" value={`${managedMemories.length} pasted`} />
                  ) : (
                    <>
                      <ReviewRow label="Namespace" value={form.namespace} />
                      <ReviewRow label="Account ID" value={form.accountId.slice(0, 20) + '…'} />
                      <ReviewRow label="Memory count" value={form.memoryCount || '—'} />
                    </>
                  )}
                  <ReviewRow label="Price" value={priceMist ? formatSui(priceMist) : '—'} />
                  <ReviewRow label="Pay-per-query" value={form.queryPrice ? `${formatSui(mist(Number(form.queryPrice)))} / msg` : 'Not offered'} />
                </div>
                {!address && (
                  <p className="text-center text-sm text-yellow-400 py-2 bg-yellow-500/8 rounded-xl border border-yellow-500/15">
                    Sign in with Google to publish
                  </p>
                )}
              </div>
            )}

            {/* Progress */}
            {progress && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-500/8 border border-brand-500/15 text-xs text-brand-300">
                <Loader2 size={13} className="animate-spin flex-shrink-0" />
                <span>{progress}</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15 text-xs text-red-400">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <button onClick={prevStep} className="btn-secondary text-sm gap-1.5">
                  <ChevronLeft size={14} /> Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button onClick={nextStep} className="btn-primary text-sm ml-auto gap-1.5">
                  Continue <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  onClick={() => void handleSubmit()}
                  disabled={submitting || !address}
                  className="btn-primary text-sm ml-auto gap-1.5"
                >
                  {submitting ? (
                    <><Loader2 size={14} className="animate-spin" /> Publishing…</>
                  ) : (
                    <><ListPlus size={14} /> Publish listing</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Preview card ──────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="card p-5 space-y-4 sticky top-24">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Live preview</p>

            <div className="space-y-3">
              {form.category !== undefined && (
                <span className={clsx('badge', CATEGORY_COLORS[form.category])}>{cat}</span>
              )}
              <h3 className="text-white font-semibold text-sm leading-snug">
                {form.title || <span className="text-slate-600">Your listing title</span>}
              </h3>
              {form.description && (
                <p className="text-slate-500 text-xs line-clamp-3 leading-relaxed">{form.description}</p>
              )}
              {form.memoryCount && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Brain size={11} className="text-brand-400" />
                  <span>{Number(form.memoryCount).toLocaleString()} memories</span>
                </div>
              )}
              {priceMist && (
                <div className="rounded-xl bg-brand-500/8 border border-brand-500/18 p-3 text-center">
                  <p className="text-[10px] text-brand-500 uppercase tracking-wide mb-0.5">Sale price</p>
                  <p className="text-brand-300 font-bold text-lg">{formatSui(priceMist)}</p>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-600 leading-relaxed border-t border-white/5 pt-3">
              Buyer gets permanent access + export to Claude, ChatGPT, Cursor, LangChain &amp; more
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
