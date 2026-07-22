import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { NotificationChannel } from '../../common/enums';

export class SendNotificationDto {
  @IsUUID()
  userId!: string;

  /**
   * Template code (e.g. "ORDER_CONFIRMED"), not the template's UUID. The
   * service resolves code -> template so the caller doesn't need to look
   * up the internal id first.
   */
  @IsString()
  @MaxLength(80)
  templateCode!: string;

  /**
   * Template substitution variables (e.g. `{ orderNumber: "ORD-123", eta: 30 }`).
   * The service rejects reserved keys like `__proto__`, `constructor`, etc.
   * before substitution.
   */
  @IsObject()
  @IsOptional()
  variables?: Record<string, string | number>;

  /**
   * Optional override of the template's default channel. Admin-only on the
   * controller side; allows re-running a template over a different transport.
   */
  @IsEnum(NotificationChannel)
  @IsOptional()
  channelOverride?: NotificationChannel;
}
