import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import {
  NewMessage,
  RegisteredGroup,
  ScheduledTask,
  TaskRunLog,
} from './types.js';

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS secrets (
      name TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add is_main column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    // Backfill: existing rows with folder = 'main' are the main group
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    /* column already exists */
  }

  // Add channel and is_group columns if they don't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
    // Backfill from JID patterns
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'telegram', is_group = 1 WHERE jid LIKE 'tg:%'`,
    );
  } catch {
    /* columns already exist */
  }

  // Add cost tracking columns to task_run_logs
  try {
    database.exec(
      `ALTER TABLE task_run_logs ADD COLUMN cost_usd REAL DEFAULT 0`,
    );
    database.exec(
      `ALTER TABLE task_run_logs ADD COLUMN input_tokens INTEGER DEFAULT 0`,
    );
    database.exec(
      `ALTER TABLE task_run_logs ADD COLUMN output_tokens INTEGER DEFAULT 0`,
    );
  } catch {
    /* columns already exist */
  }

  // Add Discord thread_id to scheduled_tasks for thread ↔ discussion sync
  try {
    database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN thread_id TEXT`);
  } catch {
    /* column already exists */
  }

  // Pending thread messages: dashboard writes here, main process polls and sends to Discord
  database.exec(`
    CREATE TABLE IF NOT EXISTS pending_thread_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Project → Discord thread mapping
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_threads (
      project_file TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL
    )
  `);

  // Cross-group IPC sends: tracks when one agent sends a message to another group's channel
  database.exec(`
    CREATE TABLE IF NOT EXISTS cross_group_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_group TEXT NOT NULL,
      target_jid TEXT NOT NULL,
      target_group TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_cgs_timestamp ON cross_group_sends(timestamp)`,
  );

  // --- Enhanced task architecture migrations ---

  // New columns on scheduled_tasks for task management v2
  const taskV2Columns = [
    ['name', 'TEXT'],
    ['template_slug', 'TEXT'],
    ['prompt_hash', 'TEXT'],
    ['dedup_key', 'TEXT'],
    ['consecutive_failures', 'INTEGER DEFAULT 0'],
    ['max_failures', 'INTEGER DEFAULT 5'],
    ['last_error', 'TEXT'],
    ['venture_file', 'TEXT'],
    ['project_file', 'TEXT'],
    ['category', 'TEXT'],
  ];
  for (const [col, type] of taskV2Columns) {
    try {
      database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN ${col} ${type}`);
    } catch { /* column already exists */ }
  }

  // Add model column to task_run_logs
  try {
    database.exec(`ALTER TABLE task_run_logs ADD COLUMN model TEXT`);
  } catch { /* column already exists */ }

  // Add progress column (may already exist from dashboard writes)
  try {
    database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN progress INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }

  // Task templates registry
  database.exec(`
    CREATE TABLE IF NOT EXISTS task_templates (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      default_prompt TEXT NOT NULL,
      default_schedule TEXT NOT NULL,
      default_group TEXT NOT NULL,
      default_context_mode TEXT DEFAULT 'isolated',
      category TEXT,
      venture_file TEXT,
      max_runs_per_day INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // NOTE: Dedup unique index is created AFTER migrateTasksV2() merges duplicates.
  // See initDatabase() for the index creation.

  // DB-level safety net: prevent recurring tasks from being marked 'completed'.
  // Also blocks 'needs_review' on recurring tasks (legacy status, being phased out).
  database.exec(`DROP TRIGGER IF EXISTS prevent_recurring_task_completion`);
  database.exec(`
    CREATE TRIGGER prevent_recurring_task_completion
    BEFORE UPDATE OF status ON scheduled_tasks
    FOR EACH ROW
    WHEN NEW.status IN ('completed', 'needs_review') AND OLD.schedule_type != 'once'
    BEGIN
      SELECT RAISE(IGNORE);
    END
  `);
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Migrate from JSON files if they exist
  migrateJsonState();

  // Run task v2 migration (idempotent, gated by router_state key)
  migrateTasksV2();

  // Create dedup index AFTER migration merges duplicates
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup_key
        ON scheduled_tasks(dedup_key)
        WHERE status IN ('active', 'paused') AND dedup_key IS NOT NULL
    `);
  } catch { /* index already exists or conflict */ }
}

/** One-time migration: backfill task names, dedup keys, merge duplicates, seed templates. */
function migrateTasksV2(): void {
  try {
    const existing = db.prepare("SELECT value FROM router_state WHERE key = 'task_migration_v2'").get() as { value: string } | undefined;
    if (existing) return; // Already migrated
  } catch { /* router_state table may not exist yet */ return; }

  console.log('[db] Running task v2 migration...');

  // Helper: extract task name from prompt (first sentence, max 60 chars)
  function taskTitle(prompt: string): string {
    const firstLine = prompt.split('\n')[0].replace(/^you are (the |a )?/i, '').trim();
    return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
  }

  const categoryMap: Record<string, string> = {
    main: 'monitoring', 'ai-research': 'research', 'health-wellness': 'health',
    trading: 'trading', 'business-ideas': 'business', crypto: 'crypto', contacts: 'monitoring',
  };

  db.transaction(() => {
    // 1. Backfill name, prompt_hash, dedup_key, category
    const tasks = db.prepare('SELECT id, group_folder, schedule_value, prompt FROM scheduled_tasks WHERE name IS NULL').all() as Array<{ id: string; group_folder: string; schedule_value: string; prompt: string }>;
    const updateStmt = db.prepare('UPDATE scheduled_tasks SET name = ?, prompt_hash = ?, dedup_key = ?, category = ? WHERE id = ?');
    for (const t of tasks) {
      const name = taskTitle(t.prompt);
      const hash = crypto.createHash('sha256').update(t.prompt).digest('hex');
      const dedupKey = `${t.group_folder}::${t.schedule_value}::${name}`;
      const cat = categoryMap[t.group_folder] || 'monitoring';
      updateStmt.run(name, hash, dedupKey, cat, t.id);
    }

    // 2. Convert needs_review → active for recurring tasks (trigger won't block this direction)
    db.prepare("UPDATE scheduled_tasks SET status = 'active' WHERE status = 'needs_review' AND schedule_type != 'once'").run();

    // 3. Merge duplicates: for each dedup_key with count > 1 among active/paused, keep the one with most recent successful run
    const dupeKeys = db.prepare(
      `SELECT dedup_key, COUNT(*) as cnt FROM scheduled_tasks WHERE dedup_key IS NOT NULL AND status IN ('active', 'paused') GROUP BY dedup_key HAVING cnt > 1`,
    ).all() as Array<{ dedup_key: string; cnt: number }>;

    for (const dk of dupeKeys) {
      const group = db.prepare(
        `SELECT s.id, (SELECT MAX(run_at) FROM task_run_logs WHERE task_id = s.id AND status = 'success') as last_success
         FROM scheduled_tasks s WHERE s.dedup_key = ? AND s.status IN ('active', 'paused')
         ORDER BY last_success DESC NULLS LAST, s.created_at DESC`,
      ).all(dk.dedup_key) as Array<{ id: string; last_success: string | null }>;

      if (group.length < 2) continue;
      const keeper = group[0];
      const removeIds = group.slice(1).map(g => g.id);
      const ph = removeIds.map(() => '?').join(',');
      db.prepare(`UPDATE task_run_logs SET task_id = ? WHERE task_id IN (${ph})`).run(keeper.id, ...removeIds);
      db.prepare(`UPDATE task_comments SET task_id = ? WHERE task_id IN (${ph})`).run(keeper.id, ...removeIds);
      for (const rid of removeIds) {
        db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(rid);
      }
    }

    // 4. Mark migration complete
    db.prepare("INSERT OR REPLACE INTO router_state (key, value) VALUES ('task_migration_v2', ?)").run(new Date().toISOString());
  })();

  console.log('[db] Task v2 migration complete');
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  const ch = channel ?? null;
  const group = isGroup === undefined ? null : isGroup ? 1 : 0;

  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, name, timestamp, ch, group);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, chatJid, timestamp, ch, group);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

/**
 * Store a message directly.
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
    FROM messages
    WHERE timestamp > ? AND chat_jid IN (${placeholders})
      AND is_bot_message = 0 AND content NOT LIKE ?
      AND content != '' AND content IS NOT NULL
    ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
): NewMessage[] {
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
    FROM messages
    WHERE chat_jid = ? AND timestamp > ?
      AND is_bot_message = 0 AND content NOT LIKE ?
      AND content != '' AND content IS NOT NULL
    ORDER BY timestamp
  `;
  return db
    .prepare(sql)
    .all(chatJid, sinceTimestamp, `${botPrefix}:%`) as NewMessage[];
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at,
      name, template_slug, prompt_hash, dedup_key, venture_file, project_file, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
    task.name || null,
    task.template_slug || null,
    task.prompt_hash || null,
    task.dedup_key || null,
    task.venture_file || null,
    task.project_file || null,
    task.category || null,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

/** Returns true if a task's schedule_type allows it to be marked 'completed'. Only 'once' tasks can be completed. */
function isCompletableTask(id: string): boolean {
  const task = db
    .prepare('SELECT schedule_type FROM scheduled_tasks WHERE id = ?')
    .get(id) as { schedule_type: string } | undefined;
  return task?.schedule_type === 'once';
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status' |
      'name' | 'venture_file' | 'project_file' | 'category' | 'template_slug' | 'dedup_key'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  // Simple string/null fields
  const simpleFields: Array<keyof typeof updates> = [
    'prompt', 'schedule_type', 'schedule_value', 'next_run',
    'name', 'venture_file', 'project_file', 'category', 'template_slug', 'dedup_key',
  ];
  for (const key of simpleFields) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (updates.status !== undefined) {
    // GUARD: Only 'once' tasks can be completed. Recurring tasks (cron, interval) must be paused or deleted.
    if (updates.status === 'completed' && !isCompletableTask(id)) {
      console.warn(
        `[db] BLOCKED: Attempt to mark recurring task ${id} as completed — downgrading to paused`,
      );
      updates.status = 'paused';
    }
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
  statusOverride?: string,
): void {
  const now = new Date().toISOString();
  if (statusOverride) {
    // GUARD: Only 'once' tasks can be completed via statusOverride
    let safeStatus = statusOverride;
    if (statusOverride === 'completed' && !isCompletableTask(id)) {
      console.warn(
        `[db] BLOCKED: statusOverride='completed' for recurring task ${id} — forcing 'active'`,
      );
      safeStatus = 'active';
    }
    db.prepare(
      `UPDATE scheduled_tasks SET next_run = ?, last_run = ?, last_result = ?, status = ? WHERE id = ?`,
    ).run(nextRun, now, lastResult, safeStatus, id);
  } else {
    // Only auto-complete one-off tasks (schedule_type = 'once') when nextRun is null.
    // All other task types (cron, interval) keep their current status.
    db.prepare(
      `UPDATE scheduled_tasks SET next_run = ?, last_run = ?, last_result = ?,
       status = CASE
         WHEN ? IS NULL AND schedule_type = 'once' THEN 'completed'
         ELSE status
       END
       WHERE id = ?`,
    ).run(nextRun, now, lastResult, nextRun, id);
  }
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error, cost_usd, input_tokens, output_tokens, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
    log.cost_usd || 0,
    log.input_tokens || 0,
    log.output_tokens || 0,
    log.model || null,
  );
}

// --- Self-healing & dedup ---

export function computeDedupKey(groupFolder: string, scheduleValue: string, name: string): string {
  return `${groupFolder}::${scheduleValue}::${name}`;
}

export function computePromptHash(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex');
}

export function findExistingByDedupKey(dedupKey: string): ScheduledTask | undefined {
  return db
    .prepare(`SELECT * FROM scheduled_tasks WHERE dedup_key = ? AND status IN ('active', 'paused') LIMIT 1`)
    .get(dedupKey) as ScheduledTask | undefined;
}

/** Increment consecutive failures. Returns new count and whether task was auto-disabled. */
export function incrementTaskFailures(id: string, error: string): { failures: number; disabled: boolean } {
  const task = db
    .prepare('SELECT consecutive_failures, max_failures FROM scheduled_tasks WHERE id = ?')
    .get(id) as { consecutive_failures: number; max_failures: number } | undefined;
  if (!task) return { failures: 0, disabled: false };

  const newFailures = (task.consecutive_failures || 0) + 1;
  const maxFail = task.max_failures || 5;
  const shouldDisable = newFailures >= maxFail;

  db.prepare(
    `UPDATE scheduled_tasks SET consecutive_failures = ?, last_error = ?${shouldDisable ? ", status = 'disabled'" : ''} WHERE id = ?`,
  ).run(newFailures, error.slice(0, 500), id);

  return { failures: newFailures, disabled: shouldDisable };
}

export function resetTaskFailures(id: string): void {
  db.prepare(
    `UPDATE scheduled_tasks SET consecutive_failures = 0, last_error = NULL WHERE id = ?`,
  ).run(id);
}

export function findDuplicateTaskGroups(): Array<{ dedup_key: string; tasks: ScheduledTask[] }> {
  const dupes = db
    .prepare(
      `SELECT dedup_key FROM scheduled_tasks
       WHERE dedup_key IS NOT NULL AND status IN ('active', 'paused')
       GROUP BY dedup_key HAVING COUNT(*) > 1`,
    )
    .all() as Array<{ dedup_key: string }>;

  return dupes.map(d => ({
    dedup_key: d.dedup_key,
    tasks: db
      .prepare(`SELECT * FROM scheduled_tasks WHERE dedup_key = ? AND status IN ('active', 'paused') ORDER BY last_run DESC`)
      .all(d.dedup_key) as ScheduledTask[],
  }));
}

export function mergeTaskDuplicates(keepId: string, removeIds: string[]): void {
  if (removeIds.length === 0) return;
  const placeholders = removeIds.map(() => '?').join(',');
  db.transaction(() => {
    // Move run logs to keeper
    db.prepare(`UPDATE task_run_logs SET task_id = ? WHERE task_id IN (${placeholders})`).run(keepId, ...removeIds);
    // Move comments to keeper
    db.prepare(`UPDATE task_comments SET task_id = ? WHERE task_id IN (${placeholders})`).run(keepId, ...removeIds);
    // Delete duplicates
    for (const rid of removeIds) {
      db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(rid);
    }
  })();
}

// --- Task health aggregates ---

export function getTaskHealthSummary(): {
  total: number; active: number; paused: number; disabled: number; overdue: number;
  successRate24h: number; cost24h: number; runs24h: number;
  failingTasks: Array<{ id: string; name: string; consecutiveFailures: number; lastError: string | null }>;
} {
  const counts = db.prepare(
    `SELECT status, COUNT(*) as cnt FROM scheduled_tasks GROUP BY status`,
  ).all() as Array<{ status: string; cnt: number }>;

  const total = counts.reduce((s, c) => s + c.cnt, 0);
  const byStatus = Object.fromEntries(counts.map(c => [c.status, c.cnt]));

  const overdue = db.prepare(
    `SELECT COUNT(*) as cnt FROM scheduled_tasks WHERE status = 'active' AND next_run IS NOT NULL AND next_run < datetime('now', '-5 minutes')`,
  ).get() as { cnt: number };

  const runs24h = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as ok, COALESCE(SUM(cost_usd), 0) as cost
     FROM task_run_logs WHERE run_at > datetime('now', '-1 day')`,
  ).get() as { total: number; ok: number; cost: number };

  const failing = db.prepare(
    `SELECT id, name, consecutive_failures, last_error FROM scheduled_tasks
     WHERE consecutive_failures > 0 AND status IN ('active', 'disabled')
     ORDER BY consecutive_failures DESC LIMIT 10`,
  ).all() as Array<{ id: string; name: string; consecutive_failures: number; last_error: string | null }>;

  return {
    total,
    active: byStatus['active'] || 0,
    paused: byStatus['paused'] || 0,
    disabled: byStatus['disabled'] || 0,
    overdue: overdue.cnt,
    successRate24h: runs24h.total > 0 ? Math.round((runs24h.ok / runs24h.total) * 100) : 100,
    cost24h: Math.round(runs24h.cost * 100) / 100,
    runs24h: runs24h.total,
    failingTasks: failing.map(f => ({
      id: f.id,
      name: f.name || f.id,
      consecutiveFailures: f.consecutive_failures,
      lastError: f.last_error,
    })),
  };
}

export function getTaskCostTrends(days: number = 14): Array<{ date: string; cost: number; runs: number; failures: number }> {
  return db.prepare(
    `SELECT date(run_at) as date, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as runs,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failures
     FROM task_run_logs WHERE run_at > datetime('now', '-' || ? || ' days')
     GROUP BY date(run_at) ORDER BY date`,
  ).all(days) as Array<{ date: string; cost: number; runs: number; failures: number }>;
}

// --- Task templates ---

export function getTaskTemplates(): Array<{
  slug: string; name: string; description: string | null; default_schedule: string;
  default_group: string; category: string | null; venture_file: string | null; max_runs_per_day: number;
}> {
  return db.prepare(
    `SELECT slug, name, description, default_schedule, default_group, category, venture_file, max_runs_per_day FROM task_templates ORDER BY name`,
  ).all() as Array<{
    slug: string; name: string; description: string | null; default_schedule: string;
    default_group: string; category: string | null; venture_file: string | null; max_runs_per_day: number;
  }>;
}

export function getTaskTemplate(slug: string): { slug: string; name: string; default_prompt: string; default_schedule: string; default_group: string; default_context_mode: string; category: string | null; venture_file: string | null; max_runs_per_day: number } | undefined {
  return db.prepare(`SELECT * FROM task_templates WHERE slug = ?`).get(slug) as { slug: string; name: string; default_prompt: string; default_schedule: string; default_group: string; default_context_mode: string; category: string | null; venture_file: string | null; max_runs_per_day: number } | undefined;
}

export function seedTaskTemplates(templates: Array<{ slug: string; name: string; description: string | null; default_prompt: string; default_schedule: string; default_group: string; category: string | null; venture_file: string | null; max_runs_per_day: number }>): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO task_templates (slug, name, description, default_prompt, default_schedule, default_group, category, venture_file, max_runs_per_day, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const t of templates) {
    stmt.run(t.slug, t.name, t.description, t.default_prompt, t.default_schedule, t.default_group, t.category, t.venture_file, t.max_runs_per_day, now, now);
  }
}

// --- Task comments ---

export function addTaskComment(
  taskId: string,
  sender: string,
  message: string,
  severity: string = 'info',
): void {
  db.prepare(
    `INSERT INTO task_comments (task_id, sender, message, severity, read, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  ).run(taskId, sender, message, severity, new Date().toISOString());
}

export function getTaskComments(taskId: string): Array<{
  id: number;
  sender: string;
  message: string;
  severity: string;
  read: number;
  created_at: string;
}> {
  return db
    .prepare(
      'SELECT id, sender, message, severity, read, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at ASC',
    )
    .all(taskId) as Array<{
    id: number;
    sender: string;
    message: string;
    severity: string;
    read: number;
    created_at: string;
  }>;
}

export function getUnreadCommentCounts(): Record<string, number> {
  const rows = db
    .prepare(
      'SELECT task_id, COUNT(*) as cnt FROM task_comments WHERE read = 0 GROUP BY task_id',
    )
    .all() as Array<{ task_id: string; cnt: number }>;
  const result: Record<string, number> = {};
  for (const r of rows) result[r.task_id] = r.cnt;
  return result;
}

export function markCommentsRead(taskId: string): void {
  db.prepare(
    'UPDATE task_comments SET read = 1 WHERE task_id = ? AND read = 0',
  ).run(taskId);
}

// --- Task thread helpers ---

export function setTaskThreadId(taskId: string, threadId: string): void {
  db.prepare('UPDATE scheduled_tasks SET thread_id = ? WHERE id = ?').run(
    threadId,
    taskId,
  );
}

export function getTaskThreadId(taskId: string): string | null {
  const row = db
    .prepare('SELECT thread_id FROM scheduled_tasks WHERE id = ?')
    .get(taskId) as { thread_id: string | null } | undefined;
  return row?.thread_id ?? null;
}

export function getTaskByThreadId(threadId: string): ScheduledTask | undefined {
  return db
    .prepare('SELECT * FROM scheduled_tasks WHERE thread_id = ?')
    .get(threadId) as ScheduledTask | undefined;
}

// --- Project thread helpers ---

export function setProjectThreadId(
  projectFile: string,
  threadId: string,
): void {
  db.prepare(
    'INSERT OR REPLACE INTO project_threads (project_file, thread_id) VALUES (?, ?)',
  ).run(projectFile, threadId);
}

export function getProjectThreadId(projectFile: string): string | null {
  const row = db
    .prepare('SELECT thread_id FROM project_threads WHERE project_file = ?')
    .get(projectFile) as { thread_id: string } | undefined;
  return row?.thread_id ?? null;
}

export function getAllProjectThreads(): Array<{
  project_file: string;
  thread_id: string;
}> {
  return db
    .prepare('SELECT project_file, thread_id FROM project_threads')
    .all() as Array<{ project_file: string; thread_id: string }>;
}

export function getProjectByThreadId(threadId: string): string | null {
  const row = db
    .prepare('SELECT project_file FROM project_threads WHERE thread_id = ?')
    .get(threadId) as { project_file: string } | undefined;
  return row?.project_file ?? null;
}

export function logCrossGroupSend(
  sourceGroup: string,
  targetJid: string,
  targetGroup: string,
): void {
  db.prepare(
    'INSERT INTO cross_group_sends (source_group, target_jid, target_group, timestamp) VALUES (?, ?, ?, ?)',
  ).run(sourceGroup, targetJid, targetGroup, new Date().toISOString());
}

export function queueThreadMessage(
  threadId: string,
  sender: string,
  message: string,
): void {
  db.prepare(
    'INSERT INTO pending_thread_messages (thread_id, sender, message, created_at) VALUES (?, ?, ?, ?)',
  ).run(threadId, sender, message, new Date().toISOString());
}

export function drainPendingThreadMessages(
  limit = 50,
): Array<{ id: number; thread_id: string; sender: string; message: string }> {
  const rows = db
    .prepare(
      `SELECT id, thread_id, sender, message FROM pending_thread_messages ORDER BY id ASC LIMIT ${limit}`,
    )
    .all() as Array<{
    id: number;
    thread_id: string;
    sender: string;
    message: string;
  }>;
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    db.prepare(
      `DELETE FROM pending_thread_messages WHERE id IN (${ids.join(',')})`,
    ).run();
  }
  return rows;
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
        is_main: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? JSON.parse(row.container_config)
      : undefined,
    requiresTrigger:
      row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    isMain: row.is_main === 1 ? true : undefined,
  };
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.containerConfig ? JSON.stringify(group.containerConfig) : null,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
    group.isMain ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db.prepare('SELECT * FROM registered_groups').all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
    is_main: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? JSON.parse(row.container_config)
        : undefined,
      requiresTrigger:
        row.requires_trigger === null ? undefined : row.requires_trigger === 1,
      isMain: row.is_main === 1 ? true : undefined,
    };
  }
  return result;
}

// --- JSON migration ---

function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // Migrate router_state.json
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // Migrate sessions.json
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // Migrate registered_groups.json
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
}

// --- Encrypted secrets ---

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const hex = process.env.SECRETS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64)
    throw new Error('SECRETS_ENCRYPTION_KEY missing or invalid in .env');
  return Buffer.from(hex, 'hex');
}

function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(stored: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, dataHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf-8') + decipher.final('utf-8');
}

export interface SecretEntry {
  name: string;
  description: string;
  updated_at: string;
}

export function storeSecret(
  name: string,
  value: string,
  description?: string,
): void {
  const now = new Date().toISOString();
  const encrypted = encryptValue(value);
  db.prepare(
    `
    INSERT INTO secrets (name, encrypted_value, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value, description=excluded.description, updated_at=excluded.updated_at
  `,
  ).run(name, encrypted, description ?? '', now, now);
}

export function getSecret(name: string): string | undefined {
  const row = db
    .prepare('SELECT encrypted_value FROM secrets WHERE name = ?')
    .get(name) as { encrypted_value: string } | undefined;
  if (!row) return undefined;
  try {
    return decryptValue(row.encrypted_value);
  } catch {
    logger.error({ name }, 'Failed to decrypt secret');
    return undefined;
  }
}

export function listSecrets(): SecretEntry[] {
  return db
    .prepare('SELECT name, description, updated_at FROM secrets ORDER BY name')
    .all() as SecretEntry[];
}

export function getAllSecretsDecrypted(): Record<string, string> {
  const rows = db
    .prepare('SELECT name, encrypted_value FROM secrets')
    .all() as { name: string; encrypted_value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    try {
      result[row.name] = decryptValue(row.encrypted_value);
    } catch {
      logger.error({ name: row.name }, 'Failed to decrypt secret, skipping');
    }
  }
  return result;
}
