import { NotificationStatus } from '../../common/enums';

export class NotificationLogResponseDto {
  id!: string;
  notificationId!: string;
  deviceTokenId?: string | null;
  status!: NotificationStatus;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  failureReason?: string | null;
  createdAt!: Date;
}
