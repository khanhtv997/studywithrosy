import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentImportService } from './student-import.service';

@Module({ imports: [ClassesModule], controllers: [StudentsController], providers: [StudentsService, StudentImportService], exports: [StudentsService] })
export class StudentsModule {}
