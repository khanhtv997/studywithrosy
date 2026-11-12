import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { AuthConfig, GoogleLoginResult } from '../../shared/types';
import { validate } from '../common/validate';
import { UsersService, type UserRecord } from '../users/users.service';
import { googleLoginSchema, loginSchema } from './auth.dto';

const googleClientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || null;

@Injectable()
export class AuthService {
  private google: OAuth2Client | null = null;
  constructor(@Inject(UsersService) private readonly users: UsersService, @Inject(JwtService) private readonly jwt: JwtService) {}

  config(): AuthConfig { return { googleClientId: googleClientId() }; }

  private async session(user: UserRecord) {
    return { accessToken: await this.jwt.signAsync({ sub: user.id }), user: this.users.publicUser(user) };
  }

  async login(body: unknown) {
    const data = validate(loginSchema, body);
    const user = await this.users.byEmail(data.email);
    if (!user || !user.active || !(await compare(data.password, user.passwordHash))) throw new UnauthorizedException('Email or password is incorrect');
    if (user.approval === 'pending') throw new ForbiddenException('Your account is waiting for an administrator to approve it');
    if (user.approval === 'rejected') throw new ForbiddenException('Your account was not approved. Contact the administrator.');
    return this.session(user);
  }

  /** Signs in with a Google ID token from the Google button; new people get a teacher account that waits for approval. */
  async loginWithGoogle(body: unknown): Promise<GoogleLoginResult> {
    const clientId = googleClientId();
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not set up on this server');
    const { credential } = validate(googleLoginSchema, body);
    this.google ??= new OAuth2Client(clientId);
    let payload;
    try { payload = (await this.google.verifyIdToken({ idToken: credential, audience: clientId })).getPayload(); }
    catch { throw new UnauthorizedException('Google sign-in failed. Please try again.'); }
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('Google sign-in failed. Please try again.');
    if (!payload.email_verified) throw new BadRequestException('This Google account has no verified email address');

    const user = await this.users.fromGoogle({ sub: payload.sub, email: payload.email, name: payload.name?.trim() || payload.email, picture: payload.picture ?? null });
    if (!user.active) throw new UnauthorizedException('Account is disabled');
    if (user.approval !== 'approved') return { status: user.approval, name: user.name, email: user.email };
    return { status: 'ok', ...(await this.session(user)) };
  }

  async authenticate(token: string) {
    let id: string;
    try { id = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub; }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
    const user = await this.users.byId(id);
    if (!user?.active) throw new UnauthorizedException('Account is disabled');
    if (user.approval !== 'approved') throw new UnauthorizedException('Your account is waiting for an administrator to approve it');
    return this.users.publicUser(user);
  }
}
