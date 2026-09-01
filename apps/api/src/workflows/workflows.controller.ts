/**
 * @fileoverview 提供限定所有者的工作流 CRUD、发布与运行查询端点。
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { RunParamDto } from './workflow-run-param.dto';
import {
  CreateWorkflowDto,
  type WorkflowDetail,
  type WorkflowPublishResult,
  type WorkflowRunDetail,
  type WorkflowRunSummary,
  type WorkflowSummary,
  UpdateWorkflowDto,
} from './workflow.dto';
import { WorkflowRunsService } from './workflow-runs.service';
import { WorkflowsService } from './workflows.service';

/** 用于将已校验 HTTP 输入映射到工作流应用服务。 */
@Controller('workflows')
export class WorkflowsController {
  /** 用于注入草稿与运行两个应用服务。 */
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly runsService: WorkflowRunsService,
  ) {}

  /** 用于创建带空草稿的工作流。 */
  @Post()
  create(@Body() input: CreateWorkflowDto): Promise<WorkflowSummary> {
    return this.workflowsService.create(input);
  }

  /** 用于列出所有者的工作流与最近运行状态。 */
  @Get()
  list(): Promise<WorkflowSummary[]> {
    return this.workflowsService.list();
  }

  /** 用于读取运行详情与事件列表。 */
  @Get('runs/:runId')
  readRun(@Param() params: RunParamDto): Promise<WorkflowRunDetail> {
    return this.runsService.readRun(params.runId);
  }

  /** 用于读取工作流详情。 */
  @Get(':id')
  read(@Param() params: UuidParamDto): Promise<WorkflowDetail> {
    return this.workflowsService.read(params.id);
  }

  /** 用于更新草稿、名称与计划。 */
  @Patch(':id')
  update(
    @Param() params: UuidParamDto,
    @Body() input: UpdateWorkflowDto,
  ): Promise<WorkflowSummary> {
    return this.workflowsService.update(params.id, input);
  }

  /** 用于删除尚未依赖运行历史的工作流。 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: UuidParamDto): Promise<void> {
    await this.workflowsService.remove(params.id);
  }

  /** 用于校验草稿并创建不可变发布版本。 */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param() params: UuidParamDto): Promise<WorkflowPublishResult> {
    return this.workflowsService.publish(params.id);
  }

  /** 用于以最新发布版本创建待执行运行。 */
  @Post(':id/runs')
  @HttpCode(HttpStatus.OK)
  createRun(@Param() params: UuidParamDto): Promise<WorkflowRunSummary> {
    return this.runsService.createRun(params.id);
  }

  /** 用于列出工作流最近运行。 */
  @Get(':id/runs')
  listRuns(@Param() params: UuidParamDto): Promise<WorkflowRunSummary[]> {
    return this.runsService.listRuns(params.id);
  }
}
