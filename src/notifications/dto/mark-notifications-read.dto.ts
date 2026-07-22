import {
  ArrayUnique,
  IsArray,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Mark specific notifications as read. Capped at 100 per call to keep
 * the request bounded; for a "mark all as read" call, the service
 * exposes a different code path that updates by userId + isRead=false.
 */
export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  @MaxLength(100)
  notificationIds!: string[];
}
