import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
} from 'discord.js';

import { ASSISTANT_NAME } from '../config.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

const MAX_MESSAGE_LENGTH = 2000;

export interface DiscordChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class DiscordChannel implements Channel {
  name = 'discord';

  private client: Client | null = null;
  private connected = false;
  private botToken: string;
  private opts: DiscordChannelOpts;

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
      ],
    });

    this.client.on(Events.ClientReady, (readyClient) => {
      this.connected = true;
      logger.info(
        { username: readyClient.user.username, id: readyClient.user.id },
        'Discord bot connected',
      );
      console.log(`\n  Discord bot: ${readyClient.user.tag}`);
      console.log(
        `  Use /channelid in a channel to get its registration ID\n`,
      );
    });

    this.client.on(Events.MessageCreate, async (message) => {
      // Skip bot messages to avoid loops
      if (message.author.bot) return;

      // Only handle text channels in guilds
      if (!message.guildId || !message.channelId) return;

      const chatJid = `dc:${message.channelId}`;
      const timestamp = message.createdAt.toISOString();
      const senderName =
        message.member?.displayName ||
        message.author.globalName ||
        message.author.username;
      const sender = message.author.id;
      const content = message.content;

      if (!content) return;

      const channelName =
        message.channel instanceof TextChannel
          ? `#${message.channel.name}`
          : chatJid;

      // Store chat metadata for discovery
      this.opts.onChatMetadata(chatJid, timestamp, channelName, 'discord', false);

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, channelName },
          'Message from unregistered Discord channel',
        );
        return;
      }

      this.opts.onMessage(chatJid, {
        id: message.id,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: false,
      });

      logger.info(
        { chatJid, channelName, sender: senderName },
        'Discord message stored',
      );
    });

    // /channelid helper — lets user discover channel IDs for registration
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== 'channelid') return;

      const channelId = interaction.channelId;
      const jid = `dc:${channelId}`;
      await interaction.reply({
        content: `Channel ID: \`${jid}\`\nRegister with: \`DISCORD_CHANNEL_JID=${jid}\``,
        ephemeral: true,
      });
    });

    this.client.on(Events.Error, (err) => {
      logger.error({ err }, 'Discord client error');
    });

    return new Promise<void>((resolve, reject) => {
      this.client!.once(Events.ClientReady, () => resolve());
      this.client!.login(this.botToken).catch(reject);
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn({ jid }, 'Discord not connected, cannot send message');
      return;
    }

    const channelId = jid.replace(/^dc:/, '');
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.warn({ jid }, 'Discord channel not found or not a text channel');
        return;
      }

      // Prefix with assistant name so it's clear who's speaking
      const prefixed = `**${ASSISTANT_NAME}:** ${text}`;

      if (prefixed.length <= MAX_MESSAGE_LENGTH) {
        await channel.send(prefixed);
      } else {
        // Split on the prefix once, then send remaining chunks plain
        const chunks: string[] = [];
        let remaining = prefixed;
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, MAX_MESSAGE_LENGTH));
          remaining = remaining.slice(MAX_MESSAGE_LENGTH);
        }
        for (const chunk of chunks) {
          await channel.send(chunk);
        }
      }

      logger.info({ jid, length: prefixed.length }, 'Discord message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Discord message');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('dc:');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.connected = false;
      this.client.destroy();
      this.client = null;
      logger.info('Discord bot disconnected');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.client || !this.connected || !isTyping) return;
    const channelId = jid.replace(/^dc:/, '');
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel instanceof TextChannel) {
        await channel.sendTyping();
      }
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Discord typing indicator');
    }
  }
}
