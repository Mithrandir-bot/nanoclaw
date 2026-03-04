/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF, like before)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per agent teams result).
 *   Final marker after loop ends signals completion.
 */

import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { query, HookCallback, PreCompactHookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { fileURLToPath } from 'url';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
  openRouterActivated?: boolean;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

/**
 * Push-based async iterable for streaming user messages to the SDK.
 * Keeps the iterable alive until end() is called, preventing isSingleUserTurn.
 */
class MessageStream {
  private queue: SDKUserMessage[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void {
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    });
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.done) return;
      await new Promise<void>(r => { this.waiting = r; });
      this.waiting = null;
    }
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

let hadAnyOutput = false;

function writeOutput(output: ContainerOutput): void {
  hadAnyOutput = true;
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(`Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

/**
 * Archive the full transcript to conversations/ before compaction.
 */
function createPreCompactHook(assistantName?: string, groupFolder?: string): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        log('No messages to archive');
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const conversationsDir = '/workspace/group/conversations';
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(messages, summary, assistantName);
      fs.writeFileSync(filePath, markdown);

      log(`Archived conversation to ${filePath}`);

      writeResumeFile(messages, summary, date, assistantName);
      writeObsidianDailyNote(messages, summary, date, groupFolder, assistantName);
      rebuildObsidianIndex();
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {};
  };
}

/**
 * Write RESUME.md so the agent can pick up after compaction.
 */
function writeResumeFile(messages: ParsedMessage[], summary: string | null, date: string, assistantName?: string): void {
  try {
    const recentMessages = messages.slice(-10);
    const lines: string[] = [
      '# Resume Context',
      '',
      `> Auto-compaction ran on ${date}. Read this to understand what was in progress.`,
      '',
    ];
    if (summary) {
      lines.push(`**Topic:** ${summary}`, '');
    }
    lines.push('## Recent Conversation', '');
    for (const msg of recentMessages) {
      const sender = msg.role === 'user' ? 'User' : (assistantName || 'Assistant');
      const content = msg.content.length > 1000 ? msg.content.slice(0, 1000) + '...' : msg.content;
      lines.push(`**${sender}:** ${content}`, '');
    }
    lines.push(
      '## Instructions',
      '',
      'The above was the conversation state before compaction. Continue from where the work left off. Check workspace files for any work in progress.',
    );
    fs.writeFileSync('/workspace/group/RESUME.md', lines.join('\n'));
    log('Wrote RESUME.md');
  } catch (err) {
    log(`Failed to write RESUME.md: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Append a session summary to the Obsidian daily note.
 */
function writeObsidianDailyNote(messages: ParsedMessage[], summary: string | null, date: string, groupFolder?: string, assistantName?: string): void {
  const obsidianDir = '/workspace/extra/obsidian-vault';
  if (!fs.existsSync(obsidianDir)) {
    log('Obsidian vault not mounted, skipping daily note');
    return;
  }

  try {
    const dailyDir = path.join(obsidianDir, 'Daily');
    fs.mkdirSync(dailyDir, { recursive: true });
    const dailyNotePath = path.join(dailyDir, `${date}.md`);

    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
    const channelLabel = groupFolder ? `#${groupFolder}` : 'agent';

    const lastAssistantMessages = messages.filter(m => m.role === 'assistant').slice(-3);
    const lines: string[] = [
      '',
      `## ${channelLabel} — ${time} ET`,
      '',
    ];
    if (summary) lines.push(`**Topic:** ${summary}`, '');
    if (lastAssistantMessages.length > 0) {
      lines.push('**Recent work:**');
      for (const msg of lastAssistantMessages) {
        const excerpt = msg.content.replace(/\n+/g, ' ').slice(0, 400);
        lines.push(`- ${excerpt}`);
      }
      lines.push('');
    }

    if (fs.existsSync(dailyNotePath)) {
      fs.appendFileSync(dailyNotePath, lines.join('\n'));
    } else {
      fs.writeFileSync(dailyNotePath, `# ${date}\n` + lines.join('\n'));
    }
    log(`Updated Obsidian daily note: ${dailyNotePath}`);
  } catch (err) {
    log(`Failed to write Obsidian daily note: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Secrets to strip from Bash tool subprocess environments.
// These are needed by claude-code for API auth but should never
// be visible to commands Kit runs.
const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

/**
 * Rebuild INDEX.md at the vault root so agents always have a fresh map.
 */
function rebuildObsidianIndex(): void {
  const vaultDir = '/workspace/extra/obsidian-vault';
  if (!fs.existsSync(vaultDir)) return;

  try {
    const skipDirs = new Set(['.obsidian', '.trash', 'node_modules']);

    interface FEntry { relPath: string; title: string; mtime: number }
    const byFolder = new Map<string, FEntry[]>();

    function walk(dir: string) {
      let names: string[];
      try { names = fs.readdirSync(dir, 'utf-8') as string[]; } catch { return; }
      for (const name of names) {
        if (name.startsWith('.') || skipDirs.has(name)) continue;
        const full = path.join(dir, name);
        let stat: fs.Stats;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.isDirectory()) { walk(full); continue; }
        if (!stat.isFile() || !name.endsWith('.md') || name === 'INDEX.md') continue;
        const rel = path.relative(vaultDir, full);
        const folder = path.dirname(rel) === '.' ? '(root)' : path.dirname(rel);
        let title = name.replace(/\.md$/, '');
        try {
          const first = fs.readFileSync(full, 'utf-8').split('\n').find(l => l.startsWith('#'));
          if (first) title = first.replace(/^#+\s*/, '');
        } catch { /* ignore */ }
        if (!byFolder.has(folder)) byFolder.set(folder, []);
        byFolder.get(folder)!.push({ relPath: rel, title, mtime: stat.mtimeMs });
      }
    }

    walk(vaultDir);
    for (const files of byFolder.values()) files.sort((a, b) => b.mtime - a.mtime);

    const total = [...byFolder.values()].reduce((s, f) => s + f.length, 0);
    const now = new Date();
    const ts = now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    const lines = [
      '# Vault Index',
      '',
      `Updated: ${ts} ET — ${total} notes`,
      '',
      '> Read this at session start to know what exists in the vault. Regenerated daily and on context compaction.',
      '',
      '---',
      '',
    ];

    const folders = [...byFolder.keys()].sort((a, b) => {
      if (a === '(root)') return -1;
      if (b === '(root)') return 1;
      return a.localeCompare(b);
    });

    for (const folder of folders) {
      const files = byFolder.get(folder)!;
      lines.push(`## ${folder} (${files.length})`);
      lines.push('');
      for (const f of files.slice(0, 50)) {
        lines.push(`- ${path.basename(f.relPath, '.md')}`);
      }
      if (files.length > 50) lines.push(`- ...and ${files.length - 50} more`);
      lines.push('');
    }

    fs.writeFileSync(path.join(vaultDir, 'INDEX.md'), lines.join('\n'));
    log(`Rebuilt Obsidian index: ${total} notes across ${byFolder.size} folders`);
  } catch (err) {
    log(`Failed to rebuild Obsidian index: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function createSanitizeBashHook(): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preInput = input as PreToolUseHookInput;
    const command = (preInput.tool_input as { command?: string })?.command;
    if (!command) return {};

    const unsetPrefix = `unset ${SECRET_ENV_VARS.join(' ')} 2>/dev/null; `;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...(preInput.tool_input as Record<string, unknown>),
          command: unsetPrefix + command,
        },
      },
    };
  };
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
    }
  }

  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null, assistantName?: string): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : (assistantName || 'Assistant');
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + '...'
      : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check for _close sentinel.
 */
function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found, or empty array.
 */
function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the messages as a single string, or null if _close.
 */
function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

/**
 * Run a single query and stream results via writeOutput.
 * Uses MessageStream (AsyncIterable) to keep isSingleUserTurn=false,
 * allowing agent teams subagents to run to completion.
 * Also pipes IPC messages into the stream during the query.
 */
async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  mcpServerPath: string,
  containerInput: ContainerInput,
  sdkEnv: Record<string, string | undefined>,
  resumeAt?: string,
  usingOpenRouter?: boolean,
): Promise<{ newSessionId?: string; lastAssistantUuid?: string; closedDuringQuery: boolean }> {
  const stream = new MessageStream();
  stream.push(prompt);

  // Poll IPC for follow-up messages and _close sentinel during the query
  let ipcPolling = true;
  let closedDuringQuery = false;
  const pollIpcDuringQuery = () => {
    if (!ipcPolling) return;
    if (shouldClose()) {
      log('Close sentinel detected during query, ending stream');
      closedDuringQuery = true;
      stream.end();
      ipcPolling = false;
      return;
    }
    const messages = drainIpcInput();
    for (const text of messages) {
      log(`Piping IPC message into active query (${text.length} chars)`);
      stream.push(text);
    }
    setTimeout(pollIpcDuringQuery, IPC_POLL_MS);
  };
  setTimeout(pollIpcDuringQuery, IPC_POLL_MS);

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;

  // Load global CLAUDE.md as additional system context (shared across all groups)
  const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
  let globalClaudeMd: string | undefined;
  if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
    globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
  }

  // Discover additional directories mounted at /workspace/extra/*
  // These are passed to the SDK so their CLAUDE.md files are loaded automatically
  const extraDirs: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        extraDirs.push(fullPath);
      }
    }
  }
  if (extraDirs.length > 0) {
    log(`Additional directories: ${extraDirs.join(', ')}`);
  }

  for await (const message of query({
    prompt: stream,
    options: {
      cwd: '/workspace/group',
      additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
      resume: sessionId,
      resumeSessionAt: resumeAt,
      systemPrompt: globalClaudeMd
        ? { type: 'preset' as const, preset: 'claude_code' as const, append: globalClaudeMd }
        : undefined,
      model: usingOpenRouter ? 'anthropic/claude-haiku-4.5' : 'claude-opus-4-6',
      allowedTools: [
        'Bash',
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebSearch', 'WebFetch',
        'Task', 'TaskOutput', 'TaskStop',
        'TeamCreate', 'TeamDelete', 'SendMessage',
        'TodoWrite', 'ToolSearch', 'Skill',
        'NotebookEdit',
        'mcp__nanoclaw__*'
      ],
      env: sdkEnv,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      mcpServers: {
        nanoclaw: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            NANOCLAW_CHAT_JID: containerInput.chatJid,
            NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
            NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
          },
        },
      },
      hooks: {
        PreCompact: [{ hooks: [createPreCompactHook(containerInput.assistantName, containerInput.groupFolder)] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [createSanitizeBashHook()] }],
      },
    }
  })) {
    messageCount++;
    const msgType = message.type === 'system' ? `system/${(message as { subtype?: string }).subtype}` : message.type;
    log(`[msg #${messageCount}] type=${msgType}`);

    if (message.type === 'assistant' && 'uuid' in message) {
      lastAssistantUuid = (message as { uuid: string }).uuid;
    }

    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id;
      log(`Session initialized: ${newSessionId}`);
    }

    if (message.type === 'system' && (message as { subtype?: string }).subtype === 'task_notification') {
      const tn = message as { task_id: string; status: string; summary: string };
      log(`Task notification: task=${tn.task_id} status=${tn.status} summary=${tn.summary}`);
    }

    if (message.type === 'result') {
      resultCount++;
      const textResult = 'result' in message ? (message as { result?: string }).result : null;
      log(`Result #${resultCount}: subtype=${message.subtype}${textResult ? ` text=${textResult.slice(0, 200)}` : ''}`);

      // If we haven't sent any output yet and this result looks like an API failure,
      // throw so the caller can fall back to OpenRouter before the user sees the error.
      // "hit your limit" is Claude's UI rate-limit message (always subtype=success),
      // so we check for it explicitly. All other patterns only fire on non-success
      // subtypes to avoid false positives in normal agent text.
      const isUiRateLimit = !hadAnyOutput && textResult && /hit your limit/i.test(textResult);
      const isApiError = !hadAnyOutput && textResult && message.subtype !== 'success' && /authentication_error|Invalid bearer token|rate_limit_error|overloaded_error|credit|billing|quota|429|401/.test(textResult);
      if (isUiRateLimit || isApiError) {
        throw new Error(`API unavailable: ${textResult.slice(0, 300)}`);
      }

      writeOutput({
        status: 'success',
        result: textResult || null,
        newSessionId
      });
    }
  }

  ipcPolling = false;
  log(`Query done. Messages: ${messageCount}, results: ${resultCount}, lastAssistantUuid: ${lastAssistantUuid || 'none'}, closedDuringQuery: ${closedDuringQuery}`);
  return { newSessionId, lastAssistantUuid, closedDuringQuery };
}

/**
 * Start a local HTTP proxy for OpenRouter fallback.
 * OpenRouter doesn't implement GET /v1/models/{id} (used by the Claude Code SDK
 * for model validation), so it returns 404 which the SDK treats as a model error.
 * This proxy intercepts that endpoint and returns a stub 200, forwarding
 * everything else to https://openrouter.ai/api/v1.
 */
function startOpenRouterProxy(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';

      // Stub out model validation requests that OpenRouter doesn't implement
      if (req.method === 'GET' && /^\/v1\/models\/[^/]/.test(url)) {
        const modelId = url.split('/v1/models/')[1]?.split('?')[0] || 'claude';
        log(`[proxy] Stubbing model validation for: ${modelId}`);
        const body = JSON.stringify({ id: modelId, type: 'model', display_name: modelId, created_at: '2024-01-01T00:00:00Z' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
        return;
      }

      // Forward everything else to OpenRouter
      const options: https.RequestOptions = {
        hostname: 'openrouter.ai',
        port: 443,
        path: `/api${url}`,
        method: req.method,
        headers: { ...req.headers, host: 'openrouter.ai' },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => { res.writeHead(502); res.end(err.message); });
      req.pipe(proxyReq);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ port: addr.port, close: () => server.close() });
    });
    server.on('error', reject);
  });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    // Delete the temp file the entrypoint wrote — it contains secrets
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  // Build SDK env: merge secrets into process.env for the SDK only.
  // Secrets never touch process.env itself, so Bash subprocesses can't see them.
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    sdkEnv[key] = value;
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  let sessionId = containerInput.sessionId;
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel from previous container runs
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Flag file written to the group folder to signal persistent OpenRouter mode.
  // The host (container-runner) reads this to skip Anthropic on future sessions.
  const OPENROUTER_FLAG = '/workspace/group/.openrouter_mode';

  const buildOpenRouterEnv = async (baseEnv: Record<string, string | undefined>, key: string) => {
    const proxy = await startOpenRouterProxy();
    log(`[proxy] Started on port ${proxy.port}`);
    const env = { ...baseEnv };
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    env.ANTHROPIC_API_KEY = key;
    env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${proxy.port}`;
    return { env, proxy };
  };

  const writeOpenRouterFlag = (reason: string) => {
    try {
      fs.writeFileSync(OPENROUTER_FLAG, JSON.stringify({ since: new Date().toISOString(), reason }));
      log(`[fallback] Wrote OpenRouter mode flag (reason: ${reason})`);
    } catch { /* non-critical */ }
  };

  const clearOpenRouterFlag = () => {
    try {
      if (fs.existsSync(OPENROUTER_FLAG)) {
        fs.unlinkSync(OPENROUTER_FLAG);
        log('[fallback] Cleared OpenRouter mode flag — Anthropic is working again');
      }
    } catch { /* non-critical */ }
  };

  // Query loop: run query → wait for IPC message → run new query → repeat
  let resumeAt: string | undefined;
  let currentSdkEnv = sdkEnv;
  let openRouterProxy: { port: number; close: () => void } | null = null;
  let usingOpenRouter = false;

  // If container-runner detected persistent OpenRouter mode, start proxy immediately
  if (sdkEnv.USE_OPENROUTER_DIRECT === '1' && sdkEnv.OPENROUTER_API_KEY) {
    log('[fallback] Starting in OpenRouter direct mode (credits previously exhausted)');
    const { env, proxy } = await buildOpenRouterEnv(sdkEnv, sdkEnv.OPENROUTER_API_KEY);
    currentSdkEnv = env;
    openRouterProxy = proxy;
    usingOpenRouter = true;
  }

  try {
    while (true) {
      // Reset per-query output flag so fallback can activate on any query,
      // not just the first one in a session.
      hadAnyOutput = false;

      log(`Starting query (session: ${sessionId || 'new'}, resumeAt: ${resumeAt || 'latest'})...`);

      let queryResult: Awaited<ReturnType<typeof runQuery>>;
      try {
        queryResult = await runQuery(prompt, sessionId, mcpServerPath, containerInput, currentSdkEnv, resumeAt, usingOpenRouter);
        // Anthropic succeeded — clear any stale fallback flag
        if (!usingOpenRouter) clearOpenRouterFlag();
      } catch (apiErr) {
        // If nothing was sent to the user yet and we have an OpenRouter key, fall back
        const openrouterKey = sdkEnv.OPENROUTER_API_KEY;
        if (!hadAnyOutput && openrouterKey && currentSdkEnv === sdkEnv) {
          const errMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
          log(`Primary API unavailable (${errMsg}), retrying with OpenRouter fallback...`);
          // Determine if this is a persistent condition (rate limit / credits) vs transient auth
          const isPersistent = /rate_limit|overloaded|credit|billing|quota|429|hit your limit/i.test(errMsg);
          if (isPersistent) writeOpenRouterFlag('rate_limit_or_credits');
          const { env, proxy } = await buildOpenRouterEnv(sdkEnv, openrouterKey);
          currentSdkEnv = env;
          openRouterProxy = proxy;
          usingOpenRouter = true;
          // Signal the host to notify the user that OpenRouter is now active
          writeOutput({ status: 'success', result: null, newSessionId: sessionId, openRouterActivated: true });
          continue; // retry the loop with fallback env
        }
        throw apiErr;
      }
      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
      }
      if (queryResult.lastAssistantUuid) {
        resumeAt = queryResult.lastAssistantUuid;
      }

      // If _close was consumed during the query, exit immediately.
      // Don't emit a session-update marker (it would reset the host's
      // idle timer and cause a 30-min delay before the next _close).
      if (queryResult.closedDuringQuery) {
        log('Close sentinel consumed during query, exiting');
        break;
      }

      // Emit session update so host can track it
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Query ended, waiting for next IPC message...');

      // Wait for the next message or _close sentinel
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new query`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage
    });
    process.exit(1);
  } finally {
    openRouterProxy?.close();
  }
}

main();
