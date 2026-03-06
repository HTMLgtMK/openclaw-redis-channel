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
    deps.logger.debug(`✓ Received message from ${normalized.senderName}: "${normalized.text.slice(0, 50)}..."`);

  } catch (err) {
    deps.logger.error('✗ Failed to process inbound message:', { 
      error: err instanceof Error ? err.message : String(err),
      rawMessage: rawMessage.slice(0, 200) 
    });
  }
}
