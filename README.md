# WalMarket

**The first marketplace for AI agent memory** — buy, rent, and sell MemWal namespaces as ownable Sui objects.

> Sui Overflow 2026 · **Walrus Specialized Track** · Prize Target: 1st Place ($35,000)

---

## Elevator Pitch

An AI agent that has spent 18 months processing legal cases, DeFi trading history, or security research has accumulated genuinely valuable context. WalMarket lets that memory be **listed for sale, rented by the hour, and chatted with before purchase** — all on-chain, no trusted intermediary, powered end-to-end by **MemWal, Walrus, and Seal** on Sui.

Sellers don't need any crypto or infra background: paste your memories into the Sell page and WalMarket provisions, stores, and operates everything for you — or run your own agent and keep full custody. Buyers don't need to trust the seller's claims: they get one real, AI-answered free question against the *actual* purchased memory before paying. And other AI agents — not just humans — can browse, pay, and query the marketplace entirely over HTTP, with an x402-style payment-required flow built for machine callers.

---

## Why Walrus / MemWal / Seal

This is a **Walrus Specialized Track** submission, and the integration is load-bearing, not decorative — remove any one of these three and the product stops working:

| Technology | How WalMarket uses it |
|---|---|
| **MemWal** ([docs.wal.app/walrus-memory](https://docs.wal.app/walrus-memory/getting-started/quick-start)) | The actual memory store. Every listing is a pointer (`accountId` + `namespace`) into a real MemWal account holding Walrus-backed, semantically-indexed agent memories. Buyers query it live via MemWal's relayer (`/api/ask` for chat-style answers, `recall` for raw semantic search) — there is no WalMarket-side copy of the content. |
| **Walrus** ([docs.wal.app](https://docs.wal.app/docs/system-overview/public-aggregators-and-publishers)) | The blob layer underneath MemWal — every memory a seller stores is a Walrus blob, content-addressed and erasure-coded for availability. WalMarket's own aggregator/publisher config (`NEXT_PUBLIC_WALRUS_AGGREGATOR/PUBLISHER`) talks to the same testnet Walrus network. |
| **Seal** ([seal-docs.wal.app](https://seal-docs.wal.app/GettingStarted)) | The on-chain access-control primitive for delegate-key encryption (`seal_approve` in `walmarket.move`, `packages/sdk/src/seal-access.ts`). A renter/buyer can only decrypt a key blob if they currently hold the matching `RentAccess` object — enforced by Seal key servers dry-running the Move policy function before releasing decryption shares. |
| **Sui Move** | `MemoryListing`/`RentAccess`/`QueryRequest` are real shared/owned Sui objects, not an off-chain database. Ownership, pricing, the free-query cap, and operator authorization are all enforced by the contract itself — see [`packages/contracts/README.md`](packages/contracts/README.md). |
| **Sui zkLogin** (via Mysten Enoki) | Sellers and buyers sign in with Google and get a real Sui address with no wallet extension or seed phrase to manage. |

---

## What's Implemented Today

This is not a mockup — every feature below is live against real testnet contracts and a real MemWal relayer.

- **Marketplace core** — list, browse by category, buy outright, or rent by the hour. 2.5% protocol fee split on-chain at the moment of sale, enforced inside `purchase_listing`/`rent_listing`, not bolted on after.
- **Try-before-you-buy chat** — every listing exposes one free, real AI-generated answer (MemWal's `/api/ask`, not a canned response) against the *actual* memory namespace being sold, capped on-chain per (buyer, listing) via `request_query`/`submit_query_response` so it can't be bypassed by clearing browser state.
- **Two ways to sell**:
  - *Self-hosted* — keep your own MemWal account and run `apps/demo-agent` yourself; WalMarket never sees your key. See [`apps/demo-agent/README.md`](apps/demo-agent/README.md).
  - *Managed* (default on `/sell`) — paste your memory content in, and WalMarket provisions a dedicated MemWal account it owns, ingests your content, and runs the query-responder + rental-key-manager for you, multi-tenant, automatically resumed on every server restart. Keys are AES-256-GCM encrypted at rest, never logged, never shown to WalMarket's operator in plaintext anywhere in the UI.
  - Owner/operator are decoupled on-chain (`set_operator`) specifically so a zkLogin browser session (no exportable key) can still authorize a long-lived agent identity to act autonomously — see the **Security Model** section below.
- **Agent-as-seller** — the operator authorized to answer queries can itself be an autonomous agent's own keypair, not a human's. Selling isn't a human-only action.
- **Agent-native API** (`/api/agent/*`, `packages/sdk/src/agent-client.ts`) — browse, fetch payment instructions, test-query, purchase-verify, and recall, all over plain HTTP with no OAuth and no browser. Unpaid access attempts get a structured `402 Payment Required` body with exact move-call instructions (x402-style), not just a rejection. See [`apps/web/README.md`](apps/web/README.md#agent-native-api).
- **Permanent, exportable access** — after buying or renting, the buyer's delegate key (generated client-side, never seen by WalMarket) unlocks 15+ ready-made export formats: MCP server config, Claude Code, Cursor, GitHub Copilot, OpenAI/ChatGPT, Claude API, Vercel AI SDK, LangChain, Deepseek, Gemini, and more — see `apps/web/src/lib/export-formats.ts`.
- **Playground** — a real chat interface (not raw snippet search) for buyers/renters to converse with memory they've actually paid for, using their own delegate key client-side.
- **zkLogin auth** via Mysten Enoki — Google sign-in, no wallet extension.

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

---

## Project Structure

```
walmarket/
├── packages/
│   ├── contracts/         # Sui Move smart contracts — see contracts/README.md
│   │   ├── sources/walmarket.move
│   │   └── tests/walmarket_tests.move      (22 passing unit tests)
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
│   │       │       ├── agent/{listings,access,recall,query}/  # machine API
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

A few design decisions worth a judge's attention, because they're the parts that are easy to get wrong:

- **Owner vs. operator.** A seller's *listing* is owned by their zkLogin wallet (ephemeral browser session, no exportable key — fine for occasional actions like pricing). The agent that *answers queries autonomously* needs a long-lived keypair it can sign with continuously. `set_operator` decouples these on-chain, so Sui's native transaction signing — not a bolted-on signature scheme — is the only authentication `submit_query_response` needs (`assert!(ctx.sender() == listing.operator)`).
- **On-chain free-query cap.** `request_query` enforces `MAX_FREE_QUERIES` per `(buyer, listing)` via a `Table<address, u64>` on the listing itself — not a frontend check, so it can't be bypassed by clearing browser storage or calling the API directly.
- **Managed custody is real custody, not a UI trick.** When a seller picks "let WalMarket handle it," WalMarket *creates a brand-new MemWal account it fully owns* (MemWal account ownership is permanent and non-transferable on-chain — there is no transfer function — so this is the only way to get genuine owner-level access on a seller's behalf). The generated key is AES-256-GCM encrypted at rest and the seller never sees or handles it. This was also a deliberate choice to prevent a seller from double-listing/retaining independent access to memory they've already sold exposure to.
- **Seal access control is the real decryption gate.** `seal_approve` only succeeds if the caller currently holds the exact `RentAccess` object the ciphertext was encrypted for (`assert!(id == object::id_to_bytes(&object::id(access)))`) — a renter whose access has been transferred or burned loses decryption capability automatically, enforced by Seal key servers dry-running this Move function before releasing key shares.
- **Buyer-generated delegate keys.** The buyer/renter generates their own delegate keypair client-side and only ever submits the public half on-chain (`delegate_key_public`). WalMarket's rental-key-manager registers *that exact* key with MemWal — it never mints its own key on the buyer's behalf, which would silently orphan their access.

---

## Running Locally

### Prerequisites
- Node.js 20+, pnpm 9+
- Sui CLI (1.x), configured for testnet (`sui client switch --env testnet`)
- A testnet wallet with SUI for gas ([faucet](https://faucet.testnet.sui.io/))

### 1. Clone and install

```bash
git clone https://github.com/your-org/walmarket
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
pnpm test:contracts           # runs all 22 unit tests
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
| WalMarket Package (original) | `0x9b58604659480be1cc748df55858d98df7f0740ea638ba356c1e6c559201f52e` |
| WalMarket Package (latest) | `0xc187a4cf7a2f800d69916009504ca539a027326f222970a7bd89d329bfb24d6f` |
| WalMarket Registry | `0xb712035b7e9afcfad1f01b5134e8c3dc32dfb948ba796d0d19d1f3aeaccb588d` |
| MemWal Package | `0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6` |
| MemWal Registry | `0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437` |

These are live testnet object IDs — they change if you run `pnpm publish:contracts` yourself (a fresh publish, not an upgrade, since some struct layouts have changed across this project's iterations).

---

## Deployed Links

- **Demo video**: (YouTube link TBD)
- **Walrus Site**: (site URL after the Walrus Sites deployment described in Roadmap below)
- **Suiscan (testnet)**: https://suiscan.xyz/testnet

---

## Vision

WalMarket is the **"Hugging Face Hub" for AI agent memory**. Just as Hugging Face democratized model sharing, WalMarket enables the emerging market for agent context — the accumulated domain expertise that makes one AI agent meaningfully better than another at a specific task.

### Roadmap

What's below is the deliberate next-stage plan, scoped honestly against what's built today:

- **Mainnet deployment.** Publish `walmarket.move` to Sui mainnet, point MemWal/Walrus/Seal configuration at their mainnet endpoints, and replace the demo treasury-funding key (`WALMARKET_TREASURY_PRIVATE_KEY`) with a properly monitored, rate-limited production treasury for provisioning managed-seller accounts.
- **Fully decentralized frontend.** Deploy `apps/web` itself to a **Walrus Site** (the project already configures `NEXT_PUBLIC_WALRUS_AGGREGATOR`/`PUBLISHER` against testnet Walrus) so the marketplace UI has no centralized host — only the managed-seller agent runtime (which genuinely needs a long-lived process) would remain server-based.
- **Sui Kiosk `TransferPolicy` + resale royalties.** Today's 2.5% fee is split once, at first sale, inside `purchase_listing`. Moving listings into a Kiosk with a `TransferPolicy` rule would let sellers earn a royalty on every resale, not just the first.
- **Streaming, pay-per-query pricing.** Today's pricing is binary (buy outright or rent by the hour). A per-query micropayment model — charge a tiny amount of SUI per `/api/ask` call rather than a flat purchase — fits agent-to-agent usage better than human-priced flat fees.
- **Agent-to-agent commerce at scale.** The agent-native API and x402-style payment flow already work end-to-end; the next step is a discovery layer (so an agent looking for "Sui DeFi domain knowledge" finds the right listing without a human curating it) and reputation signals (review history, query-answer quality) attached on-chain.
- **Persistent event cursors for the rental-key-manager / query-responder.** Both currently replay event history from genesis on every process restart (harmless — duplicate `add_delegate_key` calls abort safely on-chain — but wasteful at scale). Persisting the last-processed cursor (e.g. alongside the managed-seller SQLite store) removes that cost as listing volume grows.
- **Namespace-scoped delegate keys.** MemWal's `add_delegate_key`/`remove_delegate_key` are currently scoped to the whole account, not a single namespace — fine for WalMarket's per-seller-account model today, but worth tightening if a seller ever wants multiple independently-revocable namespaces under one account.

---

## Known Limitations (Current)

Stated honestly, not hidden:

- **Testnet only.** No mainnet deployment yet — see Roadmap.
- **Delegate-key delivery is manual paste, by design, not a stopgap.** The buyer generates their own keypair client-side and is shown the private half once; there is no on-chain registry of `blob_id`s that would let a fully automatic Seal-based unlock work without a further contract redesign that surfaces key material on-chain (which would weaken, not strengthen, the access-control story). The export panel and Dashboard both make this key easy to find and copy after purchase.
- **Single fee split, no resale royalties yet** — the protocol fee is taken once at first sale inside `purchase_listing`/`rent_listing`, not via a Kiosk `TransferPolicy` — see Roadmap.
- **Event replay on restart** — `rental-key-manager`/`query-responder` poll from an in-memory cursor that resets to genesis on every process restart. This is intentional/documented (nothing is ever lost, and duplicate registrations abort harmlessly on-chain) but adds avoidable RPC load as event history grows — see Roadmap.
- **Managed-seller treasury key defaults to the demo `MEMWAL_PRIVATE_KEY`** if `WALMARKET_TREASURY_PRIVATE_KEY` isn't set — fine for a hackathon demo, not for production funding of real seller accounts.

---

## Team

- **Tomiwa Adeyemi** — full-stack + Move contracts

---

*Built for Sui Overflow 2026.*
