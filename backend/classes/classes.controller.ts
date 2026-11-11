import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { PublicUser } from '../users/users.service';

@Roles('admin', 'teacher')
@Controller('classes')
export class ClassesController {
  constructor(@Inject(ClassesService) private readonly classes: ClassesService) {}
  @Get() list(@CurrentUser() user: PublicUser) { return this.classes.findAllFor(user); }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.classes.findOneFor(user, id); }
  @Post() create(@Body() body: unknown, @CurrentUser() user: PublicUser) { return this.classes.create(body, user); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: PublicUser) { return this.classes.update(id, body, user); }
}
