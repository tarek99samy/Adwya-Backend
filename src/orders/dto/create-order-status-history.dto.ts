import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OrderStatus } from '../../common/enums';

/**
 * One status change row. Created by the service layer on every transition
 * (see `domain-notes.md` §3); the controller endpoint is for admin overrides
 * (e.g. a backfill job re-stamping a transition that was missed by a
 * crashed worker). The valid-transitions map lives in the service.
 */
export class CreateOrderStatusHistoryDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsUUID()
  @IsOptional()
  changedById?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
