import { Body, Controller, Get, Inject, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AllowPendingPasswordChange, CurrentUser, Public } from './auth.decorators';
import { UsersService, type PublicUser } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(UsersService) private readonly users: UsersService) {}
  @Public() @Post('login') login(@Body() body: unknown) { return this.auth.login(body); }
  @AllowPendingPasswordChange() @Get('me') me(@CurrentUser() user: PublicUser) { return user; }
  /** Any signed-in user changes their own password; required after an import or an admin reset. */
  @AllowPendingPasswordChange() @Patch('password') changePassword(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return this.users.changeOwnPassword(user.id, body);
  }
}
