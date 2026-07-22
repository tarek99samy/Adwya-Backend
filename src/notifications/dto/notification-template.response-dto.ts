import { NotificationChannel } from '../../common/enums';

export class NotificationTemplateResponseDto {
  id!: string;
  code!: string;
  channel!: NotificationChannel;
  titleTemplate!: string;
  bodyTemplate!: string;
}
