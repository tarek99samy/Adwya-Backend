import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignUserProfilesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  profileIds!: string[];
}
