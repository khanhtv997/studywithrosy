import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
@Module({ imports: [UsersModule, JwtModule.registerAsync({ useFactory: () => {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_JWT_SECRET must contain at least 32 characters');
  return { secret, signOptions: { expiresIn: '8h' as const } };
} })], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
