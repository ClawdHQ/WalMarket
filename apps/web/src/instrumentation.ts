import { startManagedAgentRuntime } from './lib/managed-provision';

// Runs once when the Next.js server process boots (see next.config.mjs's
// experimental.instrumentationHook). Boots two independent things:
//
// 1. The operator-of-this-website's own seller agent (query-responder +
//    rental-key-manager), driven by the MEMWAL_* env vars below — same services
//    that normally run as the separate `pnpm agent` process in apps/demo-agent.
//    Appropriate when the web server itself is "the" seller (local dev, a
//    hackathon demo, or a single in-house seller).
//
// 2. The managed-seller runtime: every seller who picked "let WalMarket handle
//    everything" on the Sell page gets their own dedicated, WalMarket-owned
//    MemWal account + keypair (see lib/managed-provision.ts) and their own
//    query-responder/rental-key-manager instance, resumed here on every boot so
//    a server restart doesn't strand anyone mid-flight.
//
// Both only work on a long-lived Node.js server (`next dev` / `next start` on a
// persistent process, e.g. a VPS or Docker container) — on a serverless platform
// (e.g. Vercel) the process doesn't stay alive between requests, so this
// setInterval-based polling won't run reliably.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WALMARKET_DISABLE_INPROCESS_AGENT === '1') return;

  const g = globalThis as typeof globalThis & { __walmarketAgentStarted?: boolean };
  if (g.__walmarketAgentStarted) return;
  g.__walmarketAgentStarted = true;

  await startManagedAgentRuntime();

  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
  const packageId = process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID;
  const registryId = process.env.NEXT_PUBLIC_WALMARKET_REGISTRY_ID;
  const memwalPackageId = process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID;
  const memwalAccountId = process.env.MEMWAL_ACCOUNT_ID;
  const memwalPrivateKey = process.env.MEMWAL_PRIVATE_KEY;
  const memwalRelayerUrl = process.env.MEMWAL_RELAYER_URL;

  if (!packageId || !registryId || !memwalPackageId || !memwalAccountId || !memwalPrivateKey || !memwalRelayerUrl) {
    console.warn(
      '[WalMarket] Seller-agent env vars missing — skipping in-process query responder / rental key manager. ' +
      'Run `pnpm agent` separately if you need them.',
    );
    return;
  }

  // webpackIgnore: this import chain pulls in Node-only modules (crypto, etc.)
  // via @mysten-incubation/memwal. The runtime guard above already keeps this
  // from executing under the Edge runtime, but Next still bundles
  // instrumentation.ts for Edge by default, and that bundling pass can't
  // resolve Node core modules. webpackIgnore skips bundling this import and
  // leaves it as a plain runtime import() that Node resolves from
  // node_modules normally.
  const { startQueryResponder, startRentalKeyManager } = await import(
    /* webpackIgnore: true */ '@walmarket/sdk/agents'
  );

  console.log('[WalMarket] Starting in-process seller agent (query-responder + rental-key-manager)…');

  startQueryResponder({
    network,
    packageId,
    latestPackageId: process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID,
    registryId,
    memwalRelayerUrl,
    agentPrivateKey: memwalPrivateKey,
  });

  startRentalKeyManager({
    network,
    packageId,
    memwalPackageId,
    memwalAccountId,
    memwalPrivateKey,
  });
}
