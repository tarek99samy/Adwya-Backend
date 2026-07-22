import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignProfilePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permissionIds!: string[];
}
