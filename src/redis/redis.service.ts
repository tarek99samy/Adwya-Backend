import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConnectionOptions } from './redis-connection';

/**
 * Thin ioredis wrapper.
 *
 * Redis is treated as an optional dependency, exactly like Postgres: a failure
 * to connect is logged and the app still serves. Every method degrades to a
 * safe no-op when the client is down, so a Redis outage cannot take checkout
 * with it. `/readyz` is where the truth about connectivity lives.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      ...redisConnectionOptions(this.config),
      // Do not connect during construction - a dead Redis would otherwise
      // throw before any listener is attached.
      lazyConnect: true,
      // Give up after 3 attempts per command rather than queueing forever.
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
    });

    this.client.on('ready', () => {
      this.connected = true;
      this.logger.log('Redis connected');
    });
    this.client.on('error', (err: Error) => {
      // Only log the first failure per outage; ioredis retries noisily.
      if (this.connected) {
        this.logger.warn(`Redis error: ${err.message}`);
      }
      this.connected = false;
    });
    this.client.on('end', () => {
      this.connected = false;
    });

    void this.client.connect().catch((err: Error) => {
      this.logger.warn(`Redis unavailable at boot: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      // best-effort
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Round-trip check used by `/readyz`. */
  async ping(): Promise<boolean> {
    if (!this.client || !this.connected) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** Raw client for callers that need more than the helpers below. */
  getClient(): Redis | undefined {
    return this.client;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.warn(`Redis SET ${key} failed: ${(err as Error).message}`);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.connected) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      await this.client.del(key);
    } catch {
      // best-effort
    }
  }

  /**
   * Sets a key only if it does not exist, returning whether we won.
   *
   * This is the primitive behind the GPS write-through throttle: the first
   * caller in each window gets `true` and is allowed to touch Postgres,
   * everyone else gets `false` and stays in Redis only.
   *
   * When Redis is down this returns `true` — failing open, because the
   * alternative is silently dropping courier positions entirely.
   */
  async acquireWindow(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client || !this.connected) return true;
    try {
      const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return true;
    }
  }
}
