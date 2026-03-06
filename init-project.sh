#!/bin/bash

# ============================================================================
# OpenClaw Redis-Channel 插件项目初始化脚本
# 版本：v1.1.2 - 支持 startAccount API、默认频道逻辑和心跳功能
# ============================================================================

set -e  # 遇到错误立即退出

PROJECT_NAME="openclaw-redis-channel"

echo "🚀 正在创建 OpenClaw Redis-Channel 插件项目 (v1.1.2)..."
echo ""

# 检查是否已存在项目目录
if [ -d "$PROJECT_NAME" ]; then
    echo "⚠️  目录 $PROJECT_NAME 已存在"
    read -p "是否删除并重新创建？(y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        rm -rf "$PROJECT_NAME"
        echo "🗑️  已删除旧目录"
    else
        echo "❌ 操作已取消"
        exit 1
    fi
fi

# 创建目录结构
mkdir -p "$PROJECT_NAME/src/lib"
mkdir -p "$PROJECT_NAME/src/types"
mkdir -p "$PROJECT_NAME/scripts"
mkdir -p "$PROJECT_NAME/examples"

cd "$PROJECT_NAME"

# ============================================================================
# 1. package.json
# ============================================================================
cat > package.json << 'EOF'
{
  "name": "@HTMLgtMK/redis-channel",
  "version": "1.1.2",
  "description": "OpenClaw Channel plugin for Redis Pub/Sub messaging",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "openclaw": {
    "extensions": ["index.js"]
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test:pub": "ts-node scripts/test-publish.ts",
    "test:sub": "ts-node scripts/test-subscribe.ts",
    "lint": "eslint src --ext .ts",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["openclaw", "plugin", "channel", "redis", "pubsub"],
  "license": "MIT",
  "dependencies": {
    "redis": "^4.6.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "commander": "^11.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  },
  "peerDependencies": {
    "openclaw": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "openclaw": {
      "optional": true
    }
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
echo "✅ 创建 package.json"

# ============================================================================
# 2. tsconfig.json
# ============================================================================
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "baseUrl": ".",
    "typeRoots": ["./src/types", "./node_modules/@types"],
    "types": ["node", "uuid"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "scripts"]
}
EOF
echo "✅ 创建 tsconfig.json"

# ============================================================================
# 3. openclaw.plugin.json
# ============================================================================
cat > openclaw.plugin.json << 'EOF'
{
  "id": "redis-channel",
  "name": "Redis Channel",
  "version": "1.1.2",
  "description": "Custom messaging channel via Redis Pub/Sub for OpenClaw",
  "author": "HTMLgtMK",
  "license": "MIT",
  "channels": ["redis-channel"],
  "homepage": "https://github.com/HTMLgtMK/openclaw-redis-channel",
  "repository": "https://github.com/HTMLgtMK/openclaw-redis-channel",
  "keywords": ["channel", "redis", "pubsub", "messaging"],
  "minOpenClawVersion": "1.0.0",
  "configSchema": {
    "type": "object",
    "properties": {
      "channels": {
        "type": "object",
        "properties": {
          "redis-channel": {
            "type": "object",
            "properties": {
              "accounts": {
                "type": "object",
                "patternProperties": {
                  "^[a-zA-Z0-9_-]+$": {
                    "type": "object",
                    "properties": {
                      "enabled": {
                        "type": "boolean",
                        "default": true,
                        "description": "是否启用此账号"
                      },
                      "redisUrl": {
                        "type": "string",
                        "description": "Redis 连接 URL，如 redis://localhost:6379",
                        "examples": ["redis://localhost:6379", "redis://:password@host:6379/0"]
                      },
                      "deviceId": {
                        "type": "string",
                        "description": "设备唯一标识符",
                        "examples": ["node-local", "device-001", "gateway-main"]
                      },
                      "deviceName": {
                        "type": "string",
                        "description": "设备显示名称",
                        "default": "",
                        "examples": ["本地节点", "主网关"]
                      },
                      "heartbeatInterval": {
                        "type": "integer",
                        "description": "心跳间隔（毫秒），用于设备在线状态检测",
                        "default": 20000,
                        "examples": [20000, 30000]
                      },
                      "subscribeChannel": {
                        "type": "string",
                        "description": "订阅的入站消息频道，未指定时默认为 openclaw:device:<deviceId>",
                        "examples": ["openclaw:device:node-local", "openclaw:inbound"]
                      },
                      "publishChannel": {
                        "type": "string",
                        "description": "发布出站消息频道，未指定时默认为 openclaw:device:<targetDeviceId>",
                        "examples": ["openclaw:device:target-device", "openclaw:outbound"]
                      },
                      "senderNamePrefix": {
                        "type": "string",
                        "description": "发送者名称前缀（可选）",
                        "default": ""
                      },
                      "messageFormat": {
                        "type": "string",
                        "enum": ["json", "text"],
                        "default": "json",
                        "description": "消息格式：json（结构化）或 text（纯文本）"
                      }
                    },
                    "required": ["redisUrl", "deviceId"],
                    "additionalProperties": false
                  }
                },
                "additionalProperties": false
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  }
}
EOF
echo "✅ 创建 openclaw.plugin.json"

# ============================================================================
# 4. src/types/openclaw.d.ts（支持 startAccount API）
# ============================================================================
cat > src/types/openclaw.d.ts << 'EOF'
/**
 * OpenClaw Plugin SDK 类型声明
 * 用于本地开发，不依赖全局安装的 openclaw 包
 */

declare module 'openclaw/plugin-sdk' {
  // ========== 基础类型 ==========

  export interface Logger {
    info: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    debug: (msg: string, ...args: any[]) => void;
  }

  export interface AccountConfig {
    accountId: string;
    enabled: boolean;
    [key: string]: any;
  }

  export interface NormalizedMessage {
    id: string;
    channel: string;
    accountId: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
    isGroup: boolean;
    groupId?: string;
    metadata?: Record<string, any>;
  }

  export type EmitMessageFn = (msg: NormalizedMessage) => void;

  // ========== Channel Plugin 接口 ==========

  export interface ChannelPluginMeta {
    id: string;
    label: string;
    selectionLabel: string;
    docsPath?: string;
    blurb: string;
    aliases?: string[];
    icon?: string;
  }

  export interface ChannelPluginCapabilities {
    chatTypes: string[];
    supports: {
      threads: boolean;
      reactions: boolean;
      mentions: boolean;
      attachments: boolean;
      typing: boolean;
    };
  }

  export interface StartAccountParams {
    cfg: any;
    accountId: string;
    account: AccountConfig;
    abortSignal: AbortSignal;
    log: Logger;
  }

  export interface ChannelPluginConfig {
    listAccountIds: (cfg: any) => string[];
    resolveAccount: (cfg: any, accountId?: string) => any;
    isEnabled?: (account: AccountConfig, cfg: any) => boolean;
    isConfigured?: (account: AccountConfig, cfg: any) => Promise<boolean>;
  }

  export interface OutboundAdapter {
    deliveryMode: string;
    sendText: (params: {
      text: string;
      target: { id: string };
      account: AccountConfig;
    }) => Promise<any>;
  }

  export interface GatewayAdapter {
    start?: (
      account: AccountConfig,
      deps: { logger: Logger; emitMessage: EmitMessageFn }
    ) => Promise<{
      stop: () => Promise<void>;
      health?: () => Promise<{ status: string; [key: string]: any }>;
    }>;
    startAccount?: (
      params: StartAccountParams
    ) => Promise<{
      stop: () => Promise<void>;
      health?: () => Promise<{ status: string; [key: string]: any }>;
    }>;
  }

  export interface ChannelPlugin {
    id: string;
    meta: ChannelPluginMeta;
    capabilities: ChannelPluginCapabilities;
    configSchema?: any;
    config: ChannelPluginConfig;
    outbound: OutboundAdapter;
    gateway: GatewayAdapter;
  }

  // ========== Plugin API ==========

  export interface ChannelPluginAPI {
    registerChannel: (config: { plugin: ChannelPlugin }) => void;
  }

  // ========== 默认导出 ==========

  export default function register(api: ChannelPluginAPI): void;
}
EOF
echo "✅ 创建 src/types/openclaw.d.ts"

# ============================================================================
# 5. src/lib/types.ts（支持默认频道）
# ============================================================================
cat > src/lib/types.ts << 'EOF'
/**
 * Redis Channel 插件内部类型定义
 */

export interface RedisChannelAccountConfig {
  enabled: boolean;
  redisUrl: string;
  deviceId: string;
  deviceName?: string;
  heartbeatInterval?: number;
  subscribeChannel?: string;
  publishChannel?: string;
  senderNamePrefix?: string;
  messageFormat?: 'json' | 'text';
}

/**
 * 获取订阅频道，支持默认值
 */
export function getSubscribeChannel(config: RedisChannelAccountConfig): string {
  if (config.subscribeChannel) {
    return config.subscribeChannel;
  }
  return `openclaw:device:${config.deviceId}`;
}

/**
 * 获取发布频道，支持默认值
 */
export function getPublishChannel(config: RedisChannelAccountConfig, targetDeviceId: string): string {
  if (config.publishChannel) {
    return config.publishChannel;
  }
  return `openclaw:device:${targetDeviceId}`;
}

export interface InboundMessagePayload {
  senderId: string;
  senderName?: string;
  text: string;
  timestamp?: number;
  isGroup?: boolean;
  groupId?: string;
  metadata?: Record<string, any>;
}

export interface OutboundMessagePayload {
  from: string;
  to: string;
  text: string;
  timestamp: number;
  messageId: string;
  metadata?: Record<string, any>;
}

export interface NormalizedMessage {
  id: string;
  channel: string;
  accountId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  groupId?: string;
  metadata?: Record<string, any>;
}
EOF
echo "✅ 创建 src/lib/types.ts"

# ============================================================================
# 6. src/lib/redis-client.ts
# ============================================================================
cat > src/lib/redis-client.ts << 'EOF'
import { createClient, type RedisClientType } from 'redis';
import { RedisChannelAccountConfig, getSubscribeChannel } from './types';

// 使用 any 类型避免 Redis 泛型类型冲突
// 这是 redis v4.x 的已知问题，严格类型会导致 Map 存储失败
type RedisClientAny = any;

export class RedisClientManager {
  private static clients: Map<string, RedisClientAny> = new Map();

  static async getClient(config: RedisChannelAccountConfig): Promise<RedisClientAny> {
    const subscribeChannel = getSubscribeChannel(config);
    const key = `${config.redisUrl}:${subscribeChannel}`;

    if (this.clients.has(key)) {
      const client = this.clients.get(key)!;
      if (client.isOpen) return client;
    }

    const client = createClient({
      url: config.redisUrl,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) }
    });

    client.on('error', (err: Error) => console.error('Redis Client Error:', err));
    client.on('connect', () => console.log(`Redis connected: ${config.redisUrl}`));
    client.on('end', () => console.log(`Redis disconnected: ${config.redisUrl}`));

    await client.connect();
    this.clients.set(key, client);

    return client;
  }

  static async createSubscriber(config: RedisChannelAccountConfig): Promise<RedisClientAny> {
    const mainClient = await this.getClient(config);
    const subscriber = mainClient.duplicate();
    // duplicate() 创建的客户端需要显式连接
    if (!subscriber.isOpen) {
      await subscriber.connect();
    }
    return subscriber;
  }

  /**
   * 关闭 subscriber 客户端
   */
  static async closeSubscriber(subscriber: RedisClientAny): Promise<void> {
    if (subscriber && subscriber.isOpen) {
      try {
        await subscriber.quit();
      } catch (err) {
        console.error('Failed to close subscriber:', err);
      }
    }
  }

  static async closeAll(): Promise<void> {
    for (const [key, client] of this.clients) {
      try {
        if (client.isOpen) await client.quit();
      } catch (err) {
        console.error(`Failed to close Redis client ${key}:`, err);
      }
    }
    this.clients.clear();
  }

  static async closeClient(config: RedisChannelAccountConfig): Promise<void> {
    const subscribeChannel = getSubscribeChannel(config);
    const key = `${config.redisUrl}:${subscribeChannel}`;
    const client = this.clients.get(key);
    if (client && client.isOpen) {
      await client.quit();
      this.clients.delete(key);
    }
  }
}
EOF
echo "✅ 创建 src/lib/redis-client.ts"

# ============================================================================
# 7. src/lib/message-handler.ts
# ============================================================================
cat > src/lib/message-handler.ts << 'EOF'
import { v4 as uuidv4 } from 'uuid';
import {
  InboundMessagePayload,
  NormalizedMessage,
  RedisChannelAccountConfig
} from './types';

export interface MessageHandlerDeps {
  logger: {
    info: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    debug: (msg: string, ...args: any[]) => void;
  };
  emitMessage: (msg: NormalizedMessage) => void;
}

export function handleInboundMessage(
  rawMessage: string,
  account: RedisChannelAccountConfig,
  deps: MessageHandlerDeps
): void {
  try {
    let payload: InboundMessagePayload;

    if (account.messageFormat === 'text') {
      payload = {
        senderId: 'unknown',
        senderName: 'Anonymous',
        text: rawMessage,
        timestamp: Date.now()
      };
    } else {
      payload = JSON.parse(rawMessage) as InboundMessagePayload;
    }

    if (!payload.senderId || !payload.text) {
      deps.logger.warn('Invalid inbound message: missing senderId or text', { payload });
      return;
    }

    const normalized: NormalizedMessage = {
      id: `redis-${uuidv4()}`,
      channel: 'redis-channel',
      accountId: account.deviceId,
      senderId: payload.senderId,
      senderName: `${account.senderNamePrefix || ''}${payload.senderName || payload.senderId}`.trim(),
      text: payload.text,
      timestamp: payload.timestamp || Date.now(),
      isGroup: payload.isGroup || false,
      groupId: payload.groupId,
      metadata: payload.metadata
    };

    deps.emitMessage(normalized);
    deps.logger.debug(`✓ Received message from ${normalized.senderName}: "${normalized.text.slice(0, 50)}..."`);

  } catch (err) {
    deps.logger.error('✗ Failed to process inbound message:', {
      error: err instanceof Error ? err.message : String(err),
      rawMessage: rawMessage.slice(0, 200)
    });
  }
}
EOF
echo "✅ 创建 src/lib/message-handler.ts"

# ============================================================================
# 8. src/lib/message-sender.ts
# ============================================================================
cat > src/lib/message-sender.ts << 'EOF'
import { v4 as uuidv4 } from 'uuid';
import { RedisClientManager } from './redis-client';
import { OutboundMessagePayload, RedisChannelAccountConfig, getPublishChannel } from './types';

export interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

export async function sendOutboundMessage(
  text: string,
  target: { id: string },
  account: RedisChannelAccountConfig
): Promise<SendResult> {
  let client;

  try {
    client = await RedisClientManager.getClient(account);

    const payload: OutboundMessagePayload = {
      from: 'openclaw',
      to: target.id,
      text,
      timestamp: Date.now(),
      messageId: uuidv4()
    };

    const message = account.messageFormat === 'text'
      ? text
      : JSON.stringify(payload);

    const publishChannel = getPublishChannel(account, target.id);
    await client.publish(publishChannel, message);

    return { ok: true, messageId: payload.messageId };

  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
EOF
echo "✅ 创建 src/lib/message-sender.ts"

# ============================================================================
# 8.5. src/lib/heartbeat.ts（心跳功能）
# ============================================================================
cat > src/lib/heartbeat.ts << 'EOF'
import { RedisChannelAccountConfig } from './types';

export interface HeartbeatDeps {
  redisClient: any;
  config: RedisChannelAccountConfig;
  logger: {
    info: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    debug?: (msg: string, ...args: any[]) => void;
  };
}

export class HeartbeatManager {
  private timer: NodeJS.Timeout | null = null;
  private deps: HeartbeatDeps;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
  }

  /**
   * 启动心跳
   * @param interval 心跳间隔（毫秒），默认 20000ms
   */
  start(interval?: number): void {
    if (this.timer) {
      this.stop();
    }

    const heartbeatInterval = interval ?? this.deps.config.heartbeatInterval ?? 20000;

    this.timer = setInterval(async () => {
      try {
        const { redisClient, config, logger } = this.deps;
        if (redisClient && config) {
          const key = `devices:${config.deviceId}:heartbeat`;
          const value = Date.now().toString();
          // Redis v4.x: use set with EX option instead of setex
          await redisClient.set(key, value, { EX: 60 });
          logger.debug?.(`💓 Heartbeat sent for device: ${config.deviceId}`);
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        this.deps.logger.error?.(`❌ Heartbeat failed: ${err}`);
      }
    }, heartbeatInterval);

    this.deps.logger.info?.(`💓 Heartbeat started (interval: ${heartbeatInterval}ms)`);
  }

  /**
   * 停止心跳
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.deps.logger.info?.(`💓 Heartbeat stopped`);
    }
  }
}
EOF
echo "✅ 创建 src/lib/heartbeat.ts"

# ============================================================================
# 9. src/index.ts（主入口 - 支持 startAccount API）
# ============================================================================
cat > src/index.ts << 'EOF'
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
          // emitMessage 会将消息交给 OpenClaw agent 处理
          log?.info?.(`[${accountId}] 📥 收到消息：${msg.senderName} - ${msg.text.slice(0, 100)}`);
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
        await RedisClientManager.closeSubscriber(subscriber);
        await RedisClientManager.closeClient(redisConfig);
        log?.info?.(`[${accountId}] ✅ Redis channel disconnected`);
      });

      return {
        stop: async () => {
          log?.info?.(`[${accountId}] 🔌 Stopping Redis channel: ${subscribeChannel}`);
          heartbeat.stop();
          await subscriber.unsubscribe(subscribeChannel);
          await RedisClientManager.closeSubscriber(subscriber);
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
EOF
echo "✅ 创建 src/index.ts"


# ============================================================================
# 9.5. scripts/test-publish.ts
# ============================================================================
cat > index.ts << 'EOF'
// OpenClaw 插件入口转发器
// 实际代码在 dist/index.js
export * from './dist/index';
EOF

cat > index.js << 'EOF'
// # ~/.openclaw/extensions/redis-channel/index.js
module.exports = require('./dist/index.js');
EOF
echo "✅ 创建 index.ts, index.js"

# ============================================================================
# 10. scripts/test-publish.ts
# ============================================================================
cat > scripts/test-publish.ts << 'EOF'
#!/usr/bin/env ts-node
/**
 * 测试脚本：向 OpenClaw 发送入站消息
 * 用法：npm run test:pub -- --text "Hello" --sender "user123" --device-id "node-local"
 */

import { createClient } from 'redis';
import { program } from 'commander';

program
  .option('-r, --redis <url>', 'Redis URL', 'redis://localhost:6379')
  .option('-d, --device-id <id>', 'Target Device ID (for default channel)', 'node-local')
  .option('-c, --channel <name>', 'Publish channel (default: openclaw:device:<device-id>)')
  .option('-t, --text <message>', 'Message text', 'Hello from test script!')
  .option('-s, --sender <id>', 'Sender ID', 'test-user')
  .option('-n, --name <name>', 'Sender name', 'Test User')
  .option('-g, --group <id>', 'Group ID (optional)')
  .parse();

const opts = program.opts();

async function main() {
  const publishChannel = opts.channel || `openclaw:device:${opts.deviceId}`;
  const client = createClient({ url: opts.redis });

  client.on('error', (err) => {
    console.error('Redis error:', err);
    process.exit(1);
  });

  await client.connect();

  const payload = {
    senderId: opts.sender,
    senderName: opts.name,
    text: opts.text,
    timestamp: Date.now(),
    isGroup: !!opts.group,
    groupId: opts.group,
    metadata: { source: 'test-script' }
  };

  try {
    await client.publish(publishChannel, JSON.stringify(payload));
    console.log('✅ Message published:', {
      channel: publishChannel,
      sender: opts.sender,
      text: opts.text.slice(0, 50) + (opts.text.length > 50 ? '...' : '')
    });
  } catch (err) {
    console.error('❌ Publish failed:', err);
  } finally {
    await client.quit();
  }
}

main().catch(console.error);
EOF
echo "✅ 创建 scripts/test-publish.ts"

# ============================================================================
# 11. scripts/test-subscribe.ts
# ============================================================================
cat > scripts/test-subscribe.ts << 'EOF'
#!/usr/bin/env ts-node
/**
 * 测试脚本：监听 OpenClaw 发送的出站消息
 * 用法：npm run test:sub -- --redis "redis://localhost:6379" --device-id "node-local"
 */

import { createClient } from 'redis';
import { program } from 'commander';

program
  .option('-r, --redis <url>', 'Redis URL', 'redis://localhost:6379')
  .option('-d, --device-id <id>', 'Device ID (for default channel)', 'node-local')
  .option('-c, --channel <name>', 'Subscribe channel (default: openclaw:device:<device-id>)')
  .parse();

const opts = program.opts();

async function main() {
  const subscribeChannel = opts.channel || `openclaw:device:${opts.deviceId}`;
  const client = createClient({ url: opts.redis });

  client.on('error', (err) => console.error('Redis error:', err));
  client.on('connect', () => console.log(`🔌 Connected to ${opts.redis}`));

  await client.connect();

  console.log(`👂 Subscribing to ${subscribeChannel}... (Ctrl+C to exit)`);

  await client.subscribe(subscribeChannel, (message: string) => {
    try {
      const payload = JSON.parse(message);
      console.log('\n📩 Received from OpenClaw:');
      console.log(`   From: ${payload.from}`);
      console.log(`   To: ${payload.to}`);
      console.log(`   Text: ${payload.text}`);
      console.log(`   Time: ${new Date(payload.timestamp).toLocaleTimeString()}`);
      console.log('─'.repeat(50));
    } catch {
      console.log(`📄 Raw: ${message}`);
    }
  });

  process.on('SIGINT', async () => {
    console.log('\n👋 Disconnecting...');
    await client.unsubscribe(subscribeChannel);
    await client.quit();
    process.exit(0);
  });
}

main().catch(console.error);
EOF
echo "✅ 创建 scripts/test-subscribe.ts"

# ============================================================================
# 12. Dockerfile
# ============================================================================
cat > Dockerfile << 'EOF'
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /opt/openclaw/extensions/redis-channel

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/openclaw.plugin.json ./
COPY --from=builder /app/package.json ./

RUN npm install --production --legacy-peer-deps

USER node
EOF
echo "✅ 创建 Dockerfile"

# ============================================================================
# 13. examples/docker-compose.yml
# ============================================================================
cat > examples/docker-compose.yml << 'EOF'
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  openclaw:
    image: openclaw/latest
    depends_on:
      - redis
    volumes:
      - ./config:/opt/openclaw/config
      - ../dist:/opt/openclaw/extensions/redis-channel/dist:ro
      - ../openclaw.plugin.json:/opt/openclaw/extensions/redis-channel/openclaw.plugin.json:ro
      - ../package.json:/opt/openclaw/extensions/redis-channel/package.json:ro
    environment:
      - REDIS_URL=redis://redis:6379

volumes:
  redis-data:
EOF
echo "✅ 创建 examples/docker-compose.yml"

# ============================================================================
# 14. .gitignore
# ============================================================================
cat > .gitignore << 'EOF'
node_modules
dist
*.log
.DS_Store
.env
EOF
echo "✅ 创建 .gitignore"

# ============================================================================
# 15. README.md
# ============================================================================
cat > README.md << 'READMEEOF'
# OpenClaw Redis-Channel Plugin

通过 Redis Pub/Sub 机制实现 OpenClaw 自定义消息收发的 Channel 插件。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install --legacy-peer-deps
```

### 2. 编译插件

```bash
npm run build
```

### 3. 部署到 OpenClaw

将以下文件复制到 OpenClaw 插件目录：
- \`dist/\`
- \`openclaw.plugin.json\`
- \`package.json\`

### 4. 配置 OpenClaw

在 \`~/.openclaw/openclaw.json\` 中添加：

\`\`\`json
{
  "channels": {
    "redis-channel": {
      "accounts": {
        "default": {
          "enabled": true,
          "redisUrl": "redis://localhost:6379",
          "deviceId": "node-local",
          "deviceName": "本地节点",
          "subscribeChannel": "openclaw:device:node-local",
          "publishChannel": "openclaw:device:target-device"
        }
      }
    }
  }
}
\`\`\`

## 📋 配置参数

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| \`redisUrl\` | string | ✅ | Redis 连接 URL | - |
| \`deviceId\` | string | ✅ | 设备唯一标识符 | - |
| \`deviceName\` | string | ❌ | 设备显示名称 | \`deviceId\` |
| \`heartbeatInterval\` | number | ❌ | 心跳间隔（毫秒） | 20000 |
| \`subscribeChannel\` | string | ❌ | 订阅的入站消息频道 | \`openclaw:device:<deviceId>\` |
| \`publishChannel\` | string | ❌ | 发布出站消息频道 | \`openclaw:device:<targetDeviceId>\` |
| \`senderNamePrefix\` | string | ❌ | 发送者名称前缀 | \`""\` |
| \`messageFormat\` | \`"json"\` \\| \`"text"\` | ❌ | 消息格式 | \`"json"\` |

## 🧪 测试

### 发送消息（模拟外部系统 → OpenClaw）

```bash
npm run test:pub -- -t "你好，OpenClaw!" -s "user123" -n "测试用户"
```

### 接收消息（监听 OpenClaw → 外部系统）

```bash
npm run test:sub
```

## 📋 消息格式

### 入站消息（外部 → OpenClaw）

```json
{
  "senderId": "user123",
  "senderName": "张三",
  "text": "你好！",
  "timestamp": 1709567890000,
  "isGroup": false,
  "groupId": null,
  "metadata": {}
}
```

### 出站消息（OpenClaw → 外部）

```json
{
  "from": "openclaw",
  "to": "user123",
  "text": "你好，我是 AI 助手！",
  "timestamp": 1709567895000,
  "messageId": "uuid-here"
}
```

## 🔌 多账号配置示例

```json
{
  "channels": {
    "redis-channel": {
      "accounts": {
        "local": {
          "enabled": true,
          "redisUrl": "redis://localhost:6379",
          "deviceId": "node-local",
          "deviceName": "本地节点"
        },
        "remote": {
          "enabled": true,
          "redisUrl": "redis://remote-server:6379",
          "deviceId": "node-remote",
          "deviceName": "远程节点"
        }
      }
    }
  }
}
```

## 📝 变更日志

### v1.1.2 (2026-03-05)

**心跳功能**
- 新增 \`heartbeatInterval\` 配置项（默认 20000ms）
- 新增 \`src/lib/heartbeat.ts\` 模块
- 定时写入 \`devices:<deviceId>:heartbeat\` 到 Redis（TTL 60 秒）
- 支持优雅关闭时停止心跳

### v1.1.1 (2026-03-05)

**API 适配更新**
- \`gateway.start\` → \`gateway.startAccount\`，使用新的 \`params\` 参数结构
- 新增 \`StartAccountParams\` 接口：\`cfg\`, \`accountId\`, \`account\`, \`abortSignal\`, \`log\`
- 日志调用改为可选链 \`log?.info?.()\` 并添加 \`[accountId]\` 前缀
- 新增 \`abortSignal\` 事件处理，支持 OpenClaw 优雅关闭机制
- 新增 \`config.isEnabled\` 和 \`config.isConfigured\` 方法
- 新增 \`configSchema\` 定义

**功能增强**
- 收到消息时自动转发到飞书通知（使用 OpenClaw CLI）

**类型定义更新**
- \`src/types/openclaw.d.ts\`: 新增 \`StartAccountParams\` 接口
- \`GatewayAdapter\`: 同时支持 \`start\` 和 \`startAccount\` 方法
- \`ChannelPluginConfig\`: 新增可选的 \`isEnabled\` 和 \`isConfigured\` 方法

### v1.1.0 (2026-03-05)

**新增配置参数**
- 新增 \`deviceId\` (必填): 设备唯一标识符
- 新增 \`deviceName\` (可选): 设备显示名称

**默认频道规则变更**
- \`subscribeChannel\`: 未指定时默认为 \`openclaw:device:<deviceId>\`
- \`publishChannel\`: 未指定时默认为 \`openclaw:device:<targetDeviceId>\`

---

*最后更新：2026-03-05*
READMEEOF
echo "✅ 创建 README.md"

# ============================================================================
# 完成
# ============================================================================
echo ""
echo "============================================"
echo "✅ 项目创建完成！"
echo "============================================"
echo ""
echo "📁 项目结构:"
echo "   $PROJECT_NAME/"
echo "   ├── src/"
echo "   │   ├── index.ts          # 主入口"
echo "   │   ├── lib/"
echo "   │   │   ├── types.ts      # 类型定义"
echo "   │   │   ├── redis-client.ts"
echo "   │   │   ├── message-handler.ts"
echo "   │   │   ├── message-sender.ts"
echo "   │   │   └── heartbeat.ts  # 心跳功能"
echo "   │   └── types/"
echo "   │       └── openclaw.d.ts # OpenClaw SDK 类型"
echo "   ├── scripts/"
echo "   │   ├── test-publish.ts"
echo "   │   └── test-subscribe.ts"
echo "   ├── examples/"
echo "   │   └── docker-compose.yml"
echo "   ├── openclaw.plugin.json"
echo "   ├── package.json"
echo "   ├── tsconfig.json"
echo "   └── README.md"
echo ""
echo "🚀 快速开始:"
echo "   cd $PROJECT_NAME"
echo "   npm install"
echo "   npm run build"
echo ""
