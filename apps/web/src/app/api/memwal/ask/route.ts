import { NextRequest, NextResponse } from 'next/server';
import { MemWalConnector } from '@walmarket/sdk';

interface AskBody {
  accountId: string;
  namespace: string;
  delegateKey: string;
  question: string;
  limit?: number;
}

export async function POST(req: NextRequest) {
  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { accountId, namespace, delegateKey, question, limit = 5 } = body;
  if (!accountId || !namespace || !delegateKey || !question) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const relayerUrl = process.env.MEMWAL_RELAYER_URL;
  if (!relayerUrl) {
    return NextResponse.json({ error: 'Relayer not configured' }, { status: 500 });
  }

  try {
    const connector = new MemWalConnector({ accountId, namespace, relayerUrl, privateKey: delegateKey });
    const { answer, memoriesUsed } = await connector.ask(question, namespace, accountId, limit);
    return NextResponse.json({ answer, memoriesUsed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ask failed' },
      { status: 502 },
    );
  }
}
