import { createClient, type RedisClientType } from 'redis';
import { RedisChannelAccountConfig, getSubscribeChannel } from './types';

// 使用 any 类型避免 Redis 泛型类型冲突
// 这是 redis v4.x 的已知问题，严格类型会导致 Map 存储失败
type RedisClientAny = any;

export class RedisClientManager {
  private static clients: Map<string, RedisClientAny> = new Map();

  static async getClient(config: RedisChannelAccountConfig): Promise<RedisClientAny> {
    const subscribeChannel = getSubscribeChannel(config);
    const key = `${config.redisUrl}:${subscribeChannel}`;

    if (this.clients.has(key)) {
      const client = this.clients.get(key)!;
      if (client.isOpen) return client;
    }

    const client = createClient({
      url: config.redisUrl,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) }
    });

    client.on('error', (err: Error) => console.error('Redis Client Error:', err));
    client.on('connect', () => console.log(`Redis connected: ${config.redisUrl}`));
    client.on('end', () => console.log(`Redis disconnected: ${config.redisUrl}`));

    await client.connect();
    this.clients.set(key, client);

    return client;
  }

  static async createSubscriber(config: RedisChannelAccountConfig): Promise<RedisClientAny> {
    const mainClient = await this.getClient(config);
    const subscriber = mainClient.duplicate();
    // duplicate() 创建的客户端需要显式连接
    if (!subscriber.isOpen) {
      await subscriber.connect();
    }
    return subscriber;
  }

  /**
   * 关闭 subscriber 客户端
   */
  static async closeSubscriber(subscriber: RedisClientAny): Promise<void> {
    if (subscriber && subscriber.isOpen) {
      try {
        await subscriber.quit();
      } catch (err) {
        console.error('Failed to close subscriber:', err);
      }
    }
  }

  static async closeAll(): Promise<void> {
    for (const [key, client] of this.clients) {
      try {
        if (client.isOpen) await client.quit();
      } catch (err) {
        console.error(`Failed to close Redis client ${key}:`, err);
      }
    }
    this.clients.clear();
  }

  static async closeClient(config: RedisChannelAccountConfig): Promise<void> {
    const subscribeChannel = getSubscribeChannel(config);
    const key = `${config.redisUrl}:${subscribeChannel}`;
    const client = this.clients.get(key);
    if (client && client.isOpen) {
      await client.quit();
      this.clients.delete(key);
    }
  }
}
