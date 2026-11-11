import { Controller, Get, Inject } from '@nestjs/common';
import type { AppUser } from '../../shared/types';
import { CurrentUser } from '../auth/auth.decorators';
import { BootstrapService } from './bootstrap.service';

@Controller('bootstrap')
export class BootstrapController {
  constructor(@Inject(BootstrapService) private readonly bootstrap: BootstrapService) {}
  @Get() get(@CurrentUser() user: AppUser) { return this.bootstrap.forUser(user); }
}
