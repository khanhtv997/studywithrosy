import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { PublicUser } from '../users/users.service';

@Controller('submissions')
export class SubmissionsController {
  constructor(@Inject(SubmissionsService) private readonly submissions: SubmissionsService) {}
  @Roles('admin', 'teacher') @Get() list(@CurrentUser() user: PublicUser) { return this.submissions.findAllFor(user); }
  @Roles('admin', 'teacher') @Get('page') page(@Query() query: unknown, @CurrentUser() user: PublicUser) { return this.submissions.page(user, query); }
  @Roles('admin', 'teacher') @Get(':id') get(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.submissions.findOneFor(user, id); }
  @Roles('student') @Post() async submit(@Body() body: Record<string, unknown>, @CurrentUser() user: PublicUser) {
    if (!user.studentId) throw new ForbiddenException('Account is not linked to a student');
    // The student id always comes from the token; the score stays hidden until review.
    const item = await this.submissions.submit({ ...body, studentId: user.studentId });
    return { ...item, autoScore: 0 };
  }
  @Roles('admin', 'teacher') @Patch(':id/review') review(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: PublicUser) { return this.submissions.review(id, body, user); }
}
