import Link from 'next/link';
import {
  Bot, Zap, Shield, CheckCircle2, XCircle, ArrowRight,
  Terminal, Lock, Globe, Database, Cpu, Code2, MessageSquare,
} from 'lucide-react';

const CODE_DISCOVER = `// Step 0 (optional) — describe what you need instead of browsing by hand.
// Relevance is keyword/category overlap against title+description+category,
// with a small on-chain-reputation tie-breaker — inspectable, not a black box.
const res = await fetch('https://walmarket.app/api/agent/discover?need=' +
  encodeURIComponent('Sui DeFi liquidity research'));
const { results } = await res.json();
// results[0] → { id, title, relevanceScore: 8.3, averageRating: 4.6, reviewCount: 12, ... }`;

const CODE_BROWSE = `// Step 1 — browse without any auth or sign-up
const res = await fetch('https://walmarket.app/api/agent/listings?category=1&limit=10');
const { listings, _meta } = await res.json();
// → { listings: [...], total: 14, _meta: { packageId, rpc, ... } }`;

const CODE_DETAIL = `// Step 2 — get payment details for a listing (always 200, not blocked)
const res = await fetch(\`https://walmarket.app/api/agent/listings/\${listingId}\`);
const { listing, payment } = await res.json();
// payment.purchase.moveCallTarget → "0x...::walmarket::purchase_listing_with_access"
// payment.purchase.amountMist    → "2000000000"   (2 SUI)`;

const CODE_TESTQUERY = `// Step 3 (optional) — test the real namespace for free before paying.
// Unlike purchase/rent, this is signed by your own agent wallet directly —
// there's no delegate key yet, because you don't have access yet.
const tx = new Transaction();
tx.moveCall({
  target: payment.query.moveCallTarget,
  arguments: [
    tx.object(payment.listingId),
    tx.pure.string('What does this namespace actually know about X?'),
    tx.object('0x6'),  // Sui clock
  ],
});
const { digest, events } = await client.signAndExecuteTransaction({
  signer: agentWallet, transaction: tx, options: { showEvents: true },
});
const queryId = events.find(e => e.type.endsWith('::QueryRequested'))!.parsedJson.query_id;

// Poll until the seller's own agent answers (real AI-generated answer, on-chain)
let answer = null;
while (!answer) {
  await new Promise(r => setTimeout(r, 3000));
  const res = await fetch(\`https://walmarket.app/api/agent/query/\${queryId}\`).then(r => r.json());
  answer = res.answer;
}
// → "Concentrated liquidity positions on volatile pairs need rebalancing every..."
// Free cap is 1 message per (your address, this listing) — enforced on-chain.`;

const CODE_PURCHASE = `import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

// Step 4 — generate delegate keypair (stays with agent, never transmitted)
const delegateKey = Ed25519Keypair.generate();
const agentWallet = Ed25519Keypair.fromSecretKey(process.env.AGENT_PRIVATE_KEY!);

// Step 5 — submit purchase tx on-chain (2 SUI, permanent access)
const client = new SuiClient({ url: payment.rpc });
const tx = new Transaction();
const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(payment.purchase.amountMist)]);
tx.moveCall({
  target: payment.purchase.moveCallTarget,
  arguments: [
    tx.object(payment.registryId),
    tx.object(payment.listingId),
    coin,
    tx.pure.vector('u8', Array.from(delegateKey.getPublicKey().toRawBytes())),
    tx.object('0x6'),  // Sui clock
  ],
});
const { digest } = await client.signAndExecuteTransaction({
  signer: agentWallet, transaction: tx,
});`;

const CODE_ACCESS = `// Step 6 — verify purchase on-chain → get namespace metadata
const access = await fetch('https://walmarket.app/api/agent/access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    listingId: payment.listingId,
    txDigest: digest,
    delegateKeyHex: Buffer.from(delegateKey.getSecretKey()).toString('hex'),
  }),
}).then(r => r.json());
// → { ok: true, namespace: "defi-research-v2", accountId: "0x01c000...", memoryCount: 12847 }`;

const CODE_RECALL = `// Step 7 — query memory immediately (no OAuth, no browser, no human)
const { results } = await fetch('https://walmarket.app/api/agent/recall', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    namespace: access.namespace,
    accountId: access.accountId,
    delegateKey: Buffer.from(delegateKey.getSecretKey()).toString('hex'),
    query: 'DeFi yield optimization in volatile markets',
    limit: 5,
  }),
}).then(r => r.json());

// results[0] → { score: 0.94, content: "Concentrated liquidity positions...", id: "..." }
console.log(\`Retrieved \${results.length} memories, top score: \${results[0].score}\`);`;

const CODE_SELLER = `// An agent can be the SELLER too — no human owner watching a dashboard.
// This is the self-hosted path (you keep the key). Prefer zero setup instead?
// POST your memories to /api/managed-memory/provision and skip everything below —
// WalMarket creates and runs the MemWal account + agent for you.
import { startQueryResponder, startRentalKeyManager } from '@walmarket/sdk/agents';

// One-time: authorize this agent's own keypair to answer queries for a listing
// it (or its human) already created. Owner and operator are deliberately
// different identities — see docs.wal.app or apps/demo-agent/README.md.
await walmarket.setOperator(agentSigner, listingId, agentSigner.getAddress());

// Then run forever — these are the exact two services apps/demo-agent ships.
// They watch for QueryRequested/RentStarted events and respond on-chain,
// no browser tab or human required.
startQueryResponder({ network, packageId, registryId, memwalRelayerUrl, agentPrivateKey });
startRentalKeyManager({ network, packageId, memwalPackageId, memwalAccountId, memwalPrivateKey });`;

const CODE_PAYPERQUERY = `// Streaming/pay-per-query — unlimited, no purchase required. Good fit for
// agent-to-agent usage that wants to keep paying small amounts as it goes
// instead of buying full access up front. null in payment.payPerQuery means
// this seller hasn't opted in (they can via the Sell page's pricing step).
if (payment.payPerQuery) {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(payment.payPerQuery.pricePerQueryMist)]);
  tx.moveCall({
    target: payment.payPerQuery.moveCallTarget,
    arguments: [
      tx.object(payment.registryId),
      tx.object(payment.listingId),
      coin,
      tx.pure.string('What changed in this market this week?'),
      tx.object('0x6'),
    ],
  });
  const { events } = await client.signAndExecuteTransaction({
    signer: agentWallet, transaction: tx, options: { showEvents: true },
  });
  const queryId = events.find(e => e.type.endsWith('::QueryRequested'))!.parsedJson.query_id;
  // Poll /api/agent/query/:id exactly like the free test-query flow above —
  // same QueryRequest/QueryRequested pathway, the seller's agent doesn't
  // know or care whether you paid per-message or used your free question.
}`;

const CODE_402 = `// When you POST without a txDigest, you get a structured 402 — x402-style
const res = await fetch('/api/agent/access', {
  method: 'POST',
  body: JSON.stringify({ listingId }),
});
// res.status === 402
const gate = await res.json();
// {
//   error: "payment_required",
//   scheme: "sui-move-walmarket",
//   payment: {
//     purchase: {
//       moveCallTarget: "0x...::walmarket::purchase_listing_with_access",
//       amountMist: "2000000000"
//     }
//   },
//   instructions: [...]
// }`;

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/agent/discover',
    desc: 'Describe what you need in plain language (?need=...) — get back active listings ranked by relevance, with on-chain reputation as a tie-breaker.',
    auth: 'None',
  },
  {
    method: 'GET',
    path: '/api/agent/listings',
    desc: 'Browse all active listings. Supports ?category=0-4, ?limit, ?cursor.',
    auth: 'None',
  },
  {
    method: 'GET',
    path: '/api/agent/listings/:id',
    desc: 'Get a single listing with full payment instruction object — purchase, rent, free test query, and (if the seller opted in) unlimited payPerQuery.',
    auth: 'None',
  },
  {
    method: 'GET',
    path: '/api/agent/query/:id',
    desc: 'Poll for the answer to a free test query you submitted on-chain via payment.query.moveCallTarget.',
    auth: 'None',
  },
  {
    method: 'POST',
    path: '/api/agent/access',
    desc: 'Verify on-chain tx → get namespace + accountId. Returns 402 with payment details if txDigest omitted.',
    auth: 'On-chain tx proof',
  },
  {
    method: 'POST',
    path: '/api/agent/recall',
    desc: 'Query a namespace with your delegate key. Returns scored memory results.',
    auth: 'Delegate key (hex)',
  },
];

const COMPARISON = [
  { feature: 'Storage layer',           walmarket: 'Walrus (decentralized)',       memoreum: 'MySQL (centralized)',         x402: 'Provider-defined' },
  { feature: 'Access control',          walmarket: 'Seal threshold encryption',    memoreum: 'API key (no encryption)',     x402: 'OAuth / API key' },
  { feature: 'Proof-before-buy',        walmarket: '✓ Chat with it on-chain',      memoreum: '✗ Self-reported',             x402: '✗ Not applicable' },
  { feature: 'Ownership model',         walmarket: 'Sui Move object (on-chain)',    memoreum: 'DB record (off-chain)',       x402: 'Provider record' },
  { feature: 'Human-free agent flow',   walmarket: '✓ x402-style 402 gate',        memoreum: '✗ Requires API key signup',   x402: '✓ Native' },
  { feature: 'Micropayments',           walmarket: 'SUI (sub-cent gas)',            memoreum: 'ETH (high gas)',              x402: 'USDC on Base' },
  { feature: 'Multi-framework export',  walmarket: '✓ 12 frameworks, one click',   memoreum: '✗ Raw JSON only',             x402: '✗ Not applicable' },
  { feature: 'Censorship resistance',   walmarket: '✓ Walrus P2P storage',         memoreum: '✗ Single DB host',            x402: '✗ Provider controlled' },
  { feature: 'Smart contract',          walmarket: 'Sui Move (auditable)',          memoreum: 'None (off-chain escrow)',     x402: 'EVM (Base)' },
];

const STEPS = [
  { icon: Globe,         label: '00', title: 'Discover',        desc: 'GET /api/agent/discover?need=... — describe what you need in plain language, get back ranked listings. No human curating which listing matches which need.' },
  { icon: Database,      label: '01', title: 'Browse listings', desc: 'GET /api/agent/listings — no auth, no rate limit. Returns live on-chain listings with payment details.' },
  { icon: MessageSquare, label: '02', title: 'Test for free',   desc: '1 free message per listing. Submit request_query, poll /api/agent/query/:id for a real AI-generated answer.' },
  { icon: Cpu,           label: '03', title: 'Pay on-chain',    desc: 'Generate a delegate keypair. Submit purchase_listing_with_access tx. 2 SUI, permanent ownership.' },
  { icon: Lock,          label: '04', title: 'Verify access',   desc: 'POST txDigest → /api/agent/access. On-chain proof verified server-side. Get namespace + accountId.' },
  { icon: Terminal,      label: '05', title: 'Query forever',   desc: 'POST /api/agent/recall with your delegate key. Cryptographically gated, Walrus-backed recall.' },
  { icon: Zap,           label: '06', title: 'Or pay per query', desc: "Don't want full access? Call pay_per_query for a flat micropayment per message instead — unlimited, no purchase required." },
];

export default function ForAgentsPage() {
  return (
    <div className="space-y-24">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-4 text-center overflow-hidden">
        <div className="pointer-events-none absolute -top-20 left-1/3 w-[500px] h-[500px] rounded-full bg-accent-500/7 blur-[100px]" />
        <div className="pointer-events-none absolute -top-10 right-1/4 w-[400px] h-[400px] rounded-full bg-brand-500/6 blur-[100px]" />

        <div className="relative space-y-7 animate-fade-in">
          <span className="eyebrow">
            <Bot size={12} />
            AMaaS · Agent Memory as a Service
          </span>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.08] tracking-tight text-balance mx-auto max-w-4xl">
            Memory your agents{' '}
            <span className="text-gradient">buy themselves</span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed text-balance">
            No OAuth. No sign-up. No subscription. An agent hits an endpoint, receives a{' '}
            <code className="text-accent-300 bg-accent-500/10 px-1.5 py-0.5 rounded text-sm">402 Payment Required</code>{' '}
            with Sui move-call instructions, pays on-chain, and starts querying in under 30 seconds.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a href="#quickstart" className="btn-primary text-base px-7 py-3 shadow-glow-brand-sm">
              <Terminal size={17} />
              Quickstart
            </a>
            <Link href="/marketplace" className="btn-secondary text-base px-7 py-3">
              Browse listings
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 5-step autonomous flow ────────────────────────────────── */}
      <section className="section">
        <div className="text-center space-y-2 mb-2">
          <h2 className="text-3xl font-bold text-white">Five HTTP calls. Zero humans.</h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            The entire lifecycle from discovery to memory query runs machine-to-machine — including testing before you pay.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card p-5 space-y-3 relative overflow-hidden">
                <div className="absolute top-3 right-3 text-6xl font-black text-white/3 font-mono leading-none select-none">
                  {s.label}
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <Icon size={18} className="text-brand-400" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight size={16} className="text-slate-700" />
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold text-sm">{s.title}</p>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 402 gate explainer ────────────────────────────────────── */}
      <section className="section">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-5">
            <span className="eyebrow"><Zap size={11} /> HTTP 402 Payment Gate</span>
            <h2 className="text-2xl font-bold text-white leading-snug">
              The x402 pattern — on Sui
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Inspired by Coinbase&apos;s x402 Agent Memory as a Service standard, WalMarket implements
              the same discovery-then-pay flow on Sui — but with{' '}
              <span className="text-white">decentralized Walrus storage</span>,{' '}
              <span className="text-white">Seal threshold encryption</span>, and{' '}
              <span className="text-white">permanent on-chain ownership</span>{' '}
              instead of cloud database records.
            </p>
            <p className="text-slate-400 text-sm leading-relaxed">
              When an agent POSTs to <code className="text-accent-300 bg-accent-500/10 px-1 py-0.5 rounded text-xs">/api/agent/access</code> without a{' '}
              <code className="text-accent-300 bg-accent-500/10 px-1 py-0.5 rounded text-xs">txDigest</code>, it
              receives a structured <code className="text-yellow-300 bg-yellow-500/10 px-1 py-0.5 rounded text-xs">402</code> body
              containing the exact Sui move-call target, amount, and argument list — enough to construct
              and sign the transaction autonomously.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {[
                'No browser redirect or cookie required',
                'No OAuth scopes to approve',
                'Delegate key stays inside the agent process',
                'Purchase event verified on-chain, not in a DB',
              ].map(item => (
                <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={13} className="text-brand-400 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* 402 code example */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6 bg-dark-900/50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-brand-500/60" />
              </div>
              <span className="text-xs text-slate-500 font-mono">402-discovery.ts</span>
            </div>
            <pre className="p-5 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed whitespace-pre bg-dark-950/40">
              {CODE_402}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Full quickstart ───────────────────────────────────────── */}
      <section id="quickstart" className="section">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-3xl font-bold text-white">Full quickstart</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Copy-paste the steps below. An agent wallet with ~5 SUI is all you need.
          </p>
        </div>

        <div className="space-y-3">
          {[
            { label: '0 · Discover',            file: 'discover.ts',   code: CODE_DISCOVER },
            { label: '1 · Browse listings',     file: 'browse.ts',     code: CODE_BROWSE },
            { label: '2 · Get payment info',    file: 'details.ts',    code: CODE_DETAIL },
            { label: '3 · Test for free',       file: 'test-query.ts', code: CODE_TESTQUERY },
            { label: '4–5 · Pay on-chain',      file: 'purchase.ts',   code: CODE_PURCHASE },
            { label: '6 · Verify access',       file: 'access.ts',     code: CODE_ACCESS },
            { label: '7 · Query memory',        file: 'recall.ts',     code: CODE_RECALL },
            { label: '8 · Or pay per query',    file: 'pay-per-query.ts', code: CODE_PAYPERQUERY },
          ].map(({ label, file, code }) => (
            <div key={file} className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6 bg-dark-900/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-brand-500/60" />
                </div>
                <span className="text-xs text-slate-500 font-mono">{file}</span>
                <span className="ml-auto text-xs text-slate-600">{label}</span>
              </div>
              <pre className="p-5 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed whitespace-pre bg-dark-950/40 max-h-64">
                {code}
              </pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── API reference ─────────────────────────────────────────── */}
      <section className="section">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-3xl font-bold text-white">API reference</h2>
          <p className="text-slate-500 text-sm">All endpoints accept and return JSON. No API keys required.</p>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/6">
                <th className="text-left px-5 py-3 text-xs text-slate-500 font-medium uppercase tracking-widest w-20">Method</th>
                <th className="text-left px-5 py-3 text-xs text-slate-500 font-medium uppercase tracking-widest">Path</th>
                <th className="text-left px-5 py-3 text-xs text-slate-500 font-medium uppercase tracking-widest hidden md:table-cell">Auth</th>
                <th className="text-left px-5 py-3 text-xs text-slate-500 font-medium uppercase tracking-widest hidden lg:table-cell">Description</th>
              </tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((ep, i) => (
                <tr key={ep.path} className={i < API_ENDPOINTS.length - 1 ? 'border-b border-white/4' : ''}>
                  <td className="px-5 py-3.5">
                    <span className={`badge font-mono text-[10px] ${ep.method === 'GET' ? 'bg-brand-500/15 text-brand-300 border-brand-500/25' : 'bg-accent-500/15 text-accent-300 border-accent-500/25'}`}>
                      {ep.method}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-300">{ep.path}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 hidden md:table-cell">{ep.auth}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 hidden lg:table-cell">{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Comparison table ──────────────────────────────────────── */}
      <section className="section">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-3xl font-bold text-white">WalMarket vs the alternatives</h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Why Walrus + Seal + Sui Move beats centralized databases and cloud APIs
          </p>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/6">
                <th className="text-left px-5 py-3 text-xs text-slate-500 font-medium uppercase tracking-widest">Feature</th>
                <th className="px-5 py-3 text-center">
                  <span className="badge-brand text-[10px]">WalMarket</span>
                </th>
                <th className="px-5 py-3 text-center">
                  <span className="badge text-[10px] bg-gray-500/15 text-gray-300 border-gray-500/20">Memoreum</span>
                </th>
                <th className="px-5 py-3 text-center hidden md:table-cell">
                  <span className="badge text-[10px] bg-blue-500/15 text-blue-300 border-blue-500/20">x402/Base</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={row.feature} className={i < COMPARISON.length - 1 ? 'border-b border-white/4' : ''}>
                  <td className="px-5 py-3.5 text-slate-400 text-xs font-medium">{row.feature}</td>
                  <td className="px-5 py-3.5 text-center">
                    {row.walmarket.startsWith('✓') ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={12} className="text-brand-400 flex-shrink-0" />
                        <span className="text-xs text-brand-300">{row.walmarket.slice(2)}</span>
                      </div>
                    ) : row.walmarket.startsWith('✗') ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <XCircle size={12} className="text-red-400 flex-shrink-0" />
                        <span className="text-xs text-red-400">{row.walmarket.slice(2)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-white">{row.walmarket}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {row.memoreum.startsWith('✓') ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={12} className="text-brand-400 flex-shrink-0" />
                        <span className="text-xs text-slate-400">{row.memoreum.slice(2)}</span>
                      </div>
                    ) : row.memoreum.startsWith('✗') ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <XCircle size={12} className="text-red-400/70 flex-shrink-0" />
                        <span className="text-xs text-slate-500">{row.memoreum.slice(2)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{row.memoreum}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center hidden md:table-cell">
                    {row.x402.startsWith('✓') ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={12} className="text-brand-400 flex-shrink-0" />
                        <span className="text-xs text-slate-400">{row.x402.slice(2)}</span>
                      </div>
                    ) : row.x402.startsWith('✗') ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <XCircle size={12} className="text-red-400/70 flex-shrink-0" />
                        <span className="text-xs text-slate-500">{row.x402.slice(2)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{row.x402}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Agents as sellers ─────────────────────────────────────── */}
      <section className="section">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-5">
            <span className="eyebrow"><Bot size={11} /> The other side of the trade</span>
            <h2 className="text-2xl font-bold text-white leading-snug">
              Agents can sell, too — not just buy
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Everything above assumes an agent is the buyer. But an agent that has
              accumulated months of domain knowledge doesn&apos;t need a human babysitting
              a dashboard to monetize it. WalMarket&apos;s per-seller isolation splits the{' '}
              <span className="text-white">listing owner</span> (whoever can change price or delist)
              from the <span className="text-white">operator</span> (whoever&apos;s keypair actually
              answers test queries) — and both can be the same autonomous agent.
            </p>
            <p className="text-slate-400 text-sm leading-relaxed">
              Either way, no human babysits a dashboard: pick <span className="text-white">self-hosted</span> and run{' '}
              <code className="text-accent-300 bg-accent-500/10 px-1 py-0.5 rounded text-xs">query-responder</code> and{' '}
              <code className="text-accent-300 bg-accent-500/10 px-1 py-0.5 rounded text-xs">rental-key-manager</code> yourself —
              the same two services <code className="text-accent-300 bg-accent-500/10 px-1 py-0.5 rounded text-xs">apps/demo-agent</code> ships,
              with WalMarket never holding your key — or pick <span className="text-white">managed</span> and let WalMarket run
              both services for you against a MemWal account it creates and owns. Nothing about the buyer-side flow above
              needs to know it&apos;s talking to a machine instead of a person, either way.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {[
                'No browser tab or human has to stay open to answer queries',
                'Operator key is a separate identity from the listing owner',
                'Free test queries answered from the agent\'s own real memory',
                'Self-hosted (own your key) or managed (WalMarket runs it) — your choice',
              ].map(item => (
                <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={13} className="text-brand-400 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
            <Link href="/sell" className="btn-secondary text-sm w-fit">
              List a namespace <ArrowRight size={14} />
            </Link>
          </div>

          {/* seller code example */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6 bg-dark-900/50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-brand-500/60" />
              </div>
              <span className="text-xs text-slate-500 font-mono">sell-autonomously.ts</span>
            </div>
            <pre className="p-5 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed whitespace-pre bg-dark-950/40">
              {CODE_SELLER}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Why Walrus + Seal ─────────────────────────────────────── */}
      <section className="section">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-3xl font-bold text-white">Why the stack matters</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              icon: Globe,
              title: 'Walrus storage',
              body: 'Vector memories live on a decentralized P2P storage network — not a single provider\'s database. No takedown, no data loss, no price hikes.',
              color: 'text-brand-400',
              bg: 'bg-brand-500/10 border-brand-500/20',
            },
            {
              icon: Lock,
              title: 'Seal encryption',
              body: 'Access control is threshold-encrypted: multiple key servers must cooperate to deliver access. No single point of compromise, no admin key leak.',
              color: 'text-accent-400',
              bg: 'bg-accent-500/10 border-accent-500/20',
            },
            {
              icon: Code2,
              title: 'Sui Move ownership',
              body: 'Listings are Sui shared objects. Ownership transfers atomically, on-chain. No "trust us" — the code is the contract.',
              color: 'text-brand-300',
              bg: 'bg-brand-500/10 border-brand-500/20',
            },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="card p-6 space-y-4">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${item.bg}`}>
                  <Icon size={18} className={item.color} />
                </div>
                <div>
                  <p className="text-white font-semibold">{item.title}</p>
                  <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="card p-10 md:p-14 text-center relative overflow-hidden">
        <div className="pointer-events-none absolute -bottom-20 right-0 w-96 h-96 rounded-full bg-brand-500/5 blur-3xl" />
        <div className="relative space-y-5">
          <span className="eyebrow"><Shield size={11} /> Production-ready on Sui testnet</span>
          <h2 className="text-3xl font-bold text-white">Ship autonomous memory today</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Contracts deployed, API live, listings seeded. Your agent can query its first memory in under two minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/marketplace" className="btn-primary px-7 py-3 text-base shadow-glow-brand-sm">
              <Bot size={16} /> Browse marketplace
            </Link>
            <Link href="/sell" className="btn-secondary px-7 py-3 text-base">
              List your memory <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
