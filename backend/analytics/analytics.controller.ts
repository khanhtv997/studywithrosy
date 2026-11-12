import { Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { PublicUser } from '../users/users.service';
import { AnalyticsService } from './analytics.service';

@Roles('admin', 'teacher')
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}
  /** ?classId= narrows the results to one of the assessment's classes. */
  @Get('assessments/:id') assessment(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: PublicUser) { return this.analytics.assessment(user, id, query); }
  /** Saved AI review suggestions (?classId= as above), and asking for a new one. */
  @Get('assessments/:id/suggestions') suggestions(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: PublicUser) { return this.analytics.suggestions(user, id, query); }
  @Post('assessments/:id/suggestions') suggest(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: PublicUser) { return this.analytics.suggest(user, id, query); }
  @Delete('suggestions/:suggestionId') deleteSuggestion(@Param('suggestionId') id: string, @CurrentUser() user: PublicUser) { return this.analytics.deleteSuggestion(user, id); }
  /** ?page=&pageSize= pages the class's assessments. */
  @Get('classes/:id') classView(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: PublicUser) { return this.analytics.classView(user, id, query); }
}
