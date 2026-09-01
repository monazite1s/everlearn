/**
 * @fileoverview 装配工作流草稿、发布、运行与内部执行端点。
 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { LlmGateway } from '../ai/llm-gateway';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { WorkflowEffectsService } from './workflow-effects.service';
import { WorkflowsInternalController } from './workflows-internal.controller';
import { WorkflowRunsService } from './workflow-runs.service';
import { requireJsonContentType } from '../http-boundary/require-json-content-type';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

/** 用于持有工作流切片的控制器、服务与数据库依赖。 */
@Module({
  controllers: [WorkflowsController, WorkflowsInternalController],
  imports: [DatabaseModule],
  providers: [
    LocalIdentityContext,
    LlmGateway,
    WorkflowEffectsService,
    WorkflowRunsService,
    WorkflowsService,
  ],
})
export class WorkflowsModule implements NestModule {
  /** 用于向工作流写入路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requireJsonContentType).forRoutes(WorkflowsController);
  }
}
