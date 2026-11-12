import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ClassesModule } from '../classes/classes.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({ imports: [ClassesModule, AssessmentsModule, AiModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
