# `walmarket` Move Package

The on-chain core of WalMarket: listings, purchases, rentals, try-before-you-buy queries, and the Seal access-control policy that gates delegate-key decryption. Everything that affects money or access control lives here, enforced by the Sui Move VM — not in the frontend or the SDK.

Module: `walmarket::walmarket` — single file, [`sources/walmarket.move`](sources/walmarket.move).

## Object model

| Type | Kind | Purpose |
|---|---|---|
| `WalMarketRegistry` | shared, singleton (created in `init`) | Tracks `listing_count`, `total_volume_mist`, `fee_bps` (250 = 2.5%, governed by `FeeManagerRole`), `fee_recipient` (also `FeeManagerRole`), `paused` (emergency circuit breaker, governed by `PauserRole` — see [OpenZeppelin section](#openzeppelin-governance--rate-limiting) below). |
| `AccessControl<WALMARKET>` | shared, singleton (created in `init`) | `openzeppelin_access::access_control` registry rooted at this module's OTW (`WALMARKET`). Holds the `FeeManagerRole`/`PauserRole` role membership that gates `set_fee_bps`/`set_fee_recipient`/`pause`/`unpause`. |
| `MemoryListing` | shared | One per seller listing. Carries `owner` (who manages price/delisting), `operator` (who's authorized to answer queries — see below), `account_id`/`namespace` (pointer into MemWal), pricing (`Option<u64>` sale/rent/price-per-query — `none` means "not offered that way"), a `Table<address, u64>` of per-buyer free-query usage, `total_rating_sum`/`review_count` for on-chain reputation, and a `query_rate_limiter` (`openzeppelin_utils::rate_limiter` token bucket) throttling `pay_per_query`. Never deleted — `delist` only flips `is_active`. |
| `RentAccess` | owned, transferred to buyer/renter | Proof of purchase or rental. Carries the buyer's own `delegate_key_public` (submitted by them, never minted by WalMarket), `expires_at` (`PERMANENT_ACCESS_EXPIRY` = `u64::MAX` for outright purchases, a real timestamp for rentals), and the `namespace`/`account_id` to query. Also doubles as proof-of-purchase for `submit_review`. |
| `QueryRequest` | shared | One per try-before-you-buy message — whether free (`request_query`) or paid (`pay_per_query`); both create the same struct, so the seller's query-responder agent answers either with zero code difference. Starts with `answer: none`; only the listing's `operator` can fill it in via `submit_query_response`. |
| `Review` | shared | One per submitted review. Carries `rating` (1–5), `comment`, `reviewer`, `listing_id`. Only mintable via `submit_review`, which requires holding a matching `RentAccess` — see Security notes below. |

## Entry functions

| Function | Caller | What it does |
|---|---|---|
| `create_listing` | seller | Mints a `MemoryListing` with `owner == operator == sender`, shares it, increments the registry's `listing_count`. Takes an optional `price_per_query_mist` alongside sale/rent price. |
| `update_pricing` | `listing.owner` | Updates sale/rent/per-query prices (all three, together). |
| `set_operator` | `listing.owner` | Repoints `listing.operator` to a different address — the seller's automated agent's own long-lived keypair, typically. This is the seam that lets a zkLogin browser session (no exportable key) authorize an agent that signs autonomously. |
| `delist` | `listing.owner` | Flips `is_active = false`. The object is never deleted. |
| `purchase_listing` | buyer | Pays `sale_price_mist`, splits the registry's `fee_bps` to `fee_recipient`, the rest to the seller, flips `listing.owner` to the buyer, sets `is_active = false`. Refunds overpayment. |
| `purchase_listing_with_access` | buyer | Same as `purchase_listing`, plus mints a permanent `RentAccess` (`expires_at = PERMANENT_ACCESS_EXPIRY`) and emits `RentStarted` — so outright purchases and timed rentals share one access-grant/Seal-policy pathway instead of two. |
| `rent_listing` | renter | Pays `rent_price_per_hour_mist × duration_hours` (`1`–`720` hours), mints a time-limited `RentAccess`. |
| `confirm_rent` | `access.renter` | On-chain "I received working access" acknowledgment — emits `RentConfirmed`. Doesn't gate anything; it's a receipt. |
| `expire_rent` | anyone, post-expiry | Burns an expired `RentAccess` once `clock.timestamp_ms() >= access.expires_at`. Reclaims storage; `confirm_rent`'d or not doesn't matter. |
| `request_query` | buyer | Try-before-you-buy, free. Asserts the listing is active and the message is non-empty, enforces `MAX_FREE_QUERIES` (currently `1`) per `(buyer, listing)` via the listing's own `Table`, shares a `QueryRequest`, emits `QueryRequested`. |
| `pay_per_query` | anyone | Streaming/unlimited counterpart to `request_query` — pays `price_per_query_mist` (split via the registry's `fee_bps`, same as a purchase), never capped, reuses the exact same `QueryRequest`/`QueryRequested` pathway so the seller's existing query-responder agent needs zero changes to answer it. Asserts a price is actually set (`EQueryPriceNotSet`). |
| `submit_query_response` | `listing.operator` only | Fills in a `QueryRequest`'s answer (free or paid — the struct is identical either way). Asserts `ctx.sender() == listing.operator` (`ENotOperator`) and that it hasn't already been answered (`EAlreadyAnswered`) — the only authentication is Sui's native tx signing, no separate signature scheme. |
| `submit_review` | holder of a matching `RentAccess` | On-chain reputation. Asserts the caller's `RentAccess.renter == ctx.sender()` and `RentAccess.listing_id == object::id(listing)` (`ENotAccessHolder`) and `1 <= rating <= 5` (`EInvalidRating`), shares a `Review`, updates the listing's `total_rating_sum`/`review_count`, emits `ReviewSubmitted` (including `review_id`, so off-chain code can fetch the full `Review` object — the event itself doesn't carry the comment text). |
| `seal_approve` | anyone (called by Seal key servers via dry-run) | The Seal access-control policy. Succeeds only if `ctx.sender() == access.renter` AND the requested `id` is exactly this `RentAccess`'s object ID — i.e. decrypt only if you hold the matching access object right now. |
| `set_fee_bps` | holder of `Auth<FeeManagerRole>` | Updates `registry.fee_bps`, capped at `MAX_FEE_BPS` (2,000 / 20%). No sender check in the body — holding the `Auth` reference is itself the authorization (see [OpenZeppelin section](#openzeppelin-governance--rate-limiting)). |
| `set_fee_recipient` | holder of `Auth<FeeManagerRole>` | Updates `registry.fee_recipient`. Rejects `@0x0`. |
| `pause` / `unpause` | holder of `Auth<PauserRole>` | Flips `registry.paused`, gating `purchase_listing`/`purchase_listing_with_access`/`rent_listing`/`pay_per_query` only — browsing, the free trial query, and reviews are unaffected. |

Plus read-only helpers (`listing_owner`, `listing_operator`, `listing_free_queries_used`, `listing_price_per_query`, `listing_rating_sum`, `listing_review_count`, `query_answer`, `review_rating`, `registry_volume`, `registry_paused`, `listing_query_rate_available`, …) for the SDK/indexer to use instead of parsing raw object fields where a getter exists.

## OpenZeppelin governance + rate limiting

`Move.toml` depends on two packages from [OpenZeppelin Contracts for Sui](https://github.com/OpenZeppelin/contracts-sui) (`openzeppelin_access`, `openzeppelin_utils`, pinned at `rev = "v1.3.0"`):

- **`access_control`** roots an `AccessControl<WALMARKET>` registry at this module's One-Time Witness, minted once in `init`. `FeeManagerRole` and `PauserRole` are plain marker structs defined in `walmarket.move` itself (required — `access_control` only accepts home-module role types) and are granted to the deployer at publish. Gated functions take `&Auth<Role>` as a parameter with no further sender check in the body, since `Auth<Role>` can only be minted by `access_control::new_auth` against someone who currently holds `Role`. The root role can only be reassigned through `access_control`'s built-in timelocked transfer/renounce flow (`PROTOCOL_ADMIN_DELAY_MS` = 2 days).
- **`rate_limiter`** embeds a token-bucket `RateLimiter` directly inside every `MemoryListing` (burst 20, refill 1 every 3s). `pay_per_query` calls `consume_or_abort` against it before moving any payment, so a buyer's agent looping the endpoint can't outpace the seller's query-responder throughput — and a throttled call's coin is never touched, since the abort reverts the whole transaction.

See the root [README's Security & Governance section](../../README.md#security--governance-openzeppelin) for the full rationale.

## Events

`ListingCreated`, `ListingUpdated`, `OperatorUpdated`, `ListingDelisted`, `ListingSold`, `RentStarted`, `RentConfirmed`, `RentExpired`, `QueryRequested`, `QueryAnswered`, `ReviewSubmitted`, `FeeUpdated`, `FeeRecipientUpdated`, `ProtocolPaused`, `ProtocolUnpaused` — every state change emits one. `packages/sdk/src/event-indexer.ts` and the seller-agent services in `packages/sdk/src/agents/` poll these rather than re-reading full object state on every tick.

## Error codes

| Code | Name | Meaning |
|---|---|---|
| 1 | `ENotOwner` | Sender isn't `listing.owner` (or `access.renter` for `confirm_rent`). |
| 2 | `EListingInactive` | Listing has been delisted or already sold. |
| 3 | `ENotForSale` | `sale_price_mist` is `none`. |
| 4 | `ENotRentable` | `rent_price_per_hour_mist` is `none`. |
| 5 | `EInsufficientPayment` | Payment coin value is below the required price. |
| 6 | `EInvalidDuration` | Rent duration outside `1`–`720` hours. |
| 7 | `EInvalidCategory` | Category above `MAX_CATEGORY` (4). |
| 8 | `ERentNotExpired` | `expire_rent` called before `expires_at`. |
| 9 | `EInvalidMessage` | Empty try-before-you-buy message. |
| 10 | `ENoSealAccess` | `seal_approve` check failed (wrong sender or wrong `id`). |
| 11 | `ENotOperator` | `submit_query_response` called by someone other than `listing.operator`. |
| 12 | `EQueryLimitReached` | Buyer already used their free query allowance on this listing. |
| 13 | `EAlreadyAnswered` | `submit_query_response` called twice on the same `QueryRequest`. |
| 14 | `EQueryPriceNotSet` | `pay_per_query` called on a listing with `price_per_query_mist == none`. |
| 15 | `EInvalidRating` | `submit_review` called with `rating` outside `1`–`5`. |
| 16 | `ENotAccessHolder` | `submit_review` called with a `RentAccess` that isn't the caller's, or doesn't belong to this listing. |
| 17 | `EProtocolPaused` | `purchase_listing`/`purchase_listing_with_access`/`rent_listing`/`pay_per_query` called while `registry.paused == true`. |
| 18 | `EInvalidFeeBps` | `set_fee_bps` called with a value above `MAX_FEE_BPS` (2,000 / 20%). |
| 19 | `EZeroAddress` | `set_fee_recipient` called with `@0x0`. |

`access_control`'s own `EUnauthorized` (code 0) and `rate_limiter`'s own `ERateLimited` (code 0) can also abort a transaction — they originate from `openzeppelin_access::access_control`/`openzeppelin_utils::rate_limiter` respectively, distinguishable from this module's codes by abort *location*, not just code number.

## Tests

`tests/walmarket_tests.move` — **34 passing unit tests**, covering: listing creation/fields, purchase (with and without access grant), rent (success, zero-hour and over-max-duration rejection), expire-rent (before/after expiry), non-owner rejection on `delist`/`update_pricing`, `set_operator` success/non-owner rejection, `seal_approve` success/mismatched-id/non-holder rejection, the full `request_query`/`submit_query_response` lifecycle (success, free-limit exhaustion, empty-message rejection, non-operator rejection, double-answer rejection), `pay_per_query` (success and volume tracking, price-not-set rejection, insufficient-payment rejection), `submit_review` (success and rating aggregation, non-access-holder rejection, invalid-rating rejection), governance (`set_fee_bps`/`set_fee_recipient` success for a `FeeManagerRole` holder, rejection for a non-holder, rejection above `MAX_FEE_BPS`, `pause`/`unpause` round-trip, purchase rejection while paused), and the `pay_per_query` rate limiter (abort once the burst bucket is exhausted).

```bash
sui move test          # from this directory, or `pnpm test:contracts` from repo root
```

## Deploying

```bash
sui client switch --env testnet
sui client publish --gas-budget 100000000     # or `pnpm publish:contracts` from repo root
```

Note the **package ID** and the **`WalMarketRegistry` shared object ID** from the publish output — both go into the root `.env` (`NEXT_PUBLIC_WALMARKET_PACKAGE_ID`, `NEXT_PUBLIC_WALMARKET_REGISTRY_ID`, and `NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID` equal to the package ID until your first upgrade).

**Upgrade vs. fresh publish:** Sui's upgrade-compatibility rules forbid changing an existing struct's field layout. Every struct change so far in this project (adding `operator`/`free_query_counts` to `MemoryListing`, adding `QueryRequest`) has required a fresh `sui client publish`, not `sui client upgrade` — which means existing listings don't carry forward and need re-seeding. Function-body-only changes (e.g. a constant value tweak) *can* go through `sui client upgrade`, but any upgrade produces a *new* package object — moveCall targets for functions whose behavior changed via that upgrade must target the new (`NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID`) package, not the original; event/struct type queries must still target the *original* package ID, since Sui ties type identity to the defining package forever.

## Mainnet

No mainnet deployment yet — see the root [README's Roadmap](../../README.md#roadmap). The contract itself has no testnet-specific logic; moving to mainnet is `sui client switch --env mainnet` + a fresh publish + funding a real treasury address, not a code change.
