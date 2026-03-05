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
