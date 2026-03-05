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
          await redisClient.setex(
            `devices:${config.deviceId}:heartbeat`,
            60, // 过期时间 60 秒
            Date.now().toString()
          );
          logger.debug?.(`💓 Heartbeat sent for device: ${config.deviceId}`);
        }
      } catch (error) {
        this.deps.logger.error?.(`❌ Heartbeat failed:`, error);
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
