'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enoki } from '@/lib/enoki';

// Google's OIDC implicit flow redirects here with `#id_token=...` in the URL fragment.
// Enoki's handleAuthCallback() parses the fragment, fetches the zkLogin address from
// Enoki's API, and persists the full session to sessionStorage.
export default function ZkLoginCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        await enoki.handleAuthCallback();
        const { address } = enoki.$zkLoginState.get();
        if (!address) {
          setError('Sign-in did not return an address. Please try again.');
          return;
        }
        router.replace('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to complete sign-in.');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="card p-10 text-center space-y-4 max-w-sm w-full">
        {error ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-red-400 text-xl">✗</span>
            </div>
            <div>
              <p className="text-red-400 text-sm font-medium">Sign-in failed</p>
              <p className="text-slate-500 text-xs mt-1">{error}</p>
            </div>
            <a href="/" className="btn-secondary text-sm inline-flex">Return home</a>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto">
              <span className="text-brand-400 text-xl animate-spin-slow">⟳</span>
            </div>
            <div>
              <p className="text-white font-medium text-sm">Signing you in…</p>
              <p className="text-slate-500 text-xs mt-1">Completing zkLogin with Google</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
