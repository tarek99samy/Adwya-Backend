import { IsEnum, IsString, MaxLength } from 'class-validator';
import { DevicePlatform } from '../../common/enums';

export class CreateDeviceTokenDto {
  @IsString()
  @MaxLength(4096)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
