#!/usr/bin/env npx tsx
/**
 * Backfill historical cost data from session JSONL files into task_run_logs.
 * Also creates a usage_by_session table for detailed analysis.
 *
 * Parses all JSONL files under data/sessions/{group}/.claude/projects/.../*.jsonl
 * to extract token counts, model info, and timestamps, then maps them to task runs.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import Database from 'better-sqlite3';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const DB_PATH = path.join(PROJECT_ROOT, 'store', 'messages.db');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'data', 'sessions');

// Opus 4.6 pricing (per token, not per MTok)
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-6': { input: 15 / 1e6, output: 75 / 1e6, cacheRead: 1.875 / 1e6, cacheWrite: 18.75 / 1e6 },
  'claude-sonnet-4-6': { input: 3 / 1e6, output: 15 / 1e6, cacheRead: 0.3 / 1e6, cacheWrite: 3.75 / 1e6 },
  'claude-sonnet-4-5-20250929': { input: 3 / 1e6, output: 15 / 1e6, cacheRead: 0.3 / 1e6, cacheWrite: 3.75 / 1e6 },
  'claude-haiku-4-5-20251001': { input: 0.8 / 1e6, output: 4 / 1e6, cacheRead: 0.08 / 1e6, cacheWrite: 1 / 1e6 },
  'anthropic/claude-haiku-4.5': { input: 0.8 / 1e6, output: 4 / 1e6, cacheRead: 0.08 / 1e6, cacheWrite: 1 / 1e6 },
  // <synthetic> is from SDK internal messages — use Sonnet pricing as default
  '<synthetic>': { input: 3 / 1e6, output: 15 / 1e6, cacheRead: 0.3 / 1e6, cacheWrite: 3.75 / 1e6 },
};

// Default pricing for unknown models (assume Opus)
const DEFAULT_PRICING = PRICING['claude-opus-4-6'];

interface SessionUsage {
  sessionId: string;
  group: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  messageCount: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

async function parseJsonlFile(filePath: string): Promise<SessionUsage | null> {
  const group = filePath.split('/sessions/')[1]?.split('/')[0] || 'unknown';
  const sessionId = path.basename(filePath, '.jsonl');

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let messageCount = 0;
  let model = 'unknown';
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== 'assistant') continue;
      const msg = entry.message;
      if (!msg?.usage) continue;

      messageCount++;
      const u = msg.usage;

      if (msg.model) model = msg.model;
      if (entry.timestamp) {
        if (!firstTimestamp || entry.timestamp < firstTimestamp) firstTimestamp = entry.timestamp;
        if (!lastTimestamp || entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
      }

      // The SDK reports incremental tokens per streaming chunk, but in JSONL
      // they appear as the cumulative value at each assistant message boundary.
      // We sum them since each entry is a separate message/turn.
      inputTokens += u.input_tokens || 0;
      outputTokens += u.output_tokens || 0;
      cacheReadTokens += u.cache_read_input_tokens || 0;
      cacheWriteTokens += u.cache_creation_input_tokens || 0;

      // Also check ephemeral cache tokens
      if (u.cache_creation) {
        cacheWriteTokens += u.cache_creation.ephemeral_5m_input_tokens || 0;
        cacheWriteTokens += u.cache_creation.ephemeral_1h_input_tokens || 0;
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (messageCount === 0) return null;

  const pricing = PRICING[model] || DEFAULT_PRICING;
  const costUsd = inputTokens * pricing.input + outputTokens * pricing.output
    + cacheReadTokens * pricing.cacheRead + cacheWriteTokens * pricing.cacheWrite;

  return {
    sessionId, group, model,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    costUsd, messageCount,
    firstTimestamp, lastTimestamp,
  };
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  // Create usage table
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_by_session (
      session_id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      first_timestamp TEXT,
      last_timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_usage_group ON usage_by_session(group_folder);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_by_session(model);
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_by_session(first_timestamp);
  `);

  // Also add model column to task_run_logs if missing
  try { db.exec('ALTER TABLE task_run_logs ADD COLUMN model TEXT'); } catch {}

  // Find all JSONL files
  const jsonlFiles: string[] = [];
  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full);
      else if (entry.name.endsWith('.jsonl')) jsonlFiles.push(full);
    }
  }
  walkDir(SESSIONS_DIR);

  console.log(`Found ${jsonlFiles.length} JSONL files`);

  // Parse all files
  const insertUsage = db.prepare(`
    INSERT OR REPLACE INTO usage_by_session
    (session_id, group_folder, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, message_count, first_timestamp, last_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let processed = 0;
  let skipped = 0;
  let totalCost = 0;
  const modelCosts: Record<string, { cost: number; sessions: number; tokens: number }> = {};
  const groupCosts: Record<string, { cost: number; sessions: number }> = {};

  for (const file of jsonlFiles) {
    const usage = await parseJsonlFile(file);
    if (!usage) { skipped++; continue; }

    insertUsage.run(
      usage.sessionId, usage.group, usage.model,
      usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens,
      usage.costUsd, usage.messageCount,
      usage.firstTimestamp, usage.lastTimestamp,
    );

    totalCost += usage.costUsd;
    processed++;

    if (!modelCosts[usage.model]) modelCosts[usage.model] = { cost: 0, sessions: 0, tokens: 0 };
    modelCosts[usage.model].cost += usage.costUsd;
    modelCosts[usage.model].sessions++;
    modelCosts[usage.model].tokens += usage.inputTokens + usage.outputTokens;

    if (!groupCosts[usage.group]) groupCosts[usage.group] = { cost: 0, sessions: 0 };
    groupCosts[usage.group].cost += usage.costUsd;
    groupCosts[usage.group].sessions++;
  }

  console.log(`\nProcessed: ${processed}, Skipped (empty): ${skipped}`);
  console.log(`Total estimated cost: $${totalCost.toFixed(4)}`);

  console.log('\n=== Cost by Model ===');
  for (const [model, data] of Object.entries(modelCosts).sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`  ${model}: $${data.cost.toFixed(4)} (${data.sessions} sessions, ${(data.tokens / 1e6).toFixed(2)}M tokens)`);
  }

  console.log('\n=== Cost by Group ===');
  for (const [group, data] of Object.entries(groupCosts).sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`  ${group}: $${data.cost.toFixed(4)} (${data.sessions} sessions)`);
  }

  // Now backfill task_run_logs: match task runs to sessions by timestamp overlap
  // Get all task runs and sessions table
  const taskRuns = db.prepare(`
    SELECT trl.id, trl.task_id, trl.run_at, trl.duration_ms, trl.cost_usd, trl.input_tokens,
           st.group_folder
    FROM task_run_logs trl
    JOIN scheduled_tasks st ON trl.task_id = st.id
    WHERE COALESCE(trl.cost_usd, 0) = 0 OR trl.model IS NULL
  `).all() as Array<{
    id: number; task_id: string; run_at: string; duration_ms: number;
    cost_usd: number; input_tokens: number; group_folder: string;
  }>;

  console.log(`\n=== Backfilling ${taskRuns.length} task runs ===`);

  const updateRun = db.prepare(`
    UPDATE task_run_logs SET cost_usd = ?, input_tokens = ?, output_tokens = ?, model = ?
    WHERE id = ?
  `);

  let backfilled = 0;
  for (const run of taskRuns) {
    // Find session that overlaps with this task run's time window
    const runStart = new Date(run.run_at).getTime();
    const runEnd = runStart + run.duration_ms;
    const runStartISO = new Date(runStart - 60000).toISOString(); // 1min buffer
    const runEndISO = new Date(runEnd + 60000).toISOString();

    const session = db.prepare(`
      SELECT model, cost_usd, input_tokens, output_tokens FROM usage_by_session
      WHERE group_folder = ?
        AND first_timestamp >= ? AND first_timestamp <= ?
      ORDER BY ABS(julianday(first_timestamp) - julianday(?))
      LIMIT 1
    `).get(run.group_folder, runStartISO, runEndISO, run.run_at) as {
      model: string; cost_usd: number; input_tokens: number; output_tokens: number;
    } | undefined;

    if (session) {
      updateRun.run(session.cost_usd, session.input_tokens, session.output_tokens, session.model, run.id);
      backfilled++;
    }
  }

  console.log(`Backfilled ${backfilled} of ${taskRuns.length} task runs`);

  db.close();
  console.log('\nDone.');
}

main().catch(console.error);
