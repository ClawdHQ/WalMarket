'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { MessageSquare, Loader2, AlertCircle, Send, Sparkles, ShoppingCart } from 'lucide-react';
import { QUERY_TIMEOUT_MS, MAX_FREE_QUERIES } from '@/lib/constants';
import { getWalMarketClient } from '@/lib/sui-client';
import { useZkLogin } from '@/hooks/use-zk-login';

interface Turn {
  message: string;
  answer: string | null;
  failed?: boolean;
}

export function QueryWidget({ listingId }: { listingId: string }) {
  const { address, signer } = useZkLogin();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    if (!address) return;
    getWalMarketClient().getFreeQueriesUsed(listingId, address).then(setUsed).catch(() => setUsed(null));
  }, [address, listingId]);

  const capReached = used !== null && used >= MAX_FREE_QUERIES;

  async function sendMessage() {
    const message = input.trim();
    if (!signer || !address) { setError('Sign in with Google to ask this memory a question'); return; }
    if (!message) return;
    if (capReached) return;

    setInput('');
    setError(null);
    setLoading(true);
    const turnIndex = turns.length;
    setTurns(prev => [...prev, { message, answer: null }]);

    try {
      const client = getWalMarketClient();
      const { queryId } = await client.requestQuery(signer, listingId, message);
      setUsed(u => (u ?? 0) + 1);

      const start = Date.now();
      while (Date.now() - start < QUERY_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 2200));
        const { answer } = await client.getQueryResponse(queryId);
        if (answer !== null) {
          setTurns(prev => prev.map((t, i) => (i === turnIndex ? { ...t, answer } : t)));
          setLoading(false);
          return;
        }
      }
      setTurns(prev => prev.map((t, i) => (i === turnIndex ? { ...t, failed: true } : t)));
      setError('Seller agent offline — no answer yet. Try again later.');
    } catch (e) {
      setTurns(prev => prev.map((t, i) => (i === turnIndex ? { ...t, failed: true } : t)));
      setError(e instanceof Error ? e.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
            <MessageSquare size={14} className="text-accent-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Ask the memory</h3>
            <p className="text-slate-500 text-[11px]">Chat with this namespace before you buy</p>
          </div>
        </div>
        {used !== null && (
          <span className={clsx('badge text-[10px]', capReached ? 'badge-red' : 'badge-gray')}>
            {Math.min(used, MAX_FREE_QUERIES)}/{MAX_FREE_QUERIES} free
          </span>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-3 overflow-y-auto max-h-72 min-h-[80px]">
        {turns.length === 0 && (
          <p className="text-slate-600 text-xs text-center py-6">
            Ask a real question — you'll get a real AI-generated answer from this seller's memory.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5 animate-fade-in">
            <div className="flex justify-end">
              <p className="bg-accent-500/15 text-accent-100 text-xs rounded-xl rounded-br-sm px-3 py-2 max-w-[85%]">
                {t.message}
              </p>
            </div>
            <div className="flex justify-start">
              {t.answer ? (
                <p className="bg-white/5 text-slate-200 text-xs rounded-xl rounded-bl-sm px-3 py-2 max-w-[85%] leading-relaxed">
                  {t.answer}
                </p>
              ) : t.failed ? (
                <p className="text-red-400 text-xs flex items-center gap-1.5 px-1">
                  <AlertCircle size={11} /> No answer received
                </p>
              ) : (
                <p className="text-slate-500 text-xs flex items-center gap-1.5 px-1">
                  <Loader2 size={11} className="animate-spin" /> Waiting for seller's agent…
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Cap reached CTA */}
      {capReached ? (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/8 p-3 text-center space-y-1">
          <p className="text-xs text-slate-300">You've used all {MAX_FREE_QUERIES} free questions for this listing.</p>
          <p className="text-[11px] text-brand-400 flex items-center justify-center gap-1">
            <ShoppingCart size={11} /> Buy to keep chatting with full access
          </p>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            className="input h-9 text-sm flex-1"
            placeholder="Ask something this memory might know…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) void sendMessage(); }}
            disabled={loading}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={loading || !signer || !input.trim()}
            className="btn-accent px-3"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      )}

      {!signer && (
        <p className="text-center text-xs text-slate-500">Sign in with Google to ask a question</p>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-xs leading-relaxed">{error}</p>
        </div>
      )}

      {turns.length === 0 && !error && (
        <p className="text-slate-600 text-[10px] text-center flex items-center justify-center gap-1">
          <Sparkles size={10} /> Answers are AI-generated from the seller's real memory, signed on-chain
        </p>
      )}
    </div>
  );
}
