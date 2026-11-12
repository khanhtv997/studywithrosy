import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { PublicUser } from '../users/users.service';

@Roles('admin', 'teacher')
@Controller('assessments')
export class AssessmentsController {
  constructor(@Inject(AssessmentsService) private readonly assessments: AssessmentsService) {}
  @Get() list(@CurrentUser() user: PublicUser) { return this.assessments.findAllFor(user); }

  // Sharing between teachers. These come before ':id' so "shared-with-me" is not read as an id.
  @Get('page') page(@Query() query: unknown, @CurrentUser() user: PublicUser) { return this.assessments.page(user, query); }
  @Get('shared-with-me') sharedWithMe(@CurrentUser() user: PublicUser) { return this.assessments.sharedWithMe(user); }
  @Get('shared/:key') openShared(@Param('key') key: string, @CurrentUser() user: PublicUser) { return this.assessments.openShared(key, user); }
  @Post('shared/:key/copy') copy(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: PublicUser) { return this.assessments.copyShared(key, body, user); }

  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.assessments.findOneFor(user, id); }
  @Post() create(@Body() body: unknown, @CurrentUser() user: PublicUser) { return this.assessments.create(body, user); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: PublicUser) { return this.assessments.update(id, body, user); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.assessments.remove(id, user); }

  @Get(':id/shares') shares(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.assessments.shares(id, user); }
  @Post(':id/shares') share(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: PublicUser) { return this.assessments.share(id, body, user); }
  @Delete(':id/shares/:userId') unshare(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: PublicUser) { return this.assessments.unshare(id, userId, user); }
  @Post(':id/share-link') createLink(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.assessments.createLink(id, user); }
  @Delete(':id/share-link') revokeLink(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.assessments.revokeLink(id, user); }
}
