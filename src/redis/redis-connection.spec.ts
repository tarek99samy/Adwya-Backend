import type { ConfigService } from '@nestjs/config';
import { redisConnectionOptions } from './redis-connection';

/** Minimal ConfigService stand-in honouring the `get(key, default)` overload. */
const configOf = (env: Record<string, string | undefined>): ConfigService =>
  ({
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  }) as unknown as ConfigService;

describe('redisConnectionOptions', () => {
  it('falls back to the discrete REDIS_* fields when no URL is set', () => {
    const options = redisConnectionOptions(
      configOf({
        REDIS_HOST: 'cache.internal',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'hunter2',
        REDIS_DB: '3',
      }),
    );

    expect(options).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      password: 'hunter2',
      db: 3,
    });
  });

  it('defaults to localhost when nothing is configured', () => {
    expect(redisConnectionOptions(configOf({}))).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
  });

  /*
   * The regression this helper exists for: REDIS_URL used to be passed through
   * as `{ url }`, which neither ioredis nor BullMQ recognises. The field was
   * ignored and the client connected to 127.0.0.1:6379 instead of the managed
   * Redis - failing only in the deploys that actually set REDIS_URL.
   */
  it('parses REDIS_URL into real connection fields', () => {
    const options = redisConnectionOptions(
      configOf({
        REDIS_URL: 'redis://someuser:s3cr3t@redis.example.com:6380/2',
        // Deliberately contradictory: the URL must win.
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
      }),
    );

    expect(options).toMatchObject({
      host: 'redis.example.com',
      port: 6380,
      username: 'someuser',
      password: 's3cr3t',
      db: 2,
    });
    expect(options).not.toHaveProperty('url');
  });

  it('decodes percent-encoded credentials', () => {
    const options = redisConnectionOptions(
      configOf({ REDIS_URL: 'redis://user:p%40ss%3Aword@redis.example.com:6379' }),
    );

    expect(options.password).toBe('p@ss:word');
  });

  it('enables TLS for rediss:// and not for redis://', () => {
    expect(
      redisConnectionOptions(configOf({ REDIS_URL: 'rediss://redis.example.com:6380' })),
    ).toHaveProperty('tls');

    expect(
      redisConnectionOptions(configOf({ REDIS_URL: 'redis://redis.example.com:6380' })),
    ).not.toHaveProperty('tls');
  });

  it('applies sensible defaults for a bare URL', () => {
    expect(redisConnectionOptions(configOf({ REDIS_URL: 'redis://redis.example.com' }))).toMatchObject(
      { host: 'redis.example.com', port: 6379, db: 0, username: undefined, password: undefined },
    );
  });
});
