import { NextRequest, NextResponse } from 'next/server';
import { MemWalConnector } from '@walmarket/sdk';

interface RecallBody {
  accountId: string;
  namespace: string;
  delegateKey: string;
  query: string;
  limit?: number;
}

export async function POST(req: NextRequest) {
  let body: RecallBody;
  try {
    body = (await req.json()) as RecallBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { accountId, namespace, delegateKey, query, limit = 5 } = body;
  if (!accountId || !namespace || !delegateKey || !query) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const relayerUrl = process.env.MEMWAL_RELAYER_URL;
  if (!relayerUrl) {
    return NextResponse.json({ error: 'Relayer not configured' }, { status: 500 });
  }

  try {
    const connector = new MemWalConnector({ accountId, namespace, relayerUrl, privateKey: delegateKey });
    const results = await connector.recall(query, limit);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Recall failed' },
      { status: 502 },
    );
  }
}
