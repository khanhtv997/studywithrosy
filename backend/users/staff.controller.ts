import { Controller, Get, Inject } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { UsersService } from './users.service';

/** Teachers and admins, for picking who to share with or who teaches a class. */
@Roles('admin', 'teacher')
@Controller('staff')
export class StaffController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() list() { return this.users.staff(); }
}
