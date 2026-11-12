import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ClassesModule } from '../classes/classes.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({ imports: [ClassesModule, AssessmentsModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
