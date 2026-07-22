import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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
 * Defined inline here (rather than in `common/validators`) because the rule
 * is specific to Coupon / Promotion. Follows the same `registerDecorator`
 * pattern as `IsEgyptianPhone` in `src/common/validators/phone.validator.ts`.
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

export class CreateCouponDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,40}$/, {
    message:
      'code must be 3-40 chars, uppercase letters/digits, dashes or underscores',
  })
  code!: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  // Field-level Min(0.01) keeps the simpler rule; class-level
  // IsDiscountValueForType enforces the cross-field PERCENTAGE/FIXED bounds.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsDiscountValueForType()
  @Type(() => Number)
  discountValue!: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  maxUses?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  maxUsesPerUser?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minOrderAmount?: number;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
