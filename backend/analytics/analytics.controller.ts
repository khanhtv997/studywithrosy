import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { PublicUser } from '../users/users.service';
import { AnalyticsService } from './analytics.service';

@Roles('admin', 'teacher')
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}
  /** ?classId= narrows the results to one of the assessment's classes. */
  @Get('assessments/:id') assessment(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: PublicUser) { return this.analytics.assessment(user, id, query); }
  /** ?page=&pageSize= pages the class's assessments. */
  @Get('classes/:id') classView(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: PublicUser) { return this.analytics.classView(user, id, query); }
}
