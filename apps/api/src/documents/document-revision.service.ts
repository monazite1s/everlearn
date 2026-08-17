/** @fileoverview 实现限定所有者的不可变修订创建、列出、预览与恢复。 */

import { randomUUID } from 'node:crypto';

import type {
  DocumentContentDetail,
  DocumentRevisionDetail,
  DocumentRevisionListResponse,
} from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { CreateDocumentRevisionDto } from './create-document-revision.dto';
import { loadDocumentContentRules, validateDocumentContent } from './document-content.validator';
import {
  listRevisionRows,
  loadRevisionSources,
  readLatestRevision,
  readRevisionDetail,
  toDocumentRevisionDetail,
  toDocumentRevisionListItem,
} from './document-revision-projection.query';
import { readActiveDocumentContent } from './document-projection.query';
import type { ListRevisionsQueryDto, RevisionCursorPayload } from './list-revisions-query.dto';
import { decodeRevisionCursor, encodeRevisionCursor } from './list-revisions-query.dto';
import type { DocumentVersionDto } from './document-version.dto';

const DEFAULT_PAGE_LIMIT = 20;

interface LockedDocument {
  id: string;
  title: string;
  version: number;
}

/** 用于承载一次不可变修订写入所需的完整快照字段。 */
interface RevisionDraft {
  readonly contentJson: JsonValue;
  readonly plainText: string;
  readonly revisionNumber: number;
  readonly schemaVersion: number;
  readonly source: 'manual' | 'restore';
  readonly title: string;
}

/** 用于在所有者边界内只以 INSERT 与 SELECT 维护文档修订历史。 */
@Injectable()
export class DocumentRevisionService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于在显式触发点为当前内容创建修订且跳过相邻重复快照。 */
  async create(id: string, input: CreateDocumentRevisionDto): Promise<DocumentRevisionDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) => this.createInTransaction(transaction, ownerId, id, input));
  }

  /** 用于按修订号倒序返回有效文档的修订摘要分页。 */
  async list(id: string, query: ListRevisionsQueryDto): Promise<DocumentRevisionListResponse> {
    const { ownerId } = this.identityContext.getActor();
    await this.requireActiveDocument(ownerId, id);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = this.resolveCursor(query.cursor);
    const rows = await listRevisionRows(this.databaseService.client, {
      ...(cursor === undefined ? {} : { cursor }),
      id,
      limit,
      ownerId,
    });
    const pageRows = rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    const nextCursor =
      rows.length <= limit || lastRow === undefined
        ? null
        : encodeRevisionCursor({ revisionNumber: lastRow.revisionNumber, v: 1 });
    const sources = await loadRevisionSources();
    return {
      items: pageRows.map((row) => toDocumentRevisionListItem(row, sources)),
      nextCursor,
    };
  }

  /** 用于读取单个修订的全文快照作为恢复预览。 */
  async read(id: string, revisionNumber: number): Promise<DocumentRevisionDetail> {
    const { ownerId } = this.identityContext.getActor();
    return readRevisionDetail(this.databaseService.client, { id, ownerId, revisionNumber });
  }

  /** 用于在版本有效时以恢复修订形式回写历史快照且不删除任何历史。 */
  async restore(
    id: string,
    revisionNumber: number,
    input: DocumentVersionDto,
  ): Promise<DocumentContentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) =>
        this.restoreInTransaction(transaction, ownerId, { id, revisionNumber, ...input }),
      );
  }

  /** 用于先锁知识库行再锁文档行并拒绝不可探测目标。 */
  private async lockScope(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
  ): Promise<LockedDocument> {
    const { sql } = await import('kysely');
    const scope = await sql<{ knowledgeBaseId: string }>`
      SELECT d.knowledge_base_id AS "knowledgeBaseId"
      FROM documents d
      JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
      WHERE d.id = ${id}::uuid AND d.owner_id = ${ownerId}::uuid
        AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
      FOR UPDATE OF kb
    `.execute(transaction);
    if (scope.rows[0] === undefined) throw new NotFoundException();
    const document = await transaction
      .selectFrom('documents')
      .select(['id', 'title', 'version'])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (document === undefined) throw new NotFoundException();
    return { id: document.id, title: document.title, version: document.version };
  }

  /** 用于在锁内完成版本前置校验、正文校验、去重判断与修订插入。 */
  private async createInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
    input: CreateDocumentRevisionDto,
  ): Promise<DocumentRevisionDetail> {
    const document = await this.lockScope(transaction, ownerId, id);
    if (input.version > document.version) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
    const rules = await loadDocumentContentRules();
    if (input.schemaVersion !== rules.schemaVersion) {
      throw new UnprocessableEntityException();
    }
    const content = validateDocumentContent(input.contentJson, rules);
    if (content === undefined) {
      throw new UnprocessableEntityException();
    }
    const title = input.title ?? document.title;
    const latest = await readLatestRevision(transaction, {
      contentJson: content.contentJson,
      id,
      ownerId,
      title,
    });
    const sources = await loadRevisionSources();
    if (latest?.contentMatches) {
      return toDocumentRevisionDetail(latest, sources);
    }
    const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
    await this.insertRevision(transaction, ownerId, id, {
      contentJson: content.contentJson,
      plainText: content.plainText,
      revisionNumber,
      schemaVersion: input.schemaVersion,
      source: 'manual',
      title,
    });
    return readRevisionDetail(transaction, { id, ownerId, revisionNumber });
  }

  /** 用于在锁内校验目标修订与版本并单事务完成回写与恢复修订。 */
  private async restoreInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    target: { id: string; revisionNumber: number; version: number },
  ): Promise<DocumentContentDetail> {
    const document = await this.lockScope(transaction, ownerId, target.id);
    const revision = await readRevisionDetail(transaction, {
      id: target.id,
      ownerId,
      revisionNumber: target.revisionNumber,
    });
    if (document.version !== target.version) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
    await this.applyRestoredContent(transaction, ownerId, target.id, revision);
    const latest = await readLatestRevision(transaction, {
      contentJson: revision.contentJson,
      id: target.id,
      ownerId,
      title: revision.title,
    });
    if (!(latest?.contentMatches && latest.source === 'restore')) {
      await this.insertRevision(transaction, ownerId, target.id, {
        contentJson: revision.contentJson as JsonValue,
        plainText: revision.plainText,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        schemaVersion: revision.schemaVersion,
        source: 'restore',
        title: revision.title,
      });
    }
    return readActiveDocumentContent(transaction, target.id, ownerId);
  }

  /** 用于以恢复快照覆盖文档当前内容、纯文本、Schema 与标题并递增版本。 */
  private async applyRestoredContent(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
    revision: Pick<DocumentRevisionDetail, 'contentJson' | 'plainText' | 'schemaVersion' | 'title'>,
  ): Promise<void> {
    const { sql } = await import('kysely');
    await transaction
      .updateTable('documents')
      .set({
        content_json: revision.contentJson as JsonValue,
        plain_text: revision.plainText,
        schema_version: revision.schemaVersion,
        title: revision.title,
        updated_at: sql`transaction_timestamp()`,
        version: sql`version + 1`,
      })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirstOrThrow();
  }

  /** 用于在调用方事务内追加一条不可变修订记录。 */
  private async insertRevision(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    documentId: string,
    draft: RevisionDraft,
  ): Promise<void> {
    await transaction
      .insertInto('document_revisions')
      .values({
        id: randomUUID(),
        owner_id: ownerId,
        document_id: documentId,
        revision_number: draft.revisionNumber,
        source: draft.source,
        title: draft.title,
        content_json: draft.contentJson,
        schema_version: draft.schemaVersion,
        plain_text: draft.plainText,
        created_by: ownerId,
      })
      .executeTakeFirstOrThrow();
  }

  /** 用于在列出前确认目标文档有效且不泄露缺失、他人或已删除记录。 */
  private async requireActiveDocument(ownerId: string, id: string): Promise<void> {
    const document = await this.databaseService.client
      .selectFrom('documents')
      .innerJoin('knowledge_bases', 'knowledge_bases.id', 'documents.knowledge_base_id')
      .select(['documents.id'])
      .where('documents.id', '=', id)
      .where('documents.owner_id', '=', ownerId)
      .where('documents.deleted_at', 'is', null)
      .where('knowledge_bases.deleted_at', 'is', null)
      .executeTakeFirst();
    if (document === undefined) throw new NotFoundException();
  }

  /** 用于解析已通过全局 DTO 边界的修订游标。 */
  private resolveCursor(cursor: string | undefined): RevisionCursorPayload | undefined {
    if (cursor === undefined) return undefined;
    const payload = decodeRevisionCursor(cursor);
    if (payload === undefined) throw new TypeError('Validated revision cursor is invalid');
    return payload;
  }
}
