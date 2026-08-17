/** @fileoverview 实现限定所有者的原子文档树移动与事务编排。 */

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import {
  computePlacement,
  isSelfOrDescendantTarget,
  SIBLING_POSITION_GAP,
  type MoveAnchor,
  type MovePlacement,
  type SiblingPosition,
} from './document-move.rules';
import {
  createMoveHash,
  lockMoveIdempotencyKey,
  readMoveIdempotentResponse,
  storeMoveIdempotentResponse,
  type MoveContext,
} from './document-move.idempotency';
import { readActiveDocumentDetail } from './document-projection.query';
import type { MoveDocumentDto } from './move-document.dto';

interface ScopedDocument {
  id: string;
  knowledge_base_id: string;
  parent_id: string | null;
  path: string;
  version: number;
}

interface TargetParent {
  parentId: string | null;
  path: string;
}

interface AnchoredSiblings {
  anchor: MoveAnchor;
  siblings: readonly SiblingPosition[];
}

interface MovedRowUpdate {
  newPath: string;
  parentId: string | null;
  position: string;
}

/** 用于构造带安全字段标记的公开校验失败异常。 */
function invalidMoveField(field: string, rule: string): BadRequestException {
  return new BadRequestException({ fields: [{ field, rules: [rule] }], kind: 'validation' });
}

/** 用于在所有者边界内以幂等键原子执行一次树移动。 */
@Injectable()
export class DocumentMoveService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于提交前解析操作者并让全部变更共享单一事务。 */
  async move(id: string, input: MoveDocumentDto, idempotencyKey: string): Promise<DocumentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) =>
        this.moveInTransaction(transaction, { id, idempotencyKey, input, ownerId }),
      );
  }

  /** 用于在单事务内完成重放检查、树校验、原子落位和响应保存。 */
  private async moveInTransaction(
    transaction: Transaction<DatabaseSchema>,
    context: MoveContext,
  ): Promise<DocumentDetail> {
    const requestHash = createMoveHash(context);
    await lockMoveIdempotencyKey(transaction, context);
    const replay = await readMoveIdempotentResponse(transaction, context, requestHash);
    if (replay !== undefined) return replay;
    const moved = await this.lockScope(transaction, context.ownerId, context.id);
    const detail = await this.applyMove(transaction, context.ownerId, moved, context.input);
    await storeMoveIdempotentResponse(transaction, context, requestHash, detail);
    return detail;
  }

  /** 用于先锁知识库行再锁移动文档行并拒绝不可探测目标。 */
  private async lockScope(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
  ): Promise<ScopedDocument> {
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
      .select(['id', 'knowledge_base_id', 'parent_id', 'path', 'version'])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (document === undefined) throw new NotFoundException();
    return document;
  }

  /** 用于校验版本与目标后在锁内更新父级、位置、版本和后代路径。 */
  private async applyMove(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    moved: ScopedDocument,
    input: MoveDocumentDto,
  ): Promise<DocumentDetail> {
    if (moved.version !== input.version) throw new ApiConflictException('VERSION_CONFLICT');
    const target = await this.resolveTargetParent(
      transaction,
      ownerId,
      moved,
      input.targetParentId,
    );
    const { anchor, siblings } = await this.readAnchoredSiblings(transaction, ownerId, {
      input,
      moved,
      target,
    });
    const maxPosition = await this.readMaxPosition(transaction, ownerId, moved, target);
    const placement = computePlacement(siblings, anchor, moved.id, maxPosition);
    const newPath = target.path === '' ? `/${moved.id}` : `${target.path}/${moved.id}`;
    const position =
      placement.kind === 'position'
        ? placement.position.toString()
        : placement.movedPosition.toString();
    await this.updateMovedRow(transaction, ownerId, moved.id, {
      newPath,
      parentId: target.parentId,
      position,
    });
    if (newPath !== moved.path) {
      await this.updateDescendantPaths(transaction, ownerId, moved, newPath);
    }
    if (placement.kind === 'rebalance') {
      await this.rebalanceSiblings(transaction, ownerId, moved.id, placement);
    }
    return readActiveDocumentDetail(transaction, moved.id, ownerId);
  }

  /** 用于解析相邻锚点并读取目标父级内排除移动节点的活跃兄弟。 */
  private async readAnchoredSiblings(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    scope: { input: MoveDocumentDto; moved: ScopedDocument; target: TargetParent },
  ): Promise<AnchoredSiblings> {
    const anchor = this.resolveAnchor(scope.input);
    const anchorId = anchor.kind === 'end' ? undefined : anchor.id;
    if (anchorId === scope.moved.id) {
      throw invalidMoveField(anchor.kind === 'before' ? 'beforeId' : 'afterId', 'notMovedDocument');
    }
    const siblings = await this.readActiveSiblings(transaction, ownerId, scope.moved, scope.target);
    if (anchorId !== undefined && !siblings.some((sibling) => sibling.id === anchorId)) {
      throw new NotFoundException();
    }
    return { anchor, siblings };
  }

  /** 用于锁定目标父行并拒绝跨库、自身与后代目标。 */
  private async resolveTargetParent(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    moved: ScopedDocument,
    targetParentId: string | undefined,
  ): Promise<TargetParent> {
    if (targetParentId === undefined) return { parentId: null, path: '' };
    const parent = await transaction
      .selectFrom('documents')
      .select(['id', 'path', 'knowledge_base_id'])
      .where('id', '=', targetParentId)
      .where('owner_id', '=', ownerId)
      .where('knowledge_base_id', '=', moved.knowledge_base_id)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (parent === undefined) {
      throw new NotFoundException();
    }
    if (isSelfOrDescendantTarget(moved.id, moved.path, parent.id, parent.path)) {
      throw invalidMoveField('targetParentId', 'notSelfOrDescendant');
    }
    return { parentId: parent.id, path: parent.path };
  }

  /** 用于把请求中的相邻定位字段解析为唯一锚点。 */
  private resolveAnchor(input: MoveDocumentDto): MoveAnchor {
    if (input.beforeId !== undefined) return { kind: 'before', id: input.beforeId };
    if (input.afterId !== undefined) return { kind: 'after', id: input.afterId };
    return { kind: 'end' };
  }

  /** 用于读取目标父级内排除移动节点的活跃兄弟排序。 */
  private async readActiveSiblings(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    moved: ScopedDocument,
    target: TargetParent,
  ): Promise<readonly SiblingPosition[]> {
    const query = transaction
      .selectFrom('documents')
      .select(['id', 'position'])
      .where('owner_id', '=', ownerId)
      .where('knowledge_base_id', '=', moved.knowledge_base_id)
      .where('deleted_at', 'is', null)
      .where('id', '!=', moved.id)
      .orderBy('position', 'asc')
      .orderBy('id', 'asc');
    const rows = await (
      target.parentId === null
        ? query.where('parent_id', 'is', null)
        : query.where('parent_id', '=', target.parentId)
    ).execute();
    return rows.map((row) => ({ id: row.id, position: BigInt(row.position) }));
  }

  /** 用于读取含软删除兄弟（排除移动节点）的末尾排序值。 */
  private async readMaxPosition(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    moved: ScopedDocument,
    target: TargetParent,
  ): Promise<bigint> {
    const { sql } = await import('kysely');
    const parentFilter = target.parentId === null ? sql`IS NULL` : sql`= ${target.parentId}::uuid`;
    const result = await sql<{ maxPosition: string | null }>`
      SELECT max(d.position)::text AS "maxPosition"
      FROM documents d
      WHERE d.knowledge_base_id = ${moved.knowledge_base_id}::uuid
        AND d.owner_id = ${ownerId}::uuid
        AND d.parent_id ${parentFilter}
        AND d.id <> ${moved.id}::uuid
    `.execute(transaction);
    const maxPosition = result.rows[0]?.maxPosition;
    return maxPosition === null || maxPosition === undefined
      ? -SIBLING_POSITION_GAP
      : BigInt(maxPosition);
  }

  /** 用于写入移动节点的父级、路径、位置、版本和更新时间。 */
  private async updateMovedRow(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
    update: MovedRowUpdate,
  ): Promise<void> {
    const { sql } = await import('kysely');
    await transaction
      .updateTable('documents')
      .set({
        parent_id: update.parentId,
        path: update.newPath,
        position: update.position,
        updated_at: sql`transaction_timestamp()`,
        version: sql`version + 1`,
      })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirstOrThrow();
  }

  /** 用于以一条前缀替换在事务内更新全部后代物化路径。 */
  private async updateDescendantPaths(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    moved: ScopedDocument,
    newPath: string,
  ): Promise<void> {
    const { sql } = await import('kysely');
    await sql`
      UPDATE documents d
      SET path = ${newPath}::text || substring(d.path from char_length(${moved.path}::text) + 1)
      WHERE d.owner_id = ${ownerId}::uuid
        AND d.knowledge_base_id = ${moved.knowledge_base_id}::uuid
        AND d.path LIKE ${`${moved.path}/%`}
    `.execute(transaction);
  }

  /** 用于间隔耗尽时按重排顺序对同父活跃兄弟写入互有间隔的位置。 */
  // ponytail: VALUES 批每兄弟 2 个绑定参数，活跃兄弟超约 32000 个会触驱动参数上限；升级路径为分批或临时表。
  private async rebalanceSiblings(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    movedId: string,
    placement: Extract<MovePlacement, { kind: 'rebalance' }>,
  ): Promise<void> {
    const { sql } = await import('kysely');
    const assignments = placement.order.flatMap((id, index) =>
      id === movedId
        ? []
        : [sql`(${id}::uuid, ${String(index * Number(SIBLING_POSITION_GAP))}::bigint)`],
    );
    if (assignments.length === 0) return;
    await sql`
      UPDATE documents AS d SET position = v.position
      FROM (VALUES ${sql.join(assignments)}) AS v(id, position)
      WHERE d.id = v.id AND d.owner_id = ${ownerId}::uuid
    `.execute(transaction);
  }
}
