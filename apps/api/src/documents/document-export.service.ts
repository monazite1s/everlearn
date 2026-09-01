/** @fileoverview 实现限定所有者的知识库文档子树导出读取。 */

import type { DocumentExportItem, DocumentExportResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';

interface DocumentExportRow {
  contentJson: unknown;
  id: string;
  path: string[];
  title: string;
}

/** 用于接收共享数据库客户端与可信本地身份。 */
@Injectable()
export class DocumentExportService {
  /** 用于注入数据库客户端与本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于按可选根文档读取有效子树的标题链与正文投影。 */
  async export(
    knowledgeBaseId: string,
    rootId: string | undefined,
  ): Promise<DocumentExportResponse> {
    const { ownerId } = this.identityContext.getActor();
    const { sql } = await import('kysely');
    // ponytail: 标题链即目录路径，层级上限 64 与正文 JSON 深度守卫同口径；出现环形父子属数据损坏场景，另任务治理。
    const rootFilter =
      rootId === undefined ? sql`d.parent_id IS NULL` : sql`d.id = ${rootId}::uuid`;
    const result = await sql<DocumentExportRow>`
      WITH RECURSIVE subtree AS (
        SELECT d.id, d.title, d.content_json, ARRAY[]::text[] AS path, d.owner_id, 0 AS depth
        FROM documents d
        JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
        WHERE kb.id = ${knowledgeBaseId}::uuid AND d.owner_id = ${ownerId}::uuid
          AND kb.deleted_at IS NULL AND d.deleted_at IS NULL AND ${rootFilter}
        UNION ALL
        SELECT c.id, c.title, c.content_json, s.path || c.title, c.owner_id, s.depth + 1
        FROM documents c
        JOIN subtree s ON c.parent_id = s.id
        WHERE c.deleted_at IS NULL AND c.owner_id = s.owner_id AND s.depth < 64
      )
      SELECT id, title, content_json AS "contentJson", path FROM subtree ORDER BY path
    `.execute(this.databaseService.client);
    if (rootId !== undefined && result.rows.length === 0) throw new NotFoundException();
    const items: DocumentExportItem[] = result.rows.map((row) => ({
      contentJson: row.contentJson,
      id: row.id,
      path: row.path,
      title: row.title,
    }));
    return { items };
  }
}
