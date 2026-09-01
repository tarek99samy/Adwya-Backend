import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../../common/enums';

/**
 * Body for POST /orders/:id/transition (branch staff only).
 *
 * `orderId` comes from the path and the actor from the token, so neither is
 * accepted here. The allowed-transitions map in `order-status.machine.ts` is
 * what decides whether the requested status is reachable.
 */
export class TransitionOrderDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
