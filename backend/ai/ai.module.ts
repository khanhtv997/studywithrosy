import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiKeysController } from './ai-keys.controller';
import { AiKeysService } from './ai-keys.service';
import { AiService } from './ai.service';

@Module({ controllers: [AiController, AiKeysController], providers: [AiService, AiKeysService] })
export class AiModule {}
