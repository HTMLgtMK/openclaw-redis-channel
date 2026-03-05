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
