import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for POST /orders/:id/cancel (the order's own customer). */
export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;
}
