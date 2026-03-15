import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Message,
  TextChannel,
  ThreadAutoArchiveDuration,
  ThreadChannel,
} from 'discord.js';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import { GROUPS_DIR } from '../config.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';
import { registerChannel } from './registry.js';

export type ApprovalCallback = (
  action: string,
  userId: string,
  messageId: string,
) => void;

export type TaskThreadMessageCallback = (
  threadId: string,
  sender: string,
  message: string,
) => void;

export interface DiscordChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  onApproval?: ApprovalCallback;
  onTaskThreadMessage?: TaskThreadMessageCallback;
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          resolve(downloadBuffer(res.headers.location));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

export class DiscordChannel implements Channel {
  name = 'discord';

  private client: Client | null = null;
  private opts: DiscordChannelOpts;
  private botToken: string;
  /** Maps parent channelId → threadId for routing replies into threads */
  private activeThreads = new Map<string, string>();
  /** Set of thread IDs that are task threads (for routing messages to task_comments) */
  private taskThreadIds = new Set<string>();

  constructor(botToken: string, opts: DiscordChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.client.on(Events.MessageCreate, async (message: Message) => {
      // Ignore bot messages (including own)
      if (message.author.bot) return;

      // Task thread sync: if message is in a known task thread, route to task_comments
      if (
        message.channel.isThread() &&
        this.taskThreadIds.has(message.channelId)
      ) {
        const senderName =
          message.member?.displayName ||
          message.author.displayName ||
          message.author.username;
        if (this.opts.onTaskThreadMessage) {
          this.opts.onTaskThreadMessage(
            message.channelId,
            senderName,
            message.content,
          );
        }
        return; // Don't process as a normal message
      }

      // Thread support: if message is in a thread, resolve to parent channel
      // so it matches the registered group, but track the thread for replies
      let channelId = message.channelId;
      if (message.channel.isThread()) {
        const thread = message.channel as ThreadChannel;
        const parentId = thread.parentId;
        if (parentId) {
          this.activeThreads.set(parentId, channelId);
          channelId = parentId;
        }
      }

      const chatJid = `dc:${channelId}`;
      let content = message.content;
      const timestamp = message.createdAt.toISOString();
      const senderName =
        message.member?.displayName ||
        message.author.displayName ||
        message.author.username;
      const sender = message.author.id;
      const msgId = message.id;

      // Determine chat name
      let chatName: string;
      if (message.guild) {
        const textChannel = message.channel as TextChannel;
        chatName = `${message.guild.name} #${textChannel.name}`;
      } else {
        chatName = senderName;
      }

      // Translate Discord @bot mentions into TRIGGER_PATTERN format.
      // Discord mentions look like <@botUserId> — these won't match
      // TRIGGER_PATTERN (e.g., ^@Andy\b), so we prepend the trigger
      // when the bot is @mentioned.
      if (this.client?.user) {
        const botId = this.client.user.id;
        const isBotMentioned =
          message.mentions.users.has(botId) ||
          content.includes(`<@${botId}>`) ||
          content.includes(`<@!${botId}>`);

        if (isBotMentioned) {
          // Strip the <@botId> mention to avoid visual clutter
          content = content
            .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
            .trim();
          // Prepend trigger if not already present
          if (!TRIGGER_PATTERN.test(content)) {
            content = `@${ASSISTANT_NAME} ${content}`;
          }
        }
      }

      // Handle attachments — download and save all files to the group workspace.
      // Agent reads them at /workspace/group/uploads/<filename>.
      if (message.attachments.size > 0) {
        const descriptions: string[] = [];
        const groupKey = this.opts.registeredGroups()[chatJid]?.folder;

        for (const att of message.attachments.values()) {
          if (!att.url || (att.size ?? 0) > 50_000_000) {
            // Skip files over 50 MB
            descriptions.push(
              `[File too large to download: ${att.name || 'file'}]`,
            );
            continue;
          }

          try {
            const buf = await downloadBuffer(att.url);
            const safeName = (att.name || `upload-${Date.now()}`).replace(
              /[^a-zA-Z0-9._-]/g,
              '_',
            );

            if (groupKey) {
              const uploadsDir = path.join(GROUPS_DIR, groupKey, 'uploads');
              fs.mkdirSync(uploadsDir, { recursive: true });
              fs.writeFileSync(path.join(uploadsDir, safeName), buf);
              const containerPath = `/workspace/group/uploads/${safeName}`;
              descriptions.push(`[Uploaded file: ${containerPath}]`);
              logger.info(
                { group: groupKey, file: safeName, bytes: buf.length },
                'Attachment saved to workspace',
              );
            } else {
              // Unregistered channel — inline text content only
              const isText =
                (att.contentType || '').startsWith('text/') ||
                /\.(csv|tsv|txt|json|md|yaml|yml|xml|log)$/i.test(
                  att.name || '',
                );
              if (isText) {
                descriptions.push(
                  `[File: ${att.name}]\n${buf.toString('utf8').slice(0, 50_000)}`,
                );
              } else {
                descriptions.push(
                  `[File: ${att.name || 'file'} — not saved, channel unregistered]`,
                );
              }
            }
          } catch (err) {
            logger.warn({ url: att.url, err }, 'Failed to download attachment');
            descriptions.push(
              `[File: ${att.name || 'file'} — download failed]`,
            );
          }
        }

        if (content) {
          content = `${content}\n${descriptions.join('\n')}`;
        } else {
          content = descriptions.join('\n');
        }
      }

      // Handle reply context — include who the user is replying to
      if (message.reference?.messageId) {
        try {
          const repliedTo = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          const replyAuthor =
            repliedTo.member?.displayName ||
            repliedTo.author.displayName ||
            repliedTo.author.username;
          content = `[Reply to ${replyAuthor}] ${content}`;
        } catch {
          // Referenced message may have been deleted
        }
      }

      // Store chat metadata for discovery
      this.opts.onChatMetadata(chatJid, timestamp, chatName);

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Discord channel',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Discord message stored',
      );
    });

    // Handle button interactions (approval workflow)
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;

      const [action, refId] = interaction.customId.split(':');
      if (!action || !refId) return;

      logger.info(
        { action, refId, user: interaction.user.tag },
        'Discord button interaction',
      );

      if (this.opts.onApproval) {
        this.opts.onApproval(action, interaction.user.id, refId);
      }

      await interaction.update({
        content: `${interaction.message.content}\n\n**${action === 'approve' ? 'Approved' : 'Rejected'}** by ${interaction.user.displayName}`,
        components: [], // Remove buttons after click
      });
    });

    // Handle errors gracefully
    this.client.on(Events.Error, (err) => {
      logger.error({ err: err.message }, 'Discord client error');
    });

    return new Promise<void>((resolve) => {
      this.client!.once(Events.ClientReady, async (readyClient) => {
        // Sync bot username to ASSISTANT_NAME if it differs
        if (readyClient.user.username !== ASSISTANT_NAME) {
          try {
            await readyClient.user.setUsername(ASSISTANT_NAME);
            logger.info(
              { username: ASSISTANT_NAME },
              'Discord bot username updated',
            );
          } catch (err) {
            logger.warn(
              { err },
              'Could not update Discord bot username (rate limited?)',
            );
          }
        }
        logger.info(
          { username: readyClient.user.tag, id: readyClient.user.id },
          'Discord bot connected',
        );
        console.log(`\n  Discord bot: ${readyClient.user.tag}`);
        console.log(
          `  Use /chatid command or check channel IDs in Discord settings\n`,
        );
        resolve();

        // Backfill missed messages: fetch recent messages from registered channels
        // that arrived while the bot was offline (e.g. during restart)
        this.backfillMissedMessages(readyClient).catch((err) =>
          logger.warn({ err }, 'Discord backfill failed'),
        );
      });

      this.client!.login(this.botToken);
    });
  }

  /**
   * Fetch recent messages from all registered Discord channels and store any
   * that arrived while the bot was offline (e.g. during a restart).
   */
  private async backfillMissedMessages(
    readyClient: Client<true>,
  ): Promise<void> {
    const groups = this.opts.registeredGroups();
    let backfilled = 0;

    for (const [jid, group] of Object.entries(groups)) {
      const channelId = jid.replace(/^dc:/, '');
      try {
        const channel = await readyClient.channels.fetch(channelId);
        if (!channel || !('messages' in channel)) continue;

        const textChannel = channel as TextChannel;
        // Fetch last 20 messages — enough to cover a short restart window
        const messages = await textChannel.messages.fetch({ limit: 20 });

        for (const msg of messages.values()) {
          if (msg.author.bot) continue;

          const senderName =
            msg.member?.displayName ||
            msg.author.displayName ||
            msg.author.username;
          let content = msg.content;

          // Translate @bot mentions same as live handler
          if (readyClient.user) {
            const botId = readyClient.user.id;
            const isBotMentioned =
              msg.mentions.users.has(botId) ||
              content.includes(`<@${botId}>`) ||
              content.includes(`<@!${botId}>`);
            if (isBotMentioned) {
              content = content
                .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
                .trim();
              if (!TRIGGER_PATTERN.test(content)) {
                content = `@${ASSISTANT_NAME} ${content}`;
              }
            }
          }

          // Handle attachments during backfill (same logic as live handler)
          if (msg.attachments.size > 0 && group.folder) {
            const descriptions: string[] = [];
            for (const att of msg.attachments.values()) {
              if (!att.url || (att.size ?? 0) > 50_000_000) {
                descriptions.push(
                  `[File too large to download: ${att.name || 'file'}]`,
                );
                continue;
              }
              try {
                const buf = await downloadBuffer(att.url);
                const safeName = (att.name || `upload-${Date.now()}`).replace(
                  /[^a-zA-Z0-9._-]/g,
                  '_',
                );
                const uploadsDir = path.join(
                  GROUPS_DIR,
                  group.folder,
                  'uploads',
                );
                fs.mkdirSync(uploadsDir, { recursive: true });
                const filePath = path.join(uploadsDir, safeName);
                if (!fs.existsSync(filePath)) {
                  fs.writeFileSync(filePath, buf);
                  logger.info(
                    { group: group.folder, file: safeName, bytes: buf.length },
                    'Backfill attachment saved',
                  );
                }
                descriptions.push(
                  `[Uploaded file: /workspace/group/uploads/${safeName}]`,
                );
              } catch (err) {
                logger.warn(
                  { url: att.url, err },
                  'Failed to download backfill attachment',
                );
                descriptions.push(
                  `[File: ${att.name || 'file'} — download failed]`,
                );
              }
            }
            if (content) {
              content = `${content}\n${descriptions.join('\n')}`;
            } else {
              content = descriptions.join('\n');
            }
          }

          // onMessage uses INSERT OR REPLACE so duplicates are safe
          this.opts.onMessage(jid, {
            id: msg.id,
            chat_jid: jid,
            sender: msg.author.id,
            sender_name: senderName,
            content,
            timestamp: msg.createdAt.toISOString(),
            is_from_me: false,
          });
          backfilled++;
        }
      } catch (err) {
        logger.debug({ channelId, err }, 'Could not backfill channel');
      }
    }

    if (backfilled > 0) {
      logger.info({ backfilled }, 'Discord backfill complete');
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.client) {
      logger.warn('Discord client not initialized');
      return;
    }

    try {
      const channelId = jid.replace(/^dc:/, '');

      // Thread support: if a thread is active for this channel, reply there
      const threadId = this.activeThreads.get(channelId);
      const targetId = threadId ?? channelId;
      const channel = await this.client.channels.fetch(targetId);

      if (!channel || !('send' in channel)) {
        logger.warn({ jid }, 'Discord channel not found or not text-based');
        return;
      }

      const textChannel = channel as TextChannel;

      // Discord has a 2000 character limit per message — split if needed
      const MAX_LENGTH = 2000;
      if (text.length <= MAX_LENGTH) {
        await textChannel.send(text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await textChannel.send(text.slice(i, i + MAX_LENGTH));
        }
      }
      logger.info(
        { jid, threadId: threadId ?? null, length: text.length },
        'Discord message sent',
      );
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Discord message');
    }
  }

  /** Send a message with Approve/Reject buttons for agent operation approval */
  async sendApprovalRequest(
    jid: string,
    text: string,
    refId: string,
  ): Promise<void> {
    if (!this.client) return;

    try {
      const channelId = jid.replace(/^dc:/, '');
      const threadId = this.activeThreads.get(channelId);
      const channel = await this.client.channels.fetch(threadId ?? channelId);

      if (!channel || !('send' in channel)) return;

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve:${refId}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject:${refId}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger),
      );

      await (channel as TextChannel).send({
        content: text,
        components: [row],
      });

      logger.info({ jid, refId }, 'Discord approval request sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Discord approval request');
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.isReady();
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('dc:');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      logger.info('Discord bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.client || !isTyping) return;
    try {
      const channelId = jid.replace(/^dc:/, '');
      const channel = await this.client.channels.fetch(channelId);
      if (channel && 'sendTyping' in channel) {
        await (channel as TextChannel).sendTyping();
      }
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Discord typing indicator');
    }
  }

  /** Create a Discord thread for a task. Returns the thread ID. */
  async createTaskThread(
    jid: string,
    threadName: string,
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const channelId = jid.replace(/^dc:/, '');
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) return null;

      const textChannel = channel as TextChannel;
      // Truncate thread name to Discord's 100-char limit
      const name =
        threadName.length > 100
          ? threadName.substring(0, 97) + '...'
          : threadName;
      const thread = await textChannel.threads.create({
        name,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: 'NanoClaw task thread',
      });
      this.taskThreadIds.add(thread.id);
      logger.info({ jid, threadId: thread.id, name }, 'Task thread created');
      return thread.id;
    } catch (err) {
      logger.error({ jid, err }, 'Failed to create task thread');
      return null;
    }
  }

  /** Send a message to a specific thread by ID */
  async sendToThread(threadId: string, text: string): Promise<void> {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(threadId);
      if (!channel || !('send' in channel)) return;

      const MAX_LENGTH = 2000;
      if (text.length <= MAX_LENGTH) {
        await (channel as ThreadChannel).send(text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await (channel as ThreadChannel).send(text.slice(i, i + MAX_LENGTH));
        }
      }
    } catch (err) {
      logger.error({ threadId, err }, 'Failed to send to task thread');
    }
  }

  /** Archive (close) a task thread */
  async archiveTaskThread(threadId: string): Promise<void> {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(threadId);
      if (channel && channel.isThread()) {
        await (channel as ThreadChannel).setArchived(true);
        this.taskThreadIds.delete(threadId);
        logger.info({ threadId }, 'Task thread archived');
      }
    } catch (err) {
      logger.error({ threadId, err }, 'Failed to archive task thread');
    }
  }

  /** Register an existing thread ID as a task thread (for reconnection) */
  registerTaskThread(threadId: string): void {
    this.taskThreadIds.add(threadId);
  }
}

registerChannel('discord', (opts) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return new DiscordChannel(token, opts);
});
