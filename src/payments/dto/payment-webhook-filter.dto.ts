import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PaymentWebhookFilterDto {
  @IsString()
  @IsOptional()
  @MaxLength(60)
  provider?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  signatureValid?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  // `true` filters to webhooks that have been interpreted (processedAt IS NOT NULL);
  // `false` filters to ones still pending in the queue.
  processed?: boolean;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
