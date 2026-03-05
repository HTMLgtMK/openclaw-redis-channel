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
