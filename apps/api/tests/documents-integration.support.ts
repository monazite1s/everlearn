/** @fileoverview 提供文档 HTTP 集成测试共享的隔离 Schema 应用夹具。 */
import type { Server } from 'node:http';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Insertable, Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { createDatabaseClient } from '../src/database/database.service';
import type {
  DatabaseSchema,
  DocumentTable,
  KnowledgeBaseTable,
} from '../src/database/database.types';
import { runMigrations } from '../src/database/migration-runner';
import { REQUEST_ID_HEADER } from '../src/http-boundary/request-correlation.middleware';
import { LOCAL_USER_ID } from '../src/identity/local-identity.constants';
import { expect } from 'vitest';

export interface KnowledgeBaseFixture {
  readonly deletedAt?: Date | null;
  readonly id: string;
  readonly name: string;
  readonly ownerId?: string;
}

export interface DocumentFixture {
  readonly childOf?: string;
  readonly deleted?: boolean;
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly ownerId?: string;
  readonly position: number;
  readonly title?: string;
}

/** 用于让共享夹具与本地用户之外的所有者隔离。 */
export const otherUserId = '10000000-0000-4000-8000-000000000001';

/** 用于断言文档详情投影的字段全集。 */
export const documentDetailKeys = [
  'childCount',
  'id',
  'knowledgeBaseId',
  'parentId',
  'title',
  'updatedAt',
  'version',
];

/** 用于承载文档集成测试的隔离应用与数据库状态。 */
export class DocumentsTestEnvironment {
  private application: INestApplication | undefined;
  private database: Kysely<DatabaseSchema> | undefined;

  /** 用于记录隔离 Schema 名与基础连接串。 */
  constructor(
    private readonly schemaName: string,
    private readonly databaseUrl: string,
  ) {}

  /** 用于返回夹具数据库客户端并在未初始化时快速失败。 */
  getDatabase(): Kysely<DatabaseSchema> {
    if (this.database === undefined) throw new Error('Test database is not initialized');
    return this.database;
  }

  /** 用于返回 Supertest 可接收的已初始化 HTTP 适配器服务。 */
  getHttpServer(): Server {
    if (this.application === undefined) throw new Error('Test application is not initialized');
    return this.application.getHttpServer() as Server;
  }

  /** 用于创建已迁移隔离 Schema 并启动生产 Nest 应用。 */
  async prepareApplication(): Promise<void> {
    const adminDatabase = await createDatabaseClient(this.databaseUrl);
    await adminDatabase.schema.createSchema(this.schemaName).execute();
    await adminDatabase.destroy();
    const scopedUrl = this.createScopedDatabaseUrl();
    this.database = await createDatabaseClient(scopedUrl);
    await runMigrations(this.database, {
      direction: 'up',
      migrationLockTableName: 'migration_lock',
      migrationTableName: 'migration_history',
      migrationTableSchema: this.schemaName,
    });
    this.applyFixtureEnvironment(scopedUrl);
    const { AppModule } = await import('../src/app.module');
    this.application = await NestFactory.create(AppModule, { logger: false });
    this.application.setGlobalPrefix('api/v1');
    await this.application.init();
  }

  /** 用于关闭自有连接池并删除隔离测试关系。 */
  async releaseApplication(): Promise<void> {
    await this.application?.close();
    await this.database?.destroy();
    const adminDatabase = await createDatabaseClient(this.databaseUrl);
    await adminDatabase.schema.dropSchema(this.schemaName).cascade().execute();
    await adminDatabase.destroy();
  }

  /** 用于删除可变夹具并保留生产本地用户种子。 */
  async resetFixtures(): Promise<void> {
    await this.getDatabase().deleteFrom('documents').execute();
    await this.getDatabase().deleteFrom('knowledge_bases').execute();
    await this.getDatabase().deleteFrom('users').where('id', '!=', LOCAL_USER_ID).execute();
  }

  /** 用于写入验证所有权过滤的其他用户。 */
  async insertOtherUser(): Promise<void> {
    await this.getDatabase()
      .insertInto('users')
      .values({ id: otherUserId, display_name: '其他用户', timezone: 'Asia/Shanghai' })
      .execute();
  }

  /** 用于写入验证所有权与生命周期过滤的知识库记录。 */
  async insertKnowledgeBases(fixtures: readonly KnowledgeBaseFixture[]): Promise<void> {
    const rows: Insertable<KnowledgeBaseTable>[] = fixtures.map((fixture) => ({
      id: fixture.id,
      owner_id: fixture.ownerId ?? LOCAL_USER_ID,
      name: fixture.name,
      description: '',
      kind: 'normal',
      deleted_at: fixture.deletedAt ?? null,
    }));
    await this.getDatabase().insertInto('knowledge_bases').values(rows).execute();
  }

  /** 用于写入根或子文档夹具并保持物化路径约束。 */
  async insertDocuments(fixtures: readonly DocumentFixture[]): Promise<void> {
    const rows: Insertable<DocumentTable>[] = fixtures.map((fixture) => ({
      id: fixture.id,
      owner_id: fixture.ownerId ?? LOCAL_USER_ID,
      knowledge_base_id: fixture.knowledgeBaseId,
      parent_id: fixture.childOf ?? null,
      path: fixture.childOf === undefined ? `/${fixture.id}` : `/${fixture.childOf}/${fixture.id}`,
      position: fixture.position,
      title: fixture.title ?? `文档 ${fixture.id}`,
      deleted_at: fixture.deleted === true ? new Date('2026-08-13T00:00:00Z') : null,
      deleted_parent_id: null,
      deleted_position: fixture.deleted === true ? fixture.position : null,
    }));
    await this.getDatabase().insertInto('documents').values(rows).execute();
  }

  /** 用于将 JSON 响应解析为当前断言所需投影。 */
  parseBody<ResponseBody>(response: { text: string }): ResponseBody {
    return JSON.parse(response.text) as ResponseBody;
  }

  /** 用于断言稳定且带请求关联的公开错误。 */
  expectApiError(
    response: { get(field: string): string | undefined; status: number; text: string },
    status: number,
    code: string,
    message: string,
  ): Record<string, unknown> {
    const body = this.parseBody<Record<string, unknown>>(response);
    expect(response.status).toBe(status);
    expect(body).toMatchObject({ code, message });
    expect(body.requestId).toBe(response.get(REQUEST_ID_HEADER));
    return body;
  }

  /** 用于设置连接级搜索路径且不读取或修改凭据。 */
  private createScopedDatabaseUrl(): string {
    const url = new URL(this.databaseUrl);
    url.searchParams.set('options', `-csearch_path=${this.schemaName}`);
    return url.toString();
  }

  /** 用于在导入 AppModule 前提供必要的非生产配置。 */
  private applyFixtureEnvironment(scopedDatabaseUrl: string): void {
    process.env.DATABASE_URL = scopedDatabaseUrl;
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.S3_ACCESS_KEY = 'integration-test-access';
    process.env.S3_BUCKET = 'integration-test';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.S3_FORCE_PATH_STYLE = 'true';
    process.env.S3_REGION = 'local';
    process.env.S3_SECRET_KEY = 'integration-test-secret';
  }
}
