/**
 * Stdio MCP Server for NanoClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

// Context from environment variables (set by the agent runner)
const chatJid = process.env.NANOCLAW_CHAT_JID!;
const groupFolder = process.env.NANOCLAW_GROUP_FOLDER!;
const isMain = process.env.NANOCLAW_IS_MAIN === '1';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times. By default sends to your own group's chat. Use target_chat_jid to send to another channel — main group can send anywhere; non-main groups can only send to allowlisted partner channels (see groups/global/CLAUDE.md cross-channel section).",
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.'),
    target_chat_jid: z.string().optional().describe('Target chat JID (e.g. "dc:1477831148825477161" for #crypto). Defaults to your own chat. Cross-channel sends require allowlist permission.'),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid: args.target_chat_jid || chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference. To modify an existing task, use update_task instead.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
    schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
    schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
    context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
    target_group_jid: z.string().optional().describe('(Main group only) JID of the group to schedule the task for. Defaults to the current group.'),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (/[Zz]$/.test(args.schedule_value) || /[+-]\d{2}:\d{2}$/.test(args.schedule_value)) {
        return {
          content: [{ type: 'text' as const, text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const data = {
      type: 'schedule_task',
      taskId,
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}` }],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

      if (tasks.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const formatted = tasks
        .map(
          (t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  },
);

server.tool(
  'update_task',
  'Update an existing scheduled task. Only provided fields are changed; omitted fields stay the same.',
  {
    task_id: z.string().describe('The task ID to update'),
    prompt: z.string().optional().describe('New prompt for the task'),
    schedule_type: z.enum(['cron', 'interval', 'once']).optional().describe('New schedule type'),
    schedule_value: z.string().optional().describe('New schedule value (see schedule_task for format)'),
  },
  async (args) => {
    // Validate schedule_value if provided
    if (args.schedule_type === 'cron' || (!args.schedule_type && args.schedule_value)) {
      if (args.schedule_value) {
        try {
          CronExpressionParser.parse(args.schedule_value);
        } catch {
          return {
            content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}".` }],
            isError: true,
          };
        }
      }
    }
    if (args.schedule_type === 'interval' && args.schedule_value) {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}".` }],
          isError: true,
        };
      }
    }

    const data: Record<string, string | undefined> = {
      type: 'update_task',
      taskId: args.task_id,
      groupFolder,
      isMain: String(isMain),
      timestamp: new Date().toISOString(),
    };
    if (args.prompt !== undefined) data.prompt = args.prompt;
    if (args.schedule_type !== undefined) data.schedule_type = args.schedule_type;
    if (args.schedule_value !== undefined) data.schedule_value = args.schedule_value;

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} update requested.` }] };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
  {
    jid: z.string().describe('The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")'),
    name: z.string().describe('Display name for the group'),
    folder: z.string().describe('Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")'),
    trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can register new groups.' }],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Group "${args.name}" registered. It will start receiving messages immediately.` }],
    };
  },
);

server.tool(
  'request_review',
  `Flag the current task for human review. Use this when you:
- Need user input or a decision to proceed
- Found something that requires human judgment
- Hit a blocker that you cannot resolve autonomously
- Want to ask the user a clarifying question

The question/comment will appear in the Mission Control dashboard with an unread indicator, and a notification will be sent to the Discord channel.`,
  {
    task_id: z.string().describe('The task ID that needs review (use current task ID from your context)'),
    question: z.string().describe('The question or comment for the user'),
    severity: z.enum(['info', 'question', 'blocker']).default('question')
      .describe('info = FYI, question = needs answer, blocker = cannot proceed'),
  },
  async (args) => {
    const data = {
      type: 'request_review',
      taskId: args.task_id,
      question: args.question,
      severity: args.severity,
      groupFolder,
      isMain: String(isMain),
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Review requested for task ${args.task_id}. The user will be notified.` }],
    };
  },
);

// ── Market Data Tool ──────────────────────────────────────────────────────────
// Fetches prices directly via HTTP inside the container (no IPC needed).

server.tool(
  'get_market_data',
  `Get current market prices for stocks, crypto, commodities, and indices. Returns real-time quotes.

Examples:
• Stocks: "AAPL", "TSLA", "SPY", "QQQ"
• Crypto: "BTC-USD", "ETH-USD", "SOL-USD"
• Commodities: "GC=F" (gold), "CL=F" (crude oil), "SI=F" (silver)
• Indices: "^GSPC" (S&P 500), "^IXIC" (Nasdaq), "^VIX" (VIX)
• Futures: "ES=F" (E-mini S&P), "NQ=F" (E-mini Nasdaq), "MES=F" (Micro E-mini)

Pass up to 10 symbols at once for efficiency.`,
  {
    symbols: z.array(z.string()).min(1).max(10).describe('Ticker symbols (e.g., ["AAPL", "BTC-USD", "GC=F"])'),
  },
  async (args) => {
    try {
      const joined = args.symbols.join(',');
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(joined)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'NanoClaw/1.0' },
      });

      if (!resp.ok) {
        return {
          content: [{ type: 'text' as const, text: `Yahoo Finance API error: ${resp.status} ${resp.statusText}` }],
          isError: true,
        };
      }

      const data = await resp.json() as {
        quoteResponse?: {
          result?: Array<{
            symbol: string;
            shortName?: string;
            regularMarketPrice?: number;
            regularMarketChange?: number;
            regularMarketChangePercent?: number;
            regularMarketPreviousClose?: number;
            regularMarketOpen?: number;
            regularMarketDayHigh?: number;
            regularMarketDayLow?: number;
            regularMarketVolume?: number;
            fiftyTwoWeekHigh?: number;
            fiftyTwoWeekLow?: number;
            marketCap?: number;
            bid?: number;
            ask?: number;
            bidSize?: number;
            askSize?: number;
            quoteType?: string;
          }>;
        };
      };
      const results = data?.quoteResponse?.result;

      if (!results || results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No data found for symbols: ${joined}` }],
          isError: true,
        };
      }

      const lines = results.map((q) => {
        const price = q.regularMarketPrice?.toFixed(2) ?? 'N/A';
        const change = q.regularMarketChange?.toFixed(2) ?? 'N/A';
        const pct = q.regularMarketChangePercent?.toFixed(2) ?? 'N/A';
        const vol = q.regularMarketVolume ? (q.regularMarketVolume / 1e6).toFixed(1) + 'M' : 'N/A';
        const hi = q.regularMarketDayHigh?.toFixed(2) ?? 'N/A';
        const lo = q.regularMarketDayLow?.toFixed(2) ?? 'N/A';
        const bid = q.bid?.toFixed(2) ?? 'N/A';
        const ask = q.ask?.toFixed(2) ?? 'N/A';
        return [
          `${q.symbol} (${q.shortName || q.quoteType || 'Unknown'})`,
          `  Price: $${price}  Change: ${change} (${pct}%)`,
          `  Day: $${lo} - $${hi}  Vol: ${vol}`,
          `  Bid: $${bid}  Ask: $${ask}`,
          `  52wk: $${q.fiftyTwoWeekLow?.toFixed(2) ?? 'N/A'} - $${q.fiftyTwoWeekHigh?.toFixed(2) ?? 'N/A'}`,
        ].join('\n');
      });

      return { content: [{ type: 'text' as const, text: lines.join('\n\n') }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Market data fetch failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ── Google Calendar Tools ────────────────────────────────────────────────────
// Uses Google Calendar API with OAuth credentials from container env vars.
// Non-main groups: read-only. Main group: read-write.

const GOOGLE_CALENDAR_ID = 'primary';

async function getGoogleAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Google token refresh failed: ${resp.status} ${body}`);
  }

  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

server.tool(
  'list_calendar_events',
  `List upcoming events from your Google Calendar. Returns events within the specified time range.

Defaults to the next 7 days if no range specified. All times in ET.`,
  {
    days_ahead: z.number().min(1).max(90).default(7).describe('Number of days ahead to fetch (default: 7, max: 90)'),
    max_results: z.number().min(1).max(50).default(20).describe('Maximum events to return (default: 20)'),
    query: z.string().optional().describe('Optional search query to filter events'),
  },
  async (args) => {
    try {
      const token = await getGoogleAccessToken();
      const now = new Date();
      const until = new Date(now.getTime() + args.days_ahead * 86400000);

      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: until.toISOString(),
        maxResults: String(args.max_results),
        singleEvents: 'true',
        orderBy: 'startTime',
      });
      if (args.query) params.set('q', args.query);

      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!resp.ok) {
        const body = await resp.text();
        return {
          content: [{ type: 'text' as const, text: `Calendar API error: ${resp.status} ${body.slice(0, 200)}` }],
          isError: true,
        };
      }

      const data = await resp.json() as {
        items?: Array<{
          id: string;
          summary?: string;
          description?: string;
          location?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          status?: string;
          htmlLink?: string;
          attendees?: Array<{ email: string; responseStatus?: string }>;
        }>;
      };

      if (!data.items || data.items.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No events found in the specified range.' }] };
      }

      const lines = data.items.map((e) => {
        const start = e.start?.dateTime || e.start?.date || 'TBD';
        const end = e.end?.dateTime || e.end?.date || '';
        const loc = e.location ? `  Location: ${e.location}` : '';
        const attendees = e.attendees?.length
          ? `  Attendees: ${e.attendees.map((a) => `${a.email} (${a.responseStatus || '?'})`).join(', ')}`
          : '';
        return [
          `${e.summary || '(No title)'} [${e.id}]`,
          `  Start: ${start}${end ? `  End: ${end}` : ''}`,
          loc,
          attendees,
        ].filter(Boolean).join('\n');
      });

      return { content: [{ type: 'text' as const, text: `${data.items.length} events:\n\n${lines.join('\n\n')}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Calendar fetch failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'create_calendar_event',
  `Create a new event on your Google Calendar. Main group only.

Times should be in ISO 8601 format with timezone offset, e.g., "2026-04-01T14:00:00-04:00" for 2 PM ET.
For all-day events, use date format: "2026-04-01".`,
  {
    summary: z.string().describe('Event title'),
    start: z.string().describe('Start time (ISO 8601 with offset) or date for all-day events'),
    end: z.string().describe('End time (ISO 8601 with offset) or date for all-day events'),
    description: z.string().optional().describe('Event description/notes'),
    location: z.string().optional().describe('Event location'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can create calendar events.' }],
        isError: true,
      };
    }

    try {
      const token = await getGoogleAccessToken();

      const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(args.start);
      const event: Record<string, unknown> = {
        summary: args.summary,
        start: isAllDay ? { date: args.start } : { dateTime: args.start },
        end: isAllDay ? { date: args.end } : { dateTime: args.end },
      };
      if (args.description) event.description = args.description;
      if (args.location) event.location = args.location;

      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        },
      );

      if (!resp.ok) {
        const body = await resp.text();
        return {
          content: [{ type: 'text' as const, text: `Calendar create error: ${resp.status} ${body.slice(0, 200)}` }],
          isError: true,
        };
      }

      const created = await resp.json() as { id: string; htmlLink?: string; summary?: string };
      return {
        content: [{ type: 'text' as const, text: `Event created: "${created.summary}" [${created.id}]\n${created.htmlLink || ''}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Calendar create failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
