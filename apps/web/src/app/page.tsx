import Link from 'next/link';
import { ArrowRight, Brain, Search, Layers, Shield, Zap, Database, Code2, Globe, Bot, CheckCircle2, XCircle } from 'lucide-react';
import { LiveStats } from '@/components/live-stats';
import { FeaturedListings } from '@/components/featured-listings';

const HOW_IT_WORKS = [
  {
    icon: Database,
    step: '01',
    title: 'Seller lists a namespace',
    body: 'An AI agent that spent months accumulating domain knowledge — DeFi strategies, legal precedents, codebases — creates a WalMarket listing. The namespace becomes an ownable Sui object with a set sale price.',
    color: 'text-brand-400',
    bg: 'bg-brand-500/10 border-brand-500/20',
  },
  {
    icon: Search,
    step: '02',
    title: 'Buyer asks before buying',
    body: 'Send 1 free message on-chain. The seller\'s own agent answers it with a real AI-generated response from the live namespace — no raw memory exposed, just a real glimpse of it.',
    color: 'text-accent-400',
    bg: 'bg-accent-500/10 border-accent-500/20',
  },
  {
    icon: Layers,
    step: '03',
    title: 'Buy once, export everywhere',
    body: 'One on-chain transaction grants permanent, irrevocable access. Export to Claude, ChatGPT, Cursor, LangChain, Gemini, Vercel AI SDK, and 6 more frameworks with one click.',
    color: 'text-brand-300',
    bg: 'bg-brand-500/10 border-brand-500/20',
  },
];

const FRAMEWORKS = [
  { name: 'Claude Code', icon: '🤖' },
  { name: 'Claude API', icon: '🔷' },
  { name: 'ChatGPT', icon: '💬' },
  { name: 'Cursor', icon: '⚡' },
  { name: 'GitHub Copilot', icon: '🐙' },
  { name: 'Vercel AI SDK', icon: '▲' },
  { name: 'LangChain', icon: '🔗' },
  { name: 'Gemini', icon: '✦' },
  { name: 'Deepseek', icon: '🐳' },
  { name: 'OpenClaw', icon: '🦞' },
  { name: 'Antigravity', icon: '🛸' },
  { name: 'Manus', icon: '🤝' },
];

const TECH_STACK = [
  { name: 'Sui Move', desc: 'On-chain ownership & payments' },
  { name: 'MemWal', desc: 'Walrus-backed vector memory' },
  { name: 'Walrus', desc: 'Decentralized blob storage' },
  { name: 'Seal', desc: 'Threshold encryption & access' },
  { name: 'zkLogin', desc: 'Gasless sign-in via Google' },
];

const BENEFITS = [
  { icon: Shield, title: 'Non-custodial', body: 'Listings are Sui shared objects. No central database, no intermediary. Your memory, your chain.' },
  { icon: Zap, title: 'Instant export', body: 'After purchase, generate ready-to-use config files for any agent framework in one click.' },
  { icon: Globe, title: 'Provable quality', body: 'Answers are AI-generated from live data by the seller\'s own agent and posted on-chain — not self-reported.' },
  { icon: Code2, title: 'Developer-native', body: 'TypeScript SDK, MemWal connector, and Seal-encrypted key delivery built in.' },
];

export default function HomePage() {
  return (
    <div className="space-y-28">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-6 text-center">
        {/* Background orbs */}
        <div className="pointer-events-none absolute -top-20 left-1/4 w-[600px] h-[600px] rounded-full bg-brand-500/6 blur-[100px]" />
        <div className="pointer-events-none absolute -top-10 right-1/4 w-[500px] h-[500px] rounded-full bg-accent-500/6 blur-[100px]" />

        <div className="relative space-y-7 animate-fade-in">
          <span className="eyebrow">
            <span className="live-dot" />
            Sui Overflow 2026
          </span>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.08] tracking-tight text-balance mx-auto max-w-4xl">
            The marketplace for{' '}
            <span className="text-gradient">AI agent memory</span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed text-balance">
            WalMarket lets you buy, sell, and rent{' '}
            <span className="text-white font-medium">MemWal namespaces as ownable Sui objects</span>{' '}
            — plug trained memory directly into any agent framework.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/marketplace" className="btn-primary text-base px-7 py-3 shadow-glow-brand-sm">
              <Brain size={17} />
              Browse marketplace
            </Link>
            <Link href="/sell" className="btn-secondary text-base px-7 py-3">
              List your memory
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* Live chain stats */}
          <LiveStats />
        </div>
      </section>

      {/* ── Featured live listings ─────────────────────────────── */}
      <FeaturedListings />

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="section">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">How it works</h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Three steps from raw agent memory to tradeable on-chain asset
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 mt-2">
          {HOW_IT_WORKS.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="card p-6 space-y-4 relative overflow-hidden">
                <div className="absolute top-4 right-4 text-6xl font-black text-white/3 font-mono leading-none select-none">
                  {item.step}
                </div>
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${item.bg}`}>
                  <Icon size={18} className={item.color} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-px flex-1 ${i === 0 ? 'bg-brand-500/20' : i === 1 ? 'bg-accent-500/20' : 'bg-brand-500/20'}`} />
                    <span className={`text-xs font-mono font-bold ${item.color}`}>Step {item.step}</span>
                  </div>
                  <h3 className="text-white font-semibold text-base">{item.title}</h3>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{item.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Why WalMarket ─────────────────────────────────────── */}
      <section className="section">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">Built for agent developers</h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Every design decision optimises for trust, portability, and developer experience
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {BENEFITS.map(b => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="card p-5 flex gap-4">
                <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={15} className="text-brand-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{b.title}</p>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{b.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Framework compatibility ────────────────────────────── */}
      <section className="section text-center">
        <div className="space-y-2 mb-8">
          <h2 className="text-3xl font-bold text-white">Works with every framework</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            After purchase, one click generates a ready-to-paste config or code snippet for your stack.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {FRAMEWORKS.map(f => (
            <span
              key={f.name}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full card text-slate-300 text-sm font-medium hover:text-white hover:border-brand-500/30 transition-all duration-200 cursor-default"
            >
              <span>{f.icon}</span>
              {f.name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Tech stack ────────────────────────────────────────── */}
      <section className="card p-8 md:p-10 relative overflow-hidden">
        <div className="pointer-events-none absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-brand-500/5 blur-3xl" />
        <div className="pointer-events-none absolute -top-10 -left-10 w-60 h-60 rounded-full bg-accent-500/5 blur-3xl" />

        <div className="relative space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Fully on-chain, zero trust required</h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed max-w-2xl">
              Every listing is a Sui shared object with on-chain price enforcement. Memory lives in{' '}
              MemWal — Walrus-backed vector storage. Access is cryptographically sealed. Purchases are
              permanent — no subscriptions, no expiry, no trusted intermediary.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {TECH_STACK.map(t => (
              <div key={t.name} className="flex flex-col items-start px-4 py-2.5 rounded-xl bg-brand-500/8 border border-brand-500/18">
                <span className="text-brand-300 text-xs font-mono font-bold">{t.name}</span>
                <span className="text-slate-500 text-[10px] mt-0.5">{t.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AMaaS — autonomous agent section ─────────────────────── */}
      <section className="section">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <span className="eyebrow">
              <Bot size={11} />
              Agent Memory as a Service
            </span>
            <h2 className="text-3xl font-bold text-white leading-snug">
              Agents buy memory{' '}
              <span className="text-gradient">themselves</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              WalMarket is the only AI memory marketplace with a machine-native HTTP API.
              An autonomous agent can discover listings, pay on-chain in SUI, and start
              querying — with <span className="text-white font-medium">zero human involvement</span>,
              no OAuth, and no subscriptions.
            </p>
            <div className="space-y-2 pt-2">
              {[
                ['Decentralized storage', 'Walrus P2P blobs — not a MySQL database'],
                ['Seal encryption', 'Threshold key delivery — no admin backdoor'],
                ['On-chain ownership', 'Sui Move object — not a database record'],
                ['Prove before you buy', 'Chat with the live namespace before you pay'],
              ].map(([title, sub]) => (
                <div key={title} className="flex items-start gap-2.5">
                  <CheckCircle2 size={13} className="text-brand-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-white text-sm font-medium">{title}</span>
                    <span className="text-slate-500 text-xs"> — {sub}</span>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/for-agents" className="btn-primary inline-flex items-center gap-2 mt-2">
              <Bot size={15} /> Agent quickstart
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Comparison mini-table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/6 flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">AMaaS comparison</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-2.5 text-slate-600 font-medium w-2/5"></th>
                  <th className="px-4 py-2.5 text-center"><span className="badge-brand text-[10px]">WalMarket</span></th>
                  <th className="px-4 py-2.5 text-center"><span className="badge text-[10px] bg-gray-500/15 text-gray-400 border-gray-500/20">Memoreum</span></th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Storage', 'Walrus (P2P)', 'MySQL (central)'],
                  ['Access control', 'Seal encryption', 'API key only'],
                  ['Proof-before-buy', true, false],
                  ['Autonomous agent API', true, false],
                  ['On-chain ownership', true, false],
                  ['Multi-framework export', true, false],
                ].map(([feat, wm, mem], i, arr) => (
                  <tr key={String(feat)} className={i < arr.length - 1 ? 'border-b border-white/4' : ''}>
                    <td className="px-5 py-2.5 text-slate-500">{String(feat)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {typeof wm === 'boolean' ? (
                        wm
                          ? <CheckCircle2 size={13} className="text-brand-400 mx-auto" />
                          : <XCircle size={13} className="text-red-400/60 mx-auto" />
                      ) : (
                        <span className="text-brand-300 text-[11px] font-medium">{wm}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {typeof mem === 'boolean' ? (
                        mem
                          ? <CheckCircle2 size={13} className="text-brand-400 mx-auto" />
                          : <XCircle size={13} className="text-red-400/60 mx-auto" />
                      ) : (
                        <span className="text-slate-500 text-[11px]">{mem}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="text-center space-y-6 pb-8">
        <h2 className="text-3xl font-bold text-white">Ready to trade memory?</h2>
        <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
          Connect with Google via zkLogin — no wallet extension needed. Browse live listings or list
          your own namespace in under two minutes.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/marketplace" className="btn-primary px-8 py-3 text-base shadow-glow-brand-sm">
            <ShoppingBagIcon />
            Browse marketplace
          </Link>
          <Link href="/sell" className="btn-secondary px-8 py-3 text-base">
            Become a seller
          </Link>
        </div>
      </section>

    </div>
  );
}

function ShoppingBagIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  );
}
