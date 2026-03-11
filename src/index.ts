import type {
  ChannelPlugin
} from 'openclaw/plugin-sdk/channels/plugins/types.plugin';
import type {
  OpenClawConfig,
  ChannelGatewayContext,
  ChannelOutboundContext,
  ChannelOutboundAdapter,
  ChannelCapabilities,
  ChannelMeta,
  ChannelConfigSchema,
  ChannelConfigAdapter
} from 'openclaw/plugin-sdk';
import type { ChannelStatusIssue } from 'openclaw/plugin-sdk/channels/plugins/types';

import { RedisClientManager } from './lib/redis-client';
import { sendOutboundMessage, SendResult } from './lib/message-sender';
import { RedisChannelAccountConfig, getSubscribeChannel, getPublishChannel, NormalizedMessage, RedisChannelGatewayHandle } from './lib/types';
import globalLogger, { type ILogger } from './lib/logger';
import { startGatewayAccount } from './lib/gateway-manager';

// Get version from package.json
const VERSION = require('../package.json').version;

export const redisChannelPlugin: ChannelPlugin<RedisChannelAccountConfig> = {
  id: 'redis-channel',

  meta: {
    id: 'redis-channel',
    label: `Redis Channel v${VERSION}`,
    selectionLabel: 'Redis Pub/Sub Channel',
    docsPath: '/plugins/redis-channel',
    blurb: `Custom messaging via Redis Pub/Sub mechanism (v${VERSION})`,
    aliases: ['redis', 'redis-pubsub'],
    icon: 'database',
  } as ChannelMeta,

  capabilities: {
    chatTypes: ['direct', 'group'],
    reactions: false,
    edit: false,
    unsend: false,
    reply: false,
    effects: false,
    groupManagement: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
    polls: false,
  } as ChannelCapabilities,

  messaging: {
    targetResolver: {
      hint: "Use device ID (e.g., 'node-sub-1', 'node-parent')",
      looksLikeId: (raw: string, normalized?: string): boolean => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^node-/.test(trimmed)) return true;
        if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return true;
        return false;
      },
    },
  },

  configSchema: {
    schema: {
      type: 'object',
      properties: {
        redisUrl: {
          type: 'string',
          title: 'Redis URL',
          description: 'The connection URL for the Redis server (e.g., redis://localhost:6379).',
        },
        deviceId: {
          type: 'string',
          title: 'Device ID',
          description: 'Unique device identifier.',
        },
        deviceName: {
          type: 'string',
          title: 'Device Name',
          description: 'Device display name.',
        },
        heartbeatInterval: {
          type: 'number',
          title: 'Heartbeat Interval',
          description: 'Heartbeat interval in milliseconds (default: 20000)',
          default: 20000,
        },
        subscribeChannel: {
          type: 'string',
          title: 'Subscribe Channel',
          description: 'The Redis channel to subscribe to for incoming messages. Defaults to openclaw:device:<deviceId>.',
        },
        publishChannel: {
          type: 'string',
          title: 'Publish Channel',
          description: 'The Redis channel to publish outgoing messages. Defaults to openclaw:device:<targetDeviceId>.',
        },
        senderNamePrefix: {
          type: 'string',
          title: 'Sender Name Prefix',
          description: 'Prefix to add to sender names',
        },
        messageFormat: {
          type: 'string',
          enum: ['json', 'text'],
          title: 'Message Format',
          description: 'Format for messages (default: json)',
          default: 'json',
        },
        targetSession: {
          type: 'string',
          title: 'Target Session',
          description: 'Session ID to route messages to (default: agent:main:main)',
          default: 'agent:main:main',
        },
        autoExecute: {
          type: 'boolean',
          title: 'Auto Execute',
          description: 'Automatically execute commands in received messages (default: false)',
          default: false,
        },
        showSenderPrefix: {
          type: 'boolean',
          title: 'Show Sender Prefix',
          description: 'Add [Sender] prefix to message text (default: true)',
          default: true,
        },
      },
      required: ['redisUrl', 'deviceId'],
    },
  } as ChannelConfigSchema,

  config: {
    listAccountIds: (cfg: OpenClawConfig) => {
      const accounts = cfg.channels?.['redis-channel']?.accounts ?? {};
      return Object.keys(accounts).filter(id => accounts[id]?.enabled !== false);
    },

    resolveAccount: (cfg: OpenClawConfig, accountId?: string): RedisChannelAccountConfig | undefined => {
      const accounts = cfg.channels?.['redis-channel']?.accounts ?? {};
      const account = accountId ? accounts[accountId] : Object.values(accounts)[0] as RedisChannelAccountConfig;
      return account?.enabled ? account : undefined;
    },

    isEnabled: (account: RedisChannelAccountConfig, cfg: OpenClawConfig): boolean => {
      return account?.enabled !== false;
    },

    isConfigured: async (account: RedisChannelAccountConfig, cfg: OpenClawConfig): Promise<boolean> => {
      return !!(account?.redisUrl && account?.deviceId);
    },
  } as ChannelConfigAdapter<RedisChannelAccountConfig>,

  outbound: {
    deliveryMode: 'direct',
    textChunkLimit: 10000,

    resolveTarget: (params: {
      cfg?: any;
      to?: string;
      allowFrom?: string[];
      accountId?: string | null;
      mode?: any;
    }) => {
      // For redis-channel, target is the target device ID (e.g., 'node-parent')
      // We accept any non-empty string as a valid target
      const { to } = params;
      if (!to || typeof to !== 'string' || to.trim() === '') {
        return {
          ok: false,
          error: new Error('Target device ID is required'),
        };
      }
      return {
        ok: true,
        to: to.trim(),
      };
    },

    sendText: async (ctx: ChannelOutboundContext & { account?: RedisChannelAccountConfig }): Promise<any> => {
      const { text, to, accountId, cfg } = ctx as any;

      // Get account from cfg using accountId, or use first available account
      let account: RedisChannelAccountConfig | undefined;
      const accounts = cfg?.channels?.['redis-channel']?.accounts;

      if (accounts) {
        if (accountId && accounts[accountId]) {
          account = accounts[accountId];
          globalLogger.info(`Account loaded by accountId: ${accountId}`);
        } else {
          // No accountId or not found, use first available account
          const accountIds = Object.keys(accounts);
          if (accountIds.length > 0) {
            account = accounts[accountIds[0]];
            globalLogger.info(`Using first available account: ${accountIds[0]}`);
          }
        }
      }

      // Validate account config
      if (!account) {
        console.error(`[redis-channel] sendText: No redis-channel account configured`);
        return { ok: false as const, error: 'No redis-channel account configured' };
      }

      if (!account.redisUrl || !account.deviceId) {
        console.error(`[redis-channel] sendText: INVALID ACCOUNT CONFIG`);
        return { ok: false as const, error: 'Account configuration missing' };
      }

      // Extract target from 'to' field
      const target = { id: to };

      const result = await sendOutboundMessage(text, target, account);

      // For now, return a simple result since we're having issues with OutboundDeliveryResult
      // In a real implementation, we would map to the proper OutboundDeliveryResult structure
      if (result.ok) {
        return {
          ok: true,
          id: result.id || Date.now().toString(),
        };
      } else {
        return {
          ok: false,
          error: result.error || 'Unknown error sending message',
        };
      }
    },

    sendMedia: async (ctx: ChannelOutboundContext & { account?: RedisChannelAccountConfig } & { mediaUrl: string }): Promise<any> => {
      // Get account from cfg (same as sendText)
      const { accountId, cfg } = ctx as any;
      let account: RedisChannelAccountConfig | undefined;
      const accounts = cfg?.channels?.['redis-channel']?.accounts;

      if (accounts) {
        if (accountId && accounts[accountId]) {
          account = accounts[accountId];
        } else {
          const accountIds = Object.keys(accounts);
          if (accountIds.length > 0) {
            account = accounts[accountIds[0]];
          }
        }
      }

      if (!account) {
        return { ok: false as const, error: 'No redis-channel account configured' };
      }

      globalLogger.error(`sendMedia called (not supported)`);
      return { ok: false as const, error: 'Media not supported by redis-channel' };
    },
  } as ChannelOutboundAdapter,

  gateway: {
    startAccount: async (params: ChannelGatewayContext<RedisChannelAccountConfig>): Promise<RedisChannelGatewayHandle> => {
      return startGatewayAccount(params);
    },
  },

  status: {
    defaultRuntime: {
      accountId: '',
      enabled: true,
      configured: true,
      linked: true,
      running: true,
      connected: true,
      lastConnectedAt: null,
      lastMessageAt: null,
      lastEventAt: null,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      mode: 'normal',
      dmPolicy: 'open',
      allowFrom: [],
      tokenSource: 'config',
      botTokenSource: 'config',
      appTokenSource: 'config',
      credentialSource: 'config',
      secretSource: 'config',
      audienceType: 'public',
      audience: 'all',
      webhookPath: '',
      webhookUrl: '',
      baseUrl: '',
      allowUnmentionedGroups: true,
      cliPath: null,
      dbPath: null,
      port: null,
      probe: {},
      lastProbeAt: null,
      audit: {},
      application: {},
      bot: {},
      publicKey: null,
      profile: {},
      channelAccessToken: '',
      channelSecret: ''
    },

    async probeAccount({ account, timeoutMs = 10000 }) {
      try {
        const client = await RedisClientManager.getClient(account);
        
        // Test connection by pinging Redis
        const startTime = Date.now();
        await client.ping();
        const responseTime = Date.now() - startTime;
        
        // Test if we can access the subscribe channel
        const subscribeChannel = getSubscribeChannel(account);
        // Just verify we can interact with Redis, no need to actually subscribe here
        
        return {
          ok: true,
          responseTime,
          serverInfo: await client.info(), // Get Redis server info
          channels: {
            subscribe: subscribeChannel,
            publish: getPublishChannel(account, account.deviceId)
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async auditAccount({ account, timeoutMs = 15000 }) {
      try {
        const client = await RedisClientManager.getClient(account);
        
        // Get detailed Redis info
        const serverInfo = await client.info();
        const config = await client.configGet('*');
        
        // Get client list to see current connections
        const clientList = await client.clientList();
        
        // Check for heartbeat key existence
        const heartbeatKey = `devices:${account.deviceId}:heartbeat`;
        const heartbeatExists = await client.exists(heartbeatKey);
        
        return {
          server: {
            info: serverInfo,
            config: config,
            connectedClients: clientList.length,
          },
          channels: {
            subscribe: getSubscribeChannel(account),
            publish: getPublishChannel(account, account.deviceId),
          },
          heartbeat: {
            key: heartbeatKey,
            exists: Boolean(heartbeatExists),
          },
          capabilities: {
            pubsub: true,
            keyspaceNotifications: true,
          }
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async buildAccountSnapshot({ account, cfg, runtime, probe, audit }) {
      const snapshot = {
        accountId: account.deviceId,
        name: account.deviceName || account.deviceId,
        enabled: account.enabled !== false,
        configured: !!(account.redisUrl && account.deviceId),
        linked: true, // Redis connection established
        running: runtime?.running || false,
        connected: runtime?.connected || false,
        reconnectAttempts: runtime?.reconnectAttempts || 0,
        lastConnectedAt: runtime?.lastConnectedAt || null,
        lastMessageAt: runtime?.lastMessageAt || null,
        lastEventAt: runtime?.lastEventAt || null,
        lastError: runtime?.lastError || null,
        lastStartAt: runtime?.lastStartAt || null,
        lastStopAt: runtime?.lastStopAt || null,
        lastInboundAt: runtime?.lastInboundAt || null,
        lastOutboundAt: runtime?.lastOutboundAt || null,
        mode: account.deviceName || 'normal',
        dmPolicy: 'open',
        allowFrom: [],
        tokenSource: 'config',
        botTokenSource: 'config',
        appTokenSource: 'config',
        credentialSource: 'config',
        secretSource: 'config',
        audienceType: 'public',
        audience: 'all',
        webhookPath: '',
        webhookUrl: '',
        baseUrl: '',
        allowUnmentionedGroups: true,
        cliPath: null,
        dbPath: null,
        port: null,
        probe: probe || {},
        lastProbeAt: runtime?.lastProbeAt || null,
        audit: audit || {},
        application: {},
        bot: {},
        publicKey: null,
        profile: {},
        channelAccessToken: '',
        channelSecret: '',
        // Redis-specific fields
        redisUrl: account.redisUrl,
        deviceId: account.deviceId,
        subscribeChannel: getSubscribeChannel(account),
        publishChannel: getPublishChannel(account, account.deviceId),
        heartbeatInterval: account.heartbeatInterval || 20000,
      };

      return snapshot;
    },

    collectStatusIssues(accounts) {
      const issues: ChannelStatusIssue[] = [];
      
      for (const account of accounts) {
        // Check if account is properly configured
        if (!(account as any).redisUrl) {
          issues.push({
            channel: 'redis-channel',
            accountId: (account as any).deviceId,
            kind: 'config',
            message: `Redis URL not configured for device ${(account as any).deviceId}`,
            fix: 'Set redisUrl in account configuration'
          });
        }
        
        if (!(account as any).deviceId) {
          issues.push({
            channel: 'redis-channel',
            accountId: (account as any).deviceId,
            kind: 'config',
            message: 'Device ID not configured',
            fix: 'Set deviceId in account configuration'
          });
        }
        
        // Check if account is enabled
        if ((account as any).enabled === false) {
          issues.push({
            channel: 'redis-channel',
            accountId: (account as any).deviceId,
            kind: 'config',
            message: `Account ${(account as any).deviceId} is disabled`,
            fix: 'Set enabled: true in account configuration'
          });
        }
      }
      
      return issues;
    }
  },
};

export type { RedisChannelAccountConfig };