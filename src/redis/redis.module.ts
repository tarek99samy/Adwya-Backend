import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Global so feature modules can inject RedisService without importing this,
 * matching the PrismaModule convention.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
