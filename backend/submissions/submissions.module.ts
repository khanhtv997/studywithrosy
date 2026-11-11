import { ClassesModule } from '../classes/classes.module';
import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { StudentsModule } from '../students/students.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({ imports: [AssessmentsModule, StudentsModule, NotificationsModule, ClassesModule], controllers: [SubmissionsController], providers: [SubmissionsService], exports: [SubmissionsService] })
export class SubmissionsModule {}
