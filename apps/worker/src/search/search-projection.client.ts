/** @fileoverview 通过受保护 API 触发 Search 投影排空与补偿扫描。 */

export interface SearchProjectionStats {
  readonly processedEvents: number;
  readonly quarantinedEvents: number;
  readonly scannedDocuments: number;
}

const STATS_KEYS = ['processedEvents', 'quarantinedEvents', 'scannedDocuments'] as const;
const REQUEST_TIMEOUT_MS = 60_000;

/** 用于限制 Search 共享内部密钥只经 HTTPS 或本机 HTTP 发送。 */
function requireSafeSearchApiUrl(value: string): string {
  const url = new URL(value);
  const loopbackHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHosts.has(url.hostname))) {
    throw new Error('Search API URL requires HTTPS outside loopback');
  }
  return value;
}

/** 用于判断统计字段是否为安全非负整数。 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 用于确认内部响应只包含已发布的闭合统计字段。 */
function isSearchProjectionStats(value: unknown): value is SearchProjectionStats {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === STATS_KEYS.length && STATS_KEYS.every((key) => isCount(record[key]));
}

/** 用于触发一次事件排空与扫描，失败时抛错交给 BullMQ 重试。 */
export async function triggerSearchProjection(props: {
  apiInternalUrl: string;
  secret: string;
}): Promise<SearchProjectionStats> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const base = requireSafeSearchApiUrl(props.apiInternalUrl).replace(/\/$/, '');
    const response = await fetch(`${base}/api/v1/internal/search-projection`, {
      headers: { 'x-purge-secret': props.secret },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`search projection endpoint responded ${response.status}`);
    const body: unknown = await response.json();
    if (!isSearchProjectionStats(body)) throw new Error('search projection stats malformed');
    return body;
  } finally {
    clearTimeout(timer);
  }
}
