/** @fileoverview 组合所有者边界、搜索排序、纯文本投影与不透明分页响应。 */

import type { SearchAncestor, SearchResponse, SearchResultItem } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { HttpStatus, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';

import { LocalIdentityContext } from '../identity/local-identity.context';
import { createSearchSnippet, highlightSearchTitle, sliceSearchText } from './search-highlight';
import {
  decodeSearchCursor,
  encodeSearchCursor,
  normalizeSearchQuery,
  type NormalizedSearchQuery,
  type SearchCursorPayload,
  type SearchQueryDto,
} from './search-query.dto';
import type { RankedSearchRow, SearchAncestorRow } from './search-query.model';
import {
  activeKnowledgeBaseExists,
  hasUpdatingProjection,
  readRankedSearchRows,
  readSearchAncestors,
} from './search-query.store';

interface AncestorProjection {
  readonly items: readonly SearchAncestor[];
  readonly pathTruncated: boolean;
}

// 与共享契约默认分页上限保持一致，API 的 CommonJS 运行时不加载 ESM 契约值。
const SEARCH_DEFAULT_LIMIT = 20;

/** 用于返回不泄露知识库存在性的统一公开错误。 */
function inaccessibleScope(): ApiDomainException {
  return new ApiDomainException({
    code: 'NOT_FOUND',
    kind: 'domain',
    message: '请求的资源不存在或不可访问。',
    status: HttpStatus.NOT_FOUND,
  });
}

/** 用于把批量祖先行折叠为每文档稳定公开链。 */
function groupAncestors(rows: readonly SearchAncestorRow[]): Map<string, AncestorProjection> {
  const grouped = new Map<string, { items: SearchAncestor[]; pathTruncated: boolean }>();
  for (const row of rows) {
    const current = grouped.get(row.document_id) ?? {
      items: [],
      pathTruncated: Number(row.total) > 8,
    };
    current.items.push({ documentId: row.id, title: row.title });
    grouped.set(row.document_id, current);
  }
  return grouped;
}

/** 用于组装所有命中类型共享且不含内部排序元组的字段。 */
function commonResult(
  row: RankedSearchRow,
  ancestors: AncestorProjection | undefined,
  query: string,
) {
  return {
    ancestors: ancestors?.items ?? [],
    documentId: row.document_id,
    documentTitle: row.document_title,
    documentVersion: row.document_version,
    knowledgeBaseId: row.knowledge_base_id,
    knowledgeBaseName: row.knowledge_base_name,
    pathTruncated: ancestors?.pathTruncated ?? false,
    titleSegments: highlightSearchTitle(row.document_title, query, row.matched_field !== 'content'),
    updatedAt: row.updated_at,
  };
}

/** 用于按判别字段创建与共享契约一致的标题或正文结果。 */
function toSearchResult(
  row: RankedSearchRow,
  ancestors: AncestorProjection | undefined,
  query: string,
): SearchResultItem {
  const common = commonResult(row, ancestors, query);
  if (row.matched_field === 'title')
    return {
      ...common,
      blockId: null,
      contentSnippet: null,
      headingPath: [],
      matchedField: 'title',
    };
  if (row.block_id === null || row.text === null)
    throw new Error('Content search row is incomplete');
  const content = {
    ...common,
    blockId: row.block_id,
    contentSnippet: createSearchSnippet(row.text, query),
    headingPath: (row.heading_path ?? []).slice(0, 4).map((item) => sliceSearchText(item, 200)),
  };
  return row.matched_field === 'both'
    ? { ...content, matchedField: 'both' }
    : { ...content, matchedField: 'content' };
}

/** 用于从最后一项内部排序元组生成下一页游标。 */
function nextCursorFor(
  rows: readonly RankedSearchRow[],
  limit: number,
  query: NormalizedSearchQuery,
): string | null {
  if (rows.length <= limit) return null;
  const row = rows[limit - 1];
  if (row === undefined) return null;
  const payload: SearchCursorPayload = {
    documentId: row.document_id,
    fingerprint: query.fingerprint,
    rankScore: row.rank_score,
    rankTier: row.rank_tier,
    updatedAtMicros: row.updated_at_micros,
    v: 1,
  };
  return encodeSearchCursor(payload);
}

/** 用于公开只读搜索且始终从可信身份上下文派生所有者。 */
@Injectable()
export class SearchQueryService {
  /** 用于接收业务事实数据库和不可由浏览器覆盖的操作者。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于验证当前库范围且统一隐藏不存在、已删和他人知识库。 */
  private async assertScope(ownerId: string, query: NormalizedSearchQuery): Promise<void> {
    if (query.scope !== 'knowledgeBase' || query.knowledgeBaseId === null) return;
    if (
      !(await activeKnowledgeBaseExists(
        this.databaseService.client,
        ownerId,
        query.knowledgeBaseId,
      ))
    )
      throw inaccessibleScope();
  }

  /** 用于执行一页固定排序搜索并仅返回安全公开投影。 */
  async search(input: SearchQueryDto): Promise<SearchResponse> {
    const { ownerId } = this.identityContext.getActor();
    const query = normalizeSearchQuery(input);
    await this.assertScope(ownerId, query);
    const limit = input.limit ?? SEARCH_DEFAULT_LIMIT;
    const cursor = input.cursor === undefined ? undefined : decodeSearchCursor(input.cursor);
    if (input.cursor !== undefined && cursor === undefined)
      throw new TypeError('Validated search cursor is invalid');
    const rows = await readRankedSearchRows(this.databaseService.client, {
      cursor,
      limit,
      ownerId,
      query,
    });
    const pageRows = rows.slice(0, limit);
    const ancestors = groupAncestors(
      await readSearchAncestors(
        this.databaseService.client,
        ownerId,
        pageRows.map(({ document_id: id }) => id),
      ),
    );
    const updating = await hasUpdatingProjection(this.databaseService.client, ownerId, query);
    return {
      indexStatus: updating ? 'updating' : 'ready',
      items: pageRows.map((row) =>
        toSearchResult(row, ancestors.get(row.document_id), query.query),
      ),
      nextCursor: nextCursorFor(rows, limit, query),
    };
  }
}
