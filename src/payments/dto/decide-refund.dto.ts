import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RefundStatus } from '../../common/enums';

/**
 * Body for PATCH /refunds/:id. The allowed moves are enforced by the
 * transition map in `refunds.service.ts`:
 * PENDING -> APPROVED -> COMPLETED, or -> REJECTED.
 */
export class DecideRefundDto {
  @IsEnum(RefundStatus)
  status!: RefundStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
