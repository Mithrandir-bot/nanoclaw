/**
 * Migration: Discord threads → dedicated channels
 *
 * 1. Finds the 3 threads under #general by name
 * 2. Copies all messages to the new dedicated channels (with attribution)
 * 3. Fixes the missing `dc:` prefix in registered_groups
 * 4. Migrates the AI Research Team session from folder `main` → `ai-research`
 */

import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  ThreadChannel,
  Collection,
  Message,
  FetchedThreads,
} from 'discord.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env manually
function loadEnv(): Record<string, string> {
  const envPath = path.join(ROOT, '.env');
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

const env = loadEnv();
const BOT_TOKEN = env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || '';
if (!BOT_TOKEN) {
  console.error('ERROR: DISCORD_BOT_TOKEN not found in .env');
  process.exit(1);
}

// Thread name → new channel name mapping
const THREAD_TO_CHANNEL: Record<string, string> = {
  'health': '#health-wellness',
  'wellness': '#health-wellness',
  'health/wellness': '#health-wellness',
  'health-wellness': '#health-wellness',
  'business ideas': '#business-ideas',
  'business-ideas': '#business-ideas',
  'ai research team': '#ai-research',
  'ai research': '#ai-research',
};

// New channel name → DB JID (the already-known IDs from chats table)
const CHANNEL_NAME_TO_JID: Record<string, string> = {
  '#health-wellness': 'dc:1476293450402889949',
  '#business-ideas': 'dc:1476293406375542876',
  '#ai-research': 'dc:1476293323860869251',
};

// Old AI Research Team thread JID (registered as "main")
const OLD_AI_RESEARCH_JID = 'dc:1474853349676286145';

async function fetchAllMessages(thread: ThreadChannel): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  while (true) {
    const batch: Collection<string, Message> = await thread.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  // Return in chronological order (oldest first)
  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function matchThreadToChannel(threadName: string): string | null {
  const lower = threadName.toLowerCase().trim();
  for (const [key, channel] of Object.entries(THREAD_TO_CHANNEL)) {
    if (lower.includes(key)) return channel;
  }
  return null;
}

async function migrateThread(
  thread: ThreadChannel,
  targetChannel: TextChannel,
  targetChannelLabel: string,
): Promise<number> {
  console.log(`\n  Fetching messages from thread: "${thread.name}"...`);
  const messages = await fetchAllMessages(thread);
  console.log(`  Found ${messages.length} messages`);

  if (messages.length === 0) return 0;

  // Post a header
  await targetChannel.send(
    `📦 **Thread archive from #general → "${thread.name}"**\n` +
    `Migrated ${messages.length} messages on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n` +
    `${'─'.repeat(40)}`,
  );

  let count = 0;
  const MAX_LENGTH = 1900;

  for (const msg of messages) {
    if (msg.author.bot && msg.content === '') continue; // skip empty bot messages

    const author = msg.member?.displayName || msg.author.displayName || msg.author.username;
    const ts = msg.createdAt.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    });

    let body = msg.content || '';

    // Include attachments
    if (msg.attachments.size > 0) {
      const attList = [...msg.attachments.values()].map(a => a.url || a.name || 'attachment').join('\n');
      body = body ? `${body}\n${attList}` : attList;
    }

    if (!body.trim()) continue;

    const header = `**${author}** · ${ts}\n`;
    const full = header + body;

    // Split if over Discord limit
    if (full.length <= MAX_LENGTH) {
      await targetChannel.send(full);
    } else {
      // Send header then body in chunks
      let remaining = body;
      let first = true;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, MAX_LENGTH - (first ? header.length : 0));
        await targetChannel.send(first ? header + chunk : chunk);
        remaining = remaining.slice(chunk.length);
        first = false;
      }
    }
    count++;

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  return count;
}

function fixDatabase() {
  const dbPath = path.join(ROOT, 'store', 'messages.db');
  const db = new Database(dbPath);

  console.log('\n--- Database Migration ---');

  // 1. Fix missing dc: prefix in registered_groups
  const badJids = db.prepare(
    `SELECT jid, name, folder FROM registered_groups WHERE jid NOT LIKE 'dc:%'`
  ).all() as { jid: string; name: string; folder: string }[];

  for (const row of badJids) {
    const fixedJid = `dc:${row.jid}`;
    console.log(`  Fixing JID: ${row.jid} → ${fixedJid} (${row.name})`);
    db.prepare(`UPDATE registered_groups SET jid = ? WHERE jid = ?`).run(fixedJid, row.jid);
  }
  if (badJids.length === 0) console.log('  JID prefixes already correct');

  // 2. Migrate AI Research Team session from "main" → "ai-research"
  const aiSession = db.prepare(
    `SELECT session_id FROM sessions WHERE group_folder = 'main'`
  ).get() as { session_id: string } | undefined;

  if (aiSession) {
    // Check if ai-research session already exists
    const existing = db.prepare(
      `SELECT group_folder FROM sessions WHERE group_folder = 'ai-research'`
    ).get();

    if (!existing) {
      console.log(`  Migrating session: main → ai-research (session ${aiSession.session_id})`);
      db.prepare(`INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES ('ai-research', ?)`)
        .run(aiSession.session_id);
    } else {
      console.log(`  ai-research session already exists, keeping both`);
    }
  }

  // 3. Migrate messages from old AI Research Team thread to new channel
  const oldMsgCount = (db.prepare(
    `SELECT COUNT(*) as c FROM messages WHERE chat_jid = ?`
  ).get(OLD_AI_RESEARCH_JID) as { c: number }).c;

  const newJid = CHANNEL_NAME_TO_JID['#ai-research'];
  const newMsgCount = (db.prepare(
    `SELECT COUNT(*) as c FROM messages WHERE chat_jid = ?`
  ).get(newJid) as { c: number }).c;

  if (oldMsgCount > 0 && newMsgCount === 0) {
    console.log(`  Migrating ${oldMsgCount} messages: ${OLD_AI_RESEARCH_JID} → ${newJid}`);
    db.prepare(`UPDATE messages SET chat_jid = ? WHERE chat_jid = ?`).run(newJid, OLD_AI_RESEARCH_JID);

    // Ensure the target chat row exists
    db.prepare(`INSERT OR IGNORE INTO chats (jid, name, last_message_time, channel, is_group)
                SELECT ?, name, last_message_time, channel, is_group FROM chats WHERE jid = ?`)
      .run(newJid, OLD_AI_RESEARCH_JID);
  } else if (newMsgCount > 0) {
    console.log(`  ai-research channel already has ${newMsgCount} messages, skipping message migration`);
  }

  // 4. Deregister the old AI Research Team thread from main
  const oldReg = db.prepare(
    `SELECT jid, folder FROM registered_groups WHERE jid = ?`
  ).get(OLD_AI_RESEARCH_JID) as { jid: string; folder: string } | undefined;

  if (oldReg && oldReg.folder === 'main') {
    console.log(`  Deregistering old AI Research Team thread (${OLD_AI_RESEARCH_JID}) from registered_groups`);
    db.prepare(`DELETE FROM registered_groups WHERE jid = ?`).run(OLD_AI_RESEARCH_JID);
    console.log(`  Note: "main" folder data is preserved in groups/main/ — rename/archive manually if desired`);
  }

  db.close();
  console.log('  Database migration complete');
}

async function main() {
  console.log('=== Discord Thread Migration ===\n');

  // Step 1: Fix the database
  fixDatabase();

  // Step 2: Connect to Discord and migrate thread messages
  console.log('\n--- Discord Message Migration ---');
  console.log('Connecting to Discord...');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await new Promise<void>((resolve) => {
    client.once(Events.ClientReady, () => {
      console.log(`Connected as: ${client.user?.tag}`);
      resolve();
    });
    client.login(BOT_TOKEN);
  });

  try {
    // Find all guilds
    for (const guild of client.guilds.cache.values()) {
      console.log(`\nServer: ${guild.name}`);

      // Fetch all channels to find #general
      const channels = await guild.channels.fetch();
      const general = channels.find(
        ch => ch?.type === 0 && ch.name.toLowerCase() === 'general'
      ) as TextChannel | undefined;

      if (!general) {
        console.log('  Could not find #general channel, searching all text channels for threads...');
      }

      // Fetch threads — active and archived — from the whole guild
      const activeThreads = await guild.channels.fetchActiveThreads();

      // Build list of threads to process (from #general or all channels)
      const threadsToCheck: ThreadChannel[] = [];
      for (const t of activeThreads.threads.values()) {
        if (!general || t.parentId === general.id) {
          threadsToCheck.push(t as ThreadChannel);
        }
      }

      // Also check archived threads in #general
      if (general && 'threads' in general) {
        try {
          const archived: FetchedThreads = await general.threads.fetchArchived({ limit: 100 });
          for (const t of archived.threads.values()) {
            if (!threadsToCheck.find(x => x.id === t.id)) {
              threadsToCheck.push(t as ThreadChannel);
            }
          }
        } catch {
          // Not a forum channel or no archived threads
        }
      }

      console.log(`  Found ${threadsToCheck.length} thread(s) to check`);

      for (const thread of threadsToCheck) {
        const targetChannelName = matchThreadToChannel(thread.name);
        if (!targetChannelName) {
          console.log(`  Skipping thread: "${thread.name}" (no mapping)`);
          continue;
        }

        const targetJid = CHANNEL_NAME_TO_JID[targetChannelName];
        const targetChannelId = targetJid.replace('dc:', '');
        const targetChannel = channels.get(targetChannelId) as TextChannel | undefined;

        if (!targetChannel) {
          console.log(`  ERROR: Could not find channel ${targetChannelName} (ID: ${targetChannelId})`);
          continue;
        }

        console.log(`\n  Thread: "${thread.name}" → ${targetChannelName}`);
        const count = await migrateThread(thread, targetChannel, targetChannelName);
        console.log(`  Migrated ${count} messages to ${targetChannelName}`);
      }
    }
  } finally {
    client.destroy();
  }

  console.log('\n=== Migration Complete ===');
  console.log('\nNext steps:');
  console.log('  1. Restart nanoclaw: systemctl restart nanoclaw');
  console.log('  2. Tag the agent in each new channel to confirm it responds');
  console.log('  3. Archive the old threads in #general if desired');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
