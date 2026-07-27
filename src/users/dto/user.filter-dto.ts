import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { UserType } from '../../common/enums';

export class UserFilterDto {
  @IsEnum(UserType)
  @IsOptional()
  userType?: UserType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string; // free-text on phone/email/fullName — controller decides

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
