import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { UsersService, type PublicUser } from './users.service';

@Roles('admin')
@Controller('admin/users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() all() { return this.users.all(); }
  @Get('page') page(@Query() query: unknown) { return this.users.page(query); }
  @Post() create(@Body() body: unknown) { return this.users.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.users.update(id, body); }
  @Patch(':id/lock') lock(@Param('id') id: string, @Body() body: unknown, @CurrentUser() admin: PublicUser) { return this.users.setLock(id, body, admin); }
  @Patch(':id/approval') approval(@Param('id') id: string, @Body() body: unknown, @CurrentUser() admin: PublicUser) { return this.users.setApproval(id, body, admin); }
  @Patch(':id/password') password(@Param('id') id: string, @Body() body: unknown) { return this.users.changePassword(id, body); }
}
