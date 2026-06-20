module walmarket::walmarket {
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use std::string::String;

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
        is_active: bool,
        created_at: u64,
        // Per-buyer count of free try-before-you-buy queries used so far —
        // never cleaned up since MemoryListing objects are never deleted
        // (delist only flips is_active), so the table just lives for the
        // object's lifetime.
        free_query_counts: Table<address, u64>,
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

    // ─── Init ──────────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        let registry = WalMarketRegistry {
            id: object::new(ctx),
            listing_count: 0,
            total_volume_mist: 0,
            fee_bps: 250,  // 2.5%
            fee_recipient: ctx.sender(),
        };
        transfer::share_object(registry);
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
            is_active: true,
            created_at: clock.timestamp_ms(),
            free_query_counts: table::new(ctx),
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
        ctx: &mut TxContext,
    ) {
        assert!(listing.owner == ctx.sender(), ENotOwner);
        listing.sale_price_mist = sale_price_mist;
        listing.rent_price_per_hour_mist = rent_price_per_hour_mist;
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

    // ─── Buyer: purchase outright ──────────────────────────────────────────────

    public entry fun purchase_listing(
        registry: &mut WalMarketRegistry,
        listing: &mut MemoryListing,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
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
        init(ctx);
    }

    // ─── Read helpers ──────────────────────────────────────────────────────────

    public fun listing_owner(listing: &MemoryListing): address { listing.owner }
    public fun listing_operator(listing: &MemoryListing): address { listing.operator }
    public fun listing_is_active(listing: &MemoryListing): bool { listing.is_active }
    public fun listing_sale_price(listing: &MemoryListing): Option<u64> { listing.sale_price_mist }
    public fun listing_rent_price(listing: &MemoryListing): Option<u64> { listing.rent_price_per_hour_mist }
    public fun listing_free_queries_used(listing: &MemoryListing, addr: address): u64 {
        if (table::contains(&listing.free_query_counts, addr)) {
            *table::borrow(&listing.free_query_counts, addr)
        } else {
            0
        }
    }
    public fun rent_access_expires(access: &RentAccess): u64 { access.expires_at }
    public fun query_answer(query: &QueryRequest): &Option<String> { &query.answer }
    public fun query_memories_used(query: &QueryRequest): u64 { query.memories_used }
    public fun registry_fee_bps(registry: &WalMarketRegistry): u64 { registry.fee_bps }
    public fun registry_volume(registry: &WalMarketRegistry): u64 { registry.total_volume_mist }
}
