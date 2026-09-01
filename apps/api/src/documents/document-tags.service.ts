/** @fileoverview 实现所有者标签的规范化、文档标签整体设置与列表查询。 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';

/** 单个标签的公开投影。 */
export interface TagItem {
  readonly id: string;
  readonly name: string;
}

const TAG_NAME_MAX_LENGTH = 50;
const TAGS_PER_SET_MAX = 20;

/** 用于把展示名折叠为大小写不敏感的所有者内规范名。 */
export function canonicalTagName(name: string): string {
  return name.trim().toLowerCase();
}

/** 用于把输入名列表折叠为规范名到展示名的有序映射。 */
export function canonicalizeTagNames(names: readonly string[]): Map<string, string> {
  const canonical = new Map<string, string>();
  for (const name of names.slice(0, TAGS_PER_SET_MAX)) {
    const display = name.trim().slice(0, TAG_NAME_MAX_LENGTH);
    const key = canonicalTagName(display);
    if (key.length > 0) canonical.set(key, display);
  }
  return canonical;
}

/** 用于确认文档属于当前所有者且文档与所在知识库均有效。 */
async function assertActiveDocument(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  ownerId: string,
  documentId: string,
): Promise<void> {
  const row = await executor
    .selectFrom('documents')
    .select('id')
    .where('id', '=', documentId)
    .where('owner_id', '=', ownerId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (row === undefined) throw new NotFoundException();
}

/** 用于读取文档当前标签的有序公开投影。 */
async function readDocumentTags(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  documentId: string,
): Promise<TagItem[]> {
  const rows = await executor
    .selectFrom('document_tags')
    .innerJoin('tags', 'tags.id', 'document_tags.tag_id')
    .select(['tags.id', 'tags.name'])
    .where('document_tags.document_id', '=', documentId)
    .orderBy('tags.canonical')
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** 用于持有标签查询与整体设置所需的最小身份和数据库依赖。 */
@Injectable()
export class DocumentTagsService {
  /** 用于接收共享数据库客户端与不可由浏览器覆盖的操作者。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于列出当前所有者的全部标签。 */
  async listOwnerTags(): Promise<TagItem[]> {
    const { ownerId } = this.identityContext.getActor();
    const rows = await this.databaseService.client
      .selectFrom('tags')
      .select(['id', 'name'])
      .where('owner_id', '=', ownerId)
      .orderBy('canonical')
      .execute();
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  /** 用于读取单个有效文档的标签投影。 */
  async listDocumentTags(documentId: string): Promise<TagItem[]> {
    const { ownerId } = this.identityContext.getActor();
    await assertActiveDocument(this.databaseService.client, ownerId, documentId);
    return readDocumentTags(this.databaseService.client, documentId);
  }

  /** 用于整体设置文档标签：规范化、补齐缺失标签并删除未列出的关联。 */
  async setDocumentTags(documentId: string, names: readonly string[]): Promise<TagItem[]> {
    const { ownerId } = this.identityContext.getActor();
    const canonical = canonicalizeTagNames(names);
    return this.databaseService.client
      .transaction()
      .execute((transaction) => this.setInTransaction(transaction, ownerId, documentId, canonical));
  }

  /** 用于在事务内完成文档校验、标签 upsert 与关联整体替换。 */
  private async setInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    documentId: string,
    canonical: Map<string, string>,
  ): Promise<TagItem[]> {
    await assertActiveDocument(transaction, ownerId, documentId);
    for (const [key, name] of canonical) {
      await transaction
        .insertInto('tags')
        .values({ id: randomUUID(), owner_id: ownerId, name, canonical: key })
        .onConflict((conflict) => conflict.columns(['owner_id', 'canonical']).doUpdateSet({ name }))
        .execute();
    }
    const tags = await transaction
      .selectFrom('tags')
      .select(['id', 'canonical'])
      .where('owner_id', '=', ownerId)
      .where('canonical', 'in', [...canonical.keys()])
      .execute();
    const tagIds = tags.map((tag) => tag.id);
    if (tagIds.length > 0) {
      await transaction
        .deleteFrom('document_tags')
        .where('document_id', '=', documentId)
        .where('tag_id', 'not in', tagIds)
        .execute();
      await transaction
        .insertInto('document_tags')
        .values(tagIds.map((tagId) => ({ document_id: documentId, tag_id: tagId })))
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    } else {
      await transaction.deleteFrom('document_tags').where('document_id', '=', documentId).execute();
    }
    return readDocumentTags(transaction, documentId);
  }
}
