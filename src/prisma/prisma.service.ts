import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({
      // DATABASE_URL is optional in AppConfig so the app can boot in DB-less
      // modes (DTO work, swagger, healthcheck). When it's missing Prisma
      // throws at $connect() time below; we surface that as a clean warning
      // instead of a crash so the rest of the app keeps working.
      datasources: config.get<string>('DATABASE_URL')
        ? { db: { url: config.get<string>('DATABASE_URL') as string } }
        : undefined,
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Prisma failed to connect on boot: ${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('Prisma disconnected from database');
    } catch {
      // best-effort; nothing meaningful to do if disconnect fails
    }
  }
}
