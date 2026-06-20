import { NextRequest, NextResponse } from 'next/server';
import { getServerWalMarketClient } from '@/lib/sui-server';

// GET /api/agent/query/:id
// Read-only poll for a try-before-you-buy QueryRequest's answer. No auth required —
// QueryRequest is a public shared object on-chain, so this is just a convenience
// read (the agent could equally call client.getObject itself). `answer` is null
// until the seller's agent calls submit_query_response.
//
// Pairs with the `payment.query` block returned by GET /api/agent/listings/:id —
// see that route for how to submit a query in the first place.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const client = getServerWalMarketClient();
    const { answer, memoriesUsed } = await client.getQueryResponse(id);

    return NextResponse.json(
      { ok: true, queryId: id, answer, memoriesUsed, pending: answer === null },
      { headers: { 'X-WalMarket-Version': '1' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to read query' },
      { status: 502 },
    );
  }
}
