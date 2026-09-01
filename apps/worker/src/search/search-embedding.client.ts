/** @fileoverview 通过受保护 API 触发搜索块向量回填。 */

import { requireSafeSearchApiUrl } from './search-projection.client';

export interface SearchEmbeddingStats {
  readonly skipped: boolean;
  readonly updatedBlocks: number;
}

const STATS_KEYS = ['skipped', 'updatedBlocks'] as const;
const REQUEST_TIMEOUT_MS = 120_000;

/** 用于判断统计字段是否为安全闭合结构。 */
function isSearchEmbeddingStats(value: unknown): value is SearchEmbeddingStats {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    STATS_KEYS.every((key) => key in record) &&
    typeof record.skipped === 'boolean' &&
    typeof record.updatedBlocks === 'number' &&
    Number.isSafeInteger(record.updatedBlocks) &&
    record.updatedBlocks >= 0
  );
}

/** 用于触发一次单批向量回填，失败时抛错交给 BullMQ 重试。 */
export async function triggerSearchEmbeddingBackfill(props: {
  apiInternalUrl: string;
  secret: string;
}): Promise<SearchEmbeddingStats> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const base = requireSafeSearchApiUrl(props.apiInternalUrl).replace(/\/$/, '');
    const response = await fetch(`${base}/api/v1/internal/search-embedding`, {
      headers: { 'x-purge-secret': props.secret },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`search embedding endpoint responded ${response.status}`);
    const body: unknown = await response.json();
    if (!isSearchEmbeddingStats(body)) throw new Error('search embedding stats malformed');
    return body;
  } finally {
    clearTimeout(timer);
  }
}
