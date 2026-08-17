/** @fileoverview 通过 API 内部端点触发附件孤儿清理并校验闭合统计。 */

export interface AttachmentOrphanPurgeStats {
  readonly purgedAttachments: number;
}

const STATS_KEYS = ['purgedAttachments'] as const;
// ponytail: 固定 5 分钟超时覆盖最大批次清理耗时；升级路径为配置化超时。
const REQUEST_TIMEOUT_MS = 300_000;

/** 用于判断统计字段是否为安全非负整数。 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 用于触发一次孤儿清理并在非 2xx 或畸形响应时抛错交给队列重试。 */
export async function triggerAttachmentOrphanPurge(props: {
  apiInternalUrl: string;
  secret: string;
}): Promise<AttachmentOrphanPurgeStats> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const base = props.apiInternalUrl.replace(/\/$/, '');
    const response = await fetch(`${base}/api/v1/internal/attachment-orphans`, {
      headers: { 'x-purge-secret': props.secret },
      method: 'POST',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`attachment purge endpoint responded ${response.status}`);
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null)
      throw new Error('attachment purge stats malformed');
    const record = body as Record<string, unknown>;
    if (STATS_KEYS.some((key) => !isCount(record[key]))) {
      throw new Error('attachment purge stats malformed');
    }
    return { purgedAttachments: record.purgedAttachments as number };
  } finally {
    clearTimeout(timer);
  }
}
