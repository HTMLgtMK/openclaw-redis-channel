import type { ChannelGatewayContext } from 'openclaw/plugin-sdk';
import { RedisClientManager } from './redis-client';
import { HeartbeatManager } from './heartbeat';
import globalLogger from './logger';
import { handleInboundMessage, type MessageHandlerDeps } from './message-handler';
import { handleInboundMessageDispatch } from './message-dispatcher';
import { RedisChannelAccountConfig, getSubscribeChannel, getPublishChannel, NormalizedMessage, type RedisChannelGatewayHandle } from './types';

/**
 * Starts a Redis channel account gateway
 * @param params - Gateway context containing account config and lifecycle signals
 * @returns Gateway handle with stop and health functions
 */
export async function startGatewayAccount(
  params: ChannelGatewayContext<RedisChannelAccountConfig>
): Promise<RedisChannelGatewayHandle> {
  const { cfg, accountId, account: redisConfig, abortSignal, log } = params;

  // === PERF: Track total gateway startup time ===
  const startTime = Date.now();

  // Update the global logger with the OpenClaw logger
  globalLogger.updateLogger(log);

  const subscribeChannel = getSubscribeChannel(redisConfig);

  globalLogger.info(`[${accountId}] 🔌 Starting Redis channel v${getVersion()}: ${subscribeChannel}`);

  const connectStart = Date.now();
  const subscriber = await RedisClientManager.createSubscriber(redisConfig);
  const mainClient = await RedisClientManager.getClient(redisConfig);
  globalLogger.info(`Redis connection: ${Date.now() - connectStart}ms`);

  // Start heartbeat
  const heartbeat = new HeartbeatManager({
    redisClient: mainClient,
    config: redisConfig,
    logger: globalLogger
  });
  heartbeat.start();

  const handlerDeps: MessageHandlerDeps = {
    logger: globalLogger,
    emitMessage: async (msg: NormalizedMessage) => {
      await handleInboundMessageDispatch({
        msg,
        params,
        redisConfig
      });
    }
  };

  // Track if we're shutting down to prevent duplicate handlers
  let isShuttingDown = false;

  // Track if connection error has been handled to avoid duplicate shutdowns
  let connectionErrorHandled = false;

  // Event handler references for cleanup
  let onError: ((err: Error) => void) | null = null;
  let onClose: (() => void) | null = null;
  let onMessage: ((channel: string, message: string) => void) | null = null;

  // Subscribe to channel first
  const subscribeStart = Date.now();
  await subscriber.subscribe(subscribeChannel);

  // Register message event listener
  onMessage = (channel: string, message: string) => {
    if (!isShuttingDown && channel === subscribeChannel) {
      handleInboundMessage(message, redisConfig, handlerDeps);
    }
  };
  subscriber.on('message', onMessage);

  const publishChannel = getPublishChannel(redisConfig, redisConfig.deviceId);
  globalLogger.info(`[${accountId}] ✅ Redis channel connected: ${subscribeChannel} → ${publishChannel}`);

  // === PERF: Log total gateway startup time ===
  globalLogger.info(`[${accountId}] ⏱️  Total gateway startup time: ${Date.now() - startTime}ms`);

  // Store the promise to prevent premature resolution
  const stopFunction = async (reason: string = 'unknown') => {
    if (isShuttingDown) {
      globalLogger.info(`[${accountId}] Stop called but already shutting down (reason: ${reason})`);
      return;
    }
    isShuttingDown = true;
    const stopStart = Date.now();
    globalLogger.info(`[${accountId}] 🔌 Stopping Redis channel: ${subscribeChannel} (reason: ${reason})`);
    heartbeat.stop();

    // Remove event listeners
    if (onError) {
      subscriber.off('error', onError);
      subscriber.off('close', onClose!);
      subscriber.off('end', onClose!);
    }
    if (onMessage) {
      subscriber.off('message', onMessage);
    }

    try {
      await subscriber.unsubscribe(subscribeChannel);
      globalLogger.info(`Unsubscribed (${Date.now() - stopStart}ms)`);
    } catch (err) {
      globalLogger.error(`[${accountId}] Error unsubscribing during stop: ${err}`);
    }
    try {
      await RedisClientManager.closeSubscriber(subscriber);
      globalLogger.info(`Subscriber closed (${Date.now() - stopStart}ms)`);
    } catch (err) {
      globalLogger.error(`[${accountId}] Error closing subscriber: ${err}`);
    }
    try {
      await RedisClientManager.closeClient(redisConfig);
      globalLogger.info(`Client closed (${Date.now() - stopStart}ms)`);
    } catch (err) {
      globalLogger.error(`[${accountId}] Error closing client: ${err}`);
    }
    globalLogger.info(`[${accountId}] ✅ Redis channel disconnected (total stop time: ${Date.now() - stopStart}ms)`);
  };

  // Keep the channel running by returning a promise that resolves only when stopped
  // @see https://github.com/openclaw/openclaw/issues/19854
  await new Promise<void>((resolve) => {
    if (isShuttingDown) {
      globalLogger.info(`[${accountId}] Channel already shutting down, resolving immediately`);
      resolve();
      return;
    }

    // === Event-driven connection monitoring ===
    // Handle connection errors
    onError = (err: Error) => {
      if (connectionErrorHandled || isShuttingDown) return;
      connectionErrorHandled = true;
      globalLogger.error(`[${accountId}] ❌ Redis connection error: ${err.message}`);
      globalLogger.info(`[${accountId}] Initiating shutdown due to connection error`);
      stopFunction('connection-error').then(() => resolve());
    };

    // Handle connection close/end events
    onClose = () => {
      if (connectionErrorHandled || isShuttingDown) return;
      connectionErrorHandled = true;
      globalLogger.error(`[${accountId}] ❌ Redis connection closed`);
      globalLogger.info(`[${accountId}] Initiating shutdown due to connection close`);
      stopFunction('connection-closed').then(() => resolve());
    };

    // Register event listeners
    subscriber.on('error', onError);
    subscriber.on('close', onClose);
    subscriber.on('end', onClose);

    globalLogger.debug(`Registered event listeners for connection monitoring`);

    // Abort signal handler
    abortSignal?.addEventListener('abort', () => {
      globalLogger.info(`[${accountId}] Abort signal received`);
      stopFunction();
      resolve();
    }, { once: true });
  });

  return {
    stop: stopFunction,

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
}

/**
 * Gets the plugin version from package.json
 */
function getVersion(): string {
  return require('../../package.json').version;
}
