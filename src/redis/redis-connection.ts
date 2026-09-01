import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Turns the REDIS_* environment into ioredis options, in one place.
 *
 * `REDIS_URL` wins when set, and it is **parsed** rather than handed over as
 * `{ url }`. Neither ioredis nor BullMQ recognises a `url` field on an options
 * object: it is carried along as an unknown property and ignored, so host and
 * port silently fall back to 127.0.0.1:6379. Locally that looks like it works;
 * against a managed Redis it never connects to the right server at all.
 *
 * Both the queue connection and `RedisService` read through this helper so the
 * two cannot drift apart and report different views of the same Redis.
 */
export function redisConnectionOptions(config: ConfigService): RedisOptions {
  const url = config.get<string>('REDIS_URL');

  if (!url) {
    return {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<number>('REDIS_PORT', 6379)),
      username: config.get<string>('REDIS_USERNAME') || undefined,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      db: Number(config.get<number>('REDIS_DB', 0)),
    };
  }

  const parsed = new URL(url);
  const db = parsed.pathname.replace('/', '');

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    // Credentials arrive percent-encoded in a URL; ioredis wants them raw.
    username: decodeURIComponent(parsed.username) || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    db: db ? Number(db) : 0,
    // rediss:// means TLS, which is what most managed providers hand out.
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
