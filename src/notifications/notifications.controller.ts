import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationFilterDto } from './dto/notification-filter.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

/** In-app inbox. Always scoped to the authenticated caller. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser, @Query() filter: NotificationFilterDto) {
    return this.notifications.findMine(user.id, filter);
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkNotificationsReadDto) {
    return this.notifications.markRead(user.id, dto.notificationIds);
  }

  /** Marks every unread notification read. */
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markRead(user.id);
  }
}
