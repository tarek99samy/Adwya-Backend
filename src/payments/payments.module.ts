import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { PaymentProvider, StubPaymentProvider } from './payment-provider';

@Module({
  imports: [RbacModule],
  controllers: [PaymentsController, RefundsController],
  providers: [
    PaymentsService,
    RefundsService,
    {
      // The only place a concrete gateway is named. Swapping in real Paymob is
      // this binding plus one class implementing PaymentProvider.
      provide: PaymentProvider,
      useFactory: (config: ConfigService) =>
        new StubPaymentProvider(
          config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? 'dev-webhook-secret-rotate-me',
        ),
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService, PaymentProvider],
})
export class PaymentsModule {}
