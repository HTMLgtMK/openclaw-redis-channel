import Redis, { RedisOptions } from 'ioredis';
import { RedisChannelAccountConfig, getSubscribeChannel } from './types';

// Use any type to avoid Redis type conflicts
type RedisClientAny = any;

export class RedisClientManager {
  private static clients: Map<string, RedisClientAny> = new Map();

  static async getClient(config: RedisChannelAccountConfig): Promise<RedisClientAny> {
    const subscribeChannel = getSubscribeChannel(config);
    const key = `${config.redisUrl}:${subscribeChannel}`;

    if (this.clients.has(key)) {
      const client = this.clients.get(key)!;
      if (client.status === 'ready') return client;
    }

    const options: RedisOptions = {
      retryStrategy: (retries: number) => {
        if (retries > 3) {
          console.error(`[redis-client] Max retries reached, giving up`);
          return null; // Stop retrying
        }
        const delay = Math.min(retries * 50, 2000);
        RedisClientManager.debug(`Reconnecting (attempt ${retries}) in ${delay}ms...`);
        return delay;
      },
      connectTimeout: 3000,  // 3 second timeout
      maxRetriesPerRequest: 3,
      lazyConnect: false  // Auto-connect on instantiation
    };

    const client = new Redis(config.redisUrl, options);

    client.on('error', (err: Error) => console.error('Redis Client Error:', err));
    client.on('connect', () => RedisClientManager.debug(`Redis connected: ${config.redisUrl}`));
    client.on('close', () => RedisClientManager.debug(`Redis disconnected: ${config.redisUrl}`));

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      if (client.status === 'ready') {
        resolve();
      } else {
        client.once('ready', () => resolve());
        client.once('error', (err) => reject(err));
      }
    });

    this.clients.set(key, client);

    return client;
  }

  static async createSubscriber(config: RedisChannelAccountConfig): Promise<RedisClientAny> {
    const options: RedisOptions = {
      retryStrategy: (retries: number) => {
        if (retries > 3) {
          console.error(`[redis-client] Max retries reached, giving up`);
          return null; // Stop retrying
        }
        const delay = Math.min(retries * 50, 2000);
        RedisClientManager.debug(`Reconnecting (attempt ${retries}) in ${delay}ms...`);
        return delay;
      },
      connectTimeout: 3000,
      maxRetriesPerRequest: 3,
      lazyConnect: false
    };

    // ioredis: create a new instance for subscriber (similar to duplicate())
    const subscriber = new Redis(config.redisUrl, options);

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      if (subscriber.status === 'ready') {
        resolve();
      } else {
        subscriber.once('ready', () => resolve());
        subscriber.once('error', (err) => reject(err));
      }
    });

    return subscriber;
  }

  /**
   * Close subscriber client
   */
  static async closeSubscriber(subscriber: RedisClientAny): Promise<void> {
    if (subscriber && subscriber.status === 'ready') {
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
        if (client.status === 'ready') await client.quit();
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
    if (client && client.status === 'ready') {
      await client.quit();
      this.clients.delete(key);
    }
  }

  private static debug(message: string): void {
    if (process.env.DEBUG?.includes('redis-channel')) {
      console.log(`[redis-client-debug] ${message}`);
    }
  }
}
