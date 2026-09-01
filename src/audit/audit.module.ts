import { Global, Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Global so any feature module can put `@Audit(...)` on a handler without
 * importing this module. The interceptor is registered app-wide in
 * `app.module.ts` and no-ops on handlers that carry no metadata.
 */
@Global()
@Module({
  imports: [RbacModule],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
