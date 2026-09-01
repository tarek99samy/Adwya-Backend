import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/** Body for POST /inventory/transfers — warehouse batch to a branch. */
export class TransferBatchDto {
  @IsUUID()
  batchId!: string;

  @IsUUID()
  branchId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  sellingPrice?: number;
}
