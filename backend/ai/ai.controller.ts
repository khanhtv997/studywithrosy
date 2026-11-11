import { Body, Controller, Inject, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { Roles } from '../auth/auth.decorators';

@Roles('admin', 'teacher')
@Controller()
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}
  @Post('ocr-exam') ocr(@Body() body: unknown) { return this.ai.ocr(body); }
  @Post('generate-feedback') feedback(@Body() body: unknown) { return this.ai.feedback(body); }
  @Post('analyze-exam-gap') analysis(@Body() body: unknown) { return this.ai.analysis(body); }
}
