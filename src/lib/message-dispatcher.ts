import type { ChannelGatewayContext } from 'openclaw/plugin-sdk';
import { sendOutboundMessage } from './message-sender';
import { NormalizedMessage } from './types';
import globalLogger from './logger';
import { RedisChannelAccountConfig } from './types';
import { getPluginRuntime } from './runtime';
import * as fs from 'fs';
import * as path from 'path';

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
  const { cfg, accountId } = gatewayParams;

  globalLogger.info(`[${accountId}] 📥 收到消息：${msg.senderName} - ${msg.text.slice(0, 100)}`);

  try {
    // 获取 PluginRuntime（包含 channel.reply API）
    const runtime = getPluginRuntime();

    const targetSession = redisConfig.targetSession || 'agent:main:main';

    globalLogger.debug(`[${accountId}] 使用 dispatchReplyWithBufferedBlockDispatcher 提交消息到 ${targetSession}`);

    runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: {
        Body: msg.text,
        RawBody: msg.text,
        CommandBody: msg.text,
        From: msg.senderId,
        To: targetSession,
        SessionKey: targetSession,
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
        CommandAuthorized: true,
        OriginatingChannel: "redis-channel",
        OriginatingTo: msg.senderId,
      },
      cfg,
      dispatcherOptions: {
        responsePrefix: "",
        deliver: async (payload: any, info?: { kind: string }) => {
          const textToSend = payload.markdown || payload.text;
          if (!textToSend) return;

          if (typeof textToSend === "string") {
            // 1. 发送回复到 Redis
            const target = { id: msg.senderId };
            const result = await sendOutboundMessage(textToSend, target, redisConfig);
            if (!result.ok) {
              globalLogger.error(`[${accountId}] Failed to send reply back to Redis: ${result.error}`);
            } else {
              globalLogger.info(`[${accountId}] ✅ 回复已发送回 Redis`);
            }

            // 2. 写入通知文件，让人类可以在 webui 上查看
            try {
              const noticeFile = path.join('/home/admin/.openclaw/workspace/memory/redis-notices.md');
              const noticeContent = `# Redis 消息通知\n\n## ${new Date().toISOString()}\n\n📬 **Redis 消息回复**\n\n**来自**: ${msg.senderName} (${msg.senderId})\n**消息**: ${msg.text}\n\n**Agent 回复**:\n${textToSend}\n\n---\n\n`;
              fs.appendFileSync(noticeFile, noticeContent, 'utf-8');
              globalLogger.info(`[${accountId}] ✅ 通知已写入 ${noticeFile}`);
            } catch (e) {
              globalLogger.error(`[${accountId}] 写入通知文件失败：${e}`);
            }
          }
        },
      },
    });

    globalLogger.info(`[${accountId}] ✅ 消息已成功提交给 OpenClaw 核心处理`);
  } catch (err) {
    globalLogger.error(`[${accountId}] ❌ 消息处理失败：${err instanceof Error ? err.message : String(err)}`);
  }
}
