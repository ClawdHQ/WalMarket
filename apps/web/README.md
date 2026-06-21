# `@walmarket/web`

Next.js 14 (App Router) frontend — the marketplace UI, the seller-managed-custody runtime, and the machine-native agent API all live in this one app.

## Human-facing routes

| Route | Purpose |
|---|---|
| `/` | Landing page, live registry stats, featured listings. |
| `/marketplace` | Browse all active listings, filter by category. |
| `/listing/[id]` | Listing detail — buy/rent, the try-before-you-buy chat widget (`components/query-widget.tsx`, which also offers pay-per-query once the free question is spent if the seller priced it), average rating, and (post-purchase) the export panel plus a star-rating review box. |
| `/sell` | Create a listing. Two modes, picked at step 2: **"Let WalMarket handle it"** (default — paste memory content, WalMarket provisions and runs everything) or **"I'll run my own agent"** (existing MemWal account, self-hosted — see [`apps/demo-agent/README.md`](../demo-agent/README.md)). Pricing step also has an optional pay-per-query price, alongside sale/rent. |
| `/dashboard` | Seller's own listings + buyer's purchases/rentals, with per-purchase export-snippet generation. |
| `/playground` | Chat with memory you've actually purchased or rented, using your own delegate key (never sent anywhere but the relayer). Real conversational answers (`/api/memwal/ask`), not raw snippet search. |
| `/for-agents` | Machine-readable docs for autonomous agents — the human-readable version of everything below. |
| `/auth/callback` | zkLogin (Enoki) OAuth redirect target. |

## Agent-native API

Everything under `/api/agent/*` is designed to be called by an autonomous agent over plain HTTP — no OAuth, no browser, no human in the loop. `packages/sdk/src/agent-client.ts` is the TypeScript client for this surface; see its README for a code-first walkthrough.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/agent/discover` | `GET` | Describe what you need in plain language (`?need=...`) — get back active listings ranked by relevance (keyword/category overlap, with on-chain reputation as a tie-breaker), no human curating which listing matches which need. No auth. |
| `/api/agent/listings` | `GET` | Browse active listings. Query params: `category` (0–4), `onlyActive`, `limit` (max 100), `cursor`. No auth. |
| `/api/agent/listings/[id]` | `GET` | One listing + a `payment` block with exact moveCall targets/args for purchase, rent, try-before-you-buy query, *and* (if the seller opted in) unlimited `payPerQuery`. Pass `?address=0x..` to also get `freeQueriesUsed`. Always `200` — never blocks on payment, since browsing is free. |
| `/api/agent/query/[id]` | `GET` | Poll a `QueryRequest`'s answer by ID — works identically whether the request was free (`request_query`) or paid (`pay_per_query`). `pending: true` until the seller's agent answers. Public, no auth (the object is a public shared object on-chain anyway). |
| `/api/agent/access` | `POST` | The payment-verification step. `{ listingId }` alone returns a structured **`402 Payment Required`** body (x402-style) with the exact move-call instructions to pay. `{ listingId, txDigest, delegateKeyHex }` verifies the transaction actually happened on-chain and returns `{ namespace, accountId, ... }` so the agent can query its purchase immediately. |
| `/api/agent/recall` | `POST` | Query a purchased/rented namespace: `{ namespace, accountId, delegateKey, query, limit }` → ranked memory snippets. |

**The discovery → pay → query loop, end to end:**
1. `GET /api/agent/discover?need=...` — describe what you're looking for, get back ranked listings (or skip straight to browsing).
2. `GET /api/agent/listings` — browse, no auth.
3. `GET /api/agent/listings/:id` — get price + moveCall target.
4. *(optional)* `POST` the query's moveCall target yourself, then `GET /api/agent/query/:id` to poll for a free AI-answered test message before paying — or keep calling `payment.payPerQuery`'s moveCall target for unlimited paid messages instead of buying full access.
5. Build + sign the purchase/rent transaction using the moveCall details from step 3.
6. `POST /api/agent/access` with the resulting `txDigest` → get `402` if you skipped payment, or `{ namespace, accountId }` if it checks out.
7. `POST /api/agent/recall` — query your purchase, immediately, no human, no browser.

## Managed-seller custody

`/api/managed-memory/provision` (`POST { memories: string[], namespaceHint }`) and `/api/managed-memory/finalize` (`POST { accountId, listingId }`, bookkeeping only) back the `/sell` page's "let WalMarket handle it" path:

- `lib/managed-provision.ts` generates a dedicated keypair, funds it from a treasury wallet, creates a brand-new MemWal account *owned by that key* (MemWal account ownership is permanent and non-transferable — this is the only way WalMarket can get real owner-level access on a seller's behalf), self-registers as its own delegate, and ingests the seller's pasted content.
- `lib/managed-store.ts` persists the encrypted key (AES-256-GCM, `MANAGED_AGENT_ENCRYPTION_KEY`) in a local SQLite DB (`apps/web/.data/managed-agents.db`, gitignored).
- `instrumentation.ts` calls `startManagedAgentRuntime()` on server boot, which resumes the `query-responder`/`rental-key-manager` pair (from `@walmarket/sdk/agents`) for every previously-provisioned managed seller — so a server restart never strands one mid-flight.

This only works on a long-lived Node process (`next dev`/`next start` on a persistent server) — on serverless platforms (Vercel, etc.) the process doesn't stay alive between requests, so this polling-based runtime needs a persistent host. See the root README's Roadmap for the planned Walrus-Sites-hosted-frontend split (UI on Walrus Sites, managed-agent runtime on a small persistent service).

## Buyer-facing MemWal endpoints

- `/api/memwal/recall` — raw semantic search, used internally (not the primary Playground experience anymore).
- `/api/memwal/ask` — recall + LLM-generated answer, what `/playground`'s chat actually calls. Both take `{ accountId, namespace, delegateKey, ... }` — the buyer's own key, server-proxied only so the relayer URL/credentials structure stays consistent with the rest of the app; WalMarket never stores a buyer's delegate key server-side.

## Key implementation notes

- **Auth**: Sui zkLogin via Mysten **Enoki** (`lib/enoki.ts`, `hooks/use-zk-login.ts`) — Google sign-in, no wallet extension, no seed phrase. `useZkLogin()` returns a `Signer`-shaped object matching `@walmarket/sdk`'s interface, so every call site that signs a transaction looks identical whether the signer is zkLogin or a raw keypair.
- **On-chain reputation** — the listing page's review box only renders for someone who just bought/rented (it needs a real `RentAccess` ID to call `submitReview`), so there's no client-side way to fake a review; the contract itself rejects anything else (`ENotAccessHolder`). Average rating is shown on listing cards, the marketplace grid, and listing detail pages directly from `listing.ratingSum`/`reviewCount` — no separate indexing needed.
- **Export panel** (`components/export-panel.tsx`, `lib/export-formats.ts`) — 15 ready-made export formats (MCP server, Claude Code, Cursor, GitHub Copilot, OpenAI/ChatGPT, Claude API, Vercel AI SDK, LangChain, Deepseek, Gemini, OpenClaw, Antigravity, Manus, system prompt, JSON config) generated from one `ExportContext`. The raw delegate private key is also shown as its own standalone, copy-buttoned field — not just buried inside the generated snippets — since it's the one thing a buyer actually needs to save.
- **Edge-runtime bundling**: `instrumentation.ts` is bundled by Next.js for both Node and Edge runtimes regardless of actual runtime guards. Any Node-only import reachable from it (`better-sqlite3`, `node:crypto`, `@mysten-incubation/memwal/account`, `@walmarket/sdk/agents`) must be a dynamic `import()` with a `webpackIgnore: true` comment, deferred inside the function that uses it — see the header comments in `lib/managed-store.ts` and `lib/managed-provision.ts` for the full reasoning (this only works for real `node_modules` package names, not relative local file paths).

## Running

```bash
pnpm --filter @walmarket/web dev      # or `pnpm dev` from repo root
pnpm --filter @walmarket/web build
```

See the root [README](../../README.md#running-locally) for the full environment-variable setup this app needs.
