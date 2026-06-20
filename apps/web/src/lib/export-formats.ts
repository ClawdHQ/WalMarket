export interface ExportContext {
  namespace: string;
  accountId: string;
  relayerUrl: string;
  privateKey: string;
  listingTitle: string;
  memoryCount: number;
}

export interface ExportFormat {
  id: string;
  label: string;
  group: 'file' | 'code' | 'prompt';
  filename?: string;
  language?: string;
  generate: (ctx: ExportContext) => string;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  // MemWal has no push/routing API — every memory operation (remember, recall,
  // analyze, ask) is a signed pull authenticated by a delegate key, resolved
  // against the relayer's /api/* routes (see docs.wal.app/walrus-memory/relayer).
  // The MCP server is the one mechanism that gets close to "hand memory to a
  // destination agent": it exposes recall/remember as tools an MCP-aware agent
  // calls on its own. The Streamable HTTP transport is the right shape for a
  // marketplace purchase specifically, because it authenticates with a bearer
  // delegate key + account-id header directly — no memwal_login browser flow,
  // no local wallet ownership assumption, just the credentials this listing
  // already issued at purchase time.
  {
    id: 'mcp',
    label: 'MCP Server (Claude, Cursor, …)',
    group: 'file',
    filename: '.mcp.json',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) =>
      JSON.stringify({
        mcpServers: {
          [`walmarket-${namespace}`]: {
            url: `${relayerUrl}/api/mcp`,
            headers: {
              Authorization: `Bearer ${privateKey}`,
              'x-memwal-account-id': accountId,
            },
          },
        },
      }, null, 2),
  },

  {
    id: 'claude-code',
    label: 'Claude Code',
    group: 'file',
    filename: 'CLAUDE.md',
    generate: ({ namespace, accountId, relayerUrl, privateKey, listingTitle, memoryCount }) => `\
# Memory Context — ${listingTitle}

This workspace has access to a purchased MemWal memory namespace
(${memoryCount.toLocaleString()} memories on Walrus/Sui testnet).

## Quick start

\`\`\`typescript
import { MemWal } from '@mysten-incubation/memwal';

const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});

// Recall context before answering
const { results } = await mem.recall({ query: '<user question>', limit: 5 });
const context = results.map(r => r.text).join('\\n---\\n');
\`\`\`

Prefer the MCP export instead of this snippet if your agent supports MCP — it lets
Claude Code call recall/remember tools on its own instead of you wiring the SDK by hand.

## Connection details

| Field       | Value                    |
|-------------|--------------------------|
| Namespace   | \`${namespace}\`         |
| Account ID  | \`${accountId}\`         |
| Relayer     | \`${relayerUrl}\`        |
| Delegate key | \`${privateKey}\`       |
`,
  },

  {
    id: 'cursor',
    label: 'Cursor',
    group: 'file',
    filename: '.cursorrules',
    generate: ({ namespace, accountId, relayerUrl, privateKey, listingTitle, memoryCount }) => `\
# WalMarket Memory: ${listingTitle}
# ${memoryCount.toLocaleString()} memories available via MemWal SDK

You have access to a purchased AI memory namespace on Walrus/Sui.
Before answering questions in this domain, recall relevant context:

\`\`\`typescript
import { MemWal } from '@mysten-incubation/memwal';
const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});
const { results } = await mem.recall({ query: QUERY, limit: 5 });
\`\`\`

Namespace: ${namespace}
Account:   ${accountId}
`,
  },

  {
    id: 'copilot',
    label: 'GitHub Copilot',
    group: 'file',
    filename: '.github/copilot-instructions.md',
    generate: ({ namespace, accountId, relayerUrl, privateKey, listingTitle }) => `\
# Memory: ${listingTitle}

This repository has access to a purchased MemWal memory namespace on Walrus.
Use the MemWal SDK to recall prior knowledge before generating code or answers.

\`\`\`typescript
import { MemWal } from '@mysten-incubation/memwal';
const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});
\`\`\`
`,
  },

  {
    id: 'openai',
    label: 'OpenAI / ChatGPT',
    group: 'code',
    language: 'typescript',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
import OpenAI from 'openai';
import { MemWal } from '@mysten-incubation/memwal';

const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});

const openai = new OpenAI();

async function chatWithMemory(userMessage: string) {
  const { results } = await mem.recall({ query: userMessage, limit: 5 });
  const context = results.map(r => r.text).join('\\n---\\n');

  return openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: \`Relevant memory context:\\n\${context}\` },
      { role: 'user', content: userMessage },
    ],
  });
}`,
  },

  {
    id: 'claude-api',
    label: 'Claude API',
    group: 'code',
    language: 'typescript',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
import Anthropic from '@anthropic-ai/sdk';
import { MemWal } from '@mysten-incubation/memwal';

const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});

const anthropic = new Anthropic();

async function chatWithMemory(userMessage: string) {
  const { results } = await mem.recall({ query: userMessage, limit: 5 });
  const context = results.map(r => r.text).join('\\n---\\n');

  return anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: \`Relevant memory context:\\n\${context}\`,
    messages: [{ role: 'user', content: userMessage }],
  });
}`,
  },

  {
    id: 'vercel-ai',
    label: 'Vercel AI SDK',
    group: 'code',
    language: 'typescript',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MemWal } from '@mysten-incubation/memwal';

const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});

async function chatWithMemory(userMessage: string) {
  const { results } = await mem.recall({ query: userMessage, limit: 5 });
  const context = results.map(r => r.text).join('\\n---\\n');

  return generateText({
    model: openai('gpt-4o'),
    system: \`Relevant memory context:\\n\${context}\`,
    prompt: userMessage,
  });
}`,
  },

  {
    id: 'langchain',
    label: 'LangChain',
    group: 'code',
    language: 'python',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
# pip install langchain langchain-openai
from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage
import subprocess, json

def recall(query: str, limit: int = 5) -> list[str]:
    # Use the MemWal JS SDK via a small helper script, or call the relayer REST API
    result = subprocess.run(
        ["node", "-e", f"""
const {{ MemWal }} = require('@mysten-incubation/memwal');
const mem = MemWal.create({{
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
}});
mem.recall({{ query: {json.dumps(query)}, limit: {limit} }})
  .then(r => console.log(JSON.stringify(r.results.map(x => x.text))));
"""],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

llm = ChatOpenAI(model="gpt-4o")

def chat_with_memory(user_message: str) -> str:
    context = "\\n---\\n".join(recall(user_message))
    messages = [
        SystemMessage(content=f"Relevant memory context:\\n{context}"),
        HumanMessage(content=user_message),
    ]
    return llm.invoke(messages).content`,
  },

  {
    id: 'deepseek',
    label: 'Deepseek',
    group: 'code',
    language: 'python',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
# pip install openai  (Deepseek is OpenAI-compatible)
from openai import OpenAI
# (use same recall() helper from the LangChain snippet to fetch context)

client = OpenAI(
    api_key="YOUR_DEEPSEEK_API_KEY",
    base_url="https://api.deepseek.com",
)

def chat_with_memory(user_message: str, context: str) -> str:
    # context = "\\n---\\n".join(recall(user_message))  # from MemWal
    return client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": f"Memory context:\\n{context}"},
            {"role": "user",   "content": user_message},
        ],
    ).choices[0].message.content

# MemWal connection
# namespace:  ${namespace}
# accountId:  ${accountId}
# relayer:    ${relayerUrl}
# key:        ${privateKey}`,
  },

  {
    id: 'gemini',
    label: 'Gemini',
    group: 'code',
    language: 'python',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
# pip install google-generativeai
import google.generativeai as genai
# (use same recall() helper from the LangChain snippet to fetch context)

genai.configure(api_key="YOUR_GEMINI_API_KEY")
model = genai.GenerativeModel("gemini-2.0-flash")

def chat_with_memory(user_message: str, context: str) -> str:
    # context = "\\n---\\n".join(recall(user_message))  # from MemWal
    prompt = f"Memory context:\\n{context}\\n\\nUser: {user_message}"
    return model.generate_content(prompt).text

# MemWal connection
# namespace:  ${namespace}
# accountId:  ${accountId}
# relayer:    ${relayerUrl}
# key:        ${privateKey}`,
  },

  {
    id: 'openclaw',
    label: 'OpenClaw',
    group: 'code',
    language: 'typescript',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
import { MemWal } from '@mysten-incubation/memwal';

// Drop this connector into any OpenClaw agent's context step
export const memwalConnector = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});

export async function recallContext(query: string, limit = 5): Promise<string> {
  const { results } = await memwalConnector.recall({ query, limit });
  return results.map(r => r.text).join('\\n---\\n');
}`,
  },

  {
    id: 'antigravity',
    label: 'Antigravity',
    group: 'code',
    language: 'typescript',
    generate: ({ namespace, accountId, relayerUrl, privateKey }) => `\
// antigravity.config.ts — memory plugin
import { MemWal } from '@mysten-incubation/memwal';

export const memoryPlugin = {
  name: 'walmarket-memory',
  async recall(query: string) {
    const mem = MemWal.create({
      key: '${privateKey}',
      accountId: '${accountId}',
      serverUrl: '${relayerUrl}',
      namespace: '${namespace}',
    });
    const { results } = await mem.recall({ query, limit: 5 });
    return results.map(r => r.text).join('\\n---\\n');
  },
};`,
  },

  {
    id: 'manus',
    label: 'Manus',
    group: 'code',
    language: 'typescript',
    generate: ({ namespace, accountId, relayerUrl, privateKey, listingTitle }) => `\
// manus-memory-tool.ts
import { MemWal } from '@mysten-incubation/memwal';

export const walmarketMemoryTool = {
  name: 'recall_memory',
  description: 'Recall relevant context from purchased WalMarket memory: ${listingTitle}',
  parameters: {
    query: { type: 'string', description: 'What to look up in memory' },
    limit: { type: 'number', default: 5 },
  },
  async execute({ query, limit = 5 }: { query: string; limit?: number }) {
    const mem = MemWal.create({
      key: '${privateKey}',
      accountId: '${accountId}',
      serverUrl: '${relayerUrl}',
      namespace: '${namespace}',
    });
    const { results } = await mem.recall({ query, limit });
    return results.map(r => ({ text: r.text, score: r.distance }));
  },
};`,
  },

  {
    id: 'system-prompt',
    label: 'System Prompt',
    group: 'prompt',
    generate: ({ namespace, accountId, relayerUrl, privateKey, listingTitle, memoryCount }) => `\
You have access to a purchased AI memory from WalMarket: "${listingTitle}" (${memoryCount.toLocaleString()} memories).

To recall relevant context before answering, use the MemWal SDK:

npm install @mysten-incubation/memwal

\`\`\`javascript
const { MemWal } = require('@mysten-incubation/memwal');
const mem = MemWal.create({
  key: '${privateKey}',
  accountId: '${accountId}',
  serverUrl: '${relayerUrl}',
  namespace: '${namespace}',
});
const { results } = await mem.recall({ query: USER_QUERY, limit: 5 });
\`\`\`

Always search memory before answering questions that could benefit from prior context.`,
  },

  {
    id: 'json',
    label: 'JSON Config',
    group: 'prompt',
    filename: 'walmarket-memory.json',
    generate: ({ namespace, accountId, privateKey, relayerUrl, listingTitle, memoryCount }) =>
      JSON.stringify({
        source: 'WalMarket',
        title: listingTitle,
        memoryCount,
        connection: {
          namespace,
          accountId,
          relayerUrl,
          delegateKey: privateKey,
        },
        sdk: '@mysten-incubation/memwal',
        usage: "MemWal.create(connection).recall({ query, limit })",
      }, null, 2),
  },
];

export const GROUP_LABELS: Record<ExportFormat['group'], string> = {
  file: 'Download as file',
  code: 'Code snippet',
  prompt: 'Copy & paste',
};
