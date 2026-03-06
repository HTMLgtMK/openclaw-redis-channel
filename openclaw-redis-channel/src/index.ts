import type { 
  ChannelPlugin 
} from 'openclaw/plugin-sdk/channels/plugins/types.plugin';
import type { OpenClawPluginApi as ChannelPluginAPI } from 'openclaw/plugin-sdk';
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

import { RedisClientManager } from './lib/redis-client';
import { handleInboundMessage, MessageHandlerDeps } from './lib/message-handler';
import { sendOutboundMessage, SendResult } from './lib/message-sender';
import { RedisChannelAccountConfig, getSubscribeChannel, getPublishChannel, NormalizedMessage } from './lib/types';
import { HeartbeatManager } from './lib/heartbeat';
import globalLogger, { type ILogger } from './lib/logger';
import { handleInboundMessageDispatch } from './lib/message-dispatcher';

const redisChannelPlugin: ChannelPlugin<RedisChannelAccountConfig> = {
  id: 'redis-channel',

  meta: {
    id: 'redis-channel',
    label: 'Redis Channel',
    selectionLabel: 'Redis Pub/Sub Channel',
    docsPath: '/plugins/redis-channel',
    blurb: 'Custom messaging via Redis Pub/Sub mechanism',
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

    sendText: async (ctx: ChannelOutboundContext & { account: RedisChannelAccountConfig }): Promise<any> => {
      const { text, to, account } = ctx;
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
  } as ChannelOutboundAdapter,

  gateway: {
    startAccount: async (params: ChannelGatewayContext<RedisChannelAccountConfig>) => {
      const { cfg, accountId, account: redisConfig, abortSignal, log } = params;

      // Update the global logger with the OpenClaw logger
      globalLogger.updateLogger(log);

      const subscribeChannel = getSubscribeChannel(redisConfig);

      globalLogger.info(`[${accountId}] 🔌 Starting Redis channel: ${subscribeChannel}`);

      const subscriber = await RedisClientManager.createSubscriber(redisConfig);
      const mainClient = await RedisClientManager.getClient(redisConfig);

      // Start heartbeat
      const heartbeat = new HeartbeatManager({
        redisClient: mainClient,
        config: redisConfig,
        logger: globalLogger
      });
      heartbeat.start();

      const handlerDeps: MessageHandlerDeps = {
        logger: globalLogger,
        emitMessage: async (msg: NormalizedMessage) => {
          await handleInboundMessageDispatch({
            msg,
            params,
            redisConfig
          });
        }
      };

      // Redis v4.x: subscribe 返回 Promise，需要 await 确保订阅完成
      await subscriber.subscribe(subscribeChannel, (message: string) => {
        handleInboundMessage(message, redisConfig, handlerDeps);
      });

      const publishChannel = getPublishChannel(redisConfig, redisConfig.deviceId);
      globalLogger.info(`[${accountId}] ✅ Redis channel connected: ${subscribeChannel} → ${publishChannel}`);

      // Handle abort signal
      abortSignal?.addEventListener('abort', async () => {
        globalLogger.info(`[${accountId}] 🔌 Stopping Redis channel (abort signal received)`);
        heartbeat.stop();
        await subscriber.unsubscribe(subscribeChannel);
        await RedisClientManager.closeSubscriber(subscriber);
        await RedisClientManager.closeClient(redisConfig);
        globalLogger.info(`[${accountId}] ✅ Redis channel disconnected`);
      });

      return {
        stop: async () => {
          globalLogger.info(`[${accountId}] 🔌 Stopping Redis channel: ${subscribeChannel}`);
          heartbeat.stop();
          await subscriber.unsubscribe(subscribeChannel);
          await RedisClientManager.closeSubscriber(subscriber);
          await RedisClientManager.closeClient(redisConfig);
          globalLogger.info(`[${accountId}] ✅ Redis channel disconnected`);
        },

        health: async () => {
          try {
            await subscriber.ping();
            return { status: 'ok', latency: Date.now() };
          } catch (err) {
            return {
              status: 'error',
              error: err instanceof Error ? err.message : 'Unknown',
            };
          }
        },
      };
    },
  },
};

export default function register(api: ChannelPluginAPI) {
  api.registerChannel({ plugin: redisChannelPlugin });
}

export type { RedisChannelAccountConfig };