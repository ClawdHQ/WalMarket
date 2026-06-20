'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, ListPlus, ShoppingBag, Terminal, Wallet, LogOut, Copy, Check, ExternalLink, Menu, X, ChevronDown, Zap, Bot } from 'lucide-react';
import { clsx } from 'clsx';
import { useZkLogin } from '@/hooks/use-zk-login';
import { suiClient } from '@/lib/sui-client';
import { formatAddress, formatSui } from '@/lib/format';
import { Logo } from '@/components/logo';

const NAV_LINKS = [
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/sell', label: 'List Memory', icon: ListPlus },
  { href: '/playground', label: 'Playground', icon: Terminal },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/for-agents', label: 'For Agents', icon: Bot },
];

const IS_TESTNET = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') !== 'mainnet';

function WalletMenu({ address, onLogout }: { address: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    suiClient
      .getBalance({ owner: address })
      .then(res => setBalance(formatSui(BigInt(res.totalBalance))))
      .catch(() => setBalance('—'));
  }, [open, address]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-mono transition-all duration-200',
          open
            ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-brand-500/10 hover:border-brand-500/30 hover:text-brand-300',
        )}
      >
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-accent-500 flex-shrink-0" />
        {formatAddress(address)}
        <ChevronDown size={12} className={clsx('transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 card overflow-hidden z-50 animate-fade-in">
          {/* Balance section */}
          <div className="px-4 py-3 border-b border-white/6">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-medium">Balance</p>
            <p className="text-lg font-bold text-white font-tabular">
              {balance === null ? <span className="text-slate-500 text-sm">Loading…</span> : balance}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="live-dot w-1.5 h-1.5" style={{ width: 6, height: 6 }} />
              <span className="text-[10px] text-brand-500 font-mono">Sui Testnet</span>
            </div>
          </div>

          {/* Address */}
          <button
            onClick={handleCopy}
            className="w-full px-4 py-3 text-left hover:bg-white/4 transition-colors border-b border-white/6 group"
          >
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-medium">Address</p>
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-slate-300 group-hover:text-white transition-colors">
                {address.slice(0, 10)}…{address.slice(-8)}
              </p>
              {copied
                ? <Check size={12} className="text-brand-400 flex-shrink-0" />
                : <Copy size={12} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />}
            </div>
          </button>

          {/* Faucet */}
          {IS_TESTNET && (
            <a
              href={`https://faucet.testnet.sui.io/?address=${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-4 py-2.5 text-xs transition-colors border-b border-white/6 hover:bg-white/4"
              onClick={() => setOpen(false)}
            >
              <div className="flex items-center gap-2">
                <Zap size={12} className="text-brand-400" />
                <span className="text-brand-400 font-medium">Get testnet SUI</span>
              </div>
              <ExternalLink size={11} className="text-slate-600" />
            </a>
          )}

          {/* Sign out */}
          <button
            onClick={() => { onLogout(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleSignInButton() {
  const { address, isAuthenticated, login, logout } = useZkLogin();

  if (isAuthenticated && address) {
    return <WalletMenu address={address} onLogout={logout} />;
  }

  return (
    <button
      onClick={() => void login()}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all duration-200 shadow-sm hover:shadow-md"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.96 11.96 0 0 0 0 12c0 1.93.46 3.76 1.29 5.38z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
      </svg>
      Sign in with Google
    </button>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-dark-950/90 backdrop-blur-xl border-b border-white/6 shadow-lg shadow-black/20'
          : 'bg-dark-950/60 backdrop-blur-md border-b border-white/4',
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
          <Logo size={28} className="rounded-lg shadow-glow-brand-sm" />
          <span className="font-bold text-lg tracking-tight text-white group-hover:text-brand-300 transition-colors">
            WalMarket
          </span>
          {IS_TESTNET && (
            <span className="hidden sm:inline-block text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-amber-400 leading-none">
              TESTNET
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map(link => {
            const Icon = link.icon;
            const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-brand-500/15 text-brand-300 border border-brand-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/5',
                )}
              >
                <Icon size={14} />
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <GoogleSignInButton />
          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/6 bg-dark-950/95 backdrop-blur-xl animate-slide-up">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            {NAV_LINKS.map(link => {
              const Icon = link.icon;
              const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                    active
                      ? 'bg-brand-500/15 text-brand-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  <Icon size={16} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
