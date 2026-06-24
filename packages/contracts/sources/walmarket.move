module walmarket::walmarket {
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use std::string::String;
    use openzeppelin_access::access_control::{Self, Auth};
    use openzeppelin_utils::rate_limiter::{Self, RateLimiter};

    // ─── Error codes ───────────────────────────────────────────────────────────
    const ENotOwner: u64          = 1;
    const EListingInactive: u64   = 2;
    const ENotForSale: u64        = 3;
    const ENotRentable: u64       = 4;
    const EInsufficientPayment: u64 = 5;
    const EInvalidDuration: u64   = 6;
    const EInvalidCategory: u64   = 7;
    const ERentNotExpired: u64    = 8;
    const EInvalidMessage: u64    = 9;
    const ENoSealAccess: u64      = 10;
    const ENotOperator: u64       = 11;
    const EQueryLimitReached: u64 = 12;
    const EAlreadyAnswered: u64   = 13;
    const EQueryPriceNotSet: u64  = 14;
    const EInvalidRating: u64     = 15;
    const ENotAccessHolder: u64   = 16;
    const EProtocolPaused: u64    = 17;
    const EInvalidFeeBps: u64     = 18;
    const EZeroAddress: u64       = 19;

    const MAX_CATEGORY: u8 = 4;
    const MIN_RENT_HOURS: u64 = 1;
    const MAX_RENT_HOURS: u64 = 720;
    const FEE_BPS_DENOM: u64 = 10_000;
    const MS_PER_HOUR: u64 = 3_600_000;
    // Hard cap on free try-before-you-buy queries per (buyer, listing) — each
    // query is answered with a real LLM-synthesized answer (see request_query/
    // submit_query_response), so this bounds how much of a namespace's value a
    // prospective buyer can extract before paying.
    const MAX_FREE_QUERIES: u64 = 1;
    // Sentinel for RentAccess.expires_at meaning "never expires" — used by outright
    // purchases so they reuse the exact same access-grant object/event/Seal-policy
    // pathway as timed rentals instead of a parallel one. expire_rent's clock check
    // (timestamp_ms >= expires_at) can never pass against u64::MAX, so a permanent
    // access can never be (mistakenly) burned via that path.
    const PERMANENT_ACCESS_EXPIRY: u64 = 18_446_744_073_709_551_615;

    // Sanity ceiling on set_fee_bps — independent of (and tighter than) the
    // arithmetic ceiling of FEE_BPS_DENOM, so a compromised/misconfigured
    // FeeManagerRole holder can't push the protocol fee to something
    // confiscatory in one call.
    const MAX_FEE_BPS: u64 = 2_000; // 20%

    // Timelock (ms) for transferring or renouncing the protocol's root
    // governance role — see openzeppelin_access::access_control. Matches the
    // delay enforced on listing rentals/etc. being in the hours-to-days range,
    // not an instant rug-pull window.
    const PROTOCOL_ADMIN_DELAY_MS: u64 = 172_800_000; // 2 days

    // Per-listing pay_per_query throughput guard (token bucket via
    // openzeppelin_utils::rate_limiter). Unlike request_query (capped at
    // MAX_FREE_QUERIES total per buyer), pay_per_query is deliberately
    // unlimited *count*-wise — this only bounds *rate*, so a buyer's agent
    // looping the endpoint can't outpace the seller's underlying
    // query-responder/MemWal throughput, while still allowing normal bursty
    // chat usage.
    const QUERY_RATE_CAPACITY: u64 = 20;               // burst allowance
    const QUERY_RATE_REFILL_AMOUNT: u64 = 1;            // tokens credited per interval
    const QUERY_RATE_REFILL_INTERVAL_MS: u64 = 3_000;   // ~20/min sustained after burst

    // ─── Governance (OpenZeppelin AccessControl) ──────────────────────────────
    // One-time witness for this module — the root of the protocol's
    // AccessControl registry, minted once at publish and consumed by init().
    public struct WALMARKET has drop {}

    // Authorizes set_fee_bps / set_fee_recipient. Granted to the deployer at
    // init; the root role (WALMARKET) can delegate it to a separate
    // treasury/ops address without handing over full protocol control.
    public struct FeeManagerRole {}

    // Authorizes pause/unpause — an emergency circuit breaker on the
    // money-moving entrypoints (purchase/rent/pay_per_query), separate from
    // FeeManagerRole so an incident responder doesn't also need fee-setting
    // power.
    public struct PauserRole {}

    // ─── Core types ────────────────────────────────────────────────────────────

    public struct MemoryListing has key, store {
        id: UID,
        owner: address,
        // Address authorized to answer try-before-you-buy queries on the seller's
        // behalf (submit_query_response) — defaults to owner at creation, but a
        // real seller's automated agent typically signs with its own dedicated
        // keypair, not the seller's zkLogin wallet, so it's settable separately
        // via set_operator. Decouples "who manages this listing" from "which
        // process can act for it autonomously."
        operator: address,
        account_id: String,
        namespace: String,
        title: String,
        description: String,
        category: u8,              // 0=Research 1=Trading 2=Legal 3=Code 4=General
        memory_count: u64,
        oldest_memory_epoch: u64,
        sale_price_mist: Option<u64>,
        rent_price_per_hour_mist: Option<u64>,
        // Streaming/pay-per-query price: charge a flat micropayment per message
        // via pay_per_query, unlimited (no free-cap), instead of requiring a full
        // purchase or rental up front. `none` means the seller hasn't opted in —
        // request_query (the free trial) is unaffected either way.
        price_per_query_mist: Option<u64>,
        is_active: bool,
        created_at: u64,
        // Per-buyer count of free try-before-you-buy queries used so far —
        // never cleaned up since MemoryListing objects are never deleted
        // (delist only flips is_active), so the table just lives for the
        // object's lifetime.
        free_query_counts: Table<address, u64>,
        // On-chain reputation: sum/count rather than a precomputed average, so
        // there's no fixed-point rounding to reason about — callers compute
        // total_rating_sum / review_count themselves. Only updated by
        // submit_review, which requires proof of a real purchase/rental.
        total_rating_sum: u64,
        review_count: u64,
        // Token-bucket throttle on this listing's pay_per_query throughput —
        // see QUERY_RATE_CAPACITY. Embedded directly (not a Table) since the
        // cap is global to the listing, not per-buyer.
        query_rate_limiter: RateLimiter,
    }

    public struct RentAccess has key, store {
        id: UID,
        listing_id: ID,
        renter: address,
        delegate_key_public: vector<u8>,
        expires_at: u64,
        namespace: String,
        account_id: String,
    }

    public struct WalMarketRegistry has key {
        id: UID,
        listing_count: u64,
        total_volume_mist: u64,
        fee_bps: u64,
        fee_recipient: address,
        // Emergency circuit breaker — gates purchase_listing,
        // purchase_listing_with_access, rent_listing, and pay_per_query.
        // Toggled only via Auth<PauserRole>; see pause()/unpause().
        paused: bool,
    }

    public struct QueryRequest has key {
        id: UID,
        listing_id: ID,
        requester: address,
        message: String,
        answer: Option<String>,
        memories_used: u64,
        created_at: u64,
    }

    // On-chain reputation signal — only mintable by someone holding a RentAccess
    // for this exact listing (see submit_review), so ratings reflect verified
    // buyers/renters, not anonymous drive-by reviews.
    public struct Review has key {
        id: UID,
        listing_id: ID,
        reviewer: address,
        rating: u8,
        comment: String,
        created_at: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────────

    public struct ListingCreated has copy, drop {
        listing_id: ID,
        owner: address,
        title: String,
        category: u8,
    }

    public struct ListingUpdated has copy, drop {
        listing_id: ID,
    }

    public struct OperatorUpdated has copy, drop {
        listing_id: ID,
        operator: address,
    }

    public struct ListingDelisted has copy, drop {
        listing_id: ID,
    }

    public struct ListingSold has copy, drop {
        listing_id: ID,
        seller: address,
        buyer: address,
        price_mist: u64,
    }

    public struct RentStarted has copy, drop {
        listing_id: ID,
        renter: address,
        access_id: ID,
        expires_at: u64,
    }

    public struct RentConfirmed has copy, drop {
        access_id: ID,
    }

    public struct RentExpired has copy, drop {
        access_id: ID,
    }

    public struct QueryRequested has copy, drop {
        listing_id: ID,
        requester: address,
        query_id: ID,
    }

    public struct QueryAnswered has copy, drop {
        query_id: ID,
        listing_id: ID,
    }

    public struct ReviewSubmitted has copy, drop {
        listing_id: ID,
        reviewer: address,
        rating: u8,
        review_id: ID,
    }

    public struct FeeUpdated has copy, drop {
        fee_bps: u64,
    }

    public struct FeeRecipientUpdated has copy, drop {
        fee_recipient: address,
    }

    public struct ProtocolPaused has copy, drop {}

    public struct ProtocolUnpaused has copy, drop {}

    // ─── Init ──────────────────────────────────────────────────────────────────

    fun init(otw: WALMARKET, ctx: &mut TxContext) {
        let registry = WalMarketRegistry {
            id: object::new(ctx),
            listing_count: 0,
            total_volume_mist: 0,
            fee_bps: 250,  // 2.5%
            fee_recipient: ctx.sender(),
            paused: false,
        };
        transfer::share_object(registry);

        // Root governance registry, rooted at this module's OTW. The deployer
        // becomes the default admin and is immediately granted the two
        // operational roles so the protocol isn't stuck unmanaged right after
        // publish — see set_fee_bps/set_fee_recipient/pause/unpause.
        let mut ac = access_control::new<WALMARKET>(otw, PROTOCOL_ADMIN_DELAY_MS, ctx);
        access_control::grant_role<WALMARKET, FeeManagerRole>(&mut ac, ctx.sender(), ctx);
        access_control::grant_role<WALMARKET, PauserRole>(&mut ac, ctx.sender(), ctx);
        transfer::public_share_object(ac);
    }

    // ─── Seller: create listing ────────────────────────────────────────────────

    public entry fun create_listing(
        registry: &mut WalMarketRegistry,
        account_id: String,
        namespace: String,
        title: String,
        description: String,
        category: u8,
        memory_count: u64,
        oldest_memory_epoch: u64,
        sale_price_mist: Option<u64>,
        rent_price_per_hour_mist: Option<u64>,
        price_per_query_mist: Option<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(category <= MAX_CATEGORY, EInvalidCategory);
        let listing_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&listing_id);
        let listing = MemoryListing {
            id: listing_id,
            owner: ctx.sender(),
            operator: ctx.sender(),
            account_id,
            namespace,
            title: title,
            description,
            category,
            memory_count,
            oldest_memory_epoch,
            sale_price_mist,
            rent_price_per_hour_mist,
            price_per_query_mist,
            is_active: true,
            created_at: clock.timestamp_ms(),
            free_query_counts: table::new(ctx),
            total_rating_sum: 0,
            review_count: 0,
            query_rate_limiter: rate_limiter::new_bucket(
                QUERY_RATE_CAPACITY,
                QUERY_RATE_REFILL_AMOUNT,
                QUERY_RATE_REFILL_INTERVAL_MS,
                clock.timestamp_ms(),
                QUERY_RATE_CAPACITY,
                clock,
            ),
        };
        registry.listing_count = registry.listing_count + 1;
        event::emit(ListingCreated {
            listing_id: id_copy,
            owner: ctx.sender(),
            title: listing.title,
            category,
        });
        transfer::share_object(listing);
    }

    // ─── Seller: update pricing ────────────────────────────────────────────────

    public entry fun update_pricing(
        listing: &mut MemoryListing,
        sale_price_mist: Option<u64>,
        rent_price_per_hour_mist: Option<u64>,
        price_per_query_mist: Option<u64>,
        ctx: &mut TxContext,
    ) {
        assert!(listing.owner == ctx.sender(), ENotOwner);
        listing.sale_price_mist = sale_price_mist;
        listing.rent_price_per_hour_mist = rent_price_per_hour_mist;
        listing.price_per_query_mist = price_per_query_mist;
        event::emit(ListingUpdated { listing_id: object::id(listing) });
    }

    // ─── Seller: authorize an agent to answer queries on their behalf ─────────
    // The owner is typically a human's zkLogin wallet (browser-only, no
    // exportable key); the operator is a dedicated long-lived keypair a
    // self-hosted agent process holds so it can sign submit_query_response
    // autonomously without the seller keeping a browser tab open.
    public entry fun set_operator(listing: &mut MemoryListing, operator: address, ctx: &mut TxContext) {
        assert!(listing.owner == ctx.sender(), ENotOwner);
        listing.operator = operator;
        event::emit(OperatorUpdated { listing_id: object::id(listing), operator });
    }

    // ─── Seller: delist ────────────────────────────────────────────────────────

    public entry fun delist(listing: &mut MemoryListing, ctx: &mut TxContext) {
        assert!(listing.owner == ctx.sender(), ENotOwner);
        listing.is_active = false;
        event::emit(ListingDelisted { listing_id: object::id(listing) });
    }

    // ─── Governance: protocol fee (openzeppelin_access::access_control) ──────
    // Holding `&Auth<FeeManagerRole>` is itself the authorization — it can only
    // have been minted by access_control::new_auth against the registry rooted
    // at this module's OTW, against a sender who genuinely held FeeManagerRole
    // at mint time. No additional sender check is needed in the body.
    public entry fun set_fee_bps(
        registry: &mut WalMarketRegistry,
        _auth: &Auth<FeeManagerRole>,
        new_fee_bps: u64,
    ) {
        assert!(new_fee_bps <= MAX_FEE_BPS, EInvalidFeeBps);
        registry.fee_bps = new_fee_bps;
        event::emit(FeeUpdated { fee_bps: new_fee_bps });
    }

    public entry fun set_fee_recipient(
        registry: &mut WalMarketRegistry,
        _auth: &Auth<FeeManagerRole>,
        new_fee_recipient: address,
    ) {
        assert!(new_fee_recipient != @0x0, EZeroAddress);
        registry.fee_recipient = new_fee_recipient;
        event::emit(FeeRecipientUpdated { fee_recipient: new_fee_recipient });
    }

    // ─── Governance: emergency pause (openzeppelin_access::access_control) ───
    // Halts purchase_listing, purchase_listing_with_access, rent_listing, and
    // pay_per_query — the four entrypoints that move payment — without
    // touching listing/browse/free-trial/review flows.
    public entry fun pause(registry: &mut WalMarketRegistry, _auth: &Auth<PauserRole>) {
        registry.paused = true;
        event::emit(ProtocolPaused {});
    }

    public entry fun unpause(registry: &mut WalMarketRegistry, _auth: &Auth<PauserRole>) {
        registry.paused = false;
        event::emit(ProtocolUnpaused {});
    }

    // ─── Buyer: purchase outright ──────────────────────────────────────────────

    public entry fun purchase_listing(
        registry: &mut WalMarketRegistry,
        listing: &mut MemoryListing,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!registry.paused, EProtocolPaused);
        assert!(listing.is_active, EListingInactive);
        let price = *option::borrow(&listing.sale_price_mist);
        assert!(option::is_some(&listing.sale_price_mist), ENotForSale);
        assert!(coin::value(&payment) >= price, EInsufficientPayment);

        let fee = price * registry.fee_bps / FEE_BPS_DENOM;
        let seller_amount = price - fee;

        let mut payment_mut = payment;
        let fee_coin = coin::split(&mut payment_mut, fee, ctx);
        let seller_coin = coin::split(&mut payment_mut, seller_amount, ctx);

        transfer::public_transfer(fee_coin, registry.fee_recipient);
        transfer::public_transfer(seller_coin, listing.owner);

        // Return any overpayment
        if (coin::value(&payment_mut) > 0) {
            transfer::public_transfer(payment_mut, ctx.sender());
        } else {
            coin::destroy_zero(payment_mut);
        };

        registry.total_volume_mist = registry.total_volume_mist + price;

        let seller = listing.owner;
        listing.owner = ctx.sender();
        listing.is_active = false;

        event::emit(ListingSold {
            listing_id: object::id(listing),
            seller,
            buyer: ctx.sender(),
            price_mist: price,
        });
        let _ = clock;
    }

    // ─── Buyer: purchase outright + grant delegate-key access ─────────────────
    // Same payment/transfer/ListingSold logic as purchase_listing, but additionally
    // mints a permanent RentAccess (expires_at = PERMANENT_ACCESS_EXPIRY) and emits
    // RentStarted, so the buyer's delegate key flows through the exact same
    // off-chain key-granting + Seal-decrypt pathway that rentals use — one
    // access-grant mechanism for both "rented" and "bought", not two.
    public entry fun purchase_listing_with_access(
        registry: &mut WalMarketRegistry,
        listing: &mut MemoryListing,
        payment: Coin<SUI>,
        delegate_key_public: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!registry.paused, EProtocolPaused);
        assert!(listing.is_active, EListingInactive);
        assert!(option::is_some(&listing.sale_price_mist), ENotForSale);
        let price = *option::borrow(&listing.sale_price_mist);
        assert!(coin::value(&payment) >= price, EInsufficientPayment);

        let fee = price * registry.fee_bps / FEE_BPS_DENOM;
        let seller_amount = price - fee;

        let mut payment_mut = payment;
        let fee_coin = coin::split(&mut payment_mut, fee, ctx);
        let seller_coin = coin::split(&mut payment_mut, seller_amount, ctx);

        transfer::public_transfer(fee_coin, registry.fee_recipient);
        transfer::public_transfer(seller_coin, listing.owner);

        if (coin::value(&payment_mut) > 0) {
            transfer::public_transfer(payment_mut, ctx.sender());
        } else {
            coin::destroy_zero(payment_mut);
        };

        registry.total_volume_mist = registry.total_volume_mist + price;

        let seller = listing.owner;
        let buyer = ctx.sender();
        listing.owner = buyer;
        listing.is_active = false;

        event::emit(ListingSold {
            listing_id: object::id(listing),
            seller,
            buyer,
            price_mist: price,
        });

        let access_uid = object::new(ctx);
        let access_id = object::uid_to_inner(&access_uid);
        let access = RentAccess {
            id: access_uid,
            listing_id: object::id(listing),
            renter: buyer,
            delegate_key_public,
            expires_at: PERMANENT_ACCESS_EXPIRY,
            namespace: listing.namespace,
            account_id: listing.account_id,
        };
        transfer::transfer(access, buyer);

        event::emit(RentStarted {
            listing_id: object::id(listing),
            renter: buyer,
            access_id,
            expires_at: PERMANENT_ACCESS_EXPIRY,
        });
        let _ = clock;
    }

    // ─── Buyer: rent listing ───────────────────────────────────────────────────

    public entry fun rent_listing(
        registry: &mut WalMarketRegistry,
        listing: &mut MemoryListing,
        payment: Coin<SUI>,
        duration_hours: u64,
        delegate_key_public: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!registry.paused, EProtocolPaused);
        assert!(listing.is_active, EListingInactive);
        assert!(option::is_some(&listing.rent_price_per_hour_mist), ENotRentable);
        assert!(duration_hours >= MIN_RENT_HOURS && duration_hours <= MAX_RENT_HOURS, EInvalidDuration);

        let price_per_hour = *option::borrow(&listing.rent_price_per_hour_mist);
        let total_price = price_per_hour * duration_hours;
        assert!(coin::value(&payment) >= total_price, EInsufficientPayment);

        let fee = total_price * registry.fee_bps / FEE_BPS_DENOM;
        let seller_amount = total_price - fee;

        let mut payment_mut = payment;
        let fee_coin = coin::split(&mut payment_mut, fee, ctx);
        let seller_coin = coin::split(&mut payment_mut, seller_amount, ctx);

        transfer::public_transfer(fee_coin, registry.fee_recipient);
        transfer::public_transfer(seller_coin, listing.owner);

        if (coin::value(&payment_mut) > 0) {
            transfer::public_transfer(payment_mut, ctx.sender());
        } else {
            coin::destroy_zero(payment_mut);
        };

        registry.total_volume_mist = registry.total_volume_mist + total_price;

        let expires_at = clock.timestamp_ms() + (duration_hours * MS_PER_HOUR);
        let access_uid = object::new(ctx);
        let access_id = object::uid_to_inner(&access_uid);

        let access = RentAccess {
            id: access_uid,
            listing_id: object::id(listing),
            renter: ctx.sender(),
            delegate_key_public,
            expires_at,
            namespace: listing.namespace,
            account_id: listing.account_id,
        };
        transfer::transfer(access, ctx.sender());

        event::emit(RentStarted {
            listing_id: object::id(listing),
            renter: ctx.sender(),
            access_id,
            expires_at,
        });
    }

    // ─── Renter: confirm receipt ───────────────────────────────────────────────

    public entry fun confirm_rent(access: &RentAccess, ctx: &mut TxContext) {
        assert!(access.renter == ctx.sender(), ENotOwner);
        event::emit(RentConfirmed { access_id: object::id(access) });
    }

    // ─── Cleanup: expire rent ──────────────────────────────────────────────────

    public entry fun expire_rent(access: RentAccess, clock: &Clock) {
        assert!(clock.timestamp_ms() >= access.expires_at, ERentNotExpired);
        let access_id = object::id(&access);
        let RentAccess { id, listing_id: _, renter: _, delegate_key_public: _, expires_at: _, namespace: _, account_id: _ } = access;
        object::delete(id);
        event::emit(RentExpired { access_id });
    }

    // ─── Buyer: request a try-before-you-buy query ─────────────────────────────
    // Capped at MAX_FREE_QUERIES per (buyer, listing) so a prospective buyer
    // can't extract the namespace's full value via free AI-answered messages
    // before paying. The cap is enforced on-chain (not just in the frontend)
    // so it can't be bypassed by clearing browser state or calling the API
    // directly.
    public entry fun request_query(
        listing: &mut MemoryListing,
        message: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(listing.is_active, EListingInactive);
        assert!(!message.is_empty(), EInvalidMessage);

        let sender = ctx.sender();
        let used = if (table::contains(&listing.free_query_counts, sender)) {
            *table::borrow(&listing.free_query_counts, sender)
        } else {
            0
        };
        assert!(used < MAX_FREE_QUERIES, EQueryLimitReached);
        if (table::contains(&listing.free_query_counts, sender)) {
            *table::borrow_mut(&mut listing.free_query_counts, sender) = used + 1;
        } else {
            table::add(&mut listing.free_query_counts, sender, 1);
        };

        let query_uid = object::new(ctx);
        let query_id = object::uid_to_inner(&query_uid);

        let query = QueryRequest {
            id: query_uid,
            listing_id: object::id(listing),
            requester: sender,
            message,
            answer: option::none(),
            memories_used: 0,
            created_at: clock.timestamp_ms(),
        };
        transfer::share_object(query);

        event::emit(QueryRequested {
            listing_id: object::id(listing),
            requester: sender,
            query_id,
        });
    }

    // ─── Buyer: pay-per-query (streaming, unlimited) ───────────────────────────
    // Unlike request_query, this is never capped — it's the streaming-pricing
    // counterpart for agent-to-agent usage that wants to keep paying small
    // amounts per message rather than buying full access up front. Reuses the
    // exact same QueryRequest object/QueryRequested event as the free trial, so
    // the existing query-responder agent infrastructure needs no changes to
    // pick these up and answer them.
    public entry fun pay_per_query(
        registry: &mut WalMarketRegistry,
        listing: &mut MemoryListing,
        payment: Coin<SUI>,
        message: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!registry.paused, EProtocolPaused);
        assert!(listing.is_active, EListingInactive);
        assert!(!message.is_empty(), EInvalidMessage);
        assert!(option::is_some(&listing.price_per_query_mist), EQueryPriceNotSet);
        let price = *option::borrow(&listing.price_per_query_mist);
        assert!(coin::value(&payment) >= price, EInsufficientPayment);
        // Throttled before any payment is moved — if the bucket is empty this
        // aborts the whole transaction, so the buyer's coin is untouched.
        rate_limiter::consume_or_abort(&mut listing.query_rate_limiter, 1, clock);

        let fee = price * registry.fee_bps / FEE_BPS_DENOM;
        let seller_amount = price - fee;

        let mut payment_mut = payment;
        let fee_coin = coin::split(&mut payment_mut, fee, ctx);
        let seller_coin = coin::split(&mut payment_mut, seller_amount, ctx);

        transfer::public_transfer(fee_coin, registry.fee_recipient);
        transfer::public_transfer(seller_coin, listing.owner);

        if (coin::value(&payment_mut) > 0) {
            transfer::public_transfer(payment_mut, ctx.sender());
        } else {
            coin::destroy_zero(payment_mut);
        };

        registry.total_volume_mist = registry.total_volume_mist + price;

        let sender = ctx.sender();
        let query_uid = object::new(ctx);
        let query_id = object::uid_to_inner(&query_uid);

        let query = QueryRequest {
            id: query_uid,
            listing_id: object::id(listing),
            requester: sender,
            message,
            answer: option::none(),
            memories_used: 0,
            created_at: clock.timestamp_ms(),
        };
        transfer::share_object(query);

        event::emit(QueryRequested {
            listing_id: object::id(listing),
            requester: sender,
            query_id,
        });
    }

    // ─── Seller agent: submit a query answer ───────────────────────────────────
    // Gated to the listing's operator — Sui's native transaction signing IS the
    // authentication here, unlike the old (unrestricted) probe response. Only
    // the seller's own authorized agent keypair can answer queries for their
    // listing.
    public entry fun submit_query_response(
        listing: &MemoryListing,
        query: &mut QueryRequest,
        answer: String,
        memories_used: u64,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == listing.operator, ENotOperator);
        assert!(object::id(listing) == query.listing_id, ENotOwner);
        assert!(option::is_none(&query.answer), EAlreadyAnswered);

        query.answer = option::some(answer);
        query.memories_used = memories_used;

        event::emit(QueryAnswered {
            query_id: object::id(query),
            listing_id: query.listing_id,
        });
    }

    // ─── Buyer/renter: submit an on-chain review ───────────────────────────────
    // Reputation signal for agent-to-agent discovery: a rating only counts if
    // the reviewer holds a real RentAccess for this exact listing (proof of a
    // completed purchase or rental) — proof is the object itself, not a claim,
    // so this can't be spammed by addresses that never actually bought anything.
    public entry fun submit_review(
        listing: &mut MemoryListing,
        access: &RentAccess,
        rating: u8,
        comment: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(access.renter == ctx.sender(), ENotAccessHolder);
        assert!(access.listing_id == object::id(listing), ENotAccessHolder);
        assert!(rating >= 1 && rating <= 5, EInvalidRating);

        let sender = ctx.sender();
        let review_uid = object::new(ctx);
        let review_id = object::uid_to_inner(&review_uid);
        let review = Review {
            id: review_uid,
            listing_id: object::id(listing),
            reviewer: sender,
            rating,
            comment,
            created_at: clock.timestamp_ms(),
        };
        transfer::share_object(review);

        listing.total_rating_sum = listing.total_rating_sum + (rating as u64);
        listing.review_count = listing.review_count + 1;

        event::emit(ReviewSubmitted {
            listing_id: object::id(listing),
            reviewer: sender,
            rating,
            review_id,
        });
    }

    // ─── Seal policy: approve delegate-key decryption ─────────────────────────
    // Seal key servers dry-run a PTB calling this before releasing decryption
    // shares for a blob encrypted under `id`. Proving access requires BOTH:
    //  (1) the caller on-chain IS the access holder (`access.renter == sender`,
    //      and they must own/reference the object to pass it by value/ref at all)
    //  (2) `id` is exactly this access object's 32-byte ID — i.e. the ciphertext
    //      was encrypted specifically for *this* RentAccess (see SealAccess.buildId
    //      on the TS side, which hex-encodes the bare access object ID).
    // Together these are exactly "decrypt only if you hold the matching access".
    public fun seal_approve(id: vector<u8>, access: &RentAccess, ctx: &TxContext) {
        assert!(ctx.sender() == access.renter, ENoSealAccess);
        assert!(id == object::id_to_bytes(&object::id(access)), ENoSealAccess);
    }

    // ─── Test-only init ───────────────────────────────────────────────────────

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(WALMARKET {}, ctx);
    }

    // ─── Read helpers ──────────────────────────────────────────────────────────

    public fun listing_owner(listing: &MemoryListing): address { listing.owner }
    public fun listing_operator(listing: &MemoryListing): address { listing.operator }
    public fun listing_is_active(listing: &MemoryListing): bool { listing.is_active }
    public fun listing_sale_price(listing: &MemoryListing): Option<u64> { listing.sale_price_mist }
    public fun listing_rent_price(listing: &MemoryListing): Option<u64> { listing.rent_price_per_hour_mist }
    public fun listing_price_per_query(listing: &MemoryListing): Option<u64> { listing.price_per_query_mist }
    public fun listing_rating_sum(listing: &MemoryListing): u64 { listing.total_rating_sum }
    public fun listing_review_count(listing: &MemoryListing): u64 { listing.review_count }
    public fun listing_free_queries_used(listing: &MemoryListing, addr: address): u64 {
        if (table::contains(&listing.free_query_counts, addr)) {
            *table::borrow(&listing.free_query_counts, addr)
        } else {
            0
        }
    }
    public fun rent_access_expires(access: &RentAccess): u64 { access.expires_at }
    public fun rent_access_listing_id(access: &RentAccess): ID { access.listing_id }
    public fun query_answer(query: &QueryRequest): &Option<String> { &query.answer }
    public fun query_memories_used(query: &QueryRequest): u64 { query.memories_used }
    public fun review_rating(review: &Review): u8 { review.rating }
    public fun review_comment(review: &Review): String { review.comment }
    public fun review_listing_id(review: &Review): ID { review.listing_id }
    public fun registry_fee_bps(registry: &WalMarketRegistry): u64 { registry.fee_bps }
    public fun registry_volume(registry: &WalMarketRegistry): u64 { registry.total_volume_mist }
    public fun registry_paused(registry: &WalMarketRegistry): bool { registry.paused }
    public fun listing_query_rate_available(listing: &MemoryListing, clock: &Clock): u64 {
        rate_limiter::available(&listing.query_rate_limiter, clock)
    }
}
