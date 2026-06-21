import { NextRequest, NextResponse } from 'next/server';
import { getServerWalMarketClient, AGENT_API_PACKAGE_ID, AGENT_API_LATEST_PKG, AGENT_API_REGISTRY_ID, AGENT_API_NETWORK, AGENT_API_RPC } from '@/lib/sui-server';
import type { MemoryListing } from '@walmarket/sdk';

const CATEGORIES = ['Research', 'Trading', 'Legal', 'Code', 'General'];
const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'with', 'on', 'in', 'to', 'is', 'i', 'need', 'looking', 'want', 'about']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

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

// Relevance scoring: keyword overlap between the `need` query and each
// listing's title/description/category (title matches weighted highest,
// category exact-match next), plus a small on-chain-reputation tie-breaker —
// this is the concrete "discovery layer" + "reputation signals" pairing
// described for agent-to-agent commerce: an agent looking for "Sui DeFi
// domain knowledge" finds the right listing without a human curating it,
// and well-reviewed listings rank slightly ahead of otherwise-equal matches.
// Deliberately simple/inspectable (no embedding index) rather than a black
// box — every point in the score is attributable to a specific word match.
function scoreListing(needWords: string[], listing: MemoryListing): number {
  const titleWords = tokenize(listing.title);
  const descWords = tokenize(listing.description);
  const categoryLabel = (CATEGORIES[listing.category] ?? 'General').toLowerCase();

  let score = 0;
  for (const word of needWords) {
    if (titleWords.includes(word)) score += 3;
    if (descWords.includes(word)) score += 1;
    if (categoryLabel === word || categoryLabel.includes(word)) score += 2;
  }

  if (listing.reviewCount > 0) {
    const avgRating = listing.ratingSum / listing.reviewCount;
    // Small, capped boost — reputation breaks ties, it doesn't override relevance.
    score += Math.min(1, (avgRating - 1) / 4) * Math.min(listing.reviewCount, 5) * 0.1;
  }

  return score;
}

// GET /api/agent/discover?need=<plain language description>&limit=<n>
// Lets an agent describe what it needs instead of browsing/filtering by
// category by hand — e.g. ?need=Sui%20DeFi%20liquidity%20research returns
// active listings ranked by relevance, with on-chain reputation as a
// tie-breaker. No auth required, same as /api/agent/listings.
export async function GET(req: NextRequest) {
  const need = req.nextUrl.searchParams.get('need');
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? '10')));

  if (!need || !need.trim()) {
    return NextResponse.json({ error: 'need query param is required, e.g. ?need=Sui DeFi research' }, { status: 400 });
  }

  try {
    const client = getServerWalMarketClient();
    await client.indexer.start();

    const needWords = tokenize(need);
    const active = client.indexer.getAll({ onlyActive: true });

    const ranked = active
      .map(listing => ({ listing, score: scoreListing(needWords, listing) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ listing, score }) => ({ ...serialize(listing), relevanceScore: Math.round(score * 10) / 10 }));

    return NextResponse.json(
      {
        need,
        results: ranked,
        _meta: {
          network: AGENT_API_NETWORK,
          packageId: AGENT_API_PACKAGE_ID,
          latestPackageId: AGENT_API_LATEST_PKG,
          registryId: AGENT_API_REGISTRY_ID,
          rpc: AGENT_API_RPC,
        },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30', 'X-WalMarket-Version': '1' } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Discovery failed' }, { status: 502 });
  }
}
