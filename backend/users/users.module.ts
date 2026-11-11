import { StaffController } from './staff.controller';
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
@Module({ providers: [UsersService], controllers: [UsersController, StaffController], exports: [UsersService] })
export class UsersModule {}
