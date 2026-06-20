import { NextRequest, NextResponse } from 'next/server';
import { serverSuiClient, getServerWalMarketClient, AGENT_API_PACKAGE_ID, AGENT_API_LATEST_PKG, AGENT_API_REGISTRY_ID, AGENT_API_NETWORK, AGENT_API_RPC } from '@/lib/sui-server';

interface AccessBody {
  listingId: string;
  txDigest: string;
  delegateKeyHex: string;
}

// POST /api/agent/access
// Verifies that a Sui transaction actually purchased or rented a WalMarket listing,
// then returns the access metadata (namespace + accountId) the agent needs for recall.
//
// x402-style 402 response is returned when `listingId` is provided but `txDigest` is
// omitted — this makes the payment discovery flow symmetric with Coinbase x402:
//   1. Agent GETs /api/agent/listings/:id  →  learns price & moveCallTarget
//   2. Agent signs & submits Sui tx
//   3. Agent POSTs here with { listingId, txDigest, delegateKeyHex }  →  gets namespace
export async function POST(req: NextRequest) {
  let body: Partial<AccessBody>;
  try {
    body = (await req.json()) as Partial<AccessBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { listingId, txDigest, delegateKeyHex } = body;

  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  // No txDigest → 402: tell the agent what to pay
  if (!txDigest) {
    try {
      const client = getServerWalMarketClient();
      await client.indexer.start();
      const listing = await client.getListingById(listingId);

      const payment402 = {
        error: 'payment_required',
        scheme: 'sui-move-walmarket',
        version: '1',
        network: AGENT_API_NETWORK,
        rpc: AGENT_API_RPC,
        listing: listing
          ? {
              id: listing.id,
              title: listing.title,
              namespace: listing.namespace,
              memoryCount: listing.memoryCount,
              salePriceMist: listing.salePriceMist?.toString() ?? null,
              salePriceSui: listing.salePriceMist ? (Number(listing.salePriceMist) / 1e9).toFixed(4) : null,
              rentPricePerHourMist: listing.rentPricePerHourMist?.toString() ?? null,
            }
          : null,
        payment: {
          packageId: AGENT_API_PACKAGE_ID,
          latestPackageId: AGENT_API_LATEST_PKG,
          registryId: AGENT_API_REGISTRY_ID,
          listingId,
          purchase: listing?.salePriceMist != null
            ? {
                moveCallTarget: `${AGENT_API_LATEST_PKG}::walmarket::purchase_listing_with_access`,
                amountMist: listing.salePriceMist.toString(),
                args: ['registryId', 'listingId', 'coin(amountMist)', 'delegateKeyPublic:vector<u8>', 'clock(0x6)'],
              }
            : null,
          rent: listing?.rentPricePerHourMist != null
            ? {
                moveCallTarget: `${AGENT_API_PACKAGE_ID}::walmarket::rent_listing`,
                pricePerHourMist: listing.rentPricePerHourMist.toString(),
                args: ['registryId', 'listingId', 'coin(totalMist)', 'durationHours:u64', 'delegateKeyPublic:vector<u8>', 'clock(0x6)'],
              }
            : null,
        },
        instructions: [
          '1. Generate an Ed25519 keypair — the private key is your delegate key and never leaves your agent.',
          '2. Call the moveCallTarget above with your delegate public key as vector<u8>.',
          '3. Retry this endpoint with { listingId, txDigest, delegateKeyHex } once the tx is finalized.',
        ],
      };

      return NextResponse.json(payment402, {
        status: 402,
        headers: {
          'X-Payment-Scheme': 'sui-move-walmarket',
          'X-WalMarket-Version': '1',
        },
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load listing' }, { status: 502 });
    }
  }

  // txDigest provided → verify on-chain
  if (!delegateKeyHex) {
    return NextResponse.json({ error: 'delegateKeyHex is required alongside txDigest' }, { status: 400 });
  }

  try {
    // Fetch the transaction and its events from Sui
    const tx = await serverSuiClient.getTransactionBlock({
      digest: txDigest,
      options: { showEffects: true, showEvents: true },
    });

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found on chain' }, { status: 404 });
    }

    const effects = tx.effects as { status?: { status: string } } | null;
    if (effects?.status?.status !== 'success') {
      return NextResponse.json({ error: 'Transaction did not succeed on-chain' }, { status: 422 });
    }

    const events = (tx.events ?? []) as Array<{ type: string; parsedJson: Record<string, unknown> }>;

    // Accept both purchase_listing_with_access (RentStarted) and rent_listing (RentStarted)
    const rentEvt = events.find(e =>
      (e.type.includes('::RentStarted') || e.type.includes('::PurchaseCompleted')) &&
      (e.parsedJson?.['listing_id'] === listingId || !e.parsedJson?.['listing_id'])
    );

    if (!rentEvt) {
      // Also try matching any RentStarted if listing_id field isn't present
      const anyRent = events.find(e => e.type.includes('::RentStarted') || e.type.includes('::PurchaseCompleted'));
      if (!anyRent) {
        return NextResponse.json(
          { error: 'No RentStarted or PurchaseCompleted event found in this transaction. Ensure you called purchase_listing_with_access or rent_listing.' },
          { status: 422 },
        );
      }
    }

    // Fetch listing metadata so the agent gets namespace + accountId
    const client = getServerWalMarketClient();
    await client.indexer.start();
    const listing = await client.getListingById(listingId);

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found — it may have been delisted' }, { status: 404 });
    }

    const accessEvt = (rentEvt ?? events.find(e => e.type.includes('::RentStarted')))!;
    const accessId  = (accessEvt?.parsedJson?.['access_id'] as string) ?? null;

    return NextResponse.json(
      {
        ok: true,
        accessId,
        listingId,
        namespace: listing.namespace,
        accountId: listing.accountId,
        owner: listing.owner,
        memoryCount: listing.memoryCount,
        delegateKeyHex,
        recallEndpoint: '/api/agent/recall',
        instructions: 'POST { namespace, accountId, delegateKey: delegateKeyHex, query } to /api/agent/recall to query memories.',
      },
      { headers: { 'X-WalMarket-Version': '1' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'On-chain verification failed' },
      { status: 502 },
    );
  }
}
