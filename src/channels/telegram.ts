import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';

import { Api, Bot } from 'grammy';

import { ASSISTANT_NAME, GROUPS_DIR, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
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

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);

    // Command to get chat ID (useful for registration)
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, chatName, 'telegram', isGroup);

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
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
        'Telegram message stored',
      );
    });

    // Helper: download a Telegram file by file_id and save to group uploads
    const downloadTelegramFile = async (
      fileId: string,
      fileName: string,
      groupFolder: string,
    ): Promise<string | null> => {
      try {
        const file = await this.bot!.api.getFile(fileId);
        if (!file.file_path) return null;

        const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
        const buf = await downloadBuffer(url);

        if (buf.length > 50_000_000) return null; // Skip files over 50MB

        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uploadsDir = path.join(GROUPS_DIR, groupFolder, 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, safeName), buf);
        // Make writable by container node user
        fs.chmodSync(path.join(uploadsDir, safeName), 0o666);

        logger.info(
          { group: groupFolder, file: safeName, bytes: buf.length },
          'Telegram attachment saved to workspace',
        );
        return `/workspace/group/uploads/${safeName}`;
      } catch (err) {
        logger.error({ fileId, fileName, err }, 'Failed to download Telegram file');
        return null;
      }
    };

    // Handle non-text messages — download files when possible
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    // Photos — download largest resolution
    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1]; // Last is highest res
      const fileName = `photo-${Date.now()}.jpg`;
      const containerPath = await downloadTelegramFile(largest.file_id, fileName, group.folder);

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';
      const content = containerPath
        ? `[Photo: ${containerPath}]${caption}`
        : `[Photo — download failed]${caption}`;

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });

    // Documents (PDF, etc.)
    this.bot.on('message:document', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const doc = ctx.message.document;
      const fileName = doc?.file_name || `document-${Date.now()}`;
      const fileId = doc?.file_id;
      let content: string;

      if (fileId && (doc?.file_size ?? 0) <= 50_000_000) {
        const containerPath = await downloadTelegramFile(fileId, fileName, group.folder);
        const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';
        content = containerPath
          ? `[Document: ${containerPath}]${caption}`
          : `[Document: ${fileName} — download failed]${caption}`;
      } else {
        content = `[Document too large: ${fileName}]`;
      }

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });

    // Video
    this.bot.on('message:video', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const video = ctx.message.video;
      const fileName = video?.file_name || `video-${Date.now()}.mp4`;
      const fileId = video?.file_id;
      let content: string;

      if (fileId && (video?.file_size ?? 0) <= 50_000_000) {
        const containerPath = await downloadTelegramFile(fileId, fileName, group.folder);
        const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';
        content = containerPath
          ? `[Video: ${containerPath}]${caption}`
          : `[Video: ${fileName} — download failed]${caption}`;
      } else {
        content = `[Video too large: ${fileName}]`;
      }

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const voice = ctx.message.voice;
      const fileName = `voice-${Date.now()}.ogg`;
      const containerPath = await downloadTelegramFile(voice.file_id, fileName, group.folder);
      const content = containerPath
        ? `[Voice message: ${containerPath}]`
        : '[Voice message — download failed]';

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });

    // Audio files
    this.bot.on('message:audio', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const audio = ctx.message.audio;
      const fileName = audio?.file_name || `audio-${Date.now()}.mp3`;
      const containerPath = await downloadTelegramFile(audio.file_id, fileName, group.folder);
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';
      const content = containerPath
        ? `[Audio: ${containerPath}]${caption}`
        : `[Audio: ${fileName} — download failed]${caption}`;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });

    // Stickers, location, contact — keep as placeholders (no file to download)
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await this.bot.api.sendMessage(numericId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await this.bot.api.sendMessage(
            numericId,
            text.slice(i, i + MAX_LENGTH),
          );
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

// ── Agent Swarm: Bot Pool ──────────────────────────────────────────────────
// Each pool bot represents a different agent persona in Telegram groups.

const poolApis: Api[] = [];
const senderBotMap = new Map<string, number>(); // sender name → pool index
let nextPoolIndex = 0;

export async function initBotPool(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    try {
      const api = new Api(token);
      const me = await api.getMe();
      poolApis.push(api);
      logger.info(
        { username: me.username, index: poolApis.length - 1 },
        'Pool bot initialized',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize pool bot');
    }
  }
  logger.info({ count: poolApis.length }, 'Telegram bot pool ready');
}

export async function sendPoolMessage(
  chatId: string,
  text: string,
  sender: string,
  _groupFolder: string,
): Promise<void> {
  if (poolApis.length === 0) {
    logger.warn('No pool bots available, falling back to main bot');
    return;
  }

  // Assign a stable pool bot to each sender name
  let idx = senderBotMap.get(sender);
  if (idx === undefined) {
    idx = nextPoolIndex % poolApis.length;
    nextPoolIndex++;
    senderBotMap.set(sender, idx);
    logger.info({ sender, poolIndex: idx }, 'Assigned pool bot to sender');
  }

  const api = poolApis[idx];
  const numericId = chatId.replace(/^tg:/, '');

  try {
    const prefix = `*${sender}*\n`;
    const fullText = `${prefix}${text}`;

    const MAX_LENGTH = 4096;
    const sendChunk = async (chunk: string): Promise<void> => {
      try {
        await api.sendMessage(numericId, chunk, { parse_mode: 'Markdown' });
      } catch {
        // Markdown parse failed — retry as plain text
        await api.sendMessage(numericId, chunk);
      }
    };

    if (fullText.length <= MAX_LENGTH) {
      await sendChunk(fullText);
    } else {
      const chunks: string[] = [];
      chunks.push(fullText.slice(0, MAX_LENGTH));
      for (let i = MAX_LENGTH; i < fullText.length; i += MAX_LENGTH) {
        chunks.push(fullText.slice(i, i + MAX_LENGTH));
      }
      for (const chunk of chunks) {
        await sendChunk(chunk);
      }
    }
    logger.info(
      { chatId, sender, poolIndex: idx, length: text.length },
      'Pool message sent',
    );
  } catch (err) {
    logger.error({ chatId, sender, poolIndex: idx, err }, 'Failed to send pool message');
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token =
    process.env.TELEGRAM_BOT_TOKEN || envVars.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  return new TelegramChannel(token, opts);
});
