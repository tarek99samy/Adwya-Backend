import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [CartModule, RbacModule],
  controllers: [
    OrdersController,
    PrescriptionsController,
    DeliveryController,
    ReviewsController,
  ],
  providers: [OrdersService, PrescriptionsService, DeliveryService, ReviewsService],
  exports: [OrdersService],
})
export class OrdersModule {}
