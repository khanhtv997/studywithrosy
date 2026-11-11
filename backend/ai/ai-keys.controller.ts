import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { AiKeysService } from './ai-keys.service';
import { AiService } from './ai.service';

/** Admin screen "Khoá API AI": keys are write-only, responses only carry the last 4 characters. */
@Roles('admin')
@Controller('admin/ai-keys')
export class AiKeysController {
  constructor(@Inject(AiKeysService) private readonly keys: AiKeysService, @Inject(AiService) private readonly ai: AiService) {}
  @Get() list() { return this.keys.list().then(keys => ({ keys, models: this.ai.models })); }
  @Post() create(@Body() body: unknown) { return this.keys.create(body); }
  @Put('order') reorder(@Body() body: unknown) { return this.keys.reorder(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.keys.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.keys.remove(id); }
  @Post(':id/test') test(@Param('id') id: string) { return this.keys.test(id, this.ai.models); }
}
