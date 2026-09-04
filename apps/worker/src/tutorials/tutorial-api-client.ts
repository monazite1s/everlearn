/**
 * @fileoverview 封装 Worker 调用教程内部端点的 HTTP 客户端。
 */

const REQUEST_TIMEOUT_MS = 120_000;

/** 带稳定错误码的响应失败。 */
export class TutorialApiError extends Error {
  /** 用于保存公开错误码供运行终态记录。 */
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

/** 教程执行器共享的内部配置。 */
export interface TutorialExecutorConfig {
  readonly apiInternalUrl: string;
  readonly secret: string;
}

/** 用于执行内部请求并把错误信封映射为稳定错误码。 */
async function callInternal(
  config: TutorialExecutorConfig,
  path: string,
  init: { body?: unknown; method: 'GET' | 'POST' },
): Promise<unknown> {
  const base = config.apiInternalUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/v1/internal/tutorials${path}`, {
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      headers: { 'content-type': 'application/json', 'x-purge-secret': config.secret },
      method: init.method,
      signal: controller.signal,
    });
    if (response.status === 204) return undefined;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const record =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const code = typeof record.code === 'string' ? record.code : 'TUTORIAL_UPSTREAM_ERROR';
      throw new TutorialApiError(code, `tutorial endpoint ${path} responded ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** 用于领取一批待研究教程会话。 */
export async function dispatchTutorialOutlineSessions(
  config: TutorialExecutorConfig,
  limit: number,
): Promise<
  readonly {
    audience: string;
    depth: string;
    excludeTopics: readonly string[];
    goals: string;
    includeTopics: readonly string[];
    kbTexts: readonly string[];
    level: number;
    sessionId: string;
    topic: string;
  }[]
> {
  const result = await callInternal(config, '/outline/dispatch', {
    body: { limit },
    method: 'POST',
  });
  return Array.isArray(result) ? (result as never) : [];
}

/** 用于领取一批依赖已满足的待生成章节。 */
export async function dispatchTutorialChapters(
  config: TutorialExecutorConfig,
  limit: number,
): Promise<
  readonly {
    attempt: number;
    chapterId: string;
    documentId: string;
    kbTexts: readonly string[];
    level: number;
    sessionTopic: string;
    summary: string;
    title: string;
  }[]
> {
  const result = await callInternal(config, '/chapters/dispatch', {
    body: { limit },
    method: 'POST',
  });
  return Array.isArray(result) ? (result as never) : [];
}

/** 用于把大纲运行推进到终态。 */
export async function completeTutorialOutline(
  config: TutorialExecutorConfig,
  sessionId: string,
  input: {
    errorCode?: string;
    outline?: { chapters: unknown[] };
    warnings?: readonly string[];
    status: 'failed' | 'succeeded';
  },
): Promise<void> {
  await callInternal(config, `/outline/${sessionId}/complete`, { body: input, method: 'POST' });
}

/** 用于把章节运行推进到终态。 */
export async function completeTutorialChapter(
  config: TutorialExecutorConfig,
  chapterId: string,
  input: { errorCode?: string; markdown?: string; status: 'failed' | 'succeeded' },
): Promise<void> {
  await callInternal(config, `/chapters/${chapterId}/complete`, { body: input, method: 'POST' });
}
