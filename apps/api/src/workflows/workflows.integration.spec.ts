/**
 * @fileoverview 在真实 PostgreSQL 中验证 Workflow 迁移、发布不可变与运行落库。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../database/migrations/20260812010100_local_user_seed';
import { withWorkflowTables } from './workflow-db.types';
import { WorkflowsService } from './workflows.service';
import { WorkflowRunsService } from './workflow-runs.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `workflow_runtime_test_${process.pid}`;
const workflowMigrationName = '20260901000000_workflow_runtime';
const validDefinition = {
  edges: [{ from: 'a', to: 'end' }],
  nodes: [
    { config: { documentId: 'd1' }, id: 'a', type: 'kb.read' },
    { config: {}, id: 'end', type: 'workflow.end' },
  ],
  version: 1,
};
let database: Kysely<DatabaseSchema>;
let workflowsService: WorkflowsService;
let runsService: WorkflowRunsService;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
  return url.toString();
}

/** 用于创建隔离 Schema 并执行全部迁移。 */
async function prepareDatabase(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(createScopedDatabaseUrl(databaseUrl!));
  await runMigrations(database, migrationOptions('up'));
}

/** 用于删除全部测试关系并释放连接池。 */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于在隔离 Schema 中创建确定的 Kysely 元数据名称。 */
function migrationOptions(direction: 'up' | 'down') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  } as const;
}

/** 用于构造注入测试客户端的服务实例。 */
function createServices(): void {
  const databaseService = { client: database } as unknown as ConstructorParameters<
    typeof WorkflowsService
  >[0];
  workflowsService = new WorkflowsService(databaseService, {
    /** 用于以固定本地用户充当操作者。 */
    getActor: () => ({ ownerId: LOCAL_USER_ID }),
  });
  runsService = new WorkflowRunsService(databaseService);
}

/** 用于读取当前 Schema 下的全部表名。 */
async function listTables(): Promise<string[]> {
  const { sql } = await import('kysely');
  const rows = await sql<{ table_name: string }>`
    select table_name from information_schema.tables where table_schema = current_schema()
  `.execute(database);
  return rows.rows.map((row) => row.table_name);
}

/** 用于创建工作流、写入模板草稿并发布。 */
async function createPublishedWorkflow(name: string) {
  const created = await workflowsService.create({ name });
  await workflowsService.update(created.id, { draftDefinition: validDefinition });
  return { created, publish: await workflowsService.publish(created.id) };
}

beforeAll(async () => {
  await prepareDatabase();
  createServices();
});

afterAll(cleanDatabase);

describe('workflow 定义持久化', () => {
  test('迁移 up 创建四张状态表，down 可逆回退', async () => {
    const tableNames = await listTables();
    for (const table of [
      'workflows',
      'workflow_versions',
      'workflow_runs',
      'workflow_run_events',
    ]) {
      expect(tableNames).toContain(table);
    }
    const reverted: string[] = [];
    while (!reverted.includes(workflowMigrationName) && reverted.length < 20) {
      const step = await runMigrations(database, migrationOptions('down'));
      reverted.push(...step.executedMigrations);
    }
    expect(reverted.at(-1)).toBe(workflowMigrationName);
    expect(await listTables()).not.toContain('workflows');
    await runMigrations(database, migrationOptions('up'));
  });

  test('发布创建不可变版本且版本号递增', async () => {
    const first = await createPublishedWorkflow('测试工作流');
    expect(first.publish.version).toBe(1);
    const second = await workflowsService.publish(first.created.id);
    expect(second.version).toBe(2);
    const detail = await workflowsService.read(first.created.id);
    expect(detail.publishedVersion).toBe(2);
    const versions = await withWorkflowTables(database)
      .selectFrom('workflow_versions')
      .select(['version'])
      .where('workflow_id', '=', first.created.id)
      .orderBy('version', 'asc')
      .execute();
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
  });

  test('非法草稿发布被拒绝且不产生版本', async () => {
    const created = await workflowsService.create({ name: '非法工作流' });
    await workflowsService.update(created.id, {
      draftDefinition: { edges: [], nodes: [], version: 1 },
    });
    await expect(workflowsService.publish(created.id)).rejects.toMatchObject({
      problem: { code: 'WORKFLOW_DEFINITION_INVALID' },
    });
  });
});

describe('workflow 运行持久化', () => {
  test('运行创建固定最新发布版本并可领取执行', async () => {
    const { created, publish } = await createPublishedWorkflow('运行工作流');
    const run = await runsService.createRun(created.id);
    expect(run.status).toBe('pending');
    const claimed = await runsService.claimPendingRuns(3);
    expect(claimed.map((item) => item.runId)).toContain(run.id);
    const context = await runsService.readRunContext(run.id);
    expect(context.status).toBe('running');
    expect((context.definition as typeof validDefinition).version).toBe(publish.version);
    await runsService.appendEvent(run.id, { nodeId: 'a', seq: 1, status: 'succeeded' });
    await runsService.completeRun(run.id, { outputSummary: '完成', status: 'succeeded' });
    const detail = await runsService.readRun(run.id);
    expect(detail.status).toBe('succeeded');
    expect(detail.events).toHaveLength(1);
  });
});
