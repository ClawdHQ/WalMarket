'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@walmarket/sdk';
import { suiClient } from '@/lib/sui-client';
import { enoki, GOOGLE_CLIENT_ID, oauthRedirectUri } from '@/lib/enoki';

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'mainnet';

interface UseZkLoginResult {
  address: string | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: () => Promise<void>;
  logout: () => void;
  signer: Signer | null;
}

export function useZkLogin(): UseZkLoginResult {
  // $zkLoginState is populated synchronously from sessionStorage in the EnokiFlow
  // constructor, so the address (if any) is available before any effect runs.
  const [address, setAddress] = useState<string | null>(
    () => enoki.$zkLoginState.get().address ?? null,
  );
  const [initialized, setInitialized] = useState(
    () => enoki.$zkLoginSession.get().initialized,
  );

  useEffect(() => {
    // listen() (not subscribe()) registers for future changes only — the initial value
    // is already captured above by useState lazy initializers. Subscribing to
    // $zkLoginSession also triggers onMount → getSession(), which reads the encrypted
    // SESSION key from sessionStorage and restores the ephemeral keypair after a reload.
    const unsubState = enoki.$zkLoginState.listen((state) => {
      setAddress(state.address ?? null);
    });
    const unsubSession = enoki.$zkLoginSession.listen((s) => {
      if (s.initialized) setInitialized(true);
    });
    return () => { unsubState(); unsubSession(); };
  }, []);

  const login = useCallback(async () => {
    const url = await enoki.createAuthorizationURL({
      provider: 'google',
      clientId: GOOGLE_CLIENT_ID,
      redirectUrl: oauthRedirectUri(),
      network: NETWORK,
    });
    window.location.href = url;
  }, []);

  const logout = useCallback(() => {
    void enoki.logout();
  }, []);

  const signer = useMemo<Signer | null>(() => {
    if (!address) return null;
    return {
      getAddress: () => address,
      toSuiAddress: () => address,

      signAndExecuteTransaction: async ({ transaction, options }: {
        transaction: Transaction;
        options?: Record<string, boolean>;
      }) => {
        // getKeypair lazily generates the ZK proof via Enoki's API on first call,
        // then caches it in sessionStorage for subsequent transactions.
        const keypair = await enoki.getKeypair({ network: NETWORK });
        transaction.setSenderIfNotSet(address);
        const txBytes = await transaction.build({ client: suiClient });
        // signTransaction returns a full zkLogin signature (ephemeral sig + proof + address seed).
        const { signature } = await keypair.signTransaction(txBytes);

        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true, showEvents: true, ...options },
        });

        return {
          digest: result.digest,
          effects: result.effects ?? undefined,
          events: result.events ?? undefined,
        };
      },

      signPersonalMessage: async (message: Uint8Array) => {
        const keypair = await enoki.getKeypair({ network: NETWORK });
        const { signature } = await keypair.signPersonalMessage(message);
        return { signature };
      },
    };
  }, [address]);

  return {
    address,
    isAuthenticated: signer !== null,
    isReady: initialized,
    login,
    logout,
    signer,
  };
}
