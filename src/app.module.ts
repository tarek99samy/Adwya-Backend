import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/app.config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { CatalogModule } from './catalog/catalog.module';
import { PharmaciesModule } from './pharmacies/pharmacies.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { InventoryModule } from './inventory/inventory.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 50 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuditModule,
    QueueModule,
    NotificationsModule,
    UsersModule,
    RbacModule,
    AuthModule,
    CatalogModule,
    PharmaciesModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guards run in registration order. Throttling comes first so an
    // unauthenticated flood is rejected before it costs a token verification
    // or a database round-trip. Registering ThrottlerGuard only as a provider
    // makes it injectable but never applies it, which silently turns every
    // @Throttle(...) decorator in the codebase into a no-op.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global guard: every route requires a valid JWT unless @Public()'d.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // No-ops unless the handler carries @Audit(...) metadata.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
