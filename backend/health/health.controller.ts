import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { DatabaseService } from '../database/database.service';

/** Liveness check for Docker and the reverse proxy: the process is up and PostgreSQL answers. */
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  @Public() @Get() async check() {
    await this.db.query('SELECT 1');
    return { ok: true };
  }
}
