import { NextRequest, NextResponse } from 'next/server';
import { recordListingId } from '@/lib/managed-provision';

interface FinalizeBody {
  accountId: string;
  listingId: string;
}

// POST /api/managed-memory/finalize
// Bookkeeping only — records which on-chain listing a provisioned managed
// account ended up backing, once the seller's createListing tx confirms. Not
// load-bearing for the agent loop itself (that's keyed off the listing's live
// `operator` field, not this row), just useful for a future "my listings" view.
export async function POST(req: NextRequest) {
  let body: Partial<FinalizeBody>;
  try {
    body = (await req.json()) as Partial<FinalizeBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.accountId || !body.listingId) {
    return NextResponse.json({ error: 'accountId and listingId are required' }, { status: 400 });
  }

  try {
    await recordListingId(body.accountId, body.listingId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to finalize' }, { status: 500 });
  }
}
