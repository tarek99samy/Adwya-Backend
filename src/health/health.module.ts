import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Global because LoggingInterceptor (registered in main.ts) needs
 * MetricsService, and it sits outside any feature module.
 */
@Global()
@Module({
  controllers: [HealthController, MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}
