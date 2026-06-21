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

// GET /api/agent/listings
// Machine-readable listing browse — no auth required.
// Query params: category (0–4), onlyActive (true/false, default true), limit (default 20, max 100), cursor (offset index)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const categoryRaw = sp.get('category');
  const onlyActive  = sp.get('onlyActive') !== 'false';
  const limit       = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '20')));
  const cursor      = Math.max(0, Number(sp.get('cursor') ?? '0'));

  try {
    const client = getServerWalMarketClient();
    await client.indexer.start();

    const filter = {
      onlyActive,
      ...(categoryRaw !== null ? { category: Number(categoryRaw) } : {}),
    };

    const all    = client.indexer.getAll(filter);
    const slice  = all.slice(cursor, cursor + limit);
    const next   = cursor + limit < all.length ? cursor + limit : null;

    return NextResponse.json(
      {
        listings: slice.map(serialize),
        total:    all.length,
        cursor,
        next,
        _meta: {
          network: AGENT_API_NETWORK,
          packageId: AGENT_API_PACKAGE_ID,
          latestPackageId: AGENT_API_LATEST_PKG,
          registryId: AGENT_API_REGISTRY_ID,
          rpc: AGENT_API_RPC,
          accessEndpoint: '/api/agent/access',
          recallEndpoint: '/api/agent/recall',
          discoverEndpoint: '/api/agent/discover?need=<plain language description>',
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30',
          'X-WalMarket-Version': '1',
        },
      },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load listings' }, { status: 502 });
  }
}
