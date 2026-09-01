/**
 * @fileoverview 实现 Workflow 运行的创建、领取、事件与终态写入。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import { workflowError } from './workflows.service';
import { withWorkflowTables, type WorkflowDatabaseSchema } from './workflow-db.types';
import type {
  AppendWorkflowRunEventDto,
  CompleteWorkflowRunDto,
  WorkflowDispatchItem,
  WorkflowRunContext,
  WorkflowRunDetail,
  WorkflowRunRecovery,
  WorkflowRunSummary,
  WorkflowScheduleItem,
} from './workflow.dto';

const ACTIVE_RUN_STATUSES = ['pending', 'running'] as const;

/** 承接运行创建、领取与终态写入的应用服务。 */
@Injectable()
export class WorkflowRunsService {
  /** 用于注入数据库客户端并承接运行状态迁移。 */
  constructor(private readonly databaseService: DatabaseService) {}

  /** 用于把最新发布版本固化为一次待执行运行。 */
  async createRun(workflowId: string): Promise<WorkflowRunSummary> {
    const database = withWorkflowTables(this.databaseService.client);
    const workflow = await database
      .selectFrom('workflows')
      .select(['id', 'published_version_id'])
      .where('id', '=', workflowId)
      .executeTakeFirst();
    if (workflow?.published_version_id == null) {
      throw workflowError('WORKFLOW_NOT_PUBLISHED', '工作流不存在或尚未发布可用版本。', 404);
    }
    const row = await database
      .insertInto('workflow_runs')
      .values({
        id: randomUUID(),
        workflow_id: workflowId,
        version_id: workflow.published_version_id,
        owner_id: (await this.readOwner(workflowId)) ?? '',
        status: 'pending',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toRunSummary(row);
  }

  /** 用于为计划触发创建或复用当天同工作流的活跃运行。 */
  async createScheduledRun(workflowId: string): Promise<{ runId: string }> {
    const existing = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflow_runs')
      .select('id')
      .where('workflow_id', '=', workflowId)
      .where('status', 'in', [...ACTIVE_RUN_STATUSES])
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (existing !== undefined) return { runId: existing.id };
    return { runId: (await this.createRun(workflowId)).id };
  }

  /** 用于读取运行所属工作流的所有者，供运行创建时回填。 */
  private async readOwner(workflowId: string): Promise<string | null> {
    const row = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflows')
      .select('owner_id')
      .where('id', '=', workflowId)
      .executeTakeFirst();
    return row?.owner_id ?? null;
  }

  /** 用于按时间倒序列出工作流最近运行。 */
  async listRuns(workflowId: string): Promise<WorkflowRunSummary[]> {
    const rows = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflow_runs')
      .selectAll()
      .where('workflow_id', '=', workflowId)
      .orderBy('created_at', 'desc')
      .limit(20)
      .execute();
    return rows.map((row) => this.toRunSummary(row));
  }

  /** 用于读取运行详情及其按序事件列表。 */
  async readRun(runId: string): Promise<WorkflowRunDetail> {
    const database = withWorkflowTables(this.databaseService.client);
    const run = await database
      .selectFrom('workflow_runs')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirst();
    if (run === undefined) throw new NotFoundException();
    const events = await database
      .selectFrom('workflow_run_events')
      .select(['created_at', 'message', 'node_id', 'seq', 'status'])
      .where('run_id', '=', runId)
      .orderBy('seq', 'asc')
      .execute();
    return {
      ...this.toRunSummary(run),
      events: events.map((event) => ({
        createdAt: event.created_at.toISOString(),
        message: event.message,
        nodeId: event.node_id,
        seq: event.seq,
        status: event.status,
      })),
    };
  }

  /** 用于原子领取待执行运行并固化为 running。 */
  async claimPendingRuns(limit: number): Promise<WorkflowDispatchItem[]> {
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const database = transaction as unknown as Kysely<WorkflowDatabaseSchema>;
      const pending = await database
        .selectFrom('workflow_runs')
        .innerJoin('workflow_versions', 'workflow_versions.id', 'workflow_runs.version_id')
        .select(['workflow_runs.id as run_id', 'workflow_versions.definition'])
        .where('workflow_runs.status', '=', 'pending')
        .orderBy('workflow_runs.created_at', 'asc')
        .limit(limit)
        .forUpdate()
        .execute();
      const runIds = pending.map((row) => row.run_id);
      if (runIds.length > 0) {
        await database
          .updateTable('workflow_runs')
          .set({ status: 'running', updated_at: new Date() })
          .where('id', 'in', runIds)
          .execute();
      }
      return pending.map((row) => ({ definition: row.definition, runId: row.run_id }));
    });
  }

  /** 用于读取运行与其冻结定义供 Worker 执行。 */
  async readRunContext(runId: string): Promise<WorkflowRunContext> {
    const row = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflow_runs')
      .innerJoin('workflow_versions', 'workflow_versions.id', 'workflow_runs.version_id')
      .select(['workflow_runs.status', 'workflow_versions.definition'])
      .where('workflow_runs.id', '=', runId)
      .executeTakeFirst();
    if (row === undefined) throw new NotFoundException();
    return { definition: row.definition, runId, status: row.status };
  }

  /** 用于按序号幂等追加节点事件，重复序号保持首次结果。 */
  async appendEvent(runId: string, input: AppendWorkflowRunEventDto): Promise<void> {
    await withWorkflowTables(this.databaseService.client)
      .insertInto('workflow_run_events')
      .values({
        id: randomUUID(),
        run_id: runId,
        seq: input.seq,
        node_id: input.nodeId,
        status: input.status,
        message: input.message ?? null,
      })
      .onConflict((constraint) => constraint.columns(['run_id', 'seq']).doNothing())
      .execute();
  }

  /** 用于把运行推进到终态并写入摘要或错误码。 */
  async completeRun(runId: string, input: CompleteWorkflowRunDto): Promise<void> {
    const database = withWorkflowTables(this.databaseService.client);
    const result = await database
      .updateTable('workflow_runs')
      .set({
        status: input.status,
        output_summary: input.outputSummary ?? null,
        error_code: input.errorCode ?? null,
        updated_at: new Date(),
      })
      .where('id', '=', runId)
      .where('status', 'in', [...ACTIVE_RUN_STATUSES])
      .executeTakeFirst();
    if (Number(result.numChangedRows) === 0) {
      throw workflowError('RUN_NOT_ACTIVE', '运行不存在或已进入终态。', 409);
    }
  }

  /** 用于把中断遗留的 running 运行复位为 pending，交由领取机制保证单执行。 */
  async recoverInterruptedRuns(): Promise<WorkflowRunRecovery> {
    // ponytail: 以「Worker 启动时一次性复位 running」近似心跳存活判定；多 Worker 同时滚动重启会把彼此活跃运行复位重跑，升级条件为引入多实例部署。
    const recovered = await withWorkflowTables(this.databaseService.client)
      .updateTable('workflow_runs')
      .set({ status: 'pending', updated_at: new Date() })
      .where('status', '=', 'running')
      .returning('id')
      .execute();
    return { recoveredRunIds: recovered.map((row) => row.id) };
  }

  /** 用于列出启用计划且已有发布版本的工作流。 */
  async listSchedules(): Promise<WorkflowScheduleItem[]> {
    const rows = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflows')
      .select(['id', 'schedule'])
      .where('schedule', 'is not', null)
      .where('published_version_id', 'is not', null)
      .execute();
    return rows.flatMap((row) => {
      const schedule = row.schedule as unknown as WorkflowScheduleItem['schedule'] | null;
      if (schedule === null || typeof schedule !== 'object') return [];
      return [{ schedule, workflowId: row.id }];
    });
  }

  /** 用于把运行行投影为公开摘要。 */
  private toRunSummary(row: {
    created_at: Date;
    error_code: string | null;
    id: string;
    output_summary: string | null;
    status: string;
  }): WorkflowRunSummary {
    return {
      createdAt: row.created_at.toISOString(),
      errorCode: row.error_code,
      id: row.id,
      outputSummary: row.output_summary,
      status: row.status,
    };
  }
}
