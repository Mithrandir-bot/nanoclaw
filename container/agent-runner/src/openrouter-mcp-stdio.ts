/**
 * OpenRouter MCP Server for NanoClaw
 * Exposes OpenRouter models (e.g. Grok) as tools for the container agent.
 * Reads OPENROUTER_API_KEY from environment.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_KEY = process.env.OPENROUTER_API_KEY || '';
const BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'x-ai/grok-3-mini-beta';

function log(msg: string): void {
  console.error(`[OPENROUTER] ${msg}`);
}

const server = new McpServer({
  name: 'openrouter',
  version: '1.0.0',
});

server.tool(
  'openrouter_query',
  'Send a prompt to an OpenRouter model (default: Grok 3 Mini). Use as a second opinion or for cross-referencing health research. Supports any OpenRouter model ID.',
  {
    prompt: z.string().describe('The prompt to send to the model'),
    model: z.string().optional().describe(`Model ID (default: "${DEFAULT_MODEL}"). Examples: "x-ai/grok-3-beta", "x-ai/grok-3-mini-beta", "google/gemini-2.5-pro-preview"`),
    system: z.string().optional().describe('Optional system prompt'),
    max_tokens: z.number().optional().describe('Max tokens in response (default: 4096)'),
  },
  async (args) => {
    if (!API_KEY) {
      return {
        content: [{ type: 'text' as const, text: 'OPENROUTER_API_KEY not set in environment' }],
        isError: true,
      };
    }

    const model = args.model || DEFAULT_MODEL;
    log(`>>> Querying ${model} (${args.prompt.length} chars)...`);

    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (args.system) {
        messages.push({ role: 'system', content: args.system });
      }
      messages.push({ role: 'user', content: args.prompt });

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'HTTP-Referer': 'https://nanoclaw.dev',
          'X-Title': 'NanoClaw Agent',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: args.max_tokens || 4096,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          content: [{ type: 'text' as const, text: `OpenRouter error (${res.status}): ${errorText}` }],
          isError: true,
        };
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_cost?: number };
        model?: string;
      };

      const reply = data.choices?.[0]?.message?.content || '(empty response)';
      const usage = data.usage;
      let meta = `\n\n[${data.model || model}`;
      if (usage) {
        meta += ` | ${usage.prompt_tokens}→${usage.completion_tokens} tokens`;
        if (usage.total_cost) meta += ` | $${usage.total_cost.toFixed(4)}`;
      }
      meta += ']';

      log(`<<< Done: ${model} | ${reply.length} chars | ${usage?.completion_tokens || '?'} tokens`);
      return { content: [{ type: 'text' as const, text: reply + meta }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Failed to call OpenRouter: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
