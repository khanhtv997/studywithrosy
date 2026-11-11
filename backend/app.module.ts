import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { AiModule } from './ai/ai.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/auth.guards';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthController } from './health/health.controller';

@Module({ imports: [DatabaseModule, UsersModule, AuthModule, ClassesModule, StudentsModule, AssessmentsModule, SubmissionsModule, BootstrapModule, AiModule, NotificationsModule], controllers: [HealthController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }] })
export class AppModule {}
