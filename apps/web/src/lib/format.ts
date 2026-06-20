import { formatDistanceToNow, format } from 'date-fns';
import { isPermanentAccess } from '@walmarket/sdk';

export function formatAddress(addr: string, chars = 6): string {
  if (!addr || addr.length < chars * 2) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

export function formatSui(mist: bigint | number | null): string {
  if (mist === null) return '—';
  const n = Number(mist) / 1_000_000_000;
  return `${n.toFixed(n < 1 ? 4 : 2)} SUI`;
}

export function formatEpochAge(epochMs: number): string {
  if (!epochMs) return 'Unknown';
  return formatDistanceToNow(new Date(epochMs), { addSuffix: true });
}

export function formatEpochDate(epochMs: number): string {
  if (!epochMs) return 'Unknown';
  return format(new Date(epochMs), 'MMM yyyy');
}

export function formatExpiry(ms: number): string {
  if (isPermanentAccess(ms)) return 'Permanent';
  const diff = ms - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export function suiscanTx(digest: string, network = 'testnet'): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}
