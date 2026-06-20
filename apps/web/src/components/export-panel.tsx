'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { Copy, Check, Download, Code2, FileText, MessageSquare } from 'lucide-react';
import { EXPORT_FORMATS, GROUP_LABELS, type ExportContext, type ExportFormat } from '@/lib/export-formats';
import { MEMWAL_RELAYER_URL } from '@/lib/constants';

interface ExportPanelProps {
  context: Omit<ExportContext, 'relayerUrl'>;
}

const GROUP_ORDER: ExportFormat['group'][] = ['file', 'code', 'prompt'];

const GROUP_ICONS: Record<ExportFormat['group'], React.ReactNode> = {
  file: <FileText size={12} />,
  code: <Code2 size={12} />,
  prompt: <MessageSquare size={12} />,
};

export function ExportPanel({ context }: ExportPanelProps) {
  const [selected, setSelected] = useState<string>(EXPORT_FORMATS[0].id);
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const ctx: ExportContext = { ...context, relayerUrl: MEMWAL_RELAYER_URL };
  const fmt = EXPORT_FORMATS.find(f => f.id === selected)!;
  const content = fmt.generate(ctx);

  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    label: GROUP_LABELS[g],
    icon: GROUP_ICONS[g],
    formats: EXPORT_FORMATS.filter(f => f.group === g),
  }));

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function handleCopyKey() {
    navigator.clipboard.writeText(context.privateKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1600);
  }

  function handleDownload() {
    const filename = fmt.filename ?? `walmarket-export.txt`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/6 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Code2 size={15} className="text-brand-400" />
            Export Memory
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Plug <span className="text-brand-400 font-mono text-[11px]">{context.namespace}</span> into any agent framework
          </p>
        </div>
        <div className="text-xs text-slate-500 font-tabular">
          {context.memoryCount > 0 && <span>{context.memoryCount.toLocaleString()} memories</span>}
        </div>
      </div>

      {/* Delegate private key — shown once, save it now. Don't make people dig
          for it inside a code snippet to find the one thing they actually need
          to paste into Playground/Dashboard later. */}
      <div className="px-6 py-3 border-b border-white/6 bg-yellow-500/[0.04] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-yellow-500/80 font-medium">Your delegate private key — save this now</p>
          <p className="font-mono text-xs text-slate-300 truncate mt-0.5">{context.privateKey}</p>
        </div>
        <button
          onClick={handleCopyKey}
          className={clsx(
            'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0',
            keyCopied
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              : 'bg-white/8 hover:bg-white/15 text-slate-300',
          )}
        >
          {keyCopied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy key</>}
        </button>
      </div>

      <div className="flex divide-x divide-white/6">
        {/* Platform sidebar */}
        <div className="w-44 shrink-0 py-4 space-y-5 overflow-y-auto max-h-96">
          {grouped.map(({ group, label, icon, formats }) => (
            <div key={group}>
              <div className="flex items-center gap-1.5 px-4 mb-1.5 text-[10px] uppercase tracking-widest text-slate-600 font-medium">
                {icon}
                {label}
              </div>
              {formats.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelected(f.id); setCopied(false); }}
                  className={clsx(
                    'w-full text-left px-4 py-1.5 text-xs transition-all duration-150',
                    selected === f.id
                      ? 'text-brand-300 bg-brand-500/12 border-r-2 border-brand-500'
                      : 'text-slate-400 hover:text-white hover:bg-white/4',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Code preview */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/6 bg-dark-900/50">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-brand-500/60" />
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {fmt.filename ?? (fmt.language === 'python' ? 'snippet.py' : fmt.language ? 'snippet.ts' : 'output.txt')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {fmt.filename && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
                >
                  <Download size={11} />
                  Download
                </button>
              )}
              <button
                onClick={handleCopy}
                className={clsx(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all',
                  copied
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'bg-white/8 hover:bg-white/15 text-slate-300',
                )}
              >
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
          </div>

          {/* Code content */}
          <pre className="p-5 text-xs text-slate-300 font-mono overflow-auto max-h-80 leading-relaxed whitespace-pre-wrap break-all flex-1 bg-dark-950/30">
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
}
