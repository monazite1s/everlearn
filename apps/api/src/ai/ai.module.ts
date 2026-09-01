/**
 * @fileoverview 注册 AI 网关、问答与草稿生成服务及其 HTTP 端点。
 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { LocalIdentityContext } from '../identity/local-identity.context';

import { AiController } from './ai.controller';
import { AiDraftService } from './ai-draft.service';
import { AiQaService } from './ai-qa.service';
import { LlmGateway } from './llm-gateway';

/** 用于装配 AI 能力的独立领域模块。 */
@Module({
  controllers: [AiController],
  imports: [DatabaseModule],
  providers: [AiDraftService, AiQaService, LlmGateway, LocalIdentityContext],
})
export class AiModule {}
