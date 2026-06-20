import { NextRequest, NextResponse } from 'next/server';
import { provisionManagedAccount } from '@/lib/managed-provision';

interface ProvisionBody {
  memories: string[];
  namespaceHint: string;
}

// POST /api/managed-memory/provision
// "Let WalMarket handle everything" — creates a fresh, WalMarket-owned MemWal
// account, ingests the seller's pasted memory content into it, and starts the
// agent loop for it immediately. The frontend then creates the WalMarket listing
// itself (signed by the seller's own wallet) using the accountId/namespace
// returned here, and calls setOperator to point at operatorAddress.
export async function POST(req: NextRequest) {
  let body: Partial<ProvisionBody>;
  try {
    body = (await req.json()) as Partial<ProvisionBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const memories = (body.memories ?? []).map(m => m.trim()).filter(Boolean);
  if (memories.length === 0) {
    return NextResponse.json({ error: 'memories must be a non-empty array of strings' }, { status: 400 });
  }
  if (memories.length > 200) {
    return NextResponse.json({ error: 'Too many memories in one request (max 200) — split into multiple listings' }, { status: 400 });
  }

  try {
    const result = await provisionManagedAccount(memories, body.namespaceHint || 'managed-memory');
    return NextResponse.json(result, { headers: { 'X-WalMarket-Version': '1' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to provision managed account' },
      { status: 502 },
    );
  }
}
