import { v4 as uuidv4 } from 'uuid';
import { RedisClientManager } from './redis-client';
import { RedisMessagePayload, RedisChannelAccountConfig, getPublishChannel } from './types';

// Define the result type for sending messages
export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendOutboundMessage(
  text: string,
  target: { id: string },
  account: RedisChannelAccountConfig
): Promise<SendResult> {
  let client;

  try {
    client = await RedisClientManager.getClient(account);

    // 使用统一的消息结构体
    const payload: RedisMessagePayload = {
      senderId: account.deviceId,      // 使用 deviceId 作为发送者 ID
      senderName: account.deviceName,  // 使用 deviceName 作为发送者名称
      text,
      timestamp: Date.now(),
      isGroup: false,
      messageId: uuidv4()
    };

    // 强制使用 JSON 格式发送
    const message = JSON.stringify(payload);

    const publishChannel = getPublishChannel(account, target.id);
    await client.publish(publishChannel, message);

    return { ok: true, id: payload.messageId };

  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
