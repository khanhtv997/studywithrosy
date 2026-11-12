import { StaffController } from './staff.controller';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
@Module({ imports: [NotificationsModule], providers: [UsersService], controllers: [UsersController, StaffController], exports: [UsersService] })
export class UsersModule {}
