import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  Message,
  TextChannel,
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

export type ApprovalCallback = (
  action: string,
  userId: string,
  messageId: string,
) => void;

export interface DiscordChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  onApproval?: ApprovalCallback;
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadBuffer(res.headers.location));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export class DiscordChannel implements Channel {
  name = 'discord';

  private client: Client | null = null;
  private opts: DiscordChannelOpts;
  private botToken: string;
  /** Maps parent channelId → threadId for routing replies into threads */
  private activeThreads = new Map<string, string>();

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
            descriptions.push(`[File too large to download: ${att.name || 'file'}]`);
            continue;
          }

          try {
            const buf = await downloadBuffer(att.url);
            const safeName = (att.name || `upload-${Date.now()}`)
              .replace(/[^a-zA-Z0-9._-]/g, '_');

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
                /\.(csv|tsv|txt|json|md|yaml|yml|xml|log)$/i.test(att.name || '');
              if (isText) {
                descriptions.push(
                  `[File: ${att.name}]\n${buf.toString('utf8').slice(0, 50_000)}`,
                );
              } else {
                descriptions.push(`[File: ${att.name || 'file'} — not saved, channel unregistered]`);
              }
            }
          } catch (err) {
            logger.warn({ url: att.url, err }, 'Failed to download attachment');
            descriptions.push(`[File: ${att.name || 'file'} — download failed]`);
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
            logger.info({ username: ASSISTANT_NAME }, 'Discord bot username updated');
          } catch (err) {
            logger.warn({ err }, 'Could not update Discord bot username (rate limited?)');
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
      });

      this.client!.login(this.botToken);
    });
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
}
