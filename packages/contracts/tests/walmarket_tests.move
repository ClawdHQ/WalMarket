
#[test_only]
module walmarket::walmarket_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use std::string;
    use walmarket::walmarket::{
        Self,
        WalMarketRegistry,
        MemoryListing,
        RentAccess,
        QueryRequest,
        Review,
    };


    const SELLER: address = @0xA;
    const BUYER: address  = @0xB;
    const FEE_RECIPIENT: address = @0xC;
    const AGENT: address  = @0xD;

    // ─── Helpers ───────────────────────────────────────────────────────────────

    fun make_listing(scenario: &mut Scenario, clock: &Clock) {
        make_listing_with_query_price(scenario, clock, option::none());
    }

    fun make_listing_with_query_price(scenario: &mut Scenario, clock: &Clock, price_per_query_mist: Option<u64>) {
        ts::next_tx(scenario, SELLER);
        let mut registry = ts::take_shared<WalMarketRegistry>(scenario);
        walmarket::create_listing(
            &mut registry,
            string::utf8(b"acc123"),
            string::utf8(b"sui-defi"),
            string::utf8(b"Test Listing"),
            string::utf8(b"A test description"),
            0u8,
            100u64,
            1_700_000_000_000u64,
            option::some(1_000_000_000u64),          // 1 SUI sale price
            option::some(100_000_000u64),             // 0.1 SUI/hr rent
            price_per_query_mist,
            clock,
            ts::ctx(scenario),
        );
        ts::return_shared(registry);
    }

    // ─── Test: create_listing sets fields correctly ────────────────────────────

    #[test]
    fun test_create_listing_fields() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, SELLER);
        {
            let listing = ts::take_shared<MemoryListing>(&scenario);
            assert!(walmarket::listing_owner(&listing) == SELLER, 0);
            assert!(walmarket::listing_is_active(&listing), 1);
            assert!(*option::borrow(&walmarket::listing_sale_price(&listing)) == 1_000_000_000u64, 2);
            assert!(*option::borrow(&walmarket::listing_rent_price(&listing)) == 100_000_000u64, 3);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: purchase_listing transfers ownership + splits fee ──────────────

    #[test]
    fun test_purchase_listing() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            // 1 SUI in MIST
            let payment = coin::mint_for_testing<SUI>(1_000_000_000u64, ts::ctx(&mut scenario));
            walmarket::purchase_listing(&mut registry, &mut listing, payment, &clock, ts::ctx(&mut scenario));
            // After purchase owner changes to buyer
            assert!(walmarket::listing_owner(&listing) == BUYER, 10);
            assert!(!walmarket::listing_is_active(&listing), 11);
            // Volume should equal sale price
            assert!(walmarket::registry_volume(&registry) == 1_000_000_000u64, 12);
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // Check fee was transferred: fee = 1_000_000_000 * 250 / 10_000 = 25_000_000
        ts::next_tx(&mut scenario, FEE_RECIPIENT);
        {
            // fee_recipient is deployer (SELLER in this test since init sets sender)
            // The fee coin was transferred — just verify no panic above
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: rent_listing validates duration bounds ──────────────────────────

    #[test]
    fun test_rent_listing_success() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            let fake_pubkey = vector[1u8, 2u8, 3u8, 4u8];
            walmarket::rent_listing(
                &mut registry,
                &mut listing,
                payment,
                1u64,     // 1 hour
                fake_pubkey,
                &clock,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // RentAccess should be owned by BUYER
        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            // expires_at = 0 + 1 * 3_600_000 = 3_600_000
            assert!(walmarket::rent_access_expires(&access) == 3_600_000u64, 20);
            ts::return_to_sender(&scenario, access);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 6)]
    fun test_rent_listing_zero_hours_fails() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment,
                0u64, vector[], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 6)]
    fun test_rent_listing_too_many_hours_fails() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment,
                721u64, vector[], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: expire_rent fails before expiry ────────────────────────────────

    #[test]
    #[expected_failure(abort_code = 8)]
    fun test_expire_rent_fails_before_expiry() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment, 1u64,
                vector[1u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            // Clock is still at 0 — expiry at 3_600_000 — should fail
            walmarket::expire_rent(access, &clock);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_expire_rent_succeeds_after_expiry() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment, 1u64,
                vector[1u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // Advance clock past expiry
        clock::increment_for_testing(&mut clock, 3_600_001u64);

        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            walmarket::expire_rent(access, &clock);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: only owner can delist / update_pricing ─────────────────────────

    #[test]
    #[expected_failure(abort_code = 1)]
    fun test_delist_non_owner_fails() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::delist(&mut listing, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1)]
    fun test_update_pricing_non_owner_fails() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::update_pricing(
                &mut listing,
                option::none(),
                option::none(),
                option::none(),
                ts::ctx(&mut scenario),
            );
            ts::return_shared(listing);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: purchase_listing_with_access grants a permanent RentAccess ─────

    #[test]
    fun test_purchase_with_access_grants_permanent_access() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(1_000_000_000u64, ts::ctx(&mut scenario));
            walmarket::purchase_listing_with_access(
                &mut registry, &mut listing, payment, vector[9u8, 9u8, 9u8], &clock, ts::ctx(&mut scenario),
            );
            assert!(walmarket::listing_owner(&listing) == BUYER, 40);
            assert!(!walmarket::listing_is_active(&listing), 41);
            assert!(walmarket::registry_volume(&registry) == 1_000_000_000u64, 42);
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // Buyer receives a RentAccess that — unlike a timed rental — never expires:
        // expires_at is u64::MAX (PERMANENT_ACCESS_EXPIRY; the const is private to
        // the main module, so its literal value is duplicated here deliberately).
        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            assert!(walmarket::rent_access_expires(&access) == 18_446_744_073_709_551_615u64, 43);
            ts::return_to_sender(&scenario, access);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 3)] // ENotForSale
    fun test_purchase_with_access_requires_listing_for_sale() {
        // A listing created without a sale price can't be bought-with-access either —
        // purchase_listing_with_access carries its own ENotForSale guard (checked
        // before borrowing the Option, unlike purchase_listing's, so it actually fires).
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SELLER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            walmarket::create_listing(
                &mut registry,
                string::utf8(b"acc123"),
                string::utf8(b"sui-defi"),
                string::utf8(b"Rent-only listing"),
                string::utf8(b"Not for sale"),
                0u8, 100u64, 1_700_000_000_000u64,
                option::none(),                            // no sale price
                option::some(100_000_000u64),
                option::none(),
                &clock,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(1_000_000_000u64, ts::ctx(&mut scenario));
            // option::borrow on a None aborts with code 6 (the std::option vector-index
            // abort under the hood — surfaces before our own ENotForSale assert runs).
            walmarket::purchase_listing_with_access(
                &mut registry, &mut listing, payment, vector[9u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: seal_approve enforces "matching holder AND matching id" ────────

    #[test]
    fun test_seal_approve_succeeds_for_holder_with_matching_id() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment, 1u64, vector[1u8, 2u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            let id = object::id_to_bytes(&object::id(&access));
            walmarket::seal_approve(id, &access, ts::ctx(&mut scenario));
            ts::return_to_sender(&scenario, access);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 10)] // ENoSealAccess
    fun test_seal_approve_fails_for_mismatched_id() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment, 1u64, vector[1u8, 2u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            // Wrong id bytes — doesn't match this access object's real ID.
            walmarket::seal_approve(vector[0u8, 1u8, 2u8], &access, ts::ctx(&mut scenario));
            ts::return_to_sender(&scenario, access);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 10)] // ENoSealAccess
    fun test_seal_approve_fails_for_non_holder() {
        let mut scenario = ts::begin(SELLER);
        {
            walmarket::init_for_testing(ts::ctx(&mut scenario));
        };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(100_000_000u64, ts::ctx(&mut scenario));
            walmarket::rent_listing(
                &mut registry, &mut listing, payment, 1u64, vector[1u8, 2u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // SELLER (not the renter/holder) tries to approve decryption of the renter's key.
        ts::next_tx(&mut scenario, BUYER);
        {
            let access = ts::take_from_sender<RentAccess>(&scenario);
            let id = object::id_to_bytes(&object::id(&access));
            ts::next_tx(&mut scenario, SELLER);
            walmarket::seal_approve(id, &access, ts::ctx(&mut scenario));
            ts::return_to_address(BUYER, access);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: set_operator ────────────────────────────────────────────────────

    #[test]
    fun test_set_operator_succeeds_for_owner() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, SELLER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::set_operator(&mut listing, AGENT, ts::ctx(&mut scenario));
            assert!(walmarket::listing_operator(&listing) == AGENT, 50);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1)] // ENotOwner
    fun test_set_operator_fails_for_non_owner() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::set_operator(&mut listing, AGENT, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: request_query increments the per-buyer free-query counter ─────

    #[test]
    fun test_request_query_succeeds_and_increments_counter() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::request_query(&mut listing, string::utf8(b"What do you know?"), &clock, ts::ctx(&mut scenario));
            assert!(walmarket::listing_free_queries_used(&listing, BUYER) == 1, 60);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 12)] // EQueryLimitReached
    fun test_request_query_fails_past_free_limit() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            // MAX_FREE_QUERIES is 1 — the 2nd request must fail.
            let mut i = 0u64;
            while (i < 2) {
                walmarket::request_query(&mut listing, string::utf8(b"q"), &clock, ts::ctx(&mut scenario));
                i = i + 1;
            };
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 9)] // EInvalidMessage
    fun test_request_query_fails_for_empty_message() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::request_query(&mut listing, string::utf8(b""), &clock, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: submit_query_response is gated to the listing's operator ──────

    #[test]
    fun test_submit_query_response_succeeds_for_operator() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, SELLER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::set_operator(&mut listing, AGENT, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::request_query(&mut listing, string::utf8(b"What do you know?"), &clock, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, AGENT);
        {
            let listing = ts::take_shared<MemoryListing>(&scenario);
            let mut query = ts::take_shared<QueryRequest>(&scenario);
            walmarket::submit_query_response(
                &listing, &mut query, string::utf8(b"Here's what I know..."), 3u64, ts::ctx(&mut scenario),
            );
            assert!(option::is_some(walmarket::query_answer(&query)), 70);
            assert!(walmarket::query_memories_used(&query) == 3u64, 71);
            ts::return_shared(listing);
            ts::return_shared(query);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 11)] // ENotOperator
    fun test_submit_query_response_fails_for_non_operator() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::request_query(&mut listing, string::utf8(b"What do you know?"), &clock, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };

        // SELLER never called set_operator, so operator == SELLER (the default
        // at creation) — a random third party (BUYER) trying to answer must fail.
        ts::next_tx(&mut scenario, BUYER);
        {
            let listing = ts::take_shared<MemoryListing>(&scenario);
            let mut query = ts::take_shared<QueryRequest>(&scenario);
            walmarket::submit_query_response(
                &listing, &mut query, string::utf8(b"fake answer"), 0u64, ts::ctx(&mut scenario),
            );
            ts::return_shared(listing);
            ts::return_shared(query);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 13)] // EAlreadyAnswered
    fun test_submit_query_response_fails_if_already_answered() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            walmarket::request_query(&mut listing, string::utf8(b"What do you know?"), &clock, ts::ctx(&mut scenario));
            ts::return_shared(listing);
        };

        // Default operator (no set_operator call) is SELLER.
        ts::next_tx(&mut scenario, SELLER);
        {
            let listing = ts::take_shared<MemoryListing>(&scenario);
            let mut query = ts::take_shared<QueryRequest>(&scenario);
            walmarket::submit_query_response(
                &listing, &mut query, string::utf8(b"first answer"), 1u64, ts::ctx(&mut scenario),
            );
            ts::return_shared(listing);
            ts::return_shared(query);
        };

        ts::next_tx(&mut scenario, SELLER);
        {
            let listing = ts::take_shared<MemoryListing>(&scenario);
            let mut query = ts::take_shared<QueryRequest>(&scenario);
            walmarket::submit_query_response(
                &listing, &mut query, string::utf8(b"second answer"), 1u64, ts::ctx(&mut scenario),
            );
            ts::return_shared(listing);
            ts::return_shared(query);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: pay_per_query (streaming pricing) ──────────────────────────────

    #[test]
    fun test_pay_per_query_succeeds_and_credits_volume() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing_with_query_price(&mut scenario, &clock, option::some(10_000_000u64)); // 0.01 SUI/query

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(10_000_000u64, ts::ctx(&mut scenario));
            walmarket::pay_per_query(
                &mut registry, &mut listing, payment, string::utf8(b"What do you know?"), &clock, ts::ctx(&mut scenario),
            );
            // Unlike request_query, pay_per_query never touches the free-query counter.
            assert!(walmarket::listing_free_queries_used(&listing, BUYER) == 0, 80);
            assert!(walmarket::registry_volume(&registry) == 10_000_000u64, 81);
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // A second paid query from the same buyer must also succeed — there's no cap.
        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(10_000_000u64, ts::ctx(&mut scenario));
            walmarket::pay_per_query(
                &mut registry, &mut listing, payment, string::utf8(b"Anything else?"), &clock, ts::ctx(&mut scenario),
            );
            assert!(walmarket::registry_volume(&registry) == 20_000_000u64, 82);
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 14)] // EQueryPriceNotSet
    fun test_pay_per_query_fails_when_price_not_set() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock); // price_per_query_mist defaults to none

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(10_000_000u64, ts::ctx(&mut scenario));
            walmarket::pay_per_query(
                &mut registry, &mut listing, payment, string::utf8(b"q"), &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 5)] // EInsufficientPayment
    fun test_pay_per_query_fails_for_insufficient_payment() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing_with_query_price(&mut scenario, &clock, option::some(10_000_000u64));

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(1_000_000u64, ts::ctx(&mut scenario)); // too little
            walmarket::pay_per_query(
                &mut registry, &mut listing, payment, string::utf8(b"q"), &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ─── Test: submit_review requires holding a matching RentAccess ──────────

    #[test]
    fun test_submit_review_succeeds_and_updates_rating() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(1_000_000_000u64, ts::ctx(&mut scenario));
            walmarket::purchase_listing_with_access(
                &mut registry, &mut listing, payment, vector[1u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let access = ts::take_from_sender<RentAccess>(&scenario);
            walmarket::submit_review(
                &mut listing, &access, 5u8, string::utf8(b"Great memory, very accurate"), &clock, ts::ctx(&mut scenario),
            );
            assert!(walmarket::listing_rating_sum(&listing) == 5, 90);
            assert!(walmarket::listing_review_count(&listing) == 1, 91);
            ts::return_to_sender(&scenario, access);
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let review = ts::take_shared<Review>(&scenario);
            assert!(walmarket::review_rating(&review) == 5u8, 92);
            ts::return_shared(review);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 16)] // ENotAccessHolder
    fun test_submit_review_fails_for_non_access_holder() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(1_000_000_000u64, ts::ctx(&mut scenario));
            walmarket::purchase_listing_with_access(
                &mut registry, &mut listing, payment, vector[1u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        // SELLER never bought/rented this listing — has no RentAccess of their own,
        // so this test simulates the only way to even attempt the call: using the
        // buyer's access object but signing as someone else.
        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let access = ts::take_from_sender<RentAccess>(&scenario);
            ts::next_tx(&mut scenario, SELLER);
            walmarket::submit_review(
                &mut listing, &access, 5u8, string::utf8(b"not actually mine"), &clock, ts::ctx(&mut scenario),
            );
            ts::return_to_address(BUYER, access);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 15)] // EInvalidRating
    fun test_submit_review_fails_for_invalid_rating() {
        let mut scenario = ts::begin(SELLER);
        { walmarket::init_for_testing(ts::ctx(&mut scenario)); };
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        make_listing(&mut scenario, &clock);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut registry = ts::take_shared<WalMarketRegistry>(&scenario);
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let payment = coin::mint_for_testing<SUI>(1_000_000_000u64, ts::ctx(&mut scenario));
            walmarket::purchase_listing_with_access(
                &mut registry, &mut listing, payment, vector[1u8], &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(listing);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut listing = ts::take_shared<MemoryListing>(&scenario);
            let access = ts::take_from_sender<RentAccess>(&scenario);
            walmarket::submit_review(
                &mut listing, &access, 6u8, string::utf8(b"out of range"), &clock, ts::ctx(&mut scenario),
            );
            ts::return_to_sender(&scenario, access);
            ts::return_shared(listing);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
