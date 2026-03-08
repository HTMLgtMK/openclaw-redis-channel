import { v4 as uuidv4 } from 'uuid';
import {
  InboundMessagePayload,
  NormalizedMessage,
  RedisChannelAccountConfig
} from './types';
import type { ChannelLogSink } from 'openclaw/plugin-sdk';
import type { ILogger } from './logger';

export interface MessageHandlerDeps {
  logger: ILogger;
  emitMessage: (msg: NormalizedMessage) => void | Promise<void>;
}

/**
 * 处理入站消息
 * @param rawMessage 原始消息（支持字符串或对象两种格式）
 */
export function handleInboundMessage(
  rawMessage: string | Record<string, any>,
  account: RedisChannelAccountConfig,
  deps: MessageHandlerDeps
): void {
  try {
    // ============================================
    // 🔑 本节点账户信息 (订阅方/接收方)
    // ============================================
    deps.logger.info('🔑 [ACCOUNT] 本节点账户信息 (订阅方/接收方):', {
      deviceId: account.deviceId,
      deviceName: account.deviceName,
      subscribeChannel: account.subscribeChannel || `openclaw:device:${account.deviceId}`,
      publishChannel: account.publishChannel || 'openclaw:device:<targetDeviceId>',
      redisUrl: account.redisUrl?.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@'), // 隐藏密码
      senderNamePrefix: account.senderNamePrefix,
      showSenderPrefix: account.showSenderPrefix,
      autoExecute: account.autoExecute,
      targetSession: account.targetSession
    });

    let payload: InboundMessagePayload;

    // 处理对象或字符串两种情况
    if (typeof rawMessage === 'object' && rawMessage !== null) {
      // 已经是对象，直接使用（GBOT 的情况）
      deps.logger.info('📥 [RAW] 收到对象消息:', JSON.stringify(rawMessage));
      deps.logger.info('🔍 [来源区分] 消息来自发送方 (payload 内嵌信息)，非本节点 account');
      payload = rawMessage as InboundMessagePayload;
    } else {
      // 字符串，需要解析
      const rawStr = String(rawMessage);
      deps.logger.info('📥 [RAW] 收到字符串消息:', {
        rawMessage: rawStr,
        length: rawStr.length,
        first100: rawStr.substring(0, 100)
      });

      try {
        payload = JSON.parse(rawStr) as InboundMessagePayload;
        deps.logger.info('📥 [JSON] 解析成功:', payload);
      } catch (parseErr) {
        deps.logger.warn('⚠️ [PARSE] 解析失败原因:', parseErr instanceof Error ? parseErr.message : String(parseErr));
        // 如果不是 JSON，当作纯文本处理
        deps.logger.warn('❌ [PARSE] 解析失败，当作纯文本:', rawStr);
        payload = {
          senderId: 'unknown',
          senderName: 'Anonymous',
          text: rawStr,
          timestamp: Date.now()
        };
      }
    }

    if (!payload.senderId || !payload.text) {
      deps.logger.error('❌ [INVALID] 无效消息：缺少 senderId 或 text', { payload });
      return;
    }

    // ============================================
    // 🔍 明确区分：本节点 vs 发送方
    // ============================================
    deps.logger.info('🔍 [消息来源区分]', {
      '本节点 (订阅方/接收方)': {
        deviceId: account.deviceId,
        deviceName: account.deviceName
      },
      '发送方 (消息 payload 内嵌)': {
        senderId: payload.senderId,
        senderName: payload.senderName
      }
    });

    // Build message text with optional sender prefix
    let messageText = payload.text;
    if (account.showSenderPrefix !== false) {
      const sender = payload.senderName || payload.senderId || 'Unknown';
      messageText = `[${sender}] ${payload.text}`;
    }

    const normalized: NormalizedMessage = {
      id: `redis-${uuidv4()}`,
      channel: 'redis-channel',
      accountId: account.deviceId,
      senderId: payload.senderId,
      senderName: `${account.senderNamePrefix || ''}${payload.senderName || payload.senderId}`.trim(),
      text: messageText,
      timestamp: payload.timestamp || Date.now(),
      isGroup: payload.isGroup || false,
      groupId: payload.groupId,
      metadata: {
        ...payload.metadata,
        autoExecute: account.autoExecute || false,
        targetSession: account.targetSession || 'agent:main:main',
        originalText: payload.text,
        source: 'redis-channel'
      }
    };

    const result = deps.emitMessage(normalized);
    if (result instanceof Promise) {
      result.catch(err => {
        deps.logger.error(`Error in emitMessage: ${err}`);
      });
    }

    // 完整的消息处理完成日志
    deps.logger.info('✅ [COMPLETE] 消息处理完成:', {
      messageId: normalized.id,
      from: normalized.senderId,
      fromName: normalized.senderName,
      to: account.deviceId,
      toName: account.deviceName,
      channel: normalized.channel,
      textPreview: normalized.text.slice(0, 100)
    });

  } catch (err) {
    deps.logger.error('✗ 处理消息失败:', {
      error: err instanceof Error ? err.message : String(err),
      rawMessage: rawMessage.slice(0, 200)
    });
  }
}
