import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  CREDENTIAL_PROXY_PORT,
  DATA_DIR,
  IDLE_TIMEOUT,
  POLL_INTERVAL,
  TRIGGER_PATTERN,
} from './config.js';
import { startCredentialProxy } from './credential-proxy.js';
import './channels/index.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
  PROXY_BIND_HOST,
} from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
  addTaskComment,
  drainPendingThreadMessages,
  getAllProjectThreads,
  getProjectByThreadId,
  getTaskById,
  getTaskByThreadId,
  getTaskThreadId,
  setProjectThreadId,
  setTaskThreadId,
  updateTask,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
import { startSchedulerLoop, taskTitle } from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

const channels: Channel[] = [];
const queue = new GroupQueue();

// Cancellers registered by handleMessage so IPC send_message can suppress the ack timer
const ackCancellers = new Map<string, () => void>();

/** Send a message via the channel AND store it in the DB so the dashboard chat can show it. */
async function sendAndStore(
  channel: Channel,
  jid: string,
  text: string,
): Promise<void> {
  await channel.sendMessage(jid, text);
  try {
    storeMessage({
      id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      chat_jid: jid,
      sender: ASSISTANT_NAME,
      sender_name: ASSISTANT_NAME,
      content: text.substring(0, 4000),
      timestamp: new Date().toISOString(),
      is_from_me: true,
      is_bot_message: true,
    } as NewMessage);
  } catch {
    // Non-critical — don't break message delivery if DB write fails
  }
}

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = missedMessages.some(
      (m) =>
        TRIGGER_PATTERN.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  await channel.setTyping?.(chatJid, true);
  // Keep typing indicator alive — Discord's expires after ~10s
  const typingInterval = setInterval(() => {
    channel.setTyping?.(chatJid, true)?.catch(() => {});
  }, 8000);

  let hadError = false;
  let outputSentToUser = false;
  const ackTimer = setTimeout(() => {
    if (!outputSentToUser) {
      channel.sendMessage(chatJid, '⏳ On it...').catch(() => {});
      outputSentToUser = true;
    }
  }, 8000);
  // Allow IPC send_message to cancel the ack timer (avoids duplicate "On it")
  ackCancellers.set(chatJid, () => {
    clearTimeout(ackTimer);
    outputSentToUser = true;
  });

  const output = await runAgent(group, prompt, chatJid, async (result) => {
    // Streaming output callback — called for each agent result
    if (result.result) {
      const raw =
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result);

      // Detect API errors returned as "successful" results — don't forward to user
      const isApiError =
        /^API Error: \d{3}\b/.test(raw) ||
        /overloaded_error|"type":"error"/.test(raw);
      if (isApiError) {
        logger.warn(
          { group: group.name },
          `Suppressing API error from user output: ${raw.slice(0, 200)}`,
        );
        hadError = true;
        return;
      }

      // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        clearTimeout(ackTimer);
        await sendAndStore(channel, chatJid, text);
        outputSentToUser = true;
      }
      // Only reset idle timer on actual results, not session-update markers (result: null)
      resetIdleTimer();
    }

    if (result.status === 'success') {
      queue.notifyIdle(chatJid);
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

  clearInterval(typingInterval);
  clearTimeout(ackTimer);
  ackCancellers.delete(chatJid);
  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    // But DO notify the user that the agent crashed mid-response.
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, notifying user',
      );
      try {
        await sendAndStore(
          channel,
          chatJid,
          '⚠️ Agent crashed mid-response. Reply to retry or the next message will resume from here.',
        );
      } catch {
        // Best-effort notification
      }
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

// Rotate session if JSONL exceeds this threshold (prevents API timeouts on resume)
const MAX_SESSION_BYTES = parseInt(
  process.env.MAX_SESSION_BYTES || '524288',
  10,
); // 512KB
const RESUME_TAIL_MESSAGES = 10; // number of recent messages to include in RESUME.md

/**
 * Extract the last N user/assistant text exchanges from a JSONL session file
 * and write a RESUME.md so the fresh session has context.
 */
function writeResumeMd(jsonlPath: string, groupFolder: string): void {
  try {
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const messages: { role: string; text: string }[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' && entry.message?.content) {
          const text =
            typeof entry.message.content === 'string'
              ? entry.message.content
              : entry.message.content
                  .map((c: { text?: string }) => c.text || '')
                  .join('');
          if (text) messages.push({ role: 'user', text });
        } else if (entry.type === 'assistant' && entry.message?.content) {
          const parts = entry.message.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text);
          if (parts.length > 0)
            messages.push({ role: 'assistant', text: parts.join('\n') });
        }
      } catch {
        /* skip malformed lines */
      }
    }

    if (messages.length === 0) return;

    const tail = messages.slice(-RESUME_TAIL_MESSAGES);
    const now = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
    });
    const lines = [
      `# RESUME — Session rotated ${now} ET`,
      '',
      'The previous session was rotated because it grew too large. Continue from where things left off.',
      'For older context, check `conversations/` folder or search the Obsidian vault.',
      '',
      '## Last conversation excerpt',
      '',
    ];
    for (const msg of tail) {
      const prefix = msg.role === 'user' ? '**User:**' : '**Agent:**';
      // Truncate long messages to keep RESUME.md concise
      const truncated =
        msg.text.length > 500 ? msg.text.slice(0, 500) + '...' : msg.text;
      lines.push(`${prefix} ${truncated}`, '');
    }

    const groupDir = resolveGroupFolderPath(groupFolder);
    fs.writeFileSync(path.join(groupDir, 'RESUME.md'), lines.join('\n'));
    logger.info({ group: groupFolder }, 'Wrote RESUME.md for session rotation');
  } catch (err) {
    logger.warn(
      { group: groupFolder, err },
      'Failed to write RESUME.md during rotation',
    );
  }
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.isMain === true;
  let sessionId = sessions[group.folder];

  // Auto-rotate bloated sessions to avoid API timeouts on resume
  if (sessionId) {
    const jsonlPath = path.join(
      DATA_DIR,
      'sessions',
      group.folder,
      '.claude',
      'projects',
      '-workspace-group',
      `${sessionId}.jsonl`,
    );
    try {
      const stat = fs.statSync(jsonlPath);
      if (stat.size > MAX_SESSION_BYTES) {
        logger.info(
          {
            group: group.name,
            sessionId,
            size: stat.size,
            threshold: MAX_SESSION_BYTES,
          },
          'Session JSONL exceeds threshold, rotating to fresh session',
        );
        writeResumeMd(jsonlPath, group.folder);
        sessionId = '';
        sessions[group.folder] = '';
        setSession(group.folder, '');
      }
    } catch {
      // JSONL doesn't exist (stale session ID) — clear it
      logger.info(
        { group: group.name, sessionId },
        'Session JSONL missing, clearing stale session ID',
      );
      sessionId = '';
      sessions[group.folder] = '';
      setSession(group.folder, '');
    }
  }

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName) =>
        queue.registerProcess(chatJid, proc, containerName, group.folder),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      const isRateLimit =
        output.error?.includes('rate limit') ||
        output.error?.includes('Rate limit');
      if (isRateLimit) {
        logger.warn(
          { group: group.name, error: output.error },
          'API rate limit hit, backing off 60s before retry',
        );
        await new Promise((r) => setTimeout(r, 60_000));
      } else {
        logger.error(
          { group: group.name, error: output.error },
          'Container agent error',
        );
      }
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
            continue;
          }

          const isMainGroup = group.isMain === true;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const allowlistCfg = loadSenderAllowlist();
            const hasTrigger = groupMessages.some(
              (m) =>
                TRIGGER_PATTERN.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            // No active container — enqueue for a new one
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Start credential proxy (containers route API calls through this)
  await startCredentialProxy(CREDENTIAL_PROXY_PORT, PROXY_BIND_HOST);

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
    // Discord thread ↔ task discussion sync: route thread messages to task_comments
    onTaskThreadMessage: (
      threadId: string,
      sender: string,
      message: string,
    ) => {
      // Check if this thread belongs to a project
      const projectFile = getProjectByThreadId(threadId);
      if (projectFile) {
        addTaskComment(`proj:${projectFile}`, 'user', message, 'info');
        logger.info(
          { projectFile, sender, threadId },
          'Discord thread message stored as project comment',
        );
        return;
      }

      const task = getTaskByThreadId(threadId);
      if (!task) {
        logger.warn({ threadId }, 'Message in unknown task/project thread');
        return;
      }
      addTaskComment(task.id, 'user', message, 'info');
      // Trigger task re-run when user replies in thread
      const now = new Date().toISOString();
      const currentTask = getTaskById(task.id);
      if (
        currentTask &&
        (currentTask.status === 'active' || currentTask.status === 'disabled')
      ) {
        updateTask(task.id, { next_run: now, status: 'active' });
      }
      logger.info(
        { taskId: task.id, sender, threadId },
        'Discord thread message stored as task comment',
      );
    },
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Find the Discord channel for thread operations
  const discordChannel = channels.find((ch) => ch.name === 'discord') as
    | (Channel & {
        createTaskThread?: (
          jid: string,
          name: string,
        ) => Promise<string | null>;
        sendToThread?: (threadId: string, text: string) => Promise<void>;
        archiveTaskThread?: (threadId: string) => Promise<void>;
        registerTaskThread?: (threadId: string) => void;
      })
    | undefined;

  // Register existing task threads so Discord channel routes messages to task_comments
  if (discordChannel?.registerTaskThread) {
    const tasks = getAllTasks();
    for (const t of tasks) {
      if (t.thread_id) {
        discordChannel.registerTaskThread(t.thread_id);
      }
    }
    logger.info(
      { count: tasks.filter((t) => t.thread_id).length },
      'Registered existing task threads',
    );

    // Register existing project threads too
    const projectThreads = getAllProjectThreads();
    for (const pt of projectThreads) {
      discordChannel.registerTaskThread(pt.thread_id);
    }
    if (projectThreads.length > 0) {
      logger.info(
        { count: projectThreads.length },
        'Registered existing project threads',
      );
    }

    // Create Discord threads for active tasks that don't have one yet
    if (discordChannel.createTaskThread) {
      const tasksNeedingThreads = tasks.filter(
        (t) =>
          !t.thread_id &&
          (t.status === 'active' || t.status === 'disabled') &&
          t.chat_jid.startsWith('dc:'),
      );
      for (const t of tasksNeedingThreads) {
        try {
          const title = taskTitle(t.prompt);
          const threadId = await discordChannel.createTaskThread(
            t.chat_jid,
            title,
          );
          if (threadId) {
            setTaskThreadId(t.id, threadId);
            discordChannel.registerTaskThread!(threadId);
            logger.info(
              { taskId: t.id, threadId, title },
              'Created Discord thread for existing task',
            );
          }
        } catch (err) {
          logger.error(
            { taskId: t.id, err },
            'Failed to create thread for existing task',
          );
        }
      }
      if (tasksNeedingThreads.length > 0) {
        logger.info(
          { count: tasksNeedingThreads.length },
          'Created threads for existing tasks',
        );
      }
    }
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await sendAndStore(channel, jid, text);
    },
    createTaskThread: discordChannel?.createTaskThread?.bind(discordChannel),
    sendToThread: discordChannel?.sendToThread?.bind(discordChannel),
  });

  // Poll for pending thread messages from dashboard → Discord
  if (discordChannel?.sendToThread) {
    const pollThreadMessages = async () => {
      try {
        const pending = drainPendingThreadMessages(10); // batch limit per poll cycle
        for (const msg of pending) {
          // Throttle to avoid Discord rate limits (especially during backfill)
          if (pending.length > 1) await new Promise((r) => setTimeout(r, 1500));
          if (
            msg.message === '__ARCHIVE_THREAD__' &&
            discordChannel.archiveTaskThread
          ) {
            await discordChannel.archiveTaskThread(msg.thread_id);
          } else if (msg.thread_id.startsWith('__CREATE_PROJECT_THREAD__:')) {
            // Create a Discord thread for a project, then send the comment
            const projectFile = msg.thread_id.slice(
              '__CREATE_PROJECT_THREAD__:'.length,
            );
            const projectName = projectFile
              .replace('.md', '')
              .replace(/-/g, ' ');
            if (discordChannel.createTaskThread) {
              const mainJid = Object.keys(registeredGroups).find(
                (jid) => registeredGroups[jid].isMain,
              );
              if (mainJid) {
                const threadId = await discordChannel.createTaskThread(
                  mainJid,
                  `📁 ${projectName}`,
                );
                if (threadId) {
                  setProjectThreadId(projectFile, threadId);
                  discordChannel.registerTaskThread!(threadId);
                  const label =
                    msg.sender === 'user'
                      ? '💬 **You**'
                      : `💬 **${msg.sender}**`;
                  await discordChannel.sendToThread!(
                    threadId,
                    `${label}: ${msg.message}`,
                  );
                  logger.info(
                    { projectFile, threadId },
                    'Created Discord thread for project',
                  );
                }
              }
            }
          } else if (msg.sender === '__raw__' || msg.sender === 'system') {
            await discordChannel.sendToThread!(msg.thread_id, msg.message);
          } else {
            const label =
              msg.sender === 'user' ? '💬 **You**' : `💬 **${msg.sender}**`;
            await discordChannel.sendToThread!(
              msg.thread_id,
              `${label}: ${msg.message}`,
            );
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error polling pending thread messages');
      }
      setTimeout(pollThreadMessages, 3000);
    };
    pollThreadMessages();
  }

  startIpcWatcher({
    sendMessage: (jid, text) => {
      // Cancel the ack timer for this JID — agent already responded via send_message
      ackCancellers.get(jid)?.();
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return sendAndStore(channel, jid, text);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
    addTaskComment,
  });
  queue.setProcessMessagesFn(processGroupMessages);
  queue.startSessionWatchdog();
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
