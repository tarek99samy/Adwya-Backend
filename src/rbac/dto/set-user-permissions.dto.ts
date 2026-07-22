import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';

export class UserPermissionOverrideDto {
  @IsUUID()
  permissionId!: string;

  @IsBoolean()
  granted!: boolean;
}

export class SetUserPermissionsDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ValidateNested({ each: true })
  @Type(() => UserPermissionOverrideDto)
  overrides?: UserPermissionOverrideDto[];
}
