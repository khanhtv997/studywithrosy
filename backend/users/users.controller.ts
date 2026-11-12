import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { UsersService } from './users.service';

@Roles('admin')
@Controller('admin/users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() all() { return this.users.all(); }
  @Get('page') page(@Query() query: unknown) { return this.users.page(query); }
  @Post() create(@Body() body: unknown) { return this.users.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.users.update(id, body); }
  @Patch(':id/password') password(@Param('id') id: string, @Body() body: unknown) { return this.users.changePassword(id, body); }
}
