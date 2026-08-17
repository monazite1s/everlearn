/** @fileoverview 实现限定所有者的文档树读取、创建与按版本重命名。 */

import { randomUUID } from 'node:crypto';

import type { DocumentDetail, DocumentListResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely, RawBuilder, Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { CreateDocumentDto } from './create-document.dto';
import {
  childCountSubquery,
  readActiveDocumentDetail,
  toDocumentTreeItem,
  type DocumentTreeRow,
} from './document-projection.query';
import {
  decodeDocumentCursor,
  encodeDocumentCursor,
  type DocumentCursorPayload,
} from './list-documents-query.dto';
import type { ListDocumentsQueryDto } from './list-documents-query.dto';
import type { RenameDocumentDto } from './rename-document.dto';

const DEFAULT_PAGE_LIMIT = 20;
/** ponytail: 1024 间隔为同父追加预留插入空间，间隔耗尽才需按父级再平衡（KB-07）。 */
const POSITION_GAP_SQL = '1024';
const MINIMAL_DOCUMENT_CONTENT: JsonValue = { content: [], type: 'doc' } as const;

/** 用于解析已通过全局 DTO 边界的文档游标。 */
function resolveCursor(cursor: string | undefined): DocumentCursorPayload | undefined {
  if (cursor === undefined) return;
  const payload = decodeDocumentCursor(cursor);
  if (payload === undefined) throw new TypeError('Validated document cursor is invalid');
  return payload;
}

/** 用于按父节点标识生成参数化过滤片段。 */
async function parentFilter(parentId: string | null): Promise<RawBuilder<unknown>> {
  const { sql } = await import('kysely');
  return parentId === null ? sql`IS NULL` : sql`= ${parentId}::uuid`;
}

/** 用于在服务端所有者边界内读写文档树。 */
@Injectable()
export class DocumentsService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于在单事务内校验父级并写入文档、最小正文和初始修订。 */
  async create(knowledgeBaseId: string, input: CreateDocumentDto): Promise<DocumentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) =>
        this.createInTransaction(transaction, ownerId, knowledgeBaseId, input),
      );
  }

  /** 用于按服务端稳定顺序列出活跃知识库内的直接子节点。 */
  async list(knowledgeBaseId: string, query: ListDocumentsQueryDto): Promise<DocumentListResponse> {
    const { ownerId } = this.identityContext.getActor();
    await this.validateListScope(ownerId, knowledgeBaseId, query.parentId);
    const { sql } = await import('kysely');
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const parentId = query.parentId ?? null;
    const cursor = resolveCursor(query.cursor);
    const cursorPredicate =
      cursor === undefined
        ? sql``
        : sql`AND (d.position > ${cursor.position}::bigint
            OR (d.position = ${cursor.position}::bigint AND d.id > ${cursor.id}::uuid))`;
    const result = await sql<DocumentTreeRow & { position: string }>`
      SELECT d.id, d.title, d.version, d.position::text AS "position",
        to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
        ${childCountSubquery(sql, ownerId)} AS "childCount"
      FROM documents d
      JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
      WHERE d.owner_id = ${ownerId}::uuid AND d.knowledge_base_id = ${knowledgeBaseId}::uuid
        AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
        AND d.parent_id ${await parentFilter(parentId)}
        ${cursorPredicate}
      ORDER BY d.position ASC, d.id ASC
      LIMIT ${limit + 1}
    `.execute(this.databaseService.client);
    const pageRows = result.rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    const nextCursor =
      result.rows.length <= limit || lastRow === undefined
        ? null
        : encodeDocumentCursor({ id: lastRow.id, position: lastRow.position, v: 1 });
    return { items: pageRows.map(toDocumentTreeItem), nextCursor };
  }

  /** 用于读取有效文档详情并统一隐藏缺失、他人和已删除记录。 */
  async read(id: string): Promise<DocumentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return readActiveDocumentDetail(this.databaseService.client, id, ownerId);
  }

  /** 用于仅在提交版本与当前版本一致时更新标题且不产生正文修订。 */
  async rename(id: string, input: RenameDocumentDto): Promise<DocumentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) => this.renameInTransaction(transaction, ownerId, id, input));
  }

  /** 用于提交前锁定文档行并回写路径、位置与初始修订。 */
  private async createInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    knowledgeBaseId: string,
    input: CreateDocumentDto,
  ): Promise<DocumentDetail> {
    await this.lockActiveKnowledgeBase(transaction, ownerId, knowledgeBaseId);
    const parentId = input.parentId ?? null;
    const parentPath =
      parentId === null
        ? ''
        : await this.lockActiveParentPath(transaction, ownerId, knowledgeBaseId, parentId);
    const documentId = randomUUID();
    const position = await this.readNextPosition(transaction, ownerId, knowledgeBaseId, parentId);
    await transaction
      .insertInto('documents')
      .values({
        id: documentId,
        owner_id: ownerId,
        knowledge_base_id: knowledgeBaseId,
        parent_id: parentId,
        path: `${parentPath}/${documentId}`,
        position,
        title: input.title,
      })
      .executeTakeFirstOrThrow();
    await transaction
      .insertInto('document_revisions')
      .values({
        id: randomUUID(),
        owner_id: ownerId,
        document_id: documentId,
        revision_number: 1,
        source: 'manual',
        content_json: MINIMAL_DOCUMENT_CONTENT,
        schema_version: 1,
        plain_text: '',
        created_by: ownerId,
      })
      .executeTakeFirstOrThrow();
    return readActiveDocumentDetail(transaction, documentId, ownerId);
  }

  /** 用于在调用方仍持有当前版本时更新标题并递增版本。 */
  private async renameInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
    input: RenameDocumentDto,
  ): Promise<DocumentDetail> {
    const document = await transaction
      .selectFrom('documents')
      .select(['id', 'version', 'knowledge_base_id', 'deleted_at'])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .forUpdate()
      .executeTakeFirst();
    if (document === undefined) throw new NotFoundException();
    if (document.deleted_at !== null) throw new NotFoundException();
    await this.requireActiveKnowledgeBase(transaction, ownerId, document.knowledge_base_id);
    if (document.version !== input.version) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
    const { sql } = await import('kysely');
    await transaction
      .updateTable('documents')
      .set({
        title: input.title,
        updated_at: sql`transaction_timestamp()`,
        version: sql`version + 1`,
      })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirstOrThrow();
    return readActiveDocumentDetail(transaction, id, ownerId);
  }

  /** 用于串行化同知识库内创建并拒绝缺失、他人或已删除知识库。 */
  private async lockActiveKnowledgeBase(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    knowledgeBaseId: string,
  ): Promise<void> {
    const knowledgeBase = await transaction
      .selectFrom('knowledge_bases')
      .select(['id'])
      .where('id', '=', knowledgeBaseId)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (knowledgeBase === undefined) throw new NotFoundException();
  }

  /** 用于锁定父级行并读取其物化路径，父级无效时回滚。 */
  private async lockActiveParentPath(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    knowledgeBaseId: string,
    parentId: string,
  ): Promise<string> {
    const parent = await transaction
      .selectFrom('documents')
      .select(['path'])
      .where('id', '=', parentId)
      .where('owner_id', '=', ownerId)
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (parent === undefined) throw new NotFoundException();
    return parent.path;
  }

  /** 用于计算同父（含软删除兄弟）末尾留有间隔的下一排序值。 */
  private async readNextPosition(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    knowledgeBaseId: string,
    parentId: string | null,
  ): Promise<string> {
    const { sql } = await import('kysely');
    const result = await sql<{ nextPosition: string }>`
      SELECT (coalesce(max(d.position), -${POSITION_GAP_SQL}::bigint)
        + ${POSITION_GAP_SQL}::bigint)::text AS "nextPosition"
      FROM documents d
      WHERE d.knowledge_base_id = ${knowledgeBaseId}::uuid
        AND d.owner_id = ${ownerId}::uuid
        AND d.parent_id ${await parentFilter(parentId)}
    `.execute(transaction);
    const position = result.rows[0]?.nextPosition;
    if (position === undefined) throw new Error('Position allocation returned no row');
    return position;
  }

  /** 用于拒绝读取或变更已删除知识库下的文档。 */
  private async requireActiveKnowledgeBase(
    executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
    ownerId: string,
    knowledgeBaseId: string,
  ): Promise<void> {
    const knowledgeBase = await executor
      .selectFrom('knowledge_bases')
      .select(['id'])
      .where('id', '=', knowledgeBaseId)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (knowledgeBase === undefined) throw new NotFoundException();
  }

  /** 用于在列出前校验知识库与可选父节点均有效且同库。 */
  private async validateListScope(
    ownerId: string,
    knowledgeBaseId: string,
    parentId: string | undefined,
  ): Promise<void> {
    await this.requireActiveKnowledgeBase(this.databaseService.client, ownerId, knowledgeBaseId);
    if (parentId === undefined) return;
    const parent = await this.databaseService.client
      .selectFrom('documents')
      .select(['id'])
      .where('id', '=', parentId)
      .where('owner_id', '=', ownerId)
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (parent === undefined) throw new NotFoundException();
  }
}
