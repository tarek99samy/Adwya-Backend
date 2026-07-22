import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PrescriptionStatus } from '../../common/enums';

/**
 * Created by the order checkout service when a cart contains
 * `requiresPrescription` medicines. Image URLs are uploaded beforehand via
 * the file-upload endpoint; the DTO only references them by URL. The actual
 * count / size / MIME validation runs in the service layer.
 */
export class CreatePrescriptionDto {
  @IsUUID()
  orderId!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  imageUrls!: string[];

  // Status defaults to PENDING_REVIEW at the DB layer; clients typically
  // don't set this. The pharmacist-review endpoint does.
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
