import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { CronExpressionParser } from 'cron-parser';
import YAML from 'yaml';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

// Load .env file so dashboard has access to Google OAuth etc.
try {
  const envContent = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const PORT = parseInt(process.env.DASHBOARD_PORT || '3333', 10);
const DB_PATH = path.join(PROJECT_ROOT, 'store', 'messages.db');
const LOG_PATH = path.join(PROJECT_ROOT, 'logs', 'nanoclaw.log');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const GROUPS_DIR = path.join(PROJECT_ROOT, 'groups');
const REVIEWS_PATH = path.join(GROUPS_DIR, 'main', 'dashboard-reviews.json');
const STATUS_BOARD_PATH = '/root/obsidian-vault/Memory/Status-Board.md';
const RESEARCH_DIGEST_PATH = '/root/obsidian-vault/AI-Research/Research-Digest.md';
const OBSIDIAN_VAULT = '/root/obsidian-vault';
const PROJECTS_DIR = path.join(OBSIDIAN_VAULT, 'Projects');
const VENTURES_DIR = path.join(OBSIDIAN_VAULT, 'Ventures');
const DAILY_DIR = path.join(OBSIDIAN_VAULT, 'Daily');
const CONVERSATIONS_DIR = path.join(OBSIDIAN_VAULT, 'Conversations');
const GROUP_CONVERSATIONS_DIR = path.join(PROJECT_ROOT, 'groups');
const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');
const TZ = process.env.TZ || 'America/New_York';

// --- Dashboard Auth Token ---
const TOKEN_PATH = path.join(DATA_DIR, 'dashboard-token.txt');
function loadOrCreateToken(): string {
  // Env var override takes priority
  if (process.env.DASHBOARD_TOKEN) return process.env.DASHBOARD_TOKEN.trim();
  try {
    const existing = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
    if (existing) return existing;
  } catch {}
  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, token, 'utf-8');
  return token;
}
const DASHBOARD_TOKEN = loadOrCreateToken();
const AUTH_COOKIE_NAME = 'dashboard_token';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return cookies;
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthenticated(req: http.IncomingMessage, url: URL): boolean {
  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && timingSafeCompare(match[1], DASHBOARD_TOKEN)) return true;
  }
  // Check query param
  const tokenParam = url.searchParams.get('token');
  if (tokenParam && timingSafeCompare(tokenParam, DASHBOARD_TOKEN)) return true;
  // Check cookie
  const cookies = parseCookies(req.headers['cookie']);
  if (cookies[AUTH_COOKIE_NAME] && timingSafeCompare(cookies[AUTH_COOKIE_NAME], DASHBOARD_TOKEN)) return true;
  return false;
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma('busy_timeout = 1000');
db.exec('PRAGMA journal_mode = WAL');

// Separate writable connection for task updates
const dbWrite = new Database(DB_PATH, { fileMustExist: true });
dbWrite.pragma('busy_timeout = 2000');
dbWrite.exec('PRAGMA journal_mode = WAL');

// --- Accounting schema (auto-migrate) ---
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

try {
  dbWrite.exec(`
    CREATE TABLE IF NOT EXISTS accounting_accounts (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_code TEXT,
      is_system INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS accounting_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      account_code TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      vendor TEXT,
      reference TEXT,
      receipt_path TEXT,
      source TEXT DEFAULT 'manual',
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_code) REFERENCES accounting_accounts(code)
    );
    CREATE INDEX IF NOT EXISTS idx_acct_date ON accounting_entries(date);
    CREATE INDEX IF NOT EXISTS idx_acct_category ON accounting_entries(category);
    CREATE INDEX IF NOT EXISTS idx_acct_type ON accounting_entries(type);
  `);

  // Add is_reconciled column (idempotent — ALTER fails if column exists)
  try {
    dbWrite.exec(`ALTER TABLE accounting_entries ADD COLUMN is_reconciled INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* column already exists */ }

  // Seed chart of accounts if empty
  const acctCount = dbWrite.prepare('SELECT COUNT(*) as c FROM accounting_accounts').get() as { c: number };
  if (acctCount.c === 0) {
    const accounts = [
      // Revenue
      ['4000', 'Revenue', 'revenue', null],
      ['4100', 'Consulting Revenue', 'revenue', '4000'],
      ['4200', 'API / SaaS Revenue', 'revenue', '4000'],
      ['4300', 'Trading Gains', 'revenue', '4000'],
      ['4400', 'Other Income', 'revenue', '4000'],
      // COGS
      ['5000', 'Cost of Goods Sold', 'cogs', null],
      ['5100', 'AI API Costs (Anthropic)', 'cogs', '5000'],
      ['5150', 'Anthropic Subscription (Claude Max)', 'cogs', '5000'],
      ['5200', 'AI API Costs (OpenRouter)', 'cogs', '5000'],
      ['5250', 'X / Twitter API', 'cogs', '5000'],
      ['5300', 'Server / VPS Hosting', 'cogs', '5000'],
      ['5400', 'Domain & DNS', 'cogs', '5000'],
      // OpEx
      ['6000', 'Operating Expenses', 'opex', null],
      ['6100', 'Software Subscriptions', 'opex', '6000'],
      ['6110', 'GitHub / Dev Tools', 'opex', '6100'],
      ['6120', 'Obsidian / Productivity', 'opex', '6100'],
      ['6130', 'Discord / Communication', 'opex', '6100'],
      ['6200', 'Infrastructure', 'opex', '6000'],
      ['6210', 'Docker / Container Services', 'opex', '6200'],
      ['6220', 'Backup / Storage', 'opex', '6200'],
      ['6300', 'Professional Services', 'opex', '6000'],
      ['6400', 'Marketing & Advertising', 'opex', '6000'],
      ['6500', 'Office & Equipment', 'opex', '6000'],
      ['6600', 'Travel & Entertainment', 'opex', '6000'],
      ['6700', 'Insurance', 'opex', '6000'],
      ['6800', 'Taxes & Licenses', 'opex', '6000'],
      ['6900', 'Miscellaneous', 'opex', '6000'],
    ];
    const ins = dbWrite.prepare('INSERT INTO accounting_accounts (code, name, type, parent_code, is_system) VALUES (?, ?, ?, ?, 1)');
    for (const [code, name, type, parent] of accounts) {
      ins.run(code, name, type, parent);
    }
  }
  // Add new accounts if missing (migration)
  const addIfMissing = dbWrite.prepare('INSERT OR IGNORE INTO accounting_accounts (code, name, type, parent_code, is_system) VALUES (?, ?, ?, ?, 1)');
  addIfMissing.run('5150', 'Anthropic Subscription (Claude Max)', 'cogs', '5000');
  addIfMissing.run('5250', 'X / Twitter API', 'cogs', '5000');

  // Wallet / asset tracking tables
  dbWrite.exec(`
    CREATE TABLE IF NOT EXISTS wallet_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      chain TEXT NOT NULL DEFAULT 'base',
      label TEXT,
      added_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      total_usd REAL NOT NULL,
      eth_balance REAL DEFAULT 0,
      eth_price REAL DEFAULT 0,
      tokens TEXT,
      FOREIGN KEY (wallet_id) REFERENCES wallet_assets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_snap_ts ON wallet_snapshots(wallet_id, timestamp);
  `);

  // Seed the wallet if not already added
  const walletExists = dbWrite.prepare("SELECT id FROM wallet_assets WHERE address = ?")
    .get('0x073b227DcA24dE3ae301f5802F4c99444fd58662') as { id: number } | undefined;
  if (!walletExists) {
    dbWrite.prepare("INSERT INTO wallet_assets (address, chain, label, added_at) VALUES (?, 'base', 'Main Base Wallet', ?)")
      .run('0x073b227DcA24dE3ae301f5802F4c99444fd58662', new Date().toISOString());
  }
} catch (err) {
  console.error('Accounting schema migration:', err);
}

// --- Reviews store (file-based, readable by agents) ---

interface Review {
  taskId: string;
  action: 'completed' | 'needs_review' | 'comment';
  comment?: string;
  timestamp: string;
}

function loadReviews(): Review[] {
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf-8'));
  } catch { return []; }
}

function saveReviews(reviews: Review[]): void {
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(reviews, null, 2));
}

// --- Task Comments (DB-backed) ---

// --- Cross-Object Associations (HubSpot-style) ---
// Association types: task↔contact, task↔project, project↔contact, task↔task
function ensureAssociationsTable(): void {
  dbWrite.exec(`
    CREATE TABLE IF NOT EXISTS associations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_type TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(from_type, from_id, to_type, to_id)
    );
    CREATE INDEX IF NOT EXISTS idx_assoc_from ON associations(from_type, from_id);
    CREATE INDEX IF NOT EXISTS idx_assoc_to ON associations(to_type, to_id);
  `);
}

function getAssociations(objectType: string, objectId: string) {
  // Get associations where this object is on either side
  const forward = db.prepare(
    'SELECT id, to_type as type, to_id as objectId, label, created_at FROM associations WHERE from_type = ? AND from_id = ?',
  ).all(objectType, objectId) as Array<{ id: number; type: string; objectId: string; label: string | null; created_at: string }>;
  const reverse = db.prepare(
    'SELECT id, from_type as type, from_id as objectId, label, created_at FROM associations WHERE to_type = ? AND to_id = ?',
  ).all(objectType, objectId) as Array<{ id: number; type: string; objectId: string; label: string | null; created_at: string }>;
  return [...forward, ...reverse];
}

function createAssociation(fromType: string, fromId: string, toType: string, toId: string, label?: string) {
  dbWrite.prepare(
    'INSERT OR IGNORE INTO associations (from_type, from_id, to_type, to_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(fromType, fromId, toType, toId, label || null, new Date().toISOString());
}

function deleteAssociation(id: number) {
  dbWrite.prepare('DELETE FROM associations WHERE id = ?').run(id);
}

// Resolve association display info (name/title for each object type)
function resolveAssociationDisplay(type: string, id: string): { name: string; icon: string; link: string } {
  if (type === 'task') {
    const task = db.prepare('SELECT prompt, group_folder FROM scheduled_tasks WHERE id = ?').get(id) as { prompt: string; group_folder: string } | undefined;
    const emojis: Record<string, string> = { main: '🧙', 'ai-research': '🔬', 'business-ideas': '💼', 'health-wellness': '🧘', trading: '📈', crypto: '₿', contacts: '📇' };
    return { name: task ? task.prompt.substring(0, 60) : id, icon: task ? (emojis[task.group_folder] || '📋') : '📋', link: `tasks:${id}` };
  }
  if (type === 'contact') {
    const name = id.replace('.md', '').replace(/-/g, ' ');
    return { name, icon: '👤', link: `crm:${id}` };
  }
  if (type === 'project') {
    const name = id.replace('.md', '').replace(/-/g, ' ');
    return { name, icon: '📁', link: `projects:${id}` };
  }
  if (type === 'venture') {
    const name = id.replace('.md', '').replace(/-/g, ' ');
    return { name, icon: '💼', link: `ventures:${id}` };
  }
  if (type === 'interaction') {
    return { name: id, icon: '📞', link: '' };
  }
  if (type === 'document') {
    const name = id.replace('.md', '').replace(/-/g, ' ');
    return { name, icon: '📄', link: `docs:${id}` };
  }
  return { name: id, icon: '🔗', link: '' };
}

type AssocRow = { id: number; type: string; objectId: string; label: string | null; created_at: string; sourceId: string };

/** Batch-fetch associations for multiple objects of the same type in one query */
function getAssociationsBatch(objectType: string, objectIds: string[]): Record<string, Array<Omit<AssocRow, 'sourceId'>>> {
  if (objectIds.length === 0) return {};
  const placeholders = objectIds.map(() => '?').join(',');
  const forward = db.prepare(
    `SELECT id, from_id as sourceId, to_type as type, to_id as objectId, label, created_at FROM associations WHERE from_type = ? AND from_id IN (${placeholders})`,
  ).all(objectType, ...objectIds) as AssocRow[];
  const reverse = db.prepare(
    `SELECT id, to_id as sourceId, from_type as type, from_id as objectId, label, created_at FROM associations WHERE to_type = ? AND to_id IN (${placeholders})`,
  ).all(objectType, ...objectIds) as AssocRow[];
  const result: Record<string, Array<Omit<AssocRow, 'sourceId'>>> = {};
  for (const row of [...forward, ...reverse]) {
    const { sourceId, ...rest } = row;
    if (!result[sourceId]) result[sourceId] = [];
    result[sourceId].push(rest);
  }
  return result;
}

/** Batch-resolve display info for a set of (type, id) pairs */
function resolveAssociationDisplayBatch(pairs: Array<{ type: string; id: string }>): Map<string, { name: string; icon: string; link: string }> {
  const result = new Map<string, { name: string; icon: string; link: string }>();
  if (pairs.length === 0) return result;

  const key = (type: string, id: string) => `${type}::${id}`;
  const emojis: Record<string, string> = { main: '🧙', 'ai-research': '🔬', 'business-ideas': '💼', 'health-wellness': '🧘', trading: '📈', crypto: '₿', contacts: '📇' };

  // Group by type to do bulk queries
  const byType: Record<string, string[]> = {};
  for (const p of pairs) {
    const k = key(p.type, p.id);
    if (result.has(k)) continue; // dedup
    if (!byType[p.type]) byType[p.type] = [];
    byType[p.type].push(p.id);
  }

  // Batch-resolve tasks
  if (byType['task']?.length) {
    const ids = byType['task'];
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, prompt, group_folder FROM scheduled_tasks WHERE id IN (${placeholders})`).all(...ids) as Array<{ id: string; prompt: string; group_folder: string }>;
    const taskMap = new Map(rows.map(r => [r.id, r]));
    for (const id of ids) {
      const task = taskMap.get(id);
      result.set(key('task', id), { name: task ? task.prompt.substring(0, 60) : id, icon: task ? (emojis[task.group_folder] || '📋') : '📋', link: `tasks:${id}` });
    }
  }

  // Contacts, projects, documents, interactions — no DB query needed, just string transforms
  for (const type of ['contact', 'project', 'venture', 'document', 'interaction']) {
    if (!byType[type]?.length) continue;
    for (const id of byType[type]) {
      if (type === 'contact') {
        result.set(key(type, id), { name: id.replace('.md', '').replace(/-/g, ' '), icon: '👤', link: `crm:${id}` });
      } else if (type === 'project') {
        result.set(key(type, id), { name: id.replace('.md', '').replace(/-/g, ' '), icon: '📁', link: `projects:${id}` });
      } else if (type === 'venture') {
        result.set(key(type, id), { name: id.replace('.md', '').replace(/-/g, ' '), icon: '💼', link: `ventures:${id}` });
      } else if (type === 'document') {
        result.set(key(type, id), { name: id.replace('.md', '').replace(/-/g, ' '), icon: '📄', link: `docs:${id}` });
      } else if (type === 'interaction') {
        result.set(key(type, id), { name: id, icon: '📞', link: '' });
      }
    }
  }

  // Fallback for unknown types
  for (const p of pairs) {
    const k = key(p.type, p.id);
    if (!result.has(k)) result.set(k, { name: p.id, icon: '🔗', link: '' });
  }

  return result;
}

function ensureTaskCommentsTable(): void {
  // Note: no FOREIGN KEY on task_id — we also use 'proj:filename' keys for project comments
  dbWrite.exec(`
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
    CREATE TABLE IF NOT EXISTS project_threads (
      project_file TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL
    );
  `);
}

function getProjectThreadId(projectFile: string): string | null {
  const row = db.prepare('SELECT thread_id FROM project_threads WHERE project_file = ?').get(projectFile) as { thread_id: string } | undefined;
  return row?.thread_id || null;
}

function setProjectThreadId(projectFile: string, threadId: string): void {
  dbWrite.prepare('INSERT OR REPLACE INTO project_threads (project_file, thread_id) VALUES (?, ?)').run(projectFile, threadId);
}

function getTaskComments(taskId: string) {
  return db.prepare(
    'SELECT id, sender, message, severity, read, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at ASC',
  ).all(taskId) as Array<{ id: number; sender: string; message: string; severity: string; read: number; created_at: string }>;
}

function addTaskComment(taskId: string, sender: string, message: string, severity: string = 'info') {
  dbWrite.prepare(
    'INSERT INTO task_comments (task_id, sender, message, severity, read, created_at) VALUES (?, ?, ?, ?, 0, ?)',
  ).run(taskId, sender, message, severity, new Date().toISOString());
}

function getUnreadCommentCounts(): Record<string, number> {
  const rows = db.prepare(
    'SELECT task_id, COUNT(*) as cnt FROM task_comments WHERE read = 0 GROUP BY task_id',
  ).all() as Array<{ task_id: string; cnt: number }>;
  const result: Record<string, number> = {};
  for (const r of rows) result[r.task_id] = r.cnt;
  return result;
}

function markCommentsRead(taskId: string) {
  dbWrite.prepare('UPDATE task_comments SET read = 1 WHERE task_id = ? AND read = 0').run(taskId);
}

function getTotalUnreadCount(): number {
  return (db.prepare('SELECT COUNT(*) as cnt FROM task_comments WHERE read = 0').get() as { cnt: number }).cnt;
}

// --- Helpers ---

const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function deriveChannel(jid: string): string {
  if (jid.startsWith('dc:')) return 'discord';
  if (jid.startsWith('tg:')) return 'telegram';
  if (jid.includes('@g.us') || jid.includes('@s.whatsapp.net')) return 'whatsapp';
  if (jid.startsWith('sl:')) return 'slack';
  return 'unknown';
}

function readFileSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; }
}

// --- Route handlers ---

function getService() {
  const raw = exec('systemctl show nanoclaw.service --property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,MemoryCurrent');
  const props: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k) props[k.trim()] = v.join('=').trim();
  }
  const startStr = props.ExecMainStartTimestamp || '';
  const startDate = startStr ? new Date(startStr) : null;
  const uptimeMs = startDate ? Date.now() - startDate.getTime() : 0;
  const memBytes = parseInt(props.MemoryCurrent || '0', 10);
  return {
    active: props.ActiveState || 'unknown',
    sub: props.SubState || 'unknown',
    pid: parseInt(props.MainPID || '0', 10),
    uptimeMs, uptime: uptimeMs > 0 ? formatDuration(uptimeMs) : 'N/A',
    memory: memBytes > 0 ? humanSize(memBytes) : 'N/A',
    startedAt: startDate?.toISOString() || null,
  };
}

function getContainers() {
  const raw = exec("docker ps --filter name=nanoclaw --format '{{.Names}}\\t{{.Status}}\\t{{.CreatedAt}}'");
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [name, status, created] = line.split('\t');
    // Container names: nanoclaw-{group}-{timestamp}, where group can have hyphens (e.g. health-wellness)
    // Strip the trailing timestamp segment (all digits) and the nanoclaw- prefix
    const groupName = name?.replace(/^nanoclaw-/, '').replace(/-\d+$/, '') || 'unknown';
    return { name, status, group: groupName, created };
  });
}

function getGroups() {
  const rows = db.prepare(`
    SELECT rg.jid, rg.name, rg.folder, rg.trigger_pattern, rg.requires_trigger, rg.is_main,
           c.last_message_time, c.channel
    FROM registered_groups rg
    LEFT JOIN chats c ON rg.jid = c.jid
    ORDER BY c.last_message_time DESC
  `).all() as Array<{
    jid: string; name: string; folder: string; trigger_pattern: string;
    requires_trigger: number | null; is_main: number | null;
    last_message_time: string | null; channel: string | null;
  }>;
  return rows.map(r => ({
    jid: r.jid, name: r.name, folder: r.folder, trigger: r.trigger_pattern,
    requiresTrigger: r.requires_trigger === 1, isMain: r.is_main === 1,
    lastActivity: r.last_message_time, channel: r.channel || deriveChannel(r.jid),
  }));
}

function getChannelHealth() {
  // Per-group: message count last 24h, last 7d, total; last task run status
  const groups = db.prepare('SELECT jid, name, folder FROM registered_groups').all() as Array<{
    jid: string; name: string; folder: string;
  }>;

  const now = new Date();
  const h24 = new Date(now.getTime() - 86400000).toISOString();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();

  return groups.map(g => {
    const msg24 = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_jid = ? AND timestamp > ?').get(g.jid, h24) as { c: number }).c;
    const msg7d = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_jid = ? AND timestamp > ?').get(g.jid, d7) as { c: number }).c;
    const lastRun = db.prepare(`
      SELECT trl.status, trl.run_at, trl.duration_ms FROM task_run_logs trl
      JOIN scheduled_tasks st ON trl.task_id = st.id
      WHERE st.group_folder = ? ORDER BY trl.run_at DESC LIMIT 1
    `).get(g.folder) as { status: string; run_at: string; duration_ms: number } | undefined;
    const activeTasks = (db.prepare("SELECT COUNT(*) as c FROM scheduled_tasks WHERE group_folder = ? AND status = 'active'").get(g.folder) as { c: number }).c;

    // Session size
    const session = db.prepare('SELECT session_id FROM sessions WHERE group_folder = ?').get(g.folder) as { session_id: string } | undefined;
    let sessionSize = 0;
    if (session) {
      try {
        sessionSize = fs.statSync(path.join(DATA_DIR, 'sessions', g.folder, '.claude', 'projects', '-workspace-group', `${session.session_id}.jsonl`)).size;
      } catch {}
    }

    return {
      name: g.name, folder: g.folder, jid: g.jid,
      messages24h: msg24, messages7d: msg7d,
      activeTasks, lastRun: lastRun || null,
      sessionSize: humanSize(sessionSize), sessionBytes: sessionSize,
    };
  });
}

function getMessages(folder: string, limit: number) {
  const query = folder === 'all'
    ? db.prepare(`
        SELECT m.sender_name, m.content, m.timestamp, m.is_from_me, m.is_bot_message, rg.folder
        FROM messages m JOIN registered_groups rg ON m.chat_jid = rg.jid
        ORDER BY m.timestamp DESC LIMIT ?
      `)
    : db.prepare(`
        SELECT m.sender_name, m.content, m.timestamp, m.is_from_me, m.is_bot_message, rg.folder
        FROM messages m JOIN registered_groups rg ON m.chat_jid = rg.jid
        WHERE rg.folder = ? ORDER BY m.timestamp DESC LIMIT ?
      `);
  const rows = (folder === 'all' ? query.all(limit) : query.all(folder, limit)) as Array<{
    sender_name: string; content: string; timestamp: string;
    is_from_me: number; is_bot_message: number; folder: string;
  }>;
  return rows.map(r => ({
    sender: r.sender_name, content: r.content?.substring(0, 500) || '',
    timestamp: r.timestamp, isFromMe: r.is_from_me === 1, isBot: r.is_bot_message === 1,
    group: r.folder,
  }));
}

/** Derive progress % from task state when not explicitly set */
function deriveProgress(t: { progress: number; status: string; last_run: string | null; isRunning?: boolean }, hasUnreadQuestion: boolean): number {
  if (t.progress > 0) return t.progress;
  if (t.status === 'completed') return 100;
  if (hasUnreadQuestion) return 75;
  if (t.isRunning) return 50;
  if (t.last_run) return 25;
  return 0;
}

function getTasks() {
  const tasks = db.prepare(`
    SELECT id, group_folder, prompt, schedule_type, schedule_value, next_run, last_run, last_result, status, created_at, COALESCE(progress, 0) as progress, thread_id,
      name, venture_file, project_file, category, consecutive_failures, max_failures, last_error, template_slug
    FROM scheduled_tasks
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'disabled' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, next_run ASC
  `).all() as Array<{
    id: string; group_folder: string; prompt: string; schedule_type: string;
    schedule_value: string; next_run: string | null; last_run: string | null;
    last_result: string | null; status: string; created_at: string; progress: number;
    thread_id: string | null; name: string | null; venture_file: string | null;
    project_file: string | null; category: string | null; consecutive_failures: number;
    max_failures: number; last_error: string | null; template_slug: string | null;
  }>;

  const recentRuns = db.prepare(`
    SELECT trl.task_id, trl.run_at, trl.duration_ms, trl.status, trl.error, trl.result,
           COALESCE(trl.cost_usd, 0) as cost_usd,
           COALESCE(trl.input_tokens, 0) as input_tokens,
           COALESCE(trl.output_tokens, 0) as output_tokens,
           st.group_folder, st.prompt
    FROM task_run_logs trl JOIN scheduled_tasks st ON trl.task_id = st.id
    ORDER BY trl.run_at DESC LIMIT 30
  `).all() as Array<{
    task_id: string; run_at: string; duration_ms: number; status: string;
    error: string | null; result: string | null; cost_usd: number;
    input_tokens: number; output_tokens: number; group_folder: string; prompt: string;
  }>;

  const reviews = loadReviews();
  const reviewsByTask: Record<string, Review[]> = {};
  for (const r of reviews) {
    if (!reviewsByTask[r.taskId]) reviewsByTask[r.taskId] = [];
    reviewsByTask[r.taskId].push(r);
  }

  // Build project associations: task_id -> project name
  const projectMap: Record<string, string> = {};
  try {
    const projFiles = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
    for (const f of projFiles) {
      const content = readFileSafe(path.join(PROJECTS_DIR, f));
      const { frontmatter } = parseFrontmatter(content);
      const projName = f.replace('.md', '').replace(/-/g, ' ');
      for (const tid of (frontmatter.tasks || [])) {
        projectMap[tid] = projName;
      }
    }
  } catch {}

  // Get unread comment counts and recent comments per task
  const unreadCounts = getUnreadCommentCounts();
  const allComments = db.prepare(
    `SELECT id, task_id, sender, message, severity, read, created_at FROM task_comments ORDER BY created_at DESC LIMIT 500`,
  ).all() as Array<{ id: number; task_id: string; sender: string; message: string; severity: string; read: number; created_at: string }>;
  const taskCommentsByTask: Record<string, typeof allComments> = {};
  for (const c of allComments) {
    if (!taskCommentsByTask[c.task_id]) taskCommentsByTask[c.task_id] = [];
    taskCommentsByTask[c.task_id].push(c);
  }

  // Get last run cost/duration per task
  const lastRunByTask: Record<string, { cost_usd: number; duration_ms: number; input_tokens: number; output_tokens: number }> = {};
  const lastRuns = db.prepare(`
    SELECT task_id, COALESCE(cost_usd, 0) as cost_usd, duration_ms,
           COALESCE(input_tokens, 0) as input_tokens, COALESCE(output_tokens, 0) as output_tokens
    FROM task_run_logs WHERE id IN (
      SELECT MAX(id) FROM task_run_logs GROUP BY task_id
    )
  `).all() as Array<{ task_id: string; cost_usd: number; duration_ms: number; input_tokens: number; output_tokens: number }>;
  for (const r of lastRuns) lastRunByTask[r.task_id] = r;

  // Batch-fetch all associations for all tasks in two queries
  const taskIds = tasks.map(t => t.id);
  const assocsByTask = getAssociationsBatch('task', taskIds);
  // Collect all unique (type, id) pairs for display resolution
  const allAssocPairs: Array<{ type: string; id: string }> = [];
  for (const assocs of Object.values(assocsByTask)) {
    for (const a of assocs) allAssocPairs.push({ type: a.type, id: a.objectId });
  }
  const displayMap = resolveAssociationDisplayBatch(allAssocPairs);

  // Detect tasks currently running: container active AND next_run was recently set (within 10 min) or last_run is very recent (within 10 min)
  const containers = getContainers();
  const runningGroups = new Set(containers.map(c => c.group));
  const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();

  return {
    tasks: tasks.map(t => {
      // A task is "running" if: its group has an active container AND the task was recently triggered
      const groupRunning = runningGroups.has(t.group_folder);
      const recentlyTriggered = t.last_run && t.last_run > tenMinAgo;
      const justStarted = t.next_run && t.next_run <= new Date().toISOString() && t.next_run > tenMinAgo;
      const isRunning = groupRunning && (recentlyTriggered || justStarted);
      const hasUnreadQuestion = (taskCommentsByTask[t.id] || []).some(c => c.severity === 'question' && !c.read);
      return {
      ...t, prompt: t.prompt.substring(0, 500),
      lastResult: t.last_result?.substring(0, 200) || null,
      reviews: reviewsByTask[t.id] || [],
      project: projectMap[t.id] || null,
      lastRunCost: lastRunByTask[t.id]?.cost_usd || 0,
      lastRunDuration: lastRunByTask[t.id]?.duration_ms || 0,
      lastRunTokens: lastRunByTask[t.id] ? (lastRunByTask[t.id].input_tokens + lastRunByTask[t.id].output_tokens) : 0,
      unread: unreadCounts[t.id] || 0,
      comments: taskCommentsByTask[t.id] || [],
      isRunning,
      progress: deriveProgress({ ...t, isRunning }, hasUnreadQuestion),
      associations: (assocsByTask[t.id] || []).map(a => ({
        ...a,
        display: displayMap.get(`${a.type}::${a.objectId}`) || { name: a.objectId, icon: '🔗', link: '' },
      })),
    };}),
    recentRuns: recentRuns.map(r => ({
      ...r, prompt: r.prompt.substring(0, 150),
      result: r.result?.substring(0, 200) || null,
    })),
  };
}

function getTaskDetail(taskId: string) {
  if (!taskId) throw new Error('id required');

  const task = db.prepare(`
    SELECT id, group_folder, prompt, schedule_type, schedule_value, next_run, last_run, last_result, status, created_at, context_mode, COALESCE(progress, 0) as progress, thread_id
    FROM scheduled_tasks WHERE id = ?
  `).get(taskId) as {
    id: string; group_folder: string; prompt: string; schedule_type: string;
    schedule_value: string; next_run: string | null; last_run: string | null;
    last_result: string | null; status: string; created_at: string; context_mode: string; progress: number;
    thread_id: string | null;
  } | undefined;

  if (!task) throw new Error('Task not found');

  // All run history (timeline events)
  const runs = db.prepare(`
    SELECT id, run_at, duration_ms, status, result, error,
           COALESCE(cost_usd, 0) as cost_usd,
           COALESCE(input_tokens, 0) as input_tokens,
           COALESCE(output_tokens, 0) as output_tokens
    FROM task_run_logs WHERE task_id = ?
    ORDER BY run_at DESC LIMIT 50
  `).all(taskId) as Array<{
    id: number; run_at: string; duration_ms: number; status: string;
    result: string | null; error: string | null; cost_usd: number;
    input_tokens: number; output_tokens: number;
  }>;

  // Comments
  const comments = db.prepare(
    `SELECT id, sender, message, severity, read, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at ASC`,
  ).all(taskId) as Array<{ id: number; sender: string; message: string; severity: string; read: number; created_at: string }>;

  // Aggregate stats
  const stats = db.prepare(`
    SELECT COUNT(*) as total_runs,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
           SUM(COALESCE(cost_usd, 0)) as total_cost,
           SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
           SUM(COALESCE(output_tokens, 0)) as total_output_tokens,
           AVG(duration_ms) as avg_duration
    FROM task_run_logs WHERE task_id = ?
  `).get(taskId) as {
    total_runs: number; successes: number; errors: number;
    total_cost: number; total_input_tokens: number; total_output_tokens: number; avg_duration: number;
  };

  // Project association
  let project: string | null = null;
  try {
    const projFiles = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
    for (const f of projFiles) {
      const content = readFileSafe(path.join(PROJECTS_DIR, f));
      const { frontmatter } = parseFrontmatter(content);
      if ((frontmatter.tasks || []).includes(taskId)) {
        project = f.replace('.md', '').replace(/-/g, ' ');
        break;
      }
    }
  } catch {}

  // Build unified timeline: runs + comments + creation event
  const timeline: Array<{ type: string; time: string; data: Record<string, unknown> }> = [];

  timeline.push({ type: 'created', time: task.created_at, data: { schedule_type: task.schedule_type, schedule_value: task.schedule_value } });

  for (const r of runs) {
    timeline.push({
      type: 'run', time: r.run_at,
      data: { status: r.status, duration_ms: r.duration_ms, cost_usd: r.cost_usd, input_tokens: r.input_tokens, output_tokens: r.output_tokens, result: r.result?.substring(0, 300) || null, error: r.error?.substring(0, 300) || null },
    });
  }

  // Comments are shown in the Discussion section, not the activity timeline
  timeline.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // Determine stage
  const containers = getContainers();
  const isRunning = containers.some(c => c.group === task.group_folder);
  let stage: string;
  if (task.status === 'completed') stage = 'done';
  else if (task.status === 'paused') stage = 'paused';
  else if (isRunning) stage = 'running';
  else if (comments.some(c => c.severity === 'blocker' && !c.read)) stage = 'blocked';
  else if (comments.some(c => c.severity === 'question' && !c.read)) stage = 'review';
  else if (task.last_run) stage = 'ran';
  else stage = 'queued';

  // Cross-object associations
  const rawAssocs = getAssociations('task', taskId);
  const associations = rawAssocs.map(a => ({
    ...a,
    display: resolveAssociationDisplay(a.type, a.objectId),
  }));

  const hasUnreadQuestion = comments.some(c => c.severity === 'question' && !c.read);
  const progress = deriveProgress({ ...task, isRunning }, hasUnreadQuestion);

  return {
    ...task,
    stage,
    project,
    progress,
    stats,
    timeline,
    comments,
    associations,
    runs: runs.map(r => ({ ...r, result: r.result?.substring(0, 2000) || null, error: r.error?.substring(0, 1000) || null })),
  };
}

function getLogs(lines: number, filter?: string) {
  let cmd = `tail -n ${Math.min(lines, 500)} "${LOG_PATH}" 2>/dev/null`;
  if (filter) {
    const safe = filter.replace(/[^a-zA-Z0-9_. -]/g, '');
    cmd += ` | grep -i "${safe}"`;
  }
  const raw = exec(cmd);
  return { lines: raw ? raw.split('\n').map(stripAnsi) : [] };
}

function getSessions() {
  const rows = db.prepare('SELECT group_folder, session_id FROM sessions').all() as Array<{
    group_folder: string; session_id: string;
  }>;
  return rows.map(r => {
    const jsonlPath = path.join(DATA_DIR, 'sessions', r.group_folder, '.claude', 'projects', '-workspace-group', `${r.session_id}.jsonl`);
    let fileSize = 'N/A'; let lastModified: string | null = null;
    try { const stat = fs.statSync(jsonlPath); fileSize = humanSize(stat.size); lastModified = stat.mtime.toISOString(); } catch {}
    return { group: r.group_folder, sessionId: r.session_id, fileSize, lastModified };
  });
}

function getOverview() {
  const msgCount = (db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number }).c;
  const groupCount = (db.prepare('SELECT COUNT(*) as c FROM registered_groups').get() as { c: number }).c;
  const taskCount = (db.prepare("SELECT COUNT(*) as c FROM scheduled_tasks WHERE status = 'active'").get() as { c: number }).c;
  const containerCount = getContainers().length;
  return { messages: msgCount, groups: groupCount, activeTasks: taskCount, activeContainers: containerCount };
}

function getStatusBoard() {
  const content = readFileSafe(STATUS_BOARD_PATH);
  const digest = readFileSafe(RESEARCH_DIGEST_PATH);
  return { statusBoard: content, researchDigest: digest };
}

interface ServiceStatus {
  name: string;
  category: string;
  status: 'connected' | 'disconnected' | 'error' | 'unconfigured';
  detail?: string;
  lastChecked?: string;
}

// --- Services cache (poll systemd every 60s instead of per-request) ---
let _servicesSystemdCache: ServiceStatus[] = [];
let _servicesLastPoll = 0;
const SERVICES_POLL_INTERVAL = 60_000; // 60 seconds

function relativeTime(timestamp: string): string {
  if (!timestamp) return '';
  const ts = new Date(timestamp).getTime();
  if (isNaN(ts) || ts < 86400_000) return 'Never run';
  const diff = Date.now() - ts;
  if (diff < 0) return 'Scheduled';
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function pollSystemdServices(): ServiceStatus[] {
  const results: ServiceStatus[] = [];
  const now = new Date().toISOString();

  const checkSystemd = (unit: string, label: string) => {
    try {
      const result = execSync(`systemctl is-active ${unit} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      results.push({ name: label, category: 'System', status: result === 'active' ? 'connected' : 'disconnected', detail: result, lastChecked: now });
    } catch {
      results.push({ name: label, category: 'System', status: 'disconnected', detail: 'inactive', lastChecked: now });
    }
  };
  checkSystemd('nanoclaw', 'NanoClaw Core');
  checkSystemd('nanoclaw-dashboard', 'Mission Control');
  checkSystemd('obsidian-sync', 'Obsidian Sync');
  checkSystemd('docker', 'Docker Engine');

  // --- Systemd Timers (background jobs) ---
  const checkTimer = (unit: string, label: string, category: string) => {
    try {
      const active = execSync(`systemctl is-active ${unit}.timer 2>/dev/null`, { encoding: 'utf-8' }).trim();
      let detail = active;
      let status: ServiceStatus['status'] = active === 'active' ? 'connected' : 'disconnected';
      if (active === 'active') {
        try {
          const props = execSync(`systemctl show ${unit}.service --property=ExecMainStartTimestamp,ExecMainStatus --value 2>/dev/null`, { encoding: 'utf-8' }).trim();
          const [timestamp, exitCode] = props.split('\n');
          if (exitCode && exitCode !== '0') status = 'error';
          if (timestamp && timestamp !== '') detail = relativeTime(timestamp);
        } catch {}
      }
      results.push({ name: label, category, status, detail, lastChecked: now });
    } catch {
      results.push({ name: label, category, status: 'disconnected', detail: 'Timer not found', lastChecked: now });
    }
  };
  checkTimer('nanoclaw-db-backup', 'DB Backup (daily 4am)', 'System');
  checkTimer('nanoclaw-heartbeat', 'Heartbeat (nightly 4am)', 'System');
  checkTimer('nanoclaw-security-check', 'Security Check (nightly 3:30am)', 'System');
  checkTimer('nanoclaw-index-obsidian', 'Obsidian Indexer (daily 2am)', 'System');
  checkTimer('nanoclaw-drive-watcher', 'Google Drive Watcher (5min poll)', 'Google');
  checkTimer('nanoclaw-drive-sync', 'Google Drive Sync (daily 4am)', 'Google');
  checkTimer('nanoclaw-github-backup', 'GitHub Off-site Backup (daily 5am)', 'System');
  checkTimer('nanoclaw-sync-contacts', 'Contacts Sync (daily 1am)', 'CRM');
  checkTimer('nanoclaw-nutrition-prices', 'Nutrition Price Scanner (Sun 5am)', 'System');

  // --- Container ---
  try {
    const containers = execSync('docker ps --format "{{.Names}}" 2>/dev/null', { encoding: 'utf-8' }).trim();
    const count = containers ? containers.split('\n').length : 0;
    results.push({ name: 'Docker Containers', category: 'System', status: 'connected', detail: `${count} running`, lastChecked: now });
  } catch {
    results.push({ name: 'Docker Containers', category: 'System', status: 'disconnected', detail: 'Cannot query', lastChecked: now });
  }

  return results;
}

// Poll immediately on startup, then every 60s
_servicesSystemdCache = pollSystemdServices();
_servicesLastPoll = Date.now();
setInterval(() => { _servicesSystemdCache = pollSystemdServices(); _servicesLastPoll = Date.now(); }, SERVICES_POLL_INTERVAL);

function getServices(): ServiceStatus[] {
  const services: ServiceStatus[] = [..._servicesSystemdCache];
  const now = new Date().toISOString();

  // --- Channels (DB queries, fast) ---
  // Discord
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken) {
    const discordGroups = db.prepare("SELECT COUNT(*) as c FROM registered_groups WHERE jid LIKE 'dc:%'").get() as { c: number };
    services.push({ name: 'Discord Bot', category: 'Channels', status: discordGroups.c > 0 ? 'connected' : 'disconnected', detail: `${discordGroups.c} groups registered`, lastChecked: now });
  } else {
    services.push({ name: 'Discord Bot', category: 'Channels', status: 'unconfigured', lastChecked: now });
  }

  // WhatsApp
  const waGroups = (db.prepare("SELECT COUNT(*) as c FROM registered_groups WHERE jid LIKE '%@g.us' OR jid LIKE '%@s.whatsapp.net'").get() as { c: number }).c;
  services.push({ name: 'WhatsApp', category: 'Channels', status: waGroups > 0 ? 'connected' : 'unconfigured', detail: waGroups > 0 ? `${waGroups} groups` : undefined, lastChecked: now });

  // Telegram
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (tgToken) {
    const tgGroups = (db.prepare("SELECT COUNT(*) as c FROM registered_groups WHERE jid LIKE 'tg:%'").get() as { c: number }).c;
    services.push({ name: 'Telegram', category: 'Channels', status: tgGroups > 0 ? 'connected' : 'disconnected', detail: `${tgGroups} groups`, lastChecked: now });
  } else {
    services.push({ name: 'Telegram', category: 'Channels', status: 'unconfigured', lastChecked: now });
  }

  // --- AI & API Services ---
  const anthropicKey = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  services.push({ name: 'Anthropic API', category: 'AI', status: anthropicKey ? 'connected' : 'unconfigured', detail: anthropicKey ? 'Token configured' : undefined, lastChecked: now });

  const orKey = process.env.OPENROUTER_API_KEY;
  const orFlagPath = path.join(GROUPS_DIR, 'main', '.openrouter_mode');
  let orDetail = orKey ? 'API key set' : undefined;
  let orStatus: ServiceStatus['status'] = orKey ? 'connected' : 'unconfigured';
  if (orKey && fs.existsSync(orFlagPath)) {
    try {
      const flag = JSON.parse(fs.readFileSync(orFlagPath, 'utf-8'));
      orStatus = 'connected';
      orDetail = `Fallback active since ${flag.since || 'unknown'}`;
    } catch {}
  }
  services.push({ name: 'OpenRouter', category: 'AI', status: orStatus, detail: orDetail, lastChecked: now });

  // --- Google Services ---
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  services.push({ name: 'Google OAuth', category: 'Google', status: (googleClientId && googleRefreshToken) ? 'connected' : 'unconfigured', detail: googleClientId ? 'Client configured' : undefined, lastChecked: now });

  const sheetsId = process.env.GOOGLE_CONTACTS_SHEET_ID;
  services.push({ name: 'Google Sheets (Contacts)', category: 'Google', status: sheetsId ? 'connected' : 'unconfigured', detail: sheetsId ? `Sheet: ${sheetsId.substring(0, 12)}...` : undefined, lastChecked: now });

  // --- Security & Credentials ---
  try {
    const secretsCount = (db.prepare("SELECT COUNT(*) as c FROM secrets").get() as { c: number }).c;
    services.push({ name: 'Encrypted Secrets', category: 'Security', status: 'connected', detail: `${secretsCount} secrets stored`, lastChecked: now });
  } catch {
    services.push({ name: 'Encrypted Secrets', category: 'Security', status: 'unconfigured', detail: 'Table not found', lastChecked: now });
  }

  // --- Trading ---
  try {
    const kalshiKey = db.prepare("SELECT COUNT(*) as c FROM secrets WHERE name LIKE '%kalshi%'").get() as { c: number };
    services.push({ name: 'Kalshi API', category: 'Trading', status: kalshiKey.c > 0 ? 'connected' : 'unconfigured', detail: kalshiKey.c > 0 ? `${kalshiKey.c} credential(s)` : undefined, lastChecked: now });
  } catch {
    services.push({ name: 'Kalshi API', category: 'Trading', status: 'unconfigured', lastChecked: now });
  }

  try {
    const oaKey = db.prepare("SELECT COUNT(*) as c FROM secrets WHERE name LIKE '%optionalpha%' OR name LIKE '%option_alpha%'").get() as { c: number };
    services.push({ name: 'OptionAlpha', category: 'Trading', status: oaKey.c > 0 ? 'connected' : 'unconfigured', detail: oaKey.c > 0 ? `${oaKey.c} credential(s)` : undefined, lastChecked: now });
  } catch {
    services.push({ name: 'OptionAlpha', category: 'Trading', status: 'unconfigured', lastChecked: now });
  }

  // --- IBKR ---
  try {
    const ibkrCreds = db.prepare("SELECT COUNT(*) as c FROM secrets WHERE name LIKE '%IBKR%'").get() as { c: number };
    // Check if IBeam container is running by checking port 5000
    let ibkrStatus = 'unconfigured';
    let ibkrDetail: string | undefined;
    if (ibkrCreds.c > 0) {
      // Check if IBeam container has recent data (account-summary.json timestamp)
      try {
        const acctFile = path.join(GROUPS_DIR, 'trading', 'trading-bot', 'data', 'account-summary.json');
        const raw = readFileSafe(acctFile);
        if (raw) {
          const acct = JSON.parse(raw);
          if (acct.status === 'connected' && acct.netLiquidation > 0) {
            ibkrStatus = 'connected';
            ibkrDetail = `Paper: $${Math.round(acct.netLiquidation).toLocaleString()} NLV (IBeam Docker)`;
          } else {
            ibkrStatus = 'disconnected';
            ibkrDetail = 'Gateway not authenticated';
          }
        }
      } catch {
        ibkrStatus = 'disconnected';
        ibkrDetail = 'Credentials stored but no data';
      }
    }
    services.push({ name: 'IBKR Paper Trading', category: 'Trading', status: ibkrStatus, detail: ibkrDetail, lastChecked: now });
  } catch {
    services.push({ name: 'IBKR Paper Trading', category: 'Trading', status: 'unconfigured', lastChecked: now });
  }

  // --- GSA API ---
  const gsaKey = process.env.GSA_API_KEY;
  services.push({ name: 'GSA Auctions API', category: 'Trading', status: gsaKey && gsaKey !== 'DEMO_KEY' ? 'connected' : gsaKey === 'DEMO_KEY' ? 'disconnected' : 'unconfigured', detail: gsaKey && gsaKey !== 'DEMO_KEY' ? 'Hourly scan' : gsaKey === 'DEMO_KEY' ? 'Using DEMO_KEY (rate limited)' : undefined, lastChecked: now });

  // --- External APIs (no shell, fast checks) ---
  // GitHub
  const githubToken = process.env.GITHUB_TOKEN;
  services.push({ name: 'GitHub', category: 'System', status: githubToken ? 'connected' : 'unconfigured', detail: githubToken ? 'Token configured' : undefined, lastChecked: now });

  // Google Maps
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  services.push({ name: 'Google Maps', category: 'Google', status: mapsKey ? 'connected' : 'unconfigured', detail: mapsKey ? 'API key set' : undefined, lastChecked: now });

  // DeBounce (email validation)
  try {
    const debounceKey = db.prepare("SELECT COUNT(*) as c FROM secrets WHERE name LIKE '%debounce%'").get() as { c: number };
    services.push({ name: 'DeBounce (Email Validation)', category: 'CRM', status: debounceKey.c > 0 ? 'connected' : 'unconfigured', detail: debounceKey.c > 0 ? `${debounceKey.c} key(s) stored` : undefined, lastChecked: now });
  } catch {
    services.push({ name: 'DeBounce (Email Validation)', category: 'CRM', status: 'unconfigured', lastChecked: now });
  }

  // --- LinkedIn ---
  // Check last enrichment run
  try {
    const lastRun = db.prepare("SELECT last_run, last_result, status FROM scheduled_tasks WHERE id = 'contacts-linkedin-scan-daily'").get() as { last_run: string; last_result: string; status: string } | undefined;
    if (lastRun) {
      services.push({ name: 'LinkedIn Enrichment', category: 'CRM', status: lastRun.status === 'active' ? 'connected' : 'disconnected', detail: lastRun.last_run ? `Last run: ${lastRun.last_run.substring(0, 10)}` : 'Never run', lastChecked: now });
    } else {
      services.push({ name: 'LinkedIn Enrichment', category: 'CRM', status: 'unconfigured', lastChecked: now });
    }
  } catch {
    services.push({ name: 'LinkedIn Enrichment', category: 'CRM', status: 'unconfigured', lastChecked: now });
  }

  // Contacts sync
  const contactNotes = fs.existsSync(path.join(OBSIDIAN_VAULT, 'Contacts', 'Network'))
    ? fs.readdirSync(path.join(OBSIDIAN_VAULT, 'Contacts', 'Network')).filter(f => f.endsWith('.md')).length
    : 0;
  services.push({ name: 'Contacts Sync', category: 'CRM', status: contactNotes > 0 ? 'connected' : 'unconfigured', detail: `${contactNotes.toLocaleString()} contacts`, lastChecked: now });

  return services;
}

function getReviews() {
  return loadReviews();
}

// --- Calendar ---

function describeCron(expr: string): string {
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, mon, dow] = parts;
  const dayNames: Record<string, string> = { '0':'Sun','1':'Mon','2':'Tue','3':'Wed','4':'Thu','5':'Fri','6':'Sat' };

  // Format time
  const hourNum = hour === '*' ? -1 : parseInt(hour);
  let time = '';
  if (hourNum >= 0) {
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const h12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
    const m = min === '*' || min === '0' ? '' : `:${min.padStart(2, '0')}`;
    time = `${h12}${m} ${ampm} ET`;
  }

  // Every N minutes
  if (min.startsWith('*/')) return `Every ${min.slice(2)} min`;

  // Day of month patterns
  if (dom !== '*' && mon === '*') {
    const ordinal = dom === '1' ? '1st' : dom === '2' ? '2nd' : dom === '3' ? '3rd' : `${dom}th`;
    return `${ordinal} of month ${time}`.trim();
  }

  // Day of week patterns
  if (dow === '*' && dom === '*') return `Daily ${time}`.trim();
  if (dow === '1-5') return `Weekdays ${time}`.trim();

  // Comma-separated days: "1,3,5" → "Mon/Wed/Fri"
  if (dow.includes(',')) {
    const days = dow.split(',').map(d => dayNames[d.trim()] || d.trim()).join('/');
    return `${days} ${time}`.trim();
  }

  // Single day
  if (dayNames[dow]) return `${dayNames[dow]} ${time}`.trim();

  return `${expr} (${time})`.trim();
}

function getNextOccurrences(cronExpr: string, count: number): string[] {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: TZ });
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      results.push(interval.next().toISOString());
    }
    return results;
  } catch {
    return [];
  }
}

function getCalendar() {
  // 1. SQLite scheduled tasks
  const tasks = db.prepare(`
    SELECT id, group_folder, prompt, schedule_type, schedule_value, next_run, last_run, status, created_at
    FROM scheduled_tasks ORDER BY next_run ASC
  `).all() as Array<{
    id: string; group_folder: string; prompt: string; schedule_type: string;
    schedule_value: string; next_run: string | null; last_run: string | null;
    status: string; created_at: string;
  }>;

  const calendarTasks = tasks.map(t => {
    const nextOccurrences = t.schedule_type === 'cron' ? getNextOccurrences(t.schedule_value, 14) : [];
    return {
      id: t.id,
      source: 'nanoclaw' as const,
      group: t.group_folder,
      label: t.prompt.substring(0, 120).split('\n')[0],
      type: t.schedule_type,
      schedule: t.schedule_value,
      scheduleHuman: t.schedule_type === 'cron' ? describeCron(t.schedule_value) : 'One-time',
      nextRun: t.next_run,
      lastRun: t.last_run,
      status: t.status,
      nextOccurrences,
    };
  });

  // 2. Systemd timers (nanoclaw-related only)
  const timerRaw = exec("systemctl list-timers --all --no-pager 2>/dev/null | grep nanoclaw");
  const systemdTimers = timerRaw.split('\n').filter(Boolean).map(line => {
    const parts = line.trim().split(/\s{2,}/);
    // Format: NEXT LEFT LAST PASSED UNIT ACTIVATES
    const next = parts[0] || '';
    // Extract timer name reliably via regex (column positions vary)
    const timerMatch = line.match(/(nanoclaw[^\s]*?)\.timer/);
    const name = timerMatch ? timerMatch[1] : (parts[4] || parts[3] || '').replace('.timer', '');
    return {
      id: `systemd:${name}`,
      source: 'systemd' as const,
      group: 'system',
      label: name,
      type: 'timer',
      schedule: '',
      scheduleHuman: 'systemd timer',
      nextRun: next ? tryParseDate(next) : null,
      lastRun: null as string | null,
      status: 'active',
      nextOccurrences: [] as string[],
    };
  });

  return [...calendarTasks, ...systemdTimers];
}

function tryParseDate(s: string): string | null {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

// --- Projects ---

interface ProjectFrontmatter {
  tags?: string[];
  created?: string;
  status?: string;
  priority?: string;
  agent?: string;
  progress?: number;
  tasks?: string[];
  docs?: string[];
}

function parseFrontmatter(content: string): { frontmatter: ProjectFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  try {
    return { frontmatter: YAML.parse(match[1]) || {}, body: match[2] };
  } catch { return { frontmatter: {}, body: content }; }
}

function getProjects() {
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    return files.map(f => {
      const content = readFileSafe(path.join(PROJECTS_DIR, f));
      const { frontmatter, body } = parseFrontmatter(content);
      const taskCount = (body.match(/^- \[[ x]\]/gm) || []).length;
      const doneCount = (body.match(/^- \[x\]/gm) || []).length;
      // Extract linked docs from body (wikilinks)
      const linkedDocs = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
      const projUnread = (db.prepare(
        'SELECT COUNT(*) as cnt FROM task_comments WHERE task_id = ? AND read = 0',
      ).get(`proj:${f}`) as { cnt: number }).cnt;
      return {
        file: f,
        name: f.replace('.md', '').replace(/-/g, ' '),
        status: frontmatter.status || 'unknown',
        completed_reason: (frontmatter as Record<string, unknown>).completed_reason || '',
        priority: frontmatter.priority || 'normal',
        agent: frontmatter.agent || 'unassigned',
        progress: frontmatter.progress ?? (taskCount > 0 ? Math.round(doneCount / taskCount * 100) : 0),
        tags: frontmatter.tags || [],
        created: frontmatter.created || null,
        linkedTasks: frontmatter.tasks || [],
        linkedDocs: [...(frontmatter.docs || []), ...linkedDocs],
        taskCount, doneCount,
        unread: projUnread,
        body: body.substring(0, 800),
      };
    });
  } catch { return []; }
}

function getProjectDetail(file: string) {
  const safeName = file.replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(PROJECTS_DIR, safeName);
  const content = readFileSafe(filePath);
  if (!content) return null;
  const { frontmatter, body } = parseFrontmatter(content);
  const projKey = `proj:${safeName}`;
  const comments = getTaskComments(projKey);
  const unreadComments = comments.filter(c => c.read === 0).length;
  // Mark as read on view
  if (unreadComments > 0) markCommentsRead(projKey);
  // Cross-object associations
  const rawAssocs = getAssociations('project', safeName);
  const associations = rawAssocs.map(a => ({
    ...a,
    display: resolveAssociationDisplay(a.type, a.objectId),
  }));
  const threadId = getProjectThreadId(safeName);
  return { file: safeName, frontmatter, body, comments, unreadComments, associations, threadId };
}

async function postChatSend(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { group, message } = body as { group: string; message: string };
  if (!group || !message?.trim()) throw new Error('group and message required');

  // Look up the group JID and trigger config
  const grp = db.prepare('SELECT jid, trigger_pattern, requires_trigger, is_main FROM registered_groups WHERE folder = ?').get(group) as { jid: string; trigger_pattern: string; requires_trigger: number | null; is_main: number | null } | undefined;
  if (!grp) throw new Error('Group not found: ' + group);

  // Insert message as if it came from the user (dashboard)
  const msgId = `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  // Auto-prepend trigger for non-main groups that require it so the message loop picks it up
  let content = message.trim();
  const needsTrigger = grp.is_main !== 1 && grp.requires_trigger !== 0;
  if (needsTrigger && !content.includes(grp.trigger_pattern)) {
    content = `${grp.trigger_pattern} ${content}`;
  }

  dbWrite.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(msgId, grp.jid, 'dashboard', 'Jonathan (Dashboard)', content, timestamp, 0, 0);

  // Update chat last_message_time so NanoClaw picks it up
  dbWrite.prepare(
    `INSERT INTO chats (jid, last_message_time) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET last_message_time = ?`
  ).run(grp.jid, timestamp, timestamp);

  return { ok: true, id: msgId };
}

async function postProjectUpdate(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { file, field, value } = body as { file: string; field: string; value: unknown };
  const safeName = file.replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(PROJECTS_DIR, safeName);
  const content = readFileSafe(filePath);
  if (!content) throw new Error('Project not found');

  const { frontmatter, body: mdBody } = parseFrontmatter(content);
  (frontmatter as Record<string, unknown>)[field] = value;

  const newContent = `---\n${YAML.stringify(frontmatter).trim()}\n---\n${mdBody}`;
  fs.writeFileSync(filePath, newContent);
  return { ok: true };
}

// --- Ventures ---

const VENTURE_EDITABLE_FIELDS = new Set([
  'stage', 'status', 'risk_level', 'opportunity_score', 'estimated_upside',
  'investment_needed', 'next_action', 'agent', 'tags', 'linked_project',
  'linked_tasks', 'linked_docs',
]);

function getVentures() {
  try {
    if (!fs.existsSync(VENTURES_DIR)) return [];
    const files = fs.readdirSync(VENTURES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    const unreadStmt = db.prepare('SELECT COUNT(*) as cnt FROM task_comments WHERE task_id = ? AND read = 0');
    // Task health per venture (batch query)
    const ventureTaskHealth = db.prepare(
      `SELECT venture_file,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
         SUM(CASE WHEN status = 'disabled' OR consecutive_failures >= max_failures THEN 1 ELSE 0 END) as failing,
         SUM(CASE WHEN status IN ('paused', 'disabled') THEN 1 ELSE 0 END) as stopped,
         COUNT(*) as total
       FROM scheduled_tasks WHERE venture_file IS NOT NULL GROUP BY venture_file`,
    ).all() as Array<{ venture_file: string; active: number; failing: number; stopped: number; total: number }>;
    const healthByVenture: Record<string, { active: number; failing: number; stopped: number; total: number }> = {};
    for (const h of ventureTaskHealth) healthByVenture[h.venture_file] = h;

    return files.map(f => {
      const content = readFileSafe(path.join(VENTURES_DIR, f));
      const { frontmatter, body } = parseFrontmatter(content);
      const fm = frontmatter as Record<string, unknown>;
      const taskCount = (body.match(/^- \[[ x]\]/gm) || []).length;
      const doneCount = (body.match(/^- \[x\]/gm) || []).length;
      const bodyDocs = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
      const fmDocs = (fm.linked_docs as string[]) || [];
      const allDocs = [...new Set([...fmDocs, ...bodyDocs])];
      const unread = (unreadStmt.get(`venture:${f}`) as { cnt: number }).cnt;
      return {
        file: f,
        name: f.replace('.md', '').replace(/-/g, ' '),
        stage: (fm.stage as string) || 'idea',
        opportunity_score: (fm.opportunity_score as number) ?? null,
        estimated_upside: (fm.estimated_upside as string) || '',
        investment_needed: (fm.investment_needed as string) || '',
        risk_level: (fm.risk_level as string) || 'medium',
        next_action: (fm.next_action as string) || '',
        status: (fm.status as string) || 'active',
        agent: (fm.agent as string) || 'unassigned',
        tags: (fm.tags as string[]) || [],
        linked_project: (fm.linked_project as string) || '',
        linked_tasks: (fm.linked_tasks as string[]) || [],
        created: (fm.created as string) || null,
        linkedDocs: allDocs,
        taskCount, doneCount,
        unread,
        body: body.substring(0, 800),
        taskHealth: healthByVenture[f] || null,
      };
    });
  } catch (err) {
    console.error('[ventures] failed to load ventures:', err);
    return [];
  }
}

function getVentureDetail(file: string) {
  const safeName = file.replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(VENTURES_DIR, safeName);
  const content = readFileSafe(filePath);
  if (!content) return null;
  const { frontmatter, body } = parseFrontmatter(content);
  const ventureKey = `venture:${safeName}`;
  const comments = getTaskComments(ventureKey);
  const unreadComments = comments.filter(c => c.read === 0).length;
  const rawAssocs = getAssociations('venture', safeName);
  const associations = rawAssocs.map(a => ({
    ...a,
    display: resolveAssociationDisplay(a.type, a.objectId),
  }));
  const fm = frontmatter as Record<string, unknown>;
  const taskStmt = db.prepare('SELECT id, prompt, group_folder, status FROM scheduled_tasks WHERE id = ?');
  const linkedTasks = ((fm.linked_tasks as string[]) || []).map(taskId => {
    const task = taskStmt.get(taskId) as { id: string; prompt: string; group_folder: string; status: string } | undefined;
    return task ? { id: task.id, prompt: task.prompt.substring(0, 80), group: task.group_folder, status: task.status } : { id: taskId, prompt: taskId, group: '', status: 'unknown' };
  });
  // Mark as read after collecting data so caller sees the unread count
  if (unreadComments > 0) markCommentsRead(ventureKey);
  return { file: safeName, frontmatter: fm, body, comments, unreadComments, associations, linkedTasks };
}

async function postVentureUpdate(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { file, field, value } = body as { file: string; field: string; value: unknown };
  if (!VENTURE_EDITABLE_FIELDS.has(field)) throw new Error('Field not editable: ' + field);
  const safeName = file.replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(VENTURES_DIR, safeName);
  const content = readFileSafe(filePath);
  if (!content) throw new Error('Venture not found');

  const { frontmatter, body: mdBody } = parseFrontmatter(content);
  (frontmatter as Record<string, unknown>)[field] = value;

  const newContent = `---\n${YAML.stringify(frontmatter).trim()}\n---\n${mdBody}`;
  fs.writeFileSync(filePath, newContent);
  return { ok: true };
}

function getVentureKalshi() {
  try {
    const dataDir = path.join(GROUPS_DIR, 'trading', 'kalshi-weather-bot', 'data');
    if (!fs.existsSync(dataDir)) return { error: 'No Kalshi data directory' };

    const tradesRaw = readFileSafe(path.join(dataDir, 'paper-trades.json'));
    const trades = tradesRaw ? JSON.parse(tradesRaw) : { trades: [], summary: {} };

    const backtestSummaryRaw = readFileSafe(path.join(dataDir, 'backtest-1yr-summary.json'));
    const backtestSummary = backtestSummaryRaw ? JSON.parse(backtestSummaryRaw) : null;

    // Find most recent scan file
    const scanFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('scan-') && f.endsWith('.json')).sort().reverse();
    let todayScan: unknown[] = [];
    let scanOrders: unknown[] = [];
    let scanDate = '';
    if (scanFiles.length > 0) {
      const raw = readFileSafe(path.join(dataDir, scanFiles[0]));
      const parsed = raw ? JSON.parse(raw) : {};
      // Scan files can be {date, signals, orders} or a flat array
      if (Array.isArray(parsed)) {
        todayScan = parsed;
      } else {
        todayScan = parsed.signals || [];
        scanOrders = parsed.orders || [];
      }
      scanDate = scanFiles[0].replace('scan-', '').replace('.json', '');
    }

    const arbRaw = readFileSafe(path.join(dataDir, 'arb-scan.json'));
    const arbScan = arbRaw ? JSON.parse(arbRaw) : null;

    // Build combined performance tracking (backtest + paper trading)
    const backtestResults = (() => {
      try {
        const raw = readFileSafe(path.join(dataDir, 'backtest-1yr-results.json'));
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    })();

    // Weekly performance rollup from paper trades
    const paperTrades = trades.trades || [];
    const settledPaper = paperTrades.filter((t: Record<string, unknown>) => t.status === 'settled');
    const weeklyPerf: Record<string, { trades: number; wins: number; pnl: number; cost: number }> = {};
    for (const t of settledPaper) {
      const tr = t as Record<string, unknown>;
      const d = String(tr.date || '').slice(0, 10);
      // Group by week (Monday start)
      const dt = new Date(d + 'T12:00:00');
      const day = dt.getDay();
      const monday = new Date(dt);
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weeklyPerf[weekKey]) weeklyPerf[weekKey] = { trades: 0, wins: 0, pnl: 0, cost: 0 };
      weeklyPerf[weekKey].trades++;
      if (tr.won === true) weeklyPerf[weekKey].wins++;
      weeklyPerf[weekKey].pnl += Number(tr.pnl || 0);
      weeklyPerf[weekKey].cost += Number(tr.cost || 0);
    }

    // Daily P&L for trend chart
    const dailyPnl: Record<string, { trades: number; wins: number; pnl: number }> = {};
    for (const t of settledPaper) {
      const tr = t as Record<string, unknown>;
      const d = String(tr.date || '').slice(0, 10);
      if (!dailyPnl[d]) dailyPnl[d] = { trades: 0, wins: 0, pnl: 0 };
      dailyPnl[d].trades++;
      if (tr.won === true) dailyPnl[d].wins++;
      dailyPnl[d].pnl += Number(tr.pnl || 0);
    }

    // Compute trade analysis
    const allTrades = trades.trades || [];
    const settledTrades = allTrades.filter((t: Record<string, unknown>) => t.status === 'settled');
    const analysis: Record<string, unknown> = {};

    if (settledTrades.length > 0) {
      const byCity: Record<string, { w: number; l: number; pnl: number }> = {};
      const bySide: Record<string, { w: number; l: number; pnl: number }> = {};
      const byModelBucket: Record<string, { w: number; l: number; pnl: number }> = {};
      const byEdgeBucket: Record<string, { w: number; l: number; pnl: number }> = {};
      const byConsensus: Record<string, { w: number; l: number; pnl: number }> = {};

      const inc = (map: Record<string, { w: number; l: number; pnl: number }>, key: string, won: boolean, pnl: number) => {
        if (!map[key]) map[key] = { w: 0, l: 0, pnl: 0 };
        if (won) map[key].w++; else map[key].l++;
        map[key].pnl += pnl;
      };

      for (const t of settledTrades) {
        const tr = t as Record<string, unknown>;
        const won = tr.won === true;
        const pnl = Number(tr.pnl || 0);
        const model = Number(tr.modelProb || 0);
        const edge = Number(tr.edge || 0);
        const members = String(tr.members || '0/0').split('/');
        const consensus = members.length === 2 && Number(members[1]) > 0
          ? Math.round(Number(members[0]) / Number(members[1]) * 100) : 0;

        inc(byCity, String(tr.city || '?'), won, pnl);
        inc(bySide, String(tr.side || '?'), won, pnl);
        inc(byModelBucket, model >= 90 ? '90-100%' : model >= 70 ? '70-89%' : model >= 50 ? '50-69%' : '<50%', won, pnl);
        inc(byEdgeBucket, edge >= 30 ? '30%+' : edge >= 20 ? '20-29%' : edge >= 10 ? '10-19%' : '<10%', won, pnl);
        inc(byConsensus, consensus >= 80 ? '80%+' : consensus >= 50 ? '50-79%' : '<50%', won, pnl);
      }

      // Generate insights
      const insights: string[] = [];
      for (const [side, s] of Object.entries(bySide)) {
        const rate = Math.round(s.w / (s.w + s.l) * 100);
        if (rate < 30 && (s.w + s.l) >= 3) insights.push(`Avoid "${side}" side trades (${rate}% win rate, $${s.pnl.toFixed(2)} P&L)`);
        if (rate > 75 && (s.w + s.l) >= 5) insights.push(`"${side}" side trades are strong (${rate}% win rate, $${s.pnl.toFixed(2)} P&L)`);
      }
      for (const [city, c] of Object.entries(byCity)) {
        const rate = Math.round(c.w / (c.w + c.l) * 100);
        if (rate < 50 && (c.w + c.l) >= 3) insights.push(`${city} underperforms (${rate}% win, $${c.pnl.toFixed(2)} P&L) — reduce position size or skip`);
        if (rate > 75 && (c.w + c.l) >= 5) insights.push(`${city} is reliable (${rate}% win, $${c.pnl.toFixed(2)} P&L)`);
      }
      for (const [bucket, b] of Object.entries(byModelBucket)) {
        const rate = Math.round(b.w / (b.w + b.l) * 100);
        if (rate === 0 && (b.w + b.l) >= 3) insights.push(`Never trade at ${bucket} model confidence (0% win rate, $${b.pnl.toFixed(2)} lost)`);
      }
      for (const [bucket, b] of Object.entries(byConsensus)) {
        const rate = Math.round(b.w / (b.w + b.l) * 100);
        if (rate === 0 && (b.w + b.l) >= 3) insights.push(`Never trade at ${bucket} consensus (0% win rate)`);
      }

      analysis.byCity = byCity;
      analysis.bySide = bySide;
      analysis.byModelBucket = byModelBucket;
      analysis.byEdgeBucket = byEdgeBucket;
      analysis.byConsensus = byConsensus;
      analysis.insights = insights;

      // Per-trade analysis: why each trade won or lost
      const tradeReasons = settledTrades.map((t: Record<string, unknown>) => {
        const tr = t as Record<string, unknown>;
        const won = tr.won === true;
        const model = Number(tr.modelProb || 0);
        const edge = Number(tr.edge || 0);
        const members = String(tr.members || '0/0').split('/');
        const consensus = members.length === 2 && Number(members[1]) > 0
          ? Math.round(Number(members[0]) / Number(members[1]) * 100) : 0;
        const reasons: string[] = [];

        if (won) {
          if (model >= 90) reasons.push('High model confidence');
          if (edge >= 30) reasons.push('Large edge');
          if (consensus >= 80) reasons.push('Strong consensus');
          if (tr.side === 'no') reasons.push('"No" side (historically strong)');
          if (!reasons.length) reasons.push('Favorable outcome');
        } else {
          if (model < 50) reasons.push('Low model confidence (<50%)');
          if (consensus < 50) reasons.push('Weak consensus (<50%)');
          if (tr.side === 'yes') reasons.push('"Yes" side (historically weak)');
          if (String(tr.city) === 'CHI') reasons.push('Chicago market (volatile)');
          if (edge < 10) reasons.push('Thin edge (<10%)');
          if (!reasons.length) reasons.push('Unfavorable weather outcome');
        }

        return { date: tr.date, city: tr.city, side: tr.side, won, pnl: Number(tr.pnl || 0), reasons };
      });
      analysis.tradeReasons = tradeReasons;
    }

    return { trades: allTrades, summary: trades.summary || {}, backtestSummary, todayScan, scanOrders, scanDate, arbScan, analysis, weeklyPerf, dailyPnl };
  } catch (err) {
    console.error('[venture-kalshi]', err);
    return { trades: [], summary: {}, backtestSummary: null, todayScan: [], scanDate: '', arbScan: null };
  }
}

function getVentureIbkr() {
  try {
    const dataDir = path.join(GROUPS_DIR, 'trading', 'trading-bot', 'data');
    if (!fs.existsSync(dataDir)) return { error: 'No IBKR data directory' };

    const readJson = (file: string) => {
      const raw = readFileSafe(path.join(dataDir, file));
      return raw ? JSON.parse(raw) : null;
    };

    const account = readJson('account-summary.json') || {};
    const positionsData = readJson('positions.json') || { positions: [] };
    const tradesData = readJson('trades.json') || { trades: [], summary: {} };
    const greeks = readJson('greeks-exposure.json') || { portfolio: {}, byExpiry: {}, byStrategy: {} };
    const risk = readJson('risk-dashboard.json') || {};
    const snapshots = readJson('daily-snapshots.json') || { snapshots: [] };

    // Find most recent scan file
    const scanFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('scan-') && f.endsWith('.json')).sort().reverse();
    const todayScan = scanFiles.length > 0 ? readJson(scanFiles[0]) : null;

    // Build strategy performance from closed trades
    const closedTrades = (tradesData.trades || []).filter((t: { status: string }) => t.status === 'closed');
    const strategyPerf: Record<string, { trades: number; wins: number; pnl: number; totalHoldDays: number; avgHold: number; winRate: number }> = {};
    for (const t of closedTrades) {
      const s = (t as { strategy: string; pnl?: number; holdDays?: number }).strategy;
      if (!strategyPerf[s]) strategyPerf[s] = { trades: 0, wins: 0, pnl: 0, totalHoldDays: 0, avgHold: 0, winRate: 0 };
      strategyPerf[s].trades++;
      if (((t as { pnl?: number }).pnl || 0) > 0) strategyPerf[s].wins++;
      strategyPerf[s].pnl += (t as { pnl?: number }).pnl || 0;
      strategyPerf[s].totalHoldDays += (t as { holdDays?: number }).holdDays || 0;
    }
    for (const s of Object.values(strategyPerf)) {
      s.winRate = s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0;
      s.avgHold = s.trades > 0 ? Math.round(s.totalHoldDays / s.trades) : 0;
    }

    // Daily P&L from snapshots
    const snapshotList = snapshots.snapshots || [];
    const dailyPnl: Record<string, { pnl: number; nlv: number }> = {};
    for (let i = 1; i < snapshotList.length; i++) {
      const prev = snapshotList[i - 1] as { nlv: number; date: string };
      const curr = snapshotList[i] as { nlv: number; date: string };
      dailyPnl[curr.date] = { pnl: Math.round((curr.nlv - prev.nlv) * 100) / 100, nlv: curr.nlv };
    }

    // Seasonal calendar data
    const seasonalCalendar = {
      winter: [
        { symbol: '/ZN', asset: '10-Yr Treasuries', strategy: 'Iron Condors', edge: 'Markets consolidate after Jan rebalancing' },
        { symbol: '/GC', asset: 'Gold', strategy: 'Strangles', edge: 'Post-holiday demand hangover, sideways action' },
        { symbol: '/ZC', asset: 'Corn', strategy: 'Short Puts', edge: 'Dormant Season — crops in storage, stable floors' },
      ],
      spring: [
        { symbol: '/ES', asset: 'S&P 500', strategy: 'Iron Condors', edge: 'Spring Grind — low-vol growth, declining VIX' },
        { symbol: '/NG', asset: 'Natural Gas', strategy: 'Vertical Spreads', edge: 'Shoulder Season — no heating or cooling demand' },
        { symbol: '/SI', asset: 'Silver', strategy: 'Credit Spreads', edge: 'Predictable industrial demand cycles' },
      ],
      summer: [
        { symbol: '/CL', asset: 'Crude Oil', strategy: 'Iron Condors', edge: 'Aug vol crush as driving season winds down' },
        { symbol: '/ZW', asset: 'Wheat', strategy: 'Short Calls', edge: 'Post-harvest supply creates price ceiling' },
        { symbol: '/LE', asset: 'Live Cattle', strategy: 'Neutral Verticals', edge: 'Herd cycles stabilize in high-demand months' },
      ],
      autumn: [
        { symbol: '/ZS', asset: 'Soybeans', strategy: 'Short Puts', edge: 'Harvest Vol Crush — uncertainty exits as crops gathered' },
        { symbol: '/6E', asset: 'Euro FX', strategy: 'Strangles', edge: 'Predictable trade flows, avoids year-end spikes' },
        { symbol: '/GC, /SI', asset: 'Metals', strategy: 'Neutral Spreads', edge: 'Sideways waiting for year-end Fed data' },
      ],
    };

    // Performance metrics (TWR, Sharpe, Sortino, Max DD, CVaR, monthly returns)
    const perfRaw = readJson('performance-metrics.json') || {};

    return {
      account,
      positions: positionsData.positions || [],
      trades: tradesData.trades || [],
      tradeSummary: tradesData.summary || {},
      greeks,
      risk,
      snapshots: snapshotList,
      todayScan,
      strategyPerf,
      dailyPnl,
      seasonalCalendar,
      performance: perfRaw,
    };
  } catch (err) {
    console.error('[venture-ibkr]', err);
    return { account: {}, positions: [], trades: [], tradeSummary: {}, greeks: {}, risk: {}, snapshots: [], todayScan: null, strategyPerf: {}, dailyPnl: {}, seasonalCalendar: {}, performance: {} };
  }
}

function getVentureGsa() {
  try {
    const scanPath = path.join(GROUPS_DIR, 'business-ideas', 'gsa-monitor', 'latest-scan.json');
    const raw = readFileSafe(scanPath);
    if (!raw) return { error: 'No GSA scan data' };
    const data = JSON.parse(raw);

    // Load shipping analysis data
    let shippingData: Record<string, { shippable: boolean | null; fba_adjusted: number; condition?: string; access_friction?: boolean }> = {};
    try {
      const shipRaw = readFileSafe(path.join(PROJECT_ROOT, 'data', 'gsa-shipping-data.json'));
      if (shipRaw) shippingData = JSON.parse(shipRaw);
    } catch {}

    // Enrich opportunities with links and category detection
    for (const o of (data.opportunities || [])) {
      // GSA auction link — use numeric ID if available, otherwise Google search
      if (o.auctionId) {
        o.gsaUrl = `https://gsaauctions.gov/auctions/preview/${o.auctionId}`;
      } else {
        const gsaSearch = `${o.saleNo || ''} ${(o.itemName || '').substring(0, 25)}`.trim();
        o.gsaUrl = `https://www.google.com/search?q=${encodeURIComponent('gsaauctions.gov ' + gsaSearch)}`;
      }

      // eBay sold search link
      const searchTerms = (o.itemName || '').replace(/[()]/g, '').replace(/\b\d{4}\b/, '').trim();
      o.ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchTerms)}&LH_Sold=1&LH_Complete=1`;
      o.ebayActiveUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchTerms)}`;

      // Amazon search link
      o.amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerms)}`;

      // Detect category, FBA score, and best resale venue
      const name = (o.itemName || '').toUpperCase();
      let fbaScore = 30; // default
      if (/FORD|CHEVY|CHEVROLET|DODGE|RAM|TOYOTA|HONDA|GMC|JEEP|NISSAN|F150|F250|F350|SILVERADO|EXPEDITION|TAHOE|SEDAN|TRUCK|SUV|VAN|BUS|AMBULANCE|HUMVEE/.test(name)) {
        o.category = 'Vehicle'; fbaScore = 5;
        o.bestVenue = 'FB Marketplace'; o.bestVenueUrl = 'https://www.facebook.com/marketplace/category/vehicles';
        o.altVenue = 'CarGurus'; o.altVenueUrl = `https://www.cargurus.com/Cars/l-Used-${searchTerms.replace(/\s+/g, '-')}`;
      } else if (/ENGINE|MOTOR|TURBINE|GENERATOR|COMPRESSOR|FORKLIFT|CRANE|TRACTOR|BACKHOE|T700|BLACKHAWK|AIRCRAFT|HELICOPTER|BOAT|VESSEL/.test(name)) {
        o.category = 'Heavy Equipment'; fbaScore = 5;
        o.bestVenue = 'eBay'; o.bestVenueUrl = o.ebayActiveUrl;
        o.altVenue = 'GovPlanet'; o.altVenueUrl = 'https://www.govplanet.com';
      } else if (/SCRAP|TERM CONTRACT|BULK|DEMOLITION|HAZMAT|WASTE/.test(name)) {
        o.category = 'Scrap/Contract'; fbaScore = 0;
        o.bestVenue = 'N/A'; o.bestVenueUrl = ''; o.altVenue = ''; o.altVenueUrl = '';
      } else if (/LAPTOP|COMPUTER|DELL|HP\s|LENOVO|SERVER|MONITOR|PRINTER|IPAD|TABLET|PHONE|SCANNER|SWITCH|ROUTER|CISCO|CPU|HEWLETT|TOUGHBOOK|SURFACE/.test(name)) {
        o.category = 'IT/Electronics'; fbaScore = 85;
        o.bestVenue = 'Amazon FBA'; o.bestVenueUrl = o.amazonSearchUrl;
        o.altVenue = 'eBay'; o.altVenueUrl = o.ebayActiveUrl;
      } else if (/CAMERA|PROJECTOR|GPS|BINOCULAR|SCOPE|METER|TEST|MULTIMETER|OSCILLOSCOPE|SPECTRUM|ANALYZER|SIGNAL/.test(name)) {
        o.category = 'Test/Scientific'; fbaScore = 70;
        o.bestVenue = 'eBay'; o.bestVenueUrl = o.ebayActiveUrl;
        o.altVenue = 'Amazon'; o.altVenueUrl = o.amazonSearchUrl;
      } else if (/TOOL|DRILL|SAW|WRENCH|SOCKET|DEWALT|MILWAUKEE|MAKITA|BOSCH|IMPACT/.test(name)) {
        o.category = 'Tools'; fbaScore = 75;
        o.bestVenue = 'Amazon FBA'; o.bestVenueUrl = o.amazonSearchUrl;
        o.altVenue = 'eBay'; o.altVenueUrl = o.ebayActiveUrl;
      } else if (/FURNITURE|DESK|CHAIR|TABLE|CABINET|SHELVING|LOCKER|CUBICLE/.test(name)) {
        o.category = 'Furniture'; fbaScore = 10;
        o.bestVenue = 'FB Marketplace'; o.bestVenueUrl = 'https://www.facebook.com/marketplace/category/furniture';
        o.altVenue = 'OfferUp'; o.altVenueUrl = `https://offerup.com/search?q=${encodeURIComponent(searchTerms)}`;
      } else if (/MEDICAL|SURGICAL|DEFIBRILLATOR|VENTILATOR|WHEELCHAIR|HOSPITAL/.test(name)) {
        o.category = 'Medical'; fbaScore = 50;
        o.bestVenue = 'eBay'; o.bestVenueUrl = o.ebayActiveUrl;
        o.altVenue = 'Amazon'; o.altVenueUrl = o.amazonSearchUrl;
      } else if (/CLOTHING|UNIFORM|BOOT|JACKET|PANTS|SHIRT|GLOVE|HELMET|VEST|BODY ARMOR/.test(name)) {
        o.category = 'Clothing/Gear'; fbaScore = 80;
        o.bestVenue = 'Amazon FBA'; o.bestVenueUrl = o.amazonSearchUrl;
        o.altVenue = 'eBay'; o.altVenueUrl = o.ebayActiveUrl;
      } else {
        o.category = 'General'; fbaScore = 30;
        o.bestVenue = 'eBay'; o.bestVenueUrl = o.ebayActiveUrl;
        o.altVenue = 'Amazon'; o.altVenueUrl = o.amazonSearchUrl;
      }
      // Apply shipping + condition analysis if available
      const shipInfo = shippingData[o.auctionId || ''];
      if (shipInfo) {
        o.shippable = shipInfo.shippable;
        o.condition = shipInfo.condition || 'ok';
        o.accessFriction = shipInfo.access_friction || false;
        fbaScore = shipInfo.fba_adjusted;
      } else {
        o.shippable = null;
        o.condition = 'ok';
      }
      o.fbaScore = fbaScore;

      // Smart Score: weighted composite replacing the raw margin-calculator score
      // Factors: margin quality, capital efficiency, shipping, resale speed, data confidence, risk
      let smartScore = 0;

      // 1. Margin quality (0-25 pts): higher margin = better
      const margin = o.marginPercent || 0;
      if (margin >= 50) smartScore += 25;
      else if (margin >= 30) smartScore += 20;
      else if (margin >= 15) smartScore += 12;
      else if (margin > 0) smartScore += 5;
      else smartScore += 0; // negative margin = 0 pts

      // 2. Capital efficiency (0-25 pts): prefer low-bid / high-profit items
      const bid = o.highBid || 0;
      if (bid <= 0) smartScore += 0;
      else if (bid <= 100) smartScore += 25;      // <$100 is low-risk entry
      else if (bid <= 500) smartScore += 20;
      else if (bid <= 2000) smartScore += 15;
      else if (bid <= 10000) smartScore += 8;
      else if (bid <= 50000) smartScore += 3;
      else smartScore += 0;                        // $50K+ is very high capital risk

      // 3. Shipping & automation (0-20 pts)
      if (o.shippable === true && fbaScore >= 70) smartScore += 20;      // Shippable + FBA ready
      else if (o.shippable === true && fbaScore >= 40) smartScore += 15;  // Shippable + decent FBA
      else if (o.shippable === true) smartScore += 10;                    // Shippable but not FBA
      else if (o.shippable === null) smartScore += 5;                     // Unknown shipping
      else smartScore += 0;                                                // Pickup only

      // 4. Resale speed (0-15 pts): categories that sell fast
      if (/IT|Electronics/.test(o.category || '')) smartScore += 15;
      else if (/Tools|Clothing/.test(o.category || '')) smartScore += 12;
      else if (/Test|Scientific/.test(o.category || '')) smartScore += 10;
      else if (/Medical|Parts/.test(o.category || '')) smartScore += 6;
      else if (/Vehicle/.test(o.category || '')) smartScore += 4;   // Vehicles sell but slowly
      else if (/Furniture/.test(o.category || '')) smartScore += 2;
      else if (/Scrap|Heavy/.test(o.category || '')) smartScore += 0;
      else smartScore += 5; // general/other

      // 5. Data confidence (0-15 pts): real eBay comps vs heuristic estimates
      const ebayCount = o.ebayCount || 0;
      if (ebayCount >= 10) smartScore += 15;       // Strong comp data
      else if (ebayCount >= 3) smartScore += 10;
      else if (ebayCount >= 1) smartScore += 5;
      else smartScore += 0;                         // Heuristic estimate only

      // 6. Condition penalty (0 to -30)
      if (o.condition === 'broken') smartScore -= 30;
      else if (o.condition === 'needs_work') smartScore -= 15;
      else if (o.condition === 'untested') smartScore -= 5;

      // Cap at 100
      o.smartScore = Math.min(100, Math.max(0, smartScore));
      o.smartTier = smartScore >= 70 ? 'A' : smartScore >= 50 ? 'B' : smartScore >= 30 ? 'C' : 'D';
    }

    // Read venture file for milestones
    const ventureContent = readFileSafe(path.join(VENTURES_DIR, 'GSA-Auction-Arbitrage.md'));
    const { frontmatter: ventFm, body: ventBody } = parseFrontmatter(ventureContent);

    // Also include total FBA-friendly count from enriched data
    const fbaFriendly = (data.opportunities || []).filter((o: Record<string, unknown>) => (o.fbaScore as number) >= 60).length;
    const totalCategories: Record<string, number> = {};
    for (const o of (data.opportunities || [])) {
      const cat = (o as Record<string, unknown>).category as string || 'Other';
      totalCategories[cat] = (totalCategories[cat] || 0) + 1;
    }

    return { ...data, ventureFrontmatter: ventFm, ventureBody: ventBody, fbaFriendly, totalCategories };
  } catch (err) {
    console.error('[venture-gsa]', err);
    return { totalListings: 0, analyzed: 0, opportunities: [] };
  }
}

function getVentureSmb() {
  try {
    const seenPath = path.join(GROUPS_DIR, 'business-ideas', 'bizbuysell-seen-urls.json');
    const seenRaw = readFileSafe(seenPath);
    const seen = seenRaw ? JSON.parse(seenRaw) : [];

    const ventureContent = readFileSafe(path.join(VENTURES_DIR, 'SMB-Acquisition-Pipeline.md'));
    const { frontmatter, body } = parseFrontmatter(ventureContent);

    return { dealsScreened: Array.isArray(seen) ? seen.length : 0, frontmatter, body };
  } catch (err) {
    console.error('[venture-smb]', err);
    return { dealsScreened: 0, frontmatter: {}, body: '' };
  }
}

// ── REAL ESTATE DEALS DASHBOARD ──

function getVentureRealestate() {
  try {
    const dealsDir = path.join(GROUPS_DIR, 'real-estate', 'deals');
    let deals: Record<string, unknown>[] = [];

    // Load deal files
    if (fs.existsSync(dealsDir)) {
      const files = fs.readdirSync(dealsDir).filter(f => f.endsWith('.json') && f !== 'index.json');
      for (const f of files) {
        try {
          const raw = readFileSafe(path.join(dealsDir, f));
          if (raw) {
            const deal = JSON.parse(raw);
            deal._file = f;
            deals.push(deal);
          }
        } catch {}
      }
    }

    // Sort by analyzed_at descending
    deals.sort((a, b) => String(b.analyzed_at || '').localeCompare(String(a.analyzed_at || '')));

    // Pipeline counts
    const stages = ['lead', 'analyzing', 'watch', 'offer', 'under_contract', 'closed', 'passed'];
    const pipeline: Record<string, number> = {};
    for (const s of stages) pipeline[s] = 0;
    for (const d of deals) {
      const s = String(d.stage || 'lead');
      if (pipeline[s] !== undefined) pipeline[s]++;
      else pipeline['lead']++;
    }

    // Strategy breakdown
    const strategies: Record<string, number> = { rental: 0, flip: 0, both: 0 };
    for (const d of deals) {
      const s = String(d.strategy || 'rental');
      if (strategies[s] !== undefined) strategies[s]++;
    }

    // Aggregate metrics
    const scored = deals.filter(d => typeof d.score === 'number' && (d.score as number) > 0);
    const avgScore = scored.length ? Math.round(scored.reduce((s, d) => s + (d.score as number), 0) / scored.length) : 0;
    const buyDeals = scored.filter(d => (d.score as number) >= 70);
    const totalDeals = deals.length;

    // Avg cap rate and cash-on-cash from rental analyses
    const withRental = deals.filter(d => d.rental && typeof (d.rental as Record<string, unknown>).cap_rate === 'number');
    const avgCapRate = withRental.length ? (withRental.reduce((s, d) => s + ((d.rental as Record<string, number>).cap_rate || 0), 0) / withRental.length).toFixed(1) : '—';
    const avgCashOnCash = withRental.length ? (withRental.reduce((s, d) => s + ((d.rental as Record<string, number>).cash_on_cash || 0), 0) / withRental.length).toFixed(1) : '—';

    // Read venture file for milestones
    const ventureContent = readFileSafe(path.join(VENTURES_DIR, 'Real-Estate-Deals.md'));
    const { frontmatter: ventFm, body: ventBody } = parseFrontmatter(ventureContent);

    // Load active property searches
    const searchesDir = path.join(GROUPS_DIR, 'real-estate', 'searches');
    const searches: Record<string, unknown>[] = [];
    if (fs.existsSync(searchesDir)) {
      const searchFiles = fs.readdirSync(searchesDir).filter(f => f.endsWith('.json') && !f.includes('-seen') && !f.includes('-results'));
      for (const sf of searchFiles) {
        try {
          const searchConfig = JSON.parse(readFileSafe(path.join(searchesDir, sf)));
          // Load results file
          const resultsPath = path.join(GROUPS_DIR, 'real-estate', searchConfig.results_file || `searches/${sf.replace('.json', '-results.json')}`);
          let results: Record<string, unknown> = { lastScan: null, totalScans: 0, totalFound: 0, totalAlerted: 0, listings: [] };
          try {
            const raw = readFileSafe(resultsPath);
            if (raw) results = JSON.parse(raw);
          } catch {}
          searches.push({ ...searchConfig, results });
        } catch {}
      }
    }

    return {
      deals,
      pipeline,
      strategies,
      totalDeals,
      avgScore,
      buyCount: buyDeals.length,
      avgCapRate,
      avgCashOnCash,
      ventureFrontmatter: ventFm,
      ventureBody: ventBody,
      searches,
    };
  } catch (err) {
    console.error('[venture-realestate]', err);
    return { deals: [], pipeline: {}, strategies: {}, totalDeals: 0, avgScore: 0, buyCount: 0, avgCapRate: '—', avgCashOnCash: '—', ventureFrontmatter: {}, ventureBody: '', searches: [] };
  }
}

// --- Path traversal guard ---

function isPathSafe(requestedPath: string, allowedRoot: string): boolean {
  const resolved = path.resolve(allowedRoot, requestedPath);
  return resolved === allowedRoot || resolved.startsWith(allowedRoot + path.sep);
}

// --- Docs (Obsidian vault browser) with fs.watch cache ---

const _docCache = new Map<string, { data: any; ts: number }>();
let _docCacheDirty = true;

// Watch vault for changes — invalidate cache with debounce for bursty writes
let _docWatchTimeout: ReturnType<typeof setTimeout> | undefined;
try {
  fs.watch(OBSIDIAN_VAULT, { recursive: true }, (event, filename) => {
    if (!filename || filename.endsWith('.md') || !filename.includes('.')) {
      clearTimeout(_docWatchTimeout);
      _docWatchTimeout = setTimeout(() => {
        _docCache.clear();
        _docCacheDirty = true;
      }, 250);
    }
  });
} catch { /* fs.watch not available — fall through to uncached reads */ }

function getDocs(folder?: string) {
  const basePath = folder ? path.resolve(OBSIDIAN_VAULT, folder.replace(/\.\./g, '')) : OBSIDIAN_VAULT;
  if (!isPathSafe(basePath, OBSIDIAN_VAULT)) return { folders: [], files: [], path: '/' };

  const cacheKey = basePath;
  const cached = _docCache.get(cacheKey);
  if (cached && !_docCacheDirty) return cached.data;

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => e.name)
      .sort();
    const files = entries
      .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
      .map(e => {
        const stat = fs.statSync(path.join(basePath, e.name));
        return { name: e.name, size: humanSize(stat.size), modified: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    const relPath = path.relative(OBSIDIAN_VAULT, basePath) || '/';
    const result = { folders, files, path: relPath };
    _docCache.set(cacheKey, { data: result, ts: Date.now() });
    if (_docCacheDirty) _docCacheDirty = false;
    return result;
  } catch { return { folders: [], files: [], path: folder || '/' }; }
}

function getDocContent(docPath: string) {
  const fullPath = path.resolve(OBSIDIAN_VAULT, docPath);
  if (!isPathSafe(fullPath, OBSIDIAN_VAULT)) return null;
  return readFileSafe(fullPath) || null;
}

// --- Memory (Daily Journal) ---

function getMemory(date?: string) {
  // List available daily notes
  const dailyFiles = fs.readdirSync(DAILY_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
    .sort()
    .reverse();

  // Get conversations for a given date from group archives
  const getConversationsForDate = (d: string) => {
    const convos: { group: string; file: string; title: string; preview: string }[] = [];
    // Obsidian conversations
    try {
      const obsFiles = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.startsWith(d));
      for (const f of obsFiles) {
        const content = readFileSafe(path.join(CONVERSATIONS_DIR, f));
        const title = f.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');
        convos.push({ group: 'obsidian', file: f, title, preview: content.substring(0, 300) });
      }
    } catch {}
    // Group conversation archives
    try {
      const groups = fs.readdirSync(GROUP_CONVERSATIONS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory());
      for (const g of groups) {
        const convDir = path.join(GROUP_CONVERSATIONS_DIR, g.name, 'conversations');
        try {
          const files = fs.readdirSync(convDir).filter(f => f.startsWith(d));
          for (const f of files) {
            const content = readFileSafe(path.join(convDir, f));
            const title = f.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');
            convos.push({ group: g.name, file: f, title, preview: content.substring(0, 500) });
          }
        } catch {}
      }
    } catch {}
    return convos;
  };

  if (date) {
    // Return specific day's journal
    const content = readFileSafe(path.join(DAILY_DIR, `${date}.md`));
    const conversations = getConversationsForDate(date);
    return { date, content, conversations, dates: dailyFiles.map(f => f.replace('.md', '')) };
  }

  // Default: return most recent day
  const latest = dailyFiles[0]?.replace('.md', '') || new Date().toISOString().slice(0, 10);
  const content = readFileSafe(path.join(DAILY_DIR, `${latest}.md`));
  const conversations = getConversationsForDate(latest);
  return { date: latest, content, conversations, dates: dailyFiles.map(f => f.replace('.md', '')) };
}

function getMemoryConversation(file: string) {
  const safeName = file.replace(/[^a-zA-Z0-9_.-]/g, '');
  // Check obsidian conversations first
  let content = readFileSafe(path.join(CONVERSATIONS_DIR, safeName));
  if (content) return { file: safeName, content };
  // Check group conversations
  try {
    const groups = fs.readdirSync(GROUP_CONVERSATIONS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory());
    for (const g of groups) {
      content = readFileSafe(path.join(GROUP_CONVERSATIONS_DIR, g.name, 'conversations', safeName));
      if (content) return { file: safeName, group: g.name, content };
    }
  } catch {}
  return null;
}

// --- CRM / Contacts ---

const CONTACTS_DIR = path.join(OBSIDIAN_VAULT, 'Contacts', 'Network');

interface ContactRecord {
  file: string;
  name: string;
  category: string;
  relationship: string;
  source: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  tags: string[];
  dateAdded: string;
}

// Cache contacts index (10K+ files — parse once, refresh on demand)
let contactsCache: ContactRecord[] = [];
let contactsCacheTime = 0;
const CONTACTS_CACHE_TTL = 60000; // 1 minute

function buildContactIndex(): ContactRecord[] {
  try {
    const files = fs.readdirSync(CONTACTS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    return files.map(f => {
      const content = readFileSafe(path.join(CONTACTS_DIR, f));
      const { frontmatter, body } = parseFrontmatter(content);
      const fm = frontmatter as Record<string, unknown>;
      // Extract company from body
      const companyMatch = body.match(/## Role \/ Company\n(.+)/);
      const emailMatch = body.match(/Email:\s*(\S+@\S+)/);
      const phoneMatch = body.match(/Phone:\s*(\S+)/);
      const locationMatch = body.match(/Location:\s*([^#\n]+)/);
      return {
        file: f,
        name: f.replace('.md', '').replace(/-/g, ' '),
        category: (fm.category as string) || '',
        relationship: (fm.relationship as string) || '',
        source: (fm.source as string) || '',
        company: companyMatch?.[1]?.trim() || '',
        email: emailMatch?.[1]?.trim() || '',
        phone: phoneMatch?.[1]?.trim() || '',
        location: ((fm.location as string) || '').trim() || locationMatch?.[1]?.trim() || '',
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        dateAdded: (fm['date-added'] as string) || '',
      };
    });
  } catch { return []; }
}

function getContactsIndex(): ContactRecord[] {
  if (Date.now() - contactsCacheTime > CONTACTS_CACHE_TTL || contactsCache.length === 0) {
    contactsCache = buildContactIndex();
    contactsCacheTime = Date.now();
  }
  return contactsCache;
}

function getContacts(params: URLSearchParams) {
  const contacts = getContactsIndex();
  let filtered = contacts;
  const q = params.get('q')?.toLowerCase();
  const category = params.get('category');
  const relationship = params.get('relationship');
  const source = params.get('source');
  const tag = params.get('tag');
  const page = parseInt(params.get('page') || '1', 10);
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);

  if (q) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  if (category) filtered = filtered.filter(c => c.category === category);
  if (relationship) filtered = filtered.filter(c => c.relationship === relationship);
  if (source) filtered = filtered.filter(c => c.source === source);
  if (tag) filtered = filtered.filter(c => c.tags.includes(tag));

  // Collect unique values for filter dropdowns
  const categories = [...new Set(contacts.map(c => c.category).filter(Boolean))].sort();
  const relationships = [...new Set(contacts.map(c => c.relationship).filter(Boolean))].sort();
  const sources = [...new Set(contacts.map(c => c.source).filter(Boolean))].sort();
  const allTags = [...new Set(contacts.flatMap(c => c.tags).filter(Boolean))].sort();

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    contacts: items,
    total,
    page, limit,
    totalPages: Math.ceil(total / limit),
    filters: { categories, relationships, sources, tags: allTags },
  };
}

function getContactDetail(file: string) {
  const safeName = file.replace(/[^a-zA-Z0-9_.'-]/g, '');
  const content = readFileSafe(path.join(CONTACTS_DIR, safeName));
  if (!content) return null;
  const { frontmatter, body } = parseFrontmatter(content);
  // Cross-object associations
  const rawAssocs = getAssociations('contact', safeName);
  const associations = rawAssocs.map(a => ({
    ...a,
    display: resolveAssociationDisplay(a.type, a.objectId),
  }));
  return { file: safeName, frontmatter, body, associations };
}

// --- Docs search (server-side for large vaults) ---

// In-memory docs index (rebuilt every 5 minutes)
let _docsIndex: Array<{ path: string; name: string; content: string; folder: string; mtime: number }> = [];
let _docsIndexBuilt = 0;
const DOCS_INDEX_TTL = 5 * 60 * 1000;

function buildDocsIndex() {
  const now = Date.now();
  if (now - _docsIndexBuilt < DOCS_INDEX_TTL && _docsIndex.length > 0) return;

  const entries: typeof _docsIndex = [];
  function scan(dir: string, depth = 0) {
    if (depth > 4) return;
    try {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.name.startsWith('_') || item.name === 'node_modules') continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          scan(full, depth + 1);
        } else if (item.name.endsWith('.md')) {
          const rel = path.relative(OBSIDIAN_VAULT, full);
          const relFolder = path.relative(OBSIDIAN_VAULT, dir);
          const content = readFileSafe(full);
          entries.push({ path: rel, name: item.name, content: content.toLowerCase(), folder: relFolder || '/', mtime: fs.statSync(full).mtimeMs });
        }
      }
    } catch {}
  }
  scan(OBSIDIAN_VAULT);
  _docsIndex = entries;
  _docsIndexBuilt = now;
}

function searchDocs(query: string, folder?: string) {
  buildDocsIndex();

  const basePath = folder ? folder.replace(/\.\./g, '') : '';
  const q = query.toLowerCase();
  const results: { path: string; name: string; snippet: string; folder: string }[] = [];

  for (const entry of _docsIndex) {
    if (results.length >= 30) break;
    // Filter by folder if specified
    if (basePath && !entry.path.startsWith(basePath)) continue;

    const nameMatch = entry.name.toLowerCase().includes(q);
    const contentIdx = entry.content.indexOf(q);

    if (nameMatch || contentIdx >= 0) {
      // Read original content for snippet (index stores lowercase)
      const original = readFileSafe(path.join(OBSIDIAN_VAULT, entry.path));
      const idx = original.toLowerCase().indexOf(q);
      const snippet = idx >= 0 ? original.substring(Math.max(0, idx - 40), idx + 80) : original.substring(0, 100);
      results.push({ path: entry.path, name: entry.name, snippet, folder: entry.folder });
    }
  }

  return results;
}

// --- Org Chart ---

function getOrgChart() {
  // Get groups from DB for live status
  const groups = db.prepare(`
    SELECT rg.jid, rg.name, rg.folder, rg.requires_trigger, rg.is_main,
           c.last_message_time
    FROM registered_groups rg
    LEFT JOIN chats c ON rg.jid = c.jid
  `).all() as Array<{
    jid: string; name: string; folder: string;
    requires_trigger: number | null; is_main: number | null;
    last_message_time: string | null;
  }>;

  // Active tasks per group
  const taskCounts = db.prepare(`
    SELECT group_folder, COUNT(*) as c FROM scheduled_tasks WHERE status = 'active' GROUP BY group_folder
  `).all() as Array<{ group_folder: string; c: number }>;
  const taskMap: Record<string, number> = {};
  for (const t of taskCounts) taskMap[t.group_folder] = t.c;

  // Active containers
  const containers = getContainers();
  const activeGroups = new Set(containers.map(c => c.group));

  // Agent role definitions
  const roles: Record<string, { title: string; focus: string; capabilities: string[]; schedule: string[]; escalates: string[] }> = {
    main: {
      title: 'Chief of Staff',
      focus: 'Coordination, cross-channel synthesis, delegation',
      capabilities: ['Cross-channel delegation via schedule_task()', 'Morning briefing synthesis (8:30 AM)', 'Status Board management', 'Google Drive publishing', 'Multi-channel research coordination'],
      schedule: ['8:30 AM — Synthesized morning briefing'],
      escalates: ['Jonathan (urgent decisions, personal matters)'],
    },
    'ai-research': {
      title: 'Research Analyst',
      focus: 'AI trends, papers, tools, automation patterns',
      capabilities: ['Multi-agent verification (/research)', 'Batch link processing (/links)', 'Topic tracing (/trace)', 'Research Digest updates', 'Google Drive publishing'],
      schedule: ['7:00 AM — Research update + link review'],
      escalates: ['#general (external actions, multi-channel requests)'],
    },
    'business-ideas': {
      title: 'Business Analyst',
      focus: 'Market sizing, feasibility, revenue models, execution plans',
      capabilities: ['Market analysis & sizing', 'Revenue model evaluation', 'Automation potential assessment', 'Minimum viable launch paths'],
      schedule: ['8:00 AM — Pipeline updates'],
      escalates: ['#general (budget decisions, external actions)'],
    },
    'health-wellness': {
      title: 'Wellness Advisor',
      focus: 'Longevity, fitness, nutrition, sleep, spiritual protocols',
      capabilities: ['Daily wellness focus', 'Health protocol design', 'Supplement & nutrition research'],
      schedule: ['7:00 AM — Daily health ritual'],
      escalates: ['#general (health concerns needing escalation)'],
    },
    trading: {
      title: 'Trading Analyst',
      focus: 'Stocks, options, strategies, portfolio analysis, macro trends',
      capabilities: ['Market pre-open analysis', 'Options strategy evaluation', 'Portfolio review', 'Macro trend synthesis'],
      schedule: ['7:00 AM — Market pre-open brief'],
      escalates: ['#general (trade execution, account actions)'],
    },
    crypto: {
      title: 'Crypto Analyst',
      focus: 'DeFi, RWA, on-chain analysis, protocol evaluation',
      capabilities: ['Overnight market brief', 'On-chain data analysis', 'DeFi protocol evaluation', 'RWA tracking'],
      schedule: ['7:00 AM — Overnight crypto brief'],
      escalates: ['#general (wallet actions, exchange operations)'],
    },
    contacts: {
      title: 'CRM Manager',
      focus: 'Professional network, HubSpot sync, LinkedIn enrichment',
      capabilities: ['Contact data management', 'Google Sheets ↔ Obsidian sync (15 min)', 'HubSpot export processing', 'Data quality enforcement'],
      schedule: ['Every 15 min — Contact sync'],
      escalates: ['#general (ALL LinkedIn/HubSpot/outreach actions)'],
    },
  };

  const agents = groups.map(g => {
    const role = roles[g.folder] || { title: 'Agent', focus: '', capabilities: [], schedule: [], escalates: [] };
    return {
      jid: g.jid,
      name: g.name,
      folder: g.folder,
      isMain: g.is_main === 1,
      isActive: activeGroups.has(g.folder),
      lastActivity: g.last_message_time,
      activeTasks: taskMap[g.folder] || 0,
      ...role,
    };
  });

  // Sort: main first, then alphabetically
  agents.sort((a, b) => {
    if (a.isMain) return -1;
    if (b.isMain) return 1;
    return a.folder.localeCompare(b.folder);
  });

  return {
    agentName: 'Mithrandir',
    architecture: 'Hub-and-spoke',
    mission: 'Build, operate, and compound an autonomous intelligence network that identifies opportunities, executes strategies, and generates revenue 24/7 — leveraging AI research, financial markets, deal flow, and a 10,000+ professional network to create asymmetric value while Jonathan focuses on high-leverage decisions.',
    principles: [
      'Always be producing — Every agent should have active work, not wait for instructions',
      'Research → Action → Revenue — Research that doesn\'t lead to action is overhead',
      'Compound the network — Every contact, insight, and trade should strengthen the whole system',
      'Escalate decisions, not tasks — Agents handle execution; Jonathan handles strategy',
    ],
    sharedLayer: 'Obsidian Vault',
    delegationFlow: '#general coordinates all cross-channel work. Specialists cannot message each other directly.',
    agents,
  };
}

// --- Office (animated agent view) ---

function getOffice() {
  const groups = db.prepare(`
    SELECT rg.jid, rg.name, rg.folder, rg.is_main,
           c.last_message_time
    FROM registered_groups rg
    LEFT JOIN chats c ON rg.jid = c.jid
  `).all() as Array<{
    jid: string; name: string; folder: string; is_main: number | null;
    last_message_time: string | null;
  }>;

  const containers = getContainers();
  const activeGroups = new Set(containers.map(c => c.group));

  // Read real-time queue state from the main nanoclaw process
  let queueState: Record<string, {
    active: boolean; isTaskContainer: boolean; runningTaskId: string | null;
    containerName: string | null; groupFolder: string | null;
    pendingTaskCount: number; pendingMessages: boolean;
  }> = {};
  let queueStateAge = Infinity;
  try {
    const qsPath = path.join(DATA_DIR, 'queue-state.json');
    const raw = JSON.parse(fs.readFileSync(qsPath, 'utf-8'));
    queueStateAge = Date.now() - (raw.ts || 0);
    // Only trust state if it's less than 2 minutes old
    if (queueStateAge < 120_000) {
      queueState = raw.groups || {};
    }
  } catch {}

  // Build lookups: group folder → queue info, and jid → queue info
  const queueByFolder: Record<string, typeof queueState[string]> = {};
  const queueByJid: Record<string, typeof queueState[string]> = {};
  for (const [jid, qs] of Object.entries(queueState)) {
    queueByJid[jid] = qs;
    if (qs.groupFolder) queueByFolder[qs.groupFolder] = qs;
  }

  // Check for recent cross-channel delegations (last 30 min = collaborating)
  const recent30 = new Date(Date.now() - 30 * 60000).toISOString();
  const recentTasks = db.prepare(`
    SELECT id, group_folder, prompt, last_run, status FROM scheduled_tasks
    WHERE status = 'active' AND last_run > ?
    ORDER BY last_run DESC
  `).all(recent30) as Array<{ id: string; group_folder: string; prompt: string; last_run: string; status: string }>;
  const recentlyRanGroups = new Set(recentTasks.map(t => t.group_folder));

  // Recent messages per group (last 5 min = actively conversing)
  const recent5 = new Date(Date.now() - 5 * 60000).toISOString();

  // Cross-group IPC sends in last 10 min = actual collaboration evidence
  const recent10 = new Date(Date.now() - 10 * 60000).toISOString();
  let collaboratingGroups = new Set<string>();
  try {
    const crossSends = db.prepare(`
      SELECT source_group, target_group FROM cross_group_sends
      WHERE timestamp > ?
    `).all(recent10) as Array<{ source_group: string; target_group: string }>;
    for (const cs of crossSends) {
      collaboratingGroups.add(cs.source_group);
      collaboratingGroups.add(cs.target_group);
    }
  } catch { /* table may not exist yet */ }

  // Agent titles
  const titles: Record<string, string> = {
    main: 'Chief of Staff', 'ai-research': 'Research Analyst', 'business-ideas': 'Business Analyst',
    'health-wellness': 'Wellness Advisor', trading: 'Trading Analyst', crypto: 'Crypto Analyst',
    contacts: 'CRM Manager',
  };

  // Agent colors (for avatars)
  const colors: Record<string, string> = {
    main: '#5e6ad2', 'ai-research': '#9f7aea', 'business-ideas': '#d97706',
    'health-wellness': '#4da870', trading: '#d9534f', crypto: '#e5a100',
    contacts: '#3b82f6',
  };

  // Emojis for each agent
  const emojis: Record<string, string> = {
    main: '🧙', 'ai-research': '🔬', 'business-ideas': '💼',
    'health-wellness': '🧘', trading: '📈', crypto: '₿',
    contacts: '📇',
  };

  const agents = groups.map(g => {
    const hasContainer = activeGroups.has(g.folder);
    const qs = queueByFolder[g.folder] || queueByJid[g.jid];
    // Queue says actively processing (trusted source — main process writes this)
    const queueActive = qs?.active === true;
    // Truly working = queue says active, OR container exists and queue state is stale/missing
    const isWorking = queueActive || (hasContainer && queueStateAge > 120_000);
    const recentMsg = db.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_jid = ? AND timestamp > ?')
      .get(g.jid, recent5) as { c: number };
    const isConversing = recentMsg.c > 0;
    const ranRecently = recentlyRanGroups.has(g.folder);
    // Check if agent sent a bot message in last 5 min (recently finished work)
    const recentBotMsg = db.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_jid = ? AND is_bot_message = 1 AND timestamp > ?')
      .get(g.jid, recent5) as { c: number };
    const recentlyActive = recentBotMsg.c > 0;

    // Determine state — "collaborating" requires actual cross-group IPC evidence
    let state: 'working' | 'idle' | 'collaborating' | 'on-task';
    if (isWorking && collaboratingGroups.has(g.folder)) state = 'collaborating';
    else if (isWorking) state = 'working';
    else if (ranRecently || recentlyActive) state = 'on-task';
    else state = 'idle';

    // Derive a readable title from a task prompt
    const promptToTitle = (prompt: string): string => {
      if (!prompt) return 'Processing...';
      let t = prompt;
      const roleMatch = t.match(/^You are (?:a |the )([^.]+)\./i);
      const roleName = roleMatch ? roleMatch[1].trim() : null;
      t = t.replace(/^You are (?:a |the )[^.]+\.\s*/i, '');
      t = t.replace(/^Your (?:job|task) is to\s*/i, '');
      const firstLine = t.split('\n')[0].trim();
      if (!firstLine && roleName) return roleName;
      const firstSentence = firstLine.split(/\.\s/)[0];
      let title = (firstSentence.length < 80 ? firstSentence : firstLine.substring(0, 60)).replace(/\.$/, '');
      if (title.length > 0) title = title[0].toUpperCase() + title.slice(1);
      return title || roleName || 'Processing...';
    };

    // Determine what the agent is actually working on
    let currentTaskText: string | null = null;
    let currentTaskId: string | null = null;
    let taskProgress = 0;

    if (isWorking) {
      const container = containers.find(c => c.group === g.folder);
      const rawCreated = container?.created?.replace(/\s+[A-Z]{2,4}$/, '') || '';
      const containerCreated = rawCreated ? new Date(rawCreated).toISOString() : recent5;

      // Priority 1: Queue state knows the exact running task ID
      if (qs?.runningTaskId) {
        const qTask = db.prepare('SELECT id, prompt FROM scheduled_tasks WHERE id = ?')
          .get(qs.runningTaskId) as { id: string; prompt: string } | undefined;
        if (qTask) {
          currentTaskText = promptToTitle(qTask.prompt);
          currentTaskId = qTask.id;
        }
      }

      // Priority 2: Queue is active but not on a task — responding to a message
      if (!currentTaskText && qs?.active && !qs?.isTaskContainer) {
        const triggerSince = rawCreated ? new Date(new Date(rawCreated).getTime() - 30000).toISOString() : recent5;
        const triggerMsg = db.prepare(`
          SELECT content FROM messages
          WHERE chat_jid = ? AND is_bot_message = 0 AND timestamp >= ?
          ORDER BY timestamp DESC LIMIT 1
        `).get(g.jid, triggerSince) as { content: string } | undefined;
        if (triggerMsg?.content) {
          currentTaskText = 'Responding to: ' + triggerMsg.content.substring(0, 80);
        }
      }

      // Priority 3: Fallback heuristics (queue state stale or missing)
      if (!currentTaskText) {
        const triggerSince = rawCreated ? new Date(new Date(rawCreated).getTime() - 30000).toISOString() : recent5;
        const triggerMsg = db.prepare(`
          SELECT content FROM messages
          WHERE chat_jid = ? AND is_bot_message = 0 AND timestamp >= ?
          ORDER BY timestamp DESC LIMIT 1
        `).get(g.jid, triggerSince) as { content: string } | undefined;

        if (triggerMsg?.content) {
          currentTaskText = 'Responding to: ' + triggerMsg.content.substring(0, 80);
        } else {
          const recentTask = db.prepare(`
            SELECT id, prompt FROM scheduled_tasks
            WHERE group_folder = ? AND last_run >= ?
            ORDER BY last_run DESC LIMIT 1
          `).get(g.folder, containerCreated) as { id: string; prompt: string } | undefined;

          if (recentTask) {
            currentTaskText = promptToTitle(recentTask.prompt);
            currentTaskId = recentTask.id;
          }
        }
      }

      // Estimate progress based on container uptime (~3 min avg)
      if (container?.created) {
        const elapsed = Date.now() - new Date(container.created).getTime();
        taskProgress = Math.min(95, Math.round((elapsed / 180000) * 100));
      } else {
        taskProgress = 25;
      }
    } else if (ranRecently) {
      // Recently ran but container is gone — show what it ran
      const lastRanTask = recentTasks.find(t => t.group_folder === g.folder);
      currentTaskText = lastRanTask ? promptToTitle(lastRanTask.prompt) : null;
      currentTaskId = lastRanTask?.id || null;
      taskProgress = 85;
    } else {
      // Idle — show next scheduled task if any
      const nextTask = db.prepare(`
        SELECT id, prompt FROM scheduled_tasks
        WHERE group_folder = ? AND status = 'active'
        ORDER BY next_run ASC LIMIT 1
      `).get(g.folder) as { id: string; prompt: string } | undefined;
      currentTaskText = nextTask ? promptToTitle(nextTask.prompt) : null;
      currentTaskId = nextTask?.id || null;
    }

    // Detect model: check for OpenRouter flag, else default
    const orFlagPath = path.join(GROUPS_DIR, g.folder, '.openrouter_mode');
    let model = 'claude-opus-4-6';
    try {
      if (fs.existsSync(orFlagPath)) {
        const flag = JSON.parse(fs.readFileSync(orFlagPath, 'utf-8'));
        const age = Date.now() - new Date(flag.since).getTime();
        if (age < 4 * 3600000) model = 'openrouter (fallback)';
      }
    } catch {}

    // Session info: JSONL file size for this group
    let sessionSize = 0;
    try {
      const sessionsDir = path.join(DATA_DIR, 'sessions', g.folder, '.claude', 'projects');
      if (fs.existsSync(sessionsDir)) {
        const dirs = fs.readdirSync(sessionsDir);
        for (const d of dirs) {
          const files = fs.readdirSync(path.join(sessionsDir, d)).filter(f => f.endsWith('.jsonl'));
          for (const f of files) {
            const st = fs.statSync(path.join(sessionsDir, d, f));
            sessionSize += st.size;
          }
        }
      }
    } catch {}

    // Last message sent by the agent
    const lastMsg = db.prepare(`
      SELECT content, timestamp FROM messages
      WHERE chat_jid = ? AND is_bot_message = 1
      ORDER BY timestamp DESC LIMIT 1
    `).get(g.jid) as { content: string; timestamp: string } | undefined;

    // Look up Discord thread for current task
    let currentThreadId: string | null = null;
    if (currentTaskId) {
      const threadRow = db.prepare('SELECT thread_id FROM scheduled_tasks WHERE id = ?')
        .get(currentTaskId) as { thread_id: string | null } | undefined;
      currentThreadId = threadRow?.thread_id || null;
    }

    // Pending task count from queue
    const pendingTaskCount = qs?.pendingTaskCount || 0;

    return {
      folder: g.folder,
      name: g.name,
      isMain: g.is_main === 1,
      title: titles[g.folder] || 'Agent',
      color: colors[g.folder] || '#888',
      emoji: emojis[g.folder] || '🤖',
      state,
      model,
      currentTask: currentTaskText,
      currentTaskId,
      currentThreadId,
      pendingTaskCount,
      taskProgress,
      sessionSize,
      lastMessage: lastMsg?.content?.substring(0, 120) || null,
      lastMessageTime: lastMsg?.timestamp || null,
      lastActivity: g.last_message_time,
    };
  });

  // Collaboration requires 2+ agents — if only 1 is "collaborating", demote to "working"
  const collaborators = agents.filter(a => a.state === 'collaborating');
  if (collaborators.length < 2) {
    for (const a of collaborators) {
      a.state = 'working';
    }
  }

  // Include scheduled tasks for the Office view
  const activeTasks = db.prepare(`
    SELECT id, group_folder, prompt, schedule_type, schedule_value, next_run, last_run, last_result, status, created_at, thread_id
    FROM scheduled_tasks
    WHERE status = 'active'
    ORDER BY next_run ASC
  `).all() as Array<{
    id: string; group_folder: string; prompt: string; schedule_type: string;
    schedule_value: string; next_run: string | null; last_run: string | null;
    last_result: string | null; status: string; created_at: string; thread_id: string | null;
  }>;

  // Split into one-time (project work) vs recurring (cron/interval)
  const oneTimeTasks = activeTasks.filter(t => t.schedule_type === 'once');
  // For recurring tasks, include ALL crons (active + completed daily crons that will reactivate tomorrow)
  const recurringTasks = db.prepare(`
    SELECT id, group_folder, prompt, schedule_type, schedule_value, next_run, last_run, last_result, status, created_at, thread_id
    FROM scheduled_tasks
    WHERE schedule_type IN ('cron', 'interval') AND status IN ('active', 'completed', 'paused', 'needs_review')
    ORDER BY group_folder, schedule_value
  `).all() as Array<{
    id: string; group_folder: string; prompt: string; schedule_type: string;
    schedule_value: string; next_run: string | null; last_run: string | null;
    last_result: string | null; status: string; created_at: string; thread_id: string | null;
  }>;

  // Get unread counts for tasks
  const unreadCounts = getUnreadCommentCounts();

  // Get last run info for one-time tasks
  const lastRunInfo = db.prepare(`
    SELECT task_id, status, run_at, duration_ms, COALESCE(cost_usd, 0) as cost_usd,
           substr(COALESCE(result, error, ''), 1, 200) as summary
    FROM task_run_logs WHERE id IN (
      SELECT MAX(id) FROM task_run_logs GROUP BY task_id
    )
  `).all() as Array<{ task_id: string; status: string; run_at: string; duration_ms: number; cost_usd: number; summary: string }>;
  const lastRunMap: Record<string, typeof lastRunInfo[0]> = {};
  for (const r of lastRunInfo) lastRunMap[r.task_id] = r;

  // Build project associations
  const projectMap: Record<string, string> = {};
  try {
    const projFiles = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
    for (const f of projFiles) {
      const content = readFileSafe(path.join(PROJECTS_DIR, f));
      const { frontmatter } = parseFrontmatter(content);
      const projName = f.replace('.md', '').replace(/-/g, ' ');
      for (const tid of (frontmatter.tasks || [])) {
        projectMap[tid] = projName;
      }
    }
  } catch {}

  // Build set of task IDs currently running according to queue state
  const runningTaskIds = new Set<string>();
  for (const qs of Object.values(queueState)) {
    if (qs.active && qs.runningTaskId) runningTaskIds.add(qs.runningTaskId);
  }

  // Determine stage for each one-time task
  const taskItems = oneTimeTasks.map(t => {
    // Use queue state for precise "running" detection; fall back to container heuristic
    const isRunningByQueue = runningTaskIds.has(t.id);
    const hasContainer = !!containers.find(c => c.group === t.group_folder);
    const isRunning = isRunningByQueue || (hasContainer && queueStateAge > 120_000);
    const lastRun = lastRunMap[t.id];
    let stage: 'queued' | 'running' | 'ran' | 'error';
    if (isRunning) stage = 'running';
    else if (lastRun?.status === 'error') stage = 'error';
    else if (t.last_run) stage = 'ran';
    else stage = 'queued';

    return {
      id: t.id,
      group_folder: t.group_folder,
      prompt: t.prompt.substring(0, 300),
      stage,
      created_at: t.created_at,
      last_run: t.last_run,
      lastResult: t.last_result?.substring(0, 150) || null,
      lastRunInfo: lastRun || null,
      project: projectMap[t.id] || null,
      unread: unreadCounts[t.id] || 0,
      threadId: t.thread_id || null,
    };
  });

  return {
    agents,
    collaborators: agents.filter(a => a.state === 'collaborating').map(c => c.folder),
    taskItems,
    recurringTasks: recurringTasks.map(t => ({
      id: t.id,
      group_folder: t.group_folder,
      prompt: t.prompt.substring(0, 150),
      schedule_value: t.schedule_value,
      scheduleHuman: describeCron(t.schedule_value),
      next_run: t.next_run,
      last_run: t.last_run,
      status: t.status,
      threadId: t.thread_id || null,
    })),
  };
}

// --- POST handlers ---

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

async function postReview(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId, action, comment } = body as { taskId: string; action: string; comment?: string };
  if (!taskId || !action) throw new Error('taskId and action required');

  const reviews = loadReviews();
  reviews.push({
    taskId, action: action as Review['action'],
    comment: comment || undefined,
    timestamp: new Date().toISOString(),
  });
  saveReviews(reviews);
  return { ok: true };
}

async function postClearReviews(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId } = body as { taskId: string };
  const reviews = loadReviews().filter(r => r.taskId !== taskId);
  saveReviews(reviews);
  return { ok: true };
}

async function postReschedule(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId, schedule_value } = body as { taskId: string; schedule_value: string };
  if (!taskId || !schedule_value) throw new Error('taskId and schedule_value required');

  // Validate cron expression
  try {
    CronExpressionParser.parse(schedule_value, { tz: TZ });
  } catch {
    throw new Error(`Invalid cron expression: ${schedule_value}`);
  }

  // Compute next run
  const interval = CronExpressionParser.parse(schedule_value, { tz: TZ });
  const nextRun = interval.next().toISOString();

  dbWrite.prepare(`
    UPDATE scheduled_tasks SET schedule_value = ?, next_run = ? WHERE id = ?
  `).run(schedule_value, nextRun, taskId);

  return { ok: true, nextRun };
}

async function postTaskStatus(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId, status, archiveThread } = body as { taskId: string; status: string; archiveThread?: boolean };
  if (!taskId || !['active', 'paused', 'completed', 'disabled'].includes(status)) throw new Error('taskId and valid status required');

  // BLOCK completing cron tasks — they should be paused or deleted, never completed.
  // This prevents the recurring cron death spiral where tasks stop running permanently.
  if (status === 'completed') {
    const task = db.prepare('SELECT schedule_type FROM scheduled_tasks WHERE id = ?').get(taskId) as { schedule_type: string } | undefined;
    if (task?.schedule_type === 'cron') {
      console.warn(`[tasks] BLOCKED: Attempt to complete cron task ${taskId} — use 'paused' instead`);
      return { ok: false, error: 'Cron tasks cannot be completed. Use pause to stop them, or delete to remove permanently.' };
    }
  }

  // When reactivating a task (including from disabled), reset failures and recompute next_run
  if (status === 'active') {
    const task = db.prepare('SELECT schedule_type, schedule_value, status as cur_status FROM scheduled_tasks WHERE id = ?').get(taskId) as { schedule_type: string; schedule_value: string; cur_status: string } | undefined;
    // Reset consecutive failures when reactivating from disabled
    if (task?.cur_status === 'disabled') {
      dbWrite.prepare('UPDATE scheduled_tasks SET consecutive_failures = 0, last_error = NULL WHERE id = ?').run(taskId);
    }
    if (task?.schedule_type === 'cron' && task.schedule_value) {
      try {
        const { CronExpressionParser } = require('cron-parser');
        const interval = CronExpressionParser.parse(task.schedule_value, { tz: TZ });
        const nextRun = interval.next().toISOString();
        dbWrite.prepare('UPDATE scheduled_tasks SET status = ?, next_run = ? WHERE id = ?').run(status, nextRun, taskId);
        return { ok: true, nextRun };
      } catch {}
    }
  }

  dbWrite.prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?').run(status, taskId);

  // If completing a task with a thread, queue thread archive request
  if (status === 'completed' && archiveThread) {
    const task = db.prepare('SELECT thread_id FROM scheduled_tasks WHERE id = ?').get(taskId) as { thread_id: string | null } | undefined;
    if (task?.thread_id) {
      dbWrite.prepare(
        'INSERT INTO pending_thread_messages (thread_id, sender, message, created_at) VALUES (?, ?, ?, ?)',
      ).run(task.thread_id, 'system', '__ARCHIVE_THREAD__', new Date().toISOString());
    }
  }

  // Return thread_id so frontend can ask about archival
  const task = db.prepare('SELECT thread_id FROM scheduled_tasks WHERE id = ?').get(taskId) as { thread_id: string | null } | undefined;
  return { ok: true, threadId: task?.thread_id || null };
}

async function postTaskProgress(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId, progress } = body as { taskId: string; progress: number };
  if (!taskId || typeof progress !== 'number' || progress < 0 || progress > 100) throw new Error('taskId and progress (0-100) required');
  dbWrite.prepare('UPDATE scheduled_tasks SET progress = ? WHERE id = ?').run(Math.round(progress), taskId);
  return { ok: true };
}

async function postTaskRunNow(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId } = body as { taskId: string };
  if (!taskId) throw new Error('taskId required');

  // Set next_run to now and ensure status is active so the scheduler picks it up immediately
  const now = new Date().toISOString();
  dbWrite.prepare('UPDATE scheduled_tasks SET next_run = ?, status = ? WHERE id = ?').run(now, 'active', taskId);
  return { ok: true, nextRun: now };
}

async function postTaskComment(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId, message, sender } = body as { taskId: string; message: string; sender?: string };
  if (!taskId || !message?.trim()) throw new Error('taskId and message required');

  const senderName = sender || 'user';
  addTaskComment(taskId, senderName, message.trim(), 'info');

  const isProject = taskId.startsWith('proj:');

  if (isProject) {
    // Forward project comment to Discord thread
    const projectFile = taskId.slice(5); // strip 'proj:'
    const threadId = getProjectThreadId(projectFile);
    if (threadId) {
      dbWrite.prepare(
        'INSERT INTO pending_thread_messages (thread_id, sender, message, created_at) VALUES (?, ?, ?, ?)',
      ).run(threadId, senderName, message.trim(), new Date().toISOString());
    } else {
      // Queue a thread creation request — main process will create it on next poll
      dbWrite.prepare(
        'INSERT INTO pending_thread_messages (thread_id, sender, message, created_at) VALUES (?, ?, ?, ?)',
      ).run(`__CREATE_PROJECT_THREAD__:${projectFile}`, senderName, message.trim(), new Date().toISOString());
    }
  } else {
    // Forward to Discord thread if task has one
    const taskRow = db.prepare('SELECT thread_id, status, schedule_type FROM scheduled_tasks WHERE id = ?').get(taskId) as { thread_id: string | null; status: string; schedule_type: string } | undefined;
    if (taskRow?.thread_id) {
      dbWrite.prepare(
        'INSERT INTO pending_thread_messages (thread_id, sender, message, created_at) VALUES (?, ?, ?, ?)',
      ).run(taskRow.thread_id, senderName, message.trim(), new Date().toISOString());
    }

    // Trigger immediate pickup: set next_run to now so the scheduler runs this task
    if (taskRow) {
      const now = new Date().toISOString();
      if (taskRow.status === 'active' || taskRow.status === 'needs_review') {
        dbWrite.prepare('UPDATE scheduled_tasks SET next_run = ?, status = ? WHERE id = ?').run(now, 'active', taskId);
      } else if (taskRow.status === 'completed' && taskRow.schedule_type === 'once') {
        dbWrite.prepare('UPDATE scheduled_tasks SET status = ?, next_run = ? WHERE id = ?').run('active', now, taskId);
      }
    }
  }

  return { ok: true };
}

async function postTaskCommentsRead(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId } = body as { taskId: string };
  if (!taskId) throw new Error('taskId required');

  markCommentsRead(taskId);
  return { ok: true };
}

function getTaskCommentsApi(params: URLSearchParams) {
  const taskId = params.get('taskId');
  if (!taskId) return { comments: [] };
  const comments = getTaskComments(taskId);
  // Mark as read when viewed
  markCommentsRead(taskId);
  return { comments };
}

// --- Enhanced Task API (v2) ---

function getTaskHealth() {
  const counts = db.prepare(
    `SELECT status, COUNT(*) as cnt FROM scheduled_tasks GROUP BY status`,
  ).all() as Array<{ status: string; cnt: number }>;
  const total = counts.reduce((s, c) => s + c.cnt, 0);
  const byStatus = Object.fromEntries(counts.map(c => [c.status, c.cnt]));

  const overdue = (db.prepare(
    `SELECT COUNT(*) as cnt FROM scheduled_tasks WHERE status = 'active' AND next_run IS NOT NULL AND next_run < datetime('now', '-5 minutes')`,
  ).get() as { cnt: number }).cnt;

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
    total, active: byStatus['active'] || 0, paused: byStatus['paused'] || 0,
    disabled: byStatus['disabled'] || 0, overdue,
    successRate24h: runs24h.total > 0 ? Math.round((runs24h.ok / runs24h.total) * 100) : 100,
    cost24h: Math.round(runs24h.cost * 100) / 100,
    runs24h: runs24h.total,
    failingTasks: failing.map(f => ({ id: f.id, name: f.name || f.id, consecutiveFailures: f.consecutive_failures, lastError: f.last_error })),
  };
}

function getTaskCostTrends(params: URLSearchParams) {
  const days = parseInt(params.get('days') || '14', 10);
  const trends = db.prepare(
    `SELECT date(run_at) as date, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as runs,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failures
     FROM task_run_logs WHERE run_at > datetime('now', '-' || ? || ' days')
     GROUP BY date(run_at) ORDER BY date`,
  ).all(days) as Array<{ date: string; cost: number; runs: number; failures: number }>;
  return { trends };
}

function getTaskDuplicates() {
  const dupes = db.prepare(
    `SELECT dedup_key, COUNT(*) as cnt FROM scheduled_tasks
     WHERE dedup_key IS NOT NULL AND status IN ('active', 'paused')
     GROUP BY dedup_key HAVING cnt > 1`,
  ).all() as Array<{ dedup_key: string; cnt: number }>;

  return {
    groups: dupes.map(d => ({
      dedupKey: d.dedup_key,
      tasks: db.prepare(
        `SELECT id, name, status, last_run, created_at, schedule_value FROM scheduled_tasks
         WHERE dedup_key = ? AND status IN ('active', 'paused') ORDER BY last_run DESC`,
      ).all(d.dedup_key),
    })),
  };
}

function getTaskTemplatesApi() {
  return {
    templates: db.prepare(
      `SELECT slug, name, description, default_schedule, default_group, category, venture_file, max_runs_per_day FROM task_templates ORDER BY name`,
    ).all(),
  };
}

async function postTaskMerge(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { keepId, removeIds } = body as { keepId: string; removeIds: string[] };
  if (!keepId || !removeIds?.length) throw new Error('keepId and removeIds required');

  const placeholders = removeIds.map(() => '?').join(',');
  dbWrite.transaction(() => {
    dbWrite.prepare(`UPDATE task_run_logs SET task_id = ? WHERE task_id IN (${placeholders})`).run(keepId, ...removeIds);
    dbWrite.prepare(`UPDATE task_comments SET task_id = ? WHERE task_id IN (${placeholders})`).run(keepId, ...removeIds);
    for (const rid of removeIds) {
      dbWrite.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(rid);
    }
  })();
  return { ok: true, merged: removeIds.length };
}

async function postTaskDelete(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId } = body as { taskId: string };
  if (!taskId) throw new Error('taskId required');
  dbWrite.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(taskId);
  dbWrite.prepare('DELETE FROM task_comments WHERE task_id = ?').run(taskId);
  dbWrite.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(taskId);
  return { ok: true };
}

async function postTaskLink(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { taskId, venture_file, project_file } = body as { taskId: string; venture_file?: string; project_file?: string };
  if (!taskId) throw new Error('taskId required');
  const updates: string[] = [];
  const values: unknown[] = [];
  if (venture_file !== undefined) { updates.push('venture_file = ?'); values.push(venture_file || null); }
  if (project_file !== undefined) { updates.push('project_file = ?'); values.push(project_file || null); }
  if (updates.length > 0) {
    values.push(taskId);
    dbWrite.prepare(`UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return { ok: true };
}

// --- Accounting ---

function getAccounting(params: URLSearchParams) {
  const period = params.get('period') || 'inception';
  const customFrom = params.get('from');
  const customTo = params.get('to');

  // Calculate date range
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  let fromDate: string;
  let toDate: string = now.toISOString().slice(0, 10);

  switch (period) {
    case 'this_month':
      fromDate = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-01`;
      break;
    case 'last_month': {
      const lm = new Date(etNow.getFullYear(), etNow.getMonth() - 1, 1);
      fromDate = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`;
      const lmEnd = new Date(etNow.getFullYear(), etNow.getMonth(), 0);
      toDate = `${lmEnd.getFullYear()}-${String(lmEnd.getMonth() + 1).padStart(2, '0')}-${String(lmEnd.getDate()).padStart(2, '0')}`;
      break;
    }
    case 'this_quarter': {
      const q = Math.floor(etNow.getMonth() / 3);
      fromDate = `${etNow.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      break;
    }
    case 'last_quarter': {
      const q = Math.floor(etNow.getMonth() / 3) - 1;
      const year = q < 0 ? etNow.getFullYear() - 1 : etNow.getFullYear();
      const qAdj = q < 0 ? 3 : q;
      fromDate = `${year}-${String(qAdj * 3 + 1).padStart(2, '0')}-01`;
      const qEnd = new Date(year, (qAdj + 1) * 3, 0);
      toDate = `${qEnd.getFullYear()}-${String(qEnd.getMonth() + 1).padStart(2, '0')}-${String(qEnd.getDate()).padStart(2, '0')}`;
      break;
    }
    case 'ytd':
      fromDate = `${etNow.getFullYear()}-01-01`;
      break;
    case 'last_year':
      fromDate = `${etNow.getFullYear() - 1}-01-01`;
      toDate = `${etNow.getFullYear() - 1}-12-31`;
      break;
    case 'custom':
      fromDate = customFrom || '2025-01-01';
      toDate = customTo || now.toISOString().slice(0, 10);
      break;
    default: // inception
      fromDate = '2025-01-01';
      break;
  }

  const entries = db.prepare(`
    SELECT e.*, a.name as account_name, a.type as account_type
    FROM accounting_entries e
    JOIN accounting_accounts a ON e.account_code = a.code
    WHERE e.date >= ? AND e.date <= ?
    ORDER BY e.date DESC, e.id DESC
  `).all(fromDate, toDate) as Array<{
    id: number; date: string; description: string; category: string;
    account_code: string; amount: number; type: string; vendor: string | null;
    reference: string | null; receipt_path: string | null; source: string;
    tags: string | null; created_at: string; updated_at: string;
    account_name: string; account_type: string; is_reconciled: number;
  }>;

  // P/L aggregation
  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalOpex = 0;
  const revenueByAccount: Record<string, number> = {};
  const cogsByAccount: Record<string, number> = {};
  const opexByAccount: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};

  for (const e of entries) {
    const amt = Math.abs(e.amount);
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amt;

    if (e.type === 'revenue' || e.account_type === 'revenue') {
      totalRevenue += amt;
      revenueByAccount[e.account_name] = (revenueByAccount[e.account_name] || 0) + amt;
    } else if (e.account_type === 'cogs') {
      totalCOGS += amt;
      cogsByAccount[e.account_name] = (cogsByAccount[e.account_name] || 0) + amt;
    } else {
      totalOpex += amt;
      opexByAccount[e.account_name] = (opexByAccount[e.account_name] || 0) + amt;
    }
  }

  const grossProfit = totalRevenue - totalCOGS;
  const netIncome = grossProfit - totalOpex;

  // Accounts for dropdown
  const accounts = db.prepare('SELECT code, name, type, parent_code FROM accounting_accounts ORDER BY code').all();

  // Monthly trend (last 12 months)
  const trend = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN type = 'revenue' THEN amount ELSE 0 END) as revenue,
           SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
    FROM accounting_entries
    WHERE date >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month
  `).all() as Array<{ month: string; revenue: number; expenses: number }>;

  // Balance Sheet: all-time figures (not filtered by period)
  const allEntries = db.prepare(`
    SELECT e.amount, e.type, a.type as account_type, a.name as account_name
    FROM accounting_entries e
    JOIN accounting_accounts a ON e.account_code = a.code
  `).all() as Array<{ amount: number; type: string; account_type: string; account_name: string }>;

  let cumRevenue = 0, cumExpenses = 0;
  for (const e of allEntries) {
    if (e.type === 'revenue') cumRevenue += Math.abs(e.amount);
    else cumExpenses += Math.abs(e.amount);
  }
  const retainedEarnings = cumRevenue - cumExpenses;

  // Wallet assets (latest snapshot or live cache)
  const walletAssets = db.prepare(`
    SELECT wa.label, wa.address, wa.chain,
           ws.total_usd, ws.eth_balance, ws.eth_price, ws.tokens, ws.timestamp
    FROM wallet_assets wa
    LEFT JOIN wallet_snapshots ws ON ws.wallet_id = wa.id
      AND ws.id = (SELECT id FROM wallet_snapshots WHERE wallet_id = wa.id ORDER BY timestamp DESC LIMIT 1)
  `).all() as Array<{
    label: string; address: string; chain: string;
    total_usd: number | null; eth_balance: number | null; eth_price: number | null;
    tokens: string | null; timestamp: string | null;
  }>;

  const walletTotal = walletAssets.reduce((sum, w) => sum + (w.total_usd || 0), 0);
  const totalAssets = walletTotal; // expandable: add cash, receivables, etc.
  const totalLiabilities = 0; // placeholder for future
  const totalEquity = retainedEarnings;

  return {
    period, fromDate, toDate,
    entries: entries.slice(0, 200), // paginate
    totalEntries: entries.length,
    pl: {
      totalRevenue, totalCOGS, grossProfit, totalOpex, netIncome,
      revenueByAccount, cogsByAccount, opexByAccount, categoryTotals,
    },
    balanceSheet: {
      assets: {
        walletAssets: walletAssets.map(w => ({
          label: w.label,
          address: w.address,
          chain: w.chain,
          valueUsd: w.total_usd || 0,
          lastSnapshot: w.timestamp,
          tokens: w.tokens ? JSON.parse(w.tokens) : [],
          ethBalance: w.eth_balance || 0,
          ethPrice: w.eth_price || 0,
        })),
        totalWallets: walletTotal,
        totalAssets,
      },
      liabilities: {
        totalLiabilities,
      },
      equity: {
        retainedEarnings,
        totalEquity,
      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    },
    accounts,
    trend,
  };
}

function getCostAnalysis(params: URLSearchParams) {
  const period = params.get('period') || 'inception';
  // Reuse getAccounting for date logic
  const acctData = getAccounting(params);
  const fromDate = acctData.fromDate;
  const toDate = acctData.toDate;

  // Cost by task (scheduled tasks with run costs)
  const byTask = db.prepare(`
    SELECT st.id, st.prompt, st.group_folder, st.schedule_type, st.status,
           COUNT(trl.task_id) as run_count,
           COALESCE(SUM(trl.cost_usd), 0) as total_cost,
           COALESCE(SUM(trl.input_tokens), 0) as total_input_tokens,
           COALESCE(SUM(trl.output_tokens), 0) as total_output_tokens,
           COALESCE(SUM(trl.duration_ms), 0) as total_duration_ms,
           MIN(trl.run_at) as first_run,
           MAX(trl.run_at) as last_run
    FROM scheduled_tasks st
    LEFT JOIN task_run_logs trl ON trl.task_id = st.id
      AND trl.run_at >= ? AND trl.run_at <= ? || 'T23:59:59'
    GROUP BY st.id
    HAVING run_count > 0
    ORDER BY total_cost DESC
  `).all(fromDate, toDate) as Array<{
    id: string; prompt: string; group_folder: string; schedule_type: string; status: string;
    run_count: number; total_cost: number; total_input_tokens: number; total_output_tokens: number;
    total_duration_ms: number; first_run: string; last_run: string;
  }>;

  // Cost by group/project
  const byGroup = db.prepare(`
    SELECT st.group_folder,
           COUNT(DISTINCT st.id) as task_count,
           COUNT(trl.task_id) as run_count,
           COALESCE(SUM(trl.cost_usd), 0) as total_cost,
           COALESCE(SUM(trl.input_tokens), 0) as total_input_tokens,
           COALESCE(SUM(trl.output_tokens), 0) as total_output_tokens,
           COALESCE(SUM(trl.duration_ms), 0) as total_duration_ms
    FROM scheduled_tasks st
    LEFT JOIN task_run_logs trl ON trl.task_id = st.id
      AND trl.run_at >= ? AND trl.run_at <= ? || 'T23:59:59'
    GROUP BY st.group_folder
    HAVING run_count > 0
    ORDER BY total_cost DESC
  `).all(fromDate, toDate) as Array<{
    group_folder: string; task_count: number; run_count: number;
    total_cost: number; total_input_tokens: number; total_output_tokens: number;
    total_duration_ms: number;
  }>;

  // Daily cost trend
  const dailyCost = db.prepare(`
    SELECT date(trl.run_at) as day,
           COALESCE(SUM(trl.cost_usd), 0) as cost,
           COUNT(*) as runs,
           COALESCE(SUM(trl.input_tokens), 0) as input_tokens,
           COALESCE(SUM(trl.output_tokens), 0) as output_tokens
    FROM task_run_logs trl
    WHERE trl.run_at >= ? AND trl.run_at <= ? || 'T23:59:59'
    GROUP BY date(trl.run_at)
    ORDER BY day
  `).all(fromDate, toDate) as Array<{
    day: string; cost: number; runs: number; input_tokens: number; output_tokens: number;
  }>;

  // Totals
  const totalCost = byTask.reduce((s, t) => s + t.total_cost, 0);
  const totalRuns = byTask.reduce((s, t) => s + t.run_count, 0);
  const totalInputTokens = byTask.reduce((s, t) => s + t.total_input_tokens, 0);
  const totalOutputTokens = byTask.reduce((s, t) => s + t.total_output_tokens, 0);

  // Group name lookup
  const groups = db.prepare('SELECT folder, name FROM registered_groups').all() as Array<{ folder: string; name: string }>;
  const groupNames: Record<string, string> = {};
  for (const g of groups) groupNames[g.folder] = g.name;

  // Cost by model (from usage_by_session — covers ALL usage, not just scheduled tasks)
  let byModel: Array<{
    model: string; session_count: number; total_cost: number;
    total_input: number; total_output: number; total_cache_read: number; total_cache_write: number;
  }> = [];
  try {
    byModel = db.prepare(`
      SELECT model,
             COUNT(*) as session_count,
             COALESCE(SUM(cost_usd), 0) as total_cost,
             COALESCE(SUM(input_tokens), 0) as total_input,
             COALESCE(SUM(output_tokens), 0) as total_output,
             COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
             COALESCE(SUM(cache_write_tokens), 0) as total_cache_write
      FROM usage_by_session
      WHERE first_timestamp >= ? AND first_timestamp <= ? || 'T23:59:59'
      GROUP BY model
      ORDER BY total_cost DESC
    `).all(fromDate, toDate) as typeof byModel;
  } catch { /* table may not exist yet */ }

  // Overall totals from usage_by_session (all usage, not just tasks)
  let sessionTotals = { cost: 0, sessions: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const st = db.prepare(`
      SELECT COUNT(*) as sessions,
             COALESCE(SUM(cost_usd), 0) as cost,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens
      FROM usage_by_session
      WHERE first_timestamp >= ? AND first_timestamp <= ? || 'T23:59:59'
    `).get(fromDate, toDate) as { sessions: number; cost: number; input_tokens: number; output_tokens: number };
    sessionTotals = { cost: st.cost, sessions: st.sessions, inputTokens: st.input_tokens, outputTokens: st.output_tokens };
  } catch { /* table may not exist yet */ }

  // Cost by group from sessions (includes ad-hoc, not just tasks)
  let byGroupSession: Array<{ group_folder: string; session_count: number; total_cost: number; total_input: number; total_output: number }> = [];
  try {
    byGroupSession = db.prepare(`
      SELECT group_folder, COUNT(*) as session_count,
             COALESCE(SUM(cost_usd), 0) as total_cost,
             COALESCE(SUM(input_tokens), 0) as total_input,
             COALESCE(SUM(output_tokens), 0) as total_output
      FROM usage_by_session
      WHERE first_timestamp >= ? AND first_timestamp <= ? || 'T23:59:59'
      GROUP BY group_folder
      ORDER BY total_cost DESC
    `).all(fromDate, toDate) as typeof byGroupSession;
  } catch { /* table may not exist yet */ }

  // Daily cost from sessions
  let dailyCostSession: Array<{ day: string; cost: number; sessions: number }> = [];
  try {
    dailyCostSession = db.prepare(`
      SELECT date(first_timestamp) as day,
             COALESCE(SUM(cost_usd), 0) as cost,
             COUNT(*) as sessions
      FROM usage_by_session
      WHERE first_timestamp >= ? AND first_timestamp <= ? || 'T23:59:59'
      GROUP BY date(first_timestamp)
      ORDER BY day
    `).all(fromDate, toDate) as typeof dailyCostSession;
  } catch { /* table may not exist yet */ }

  // Actual invoiced amounts from accounting_entries (the real P&L numbers)
  const invoiced = db.prepare(`
    SELECT a.name as account_name, e.account_code,
           COALESCE(SUM(e.amount), 0) as total
    FROM accounting_entries e
    JOIN accounting_accounts a ON e.account_code = a.code
    WHERE e.type = 'expense' AND e.date >= ? AND e.date <= ?
    GROUP BY e.account_code
    ORDER BY total DESC
  `).all(fromDate, toDate) as Array<{ account_name: string; account_code: string; total: number }>;

  const totalInvoiced = invoiced.reduce((s, i) => s + i.total, 0);

  return {
    period, fromDate, toDate,
    // Task-level data (scheduled tasks only)
    taskTotals: { cost: totalCost, runs: totalRuns, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    byTask: byTask.map(t => ({ ...t, prompt: t.prompt.substring(0, 200) })),
    byGroup: byGroup.map(g => ({ ...g, groupName: groupNames[g.group_folder] || g.group_folder })),
    dailyCost,
    // Session-level data (ALL usage including ad-hoc conversations)
    sessionTotals,
    byModel,
    byGroupSession: byGroupSession.map(g => ({ ...g, groupName: groupNames[g.group_folder] || g.group_folder })),
    dailyCostSession,
    groupNames,
    // Actual invoiced costs from P&L (to compare, not double-count)
    invoiced: { total: totalInvoiced, byAccount: invoiced },
  };
}

function getAccountingExport(params: URLSearchParams) {
  const format = params.get('format') || 'csv';
  const period = params.get('period') || 'inception';
  const fromDate = params.get('from') || '2025-01-01';
  const toDate = params.get('to') || new Date().toISOString().slice(0, 10);

  // Reuse getAccounting for date logic
  const data = getAccounting(params);
  const entries = data.entries;

  if (format === 'iif') {
    // QuickBooks IIF format
    let iif = '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO\n';
    iif += '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO\n';
    iif += '!ENDTRNS\n';

    for (const e of entries) {
      const trnsType = e.type === 'revenue' ? 'DEPOSIT' : 'CHECK';
      const dateStr = new Date(e.date).toLocaleDateString('en-US');
      const amt = e.type === 'revenue' ? Math.abs(e.amount) : -Math.abs(e.amount);

      iif += `TRNS\t${trnsType}\t${dateStr}\t${e.account_name}\t${e.vendor || ''}\t${amt.toFixed(2)}\t${e.description}\n`;
      iif += `SPL\t${trnsType}\t${dateStr}\tChecking\t\t${(-amt).toFixed(2)}\t${e.description}\n`;
      iif += 'ENDTRNS\n';
    }
    return { format: 'iif', content: iif, filename: `nanoclaw-accounting-${period}.iif` };
  }

  // CSV (QuickBooks-compatible)
  let csv = 'Date,Transaction Type,Num,Name,Memo/Description,Account,Debit,Credit,Category,Tags\n';
  for (const e of entries) {
    const debit = e.type === 'expense' ? Math.abs(e.amount).toFixed(2) : '';
    const credit = e.type === 'revenue' ? Math.abs(e.amount).toFixed(2) : '';
    csv += `${e.date},${e.type === 'revenue' ? 'Deposit' : 'Expense'},${e.reference || ''},${(e.vendor || '').replace(/,/g, ';')},"${e.description.replace(/"/g, '""')}",${e.account_name},${debit},${credit},${e.category},${e.tags || ''}\n`;
  }
  return { format: 'csv', content: csv, filename: `nanoclaw-accounting-${period}.csv` };
}

async function postAccountingEntry(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { date, description, category, account_code, amount, type, vendor, reference, tags } = body as {
    date: string; description: string; category: string; account_code: string;
    amount: number; type?: string; vendor?: string; reference?: string; tags?: string;
  };

  if (!date || !description || !account_code || amount == null) {
    throw new Error('date, description, account_code, and amount are required');
  }

  // Determine type from account
  const account = db.prepare('SELECT type FROM accounting_accounts WHERE code = ?').get(account_code) as { type: string } | undefined;
  const entryType = type || (account?.type === 'revenue' ? 'revenue' : 'expense');

  const now = new Date().toISOString();
  const result = dbWrite.prepare(`
    INSERT INTO accounting_entries (date, description, category, account_code, amount, type, vendor, reference, source, tags, is_reconciled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 1, ?, ?)
  `).run(date, description, category || account?.type || 'opex', account_code, Math.abs(amount), entryType, vendor || null, reference || null, tags || null, now, now);

  syncAccountingLogToObsidian();
  return { ok: true, id: result.lastInsertRowid };
}

async function postAccountingReceipt(req: http.IncomingMessage) {
  // Simple base64 upload: { entryId, filename, data (base64) }
  const body = JSON.parse(await readBody(req));
  const { entryId, filename, data } = body as { entryId: number; filename: string; data: string };
  if (!entryId || !filename || !data) throw new Error('entryId, filename, and data (base64) required');

  const safeName = `${entryId}-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(RECEIPTS_DIR, safeName);
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'));

  dbWrite.prepare('UPDATE accounting_entries SET receipt_path = ?, updated_at = ? WHERE id = ?')
    .run(safeName, new Date().toISOString(), entryId);

  return { ok: true, receipt: safeName };
}

async function postAccountingDelete(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { id } = body as { id: number };
  if (!id) throw new Error('id required');
  dbWrite.prepare('DELETE FROM accounting_entries WHERE id = ?').run(id);
  syncAccountingLogToObsidian();
  return { ok: true };
}

async function postAccountingReconcile(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { id } = body as { id: number };
  if (!id) throw new Error('id required');
  const entry = db.prepare('SELECT is_reconciled FROM accounting_entries WHERE id = ?').get(id) as { is_reconciled: number } | undefined;
  if (!entry) throw new Error('entry not found');
  const newVal = entry.is_reconciled ? 0 : 1;
  dbWrite.prepare('UPDATE accounting_entries SET is_reconciled = ?, updated_at = ? WHERE id = ?')
    .run(newVal, new Date().toISOString(), id);
  return { ok: true, is_reconciled: newVal };
}

async function postAccountingScanEmail(_req?: http.IncomingMessage) {
  // Scan Gmail for expenses — uses existing Google OAuth
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials not configured');
  }

  // Get access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`,
  });
  const tokenData = await tokenResp.json() as { access_token: string };
  const accessToken = tokenData.access_token;

  // Search for expense-related emails (last 90 days for initial scan)
  const emailAddr = 'assistant@ballastcapitaladvisors.com';
  const query = encodeURIComponent(`to:${emailAddr} (receipt OR invoice OR payment OR charge OR subscription OR billing OR statement OR order) newer_than:90d`);
  const listResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listResp.json() as { messages?: Array<{ id: string }> };

  if (!listData.messages?.length) return { ok: true, found: 0, entries: [] };

  const newEntries: Array<{ date: string; description: string; vendor: string; amount: number; category: string }> = [];

  // Helper: decode Gmail body parts
  const decodeBody = (payload: any): string => {
    if (payload?.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }
    for (const part of (payload?.parts || [])) {
      const r = decodeBody(part);
      if (r) return r;
    }
    return '';
  };

  for (const msg of listData.messages.slice(0, 30)) {
    // Check dedup first before fetching full message
    const existingById = db.prepare('SELECT id FROM accounting_entries WHERE reference = ?').get(msg.id) as { id: number } | undefined;
    if (existingById) continue;

    // Fetch with full body for emails that need it (like Anthropic/Stripe)
    const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const msgData = await msgResp.json() as { payload: any; snippet: string };

    const headers = msgData.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const dateStr = headers.find((h: any) => h.name === 'Date')?.value || '';
    const snippet = msgData.snippet || '';
    const body = decodeBody(msgData.payload);

    // Extract amount — search subject, snippet, and body for dollar amounts
    // Strip HTML tags and normalize whitespace for better matching
    const plainBody = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const searchText = subject + ' ' + snippet + ' ' + plainBody;
    // Look for specific labeled amounts first (most reliable)
    const specificMatch = searchText.match(/(?:Amount paid|Total paid|Total|Amount due|Amount charged|Grand total)[\s:]*\$?\s*([\d,]+\.\d{2})\s*(?:USD)?/i)
      || searchText.match(/(?:Amount paid|Total paid|Total|Amount due|Amount charged|Grand total)[\s:]*([\d,]+\.\d{2})\s*USD/i);
    // Then try "XX.XX USD" pattern (common in international invoices)
    const usdMatch = searchText.match(/([\d,]+\.\d{2})\s*USD/i);
    // Then any $XX.XX
    const dollarMatch = searchText.match(/\$\s*([\d,]+\.\d{2})/);
    const amountMatch = specificMatch || usdMatch || dollarMatch;
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

    // Auto-categorize based on sender, content, and body
    const plainBodyLower = plainBody.toLowerCase();
    const combined = (subject + ' ' + from + ' ' + snippet + ' ' + plainBodyLower.substring(0, 2000)).toLowerCase();
    let accountCode = '6900'; // misc default
    let category = 'opex';
    if (combined.match(/anthropic/) && combined.match(/max plan|subscription|claude pro/i)) {
      accountCode = '5150'; category = 'cogs'; // Anthropic subscription (fixed monthly)
    } else if (combined.match(/anthropic/)) {
      accountCode = '5100'; category = 'cogs'; // Anthropic API usage
    } else if (combined.match(/openrouter/)) {
      accountCode = '5200'; category = 'cogs';
    } else if (combined.match(/x developer|twitter api|x\.com.*api/i)) {
      accountCode = '5250'; category = 'cogs';
    } else if (combined.match(/hosting|server|vps|digitalocean|aws|hetzner|linode|hostinger/)) {
      accountCode = '5300'; category = 'cogs';
    } else if (combined.match(/domain|dns|namecheap|cloudflare/)) {
      accountCode = '5400'; category = 'cogs';
    } else if (combined.match(/github|jetbrains|copilot/)) {
      accountCode = '6110'; category = 'opex';
    } else if (combined.match(/obsidian|notion|productivity/)) {
      accountCode = '6120'; category = 'opex';
    } else if (combined.match(/discord|slack|zoom|communication/)) {
      accountCode = '6130'; category = 'opex';
    } else if (combined.match(/docker|container/)) {
      accountCode = '6210'; category = 'opex';
    } else if (combined.match(/backup|storage|s3/)) {
      accountCode = '6220'; category = 'opex';
    } else if (combined.match(/insurance/)) {
      accountCode = '6700'; category = 'opex';
    } else if (combined.match(/marketing|ads|advertising/)) {
      accountCode = '6400'; category = 'opex';
    } else if (combined.match(/subscription/)) {
      accountCode = '6100'; category = 'opex';
    }

    // Parse date
    let entryDate: string;
    try {
      entryDate = new Date(dateStr).toISOString().slice(0, 10);
    } catch {
      entryDate = new Date().toISOString().slice(0, 10);
    }

    // Vendor from sender — for forwarded emails, try to extract original sender/vendor
    let vendor = '';
    if (subject.toLowerCase().startsWith('fwd:')) {
      // Check body for original "From:" header in forwarded content
      // Use a tighter regex that stops at angle brackets, newlines, or long runs of whitespace
      const fwdFrom = plainBody.match(/From:\s*"?([^"<\n]{1,80})/i) || body.match(/From:\s*"?([^"<\n]{1,80})/i);
      if (fwdFrom) vendor = fwdFrom[1].replace(/["\s]+$/, '').trim();
      // Fallback: detect known vendor names from body content
      if (!vendor || vendor === from || vendor.length > 60) {
        vendor = ''; // reset if extraction was too noisy
        const knownVendors = ['Apple', 'Hostinger', 'Anthropic', 'OpenRouter', 'Stripe', 'DigitalOcean', 'AWS', 'Hetzner', 'GitHub', 'Obsidian', 'Docker', 'Cloudflare', 'Namecheap', 'JetBrains', 'Discord', 'Slack', 'Zoom', 'X Developer', 'Beehiiv', 'Farcaster', 'DeBounce'];
        for (const v of knownVendors) {
          if (combined.includes(v.toLowerCase())) { vendor = v; break; }
        }
      }
    }
    if (!vendor) {
      const vendorMatch = from.match(/^"?([^"<]+)/);
      vendor = vendorMatch ? vendorMatch[1].trim() : from;
    }

    if (amount > 0) {
      // Duplicate detection: skip if an entry with same date, amount, AND similar vendor exists
      // Matches manual entries added before email scan. Different invoice IDs from the same
      // vendor on the same day are legitimate (e.g. two Hostinger payments), so we require
      // vendor similarity — not just date+amount.
      const dupCandidates = db.prepare(
        `SELECT id, description, vendor, reference FROM accounting_entries
         WHERE date = ? AND abs(amount - ?) < 0.01`
      ).all(entryDate, amount) as Array<{ id: number; description: string; vendor: string; reference: string | null }>;
      const vendorLower = vendor.toLowerCase();
      const subjectLower = subject.toLowerCase();
      const dupMatch = dupCandidates.find(c => {
        const cVendor = (c.vendor || '').toLowerCase();
        const cDesc = (c.description || '').toLowerCase();
        // Match if vendors overlap or description contains vendor name (or vice versa)
        return cVendor.includes(vendorLower) || vendorLower.includes(cVendor)
          || cDesc.includes(vendorLower) || subjectLower.includes(cVendor);
      });
      if (dupMatch) {
        // If the existing entry has no email reference, attach this one
        if (!dupMatch.reference) {
          dbWrite.prepare('UPDATE accounting_entries SET reference = ?, updated_at = ? WHERE id = ?')
            .run(msg.id, new Date().toISOString(), dupMatch.id);
        }
        continue;
      }

      const now = new Date().toISOString();
      // Truncate vendor to prevent email body leaking into vendor field
      const cleanVendor = vendor.substring(0, 100);
      dbWrite.prepare(`
        INSERT INTO accounting_entries (date, description, category, account_code, amount, type, vendor, reference, source, tags, is_reconciled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'expense', ?, ?, 'email', ?, 0, ?, ?)
      `).run(entryDate, subject.substring(0, 200), category, accountCode, amount, cleanVendor, msg.id, 'auto-categorized', now, now);

      newEntries.push({ date: entryDate, description: subject, vendor: cleanVendor, amount, category });
    }
  }

  // Sync Obsidian Accounting-Log.md from DB (single source of truth)
  syncAccountingLogToObsidian();

  return { ok: true, found: listData.messages.length, entries: newEntries };
}

function syncAccountingLogToObsidian(): void {
  try {
    const entries = db.prepare(
      'SELECT date, vendor, description, amount, category, account_code, reference FROM accounting_entries ORDER BY date, id'
    ).all() as Array<{ date: string; vendor: string; description: string; amount: number; category: string; account_code: string; reference: string }>;

    const lines = [
      '# Accounting Log',
      '',
      'Auto-synced from NanoClaw accounting database. Do not edit manually.',
      '',
      '| Date | Vendor | Description | Amount | Category | Account | Email ID |',
      '|------|--------|-------------|--------|----------|---------|----------|',
    ];
    for (const e of entries) {
      const desc = e.description.replace(/\|/g, '\\|').substring(0, 80);
      const vendor = (e.vendor || '').replace(/\|/g, '\\|').substring(0, 60);
      lines.push(`| ${e.date} | ${vendor} | ${desc} | $${e.amount.toFixed(2)} | ${e.category} | ${e.account_code} | ${e.reference} |`);
    }
    lines.push('');

    const logPath = path.join(OBSIDIAN_VAULT, 'Memory', 'Accounting-Log.md');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, lines.join('\n'));
  } catch (err) {
    console.error('[dashboard] Failed to sync Accounting-Log.md:', err);
  }
}

// --- Drive Inbox Monitor ---

const DRIVE_INBOX_CONFIG_PATH = path.join(PROJECT_ROOT, 'data', 'drive-inbox-config.json');
const DRIVE_INBOX_STATE_PATH = path.join(PROJECT_ROOT, 'data', 'drive-inbox-state.json');

// Map subfolder names to group folders and Discord channel JIDs
const DRIVE_INBOX_ROUTING: Record<string, { groupFolder: string; chatJid: string }> = {
  'health-wellness': { groupFolder: 'health-wellness', chatJid: 'dc:1476293450402889949' },
  'ai-research': { groupFolder: 'ai-research', chatJid: 'dc:1476293323860869251' },
  'business-ideas': { groupFolder: 'business-ideas', chatJid: 'dc:1476293406375542876' },
  'trading': { groupFolder: 'trading', chatJid: 'dc:1477676119007297678' },
  'crypto': { groupFolder: 'crypto', chatJid: 'dc:1477831148825477161' },
  'general': { groupFolder: 'main', chatJid: 'dc:1474853349676286145' },
};

interface DriveInboxState {
  processedFileIds: string[];
  lastCheck: string;
}

function loadDriveInboxState(): DriveInboxState {
  try {
    return JSON.parse(fs.readFileSync(DRIVE_INBOX_STATE_PATH, 'utf-8'));
  } catch {
    return { processedFileIds: [], lastCheck: new Date(0).toISOString() };
  }
}

function saveDriveInboxState(state: DriveInboxState): void {
  fs.writeFileSync(DRIVE_INBOX_STATE_PATH, JSON.stringify(state, null, 2));
}

async function scanDriveInbox(): Promise<{ found: number; processed: string[] }> {
  let config: Record<string, string>;
  try {
    config = JSON.parse(fs.readFileSync(DRIVE_INBOX_CONFIG_PATH, 'utf-8'));
  } catch {
    return { found: 0, processed: [] };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return { found: 0, processed: [] };

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`,
  });
  const tokenData = await tokenResp.json() as { access_token: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) return { found: 0, processed: [] };

  const state = loadDriveInboxState();
  const processedSet = new Set(state.processedFileIds);
  const newlyProcessed: string[] = [];

  // Scan each subfolder
  for (const [subfolderName, folderId] of Object.entries(config)) {
    if (subfolderName === '_root') continue;
    const routing = DRIVE_INBOX_ROUTING[subfolderName];
    if (!routing) continue;

    // List files in this subfolder
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const listResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,createdTime)&orderBy=createdTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listResp.json() as { files?: Array<{ id: string; name: string; mimeType: string; size: string; createdTime: string }> };

    for (const file of (listData.files || [])) {
      if (processedSet.has(file.id)) continue;

      // Download file
      const uploadsDir = path.join(PROJECT_ROOT, 'groups', routing.groupFolder, 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });

      // For Google Docs/Sheets/Slides, export as PDF; otherwise download directly
      const isGoogleDoc = file.mimeType.startsWith('application/vnd.google-apps.');
      let downloadUrl: string;
      let fileName = file.name;

      if (isGoogleDoc) {
        const exportMime = 'application/pdf';
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`;
        if (!fileName.endsWith('.pdf')) fileName += '.pdf';
      } else {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      }

      try {
        const fileResp = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!fileResp.ok) {
          console.error(`[drive-inbox] Failed to download ${file.name}: ${fileResp.status}`);
          continue;
        }

        const buffer = Buffer.from(await fileResp.arrayBuffer());
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(uploadsDir, safeName);
        fs.writeFileSync(filePath, buffer);

        console.log(`[drive-inbox] Downloaded ${file.name} (${buffer.length} bytes) → ${routing.groupFolder}/uploads/`);

        // Inject message into DB to trigger agent processing
        const msgId = `drive-inbox-${file.id}`;
        const timestamp = new Date().toISOString();
        const content = `New file uploaded to Drive Inbox (${subfolderName}): **${file.name}** (${(parseInt(file.size || '0') / 1024).toFixed(0)}KB). File saved to uploads/${safeName}. Please analyze and process this file.`;

        dbWrite.prepare(`
          INSERT OR IGNORE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message)
          VALUES (?, ?, 'drive-inbox', 'Drive Inbox', ?, ?, 0, 0)
        `).run(msgId, routing.chatJid, content, timestamp);

        processedSet.add(file.id);
        newlyProcessed.push(`${subfolderName}/${file.name}`);
      } catch (err) {
        console.error(`[drive-inbox] Error processing ${file.name}:`, err);
      }
    }
  }

  // Also scan root inbox folder for unsorted files → route to main
  const rootId = config._root;
  if (rootId) {
    const query = encodeURIComponent(`'${rootId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
    const listResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,createdTime)&orderBy=createdTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listResp.json() as { files?: Array<{ id: string; name: string; mimeType: string; size: string; createdTime: string }> };

    for (const file of (listData.files || [])) {
      if (processedSet.has(file.id)) continue;

      const uploadsDir = path.join(PROJECT_ROOT, 'groups', 'main', 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });

      const isGoogleDoc = file.mimeType.startsWith('application/vnd.google-apps.');
      let downloadUrl: string;
      let fileName = file.name;

      if (isGoogleDoc) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent('application/pdf')}`;
        if (!fileName.endsWith('.pdf')) fileName += '.pdf';
      } else {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      }

      try {
        const fileResp = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!fileResp.ok) continue;

        const buffer = Buffer.from(await fileResp.arrayBuffer());
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        fs.writeFileSync(path.join(uploadsDir, safeName), buffer);

        console.log(`[drive-inbox] Downloaded ${file.name} (${buffer.length} bytes) → main/uploads/ (unsorted)`);

        const msgId = `drive-inbox-${file.id}`;
        const timestamp = new Date().toISOString();
        const content = `New file uploaded to Drive Inbox (unsorted): **${file.name}** (${(parseInt(file.size || '0') / 1024).toFixed(0)}KB). File saved to uploads/${safeName}. Please analyze and process this file.`;

        dbWrite.prepare(`
          INSERT OR IGNORE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message)
          VALUES (?, ?, 'drive-inbox', 'Drive Inbox', ?, ?, 0, 0)
        `).run(msgId, 'dc:1474853349676286145', content, timestamp);

        processedSet.add(file.id);
        newlyProcessed.push(`inbox/${file.name}`);
      } catch (err) {
        console.error(`[drive-inbox] Error processing ${file.name}:`, err);
      }
    }
  }

  state.processedFileIds = [...processedSet];
  state.lastCheck = new Date().toISOString();
  saveDriveInboxState(state);

  return { found: newlyProcessed.length, processed: newlyProcessed };
}

// --- Nutrition Tracker ---

const NUTRITION_TRACKER_PATH = path.join(OBSIDIAN_VAULT, 'Health', 'Nutrition-Tracker.md');

function getNutrition() {
  try {
    // Auto-reset if the date rolled over
    maybeResetNutrition();

    const content = fs.readFileSync(NUTRITION_TRACKER_PATH, 'utf-8');
    const lines = content.split('\n');
    // Compute boundary index for today's section (before Historical Logs)
    const _histIdx = lines.findIndex(l => l.startsWith('## Historical'));
    const todayLines = _histIdx >= 0 ? lines.slice(0, _histIdx) : lines;

    // Extract date
    const dateLine = todayLines.find(l => l.startsWith('### Date:'));
    const date = dateLine ? dateLine.replace('### Date:', '').trim() : new Date().toLocaleDateString('en-CA', { timeZone: TZ });

    // Extract diet framework
    const dietLine = todayLines.find(l => l.includes('Diet Framework'));
    const dietFramework = dietLine ? dietLine.replace(/.*?Framework\*\*:\s*/, '').trim() : 'Moderate-Carb High-Protein';

    // Parse meals from Today's Log table
    const meals: Array<{ meal: string; time: string; foods: string; cals: string; protein: string; fat: string; carbs: string }> = [];
    let inMealsTable = false;
    let mealsHeaderPassed = false;
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes("Today's Log") || line.includes('### Date:')) { inMealsTable = true; continue; }
      if (inMealsTable && line.startsWith('|') && (line.includes('Meal') || line.includes('---'))) { mealsHeaderPassed = true; continue; }
      if (inMealsTable && mealsHeaderPassed && line.startsWith('|')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length >= 7) {
          meals.push({
            meal: cols[0], time: cols[1], foods: cols[2],
            cals: cols[3], protein: cols[4], fat: cols[5], carbs: cols[6]
          });
        }
      }
      if (inMealsTable && mealsHeaderPassed && !line.startsWith('|') && line.trim() !== '') { inMealsTable = false; }
    }

    // Fallback: synthesize meal data from ingredient detail sections for "Not logged yet" meals
    for (const meal of meals) {
      if (!meal.foods.includes('Not logged yet')) continue;
      // Map summary meal names to detail section header patterns
      const mealPatterns: Record<string, RegExp> = {
        'Breakfast': /^####\s+Breakfast\b/i,
        'Smoothie': /^####\s+Smoothie\b/i,
        'Lunch': /^####\s+Lunch\b/i,
        'Dinner': /^####\s+Dinner\b/i,
        'Snacks': /^####\s+Snack\b/i,
        'Snack': /^####\s+Snack\b/i,
        'Beverage': /^####\s+Beverage\b/i,
      };
      const pattern = mealPatterns[meal.meal];
      if (!pattern) continue;
      // Find the detail section header (today's section only)
      const histBound = _histIdx >= 0 ? _histIdx : lines.length;
      const headerIdx = lines.findIndex((l, idx) => idx < histBound && pattern.test(l.trim()));
      if (headerIdx < 0) continue;
      // Extract time from header like "#### Lunch (~2:30 PM)"
      const timeMatch = lines[headerIdx].match(/\(~?([\d:]+\s*[AP]M)\)/i);
      if (timeMatch) meal.time = '~' + timeMatch[1];
      // Find the totals row in this section (bold meal name + "totals")
      const foodNames: string[] = [];
      for (let i = headerIdx + 1; i < Math.min(lines.length, histBound) && i < headerIdx + 30; i++) {
        const line = lines[i];
        // Stop at next section header or blank line after content
        if (/^#{1,4}\s/.test(line) && i > headerIdx + 1) break;
        if (!line.startsWith('|')) continue;
        if (line.includes('---') || line.includes('Ingredient')) continue;
        // Keep empty columns for positional indexing (table has 13 cols)
        const rawCols = line.split('|').map(c => c.trim());
        // rawCols[0] and rawCols[last] are empty from leading/trailing |
        // Columns: [1]=Ingredient [2]=Amount [3]=Brand [4]=Organic [5]=GMO [6]=Origin [7]=Cals [8]=Protein [9]=Fat [10]=Carbs [11]=Na [12]=K [13]=Mg
        if (rawCols.length < 8) continue;
        if (rawCols[1]?.includes('---') || rawCols[1]?.includes('Ingredient')) continue;
        // Check if this is the totals row
        if (rawCols[1]?.toLowerCase().includes('total')) {
          meal.cals = rawCols[7]?.replace(/\*\*/g, '') || '—';
          meal.protein = rawCols[8]?.replace(/\*\*/g, '') || '—';
          meal.fat = rawCols[9]?.replace(/\*\*/g, '') || '—';
          meal.carbs = rawCols[10]?.replace(/\*\*/g, '') || '—';
          meal.foods = foodNames.join(', ');
          break;
        } else if (rawCols[1]) {
          // Ingredient row — collect the name
          foodNames.push(rawCols[1].replace(/\*\*/g, ''));
        }
      }
    }

    // Parse daily totals line
    const totalsLine = todayLines.find(l => l.startsWith('**Daily Totals**'));
    const macroLine = todayLines.find(l => l.startsWith('**Macro Split**'));
    const totals: Record<string, string> = {};
    if (totalsLine) {
      const parts = totalsLine.replace(/\*\*/g, '').replace('Daily Totals:', '').trim().split('|').map(s => s.trim());
      for (const part of parts) {
        if (part.includes('cal')) totals.cals = part;
        if (part.includes('protein')) totals.protein = part;
        if (part.includes('fat') && !part.includes('%')) totals.fat = part;
        if (part.includes('carb')) totals.carbs = part;
      }
    }
    if (macroLine) totals.macroSplit = macroLine.replace(/\*\*/g, '').replace('Macro Split:', '').trim();

    // Parse scores from Scoring Dashboard
    const scores: Array<{ domain: string; score: string; status: string }> = [];
    let inScores = false;
    let scoresHeaderPassed = false;
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes("Today's Scores")) { inScores = true; continue; }
      if (inScores && line.startsWith('|') && (line.includes('Domain') || line.includes('---'))) { scoresHeaderPassed = true; continue; }
      if (inScores && scoresHeaderPassed && line.startsWith('|')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length >= 3) {
          scores.push({ domain: cols[0].replace(/\*\*/g, ''), score: cols[1], status: cols[2] });
        }
      }
      if (inScores && scoresHeaderPassed && !line.startsWith('|') && line.trim() !== '') { inScores = false; }
    }

    // Parse superfoods
    const superfoods: Array<{ food: string; benefit: string; frequency: string; checked: boolean }> = [];
    let inSuperfoods = false;
    let sfHeaderPassed = false;
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes('Superfoods (Prioritize')) { inSuperfoods = true; continue; }
      if (inSuperfoods && line.startsWith('|') && (line.includes('Food') || line.includes('---'))) { sfHeaderPassed = true; continue; }
      if (inSuperfoods && sfHeaderPassed && line.startsWith('|')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length >= 4) {
          superfoods.push({
            food: cols[0].replace(/\*\*/g, ''),
            benefit: cols[1],
            frequency: cols[2],
            checked: cols[3].includes('x') || cols[3].includes('X')
          });
        }
      }
      if (inSuperfoods && sfHeaderPassed && !line.startsWith('|') && line.trim() !== '') { inSuperfoods = false; }
    }

    // Parse avoid foods
    const avoidFoods: Array<{ food: string; reason: string; severity: string }> = [];
    let inAvoid = false;
    let avoidHeaderPassed = false;
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes('Foods to AVOID')) { inAvoid = true; continue; }
      if (inAvoid && line.startsWith('|') && (line.includes('Food') || line.includes('---'))) { avoidHeaderPassed = true; continue; }
      if (inAvoid && avoidHeaderPassed && line.startsWith('|')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length >= 3) {
          avoidFoods.push({
            food: cols[0].replace(/\*\*/g, ''),
            reason: cols[1],
            severity: cols[2]
          });
        }
      }
      if (inAvoid && avoidHeaderPassed && !line.startsWith('|') && line.trim() !== '') { inAvoid = false; }
    }

    // Parse daily targets
    const targets: Array<{ metric: string; target: string; why: string }> = [];
    let inTargets = false;
    let targetsHeaderPassed = false;
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes('## Daily Targets')) { inTargets = true; continue; }
      if (inTargets && line.startsWith('|') && (line.includes('Metric') || line.includes('---'))) { targetsHeaderPassed = true; continue; }
      if (inTargets && targetsHeaderPassed && line.startsWith('|')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length >= 3) {
          targets.push({ metric: cols[0].replace(/\*\*/g, ''), target: cols[1], why: cols[2] });
        }
      }
      if (inTargets && targetsHeaderPassed && !line.startsWith('|') && line.trim() !== '') { inTargets = false; }
    }

    // Parse protocol checklist
    const checklist: Array<{ text: string; checked: boolean }> = [];
    let inChecklist = false;
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes('## Protocol Compliance Checklist')) { inChecklist = true; continue; }
      if (inChecklist && line.startsWith('## ') && !line.includes('Protocol')) { inChecklist = false; continue; }
      if (inChecklist) {
        const checkMatch = line.match(/^- \[([ xX])\] (.+)/);
        if (checkMatch) {
          checklist.push({ text: checkMatch[2].replace(/\*\*/g, '').trim(), checked: checkMatch[1] !== ' ' });
        }
      }
    }

    // Generate weekly trends from history snapshots (today uses live actuals parsed below)
    // Placeholder — filled after actuals are parsed
    const _weeklyHistory = loadNutritionHistory();
    const _weeklyDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const _weeklyDates: string[] = [];
    {
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const dd = new Date(now); dd.setDate(dd.getDate() - i);
        _weeklyDates.push(dd.toLocaleDateString('en-CA', { timeZone: TZ }));
      }
    }
    function _extractOverallGrade(scoresList: Array<{ domain: string; score: string; status: string }>): string {
      const og = scoresList.find(s => s.domain === 'Overall Grade');
      if (!og) return '—';
      const raw = String(og.score).replace(/\*/g, '').trim();
      if (!raw || raw === '—' || raw === '—/10') return '—';
      const m = raw.match(/([\d.]+)\s*\/\s*10/);
      return m ? `${m[1]}/10` : '—';
    }

    function _buildWeeklyRow(a: Record<string, string>, sfs: Array<{ checked: boolean }>, dateStr: string, scoresList?: Array<{ domain: string; score: string; status: string }>): { cals: string; protein: string; fat: string; carbs: string; sfCount: string; grade: string; date: string; day: string } {
      const dayIdx = new Date(dateStr + 'T12:00:00').getDay();
      const cals = parseFloat(String(a.Calories || '0').replace(/[^0-9.]/g, ''));
      const protein = parseFloat(String(a.Protein || '0').replace(/[^0-9.]/g, ''));
      const fat = parseFloat(String(a.Fat || '0').replace(/[^0-9.]/g, ''));
      const carbs = parseFloat(String(a['Net Carbs'] || '0').replace(/[^0-9.]/g, ''));
      const sfChecked = sfs.filter(s => s.checked).length;
      const sfTotal = sfs.length;
      const sfCount = sfTotal > 0 ? `${sfChecked}/${sfTotal}` : '—';
      const grade = scoresList ? _extractOverallGrade(scoresList) : '—';
      return {
        day: _weeklyDayNames[dayIdx], date: dateStr,
        cals: cals > 0 ? String(Math.round(cals)) : '—',
        protein: protein > 0 ? Math.round(protein) + 'g' : '—',
        fat: fat > 0 ? Math.round(fat) + 'g' : '—',
        carbs: carbs > 0 ? Math.round(carbs) + 'g' : '—',
        sfCount, grade: cals > 0 ? grade : '—',
      };
    }

    // Parse actuals from daily totals line and hydration
    const actuals: Record<string, string> = {};
    const totalsRaw = todayLines.find(l => l.startsWith('**Daily Totals**'));
    if (totalsRaw) {
      const calMatch = totalsRaw.match(/([\d,.]+)\s*cals?/i);
      if (calMatch) actuals['Calories'] = calMatch[1];
      const protMatch = totalsRaw.match(/([\d,.]+)g?\s*protein/i);
      if (protMatch) actuals['Protein'] = protMatch[1] + 'g';
      const fatMatch = totalsRaw.match(/([\d,.]+)g?\s*fat/i);
      if (fatMatch) actuals['Fat'] = fatMatch[1] + 'g';
      const carbMatch = totalsRaw.match(/([\d,.]+)g?\s*net\s*carbs?/i);
      if (carbMatch) actuals['Net Carbs'] = carbMatch[1] + 'g';
      const fiberMatch = totalsRaw.match(/([\d,.]+)g?\s*fiber/i);
      if (fiberMatch) actuals['Fiber'] = fiberMatch[1] + 'g';
    }
    // Parse micro totals line: "**Micro Totals**: ~1190mg sodium | ~1360mg potassium | ~154mg magnesium"
    const microRaw = todayLines.find(l => l.startsWith('**Micro Totals**'));
    if (microRaw) {
      const sodMatch = microRaw.match(/~?([\d,.]+)\s*mg\s*sodium/i);
      if (sodMatch) actuals['Sodium'] = sodMatch[1] + 'mg';
      const potMatch = microRaw.match(/~?([\d,.]+)\s*mg\s*potassium/i);
      if (potMatch) actuals['Potassium'] = potMatch[1] + 'mg';
      const mgMatch = microRaw.match(/~?([\d,.]+)\s*mg\s*magnesium/i);
      if (mgMatch) actuals['Magnesium'] = mgMatch[1] + 'mg';
    }
    const hydrationLine = todayLines.find(l => l.startsWith('**Hydration**'));
    if (hydrationLine) {
      const hydMatch = hydrationLine.match(/([\d,.]+)\s*oz/i);
      if (hydMatch) actuals['Water'] = hydMatch[1] + ' oz';
    }

    // Parse supplement-derived actuals from "Key nutrient tracking" bullet lines
    // Format: "- MetricName: ~Xunit ..." — extract the first number+unit after the colon
    const nutrientMap: Array<{ key: string; pattern: RegExp; unit: string }> = [
      { key: 'EPA+DHA', pattern: /EPA\+DHA:\s*~?([\d,.]+)\s*g/i, unit: 'g' },
      { key: 'Sodium', pattern: /Sodium:\s*~?([\d,.]+)\s*mg/i, unit: 'mg' },
      { key: 'Potassium', pattern: /Potassium:\s*~?([\d,.]+)\s*mg/i, unit: 'mg' },
      { key: 'Magnesium', pattern: /Magnesium:\s*~?([\d,.]+)\s*mg/i, unit: 'mg' },
    ];
    for (const line of lines) {
      if (line.startsWith('## Historical')) break; // Don't scan past historical logs
      if (!line.startsWith('- ')) continue;
      for (const nm of nutrientMap) {
        const m = line.match(nm.pattern);
        if (m) actuals[nm.key] = m[1] + nm.unit;
      }
    }

    // If EPA+DHA not found from bullet lines, extract from Supplements table
    // Format: "| Fish Oil (Omega-3) | ... | EPA 690mg, DHA 260mg ..." or similar
    // Scope to today's section only (stop before Historical Logs)
    if (!actuals['EPA+DHA']) {
      let totalEpaDhaMg = 0;
      let inSupplements = false;
      for (const line of lines) {
        if (line.startsWith('## Historical')) break; // Don't scan past historical logs
        if (line.includes('Supplements Taken')) { inSupplements = true; continue; }
        if (!inSupplements) continue;
        if (!line.startsWith('|')) { if (line.startsWith('#') || line.startsWith('---')) inSupplements = false; continue; }
        // Match EPA Xmg and/or DHA Xmg anywhere in a table row
        const epaMatch = line.match(/EPA\s+([\d,.]+)\s*mg/i) || line.match(/([\d,.]+)\s*mg\s*EPA/i);
        const dhaMatch = line.match(/DHA\s+([\d,.]+)\s*mg/i) || line.match(/([\d,.]+)\s*mg\s*DHA/i);
        if (epaMatch) totalEpaDhaMg += parseFloat(epaMatch[1].replace(/,/g, ''));
        if (dhaMatch) totalEpaDhaMg += parseFloat(dhaMatch[1].replace(/,/g, ''));
      }
      if (totalEpaDhaMg > 0) {
        const grams = (totalEpaDhaMg / 1000).toFixed(2).replace(/\.?0+$/, '');
        actuals['EPA+DHA'] = grams + 'g';
      }
    }

    // Parse food quality line: "**Food Quality**: 2/12 organic | 0 wild-caught | 10 conventional"
    const qualityLine = todayLines.find(l => l.startsWith('**Food Quality**'));
    const foodQuality: Record<string, string> = {};
    if (qualityLine) {
      const orgRatioMatch = qualityLine.match(/([\d]+\/[\d]+)\s*organic/i);
      const orgCountMatch = !orgRatioMatch ? qualityLine.match(/([\d]+)\s*organic/i) : null;
      if (orgRatioMatch) foodQuality.organic = orgRatioMatch[1];
      else if (orgCountMatch) foodQuality.organic = orgCountMatch[1];
      const gmoRatioMatch = qualityLine.match(/([\d]+\/[\d]+)\s*non[- ]?GMO/i);
      const gmoCountMatch = !gmoRatioMatch ? qualityLine.match(/([\d]+)\s*non[- ]?GMO/i) : null;
      if (gmoRatioMatch) foodQuality.nonGMO = gmoRatioMatch[1];
      else if (gmoCountMatch) foodQuality.nonGMO = gmoCountMatch[1];
      const wildMatch = qualityLine.match(/([\d]+)\s*wild[- ]caught/i);
      if (wildMatch) foodQuality.wildCaught = wildMatch[1];
      const convMatch = qualityLine.match(/([\d]+)\s*conventional/i);
      if (convMatch) foodQuality.conventional = convMatch[1];
      const unkGmoMatch = qualityLine.match(/([\d]+)\s*unknown[- ]?GMO/i);
      if (unkGmoMatch) foodQuality.unknownGMO = unkGmoMatch[1];
    }

    // Parse ingredient detail tables (stop before Historical Logs)
    const ingredients: Array<{ meal: string; items: Array<Record<string, string>> }> = [];
    let currentMeal = '';
    let inIngTable = false;
    let ingHeaders: string[] = [];
    const ingDetailStart = lines.findIndex(l => l.includes('Ingredient Detail Log'));
    for (let li = ingDetailStart >= 0 ? ingDetailStart : 0; li < lines.length; li++) {
      const line = lines[li];
      if (line.startsWith('## Historical')) break; // Don't scan past historical logs
      if (line.startsWith('#### ')) {
        currentMeal = line.replace('####', '').trim();
        inIngTable = false;
        ingredients.push({ meal: currentMeal, items: [] });
        continue;
      }
      if (currentMeal && line.startsWith('|') && !inIngTable && line.includes('Ingredient')) {
        ingHeaders = line.split('|').map(c => c.trim()).filter(c => c);
        inIngTable = true;
        continue;
      }
      if (inIngTable && line.startsWith('|') && line.includes('---')) continue;
      if (inIngTable && line.startsWith('|') && !line.match(/\*\*[^*]*totals?\*\*/i)) {
        const cols = line.split('|').map(c => c.trim().replace(/\*\*/g, '')).filter(c => c);
        const item: Record<string, string> = {};
        ingHeaders.forEach((h, i) => { if (cols[i]) item[h] = cols[i]; });
        ingredients[ingredients.length - 1]?.items.push(item);
      }
      if (inIngTable && !line.startsWith('|') && line.trim() !== '') { inIngTable = false; }
    }

    // Fallback: if no Food Quality summary line, compute from ingredient tables
    if (!qualityLine && ingredients.length > 0) {
      let organic = 0, nonGMO = 0, wildCaught = 0, conventional = 0, total = 0;
      for (const meal of ingredients) {
        for (const item of meal.items) {
          total++;
          const orgVal = (item['Organic'] || '').toLowerCase();
          const gmoVal = (item['GMO'] || '').toLowerCase();
          const originVal = (item['Origin'] || '').toLowerCase();
          const notesVal = (item['Notes'] || '').toLowerCase();
          const isWild = originVal.includes('wild') || notesVal.includes('wild-caught') || notesVal.includes('wild caught');
          if (isWild) wildCaught++;
          if (orgVal.includes('organic') && !orgVal.includes('non-organic')) organic++;
          else if (!isWild && orgVal !== 'n/a' && orgVal !== '') conventional++;
          if (gmoVal.includes('non-gmo') || gmoVal.includes('non gmo')) nonGMO++;
        }
      }
      if (total > 0) {
        foodQuality.organic = `${organic}/${total}`;
        if (nonGMO > 0) foodQuality.nonGMO = `${nonGMO}/${total}`;
        if (wildCaught > 0) foodQuality.wildCaught = String(wildCaught);
        foodQuality.conventional = String(conventional);
      }
    }

    // Parse recommended alternatives table
    const alternatives: Array<Record<string, string>> = [];
    let inAltTable = false;
    let altHeaders: string[] = [];
    for (const line of lines) {
      if (line.startsWith('## Historical')) break;
      if (line.includes('Recommended Alternatives') && line.startsWith('#')) { inAltTable = true; continue; }
      if (inAltTable && line.startsWith('|') && (line.includes('Current Item') || line.includes('Issue'))) {
        altHeaders = line.split('|').map(c => c.trim()).filter(c => c);
        continue;
      }
      if (inAltTable && line.startsWith('|') && line.includes('---')) continue;
      if (inAltTable && line.startsWith('|') && altHeaders.length) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        const item: Record<string, string> = {};
        altHeaders.forEach((h, i) => { if (cols[i]) item[h] = cols[i]; });
        if (item['Current Item']) alternatives.push(item);
      }
      if (inAltTable && !line.startsWith('|') && line.trim() !== '') { inAltTable = false; }
    }

    // Load nutrition prices cache and attach to alternatives
    const pricesData = getNutritionPrices();
    const prices = pricesData?.items || {};
    // Fuzzy match price cache keys to alternative names (handles slight naming differences)
    const priceKeys = Object.keys(prices);
    const findPrice = (name: string) => {
      if (!name) return null;
      if (prices[name]) return prices[name];
      const lower = name.toLowerCase();
      const match = priceKeys.find(k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
      return match ? prices[match] : null;
    };
    const alternativesWithPrices = alternatives.map(a => {
      const altName = a['Recommended Alternative'] || '';
      return { ...a, prices: findPrice(altName) };
    });

    // Auto-check protocol items based on actual data
    const allFoods = meals.map(m => (m.foods || '').toLowerCase()).join(' ');

    // Auto-check superfoods detected in today's meals
    const sfMatchers: Record<string, string[]> = {
      'garlic': ['garlic'],
      'olive oil': ['olive oil', 'evoo'],
      'blueberries': ['blueberr'],
      'broccoli': ['broccoli'],
      'coffee': ['coffee', 'espresso', 'latte', 'cappuccino', 'americano'],
      'matcha': ['matcha'],
      'ginger': ['ginger'],
      'apple cider vinegar': ['acv', 'apple cider vinegar'],
      'grapes': ['grape', 'grapes'],
      'pumpkin seeds': ['pumpkin seed', 'pepitas'],
      'mackerel': ['mackerel'],
      'cotija': ['cotija'],
      'goat milk': ['goat milk', 'kefir'],
      'grape seed oil': ['grape seed oil', 'grapeseed oil'],
      'papaya': ['papaya'],
      'peanuts': ['peanut', 'pistachio'],
      'pistachios': ['pistachio'],
      'flax': ['flax'],
      'banana': ['banana'],
      'avocado': ['avocado', 'guacamole'],
      'eggs': ['egg', 'eggs'],
      'bone broth': ['bone broth'],
      'sea bass': ['sea bass'],
    };
    for (const sf of superfoods) {
      if (sf.checked) continue; // don't uncheck manually checked items
      const sfLower = sf.food.toLowerCase();
      // Check explicit matchers first
      let matched = false;
      for (const [key, terms] of Object.entries(sfMatchers)) {
        if (sfLower.includes(key)) {
          matched = terms.some(t => allFoods.includes(t));
          if (matched) break;
        }
      }
      // Fallback: check if any word in the superfood name appears in meals
      if (!matched) {
        const words = sfLower.split(/[\/,]/).map(w => w.trim()).filter(w => w.length > 3);
        matched = words.some(w => allFoods.includes(w));
      }
      if (matched) sf.checked = true;
    }

    const checkedSfCount = superfoods.filter(s => s.checked).length;
    const parseNum = (v: string | undefined) => v ? parseFloat(v.replace(/[^0-9.]/g, '')) : 0;
    const proteinVal = parseNum(actuals['Protein']);
    const fiberVal = parseNum(actuals['Fiber']);
    const epaVal = parseNum(actuals['EPA+DHA']);
    const waterVal = parseNum(actuals['Water']);
    const hasMeals = meals.some(m => m.foods && !m.foods.includes('Not logged'));

    // Only auto-check POSITIVE accomplishments (things confirmed done).
    // Never auto-check avoidance rules (no red meat, no egg yolks, etc.) — those
    // can only be confirmed at end of day.
    const autoChecks: Record<string, () => boolean> = {
      'supplement stack taken (am batch)': () => allFoods.includes('creatine') || allFoods.includes('organ') || allFoods.includes('supplement'),
      'acv 1-2 tbsp': () => allFoods.includes('acv') || allFoods.includes('apple cider'),
      'coffee or matcha': () => allFoods.includes('coffee') || allFoods.includes('matcha'),
      'at least 3 viome superfoods consumed': () => checkedSfCount >= 3,
      'garlic used in cooking': () => allFoods.includes('garlic'),
      'olive oil or grape seed oil used': () => allFoods.includes('olive oil') || allFoods.includes('evoo') || allFoods.includes('grape seed'),
      'protein target hit': () => proteinVal >= 120,
      'fiber target hit': () => fiberVal >= 25,
      'omega-3 from food + supplements': () => epaVal >= 2,
      '80-100oz water total': () => waterVal >= 80,
      'electrolytes adequate': () => parseNum(actuals['Sodium']) >= 1500 && parseNum(actuals['Potassium']) >= 2600,
    };

    for (const item of checklist) {
      if (item.checked) continue; // don't uncheck manually checked items
      const textLower = item.text.toLowerCase();
      for (const [pattern, check] of Object.entries(autoChecks)) {
        if (textLower.includes(pattern)) {
          item.checked = check();
          break;
        }
      }
    }

    // Build weekly trends (now that actuals + superfoods are available)
    const weeklyTrends: Array<{ day: string; date: string; cals: string; protein: string; fat: string; carbs: string; sfCount: string; grade: string }> = [];
    for (const dateStr of _weeklyDates) {
      if (dateStr === date) {
        // Today — use live actuals + live scores
        weeklyTrends.push(_buildWeeklyRow(actuals, superfoods, dateStr, scores));
      } else {
        const entry = _weeklyHistory.find(h => h.date === dateStr);
        if (entry?.actuals) {
          weeklyTrends.push(_buildWeeklyRow(entry.actuals, entry.superfoods || [], dateStr, entry.scores || []));
        } else {
          const dayIdx = new Date(dateStr + 'T12:00:00').getDay();
          weeklyTrends.push({ day: _weeklyDayNames[dayIdx], date: dateStr, cals: '—', protein: '—', fat: '—', carbs: '—', sfCount: '—', grade: '—' });
        }
      }
    }

    return {
      date, dietFramework, meals, totals, scores,
      superfoods, avoidFoods, targets, checklist, weeklyTrends, actuals,
      foodQuality, ingredients, alternatives: alternativesWithPrices,
      pricesLastUpdated: pricesData?.lastUpdated || null
    };
  } catch {
    return null;
  }
}

const NUTRITION_PRICES_PATH = path.join(PROJECT_ROOT, 'data', 'nutrition-prices.json');
const NUTRITION_HISTORY_PATH = path.join(PROJECT_ROOT, 'data', 'nutrition-history.json');

function loadNutritionHistory(): Array<Record<string, any>> {
  try {
    return JSON.parse(fs.readFileSync(NUTRITION_HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function snapshotNutritionDay() {
  try {
    const data = getNutrition();
    if (!data || !data.date) return;
    const actuals = data.actuals || {};
    const fq = data.foodQuality || {};
    // Only snapshot if there's actual data logged
    const hasData = Object.values(actuals).some(v => v && v !== '—' && v !== '0');
    if (!hasData) return;

    const snapshot: Record<string, any> = {
      date: data.date,
      meals: (data.meals || []).filter(m => m.foods && !m.foods.includes('Not logged')),
      scores: data.scores || [],
      actuals,
      foodQuality: fq,
      totals: data.totals || {},
      superfoods: (data.superfoods || []).map(s => ({ food: s.food, checked: s.checked })),
      checklist: (data.checklist || []).map(c => ({ text: c.text, checked: c.checked })),
      ingredients: (data.ingredients || []).map(m => ({
        meal: m.meal,
        items: m.items.map((it: Record<string, string>) => ({
          Ingredient: it.Ingredient, Amount: it.Amount,
          'Brand/Source': it['Brand/Source'], Origin: it.Origin,
        })),
      })),
    };

    // Enrich scores from historical log if the scoring table was never filled in
    enrichScoresFromHistoricalLog(snapshot);

    const history = loadNutritionHistory();
    // Don't duplicate — replace if same date exists
    const idx = history.findIndex(h => h.date === snapshot.date);
    if (idx >= 0) history[idx] = snapshot;
    else history.push(snapshot);

    // Keep last 90 days
    while (history.length > 90) history.shift();

    fs.writeFileSync(NUTRITION_HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Failed to snapshot nutrition day:', err);
  }
}

function getNutritionPrices(): { lastUpdated: string; items: Record<string, any> } | null {
  try {
    const raw = fs.readFileSync(NUTRITION_PRICES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Reset all superfood checkboxes and rotate the day's log to history
function resetNutritionDaily() {
  try {
    const content = fs.readFileSync(NUTRITION_TRACKER_PATH, 'utf-8');
    // Reset superfood checkboxes [x] → [ ] (table format only, today's section only)
    const histBoundary = content.indexOf('\n## Historical');
    let updated: string;
    if (histBoundary >= 0) {
      const todayPart = content.substring(0, histBoundary).replace(/(\| \[)[xX](\] \|)/g, '$1 $2');
      updated = todayPart + content.substring(histBoundary);
    } else {
      updated = content.replace(/(\| \[)[xX](\] \|)/g, '$1 $2');
    }

    // Reset protocol checklist - [x] → - [ ] (scoped to Protocol Checklist section only)
    updated = updated.replace(/(## Protocol Checklist\s*\n)([\s\S]*?)(?=\n##|\n---|$)/, (match, header, body) => {
      return header + body.replace(/^(- \[)[xX](\] .+)$/gm, '$1 $2');
    });

    // Reset Viome superfoods tracked column [x] → [ ]
    updated = updated.replace(/(### Superfoods \(Prioritize Daily\)\s*\n)([\s\S]*?)(?=\n###|\n---|$)/, (match, header, body) => {
      return header + body.replace(/\[x\]/gi, '[ ]');
    });

    // Update the date header to today
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD

    // Scope all resets to today's section only (before Historical Logs)
    const histSplit = updated.indexOf('\n## Historical');
    let todaySection = histSplit >= 0 ? updated.substring(0, histSplit) : updated;
    const histSection = histSplit >= 0 ? updated.substring(histSplit) : '';

    todaySection = todaySection.replace(/### Date: \d{4}-\d{2}-\d{2}/, `### Date: ${today}`);

    // Reset ALL meal rows to "Not logged yet" (including Smoothie, Beverage, etc.)
    const mealReset = '| — | *Not logged yet* | — | — | — | — | — |';
    todaySection = todaySection.replace(/\| (Breakfast|Lunch|Dinner|Snacks?|Smoothie|Beverage) \|[^\n]+/g,
      (match, meal) => `| ${meal} ${mealReset}`);

    // Reset daily totals
    todaySection = todaySection.replace(/\*\*Daily Totals\*\*:.+/, '**Daily Totals**: — cals | —g protein | —g fat | —g carbs | —g net carbs');
    todaySection = todaySection.replace(/\*\*Micro Totals\*\*:.+/, '**Micro Totals**: —mg sodium | —mg potassium | —mg magnesium');
    todaySection = todaySection.replace(/\*\*Macro Split\*\*:.+/, '**Macro Split**: —% fat / —% protein / —% carbs');
    todaySection = todaySection.replace(/\*\*Hydration\*\*:.+/, '**Hydration**: 0 oz (target: 80-100 oz)');
    todaySection = todaySection.replace(/\*\*Food Quality\*\*:.+/, '**Food Quality**: —');
    todaySection = todaySection.replace(/\*\*GKI\*\*:.+/g, '**GKI**: Not measured');

    updated = todaySection + histSection;

    // Reset score dashboard (scoped to Scoring Dashboard section only — avoid clobbering Daily Targets table)
    updated = updated.replace(/(## Scoring Dashboard\s*\n)([\s\S]*?)(?=\n##|\n---|$)/, (match, header, body) => {
      let reset = body.replace(/(\| \*\*(?:Viome|Macro|Protein|Fiber|Omega|Hydration|TMA|Oxalate|Superfood|Overall)[^|]*\*\*) \|[^|]+\|[^|]+\|/g,
        (m: string, domain: string) => `${domain} | —/10 | Not logged |`);
      reset = reset.replace(/(\| \*\*Overall Grade\*\*) \|[^|]+\|[^|]+\|/, '$1 | — | Not logged |');
      return header + reset;
    });

    // Clear daily sections (stops at any ## heading or --- separator to avoid deleting static content)
    const clearSection = (str: string, header: string, placeholder: string) => {
      const regex = new RegExp(`(${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)[\\s\\S]*?(?=\\n## |\\n###? [A-Z]|\\n---|$)`);
      return str.replace(regex, `$1\n${placeholder}\n`);
    };
    updated = clearSection(updated, '### Ingredient Detail Log', '*No meals logged yet.*');
    updated = clearSection(updated, '### Recommended Alternatives', '*No alternatives to show yet.*');
    updated = clearSection(updated, '### Supplements Taken', '*No supplements logged yet.*');

    // Update frontmatter date
    updated = updated.replace(/^(updated: )\d{4}-\d{2}-\d{2}/m, `$1${today}`);

    fs.writeFileSync(NUTRITION_TRACKER_PATH, updated);
    return true;
  } catch {
    return false;
  }
}

// Recover a day's nutrition data from the Historical Logs section of Nutrition-Tracker.md.
// The health agent archives summaries there before resetting the live section.
function recoverFromHistoricalLogs(trackerContent: string, dateStr: string): Record<string, any> | null {
  try {
    // Match the section for this date: ### YYYY-MM-DD followed by lines until next ### or ## or ---
    const regex = new RegExp(`### ${dateStr.replace(/-/g, '-')}\\n([\\s\\S]*?)(?=\\n###? |\\n---|$)`);
    const match = trackerContent.match(regex);
    if (!match) return null;

    const block = match[1];
    const get = (label: string) => {
      const m = block.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)`));
      return m ? m[1].trim() : '';
    };

    const totalsLine = get('Totals');
    if (!totalsLine) return null;

    // Parse actuals from "3,007 cals | 126g protein | 152g fat | 250g carbs (15g fiber) | 235g net carbs"
    const num = (pat: RegExp) => { const m = totalsLine.match(pat); return m ? m[1].replace(',', '') : ''; };
    const actuals: Record<string, string> = {
      Calories: num(/([\d,]+)\s*cals/),
      Protein: num(/([\d.]+)g\s*protein/) ? num(/([\d.]+)g\s*protein/) + 'g' : '',
      Fat: num(/([\d.]+)g\s*fat/) ? num(/([\d.]+)g\s*fat/) + 'g' : '',
      'Net Carbs': num(/([\d.]+)g\s*net\s*carbs/) ? num(/([\d.]+)g\s*net\s*carbs/) + 'g' : '',
      Fiber: num(/([\d.]+)g\s*fiber/) ? num(/([\d.]+)g\s*fiber/) + 'g' : '',
    };
    // Remove empty keys
    for (const k of Object.keys(actuals)) { if (!actuals[k]) delete actuals[k]; }

    // Parse micros
    const microsLine = get('Micros');
    if (microsLine) {
      const mnum = (pat: RegExp) => { const m = microsLine.match(pat); return m ? m[1].replace(',', '') : ''; };
      if (mnum(/~?([\d,]+)mg\s*Na/)) actuals.Sodium = mnum(/~?([\d,]+)mg\s*Na/) + 'mg';
      if (mnum(/~?([\d,]+)mg\s*K/)) actuals.Potassium = mnum(/~?([\d,]+)mg\s*K/) + 'mg';
      if (mnum(/~?([\d,]+)mg\s*Mg/)) actuals.Magnesium = mnum(/~?([\d,]+)mg\s*Mg/) + 'mg';
      if (mnum(/~?([\d,]+)mg\s*Ca/)) actuals.Calcium = mnum(/~?([\d,]+)mg\s*Ca/) + 'mg';
      if (mnum(/~?([\d,.]+)mg\s*Fe/)) actuals.Iron = mnum(/~?([\d,.]+)mg\s*Fe/) + 'mg';
    }

    const scoreLine = get('Score');
    const scores = scoreLine ? [{ domain: 'Overall Grade', score: scoreLine.split('—')[0].trim(), status: scoreLine.split('—').slice(1).join('—').trim() }] : [];

    // Extract hydration into actuals
    const hydrationMatch = block.match(/Hydration.*?:\s*([\d,.]+\s*oz)/i);
    if (hydrationMatch) actuals.Water = hydrationMatch[1];

    // Parse superfoods from the current tracker's static list, mark checked ones from Wins line
    const winsLine = get('Wins') || '';
    const sfNamesInWins = new Set<string>();
    // Extract superfood names mentioned in wins (e.g., "3 superfoods (coffee, peanuts, olive oil)")
    const sfListMatch = winsLine.match(/superfoods?\s*\(([^)]+)\)/i);
    if (sfListMatch) {
      for (const name of sfListMatch[1].split(',')) sfNamesInWins.add(name.trim().toLowerCase());
    }
    // Also check meals line for common superfoods
    const mealsText = (get('Meals') || '').toLowerCase();
    const knownSuperfoods = [
      'Garlic', 'Olive Oil', 'Blueberries', 'Coffee', 'Pistachios', 'Peanuts',
      'Salmon (wild)', 'Mackerel', 'Sardines', 'Walnuts', 'Flax Seeds',
      'Broccoli Sprouts', 'Turmeric', 'Green Tea/Matcha', 'ACV (raw)',
    ];
    const superfoodAliases: Record<string, string[]> = {
      'Coffee': ['coffee', 'espresso', 'cold brew', 'stok'],
      'Olive Oil': ['olive oil', 'evoo'],
      'Peanuts': ['peanut'],
      'Pistachios': ['pistachio'],
      'Blueberries': ['blueberr'],
      'Garlic': ['garlic'],
      'Salmon (wild)': ['salmon'],
      'Mackerel': ['mackerel'],
      'Sardines': ['sardine'],
      'Walnuts': ['walnut'],
      'Flax Seeds': ['flax'],
      'Broccoli Sprouts': ['broccoli sprout'],
      'Turmeric': ['turmeric', 'curcumin'],
      'Green Tea/Matcha': ['matcha', 'green tea'],
      'ACV (raw)': ['acv', 'apple cider vinegar'],
    };
    const superfoods = knownSuperfoods.map(food => {
      const aliases = superfoodAliases[food] || [food.toLowerCase()];
      const inWins = aliases.some(a => sfNamesInWins.has(a));
      const inMeals = aliases.some(a => mealsText.includes(a));
      return { food, checked: inWins || inMeals };
    });

    // Parse meals from the summary line
    const mealsLine = get('Meals');
    const mealEntries = mealsLine ? mealsLine.split('|').map((m, i) => ({
      meal: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverage'][i] || `Meal ${i + 1}`,
      time: '', foods: m.trim(), cals: '', protein: '', fat: '', carbs: '',
    })).filter(m => m.foods) : [];

    return {
      date: dateStr,
      meals: mealEntries,
      scores,
      actuals,
      foodQuality: {},
      totals: {
        macroSplit: (get('Macro Split') || '').split('|')[0].trim(),
        hydration: hydrationMatch ? hydrationMatch[1] : '',
      },
      superfoods,
      checklist: [],
      ingredients: [],
      recoveredFrom: 'historical-logs',
    };
  } catch {
    return null;
  }
}

// Enrich snapshot scores from the Historical Logs section when the Today's Scores table was never filled in.
// The health agent writes "**Score**: 5/10 — ..." in the historical log but often doesn't update the scoring table.
function enrichScoresFromHistoricalLog(snapshot: Record<string, any>): boolean {
  const scores = snapshot.scores || [];
  const allDashes = scores.length === 0 || scores.every((s: { score: string }) => !s.score || s.score.replace(/\*/g, '').startsWith('—'));
  if (!allDashes) return false;

  try {
    const content = fs.readFileSync(NUTRITION_TRACKER_PATH, 'utf-8');
    const dateStr = snapshot.date;
    if (!dateStr) return false;

    const regex = new RegExp(`### ${dateStr}\\n([\\s\\S]*?)(?=\\n### |$)`);
    const match = content.match(regex);
    if (!match) return false;

    const block = match[1];
    // Use last Score line in case of corrections
    const scoreMatches = [...block.matchAll(/\*\*Score\*\*:\s*(.+)/g)];
    if (!scoreMatches.length) return false;

    const scoreLine = scoreMatches[scoreMatches.length - 1][1].trim();
    const overallMatch = scoreLine.match(/([\d.]+)\s*\/\s*10/);
    if (!overallMatch) return false;

    const overallScore = overallMatch[1] + '/10';
    const note = scoreLine.replace(overallMatch[0], '').replace(/^\s*—\s*/, '').trim();

    snapshot.scores = [
      { domain: 'Overall Grade', score: overallScore, status: note || 'End of day' },
    ];
    return true;
  } catch (err) {
    console.warn('[nutrition] failed to enrich scores from historical log:', err);
    return false;
  }
}

// Check if we need to reset (date changed since last log)
let lastNutritionResetDate = '';
function maybeResetNutrition() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  if (lastNutritionResetDate === today) return;

  try {
    const content = fs.readFileSync(NUTRITION_TRACKER_PATH, 'utf-8');
    const dateMatch = content.match(/### Date: (\d{4}-\d{2}-\d{2})/);
    const fileDate = dateMatch ? dateMatch[1] : '';

    if (fileDate && fileDate !== today) {
      snapshotNutritionDay(); // Save yesterday's data before resetting
      resetNutritionDaily();
      lastNutritionResetDate = today;
    } else if (fileDate === today) {
      // File already shows today — an agent may have reset it externally.
      // Check if yesterday is missing from history; if so, try to recover from Historical Logs.
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: TZ });
      const history = loadNutritionHistory();
      if (!history.some((h: { date: string }) => h.date === yesterdayStr)) {
        // Try to recover from the Historical Logs section in the tracker file
        const recovered = recoverFromHistoricalLogs(content, yesterdayStr);
        if (recovered) {
          history.push(recovered);
          while (history.length > 90) history.shift();
          fs.writeFileSync(NUTRITION_HISTORY_PATH, JSON.stringify(history, null, 2));
          console.log(`[nutrition] Recovered ${yesterdayStr} from Historical Logs section`);
        } else {
          console.warn(`[nutrition] Warning: ${yesterdayStr} missing from history — file was already reset to ${today} before dashboard could snapshot.`);
        }
      }
      // Guard: if agent updated the date but didn't reset scores, reset them now.
      // Two detection methods:
      // 1. Frontmatter 'updated' date is before today (agent changed date header but not frontmatter)
      // 2. Daily totals are dashes/empty but scores have real values (scores from yesterday, no food logged today yet)
      const fmDateMatch = content.match(/^updated:\s*(\d{4}-\d{2}-\d{2})/m);
      const fmDate = fmDateMatch ? fmDateMatch[1] : '';
      const totalsAreDashes = /\*\*Daily Totals\*\*:\s*—/.test(content) || !/\*\*Daily Totals\*\*/.test(content);
      const scoresHaveValues = /\| \*\*Viome Compliance\*\*\s*\|\s*\d/.test(content);
      const scoresAreStale = (fmDate && fmDate < today) || (totalsAreDashes && scoresHaveValues);
      if (scoresAreStale) {
        // Scores are from previous day — reset the scoring section
        let updated = content;
        updated = updated.replace(/(## Scoring Dashboard\s*\n)([\s\S]*?)(?=\n##|\n---|$)/, (match: string, header: string, body: string) => {
          let reset = body.replace(/(\| \*\*(?:Viome|Macro|Protein|Fiber|Omega|Hydration|TMA|Oxalate|Superfood|Overall)[^|]*\*\*) \|[^|]+\|[^|]+\|/g,
            (m: string, domain: string) => `${domain} | —/10 | Not logged |`);
          reset = reset.replace(/(\| \*\*Overall Grade\*\*) \|[^|]+\|[^|]+\|/, '$1 | — | Not logged |');
          return header + reset;
        });
        if (updated !== content) {
          // Also update frontmatter date so this doesn't re-trigger
          updated = updated.replace(/^(updated:\s*)\d{4}-\d{2}-\d{2}/m, `$1${today}`);
          fs.writeFileSync(NUTRITION_TRACKER_PATH, updated);
          console.log(`[nutrition] Reset stale scores (frontmatter=${fmDate}, totalsEmpty=${totalsAreDashes}, scoresPopulated=${scoresHaveValues})`);
        }
      }
      lastNutritionResetDate = today;
    } else {
      lastNutritionResetDate = today;
    }
  } catch {
    lastNutritionResetDate = today;
  }
}

async function postNutritionSuperfoodToggle(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { index, checked } = body as { index: number; checked: boolean };
  if (typeof index !== 'number') throw new Error('index required');

  const content = fs.readFileSync(NUTRITION_TRACKER_PATH, 'utf-8');
  const lines = content.split('\n');

  // Find the superfoods table and locate the Nth data row
  let inSuperfoods = false;
  let headerPassed = false;
  let dataRowIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## Historical')) break;
    if (line.includes('Superfoods (Prioritize')) { inSuperfoods = true; continue; }
    if (inSuperfoods && line.startsWith('|') && (line.includes('Food') || line.includes('---'))) { headerPassed = true; continue; }
    if (inSuperfoods && headerPassed && line.startsWith('|')) {
      if (dataRowIdx === index) {
        // Toggle the checkbox in the last column
        if (checked) {
          lines[i] = line.replace(/\[ \]\s*\|?\s*$/, '[x] |').replace(/\[ \]$/, '[x]');
        } else {
          lines[i] = line.replace(/\[[xX]\]\s*\|?\s*$/, '[ ] |').replace(/\[[xX]\]$/, '[ ]');
        }
        break;
      }
      dataRowIdx++;
    }
    if (inSuperfoods && headerPassed && !line.startsWith('|') && line.trim() !== '') break;
  }

  fs.writeFileSync(NUTRITION_TRACKER_PATH, lines.join('\n'));
  return { ok: true };
}

// --- Shopping List ---

const SHOPPING_LIST_PATH = path.join(OBSIDIAN_VAULT, 'Memory', 'Shopping-List.md');
const SHOPPING_PRICES_PATH = path.join(PROJECT_ROOT, 'data', 'shopping-prices.json');

interface ShoppingPriceEntry {
  amazon?: { price: number | null; url: string; inStock?: boolean; lastChecked: string };
  walmart?: { price: number | null; url: string; inStock?: boolean; lastChecked: string };
}

function getShoppingPrices(): { lastUpdated: string | null; items: Record<string, ShoppingPriceEntry> } {
  // Check multiple locations (agent writes to group workspace, or data dir)
  const paths = [
    SHOPPING_PRICES_PATH,
    path.join(PROJECT_ROOT, 'groups', 'main', 'shopping-prices.json'),
    path.join(PROJECT_ROOT, 'data', 'ipc', 'main', 'shopping-prices.json'),
  ];
  for (const p of paths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data.items && Object.keys(data.items).length > 0) {
        // Sync to canonical location
        if (p !== SHOPPING_PRICES_PATH) {
          try { fs.writeFileSync(SHOPPING_PRICES_PATH, JSON.stringify(data, null, 2)); } catch {}
        }
        return data;
      }
    } catch {}
  }
  return { lastUpdated: null, items: {} };
}

function getShoppingList(): { categories: Array<{ name: string; tag: string; items: Array<{ text: string; checked: boolean; line: number }> }> } {
  try {
    const content = fs.readFileSync(SHOPPING_LIST_PATH, 'utf-8');
    const lines = content.split('\n');
    const categories: Array<{ name: string; tag: string; items: Array<{ text: string; checked: boolean; line: number }> }> = [];
    let currentCategory: { name: string; tag: string; items: Array<{ text: string; checked: boolean; line: number }> } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Category headers: ## emoji Name
      const catMatch = line.match(/^## (.+)/);
      if (catMatch) {
        const name = catMatch[1].replace(/[#`]/g, '').trim();
        // Skip non-item sections
        if (name.includes('Recently Purchased') || name.includes('Auto-Restock') || name.includes('Budget Summary') || name.includes('Links') || name.includes('Associations Map') || name === 'Tasks') {
          currentCategory = null;
          continue;
        }
        currentCategory = { name, tag: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), items: [] };
        categories.push(currentCategory);
        continue;
      }
      // Subsection headers: ### Name
      const subMatch = line.match(/^### (.+)/);
      if (subMatch && currentCategory) {
        const subName = subMatch[1].replace(/[#`]/g, '').trim();
        const sub = { name: `${currentCategory.name} — ${subName}`, tag: currentCategory.tag, items: [] as Array<{ text: string; checked: boolean; line: number }> };
        categories.push(sub);
        currentCategory = sub;
        continue;
      }
      // Checklist items: standard markdown format
      const itemMatch = line.match(/^- \[([ xX])\] (.+)/);
      if (itemMatch && currentCategory) {
        currentCategory.items.push({
          text: itemMatch[2].trim(),
          checked: itemMatch[1] !== ' ',
          line: i,
        });
        continue;
      }
      // Checklist items: table format (| - [ ] | **Item** | ... |)
      const tableItemMatch = line.match(/^\s*\| - \[([ xX])\] \| (.+)/);
      if (tableItemMatch && currentCategory) {
        const cells = tableItemMatch[2].split('|').map(c => c.trim());
        const itemText = cells[0].replace(/\*\*/g, '');
        // Build clean display: item name + brand/replaces + price + store
        const isNutritionAlt = currentCategory.name.includes('Nutrition') || currentCategory.name.includes('Alternative');
        let display = itemText;
        if (isNutritionAlt && cells.length >= 5) {
          // Columns: Item | Replaces | Why | Best Price | Where
          const replaces = cells[1]?.replace(/\*\*/g, '') || '';
          const why = cells[2] || '';
          const price = cells[3] || '';
          const where = cells[4] || '';
          display = `**${itemText}** — ${replaces} · ${why} · ${price} · ${where}`;
        } else {
          // Supplement tables: Item | Brand | Est. Cost | Task | Source/Goal
          const brand = cells[1]?.replace(/\*\*/g, '') || '';
          const cost = cells[2] || '';
          display = brand ? `**${itemText}** — ${brand} · ${cost}` : `**${itemText}**`;
          if (cells[3]) display += ` · ${cells[3]}`;
        }
        currentCategory.items.push({
          text: display,
          checked: tableItemMatch[1] !== ' ',
          line: i,
        });
      }
    }

    // Filter out empty categories and attach price data
    const prices = getShoppingPrices();
    // Collect all category names for add-item dropdown
    const allCategoryNames = categories.map(c => c.name);
    return {
      categories: categories.filter(c => c.items.length > 0),
      allCategories: allCategoryNames,
      prices: prices.items,
      pricesLastUpdated: prices.lastUpdated,
    };
  } catch {
    return { categories: [], prices: {}, pricesLastUpdated: null };
  }
}

async function postShoppingToggle(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { line, checked } = body as { line: number; checked: boolean };
  if (typeof line !== 'number') throw new Error('line required');

  const content = fs.readFileSync(SHOPPING_LIST_PATH, 'utf-8');
  const lines = content.split('\n');
  if (line < 0 || line >= lines.length) throw new Error('invalid line');

  // Verify the line still contains a checkbox before toggling (guards against line-number drift)
  if (!lines[line].match(/- \[[ xX]\]/)) throw new Error('line does not contain a checkbox — file may have changed');

  // Toggle the checkbox
  if (checked) {
    lines[line] = lines[line].replace(/- \[ \]/, '- [x]');
  } else {
    lines[line] = lines[line].replace(/- \[[xX]\]/, '- [ ]');
  }

  fs.writeFileSync(SHOPPING_LIST_PATH, lines.join('\n'));
  return { ok: true };
}

async function postShoppingAdd(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { item, category, task } = body as { item: string; category: string; task?: string };
  if (!item || !category) throw new Error('item and category required');

  const content = fs.readFileSync(SHOPPING_LIST_PATH, 'utf-8');
  const lines = content.split('\n');

  // Find the category header line
  let insertAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const catMatch = lines[i].match(/^## (.+)/);
    if (catMatch) {
      const name = catMatch[1].replace(/[#`]/g, '').trim();
      if (name === category) {
        // Find last item in this category (before next ## or ---)
        let lastItem = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^## /) || lines[j].match(/^---/)) break;
          if (lines[j].match(/^- \[/) || lines[j].match(/^\| - \[/)) lastItem = j;
        }
        insertAt = lastItem + 1;
        break;
      }
    }
  }

  if (insertAt === -1) throw new Error(`Category "${category}" not found`);

  const taskLink = task ? ` → [[#Task: ${task}]]` : '';
  const newLine = `- [ ] ${item}${taskLink}`;
  lines.splice(insertAt, 0, newLine);
  fs.writeFileSync(SHOPPING_LIST_PATH, lines.join('\n'));
  return { ok: true };
}

async function postShoppingDelete(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { line } = body as { line: number };
  if (typeof line !== 'number') throw new Error('line required');

  const content = fs.readFileSync(SHOPPING_LIST_PATH, 'utf-8');
  const lines = content.split('\n');
  if (line < 0 || line >= lines.length) throw new Error('invalid line');
  if (!lines[line].match(/- \[[ xX]\]/)) throw new Error('line does not contain a checkbox');

  lines.splice(line, 1);
  fs.writeFileSync(SHOPPING_LIST_PATH, lines.join('\n'));
  return { ok: true };
}

// --- Wallet / Asset Tracking ---

const BASE_RPC = 'https://mainnet.base.org';
const WALLET_ADDRESS = '0x073b227DcA24dE3ae301f5802F4c99444fd58662';

interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number;
  contractAddress?: string;
}

async function fetchWalletBalances(): Promise<{ ethBalance: number; ethPrice: number; tokens: TokenBalance[]; totalUsd: number }> {
  // 1. Get native ETH balance
  const ethResp = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [WALLET_ADDRESS, 'latest'], id: 1 }),
  });
  const ethData = await ethResp.json() as { result: string };
  const ethBalance = parseInt(ethData.result, 16) / 1e18;

  // 2. Get ETH price from CoinGecko
  let ethPrice = 0;
  try {
    const priceResp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const priceData = await priceResp.json() as { ethereum: { usd: number } };
    ethPrice = priceData.ethereum.usd;
  } catch { ethPrice = 2000; /* fallback */ }

  // 3. Get ERC-20 token balances from Blockscout
  const tokens: TokenBalance[] = [];
  try {
    const tokenResp = await fetch(`https://base.blockscout.com/api/v2/addresses/${WALLET_ADDRESS}/token-balances`);
    const tokenData = await tokenResp.json() as Array<{
      value: string;
      token: { name: string; symbol: string; decimals: string; exchange_rate: string | null; address: string };
    }>;

    if (Array.isArray(tokenData)) {
      for (const t of tokenData) {
        const decimals = parseInt(t.token.decimals || '18');
        const balance = parseInt(t.value || '0') / (10 ** decimals);
        if (balance < 0.0001) continue;
        const priceUsd = t.token.exchange_rate ? parseFloat(t.token.exchange_rate) : null;
        tokens.push({
          symbol: t.token.symbol,
          name: t.token.name,
          balance,
          decimals,
          priceUsd,
          valueUsd: priceUsd ? balance * priceUsd : 0,
          contractAddress: t.token.address,
        });
      }
    }
  } catch (err) {
    console.error('Blockscout token fetch error:', err);
  }

  const ethValue = ethBalance * ethPrice;
  const tokenValue = tokens.reduce((sum, t) => sum + t.valueUsd, 0);
  const totalUsd = ethValue + tokenValue;

  return { ethBalance, ethPrice, tokens, totalUsd };
}

// In-memory cache for wallet data (refresh every 60s)
let walletCache: { ethBalance: number; ethPrice: number; tokens: TokenBalance[]; totalUsd: number } | null = null;
let walletCacheTime = 0;
const WALLET_CACHE_TTL = 60000;

async function getWalletLive() {
  if (walletCache && Date.now() - walletCacheTime < WALLET_CACHE_TTL) {
    return walletCache;
  }
  walletCache = await fetchWalletBalances();
  walletCacheTime = Date.now();
  return walletCache;
}

async function getWallet() {
  const live = await getWalletLive();

  // Get historical snapshots
  const wallet = db.prepare("SELECT id FROM wallet_assets WHERE address = ?").get(WALLET_ADDRESS) as { id: number } | undefined;
  let snapshots: Array<{ timestamp: string; total_usd: number; eth_balance: number; eth_price: number; tokens: string }> = [];
  if (wallet) {
    snapshots = db.prepare(`
      SELECT timestamp, total_usd, eth_balance, eth_price, tokens
      FROM wallet_snapshots WHERE wallet_id = ?
      ORDER BY timestamp DESC LIMIT 90
    `).all(wallet.id) as typeof snapshots;
  }

  return {
    address: WALLET_ADDRESS,
    chain: 'base',
    label: 'Main Base Wallet',
    live,
    snapshots: snapshots.map(s => ({
      ...s,
      tokens: s.tokens ? JSON.parse(s.tokens) : [],
    })),
  };
}

function getAssociationsApi(params: URLSearchParams) {
  const type = params.get('type') || '';
  const id = params.get('id') || '';
  if (!type || !id) throw new Error('type and id required');
  const assocs = getAssociations(type, id);
  return assocs.map(a => ({
    ...a,
    display: resolveAssociationDisplay(a.type, a.objectId),
  }));
}

async function postAssociationCreate(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { fromType, fromId, toType, toId, label } = body as { fromType: string; fromId: string; toType: string; toId: string; label?: string };
  if (!fromType || !fromId || !toType || !toId) throw new Error('fromType, fromId, toType, toId required');
  createAssociation(fromType, fromId, toType, toId, label);
  return { ok: true };
}

async function postAssociationDelete(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { id } = body as { id: number };
  if (!id) throw new Error('id required');
  deleteAssociation(id);
  return { ok: true };
}

// --- Trending votes table ---
try {
  dbWrite.exec(`
    CREATE TABLE IF NOT EXISTS trending_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      vote INTEGER NOT NULL,
      voted_at TEXT NOT NULL,
      url TEXT
    )
  `);
} catch {}

async function postApproveTrendingTask(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { title, prompt, group, category } = body as {
    title: string; prompt: string; group: string; category: string;
  };
  if (!prompt || !group) throw new Error('prompt and group required');

  const jid = GROUP_JIDS[group] || GROUP_JIDS.main;
  const taskId = `task-${Date.now()}-trending`;
  const now = new Date().toISOString();

  dbWrite.prepare(`
    INSERT INTO scheduled_tasks (id, chat_jid, group_folder, prompt, schedule_type, schedule_value, status, next_run, context_mode, created_at)
    VALUES (?, ?, ?, ?, 'once', '', 'active', ?, 'isolated', ?)
  `).run(taskId, jid, group, prompt, new Date(Date.now() + 60000).toISOString(), now);

  return { ok: true, taskId };
}

async function postTrendingVote(req: http.IncomingMessage) {
  const body = JSON.parse(await readBody(req));
  const { source, title, category, vote, url } = body as {
    source: string; title: string; category: string; vote: number; url?: string;
  };
  if (!title || !category || vote === undefined) throw new Error('title, category, vote required');

  dbWrite.prepare(`
    INSERT INTO trending_votes (source, title, category, vote, voted_at, url) VALUES (?, ?, ?, ?, ?, ?)
  `).run(source || 'unknown', title, category, vote, new Date().toISOString(), url || null);

  return { ok: true };
}

function getTrendingVotes() {
  try {
    return db.prepare(`
      SELECT category, vote, COUNT(*) as cnt
      FROM trending_votes
      WHERE voted_at > datetime('now', '-30 days')
      GROUP BY category, vote
    `).all();
  } catch { return []; }
}

async function postWalletSnapshot() {
  const live = await fetchWalletBalances();
  const wallet = db.prepare("SELECT id FROM wallet_assets WHERE address = ?").get(WALLET_ADDRESS) as { id: number } | undefined;
  if (!wallet) throw new Error('Wallet not found');

  const now = new Date().toISOString();
  dbWrite.prepare(`
    INSERT INTO wallet_snapshots (wallet_id, timestamp, total_usd, eth_balance, eth_price, tokens)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(wallet.id, now, live.totalUsd, live.ethBalance, live.ethPrice, JSON.stringify(live.tokens));

  return { ok: true, totalUsd: live.totalUsd, timestamp: now };
}

// Auto-snapshot scheduler: runs at 11:55 PM ET daily
let lastSnapshotDate = '';
setInterval(async () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dateStr = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  const minute = now.getMinutes();

  if (hour === 23 && minute === 55 && dateStr !== lastSnapshotDate) {
    lastSnapshotDate = dateStr;
    try {
      const result = await postWalletSnapshot();
      console.log(`[Wallet] Daily snapshot taken: $${result.totalUsd.toFixed(2)} at ${result.timestamp}`);
    } catch (err) {
      console.error('[Wallet] Failed to take daily snapshot:', err);
    }
  }
}, 30000); // check every 30s

// --- Trending Data ---

/** Simple HTTPS GET returning a string, with timeout */
function httpGet(urlStr: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.get({
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'NanoClaw:v1.0 (by /u/nanoclaw)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', (chunk: Buffer) => body += chunk.toString());
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

interface TrendingItem {
  title: string;
  url: string;
  score: number;
  comments: number;
  source: string;       // 'reddit' | 'news'
  subreddit?: string;
  category: string;     // maps to report section
  publishedAt?: string;
}

interface SuggestedTask {
  title: string;
  prompt: string;
  group: string;
  category: string;
  reason: string;       // why this is suggested
  sourceItems: string[]; // titles of trending items that inspired this
}

/** Subreddits mapped to report categories */
const REDDIT_FEEDS: Record<string, { subreddits: string[]; category: string }> = {
  markets:  { subreddits: ['wallstreetbets', 'options', 'thetagang', 'stocks'], category: 'markets' },
  crypto:   { subreddits: ['cryptocurrency', 'defi', 'ethfinance', 'RWA_Tokenization'], category: 'crypto' },
  health:   { subreddits: ['biohacking', 'Supplements', 'longevity', 'fitness'], category: 'health' },
  ai:       { subreddits: ['artificial', 'MachineLearning', 'ClaudeAI', 'LocalLLaMA'], category: 'ai' },
  business: { subreddits: ['smallbusiness', 'Entrepreneur', 'SideProject'], category: 'business' },
};

/** Google News RSS queries mapped to categories */
const NEWS_FEEDS: Record<string, { query: string; category: string }> = {
  markets:  { query: 'stock+market+options+trading', category: 'markets' },
  crypto:   { query: 'cryptocurrency+bitcoin+ethereum+tokenization', category: 'crypto' },
  health:   { query: 'biohacking+supplements+longevity', category: 'health' },
  ai:       { query: 'artificial+intelligence+claude+LLM', category: 'ai' },
  business: { query: 'small+business+acquisition+SBA+loan', category: 'business' },
};

/** Category-specific task suggestion templates */
const TASK_TEMPLATES: Record<string, { group: string; promptPrefix: string }> = {
  markets:  { group: 'trading', promptPrefix: 'Research this trading opportunity and provide an analysis with entry/exit points and risk assessment:' },
  crypto:   { group: 'crypto', promptPrefix: 'Research this crypto development and assess impact on our portfolio and RWA thesis:' },
  health:   { group: 'health-wellness', promptPrefix: 'Research this health/wellness finding and determine how it applies to our protocol:' },
  ai:       { group: 'ai-research', promptPrefix: 'Research this AI development and assess implications for our NanoClaw system and workflows:' },
  business: { group: 'business-ideas', promptPrefix: 'Research this business opportunity and evaluate fit with our SMB acquisition pipeline:' },
};

/** Cache trending data (refresh every 15 min) */
let trendingCache: { items: TrendingItem[]; suggested: SuggestedTask[]; fetchedAt: number } | null = null;
const TRENDING_CACHE_TTL = 15 * 60 * 1000;

async function fetchRedditFeed(subreddit: string, category: string): Promise<TrendingItem[]> {
  try {
    const raw = await httpGet(`https://old.reddit.com/r/${subreddit}/hot.json?limit=5&raw_json=1`);
    const data = JSON.parse(raw);
    const posts = data?.data?.children || [];
    return posts
      .filter((p: any) => !p.data.stickied && p.data.score > 10)
      .slice(0, 3)
      .map((p: any) => ({
        title: p.data.title,
        url: `https://reddit.com${p.data.permalink}`,
        score: p.data.score,
        comments: p.data.num_comments,
        source: 'reddit',
        subreddit,
        category,
        publishedAt: new Date(p.data.created_utc * 1000).toISOString(),
      }));
  } catch {
    return [];
  }
}

async function fetchNewsFeed(query: string, category: string): Promise<TrendingItem[]> {
  try {
    const raw = await httpGet(`https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`);
    const titles = [...raw.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g)];
    return titles.slice(0, 3).map(m => ({
      title: m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"),
      url: m[2],
      score: 0,
      comments: 0,
      source: 'news',
      category,
      publishedAt: new Date(m[3]).toISOString(),
    }));
  } catch {
    return [];
  }
}

function generateSuggestedTasks(items: TrendingItem[]): SuggestedTask[] {
  const suggested: SuggestedTask[] = [];
  const byCategory: Record<string, TrendingItem[]> = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  for (const [category, catItems] of Object.entries(byCategory)) {
    const template = TASK_TEMPLATES[category];
    if (!template) continue;

    // Pick top items by score (Reddit) or recency (news)
    const top = catItems
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);

    if (top.length === 0) continue;

    // Generate a research task from top trending items
    const topTitles = top.map(t => `- ${t.title} (${t.source === 'reddit' ? `r/${t.subreddit}, ${t.score} pts` : 'Google News'})`);
    const prompt = `${template.promptPrefix}\n\nTrending topics to investigate:\n${topTitles.join('\n')}\n\nURLs:\n${top.map(t => t.url).join('\n')}\n\nProvide a concise briefing with key takeaways and any action items.`;

    suggested.push({
      title: `Trending ${category.charAt(0).toUpperCase() + category.slice(1)} Research`,
      prompt,
      group: template.group,
      category,
      reason: `${top.length} trending items detected across ${new Set(top.map(t => t.source === 'reddit' ? `r/${t.subreddit}` : 'news')).size} sources`,
      sourceItems: top.map(t => t.title),
    });
  }

  return suggested;
}

async function fetchTrending(): Promise<{ items: TrendingItem[]; suggested: SuggestedTask[] }> {
  if (trendingCache && Date.now() - trendingCache.fetchedAt < TRENDING_CACHE_TTL) {
    return { items: trendingCache.items, suggested: trendingCache.suggested };
  }

  const allItems: TrendingItem[] = [];

  // Fetch all Reddit feeds in parallel
  const redditPromises: Promise<TrendingItem[]>[] = [];
  for (const feed of Object.values(REDDIT_FEEDS)) {
    for (const sub of feed.subreddits) {
      redditPromises.push(fetchRedditFeed(sub, feed.category));
    }
  }

  // Fetch all news feeds in parallel
  const newsPromises: Promise<TrendingItem[]>[] = [];
  for (const feed of Object.values(NEWS_FEEDS)) {
    newsPromises.push(fetchNewsFeed(feed.query, feed.category));
  }

  const results = await Promise.allSettled([...redditPromises, ...newsPromises]);
  for (const r of results) {
    if (r.status === 'fulfilled') allItems.push(...r.value);
  }

  // Deduplicate by title similarity
  const seen = new Set<string>();
  const unique = allItems.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const suggested = generateSuggestedTasks(unique);

  trendingCache = { items: unique, suggested, fetchedAt: Date.now() };
  return { items: unique, suggested };
}

/** Group JIDs for task creation */
const GROUP_JIDS: Record<string, string> = {
  main: 'dc:1474853349676286145',
  'ai-research': 'dc:1476293323860869251',
  'business-ideas': 'dc:1476293406375542876',
  'health-wellness': 'dc:1476293450402889949',
  trading: 'dc:1477676119007297678',
  crypto: 'dc:1477831148825477161',
  contacts: 'dc:1478496249257656533',
};

// --- Daily Report ---

interface DailyReportSection {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: DailyReportItem[];
  summary?: string;
}

interface DailyReportItem {
  taskId: string;
  taskTitle: string;
  runAt: string;
  status: string;
  result: string;
  costUsd: number;
  durationMs: number;
  sources: { type: string; name: string; url?: string }[];
  entities: { name: string; type: string; crmFile?: string }[];
}

/** Map group_folder to report section metadata */
const SECTION_META: Record<string, { id: string; title: string; icon: string; color: string; order: number }> = {
  trading:          { id: 'markets',    title: 'Markets & Trading',     icon: '\u{1F4C8}', color: '#e07c39', order: 1 },
  crypto:           { id: 'crypto',     title: 'Crypto & Web3',         icon: '\u{26D3}',  color: '#3ecf8e', order: 2 },
  'health-wellness':{ id: 'health',     title: 'Health & Wellness',     icon: '\u{1F9E0}', color: '#4da870', order: 3 },
  'ai-research':    { id: 'ai',         title: 'AI & Technology',       icon: '\u{1F916}', color: '#9f7aea', order: 4 },
  'business-ideas': { id: 'business',   title: 'Business & Deals',      icon: '\u{1F4BC}', color: '#d4a72c', order: 5 },
  contacts:         { id: 'contacts',   title: 'Network & Contacts',    icon: '\u{1F465}', color: '#cf6679', order: 6 },
  main:             { id: 'operations', title: 'Operations & Security', icon: '\u{1F6E1}', color: '#5e6ad2', order: 7 },
};

/** Source patterns to extract from task prompts and results */
const SOURCE_PATTERNS: { pattern: RegExp; type: string; name: string }[] = [
  { pattern: /Tom\s*King/i, type: 'youtube', name: 'Tom King Trades' },
  { pattern: /Yield\s*Collector/i, type: 'youtube', name: 'Yield Collector' },
  { pattern: /InTheMoney\s*Adam/i, type: 'youtube', name: 'InTheMoney Adam' },
  { pattern: /malone\.news/i, type: 'newsletter', name: 'Dr. Robert Malone' },
  { pattern: /midwesterndoctor/i, type: 'newsletter', name: 'Midwestern Doctor' },
  { pattern: /Huberman/i, type: 'expert', name: 'Andrew Huberman' },
  { pattern: /Peter\s*Attia/i, type: 'expert', name: 'Peter Attia' },
  { pattern: /Robert\s*Malone/i, type: 'expert', name: 'Dr. Robert Malone' },
  { pattern: /Kennedy|RFK/i, type: 'expert', name: 'Robert F. Kennedy Jr.' },
  { pattern: /Mercola/i, type: 'expert', name: 'Dr. Joseph Mercola' },
  { pattern: /McCullough/i, type: 'expert', name: 'Dr. Peter McCullough' },
  { pattern: /Zach\s*Bush/i, type: 'expert', name: 'Dr. Zach Bush' },
  { pattern: /Casey\s*Means/i, type: 'expert', name: 'Dr. Casey Means' },
  { pattern: /Mark\s*Hyman/i, type: 'expert', name: 'Dr. Mark Hyman' },
  { pattern: /Gary\s*Brecka/i, type: 'expert', name: 'Gary Brecka' },
  { pattern: /Suzanne\s*Humphries/i, type: 'expert', name: 'Dr. Suzanne Humphries' },
  { pattern: /BizBuySell/i, type: 'platform', name: 'BizBuySell' },
  { pattern: /OptionAlpha/i, type: 'platform', name: 'OptionAlpha' },
  { pattern: /Kalshi/i, type: 'platform', name: 'Kalshi' },
  { pattern: /qwibitai\/nanoclaw|NanoClaw\s+(?:upstream|monitor)/i, type: 'github', name: 'NanoClaw Upstream' },
  { pattern: /LinkedIn/i, type: 'platform', name: 'LinkedIn' },
  { pattern: /Securitize/i, type: 'platform', name: 'Securitize' },
  { pattern: /Ondo\s*Finance/i, type: 'platform', name: 'Ondo Finance' },
  { pattern: /CoinDesk|The\s+Block|Decrypt|Blockworks|Cointelegraph/i, type: 'news', name: 'Crypto News' },
  { pattern: /Bryan\s*Johnson/i, type: 'expert', name: 'Bryan Johnson' },
  { pattern: /Beehiiv/i, type: 'platform', name: 'Beehiiv' },
];

/** Build a cached set of contact names for entity matching */
let contactNamesCache: { names: Map<string, string>; built: number } | null = null;
function getContactNames(): Map<string, string> {
  if (contactNamesCache && Date.now() - contactNamesCache.built < 600_000) return contactNamesCache.names;
  const names = new Map<string, string>();
  try {
    const files = fs.readdirSync(CONTACTS_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const name = f.replace('.md', '').replace(/-/g, ' ');
      if (name.length >= 3 && !/^\d+$/.test(name)) {
        names.set(name.toLowerCase(), f);
      }
    }
  } catch {}
  contactNamesCache = { names, built: Date.now() };
  return names;
}

/** Extract named entities from text and match against CRM contacts */
function extractEntities(text: string): { name: string; type: string; crmFile?: string }[] {
  if (!text) return [];
  const entities: { name: string; type: string; crmFile?: string }[] = [];
  const seen = new Set<string>();
  const contactNames = getContactNames();

  // Match known companies/platforms
  const companyPatterns = [
    /\b(Kalshi|OptionAlpha|Securitize|Ondo Finance|Centrifuge|Superstate|Ripple|Galaxy Digital|FalconX|Keyrock)\b/gi,
    /\b(Hostinger|Beehiiv|BizBuySell|HubSpot|Alibaba Cloud)\b/gi,
    /\b(Tesla|Apple|NVIDIA|AMD|Microsoft|Google|Amazon|Meta)\b/gi,
  ];
  for (const p of companyPatterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      const name = m[1];
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ name, type: 'company', crmFile: contactNames.get(key) });
      }
    }
  }

  // Match ticker symbols ($AAPL, $BTC, etc.)
  const tickerRe = /\$([A-Z]{2,5})\b/g;
  let tm;
  while ((tm = tickerRe.exec(text)) !== null) {
    const ticker = tm[1];
    if (!seen.has(ticker) && !['USD', 'THE', 'FOR', 'AND', 'NOT', 'ARE', 'YOU'].includes(ticker)) {
      seen.add(ticker);
      entities.push({ name: `$${ticker}`, type: 'ticker' });
    }
  }

  // Match CRM contacts (only check multi-word names to avoid false positives)
  const textLower = text.toLowerCase();
  contactNames.forEach((file, nameLower) => {
    if (nameLower.split(' ').length < 2) return;
    if (nameLower.length < 5) return;
    if (textLower.includes(nameLower) && !seen.has(nameLower)) {
      seen.add(nameLower);
      const displayName = nameLower.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      entities.push({ name: displayName, type: 'contact', crmFile: file });
    }
  });

  return entities;
}

/** Extract URLs from text grouped by type */
function extractUrls(text: string): { type: string; url: string }[] {
  if (!text) return [];
  const urls: { type: string; url: string }[] = [];
  const seen = new Set<string>();
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:!]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    let type = 'link';
    if (/youtube\.com|youtu\.be/i.test(url)) type = 'youtube';
    else if (/x\.com|twitter\.com/i.test(url)) type = 'x';
    else if (/github\.com/i.test(url)) type = 'github';
    else if (/linkedin\.com/i.test(url)) type = 'linkedin';
    else if (/substack\.com|malone\.news|midwesterndoctor/i.test(url)) type = 'newsletter';
    urls.push({ type, url });
  }
  return urls;
}

async function getDailyReport(dateParam?: string, includeTrending = true) {
  const targetDate = dateParam || new Date().toISOString().split('T')[0];
  // Get runs from last 24h window relative to target date end-of-day
  const dayEnd = `${targetDate}T23:59:59Z`;
  const dayStart = `${targetDate}T00:00:00Z`;

  // Get all task runs for the day
  const runs = db.prepare(`
    SELECT r.task_id, r.run_at, r.duration_ms, r.status, r.result, r.error,
           r.cost_usd, r.input_tokens, r.output_tokens,
           t.group_folder, t.prompt, t.schedule_type, t.schedule_value, t.thread_id
    FROM task_run_logs r
    JOIN scheduled_tasks t ON r.task_id = t.id
    WHERE r.run_at >= ? AND r.run_at <= ?
    ORDER BY r.run_at DESC
  `).all(dayStart, dayEnd) as any[];

  // Get recent messages with links (YouTube, X, articles)
  const linkedMessages = db.prepare(`
    SELECT m.content, m.chat_jid, m.timestamp, m.is_from_me, m.sender_name,
           g.folder as group_folder
    FROM messages m
    LEFT JOIN registered_groups g ON m.chat_jid = g.jid
    WHERE m.timestamp >= ? AND m.timestamp <= ?
      AND (m.content LIKE '%youtube.com%' OR m.content LIKE '%youtu.be%'
           OR m.content LIKE '%x.com%' OR m.content LIKE '%twitter.com%'
           OR m.content LIKE '%substack.com%' OR m.content LIKE '%malone.news%'
           OR m.content LIKE '%midwesterndoctor%' OR m.content LIKE '%github.com%')
    ORDER BY m.timestamp DESC
  `).all(dayStart, dayEnd) as any[];

  // Get today's Obsidian daily note if it exists
  let dailyNote = '';
  const dailyNotePath = path.join(DAILY_DIR, `${targetDate}.md`);
  try { dailyNote = fs.readFileSync(dailyNotePath, 'utf-8'); } catch {}

  // Build sections
  const sectionMap: Record<string, DailyReportSection> = {};
  const allEntities: DailyReportItem['entities'] = [];

  for (const run of runs) {
    const meta = SECTION_META[run.group_folder] || SECTION_META.main;
    if (!sectionMap[meta.id]) {
      sectionMap[meta.id] = { ...meta, items: [] };
    }

    const combinedText = `${run.prompt || ''} ${run.result || ''} ${run.error || ''}`;

    // Extract sources
    const sources: DailyReportItem['sources'] = [];
    for (const sp of SOURCE_PATTERNS) {
      if (sp.pattern.test(combinedText)) {
        sources.push({ type: sp.type, name: sp.name });
      }
    }
    // Add extracted URLs as sources
    const urls = extractUrls(run.result || '');
    for (const u of urls) {
      sources.push({ type: u.type, name: u.url, url: u.url });
    }

    // Extract entities
    const entities = extractEntities(combinedText);
    allEntities.push(...entities);

    // Clean result text: strip <internal> tags
    let resultClean = (run.result || run.error || '').replace(/<\/?internal>/g, '').trim();
    // Truncate very long results for the report
    if (resultClean.length > 1500) resultClean = resultClean.substring(0, 1500) + '...';

    // Generate a title from the prompt
    let title = run.prompt || '';
    const roleMatch = title.match(/^You are (?:a |the )([^.]+)\./i);
    const roleName = roleMatch ? roleMatch[1].trim() : null;
    title = title.replace(/^You are (?:a |the )[^.]+\.\s*/i, '');
    title = title.replace(/^Your (?:job|task) is to\s*/i, '');
    const firstLine = title.split('\n')[0].trim();
    if (!firstLine && roleName) title = roleName;
    else {
      const firstSentence = firstLine.split(/\.\s/)[0];
      title = (firstSentence.length < 80 ? firstSentence : firstLine.substring(0, 60)).replace(/\.$/, '');
    }
    if (title.length > 0) title = title[0].toUpperCase() + title.slice(1);

    sectionMap[meta.id].items.push({
      taskId: run.task_id,
      taskTitle: title || 'Untitled',
      runAt: run.run_at,
      status: run.status,
      result: resultClean,
      costUsd: run.cost_usd || 0,
      durationMs: run.duration_ms || 0,
      sources,
      entities,
    });
  }

  // Add shared links section from messages
  if (linkedMessages.length > 0) {
    const linkItems: DailyReportItem[] = [];
    for (const msg of linkedMessages) {
      const urls = extractUrls(msg.content);
      const entities = extractEntities(msg.content);
      const group = msg.group_folder || 'main';
      const meta = SECTION_META[group] || SECTION_META.main;
      // Add to appropriate section or create a shared links item
      linkItems.push({
        taskId: '',
        taskTitle: msg.is_from_me ? 'Shared by you' : `Shared by ${msg.sender_name || 'user'}`,
        runAt: msg.timestamp,
        status: 'link',
        result: msg.content,
        costUsd: 0,
        durationMs: 0,
        sources: urls.map(u => ({ type: u.type, name: u.url, url: u.url })),
        entities,
      });
    }
    if (linkItems.length > 0) {
      if (!sectionMap['links']) {
        sectionMap['links'] = {
          id: 'links', title: 'Shared Links & Content', icon: '\u{1F517}',
          color: '#6b8afd', items: linkItems,
        };
      } else {
        sectionMap['links'].items.push(...linkItems);
      }
    }
  }

  // Build sorted sections
  const sections = Object.values(sectionMap).sort((a, b) => {
    const orderA = Object.values(SECTION_META).find(m => m.id === a.id)?.order ?? 99;
    const orderB = Object.values(SECTION_META).find(m => m.id === b.id)?.order ?? 99;
    return orderA - orderB;
  });

  // Compute aggregate metrics
  const totalCost = runs.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const totalRuns = runs.length;
  const successRuns = runs.filter(r => r.status === 'success').length;
  const errorRuns = runs.filter(r => r.status === 'error').length;
  const totalTokensIn = runs.reduce((s, r) => s + (r.input_tokens || 0), 0);
  const totalTokensOut = runs.reduce((s, r) => s + (r.output_tokens || 0), 0);
  const groupsActive = new Set(runs.map(r => r.group_folder)).size;

  // Deduplicate entities across all sections
  const uniqueEntities: Record<string, DailyReportItem['entities'][0]> = {};
  for (const e of allEntities) {
    const key = e.name.toLowerCase();
    if (!uniqueEntities[key] || (e.crmFile && !uniqueEntities[key].crmFile)) {
      uniqueEntities[key] = e;
    }
  }

  // Get active task counts per group for status overview
  const taskCounts = db.prepare(`
    SELECT group_folder, status, COUNT(*) as cnt
    FROM scheduled_tasks
    WHERE status IN ('active', 'needs_review')
    GROUP BY group_folder, status
  `).all() as any[];

  // Fetch trending
  let trendingData: any = null;
  if (includeTrending) {
    try {
      trendingData = await fetchTrending();
    } catch (err: any) {
      trendingData = { items: [], suggested: [], error: err?.message || String(err) };
    }
  }

  return {
    date: targetDate,
    metrics: {
      totalRuns,
      successRuns,
      errorRuns,
      totalCost: Math.round(totalCost * 100) / 100,
      totalTokensIn,
      totalTokensOut,
      groupsActive,
      linkedMessagesCount: linkedMessages.length,
    },
    sections,
    entities: Object.values(uniqueEntities),
    taskCounts,
    dailyNote: dailyNote ? dailyNote.substring(0, 3000) : null,
    trending: trendingData,
  };
}

// --- Router ---

type Handler = (params: URLSearchParams) => unknown | Promise<unknown>;

const getRoutes: Record<string, Handler> = {
  '/api/service': () => getService(),
  '/api/containers': () => getContainers(),
  '/api/groups': () => getGroups(),
  '/api/health': () => getChannelHealth(),
  '/api/messages': (p) => getMessages(p.get('group') || 'main', parseInt(p.get('limit') || '20', 10)),
  '/api/tasks': () => getTasks(),
  '/api/task/health': () => getTaskHealth(),
  '/api/task/cost-trends': (p) => getTaskCostTrends(p),
  '/api/task/duplicates': () => getTaskDuplicates(),
  '/api/task/templates': () => getTaskTemplatesApi(),
  '/api/task/comments': (p) => getTaskCommentsApi(p),
  '/api/task/detail': (p) => getTaskDetail(p.get('id') || ''),
  '/api/associations': (p) => getAssociationsApi(p),
  '/api/logs': (p) => getLogs(parseInt(p.get('lines') || '100', 10), p.get('filter') || undefined),
  '/api/sessions': () => getSessions(),
  '/api/overview': () => getOverview(),
  '/api/status-board': () => getStatusBoard(),
  '/api/services': () => getServices(),
  '/api/reviews': () => getReviews(),
  '/api/calendar': () => getCalendar(),
  '/api/projects': () => getProjects(),
  '/api/project': (p) => getProjectDetail(p.get('file') || ''),
  '/api/ventures': () => getVentures(),
  '/api/venture': (p) => getVentureDetail(p.get('file') || ''),
  '/api/venture/kalshi': () => getVentureKalshi(),
  '/api/venture/ibkr': () => getVentureIbkr(),
  '/api/venture/gsa': () => getVentureGsa(),
  '/api/venture/smb': () => getVentureSmb(),
  '/api/venture/realestate': () => getVentureRealestate(),
  '/api/docs': (p) => getDocs(p.get('folder') || undefined),
  '/api/doc': (p) => getDocContent(p.get('path') || ''),
  '/api/memory': (p) => getMemory(p.get('date') || undefined),
  '/api/memory/conversation': (p) => getMemoryConversation(p.get('file') || ''),
  '/api/contacts': (p) => getContacts(p),
  '/api/contact': (p) => getContactDetail(p.get('file') || ''),
  '/api/docs/search': (p) => searchDocs(p.get('q') || '', p.get('folder') || undefined),
  '/api/org': () => getOrgChart(),
  '/api/office': () => getOffice(),
  '/api/accounting': (p) => getAccounting(p),
  '/api/accounting/export': (p) => getAccountingExport(p),
  '/api/accounting/costs': (p) => getCostAnalysis(p),
  '/api/wallet': () => getWallet(),
  '/api/daily-report': (p) => getDailyReport(p.get('date') || undefined),
  '/api/nutrition': (p) => {
    const date = p.get('date');
    if (date) {
      // Return historical snapshot for requested date, with weekly trends
      const history = loadNutritionHistory();
      const entry = history.find(h => h.date === date);
      if (!entry) return { error: 'No data for this date', date };
      // Enrich scores from historical log if snapshot had all dashes, and persist
      if (enrichScoresFromHistoricalLog(entry)) {
        fs.writeFileSync(NUTRITION_HISTORY_PATH, JSON.stringify(history, null, 2));
      }
      // Generate weekly trends centered on the requested date
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const wt: Array<Record<string, string>> = [];
      const refDate = new Date(date + 'T12:00:00');
      for (let i = 6; i >= 0; i--) {
        const dd = new Date(refDate); dd.setDate(dd.getDate() - i);
        const ds = dd.toLocaleDateString('en-CA', { timeZone: TZ });
        const he = history.find(h => h.date === ds);
        if (he?.actuals) {
          const a = he.actuals;
          const c2 = parseFloat(String(a.Calories || '0').replace(/[^0-9.]/g, ''));
          const p2 = parseFloat(String(a.Protein || '0').replace(/[^0-9.]/g, ''));
          const f2 = parseFloat(String(a.Fat || '0').replace(/[^0-9.]/g, ''));
          const cb = parseFloat(String(a['Net Carbs'] || '0').replace(/[^0-9.]/g, ''));
          const sc = (he.superfoods || []).filter((s: {checked:boolean}) => s.checked).length;
          const st = (he.superfoods || []).length;
          // Use agent's Overall Grade score from history
          const ogEntry = (he.scores || []).find((s: {domain:string}) => s.domain === 'Overall Grade');
          const ogRaw = ogEntry ? String(ogEntry.score).replace(/\*/g, '').trim() : '';
          const ogMatch = ogRaw.match(/([\d.]+)\s*\/\s*10/);
          const ogGrade = ogMatch ? `${ogMatch[1]}/10` : '—';
          wt.push({ day: dayNames[dd.getDay()], date: ds, cals: c2>0?String(Math.round(c2)):'—', protein: p2>0?Math.round(p2)+'g':'—', fat: f2>0?Math.round(f2)+'g':'—', carbs: cb>0?Math.round(cb)+'g':'—', sfCount: st>0?`${sc}/${st}`:'—', grade: c2>0?ogGrade:'—' });
        } else {
          wt.push({ day: dayNames[dd.getDay()], date: ds, cals:'—', protein:'—', fat:'—', carbs:'—', sfCount:'—', grade:'—' });
        }
      }
      return { ...entry, weeklyTrends: wt, historical: true };
    }
    return getNutrition();
  },
  '/api/nutrition/history-dates': () => {
    const history = loadNutritionHistory();
    const dates = history.map(h => h.date).sort();
    return { dates };
  },
  '/api/nutrition/history': () => {
    const history = loadNutritionHistory();
    // Also include today's live data as the last entry
    try {
      const today = getNutrition();
      if (today && today.date) {
        const todayEntry = { date: today.date, actuals: today.actuals || {}, foodQuality: today.foodQuality || {}, totals: today.totals || {}, superfoods: (today.superfoods || []).map((s: any) => ({ food: s.food, checked: s.checked })) };
        const idx = history.findIndex(h => h.date === today.date);
        if (idx >= 0) history[idx] = todayEntry;
        else history.push(todayEntry);
      }
    } catch {}
    return history;
  },
  '/api/shopping': () => getShoppingList(),
};

const postRoutes: Record<string, (req: http.IncomingMessage) => Promise<unknown>> = {
  '/api/review': postReview,
  '/api/review/clear': postClearReviews,
  '/api/task/reschedule': postReschedule,
  '/api/task/status': postTaskStatus,
  '/api/task/progress': postTaskProgress,
  '/api/task/run-now': postTaskRunNow,
  '/api/task/comment': postTaskComment,
  '/api/task/comments/read': postTaskCommentsRead,
  '/api/task/merge': postTaskMerge,
  '/api/task/delete': postTaskDelete,
  '/api/task/link': postTaskLink,
  '/api/project/update': postProjectUpdate,
  '/api/venture/update': postVentureUpdate,
  '/api/chat/send': postChatSend,
  '/api/accounting/entry': postAccountingEntry,
  '/api/accounting/receipt': postAccountingReceipt,
  '/api/accounting/delete': postAccountingDelete,
  '/api/accounting/reconcile': postAccountingReconcile,
  '/api/accounting/scan-email': postAccountingScanEmail,
  '/api/wallet/snapshot': () => postWalletSnapshot(),
  '/api/association/create': postAssociationCreate,
  '/api/association/delete': postAssociationDelete,
  '/api/trending/approve': postApproveTrendingTask,
  '/api/trending/vote': postTrendingVote,
  '/api/nutrition/superfood/toggle': postNutritionSuperfoodToggle,
  '/api/nutrition/snapshot': () => { snapshotNutritionDay(); return { ok: true }; },
  '/api/shopping/toggle': postShoppingToggle,
  '/api/shopping/add': postShoppingAdd,
  '/api/shopping/delete': postShoppingDelete,
};

ensureTaskCommentsTable();
ensureAssociationsTable();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // --- Auth endpoints (always accessible) ---
  if (pathname === '/api/auth/check') {
    const authed = isAuthenticated(req, url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: authed }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = JSON.parse(await readBody(req));
      if (body.token && timingSafeCompare(body.token, DASHBOARD_TOKEN)) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `${AUTH_COOKIE_NAME}=${DASHBOARD_TOKEN}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`,
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Serve static assets (always accessible — no auth needed for map data)
  if (pathname === '/world-map.json') {
    const mapPath = path.join(import.meta.dirname, 'world-map.json');
    if (fs.existsSync(mapPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(mapPath));
    } else {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // Serve index.html (always accessible — auth handled client-side)
  if (pathname === '/' || pathname === '/index.html') {
    const html = fs.readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // --- Auth check for all other routes ---
  if (!isAuthenticated(req, url)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // File download routes
  if (req.method === 'GET' && pathname === '/api/accounting/download') {
    try {
      const data = getAccountingExport(url.searchParams) as { format: string; content: string; filename: string };
      const mime = data.format === 'iif' ? 'application/x-iif' : 'text/csv';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${data.filename}"`,
      });
      res.end(data.content);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // Serve receipt files
  if (req.method === 'GET' && pathname.startsWith('/receipts/')) {
    const safeName = pathname.replace('/receipts/', '').replace(/\.\./g, '');
    const filePath = path.join(RECEIPTS_DIR, safeName);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(safeName).toLowerCase();
      const mimes: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
      res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // GET routes
  if (req.method === 'GET' && getRoutes[pathname]) {
    try {
      const data = await getRoutes[pathname](url.searchParams);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // POST routes
  if (req.method === 'POST' && postRoutes[pathname]) {
    try {
      const data = await postRoutes[pathname](req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const HOST = process.env.DASHBOARD_HOST || '0.0.0.0';
// --- Zombie task detection at startup ---
// Only flag recurring tasks stuck in 'running' as zombies. One-time tasks are
// handled by the scheduler (auto-completed after run) and should not be touched.
// Previous logic caught completed one-time tasks on dashboard restart, flooding
// needs_review with false positives.
try {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const zombies = dbWrite.prepare(
    "UPDATE scheduled_tasks SET status = 'needs_review' WHERE status = 'running' AND schedule_type != 'once' AND last_run IS NOT NULL AND last_run < ? RETURNING id"
  ).all(thirtyMinAgo) as Array<{ id: string }>;
  if (zombies.length > 0) {
    console.log(`[startup] Marked ${zombies.length} zombie task(s) as needs_review: ${zombies.map(z => z.id).join(', ')}`);
  }
  // Auto-complete one-time tasks that already ran but got stuck in active/running
  const staleOnce = dbWrite.prepare(
    "UPDATE scheduled_tasks SET status = 'completed' WHERE schedule_type = 'once' AND status IN ('active', 'running') AND last_run IS NOT NULL RETURNING id"
  ).all() as Array<{ id: string }>;
  if (staleOnce.length > 0) {
    console.log(`[startup] Auto-completed ${staleOnce.length} stale one-time task(s): ${staleOnce.map(z => z.id).join(', ')}`);
  }
} catch (err) {
  console.error('[startup] Zombie task detection failed:', err);
}

server.listen(PORT, HOST, () => {
  console.log(`NanoClaw Mission Control running at http://${HOST}:${PORT}`);
  console.log(`Dashboard auth token: ${DASHBOARD_TOKEN}`);

  // Auto-scan Gmail for receipts every 15 minutes
  const SCAN_INTERVAL = 15 * 60 * 1000;
  const runAutoScan = async () => {
    try {
      const result = await postAccountingScanEmail();
      const r = result as { found: number; entries: Array<unknown> };
      if (r.entries?.length) {
        console.log(`[auto-scan] Found ${r.entries.length} new accounting entries`);
      }
    } catch (err) {
      console.error('[auto-scan] Gmail receipt scan failed:', err);
    }
  };
  // Initial scan 30s after startup, then every 15min
  setTimeout(runAutoScan, 30_000);
  setInterval(runAutoScan, SCAN_INTERVAL);

  // Auto-scan Drive Inbox for new uploads every 5 minutes
  const DRIVE_SCAN_INTERVAL = 5 * 60 * 1000;
  const runDriveInboxScan = async () => {
    try {
      const result = await scanDriveInbox();
      if (result.found > 0) {
        console.log(`[drive-inbox] Processed ${result.found} new files: ${result.processed.join(', ')}`);
      }
    } catch (err) {
      console.error('[drive-inbox] Drive inbox scan failed:', err);
    }
  };
  // Initial scan 45s after startup, then every 5min
  setTimeout(runDriveInboxScan, 45_000);
  setInterval(runDriveInboxScan, DRIVE_SCAN_INTERVAL);

  // --- Nightly nutrition snapshot (11:50 PM ET) ---
  // Prevents data loss when agents reset Nutrition-Tracker.md before the dashboard snapshots.
  const scheduleNightlyNutritionSnapshot = () => {
    const now = new Date();
    const target = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    target.setHours(23, 50, 0, 0);
    // If 11:50 PM already passed today, schedule for tomorrow
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    let delayMs = target.getTime() - nowET.getTime();
    if (delayMs <= 0) delayMs += 24 * 60 * 60 * 1000;
    setTimeout(() => {
      try {
        snapshotNutritionDay();
        console.log('[nutrition] Nightly snapshot completed');
      } catch (err) {
        console.error('[nutrition] Nightly snapshot failed:', err);
      }
      // Reschedule for next night
      scheduleNightlyNutritionSnapshot();
    }, delayMs);
    const hours = Math.floor(delayMs / 3600000);
    const mins = Math.floor((delayMs % 3600000) / 60000);
    console.log(`[nutrition] Nightly snapshot scheduled in ${hours}h ${mins}m`);
  };
  scheduleNightlyNutritionSnapshot();
});
