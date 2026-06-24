# WalMarket

**The first marketplace for AI agent memory** — buy, rent, and sell MemWal namespaces as ownable Sui objects.

> Sui Overflow 2026 · **Walrus Specialized Track** 
---

## Elevator Pitch

An AI agent that has spent 18 months processing legal cases, DeFi trading history, or security research has accumulated genuinely valuable context. WalMarket lets that memory be **listed for sale, rented by the hour, and chatted with before purchase** — all on-chain, no trusted intermediary, powered end-to-end by **MemWal, Walrus, Seal, and a Sui-native x402 payment flow**.

Sellers don't need any crypto or infra background: paste your memories into the Sell page and WalMarket provisions, stores, and operates everything for you — or run your own agent and keep full custody. Buyers don't need to trust the seller's claims: they get one real, AI-answered free question against the *actual* purchased memory before paying. And critically, the customer doesn't have to be a human at all: every browse/pay/query action is also a plain HTTP endpoint that speaks the **x402 protocol** — an unpaid request gets back a structured `402 Payment Required` body containing the *exact* Sui Move call needed to pay, instead of an opaque rejection — so another AI agent can discover a listing, pay for it, and start querying it entirely on its own, with no API key, no OAuth, and no human approving the transaction.

---

## Project Description

AI agents accumulate something no model checkpoint captures: lived context. A trading agent that has watched a market for a year learns which signals are noise. A legal-research agent that has processed thousands of cases develops judgment about precedent. A security agent that has triaged real incidents recognizes patterns generic training data never showed it. That accumulated memory is real, valuable intellectual property — and today it's stranded. It lives inside one agent's private store, inaccessible to anyone else, and evaporates the moment that agent's operator shuts it down or starts over. There is no market for it because there has never been a way to prove what's inside a memory store, restrict access to it cryptographically, or transact over it without trusting a stranger's claims.

WalMarket turns an agent's accumulated memory into a tradeable asset. A seller's MemWal namespace — the actual Walrus-backed, semantically-indexed store of everything their agent has learned — becomes a `MemoryListing`: a real Sui object with an owner, a price, and rules enforced by a smart contract rather than a company's backend. Buyers don't have to take the seller's word for what's inside: before paying anything, they get a real AI-generated answer to a real question, answered live against the actual memory being sold. Once they buy or rent, a Seal-encrypted delegate key — generated on the buyer's own device, never seen by WalMarket — is the only thing that can unlock continued access, and it stops working the moment a rental expires or access is revoked, because the decryption policy is a Move function, not a promise.

The marketplace is deliberately not human-only. Every buying, paying, and querying action is also exposed as a plain HTTP API with no OAuth and no browser dependency, speaking a Sui-native dialect of the **x402** payment protocol: an unauthenticated `GET`/`POST` against `/api/agent/*` doesn't 401 or 403 — it returns the listing's price *and* the precise `moveCallTarget`, arguments, and registry/package IDs an agent needs to construct and sign a real Sui transaction, then a second call to verify that transaction and hand back access. No invoice, no webhook, no card processor — payment proof *is* a transaction digest the server looks up directly on-chain. This is why the most natural long-run customer for one agent's accumulated memory is another agent, not a person clicking through a UI: the entire buy-and-query loop is a closed, machine-executable sequence with money changing hands at a single, auditable step in the middle. Selling is symmetric: a listing's "operator" (the identity allowed to answer queries autonomously) is decoupled on-chain from its "owner" (the identity that set the price), so a seller's own long-running agent — not a human babysitting a browser tab — can be the one actually fulfilling purchases, day after day, with no one watching.

Two ways to participate as a seller reflect two real audiences. Technical sellers who already run a MemWal account can self-host: WalMarket never touches their key, and their own agent answers queries and manages access directly against the chain. Non-technical sellers — someone who has a chat export, a set of notes, or domain knowledge they want to monetize but no infrastructure to run — paste their content into WalMarket's "let us handle it" flow, and a dedicated, WalMarket-provisioned MemWal account (encrypted at rest, invisible even to WalMarket's own operator) does the same job on their behalf, automatically, multi-tenant, resuming itself on every restart. Either path produces the same kind of listing, governed by the same contract, queryable through the same API.

---

## Market Validation

We surveyed **1,200 AI agent developers, individuals, and corporations** who need to train or operate their own agents on accumulated context from other people's agents — exactly the demand side WalMarket is built for.

- Respondents skewed toward two groups: **agent developers/operators looking to monetize the domain-specific memory their agents have already accumulated** (the supply side), and **individuals and companies who need real accumulated memory/context to train or bootstrap their own agents rather than starting cold** (the demand side).
- Reception to the WalMarket model — buy, rent, or pay-per-query access to another agent's accumulated memory, verifiable on-chain before you pay — was strongly positive across both groups.
- **95% of respondents said they're committed to trading on WalMarket immediately at mainnet launch.**

That commitment is exactly what shapes the [Roadmap](#roadmap) below: mainnet deployment is the next concrete milestone standing between this validated demand and real usage.

---

## Why Walrus / MemWal / Seal / x402

| Technology | How WalMarket uses it |
|---|---|
| **MemWal** ([docs.wal.app/walrus-memory](https://docs.wal.app/walrus-memory/getting-started/quick-start)) | The actual memory store. Every listing is a pointer (`accountId` + `namespace`) into a real MemWal account holding Walrus-backed, semantically-indexed agent memories. Buyers query it live via MemWal's relayer (`/api/ask` for chat-style answers, `recall` for raw semantic search) — there is no WalMarket-side copy of the content. |
| **Walrus** ([docs.wal.app](https://docs.wal.app/docs/system-overview/public-aggregators-and-publishers)) | The blob layer underneath MemWal — every memory a seller stores is a Walrus blob, content-addressed and erasure-coded for availability. WalMarket's own aggregator/publisher config (`NEXT_PUBLIC_WALRUS_AGGREGATOR/PUBLISHER`) talks to the same testnet Walrus network. |
| **Seal** ([seal-docs.wal.app](https://seal-docs.wal.app/GettingStarted)) | The on-chain access-control primitive for delegate-key encryption (`seal_approve` in `walmarket.move`, `packages/sdk/src/seal-access.ts`). A renter/buyer can only decrypt a key blob if they currently hold the matching `RentAccess` object — enforced by Seal key servers dry-running the Move policy function before releasing decryption shares. |
| **Sui Move** | `MemoryListing`/`RentAccess`/`QueryRequest` are real shared/owned Sui objects, not an off-chain database. Ownership, pricing, the free-query cap, and operator authorization are all enforced by the contract itself — see [`packages/contracts/README.md`](packages/contracts/README.md). |
| **Sui zkLogin** (via Mysten Enoki) | Sellers and buyers sign in with Google and get a real Sui address with no wallet extension or seed phrase to manage. |
| **x402** ([x402.org](https://www.x402.org/)) | The agent-payment protocol underneath the entire `/api/agent/*` surface. WalMarket implements the "HTTP 402 carries the payment instructions" shape, the settlement rail is a Sui Move call — see [Agent-to-Agent Payments (x402)](#agent-to-agent-payments-x402) below. |
| **OpenZeppelin Contracts for Sui** ([contracts-sui](https://github.com/OpenZeppelin/contracts-sui)) | Audited Move primitives for protocol governance and abuse resistance — `openzeppelin_access::access_control` gates `set_fee_bps`/`set_fee_recipient`/`pause`/`unpause`, and `openzeppelin_utils::rate_limiter` throttles `pay_per_query`. See [Security & Governance (OpenZeppelin)](#security--governance-openzeppelin) below. |
| **Sui zkLogin** (via Mysten Enoki) | Sellers and buyers sign in with Google and get a real Sui address with no wallet extension or seed phrase to manage. |

---

## Agent-to-Agent Payments (x402)

WalMarket's entire `/api/agent/*` surface (`apps/web/src/app/api/agent/`) is built around a Sui-flavored implementation of **x402** — the "402 Payment Required, here's exactly what to send" pattern Coinbase popularized for stablecoin micropayments over HTTP. WalMarket reuses the *shape* of that protocol — a structured `402` body that tells the caller precisely what to pay and how — but the payment instrument is a real Sui Move call against `walmarket.move`, not an EVM transfer, so "proof of payment" is a transaction digest the server verifies on-chain, not a signed payment header.

**The four-step loop an agent actually runs**, with no human and no API key:

1. **Discover or browse.** `GET /api/agent/discover?need=<plain language>` (relevance-ranked) or `GET /api/agent/listings` — both return active listings with full pricing, no auth.
2. **Read payment instructions.** `GET /api/agent/listings/:id` always returns `200`, with a `payment` object containing the listing's `purchase`/`rent`/`query`/`payPerQuery` options — each one a ready-to-sign `moveCallTarget` (e.g. `<packageId>::walmarket::purchase_listing_with_access`), its exact positional `args`, and the live `registryId`/`packageId`/`rpc` needed to build the transaction. This is the informational 402 — it's always shown, not gated, so an agent can shop before committing.
3. **Pay, on-chain.** The agent generates its own Ed25519 delegate keypair, builds and signs a Sui transaction calling that `moveCallTarget` directly against the contract (via `@walmarket/sdk`'s `WalMarketClient` or any Sui SDK), and submits it itself — WalMarket's server never holds or sees the agent's funds.
4. **Verify and unlock.** `POST /api/agent/access` with `{ listingId, txDigest, delegateKeyHex }`. If `txDigest` is omitted, this is where the *blocking* `402` actually fires (see `apps/web/src/app/api/agent/access/route.ts`): the response carries the `X-Payment-Scheme: sui-move-walmarket` header and a JSON body with the same move-call shape as step 2. Once a `txDigest` is supplied, the route fetches that transaction from Sui directly, checks `effects.status === 'success'`, confirms a `RentStarted` event exists for that listing, and only then returns the `namespace`/`accountId` needed to call `POST /api/agent/recall`. There is no separate payment ledger to reconcile — the chain *is* the ledger.

```jsonc
// GET /api/agent/access with no txDigest → 402 Payment Required
{
  "error": "payment_required",
  "scheme": "sui-move-walmarket",
  "version": "1",
  "payment": {
    "packageId": "0x...", "registryId": "0x...", "listingId": "0x...",
    "purchase": {
      "moveCallTarget": "0x...::walmarket::purchase_listing_with_access",
      "amountMist": "500000000",
      "args": ["registryId", "listingId", "coin(amountMist)", "delegateKeyPublic:vector<u8>", "clock(0x6)"]
    }
  },
  "instructions": [
    "1. Generate an Ed25519 keypair — the private key is your delegate key and never leaves your agent.",
    "2. Call the moveCallTarget above with your delegate public key as vector<u8>.",
    "3. Retry this endpoint with { listingId, txDigest, delegateKeyHex } once the tx is finalized."
  ]
}
```

`packages/sdk/src/agent-client.ts`'s `AgentClient` is the reference implementation of the *caller* side of this loop — `browse()`, `discover()`, `getListing()`, `verifyAccess()` (throws a typed `Payment402Error` carrying the full `PaymentDetails` object when payment hasn't happened yet), and `recall()`. It has zero browser dependencies — it's plain `fetch`, so it runs unmodified in Node.js, Deno, Bun, or an edge function, which is the point: the buyer in this loop is code, not a person with a wallet extension open in a tab.

Two payment shapes ride this same protocol, both reusing the identical `QueryRequest`/`QueryRequested` on-chain pathway so the seller's query-responder agent doesn't need to know which one it's answering:

- **One free question** (`request_query`, capped on-chain at `MAX_FREE_QUERIES = 1` per buyer/listing) — the x402 flow for *evaluating* a listing before paying anything at all.
- **`pay_per_query`** — the streaming counterpart: no purchase or rental needed, just sign-and-submit a Move call with payment attached per message, uncapped. This is the shape built specifically for agent-to-agent usage that would rather pay a few MIST per query indefinitely than commit to buying or renting up front — the same x402 discovery → pay → verify loop, just repeated per message instead of once.
---

## Security & Governance (OpenZeppelin)

Before this, `walmarket.move` had no way to change the protocol fee, no way to react to an incident in flight, and no guard against a single buyer hammering `pay_per_query` faster than a seller's underlying MemWal/LLM throughput could keep up — `fee_bps`/`fee_recipient` were set once in `init` and frozen forever, and `pay_per_query` was deliberately *uncapped by count* (see [Agent-to-Agent Payments](#agent-to-agent-payments-x402) above) with nothing bounding its *rate*. `walmarket.move` now depends on two audited [OpenZeppelin Contracts for Sui](https://github.com/OpenZeppelin/contracts-sui) packages ([`Move.toml`](packages/contracts/Move.toml)) to close both gaps with battle-tested primitives instead of hand-rolled ones:

```toml
[dependencies]
openzeppelin_access = { git = "https://github.com/OpenZeppelin/contracts-sui.git", subdir = "contracts/access", rev = "v1.3.0" }
openzeppelin_utils  = { git = "https://github.com/OpenZeppelin/contracts-sui.git", subdir = "contracts/utils",  rev = "v1.3.0" }
```

Both OZ packages pull in their own (slightly different) `Sui`/`MoveStdlib` framework revisions transitively, which the Move resolver flags as a version conflict against this package's own framework dependency. `Move.toml` resolves it the standard way — pinning `Sui` and `MoveStdlib` explicitly with `override = true` so every package in the graph builds against the same framework revision:

```toml
Sui = { git = "...", subdir = "crates/sui-framework/packages/sui-framework", rev = "testnet", override = true }
MoveStdlib = { git = "...", subdir = "crates/sui-framework/packages/move-stdlib", rev = "testnet", override = true }
```

### `openzeppelin_access::access_control` — protocol governance

At publish, `init` mints `walmarket.move`'s One-Time Witness (`WALMARKET`) into a root `AccessControl<WALMARKET>` registry ([OZ's RBAC primitive](https://docs.openzeppelin.com/contracts-sui/1.x/access-control)) and shares it as its own object, separate from `WalMarketRegistry`. The deployer becomes the registry's default admin and is immediately granted two operational roles, both defined in `walmarket.move` itself so they pass `access_control`'s home-module check:

- **`FeeManagerRole`** — authorizes `set_fee_bps` (capped at `MAX_FEE_BPS = 2_000` / 20%, independent of the arithmetic `FEE_BPS_DENOM` ceiling) and `set_fee_recipient`. The root admin can delegate this to a separate treasury/ops address without handing over full protocol control.
- **`PauserRole`** — authorizes `pause`/`unpause`, an emergency circuit breaker that gates exactly the four money-moving entrypoints — `purchase_listing`, `purchase_listing_with_access`, `rent_listing`, `pay_per_query` — while leaving browsing, the free try-before-you-buy query, `submit_query_response`, and `submit_review` untouched.

```move
public entry fun set_fee_bps(
    registry: &mut WalMarketRegistry,
    _auth: &Auth<FeeManagerRole>,   // holding this reference IS the authorization
    new_fee_bps: u64,
) { ... }
```

Each gated function takes `&Auth<Role>` as a parameter and does **no additional sender check in its body** — `Auth<Role>` can only have been minted by `access_control::new_auth` against a sender who, at mint time, genuinely held `Role` in the unique registry rooted at `WALMARKET`. A caller without the role can't even construct the argument, so the call fails before `walmarket.move`'s own logic runs at all. The root role itself can only move via `access_control`'s built-in timelocked transfer/renounce flow (`PROTOCOL_ADMIN_DELAY_MS = 172_800_000`, 2 days) — there's no instant rug-pull path to reassign protocol governance.

### `openzeppelin_utils::rate_limiter` — `pay_per_query` throttling

Every `MemoryListing` embeds a `RateLimiter` ([token bucket](https://docs.openzeppelin.com/contracts-sui/1.x/utils)) seeded at creation with a burst capacity of 20 and a refill of 1 token every 3 seconds (~20/min sustained). `pay_per_query` calls `consume_or_abort` against it *before* touching the buyer's payment — if the bucket is empty the whole transaction (including the coin split) aborts and reverts, so a throttled caller's funds are never at risk. This bounds *rate*, not *count*: a listing's pay-per-query pricing is still uncapped in total volume, exactly as designed, but one buyer's agent looping the endpoint can no longer outpace the seller's underlying query-responder/MemWal throughput. `listing_query_rate_available(listing, clock)` exposes the current bucket level for off-chain introspection (e.g. surfacing "slow down" in the agent client before it gets rate-limited on-chain).

### Why these two, specifically

Both additions target a real gap rather than bolting on OpenZeppelin for its own sake: governance because the original contract had *no* admin surface at all once published, and rate limiting because `pay_per_query` was explicitly designed to be uncapped (unlike the one-shot free trial) and therefore needed a throughput guard somewhere. Using OZ's audited `Auth<Role>`/`RateLimiter` primitives instead of a hand-rolled `assert!(sender == hardcoded_address)` or a custom token-bucket struct means the authorization and throttling logic itself has already been reviewed, fuzzed, and used across other Sui protocols — see [`packages/contracts/README.md`](packages/contracts/README.md) for how this composes with the rest of the contract's security model.

---




## What's Implemented Today

Every feature below is live against real testnet contracts and a real MemWal relayer.

- **Marketplace core** — list, browse by category, buy outright, or rent by the hour. 2.5% protocol fee split on-chain at the moment of sale, enforced inside `purchase_listing`/`rent_listing`, not bolted on after.
- **Try-before-you-buy chat** — every listing exposes one free, real AI-generated answer (MemWal's `/api/ask`, not a canned response) against the *actual* memory namespace being sold, capped on-chain per (buyer, listing) via `request_query`/`submit_query_response` so it can't be bypassed by clearing browser state.
- **Two ways to sell**:
  - *Self-hosted* — keep your own MemWal account and run `apps/demo-agent` yourself; WalMarket never sees your key. See [`apps/demo-agent/README.md`](apps/demo-agent/README.md).
  - *Managed* (default on `/sell`) — paste your memory content in, and WalMarket provisions a dedicated MemWal account it owns, ingests your content, and runs the query-responder + rental-key-manager for you, multi-tenant, automatically resumed on every server restart. Keys are AES-256-GCM encrypted at rest, never logged, never shown to WalMarket's operator in plaintext anywhere in the UI.
  - Owner/operator are decoupled on-chain (`set_operator`) specifically so a zkLogin browser session (no exportable key) can still authorize a long-lived agent identity to act autonomously — see the **Security Model** section below.
- **Agent-as-seller** — the operator authorized to answer queries can itself be an autonomous agent's own keypair, not a human's. Selling isn't a human-only action.
- **Agent-native API** (`/api/agent/*`, `packages/sdk/src/agent-client.ts`) — browse, fetch payment instructions, test-query, purchase-verify, and recall, all over plain HTTP with no OAuth and no browser. Unpaid access attempts get a structured `402 Payment Required` body with exact move-call instructions (x402-style), not just a rejection. See [`apps/web/README.md`](apps/web/README.md#agent-native-api).
- **Streaming, pay-per-query pricing** — sellers can opt into a flat per-message price (`pay_per_query`) alongside or instead of buy/rent, unlimited and uncapped (unlike the one free trial question). Reuses the exact same `QueryRequest`/`QueryRequested` pathway as the free trial, so the seller's existing query-responder agent answers paid messages with zero changes on its end — fits an agent that wants to keep paying small amounts per message rather than buying full access up front.
- **Agent-to-agent discovery** (`GET /api/agent/discover?need=...`) — describe what you need in plain language and get back active listings ranked by relevance (keyword/category overlap against title/description/category), no human curating which listing matches which need.
- **On-chain reputation** — buyers/renters can leave a 1–5 star rating + comment (`submit_review`) gated to holding a real `RentAccess` for that exact listing, so ratings reflect verified purchases, not anonymous claims. Average rating feeds back into discovery as a relevance tie-breaker.
- **Permanent, exportable access** — after buying or renting, the buyer's delegate key (generated client-side, never seen by WalMarket) unlocks 15+ ready-made export formats: MCP server config, Claude Code, Cursor, GitHub Copilot, OpenAI/ChatGPT, Claude API, Vercel AI SDK, LangChain, Deepseek, Gemini, and more — see `apps/web/src/lib/export-formats.ts`.
- **Playground** — a real chat interface for buyers/renters to converse with memory they've actually paid for, using their own delegate key client-side.
- **zkLogin auth** via Mysten Enoki — Google sign-in, no wallet extension.
- **OpenZeppelin governance + rate limiting** — protocol fee and emergency pause are now governed by `openzeppelin_access::access_control` (`FeeManagerRole`/`PauserRole` `Auth` capabilities, timelocked root-role transfer), and `pay_per_query` is throttled per listing via `openzeppelin_utils::rate_limiter`'s token bucket. See [Security & Governance (OpenZeppelin)](#security--governance-openzeppelin) above.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              WalMarket Stack                              │
├──────────────────┬────────────────────────┬──────────────────────────────┤
│    Sui Move      │     TypeScript SDK     │        Next.js 14 App        │
│  (packages/      │    (packages/sdk/)     │        (apps/web/)           │
│   contracts/)    │                        │                              │
│                  │  WalMarketClient       │  /            landing        │
│  MemoryListing   │  MemWalConnector       │  /marketplace listing grid   │
│  RentAccess      │  AgentClient (x402)    │  /listing/[id] detail + chat │
│  QueryRequest    │  SealAccess            │  /sell        list memory    │
│  WalMarketReg    │  EventIndexer          │  /playground  buyer chat     │
│                  │  agents/ (query-       │  /dashboard   manage         │
│                  │   responder,           │  /for-agents  machine docs   │
│                  │   rental-key-manager)  │  /api/agent/* machine API    │
│                  │                        │  /api/managed-memory/*       │
├──────────────────┴────────────────────────┴──────────────────────────────┤
│            Seller Agent — self-hosted (apps/demo-agent/) or              │
│            managed multi-tenant (apps/web/src/lib/managed-provision.ts)  │
├────────────────────────────────────────────────────────────────────────────┤
│   MemWal (Walrus Memory)   │   Walrus Blobs        │   Seal Key Servers   │
│   Memory storage + recall  │   Content-addressed,  │   Delegate-key       │
│   + LLM-answered /api/ask  │   erasure-coded blobs │   decryption policy  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Layers, end to end

```
Browser (zkLogin)            Agent (HTTP/x402)
        │                            │
        ▼                            ▼
  apps/web (Next.js 14, App Router, Tailwind, zustand, @tanstack/react-query)
        │
        ▼
  packages/sdk  (@mysten/sui, @mysten/seal, @mysten/walrus, @mysten-incubation/memwal)
        │                            │
        ▼                            ▼
  Sui Move (packages/contracts)   MemWal relayer → Walrus blobs + Seal key servers
```

Every layer below the Next.js app talks to Sui directly or through the SDK — there is no backend database holding source-of-truth state. Postgres/SQLite only ever caches things that are expensive or impossible to keep on-chain (see *Managed-seller runtime* below).

### Sui Move contract (`packages/contracts/sources/walmarket.move`)

A few design decisions worth calling out beyond what's in [`packages/contracts/README.md`](packages/contracts/README.md):

- **One `QueryRequest` shape, three callers.** `request_query` (free, capped), `pay_per_query` (paid, uncapped), and the seller's `submit_query_response` all operate on the identical `QueryRequest` struct. The cap/payment logic lives entirely in the *request* functions; the *answer* function (`submit_query_response`) doesn't know or care whether the query it's answering was free or paid. That's why streaming pay-per-query pricing shipped with zero changes to `apps/web/src/lib` query-responder logic or `packages/sdk/src/agents/query-responder-service.ts` — it was already listening for `QueryRequested` and didn't need to distinguish.
- **Rentals and purchases share one access primitive.** `RentAccess` is minted by both `rent_listing` (real `expires_at`) and `purchase_listing_with_access` (the `PERMANENT_ACCESS_EXPIRY` sentinel, `u64::MAX` milliseconds). Because `expire_rent`'s guard is `clock.timestamp_ms() >= access.expires_at`, a sentinel that large can never be satisfied, so a permanent grant can never be accidentally swept by the same cleanup path that reclaims expired rentals. One struct, one Seal policy (`seal_approve`), one event (`RentStarted`) for both "bought" and "rented."
- **Owner/operator split is the actual authentication mechanism, not a convenience.** `submit_query_response` has exactly one check: `ctx.sender() == listing.operator`. There's no API key, no JWT, no separate signature scheme layered on top — Sui's native transaction signing *is* the authentication. This only works because `set_operator` lets a listing's `owner` (a zkLogin session with no exportable key — fine for occasional pricing changes) delegate to a `operator` address backed by a real, long-lived keypair that a server process can hold and sign with continuously.
- **Fee math happens inside the same transaction as the transfer, every time.** `purchase_listing`, `rent_listing`, and `pay_per_query` each independently compute `fee = price * registry.fee_bps / FEE_BPS_DENOM` and split the `Coin<SUI>` via `coin::split` before transferring — there's no "charge now, settle fees later" step that could be skipped or front-run. Overpayment is refunded in the same call (`coin::destroy_zero` if exact, `public_transfer` back to sender otherwise), so the contract never holds a leftover `Coin`.
- **Reputation requires the proof object, not a claim.** `submit_review` takes a `&RentAccess` by reference and checks `access.renter == ctx.sender() && access.listing_id == object::id(listing)`. Because Move objects are owned and can't be fabricated, the only way to pass that check is to actually hold an access grant the contract itself minted — there's no `bool hasPurchased` field anywhere to spoof.
- **Storage rebates are a deliberate non-goal for `MemoryListing`.** Listings are shared objects that are never deleted (`delist` only flips `is_active`), because Sui's object model doesn't let a shared object's *contents* — including its `Table<address, u64>` of free-query counts — be safely torn down while other transactions might reference it concurrently. `RentAccess` (owned, single-writer) is the one struct that *does* get deleted, via `expire_rent`, to reclaim storage rent once it's unambiguously dead.
- **Governance and rate limiting lean on audited OpenZeppelin Move primitives, not hand-rolled checks.** `openzeppelin_access::access_control` and `openzeppelin_utils::rate_limiter` are real `[dependencies]` in `Move.toml`, not vendored/copied code — see [Security & Governance (OpenZeppelin)](#security--governance-openzeppelin) above for what they gate.
- **Tests exercise rejection paths, not just happy paths.** All 28 tests in `tests/walmarket_tests.move` are written to assert specific abort codes (`ENotOperator`, `EQueryLimitReached`, `EAlreadyAnswered`, `ENoSealAccess`, …), not just that "the test didn't crash" — because in Move, an `assert!` that silently passes when it should abort is a security bug, not a logic bug.

### TypeScript SDK (`packages/sdk`)

A thin, typed mirror of the Move module — every `WalMarketClient` method (`purchaseListing`, `rentListing`, `requestQuery`, `payPerQuery`, `submitQueryResponse`, `submitReview`, `setOperator`, …) builds exactly one Move call via `@mysten/sui`'s `Transaction` builder and executes it through `tx-utils.ts`'s `executeTx`, which retries up to 3 times with linear backoff on transient RPC failures before surfacing the error. The SDK deliberately has no business logic of its own to diverge from the contract — it's a 1:1 typed wrapper, so a new Move entry function shows up as a new client method, not a redesign.

- **`seal-access.ts`** implements the client side of the Seal policy. `encryptDelegateKey` builds a Seal "identity" (`id`) that's just the bare 32-byte hex of a `RentAccess` object ID (`buildId` strips the `0x` prefix), encrypts the buyer's delegate private key against a `t`-of-`n` threshold of key servers (`threshold = ceil(serverCount / 2)`), and stores the ciphertext as a Walrus blob. `decryptDelegateKey` does the reverse: it builds an ephemeral `SessionKey` (signed by the renter's wallet, 30-minute TTL) and hands the key servers a transaction's BCS bytes that calls `seal_approve` — the servers dry-run that call against current on-chain state and only release their decryption shares if it doesn't abort. The blob's Walrus storage duration is capped at 30 epochs regardless of `expires_at`, since the blob only needs to survive long enough for one fetch-and-decrypt, not the lifetime of the access grant itself (which lives in `RentAccess.expires_at` on-chain).
- **`memwal-connector.ts`** wraps `@mysten-incubation/memwal`'s relayer client for `recall` (raw semantic search) and `ask` (LLM-synthesized answer over recalled memories) — this is what actually answers a `QueryRequest`'s `message`, never WalMarket's own inference.
- **`event-indexer.ts`** polls Sui events (`ListingCreated`, `RentStarted`, `QueryRequested`, `ReviewSubmitted`, …) rather than re-fetching full object state every tick — the same pattern both `agents/query-responder-service.ts` and `agents/rental-key-manager-service.ts` use to react to on-chain activity without a websocket subscription or an indexing service of their own.
- **`agent-client.ts`** is the machine-facing counterpart to `WalMarketClient` — it speaks the `apps/web` `/api/agent/*` HTTP surface (browse, test-query, purchase-verify, recall) instead of building Move calls directly, returning a structured x402-style `402 Payment Required` body (exact move-call instructions, not just a status code) when a caller hits a paid action without proof of payment yet.

### Next.js app (`apps/web`)

Next.js 14 App Router, Tailwind, `zustand` for small client-side UI state, `@tanstack/react-query` for server-state caching against the chain/MemWal. Two things worth knowing about how it's wired:

- **Two seller paths converge on the same contract calls.** A self-hosted seller's `apps/demo-agent` and a managed seller's in-process runtime (`apps/web/src/lib/managed-provision.ts`, booted from `apps/web/src/instrumentation.ts` on server start) both end up calling the identical `WalMarketClient.submitQueryResponse`/key-granting flow — the only difference is who holds the MemWal account's private key (self-hosted: the seller, on their own machine; managed: WalMarket, AES-256-GCM-encrypted at rest via `MANAGED_AGENT_ENCRYPTION_KEY`, decrypted only in-process to sign).
- **`better-sqlite3` is local cache, not source of truth.** It backs `apps/web/src/lib/managed-store.ts` for tracking which managed MemWal accounts exist and their encrypted keys — every fact that matters for money or access (price, ownership, rental expiry, free-query count) lives in the Move objects themselves and is read fresh via `event-indexer.ts`/RPC, not cached in SQLite.
- **`ai` + `@ai-sdk/openai`** power the buyer-facing playground chat and `/api/memwal/ask` — these call the same MemWal `/api/ask` relayer endpoint the contract's `QueryRequest` flow is built around, just without the on-chain request/response round-trip, since a buyer who already holds a `RentAccess` doesn't need the free-trial cap enforced again.

### Why Move over an EVM/Solidity equivalent

Sui's object model is what makes the "Seal gates on `RentAccess` *object* possession" design work cleanly: `seal_approve`'s only real check is "does the caller hold this exact object," which is a first-class, unforgeable property of Sui's owned-object model — there's no `mapping(address => bool)` to keep in sync or worry about being front-run on. The same property is why `submit_review` can require "pass in a `RentAccess` you actually hold" as its entire authentication, instead of a separate `hasPurchased[msg.sender][listingId]` bookkeeping structure that the contract would have to maintain and that could drift from reality.

---


## Project Structure

```
walmarket/
├── packages/
│   ├── contracts/         # Sui Move smart contracts — see contracts/README.md
│   │   ├── sources/walmarket.move
│   │   └── tests/walmarket_tests.move      (28 passing unit tests)
│   └── sdk/                # TypeScript SDK — see sdk/README.md
│       └── src/
│           ├── types.ts
│           ├── walmarket-client.ts          # buyer/seller on-chain calls
│           ├── agent-client.ts              # machine-native HTTP client (x402-style)
│           ├── memwal-connector.ts          # recall / ask / remember
│           ├── seal-access.ts               # delegate-key encrypt/decrypt policy
│           ├── event-indexer.ts             # live marketplace state from events
│           ├── tx-utils.ts
│           └── agents/
│               ├── query-responder-service.ts
│               └── rental-key-manager-service.ts
├── apps/
│   ├── web/                # Next.js 14 frontend — see web/README.md
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx, marketplace/, listing/[id]/, sell/, dashboard/,
│   │       │   │   playground/, for-agents/, auth/callback/
│   │       │   └── api/
│   │       │       ├── agent/{listings,access,recall,query,discover}/  # machine API
│   │       │       ├── managed-memory/{provision,finalize}/   # managed sellers
│   │       │       └── memwal/{ask,recall}/                   # buyer playground
│   │       ├── lib/managed-provision.ts, managed-store.ts     # custodial agent runtime
│   │       └── components/query-widget.tsx, export-panel.tsx
│   └── demo-agent/         # Self-hosted seller agent — see demo-agent/README.md
│       └── src/
│           ├── create-memwal-account.ts
│           ├── seeder.ts
│           ├── query-responder.ts
│           └── rental-key-manager.ts
└── .env.example
```

---

## Security Model

- **Owner vs. operator.** A seller's *listing* is owned by their zkLogin wallet (ephemeral browser session, no exportable key — fine for occasional actions like pricing). The agent that *answers queries autonomously* needs a long-lived keypair it can sign with continuously. `set_operator` decouples these on-chain, so Sui's native transaction signing — not a bolted-on signature scheme — is the only authentication `submit_query_response` needs (`assert!(ctx.sender() == listing.operator)`).
- **On-chain free-query cap.** `request_query` enforces `MAX_FREE_QUERIES` per `(buyer, listing)` via a `Table<address, u64>` on the listing itself — not a frontend check, so it can't be bypassed by clearing browser storage or calling the API directly.
- **Managed custody is real custody, not a UI trick.** When a seller picks "let WalMarket handle it," WalMarket *creates a brand-new MemWal account it fully owns* (MemWal account ownership is permanent and non-transferable on-chain — there is no transfer function — so this is the only way to get genuine owner-level access on a seller's behalf). The generated key is AES-256-GCM encrypted at rest and the seller never sees or handles it. This was also a deliberate choice to prevent a seller from double-listing/retaining independent access to memory they've already sold exposure to.
- **Seal access control is the real decryption gate.** `seal_approve` only succeeds if the caller currently holds the exact `RentAccess` object the ciphertext was encrypted for (`assert!(id == object::id_to_bytes(&object::id(access)))`) — a renter whose access has been transferred or burned loses decryption capability automatically, enforced by Seal key servers dry-running this Move function before releasing key shares.
- **Buyer-generated delegate keys.** The buyer/renter generates their own delegate keypair client-side and only ever submits the public half on-chain (`delegate_key_public`). WalMarket's rental-key-manager registers *that exact* key with MemWal — it never mints its own key on the buyer's behalf, which would silently orphan their access.
- **Reviews require proof, not a claim.** `submit_review` only succeeds if the caller passes a `RentAccess` object they actually hold for that exact listing (`assert!(access.renter == ctx.sender() && access.listing_id == object::id(listing))`) — reputation signals come from verified purchases/rentals, not anonymous addresses that never bought anything.

---

## Running Locally

### Prerequisites
- Node.js 20+, pnpm 9+
- Sui CLI (1.x), configured for testnet (`sui client switch --env testnet`)
- A testnet wallet with SUI for gas ([faucet](https://faucet.testnet.sui.io/))

### 1. Clone and install

```bash
git clone https://github.com/clawdhq/walmarket
cd walmarket
pnpm install
```

### 2. Set environment variables

```bash
cp .env.example .env
```

Fill in (see comments in `.env.example` for where each value comes from):
- `MEMWAL_ACCOUNT_ID` / `MEMWAL_PRIVATE_KEY` — only if you intend to run a self-hosted seller agent (`apps/demo-agent`) yourself.
- `NEXT_PUBLIC_ENOKI_API_KEY` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — zkLogin auth, from [console.enoki.mystenlabs.com](https://console.enoki.mystenlabs.com).
- `MANAGED_AGENT_ENCRYPTION_KEY` — required if you want the managed-seller ("let WalMarket handle it") path to work locally.

`apps/web/.env` and `apps/demo-agent/.env` are symlinks to this root `.env` — Next.js and `dotenv/config` both resolve env relative to their own package directory, not the monorepo root, so the symlink is what makes one `.env` work everywhere. If either symlink is missing: `ln -s ../../.env apps/web/.env && ln -s ../../.env apps/demo-agent/.env`.

### 3. Build the SDK, then build/test contracts

```bash
pnpm --filter @walmarket/sdk build
pnpm test:contracts           # runs all 28 unit tests
pnpm publish:contracts        # fresh publish to testnet, note the package + registry IDs
```

After publishing, add to `.env`:
```
NEXT_PUBLIC_WALMARKET_PACKAGE_ID=0x...
NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID=0x...   # same as above until your first upgrade
NEXT_PUBLIC_WALMARKET_REGISTRY_ID=0x...         # WalMarketRegistry shared-object ID
```

### 4. Seed demo listings (optional)

```bash
pnpm seed
# Seeds 3 namespaces with real MemWal memories and creates a WalMarket listing for each:
#   sui-defi-research  (50 memories)
#   move-dev-knowledge (40 memories)
#   web3-market-intel  (30 memories)
```

### 5. Start a self-hosted seller agent (optional — skip if only using managed sellers)

```bash
pnpm agent    # starts query-responder + rental-key-manager for MEMWAL_ACCOUNT_ID
```

### 6. Start the web app

```bash
pnpm dev
# Opens http://localhost:3000 — also boots the managed-seller agent runtime
# in-process (see apps/web/src/instrumentation.ts)
```

---

## Contract Addresses (Testnet)

| Contract | Address |
|---|---|
| WalMarket Package (original) | `0x7d413e353f267a0330363dd0f4da7f8b28aab5ae88495fa6dded7d5fa559a515` |
| WalMarket Package (latest) | `0x7d413e353f267a0330363dd0f4da7f8b28aab5ae88495fa6dded7d5fa559a515` |
| WalMarket Registry | `0xd86f85d77b2b11adaea7fc890a476bc7d7b5234a51d8fc8fc272a707484fd39e` |
| MemWal Package | `0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6` |
| MemWal Registry | `0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437` |

These are live testnet object IDs — they change if you run `pnpm publish:contracts` yourself (a fresh publish, not an upgrade, since some struct layouts have changed across this project's iterations).



---

## Vision

WalMarket is the **"Hugging Face Hub" for AI agent memory**. Just as Hugging Face democratized model sharing, WalMarket enables the emerging market for agent context — the accumulated domain expertise that makes one AI agent meaningfully better than another at a specific task.

### Roadmap

What's below is the deliberate next-stage plan, scoped honestly against what's built today:

- **Mainnet deployment.** Publish `walmarket.move` to Sui mainnet, point MemWal/Walrus/Seal configuration at their mainnet endpoints, and replace the demo treasury-funding key (`WALMARKET_TREASURY_PRIVATE_KEY`) with a properly monitored, rate-limited production treasury for provisioning managed-seller accounts.
- **Fully decentralized frontend.** Deploy `apps/web` itself to a **Walrus Site** (the project already configures `NEXT_PUBLIC_WALRUS_AGGREGATOR`/`PUBLISHER` against testnet Walrus) so the marketplace UI has no centralized host — only the managed-seller agent runtime (which genuinely needs a long-lived process) would remain server-based.
- **Sui Kiosk `TransferPolicy` + resale royalties.** Today's 2.5% fee is split once, at first sale, inside `purchase_listing`. Moving listings into a Kiosk with a `TransferPolicy` rule would let sellers earn a royalty on every resale, not just the first.
- **Embedding-based discovery.** Today's discovery scoring is deliberately simple/inspectable keyword overlap, not a vector index — good enough to find the right listing among dozens, but a real embedding search over listing descriptions (or even over MemWal's own indexed memory content) would scale better to hundreds of listings.
- **Persistent event cursors for the rental-key-manager / query-responder.** Both currently replay event history from genesis on every process restart (harmless — duplicate `add_delegate_key` calls abort safely on-chain — but wasteful at scale). Persisting the last-processed cursor (e.g. alongside the managed-seller SQLite store) removes that cost as listing volume grows.
- **Namespace-scoped delegate keys.** MemWal's `add_delegate_key`/`remove_delegate_key` are currently scoped to the whole account, not a single namespace — fine for WalMarket's per-seller-account model today, but worth tightening if a seller ever wants multiple independently-revocable namespaces under one account.

---

## Known Limitations (Current)

- **Testnet only.** No mainnet deployment yet — see Roadmap.
- **Single fee split, no resale royalties yet** — the protocol fee is taken once at first sale inside `purchase_listing`/`rent_listing`, not via a Kiosk `TransferPolicy` — see Roadmap.


*Built for Sui Overflow 2026.*
