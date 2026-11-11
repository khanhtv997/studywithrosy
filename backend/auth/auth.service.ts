import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { validate } from '../common/validate';
import { UsersService } from '../users/users.service';
import { loginSchema } from './auth.dto';
@Injectable()
export class AuthService {
  constructor(@Inject(UsersService) private readonly users: UsersService, @Inject(JwtService) private readonly jwt: JwtService) {}
  async login(body: unknown) {
    const data = validate(loginSchema, body);
    const user = await this.users.byEmail(data.email);
    if (!user || !user.active || !(await compare(data.password, user.passwordHash))) throw new UnauthorizedException('Email or password is incorrect');
    return { accessToken: await this.jwt.signAsync({ sub: user.id }), user: this.users.publicUser(user) };
  }
  async authenticate(token: string) {
    let id: string;
    try { id = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub; }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
    const user = await this.users.byId(id);
    if (!user?.active) throw new UnauthorizedException('Account is disabled');
    return this.users.publicUser(user);
  }
}
