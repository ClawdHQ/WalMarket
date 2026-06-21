# `walmarket` Move Package

The on-chain core of WalMarket: listings, purchases, rentals, try-before-you-buy queries, and the Seal access-control policy that gates delegate-key decryption. Everything that affects money or access control lives here, enforced by the Sui Move VM — not in the frontend or the SDK.

Module: `walmarket::walmarket` — single file, [`sources/walmarket.move`](sources/walmarket.move).

## Object model

| Type | Kind | Purpose |
|---|---|---|
| `WalMarketRegistry` | shared, singleton (created in `init`) | Tracks `listing_count`, `total_volume_mist`, `fee_bps` (250 = 2.5%), `fee_recipient`. |
| `MemoryListing` | shared | One per seller listing. Carries `owner` (who manages price/delisting), `operator` (who's authorized to answer queries — see below), `account_id`/`namespace` (pointer into MemWal), pricing (`Option<u64>` sale/rent/price-per-query — `none` means "not offered that way"), a `Table<address, u64>` of per-buyer free-query usage, and `total_rating_sum`/`review_count` for on-chain reputation. Never deleted — `delist` only flips `is_active`. |
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

Plus read-only helpers (`listing_owner`, `listing_operator`, `listing_free_queries_used`, `listing_price_per_query`, `listing_rating_sum`, `listing_review_count`, `query_answer`, `review_rating`, `registry_volume`, …) for the SDK/indexer to use instead of parsing raw object fields where a getter exists.

## Events

`ListingCreated`, `ListingUpdated`, `OperatorUpdated`, `ListingDelisted`, `ListingSold`, `RentStarted`, `RentConfirmed`, `RentExpired`, `QueryRequested`, `QueryAnswered`, `ReviewSubmitted` — every state change emits one. `packages/sdk/src/event-indexer.ts` and the seller-agent services in `packages/sdk/src/agents/` poll these rather than re-reading full object state on every tick.

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

## Tests

`tests/walmarket_tests.move` — **28 passing unit tests**, covering: listing creation/fields, purchase (with and without access grant), rent (success, zero-hour and over-max-duration rejection), expire-rent (before/after expiry), non-owner rejection on `delist`/`update_pricing`, `set_operator` success/non-owner rejection, `seal_approve` success/mismatched-id/non-holder rejection, the full `request_query`/`submit_query_response` lifecycle (success, free-limit exhaustion, empty-message rejection, non-operator rejection, double-answer rejection), `pay_per_query` (success and volume tracking, price-not-set rejection, insufficient-payment rejection), and `submit_review` (success and rating aggregation, non-access-holder rejection, invalid-rating rejection).

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
