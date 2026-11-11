import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ClassesModule } from '../classes/classes.module';
import { StudentsModule } from '../students/students.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({ imports: [ClassesModule, StudentsModule, AssessmentsModule, SubmissionsModule], controllers: [BootstrapController], providers: [BootstrapService] })
export class BootstrapModule {}
