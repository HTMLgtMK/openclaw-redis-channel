import type {
  ChannelPlugin,
  ChannelPluginAPI,
  AccountConfig,
  Logger,
  EmitMessageFn,
  NormalizedMessage
} from 'openclaw/plugin-sdk';

import { RedisClientManager } from './lib/redis-client';
import { handleInboundMessage, MessageHandlerDeps } from './lib/message-handler';
import { sendOutboundMessage, SendResult } from './lib/message-sender';
import { RedisChannelAccountConfig, getSubscribeChannel, getPublishChannel } from './lib/types';
import { HeartbeatManager } from './lib/heartbeat';

interface StartAccountParams {
  cfg: any;
  accountId: string;
  account: AccountConfig;
  abortSignal: AbortSignal;
  log: Logger;
}

const redisChannelPlugin: ChannelPlugin = {
  id: 'redis-channel',

  meta: {
    id: 'redis-channel',
    label: 'Redis Channel',
    selectionLabel: 'Redis Pub/Sub Channel',
    docsPath: '/plugins/redis-channel',
    blurb: 'Custom messaging via Redis Pub/Sub mechanism',
    aliases: ['redis', 'redis-pubsub'],
    icon: 'database',
  },

  capabilities: {
    chatTypes: ['direct', 'group'],
    supports: {
      threads: false,
      reactions: false,
      mentions: false,
      attachments: false,
      typing: false,
    },
  },

  configSchema: {
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
    },
    required: ['redisUrl', 'deviceId'],
  },

  config: {
    listAccountIds: (cfg: any) => {
      const accounts = cfg.channels?.['redis-channel']?.accounts ?? {};
      return Object.keys(accounts).filter(id => accounts[id]?.enabled !== false);
    },

    resolveAccount: (cfg: any, accountId?: string): RedisChannelAccountConfig | undefined => {
      const accounts = cfg.channels?.['redis-channel']?.accounts ?? {};
      const account = accountId ? accounts[accountId] : Object.values(accounts)[0];
      return account?.enabled ? account as RedisChannelAccountConfig : undefined;
    },

    isEnabled: (account: AccountConfig, cfg: any): boolean => {
      return (account as any)?.enabled !== false;
    },

    isConfigured: async (account: AccountConfig, cfg: any): Promise<boolean> => {
      const redisConfig = account as unknown as RedisChannelAccountConfig;
      return !!(redisConfig?.redisUrl && redisConfig?.deviceId);
    },
  },

  outbound: {
    deliveryMode: 'direct',

    sendText: async ({
      text,
      target,
      account
    }: {
      text: string;
      target: { id: string };
      account: AccountConfig;
    }): Promise<SendResult> => {
      const redisConfig = account as unknown as RedisChannelAccountConfig;
      return await sendOutboundMessage(text, target, redisConfig);
    },
  },

  gateway: {
    startAccount: async (params: StartAccountParams) => {
      const { cfg, accountId, account, abortSignal, log } = params;
      const redisConfig = account as unknown as RedisChannelAccountConfig;

      const subscribeChannel = getSubscribeChannel(redisConfig);

      log?.info?.(`[${accountId}] 🔌 Starting Redis channel: ${subscribeChannel}`);

      const subscriber = await RedisClientManager.createSubscriber(redisConfig);
      const mainClient = await RedisClientManager.getClient(redisConfig);

      // Start heartbeat
      const heartbeat = new HeartbeatManager({
        redisClient: mainClient,
        config: redisConfig,
        logger: log
      });
      heartbeat.start();

      const handlerDeps: MessageHandlerDeps = {
        logger: log,
        emitMessage: (msg) => {
          // 显示消息日志
          log?.info?.(`[${accountId}] 📥 收到消息：${msg.senderName} - ${msg.text.slice(0, 100)}`);

          // 发送通知到飞书
          const notificationText = `📨 从 *${msg.senderName}* 发送：\n\n${msg.text}`;

          // 使用 OpenClaw CLI 发送消息到飞书
          const { exec } = require('child_process');
          const escapedText = notificationText.replace(/"/g, '\\"').replace(/\n/g, '\\n');
          exec(`openclaw message send --target "feishu" --message "${escapedText}"`, (error: Error | null) => {
            if (error) {
              log?.warn?.(`[${accountId}] ⚠️ 转发到飞书失败`);
            } else {
              log?.debug?.(`[${accountId}] ✅ 已转发到飞书`);
            }
          });
        }
      };

      // Redis v4.x: subscribe 返回 Promise，需要 await 确保订阅完成
      await subscriber.subscribe(subscribeChannel, (message: string) => {
        handleInboundMessage(message, redisConfig, handlerDeps);
      });

      const publishChannel = getPublishChannel(redisConfig, redisConfig.deviceId);
      log?.info?.(`[${accountId}] ✅ Redis channel connected: ${subscribeChannel} → ${publishChannel}`);

      // Handle abort signal
      abortSignal?.addEventListener('abort', async () => {
        log?.info?.(`[${accountId}] 🔌 Stopping Redis channel (abort signal received)`);
        heartbeat.stop();
        await subscriber.unsubscribe(subscribeChannel);
        await RedisClientManager.closeClient(redisConfig);
        log?.info?.(`[${accountId}] ✅ Redis channel disconnected`);
      });

      return {
        stop: async () => {
          log?.info?.(`[${accountId}] 🔌 Stopping Redis channel: ${subscribeChannel}`);
          heartbeat.stop();
          await subscriber.unsubscribe(subscribeChannel);
          await RedisClientManager.closeClient(redisConfig);
          log?.info?.(`[${accountId}] ✅ Redis channel disconnected`);
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

export type { RedisChannelAccountConfig, NormalizedMessage };
