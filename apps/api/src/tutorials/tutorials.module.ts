/**
 * @fileoverview 装配教程会话、对话创作、Worker 内部执行端点与状态机服务。
 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { LlmGateway } from '../ai/llm-gateway';
import { DatabaseModule } from '../database/database.module';
import { requireJsonContentType } from '../http-boundary/require-json-content-type';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { TutorialChaptersController } from './tutorial-chapters.controller';
import { TutorialConversationsController } from './tutorial-conversations.controller';
import { TutorialConversationsService } from './tutorial-conversations.service';
import { TutorialProposalsService } from './tutorial-proposals.service';
import { TutorialsInternalController } from './tutorials-internal.controller';
import { TutorialsController } from './tutorials.controller';
import { TutorialRunsService } from './tutorial-runs.service';
import { TutorialService } from './tutorial.service';

/** 用于持有教程切片的控制器、服务与数据库依赖。 */
@Module({
  controllers: [
    TutorialsController,
    TutorialsInternalController,
    TutorialChaptersController,
    TutorialConversationsController,
  ],
  imports: [DatabaseModule],
  providers: [
    LocalIdentityContext,
    LlmGateway,
    TutorialService,
    TutorialRunsService,
    TutorialConversationsService,
    TutorialProposalsService,
  ],
})
export class TutorialsModule implements NestModule {
  /** 用于向教程读写路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requireJsonContentType)
      .forRoutes(TutorialsController, TutorialChaptersController, TutorialConversationsController);
  }
}
