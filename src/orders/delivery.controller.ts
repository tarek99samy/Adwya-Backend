import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DeliveryService } from './delivery.service';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { CourierLocationDto } from './dto/courier-location.dto';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

@Controller('orders/:id/delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  /** Branch staff assigns a courier to a confirmed order. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: AssignCourierDto,
  ) {
    return this.deliveryService.assignCourier(orderId, user.id, dto);
  }

  /** Courier marks collection; also moves the order to OUT_FOR_DELIVERY. */
  @Post('pickup')
  @HttpCode(HttpStatus.OK)
  pickup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    return this.deliveryService.markPickedUp(orderId, user.id);
  }

  /**
   * GPS tick from the courier app. Throttled to 30/min because every call is
   * currently a Postgres write — Phase 2.9 puts a Redis buffer in front of it.
   */
  @Post('location')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: CourierLocationDto,
  ) {
    return this.deliveryService.updateLocation(orderId, user.id, dto);
  }

  /** Live tracking for the order's own customer. */
  @Get()
  track(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    return this.deliveryService.trackForCustomer(orderId, user.id);
  }
}
