import { EnokiFlow, createSessionStorage, createInMemoryStorage } from '@mysten/enoki';

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
export const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? '';
export const ZKLOGIN_CALLBACK_PATH = '/auth/callback';

// Singleton EnokiFlow. Uses sessionStorage in the browser (ephemeral keypair + address
// survive the Google OAuth redirect), falls back to in-memory during SSR. The constructor
// synchronously pre-populates $zkLoginState from the sessionStorage STATE key, so the
// address is available before any effects run.
export const enoki = new EnokiFlow({
  apiKey: ENOKI_API_KEY,
  store: typeof window !== 'undefined' ? createSessionStorage() : createInMemoryStorage(),
});

export function oauthRedirectUri(): string {
  return `${window.location.origin}${ZKLOGIN_CALLBACK_PATH}`;
}
