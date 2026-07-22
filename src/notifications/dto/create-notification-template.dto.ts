import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NotificationChannel } from '../../common/enums';

export class CreateNotificationTemplateDto {
  /**
   * Stable code referenced by the rest of the system. Uppercase, digits, and
   * underscores only — keeps it grep-friendly in logs and locale files.
   */
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]+$/, {
    message:
      'code must start with an uppercase letter and contain only uppercase letters, digits, and underscores',
  })
  @MaxLength(80)
  code!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titleTemplate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  bodyTemplate!: string;
}
