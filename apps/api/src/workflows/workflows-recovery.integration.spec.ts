/**
 * @fileoverview 在真实 PostgreSQL 中验证运行恢复、重启补偿扫描与文档创建幂等。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { identityKnowledgeSchemaMigration } from '../database/migrations/20260812010000_identity_knowledge_schema';
import { localUserSeedMigration } from '../database/migrations/20260812010100_local_user_seed';
import { trashRetentionIndexesMigration } from '../database/migrations/20260817000000_trash_retention_indexes';
import { documentRevisionTitleMigration } from '../database/migrations/20260818000000_document_revision_title';
import { attachmentsMigration } from '../database/migrations/20260819000000_attachments';
import { searchProjectionMigration } from '../database/migrations/20260824000000_search_projection';
import { searchQueryIndexesMigration } from '../database/migrations/20260825000000_search_query_indexes';
import { workflowRuntimeMigration } from '../database/migrations/20260901000000_workflow_runtime';
import { newsSchemaMigration } from '../database/migrations/20260902000000_news_schema';
import { documentTagsLinksMigration } from '../database/migrations/20260903000000_document_tags_links';
import { LOCAL_USER_ID } from '../database/migrations/20260812010100_local_user_seed';
import { withWorkflowTables } from './workflow-db.types';
import { WorkflowEffectsService } from './workflow-effects.service';
import { WorkflowRunsService } from './workflow-runs.service';
import { WorkflowsService } from './workflows.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `workflow_recovery_test_${process.pid}`;

// 显式列举已合入迁移，避免并行任务的进行中迁移阻断本用例的 schema 建立。
const stableMigrations = {
  '20260812010000_identity_knowledge_schema': identityKnowledgeSchemaMigration,
  '20260812010100_local_user_seed': localUserSeedMigration,
  '20260817000000_trash_retention_indexes': trashRetentionIndexesMigration,
  '20260818000000_document_revision_title': documentRevisionTitleMigration,
  '20260819000000_attachments': attachmentsMigration,
  '20260824000000_search_projection': searchProjectionMigration,
  '20260825000000_search_query_indexes': searchQueryIndexesMigration,
  '20260901000000_workflow_runtime': workflowRuntimeMigration,
  '20260902000000_news_schema': newsSchemaMigration,
  '20260903000000_document_tags_links': documentTagsLinksMigration,
};

/** 用于提供测试用稳定迁移注册表。 */
function stableMigrationProvider() {
  return {
    /** 用于返回不含进行中迁移的注册表副本。 */
    getMigrations: () => Promise.resolve({ ...stableMigrations }),
  };
}
let database: Kysely<DatabaseSchema>;
let workflowsService: WorkflowsService;
let runsService: WorkflowRunsService;
let effectsService: WorkflowEffectsService;

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
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
    provider: stableMigrationProvider(),
  });
}

/** 用于删除全部测试关系并释放连接池。 */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
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
  effectsService = new WorkflowEffectsService(databaseService, {
    /** 用于在未触及 LLM 网关的用例中充当占位提供方。 */
    requireProvider: () => {
      throw new Error('llm not used in this test');
    },
  } as never);
}

/** 用于创建知识库行供文档创建副作用落库。 */
async function createKnowledgeBase(): Promise<string> {
  const knowledgeBaseId = randomUUID();
  await database
    .insertInto('knowledge_bases')
    .values({ id: knowledgeBaseId, kind: 'normal', name: '恢复测试库', owner_id: LOCAL_USER_ID })
    .executeTakeFirstOrThrow();
  return knowledgeBaseId;
}

/** 用于创建工作流、发布并创建一次待执行运行。 */
async function createRunningRun(knowledgeBaseId: string): Promise<string> {
  const definition = {
    edges: [
      { from: 'a', to: 'doc' },
      { from: 'doc', to: 'end' },
    ],
    nodes: [
      { config: { documentId: 'src' }, id: 'a', type: 'kb.read' },
      {
        config: { knowledgeBaseId, sourceNodeId: 'a', title: '自动文档' },
        id: 'doc',
        type: 'doc.create',
      },
      { config: {}, id: 'end', type: 'workflow.end' },
    ],
    version: 1 as const,
  };
  const created = await workflowsService.create({ name: `恢复工作流 ${randomUUID()}` });
  await workflowsService.update(created.id, { draftDefinition: definition });
  await workflowsService.publish(created.id);
  const run = await runsService.createRun(created.id);
  await runsService.claimPendingRuns(3);
  return run.id;
}

/** 用于统计指定知识库下的文档数量。 */
async function countDocuments(knowledgeBaseId: string): Promise<number> {
  const rows = await database
    .selectFrom('documents')
    .select('id')
    .where('knowledge_base_id', '=', knowledgeBaseId)
    .where('owner_id', '=', LOCAL_USER_ID)
    .execute();
  return rows.length;
}

beforeAll(async () => {
  await prepareDatabase();
  createServices();
});

afterAll(cleanDatabase);

describe('doc-create 幂等', () => {
  test('同一运行与节点重复调用只创建一个文档', async () => {
    const knowledgeBaseId = await createKnowledgeBase();
    const runId = await createRunningRun(knowledgeBaseId);
    const input = {
      knowledgeBaseId,
      nodeId: 'doc',
      ownerId: LOCAL_USER_ID,
      plainText: '正文',
      title: '自动文档',
      workflowRunId: runId,
    };
    const first = await effectsService.createDocument(input);
    const second = await effectsService.createDocument(input);
    expect(second.documentId).toBe(first.documentId);
    expect(await countDocuments(knowledgeBaseId)).toBe(1);
  });
});

describe('断点续跑', () => {
  test('中断后重放整个图只建一次文档并到达 succeeded', async () => {
    const knowledgeBaseId = await createKnowledgeBase();
    const runId = await createRunningRun(knowledgeBaseId);
    // 模拟崩溃前已建文档并写入部分成功事件，运行停留在 running。
    await effectsService.createDocument({
      knowledgeBaseId,
      nodeId: 'doc',
      ownerId: LOCAL_USER_ID,
      plainText: '上游输出',
      title: '自动文档',
      workflowRunId: runId,
    });
    await withWorkflowTables(database)
      .insertInto('workflow_run_events')
      .values([
        { id: randomUUID(), node_id: 'a', run_id: runId, seq: 1, status: 'succeeded' },
        { id: randomUUID(), node_id: 'doc', run_id: runId, seq: 2, status: 'succeeded' },
      ])
      .execute();
    // 重放 doc.create 节点：与恢复后 executor 重新执行该节点的调用形态一致。
    const replay = await effectsService.createDocument({
      knowledgeBaseId,
      nodeId: 'doc',
      ownerId: LOCAL_USER_ID,
      plainText: '上游输出',
      title: '自动文档',
      workflowRunId: runId,
    });
    await withWorkflowTables(database)
      .insertInto('workflow_run_events')
      .values({ id: randomUUID(), node_id: 'end', run_id: runId, seq: 3, status: 'succeeded' })
      .executeTakeFirstOrThrow();
    await runsService.completeRun(runId, {
      outputSummary: `doc: ${replay.documentId}`,
      status: 'succeeded',
    });
    const detail = await runsService.readRun(runId);
    expect(detail.status).toBe('succeeded');
    expect(detail.events.map((event) => event.nodeId)).toEqual(['a', 'doc', 'end']);
    expect(await countDocuments(knowledgeBaseId)).toBe(1);
  });
});

describe('重启补偿扫描', () => {
  test('running 运行被复位为 pending 并可再次领取到终态', async () => {
    const knowledgeBaseId = await createKnowledgeBase();
    const runId = await createRunningRun(knowledgeBaseId);
    const recovered = await runsService.recoverInterruptedRuns();
    expect(recovered.recoveredRunIds).toContain(runId);
    const reclaimed = await runsService.claimPendingRuns(3);
    expect(reclaimed.map((item) => item.runId)).toContain(runId);
    await runsService.completeRun(runId, { status: 'succeeded' });
    const detail = await runsService.readRun(runId);
    expect(detail.status).toBe('succeeded');
  });
});
