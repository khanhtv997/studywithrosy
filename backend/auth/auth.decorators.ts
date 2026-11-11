import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PublicUser, Role } from '../users/users.service';
export const Public = () => SetMetadata('public', true);
/** Reachable while the user still has to change a given password (everything else answers 403). */
export const AllowPendingPasswordChange = () => SetMetadata('allowPendingPasswordChange', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): PublicUser => context.switchToHttp().getRequest().user);
