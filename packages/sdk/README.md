# `@walmarket/sdk`

TypeScript SDK shared by `apps/web` and `apps/demo-agent` (and usable by any third-party agent or app talking to a WalMarket deployment). Workspace package — `pnpm --filter @walmarket/sdk build` before anything that imports it.

## Modules

### `WalMarketClient` (`walmarket-client.ts`)

The on-chain client — every method either reads a `MemoryListing`/`RentAccess`/`QueryRequest` or builds+signs a transaction calling into `walmarket.move`. Takes a `Signer` (a small structural interface — see below — satisfied by a raw `Ed25519Keypair` wrapper, a zkLogin/Enoki signer, or anything else that can sign a `Transaction`).

```ts
import { WalMarketClient } from '@walmarket/sdk';

const client = new WalMarketClient({
  network: 'testnet',
  packageId: process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID!,
  latestPackageId: process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID,
  registryId: process.env.NEXT_PUBLIC_WALMARKET_REGISTRY_ID!,
});

const listings = await client.getAllListings({ onlyActive: true });
const { digest, listingId } = await client.createListing(signer, { ...params });
await client.setOperator(signer, listingId, agentAddress);
```

Key methods: `getAllListings`, `getListingById`, `getMyListings`, `getMyRentals`, `createListing`, `updatePricing`, `setOperator`, `delist`, `purchaseListing`, `purchaseListingWithAccess`, `rentListing`, `confirmRent`, `expireRent`, `requestQuery`, `payPerQuery`, `submitQueryResponse`, `getQueryResponse`, `getFreeQueriesUsed`, `submitReview`, `getReviewsForListing`, `getRegistryStats`.

`payPerQuery(signer, listingId, message, priceMist)` is the streaming/unlimited counterpart to `requestQuery` — pays `listing.pricePerQueryMist` per message instead of relying on the one free trial, reusing the exact same `QueryRequest`/`QueryRequested` pathway so `startQueryResponder` (below) answers it identically. `submitReview(signer, listingId, accessId, rating, comment)` only succeeds if `accessId` is a `RentAccess` the signer actually holds for that listing — see `packages/contracts/README.md`'s `ENotAccessHolder`.

**Dual package-ID pattern**: `packageId` (original — required for event/struct type queries, since Sui ties type identity to the *defining* package forever) vs. `latestPackageId` (changes on every `sui client upgrade` — required for moveCall targets needing post-upgrade function behavior). See [`packages/contracts/README.md`](../contracts/README.md#deploying).

### `MemWalConnector` (`memwal-connector.ts`)

Thin wrapper over `@mysten-incubation/memwal`'s `MemWal.create()` factory — the actual integration point with MemWal's relayer.

```ts
import { MemWalConnector } from '@walmarket/sdk';

const connector = new MemWalConnector({ accountId, namespace, relayerUrl, privateKey });
await connector.remember('Cetus is the leading concentrated-liquidity DEX on Sui.');
const { answer, memoriesUsed } = await connector.ask('What DEX has the deepest SUI/USDC pool?', namespace, accountId);
const results = await connector.recall('SUI/USDC liquidity', 5); // raw ranked snippets, not an LLM answer
```

`ask()` calls the relayer's `/api/ask` (recall + LLM-generated answer) by reaching into the underlying client's internal `signedRequest` method — the installed SDK version (0.0.7) hasn't added a public wrapper for that endpoint yet, but `signedRequest` is the same proven signing/Seal-session path every other public method already uses, so this reuses it rather than reimplementing SEAL session signing from scratch (see the comment in the source for the full reasoning). `static generateDelegateKey()` produces the keypair a buyer/renter generates client-side at purchase/rental time.

### `AgentClient` (`agent-client.ts`)

A zero-dependency, fetch-only client for **autonomous agents** — no browser APIs, works in Node/Deno/Bun/Edge. This is the machine-facing counterpart to the human-facing web UI, hitting `apps/web`'s `/api/agent/*` routes.

```ts
import { AgentClient, Payment402Error } from '@walmarket/sdk';

const client = new AgentClient({ baseUrl: 'https://walmarket.app' });
const { listings } = await client.browse({ category: 1 });

try {
  await client.verifyAccess({ listingId: listings[0].id });
} catch (e) {
  if (e instanceof Payment402Error) {
    // e.payment has the exact moveCall target, args, and amount needed —
    // build + sign your own Sui tx, then retry verifyAccess with the txDigest.
  }
}
```

This is the x402-style pattern: an unpaid request doesn't just fail, it returns structured payment instructions an agent can act on programmatically. See [`apps/web/README.md`](../../apps/web/README.md#agent-native-api) for the full endpoint list and a 7-step worked example.

`AgentClient.discover({ need, limit })` is the agent-to-agent discovery layer — describe what you need in plain language and get back active listings ranked by relevance (`SerializedListing & { relevanceScore }`), with each listing's `averageRating`/`reviewCount` included so an agent can weigh reputation alongside relevance itself. `PaymentDetails.payPerQuery` (on the result of `getListing`) is the streaming-pricing counterpart to `PaymentDetails.query` — `null` if the seller hasn't opted in, otherwise the move-call details for unlimited pay-per-message access.

### `SealAccess` (`seal-access.ts`)

Encrypts/decrypts delegate-key blobs under the on-chain `seal_approve` policy — a renter/buyer can only decrypt if they currently hold the matching `RentAccess` object. See `walmarket.move`'s `seal_approve` for the Move side of this policy.

### `EventIndexer` (`event-indexer.ts`)

Polls `ListingCreated`/`ListingSold`/`ListingDelisted`/etc. and maintains an in-memory `MemoryListing[]` cache — what both the web app's marketplace page and the agent-native `/api/agent/listings` endpoint actually read from, instead of re-querying every object on every request.

### `agents/` — long-running seller services

- **`startQueryResponder(config)`** — listens for `QueryRequested`, calls `MemWalConnector.ask()` against the seller's namespace, then signs `submit_query_response` with the agent's own keypair. Filters events to its own listing's `operator` before acting (the global event stream carries every seller's queries, not just this agent's).
- **`startRentalKeyManager(config)`** — listens for `RentStarted`/`RentExpired`, registers/revokes the buyer's `delegate_key_public` with MemWal. Polls from an in-memory cursor that resets on restart (replays full event history — harmless, since duplicate `add_delegate_key` calls abort safely on-chain, but see the root README's Roadmap for the planned fix).

Both are used identically by `apps/demo-agent` (self-hosted, one seller's `.env`) and `apps/web/src/lib/managed-provision.ts` (managed, multi-tenant — one instance per WalMarket-provisioned seller account, all in the same Node process).

### `types.ts` / `tx-utils.ts`

Shared types (`MemoryListing`, `RentAccess`, `RecallResult`, `isPermanentAccess`, …) and small transaction-building helpers used across the other modules.

## Building

```bash
pnpm --filter @walmarket/sdk build
```

Required before `apps/web` or `apps/demo-agent` can resolve `@walmarket/sdk` — `package.json`'s `main`/`exports` point at `./dist/`, which doesn't exist until this runs. If you see `Module not found: Can't resolve '@walmarket/sdk'`, this is almost always why.
