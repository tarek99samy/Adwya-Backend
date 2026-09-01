import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderFilterDto } from './dto/order-filter.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Checkout. Tighter throttle than the rest of the API: this is the one
   * endpoint that moves stock and money, and a retry storm here oversells.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.checkout(user.id, dto);
  }

  /** The caller's own order history. */
  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser, @Query() filter: OrderFilterDto) {
    return this.ordersService.findMine(user.id, filter);
  }

  /** Branch-side order queue. Requires staff membership at that branch. */
  @Get('branch/:branchId')
  findForBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() filter: OrderFilterDto,
  ) {
    return this.ordersService.findForBranch(user.id, branchId, filter);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOne(id, user.id);
  }

  /** Staff-driven status change, validated against the allowed-transitions map. */
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Audit({ entityType: 'Order', action: 'STATUS_CHANGE' })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
  ) {
    return this.ordersService.transition(id, user.id, dto);
  }

  /** Customer withdrawing their own order, allowed only before confirmation. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelAsCustomer(id, user.id, dto);
  }
}
