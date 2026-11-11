import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { StudentsModule } from '../students/students.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({ imports: [ClassesModule, StudentsModule, NotificationsModule], controllers: [AssessmentsController], providers: [AssessmentsService], exports: [AssessmentsService] })
export class AssessmentsModule {}
