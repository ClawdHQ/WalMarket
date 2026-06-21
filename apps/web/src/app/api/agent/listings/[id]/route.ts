import { NextRequest, NextResponse } from 'next/server';
import { getServerWalMarketClient, AGENT_API_PACKAGE_ID, AGENT_API_LATEST_PKG, AGENT_API_REGISTRY_ID, AGENT_API_NETWORK, AGENT_API_RPC } from '@/lib/sui-server';
import type { MemoryListing } from '@walmarket/sdk';

const CATEGORIES = ['Research', 'Trading', 'Legal', 'Code', 'General'];

function serialize(l: MemoryListing) {
  return {
    id: l.id,
    owner: l.owner,
    accountId: l.accountId,
    namespace: l.namespace,
    title: l.title,
    description: l.description,
    category: l.category,
    categoryLabel: CATEGORIES[l.category] ?? 'General',
    memoryCount: l.memoryCount,
    oldestMemoryEpoch: l.oldestMemoryEpoch,
    salePriceMist: l.salePriceMist?.toString() ?? null,
    salePriceSui: l.salePriceMist ? (Number(l.salePriceMist) / 1e9).toFixed(4) : null,
    rentPricePerHourMist: l.rentPricePerHourMist?.toString() ?? null,
    rentPricePerHourSui: l.rentPricePerHourMist ? (Number(l.rentPricePerHourMist) / 1e9).toFixed(4) : null,
    pricePerQueryMist: l.pricePerQueryMist?.toString() ?? null,
    pricePerQuerySui: l.pricePerQueryMist ? (Number(l.pricePerQueryMist) / 1e9).toFixed(4) : null,
    isActive: l.isActive,
    createdAt: l.createdAt,
    reviewCount: l.reviewCount,
    averageRating: l.reviewCount > 0 ? Math.round((l.ratingSum / l.reviewCount) * 10) / 10 : null,
  };
}

// GET /api/agent/listings/:id
// Returns listing details + full x402-style payment instructions.
// Always returns 200 with payment details — the 402 is informational (what to pay),
// not blocking. The actual access gate is POST /api/agent/access.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const address = req.nextUrl.searchParams.get('address');

  try {
    const client = getServerWalMarketClient();
    await client.indexer.start();

    const listing = await client.getListingById(id);
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const sl = serialize(listing);
    // Only computed when ?address= is given — saves a devInspect call for agents
    // that are just browsing, not about to test/buy.
    const freeQueriesUsed = address ? await client.getFreeQueriesUsed(id, address) : null;

    // Build payment instruction object — mirrors the Coinbase x402 pattern but on Sui.
    const payment = {
      scheme: 'sui-move-walmarket',
      version: '1',
      network: AGENT_API_NETWORK,
      rpc: AGENT_API_RPC,
      packageId: AGENT_API_PACKAGE_ID,
      latestPackageId: AGENT_API_LATEST_PKG,
      registryId: AGENT_API_REGISTRY_ID,
      listingId: listing.id,
      purchase: listing.salePriceMist !== null
        ? {
            function: 'purchase_listing_with_access',
            amountMist: listing.salePriceMist.toString(),
            amountSui: (Number(listing.salePriceMist) / 1e9).toFixed(4),
            moveCallTarget: `${AGENT_API_LATEST_PKG}::walmarket::purchase_listing_with_access`,
            args: ['registryId', 'listingId', 'coin(amountMist)', 'delegateKeyPublic:vector<u8>', 'clock(0x6)'],
          }
        : null,
      rent: listing.rentPricePerHourMist !== null
        ? {
            function: 'rent_listing',
            pricePerHourMist: listing.rentPricePerHourMist.toString(),
            pricePerHourSui: (Number(listing.rentPricePerHourMist) / 1e9).toFixed(4),
            moveCallTarget: `${AGENT_API_PACKAGE_ID}::walmarket::rent_listing`,
            args: ['registryId', 'listingId', 'coin(totalMist)', 'durationHours:u64', 'delegateKeyPublic:vector<u8>', 'clock(0x6)'],
          }
        : null,
      // Free try-before-you-buy: 1 message per (your address, this listing), answered
      // by the seller's own agent with a real AI-generated response from the live
      // namespace — same mechanism humans get via the listing page's chat widget, just
      // callable without a browser. The cap is enforced on-chain, not just here.
      query: {
        function: 'request_query',
        maxFreeQueries: 1,
        moveCallTarget: `${AGENT_API_LATEST_PKG}::walmarket::request_query`,
        args: ['listingId', 'message:string', 'clock(0x6)'],
        checkAnswerEndpoint: '/api/agent/query/:queryId',
        freeQueriesUsedEndpoint: `/api/agent/listings/${listing.id}?address=<yourAddress>`,
      },
      // Streaming/pay-per-query: unlimited (no free-cap), pay a flat micropayment
      // every message instead of buying full access up front — fits an agent
      // that wants to keep paying small amounts as it goes. null if the seller
      // hasn't opted in (see update_pricing/set sale or rent price instead).
      payPerQuery: listing.pricePerQueryMist !== null
        ? {
            function: 'pay_per_query',
            pricePerQueryMist: listing.pricePerQueryMist.toString(),
            pricePerQuerySui: (Number(listing.pricePerQueryMist) / 1e9).toFixed(4),
            moveCallTarget: `${AGENT_API_LATEST_PKG}::walmarket::pay_per_query`,
            args: ['registryId', 'listingId', 'coin(pricePerQueryMist)', 'message:string', 'clock(0x6)'],
            checkAnswerEndpoint: '/api/agent/query/:queryId',
          }
        : null,
      verifyEndpoint: '/api/agent/access',
      recallEndpoint: '/api/agent/recall',
      discoverEndpoint: '/api/agent/discover?need=<plain language description>',
      instructions: [
        '1. Generate an Ed25519 keypair as your delegate key (the private key stays with you).',
        '2. (Optional) Call query.moveCallTarget with a message to test this namespace for free before paying — read the QueryRequested event for your queryId, then GET /api/agent/query/:queryId until answer is non-null.',
        '3. Submit a Sui transaction calling purchase.moveCallTarget (or rent.moveCallTarget) with your delegate public key bytes — or, for ongoing usage, keep calling payPerQuery.moveCallTarget per message instead of buying full access.',
        '4. POST { listingId, txDigest, delegateKeyHex } to /api/agent/access to verify and retrieve access metadata.',
        '5. POST { namespace, accountId, delegateKey: hex, query } to /api/agent/recall to query memories.',
      ],
    };

    return NextResponse.json(
      { listing: sl, freeQueriesUsed, payment },
      { headers: { 'X-WalMarket-Version': '1', 'X-Payment-Scheme': 'sui-move-walmarket' } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load listing' }, { status: 502 });
  }
}
