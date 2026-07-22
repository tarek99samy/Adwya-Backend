import { IsEnum, IsOptional } from 'class-validator';
import { RefundStatus } from '../../common/enums';
import { PartialType } from '@nestjs/mapped-types';
import { CreateRefundDto } from './create-refund.dto';

/**
 * Status transitions: PENDING → APPROVED/REJECTED → COMPLETED.
 * `amount` / `orderId` / `paymentTransactionId` are immutable after creation.
 */
export class UpdateRefundDto extends PartialType(CreateRefundDto) {
  @IsEnum(RefundStatus)
  @IsOptional()
  declare status?: RefundStatus;
}
