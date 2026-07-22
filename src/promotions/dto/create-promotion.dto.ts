import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { DiscountType } from '../../common/enums';

/**
 * Cross-field rule for `discountValue`:
 * - PERCENTAGE → 0 < value <= 100
 * - FIXED      → value > 0
 *
 * Mirrors the constraint on CreateCouponDto. Kept inline (vs `common/validators`)
 * because the rule is specific to promotions.
 */
function IsDiscountValueForType(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDiscountValueForType',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as { discountType?: DiscountType };
          if (typeof value !== 'number' || Number.isNaN(value)) return false;
          if (obj.discountType === DiscountType.PERCENTAGE) {
            return value > 0 && value <= 100;
          }
          if (obj.discountType === DiscountType.FIXED) {
            return value > 0;
          }
          // If discountType is missing/invalid, let @IsEnum catch it.
          return true;
        },
        defaultMessage(args: ValidationArguments): string {
          const obj = args.object as { discountType?: DiscountType };
          if (obj.discountType === DiscountType.PERCENTAGE) {
            return `${args.property} must be between 0 and 100 (exclusive of 0) for PERCENTAGE discountType`;
          }
          if (obj.discountType === DiscountType.FIXED) {
            return `${args.property} must be greater than 0 for FIXED discountType`;
          }
          return `${args.property} is not a valid discountValue`;
        },
      },
    });
  };
}

export class CreatePromotionDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsUUID()
  @IsOptional()
  campaignId?: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsDiscountValueForType()
  @Type(() => Number)
  discountValue!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // Populates PromotionProduct rows in the service layer. Medicine
  // assignments change via a dedicated endpoint, so this is not in
  // UpdatePromotionDto.
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  medicineIds!: string[];
}
