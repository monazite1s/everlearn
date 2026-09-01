/**
 * @fileoverview 提供受内部密钥保护的 Worker 运行与副作用端点。
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { secretsMatch } from '../http-boundary/timing-safe-secret';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { WorkflowEffectsService } from './workflow-effects.service';
import { WorkflowRunsService } from './workflow-runs.service';
import {
  AppendWorkflowRunEventDto,
  CompleteWorkflowRunDto,
  type WorkflowDispatchItem,
  type WorkflowRunContext,
  type WorkflowRunRecovery,
  type WorkflowScheduleItem,
} from './workflow.dto';
import { DocCreateActionDto } from './workflow-doc-create.dto';
import { DispatchWorkflowRunsDto } from './workflow-dispatch.dto';
import { KbReadActionDto } from './workflow-kb-read.dto';
import { LlmActionDto } from './workflow-llm.dto';
import { ScheduledRunDto } from './workflow-scheduled-run.dto';

// 沿用现有 Worker 内部密钥边界，避免在本切片扩大运行时配置迁移。
const INTERNAL_SECRET_HEADER = 'x-purge-secret';

/** 用于让 Worker 经 API 所有权边界执行运行状态迁移与节点副作用。 */
@Controller('internal/workflows')
export class WorkflowsInternalController {
  /** 用于注入内部密钥配置与运行、副作用服务。 */
  constructor(
    private readonly config: ConfigService<Record<string, string>, false>,
    private readonly runsService: WorkflowRunsService,
    private readonly effectsService: WorkflowEffectsService,
    private readonly identity: LocalIdentityContext,
  ) {}

  /** 用于校验内部密钥且拒绝未配置密钥的部署。 */
  private requireSecret(request: Request): void {
    const expected = this.config.get<string>('PURGE_TRIGGER_SECRET');
    const provided = request.headers[INTERNAL_SECRET_HEADER];
    if (
      expected === undefined ||
      expected.length === 0 ||
      typeof provided !== 'string' ||
      !secretsMatch(expected, provided)
    ) {
      throw new UnauthorizedException();
    }
  }

  /** 用于原子领取一批待执行运行。 */
  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  dispatch(
    @Req() request: Request,
    @Body() input: DispatchWorkflowRunsDto,
  ): Promise<readonly WorkflowDispatchItem[]> {
    this.requireSecret(request);
    return this.runsService.claimPendingRuns(input.limit ?? 3);
  }

  /** 用于读取运行与其冻结定义。 */
  @Get('runs/:runId/context')
  readContext(@Req() request: Request): Promise<WorkflowRunContext> {
    this.requireSecret(request);
    const runId = request.params.runId as string;
    return this.runsService.readRunContext(runId);
  }

  /** 用于按序幂等追加节点事件。 */
  @Post('runs/:runId/events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async appendEvent(
    @Req() request: Request,
    @Body() input: AppendWorkflowRunEventDto,
  ): Promise<void> {
    this.requireSecret(request);
    await this.runsService.appendEvent(request.params.runId as string, input);
  }

  /** 用于把运行推进到终态。 */
  @Post('runs/:runId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completeRun(@Req() request: Request, @Body() input: CompleteWorkflowRunDto): Promise<void> {
    this.requireSecret(request);
    await this.runsService.completeRun(request.params.runId as string, input);
  }

  /** 用于执行知识库读取节点。 */
  @Post('actions/kb-read')
  @HttpCode(HttpStatus.OK)
  readKbDocument(@Req() request: Request, @Body() input: KbReadActionDto) {
    this.requireSecret(request);
    return this.effectsService.readKbDocument(this.identity.getActor().ownerId, input.documentId);
  }

  /** 用于执行文档创建节点。 */
  @Post('actions/doc-create')
  @HttpCode(HttpStatus.OK)
  createDocument(@Req() request: Request, @Body() input: DocCreateActionDto) {
    this.requireSecret(request);
    return this.effectsService.createDocument({
      knowledgeBaseId: input.knowledgeBaseId,
      nodeId: input.nodeId,
      ownerId: this.identity.getActor().ownerId,
      plainText: input.plainText,
      title: input.title,
      workflowRunId: input.runId,
    });
  }

  /** 用于执行 LLM 生成节点。 */
  @Post('actions/llm')
  @HttpCode(HttpStatus.OK)
  completeLlm(@Req() request: Request, @Body() input: LlmActionDto) {
    this.requireSecret(request);
    return this.effectsService.completeLlm(this.identity.getActor().ownerId, input.prompt);
  }

  /** 用于把中断遗留的 running 运行复位为待执行。 */
  @Post('runs/recover')
  @HttpCode(HttpStatus.OK)
  recoverInterruptedRuns(@Req() request: Request): Promise<WorkflowRunRecovery> {
    this.requireSecret(request);
    return this.runsService.recoverInterruptedRuns();
  }

  /** 用于列出启用计划的工作流。 */
  @Get('schedules')
  @HttpCode(HttpStatus.OK)
  listSchedules(@Req() request: Request): Promise<readonly WorkflowScheduleItem[]> {
    this.requireSecret(request);
    return this.runsService.listSchedules();
  }

  /** 用于为计划触发创建或复用活跃运行。 */
  @Post('scheduled-runs')
  @HttpCode(HttpStatus.OK)
  createScheduledRun(@Req() request: Request, @Body() input: ScheduledRunDto) {
    this.requireSecret(request);
    return this.runsService.createScheduledRun(input.workflowId);
  }
}
