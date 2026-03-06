import type { ChannelGatewayContext } from 'openclaw/plugin-sdk';
import { sendOutboundMessage } from './message-sender';
import { NormalizedMessage } from './types';
import globalLogger from './logger';
import { RedisChannelAccountConfig } from './types';

/**
 * 处理入站消息并将其分发给 OpenClaw agent
 * @param params 包含所有必要参数的对象
 */
export async function handleInboundMessageDispatch(
  params: {
    msg: NormalizedMessage;
    params: ChannelGatewayContext<RedisChannelAccountConfig>;
    redisConfig: RedisChannelAccountConfig;
  }
): Promise<void> {
  const { msg, params: gatewayParams, redisConfig } = params;
  const { cfg, accountId, channelRuntime } = gatewayParams;

  globalLogger.info(`[${accountId}] 📥 收到消息：${msg.senderName} - ${msg.text.slice(0, 100)}`);

  // 将消息交给 OpenClaw agent 处理，路由到指定的目标会话
  if (channelRuntime) {
    // 使用 channelRuntime 将消息发送到目标会话
    const targetSession = redisConfig.targetSession || 'agent:main:main';

    // 根据配置决定是否自动执行命令
    const shouldAutoExecute = redisConfig.autoExecute === true;

    // Using the channelRuntime to dispatch the message to the agent
    // Using the correct MsgContext structure
    channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: {
        Body: msg.text,
        RawBody: msg.text,
        CommandBody: msg.text,
        From: msg.senderId,
        To: targetSession, // 发送到配置的目标会话
        SessionKey: undefined, // Will be resolved by the runtime
        AccountId: accountId,
        ChatType: msg.isGroup ? "group" : "direct",
        ConversationLabel: msg.isGroup ? `${msg.groupId || 'group'} - ${msg.senderName}` : `${msg.senderName} (${msg.senderId})`,
        GroupSubject: msg.isGroup ? (msg.groupId || 'group') : undefined,
        SenderName: msg.senderName,
        SenderId: msg.senderId,
        Provider: "redis-channel",
        Surface: "redis-channel",
        MessageSid: msg.id,
        Timestamp: msg.timestamp,
        GroupMembers: msg.isGroup ? "" : undefined,
        GroupSystemPrompt: msg.isGroup ? `Redis group context: ${msg.groupId || 'group'}` : undefined,
        GroupChannel: msg.isGroup ? msg.groupId : undefined,
        CommandAuthorized: true, // 根据实际授权情况调整
        OriginatingChannel: "redis-channel",
        OriginatingTo: msg.senderId,
      },
      cfg,
      dispatcherOptions: {
        responsePrefix: "",
        deliver: async (payload: any, info?: { kind: string }) => {
          try {
            const textToSend = payload.markdown || payload.text;
            if (!textToSend) {
              return;
            }

            // 如果有回复内容，发送回 Redis 通道
            if (typeof textToSend === "string") {
              const target = { id: msg.senderId }; // 回复给原发送者
              const result = await sendOutboundMessage(textToSend, target, redisConfig);
              if (!result.ok) {
                globalLogger.error(`[${accountId}] Failed to send reply back to Redis: ${result.error}`);
              }
            }
          } catch (err: any) {
            globalLogger.error(`[${accountId}] Reply failed: ${err.message}`);
            throw err;
          }
        },
      },
    });
  } else {
    globalLogger.warn(`[${accountId}] channelRuntime not available, cannot dispatch message to agent`);
  }
}