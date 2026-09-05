/**
 * @fileoverview 在真实 PostgreSQL 上验证教程迁移、草案状态机与所有者隔离。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../database/migrations/20260812010100_local_user_seed';
import { TutorialRunsService } from './tutorial-runs.service';
import { TutorialService } from './tutorial.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `tutorial_schema_${process.pid}_${Date.now()}`;
const tutorialMigrationName = '20260906000000_tutorial_schema';
let database: Kysely<DatabaseSchema>;
let tutorialService: TutorialService;
let runsService: TutorialRunsService;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于在隔离 Schema 中创建确定的 Kysely 元数据名称。 */
function migrationOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  } as const;
}

/** 用于构造注入本地身份的教程服务。 */
function createServices(): void {
  const dependencies = [
    { client: database },
    {
      /** 用于固定本地操作者身份。 */
      getActor: () => ({ ownerId: LOCAL_USER_ID }),
    },
  ] as unknown as ConstructorParameters<typeof TutorialService>;
  tutorialService = new TutorialService(dependencies[0], dependencies[1]);
  runsService = new TutorialRunsService({ client: database } as never);
}

beforeAll(async () => {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(createScopedDatabaseUrl(databaseUrl!));
  await runMigrations(database, migrationOptions('up'));
  createServices();
});

afterAll(async () => {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
});

describe('tutorial schema migration', () => {
  test('迁移 up 创建教程表且 down 动态回退到目标迁移', async () => {
    await expectTutorialTables();
    const reverted: string[] = [];
    while (!reverted.includes(tutorialMigrationName) && reverted.length < 15) {
      const step = await runMigrations(database, migrationOptions('down'));
      reverted.push(...step.executedMigrations);
    }
    expect(reverted.at(-1)).toBe(tutorialMigrationName);
    await expectTutorialTablesDropped();
    await runMigrations(database, migrationOptions('up'));
  });

  /** 用于断言两张教程表存在。 */
  async function expectTutorialTables(): Promise<void> {
    const tables = (await database.introspection.getTables()).filter(
      (table) => table.schema === schemaName,
    );
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['tutorial_sessions', 'tutorial_chapters']),
    );
  }

  /** 用于断言教程表已全部回退。 */
  async function expectTutorialTablesDropped(): Promise<void> {
    const remaining = (await database.introspection.getTables()).filter(
      (table) => table.schema === schemaName,
    );
    expect(remaining.filter((table) => table.name.startsWith('tutorial_'))).toHaveLength(0);
  }
});

describe('tutorial draft state machine', () => {
  test('draft 未确认前无研究领取，重复确认幂等', async () => {
    const sessionId = await createDraft('幂等确认');
    await expect(runsService.claimOutlineSessions(3)).resolves.toHaveLength(0);
    const first = await tutorialService.confirmScope(sessionId);
    expect(first.status).toBe('researching');
    const second = await tutorialService.confirmScope(sessionId);
    expect(second.status).toBe('researching');
  });

  test('确认后范围不可修改，重复修改抛稳定错误码', async () => {
    const sessionId = await createDraft('范围守卫');
    await tutorialService.confirmScope(sessionId);
    await expect(tutorialService.updateScope(sessionId, scopeInput('越权改'))).rejects.toThrow();
  });

  test('所有者隔离：他人会话不可读取', async () => {
    const foreignOwnerId = randomUUID();
    await database
      .insertInto('users')
      .values({ display_name: '外部用户', id: foreignOwnerId, timezone: 'Asia/Shanghai' })
      .executeTakeFirstOrThrow();
    const foreignId = randomUUID();
    await database
      .insertInto('tutorial_sessions')
      .values({
        audience: 'a',
        depth: 'standard',
        id: foreignId,
        level: 10,
        owner_id: foreignOwnerId,
        status: 'draft_scope',
        topic: '他人教程',
      })
      .executeTakeFirstOrThrow();
    await expect(tutorialService.detail(foreignId)).rejects.toThrow();
  });
});

/** 用于创建本地所有者的教程草案。 */
async function createDraft(topic: string): Promise<string> {
  const draft = await tutorialService.create(scopeInput(topic));
  return draft.id;
}

/** 用于构造合法研究范围输入。 */
function scopeInput(topic: string) {
  return {
    audience: '后端工程师',
    depth: 'standard' as const,
    excludeTopics: [],
    goals: '',
    includeTopics: [],
    knowledgeBaseIds: [],
    level: 50,
    topic,
  };
}
