import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService], // OrdersService reads the cart at checkout
})
export class CartModule {}
