/** @fileoverview 解析并规范化搜索页可分享的 URL 筛选状态。 */

import {
  SEARCH_QUERY_MAX_LENGTH,
  type SearchField,
  type SearchRequestQuery,
  type SearchScope,
} from '@everlearn/contracts';

export type UpdatedWithin = '24h' | '30d' | '7d' | 'any';

/** 搜索页全部可深链筛选。 */
export interface SearchFilters {
  readonly field: SearchField;
  readonly knowledgeBaseId?: string;
  readonly query: string;
  readonly scope: SearchScope;
  readonly updatedWithin: UpdatedWithin;
}

const FIELD_VALUES: readonly SearchField[] = ['all', 'title', 'content'];
const UPDATED_VALUES: readonly UpdatedWithin[] = ['any', '24h', '7d', '30d'];

/** 用于识别可交给知识库详情 API 的单一 UUID。 */
function isUuid(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** 用于把 URL 中的单值收窄到批准闭集。 */
function includesValue<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && values.includes(value as T);
}

/** 用于从查询字符串恢复规范搜索筛选。 */
export function parseSearchFilters(search: string): SearchFilters {
  const params = new URLSearchParams(search);
  const query = (params.get('query') ?? '').slice(0, SEARCH_QUERY_MAX_LENGTH);
  const fieldValue = params.get('field');
  const updatedValue = params.get('updatedWithin');
  const scoped = params.get('scope') === 'knowledgeBase';
  const knowledgeBaseValues = params.getAll('knowledgeBaseId');
  const candidate = knowledgeBaseValues.length === 1 ? knowledgeBaseValues[0] : undefined;
  const knowledgeBaseId = isUuid(candidate) ? candidate : undefined;
  const scope = scoped ? 'knowledgeBase' : 'all';
  const base = {
    field: includesValue(FIELD_VALUES, fieldValue) ? fieldValue : 'all',
    query,
    scope,
    updatedWithin: includesValue(UPDATED_VALUES, updatedValue) ? updatedValue : 'any',
  } satisfies Omit<SearchFilters, 'knowledgeBaseId'>;
  return scope === 'knowledgeBase' && knowledgeBaseId ? { ...base, knowledgeBaseId } : base;
}

/** 用于生成只含非默认值的可分享搜索 URL。 */
export function buildSearchHref(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.scope === 'knowledgeBase' && filters.knowledgeBaseId) {
    params.set('scope', filters.scope);
    params.set('knowledgeBaseId', filters.knowledgeBaseId);
  }
  if (filters.field !== 'all') params.set('field', filters.field);
  if (filters.updatedWithin !== 'any') params.set('updatedWithin', filters.updatedWithin);
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
}

/** 用于按一次查询会话的起始时刻计算严格更新时间下界。 */
export function updatedAfterFor(range: UpdatedWithin, now = Date.now()): string | undefined {
  const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 } as const;
  if (range === 'any') return undefined;
  return new Date(now - hours[range] * 60 * 60 * 1000).toISOString();
}

/** 用于生成后端搜索请求且不携带 UI 专用相对时间枚举。 */
export function toSearchRequest(
  filters: SearchFilters,
  updatedAfter: string | undefined,
  cursor?: string,
): SearchRequestQuery {
  return {
    ...(cursor ? { cursor } : {}),
    ...(filters.field === 'all' ? {} : { field: filters.field }),
    ...(filters.scope === 'knowledgeBase' && filters.knowledgeBaseId
      ? { knowledgeBaseId: filters.knowledgeBaseId, scope: filters.scope }
      : {}),
    query: filters.query.trim(),
    ...(updatedAfter ? { updatedAfter } : {}),
  };
}
