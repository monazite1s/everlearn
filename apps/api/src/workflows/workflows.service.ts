/**
 * @fileoverview 实现限定所有者的 Workflow 草稿、发布与版本读取。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import { validateWorkflowDefinition } from '@everlearn/agent-runtime';

import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { withWorkflowTables, type WorkflowTable } from './workflow-db.types';
import type {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowDetail,
  WorkflowPublishResult,
  WorkflowSummary,
} from './workflow.dto';

const EMPTY_DRAFT: JsonValue = { edges: [], nodes: [], version: 1 };

/** 读取侧的普通行视图：时间戳已脱离 ColumnType 包装。 */
type WorkflowRow = Omit<WorkflowTable, 'created_at' | 'updated_at'> & {
  created_at: Date;
  updated_at: Date;
};

/** 用于构造携带稳定错误码的领域拒绝。 */
function workflowError(code: string, message: string, status: number): ApiDomainException {
  return new ApiDomainException({ code, kind: 'domain', message, status });
}

/** 用于把数据库行投影为公开摘要且不暴露草稿内容。 */
function toSummary(
  row: WorkflowRow,
  publishedVersion: number | null,
  latestRunStatus: string | null,
): WorkflowSummary {
  return {
    createdAt: row.created_at.toISOString(),
    draftUpdatedAt: row.updated_at.toISOString(),
    id: row.id,
    latestRunStatus: (latestRunStatus as WorkflowSummary['latestRunStatus']) ?? null,
    name: row.name,
    publishedVersion,
    schedule: row.schedule,
  };
}

/** 承接工作流草稿、发布与版本查询的应用服务。 */
@Injectable()
export class WorkflowsService {
  /** 用于注入数据库、身份边界并提供 Workflow 表视图。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
  ) {}

  /** 用于为固定本地操作者创建带空草稿的工作流。 */
  async create(input: CreateWorkflowDto): Promise<WorkflowSummary> {
    const database = withWorkflowTables(this.databaseService.client);
    const id = randomUUID();
    const row = await database
      .insertInto('workflows')
      .values({
        id,
        owner_id: this.identity.getActor().ownerId,
        name: input.name,
        schedule: null,
        draft_definition: EMPTY_DRAFT,
        published_version_id: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSummary(row, null, null);
  }

  /** 用于列出所有者的工作流及最近一次运行状态。 */
  async list(): Promise<WorkflowSummary[]> {
    const database = withWorkflowTables(this.databaseService.client);
    const ownerId = this.identity.getActor().ownerId;
    const rows = await database
      .selectFrom('workflows')
      .select((expression) => [
        'workflows.id',
        'workflows.name',
        'workflows.schedule',
        'workflows.created_at',
        'workflows.updated_at',
        'workflows.published_version_id',
        expression
          .selectFrom('workflow_runs as latest_run')
          .whereRef('latest_run.workflow_id', '=', 'workflows.id')
          .orderBy('latest_run.created_at', 'desc')
          .orderBy('latest_run.id', 'desc')
          .limit(1)
          .select('latest_run.status')
          .as('latest_run_status'),
      ])
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .execute();
    return Promise.all(rows.map((row) => this.toSummaryWithVersion(row)));
  }

  /** 用于把带最新运行状态的行投影为公开摘要。 */
  private async toSummaryWithVersion(row: {
    created_at: Date;
    id: string;
    latest_run_status: string | null;
    name: string;
    published_version_id: string | null;
    schedule: unknown;
    updated_at: Date;
  }): Promise<WorkflowSummary> {
    const publishedVersion =
      row.published_version_id === null
        ? null
        : await this.readVersionNumber(row.published_version_id);
    return {
      createdAt: row.created_at.toISOString(),
      draftUpdatedAt: row.updated_at.toISOString(),
      id: row.id,
      latestRunStatus: (row.latest_run_status as WorkflowSummary['latestRunStatus']) ?? null,
      name: row.name,
      publishedVersion,
      schedule: row.schedule,
    };
  }

  /** 用于读取已发布版本的版本号，缺失时按未发布处理。 */
  private async readVersionNumber(versionId: string): Promise<number | null> {
    const database = withWorkflowTables(this.databaseService.client);
    const version = await database
      .selectFrom('workflow_versions')
      .select('version')
      .where('id', '=', versionId)
      .executeTakeFirst();
    return version?.version ?? null;
  }

  /** 用于读取工作流详情并按所有者隔离不存在的资源。 */
  async read(id: string): Promise<WorkflowDetail> {
    const row = await this.requireOwned(id);
    const publishedVersion =
      row.published_version_id === null
        ? null
        : await this.readVersionNumber(row.published_version_id);
    const latestRun = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflow_runs')
      .select('status')
      .where('workflow_id', '=', id)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    return {
      ...toSummary(row, publishedVersion, latestRun?.status ?? null),
      draftDefinition: row.draft_definition,
    };
  }

  /** 用于按所有者约束更新草稿、名称与计划。 */
  async update(id: string, input: UpdateWorkflowDto): Promise<WorkflowSummary> {
    await this.requireOwned(id);
    const database = withWorkflowTables(this.databaseService.client);
    const row = await database
      .updateTable('workflows')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.draftDefinition === undefined
          ? {}
          : { draft_definition: input.draftDefinition as JsonValue }),
        ...(input.schedule === undefined
          ? {}
          : { schedule: (input.schedule ?? null) as JsonValue }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('owner_id', '=', this.identity.getActor().ownerId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const publishedVersion =
      row.published_version_id === null
        ? null
        : await this.readVersionNumber(row.published_version_id);
    return toSummary(row, publishedVersion, null);
  }

  /** 用于删除所有者工作流，运行与事件随级联删除。 */
  async remove(id: string): Promise<void> {
    await this.requireOwned(id);
    await withWorkflowTables(this.databaseService.client)
      .deleteFrom('workflows')
      .where('id', '=', id)
      .where('owner_id', '=', this.identity.getActor().ownerId)
      .executeTakeFirstOrThrow();
  }

  /** 用于校验草稿并在事务内创建不可变发布版本。 */
  async publish(id: string): Promise<WorkflowPublishResult> {
    const row = await this.requireOwned(id);
    const validated = validateWorkflowDefinition(row.draft_definition);
    if (!validated.ok) {
      const detail = validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
      throw workflowError('WORKFLOW_DEFINITION_INVALID', `草稿定义非法：${detail}`, 422);
    }
    return this.databaseService.client
      .transaction()
      .execute((transaction) => this.publishInTransaction(transaction, id));
  }

  /** 用于在事务内锁定工作流、写入新版本并回写发布指针。 */
  private async publishInTransaction(
    transaction: Transaction<DatabaseSchema>,
    id: string,
  ): Promise<WorkflowPublishResult> {
    const database = withWorkflowTables(transaction);
    const locked = await database
      .selectFrom('workflows')
      .select(['draft_definition', 'published_version_id'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const previous = await database
      .selectFrom('workflow_versions')
      .select(({ fn }) => fn.max('version').as('max_version'))
      .where('workflow_id', '=', id)
      .executeTakeFirstOrThrow();
    const nextVersion = Number(previous.max_version ?? 0) + 1;
    const versionId = randomUUID();
    await database
      .insertInto('workflow_versions')
      .values({
        id: versionId,
        workflow_id: id,
        version: nextVersion,
        definition: locked.draft_definition,
      })
      .executeTakeFirstOrThrow();
    await database
      .updateTable('workflows')
      .set({ published_version_id: versionId, updated_at: new Date() })
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return { version: nextVersion, versionId };
  }

  /** 用于读取所有者可见的工作流行，缺失时统一返回 404。 */
  private async requireOwned(id: string): Promise<WorkflowRow> {
    const row = await withWorkflowTables(this.databaseService.client)
      .selectFrom('workflows')
      .select([
        'workflows.id',
        'workflows.name',
        'workflows.owner_id',
        'workflows.schedule',
        'workflows.draft_definition',
        'workflows.published_version_id',
        'workflows.created_at',
        'workflows.updated_at',
      ])
      .where('id', '=', id)
      .where('owner_id', '=', this.identity.getActor().ownerId)
      .executeTakeFirst();
    if (row === undefined) throw new NotFoundException();
    return row;
  }
}

export { workflowError };
