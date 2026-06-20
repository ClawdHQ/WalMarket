'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { formatAddress } from '@/lib/format';

export function CopyableAddress({ address, className }: { address: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button onClick={handleCopy} title={copied ? 'Copied!' : `Copy ${address}`} className={clsx('font-mono transition-colors', className)}>
      {copied ? 'Copied!' : formatAddress(address)}
    </button>
  );
}
