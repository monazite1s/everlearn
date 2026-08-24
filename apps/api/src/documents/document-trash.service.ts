/** @fileoverview 实现文档子树软删除与带幂等键的完整子树恢复。 */

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { appendDocumentSearchEvent } from '../outbox/outbox-event.writer';
import {
  createRestoreHash,
  lockRestoreIdempotencyKey,
  readRestoreIdempotentResponse,
  storeRestoreIdempotentResponse,
  type RestoreContext,
} from './document-trash.idempotency';
import { readActiveDocumentDetail } from './document-projection.query';
import type { DocumentVersionDto } from './document-version.dto';

const POSITION_GAP_SQL = '1024';

interface LockedDocument {
  id: string;
  knowledge_base_id: string;
  parent_id: string | null;
  path: string;
  version: number;
  deleted_at: Date | null;
}

interface LockedScope {
  knowledgeBaseId: string;
  kbDeletedAt: Date | null;
}

interface RestoreTarget {
  readonly newPath?: string;
  readonly position?: string;
  readonly toRoot: boolean;
}

interface ChangedDocument {
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly version: number;
}

/** 用于为本次实际改变的每个子树节点原子追加生命周期事件。 */
async function appendLifecycleEvents(
  transaction: Transaction<DatabaseSchema>,
  ownerId: string,
  eventType: 'document.deleted' | 'document.restored',
  documents: readonly ChangedDocument[],
): Promise<void> {
  for (const document of documents) {
    await appendDocumentSearchEvent(transaction, ownerId, eventType, {
      documentId: document.id,
      documentVersion: document.version,
      eventSchemaVersion: 1,
      knowledgeBaseId: document.knowledgeBaseId,
    });
  }
}

/** 用于在所有者边界内原子执行文档子树删除与恢复。 */
@Injectable()
export class DocumentTrashService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于软删除整个子树并让精确重试保持无副作用。 */
  async remove(id: string, input: DocumentVersionDto): Promise<void> {
    const { ownerId } = this.identityContext.getActor();
    await this.databaseService.client
      .transaction()
      .execute((transaction) => this.removeInTransaction(transaction, ownerId, id, input.version));
  }

  /** 用于按所有者范围幂等键只恢复一次完整子树。 */
  async restore(
    id: string,
    input: DocumentVersionDto,
    idempotencyKey: string,
  ): Promise<DocumentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client.transaction().execute((transaction) =>
      this.restoreInTransaction(transaction, {
        id,
        idempotencyKey,
        ownerId,
        version: input.version,
      }),
    );
  }

  /** 用于在单事务内完成重放检查、知识库前置校验与子树删除。 */
  private async removeInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
    requestedVersion: number,
  ): Promise<void> {
    const scope = await this.lockScope(transaction, ownerId, id);
    if (scope === undefined) throw new NotFoundException();
    if (scope.kbDeletedAt !== null) throw new NotFoundException();
    const document = await this.lockDocument(transaction, ownerId, id);
    if (document === undefined) throw new NotFoundException();
    if (document.deleted_at !== null) {
      return this.acceptDeleteReplay(document.version, requestedVersion);
    }
    this.requireVersion(document.version, requestedVersion);
    const changed = await this.markSubtreeDeleted(transaction, ownerId, document);
    await appendLifecycleEvents(transaction, ownerId, 'document.deleted', changed);
  }

  /** 用于在单事务内完成重放检查、落位和子树恢复响应保存。 */
  private async restoreInTransaction(
    transaction: Transaction<DatabaseSchema>,
    context: RestoreContext,
  ): Promise<DocumentDetail> {
    const requestHash = createRestoreHash(context);
    await lockRestoreIdempotencyKey(transaction, context);
    const replay = await readRestoreIdempotentResponse(transaction, context, requestHash);
    if (replay !== undefined) return replay;
    const scope = await this.lockScope(transaction, context.ownerId, context.id);
    if (scope === undefined) throw new NotFoundException();
    if (scope.kbDeletedAt !== null) {
      throw new ApiConflictException('KNOWLEDGE_BASE_DELETED');
    }
    const document = await this.lockDocument(transaction, context.ownerId, context.id);
    if (document === undefined) throw new NotFoundException();
    if (document.deleted_at === null) throw new ConflictException();
    this.requireVersion(document.version, context.version);
    const detail = await this.applyRestore(transaction, context.ownerId, document);
    await storeRestoreIdempotentResponse(transaction, context, requestHash, detail);
    return detail;
  }

  /** 用于锁定知识库行并读取其删除状态以串行化并发变更。 */
  private async lockScope(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
  ): Promise<LockedScope | undefined> {
    const { sql } = await import('kysely');
    const scope = await sql<LockedScope>`
      SELECT d.knowledge_base_id AS "knowledgeBaseId", kb.deleted_at AS "kbDeletedAt"
      FROM documents d
      JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
      WHERE d.id = ${id}::uuid AND d.owner_id = ${ownerId}::uuid
      FOR UPDATE OF kb
    `.execute(transaction);
    return scope.rows[0];
  }

  /** 用于锁定目标文档行以读取受锁保护的删除状态与版本。 */
  private async lockDocument(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
  ): Promise<LockedDocument | undefined> {
    return transaction
      .selectFrom('documents')
      .select(['id', 'knowledge_base_id', 'parent_id', 'path', 'version', 'deleted_at'])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .forUpdate()
      .executeTakeFirst();
  }

  /** 用于在同一事务内标记子树删除并保留原父级与位置。 */
  private async markSubtreeDeleted(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    root: LockedDocument,
  ): Promise<readonly ChangedDocument[]> {
    const { sql } = await import('kysely');
    const result = await sql<ChangedDocument>`
      UPDATE documents d
      SET deleted_at = transaction_timestamp(),
        deleted_parent_id = d.parent_id,
        deleted_position = d.position,
        updated_at = transaction_timestamp(),
        version = d.version + 1
      WHERE d.owner_id = ${ownerId}::uuid
        AND d.knowledge_base_id = ${root.knowledge_base_id}::uuid
        AND (d.id = ${root.id}::uuid OR d.path LIKE ${`${root.path}/%`})
        AND d.deleted_at IS NULL
      RETURNING d.id, d.knowledge_base_id AS "knowledgeBaseId", d.version
    `.execute(transaction);
    return result.rows;
  }

  /** 用于清空删除标记并在原父级缺失时把子树恢复到知识库根部。 */
  private async applyRestore(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    root: LockedDocument,
  ): Promise<DocumentDetail> {
    const { sql } = await import('kysely');
    const target = await this.resolveRestoreTarget(transaction, ownerId, root);
    const restoredRoot = await transaction
      .updateTable('documents')
      .set({
        deleted_at: null,
        deleted_parent_id: null,
        deleted_position: null,
        updated_at: sql`transaction_timestamp()`,
        version: sql`version + 1`,
        ...(target.toRoot
          ? { parent_id: null, path: target.newPath, position: target.position }
          : {}),
      })
      .where('id', '=', root.id)
      .where('owner_id', '=', ownerId)
      .returning(['id', 'knowledge_base_id', 'version'])
      .executeTakeFirstOrThrow();
    const descendants = await this.clearDeletedDescendants(transaction, ownerId, root, target);
    await appendLifecycleEvents(transaction, ownerId, 'document.restored', [
      {
        id: restoredRoot.id,
        knowledgeBaseId: restoredRoot.knowledge_base_id,
        version: restoredRoot.version,
      },
      ...descendants,
    ]);
    return readActiveDocumentDetail(transaction, root.id, ownerId);
  }

  /** 用于判定原父级是否仍活跃并计算根部恢复的路径与位置。 */
  private async resolveRestoreTarget(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    root: LockedDocument,
  ): Promise<RestoreTarget> {
    if (root.parent_id === null) return { toRoot: false };
    const parent = await transaction
      .selectFrom('documents')
      .select(['id'])
      .where('id', '=', root.parent_id)
      .where('owner_id', '=', ownerId)
      .where('knowledge_base_id', '=', root.knowledge_base_id)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (parent !== undefined) return { toRoot: false };
    const position = await this.readNextRootPosition(transaction, ownerId, root.knowledge_base_id);
    return { newPath: `/${root.id}`, position, toRoot: true };
  }

  /** 用于按含软删除兄弟的末尾间隔计算根部追加位置（KB-06 范式）。 */
  private async readNextRootPosition(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    knowledgeBaseId: string,
  ): Promise<string> {
    const { sql } = await import('kysely');
    const result = await sql<{ nextPosition: string }>`
      SELECT (coalesce(max(d.position), -${POSITION_GAP_SQL}::bigint)
        + ${POSITION_GAP_SQL}::bigint)::text AS "nextPosition"
      FROM documents d
      WHERE d.knowledge_base_id = ${knowledgeBaseId}::uuid
        AND d.owner_id = ${ownerId}::uuid
        AND d.parent_id IS NULL
    `.execute(transaction);
    const position = result.rows[0]?.nextPosition;
    if (position === undefined) throw new Error('Position allocation returned no row');
    return position;
  }

  /** 用于恢复子树内全部已删除后代并按需整体重写物化路径。 */
  private async clearDeletedDescendants(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    root: LockedDocument,
    target: RestoreTarget,
  ): Promise<readonly ChangedDocument[]> {
    const { sql } = await import('kysely');
    const pathSet =
      target.toRoot && target.newPath !== undefined
        ? sql`path = ${target.newPath}::text
            || substring(d.path from char_length(${root.path}::text) + 1),`
        : sql``;
    const result = await sql<ChangedDocument>`
      UPDATE documents d
      SET ${pathSet} deleted_at = NULL, deleted_parent_id = NULL, deleted_position = NULL,
        updated_at = transaction_timestamp(), version = d.version + 1
      WHERE d.owner_id = ${ownerId}::uuid
        AND d.knowledge_base_id = ${root.knowledge_base_id}::uuid
        AND d.path LIKE ${`${root.path}/%`}
        AND d.deleted_at IS NOT NULL
      RETURNING d.id, d.knowledge_base_id AS "knowledgeBaseId", d.version
    `.execute(transaction);
    return result.rows;
  }

  /** 用于只接受成功删除产生的精确重放关系。 */
  private acceptDeleteReplay(currentVersion: number, requestedVersion: number): void {
    if (currentVersion !== requestedVersion + 1) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
  }

  /** 用于以稳定公开冲突类型拒绝过期写入。 */
  private requireVersion(currentVersion: number, requestedVersion: number): void {
    if (currentVersion !== requestedVersion) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
  }
}
