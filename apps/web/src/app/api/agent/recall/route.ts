import { NextRequest, NextResponse } from 'next/server';
import { MemWalConnector } from '@walmarket/sdk';

interface RecallBody {
  namespace: string;
  accountId: string;
  delegateKey: string;
  query: string;
  limit?: number;
}

// POST /api/agent/recall
// Machine-native recall endpoint — identical semantics to /api/memwal/recall
// but namespaced under /api/agent for agent-specific monitoring and rate limiting.
// No session or OAuth required; the delegate key IS the access credential.
export async function POST(req: NextRequest) {
  let body: Partial<RecallBody>;
  try {
    body = (await req.json()) as Partial<RecallBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { namespace, accountId, delegateKey, query, limit = 5 } = body;

  if (!namespace || !accountId || !delegateKey || !query) {
    return NextResponse.json(
      {
        error: 'missing_fields',
        required: ['namespace', 'accountId', 'delegateKey', 'query'],
        received: Object.keys(body ?? {}),
      },
      { status: 400 },
    );
  }

  const relayerUrl = process.env.MEMWAL_RELAYER_URL;
  if (!relayerUrl) {
    return NextResponse.json({ error: 'Relayer not configured on this server' }, { status: 500 });
  }

  try {
    const connector = new MemWalConnector({
      accountId,
      namespace,
      relayerUrl,
      privateKey: delegateKey,
    });

    const results = await connector.recall(query, Math.min(20, Math.max(1, limit)));

    return NextResponse.json(
      { results, count: results.length },
      { headers: { 'X-WalMarket-Version': '1' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Recall failed' },
      { status: 502 },
    );
  }
}
