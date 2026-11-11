import { Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import type { AppUser } from '../../shared/types';
import { CurrentUser } from '../auth/auth.decorators';
import { NotificationsService } from './notifications.service';

/** Every signed-in role reads only their own notifications. */
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}
  @Get() list(@CurrentUser() user: AppUser) { return this.notifications.list(user.id); }
  @Patch('read-all') readAll(@CurrentUser() user: AppUser) { return this.notifications.markAllRead(user.id); }
  @Patch(':id/read') read(@CurrentUser() user: AppUser, @Param('id') id: string) { return this.notifications.markRead(user.id, id); }
}
