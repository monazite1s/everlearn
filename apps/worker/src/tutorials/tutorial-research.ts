/**
 * @fileoverview 定义 Worker 侧教程执行器的搜索能力契约、研究提示词与大纲解析纯函数。
 */

import { extractJsonObject } from './json-extraction';

// ponytail: 与 apps/api/src/providers/web-search.ts 的 WebSearchProvider 保持结构兼容；
// Worker rootDir 限制无法跨包导入类型，升级条件为该契约下沉到共享 packages。
/** 与 API 侧 WebSearchProvider 结构兼容的搜索能力。 */
export interface TutorialWebSearchProvider {
  search(request: {
    excludeDomains?: readonly string[];
    includeDomains?: readonly string[];
    maxResults?: number;
    query: string;
  }): Promise<
    readonly { publishedAt: string | null; snippet: string; title: string; url: string }[]
  >;
}

/** 从进程配置解析搜索 Provider：未配置时返回 undefined 并由调用方降级。 */
export function resolveTutorialWebSearch(config: {
  get(name: string): string | undefined;
}): TutorialWebSearchProvider | undefined {
  const provider = config.get('SEARCH_PROVIDER');
  const apiKey = config.get('SEARCH_API_KEY');
  if (
    provider === undefined ||
    apiKey === undefined ||
    provider.length === 0 ||
    apiKey.length === 0
  ) {
    return undefined;
  }
  if (provider === 'glm') {
    const glmBase =
      config.get('GLM_SEARCH_BASE_URL')?.replace(/\/+$/u, '') ??
      'https://open.bigmodel.cn/api/paas/v4';
    return {
      /** 用于把共享查询请求转发到 GLM 适配。 */
      search: (request) => searchWithGlm(request, apiKey, glmBase),
    };
  }
  const baseUrl = config.get('TAVILY_BASE_URL')?.replace(/\/+$/u, '') ?? 'https://api.tavily.com';
  return {
    /** 用于把共享查询请求转发到 Tavily 适配。 */
    search: (request) => searchWithTavily(request, apiKey, baseUrl),
  };
}

/** 用于调用 Tavily REST API 并把结果映射为共享结果形态。 */
async function searchWithTavily(
  request: { maxResults?: number; query: string },
  apiKey: string,
  baseUrl: string,
): Promise<readonly { publishedAt: string | null; snippet: string; title: string; url: string }[]> {
  const response = await fetch(`${baseUrl}/search`, {
    body: JSON.stringify({ apiKey, max_results: request.maxResults ?? 5, query: request.query }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw new Error(`tavily search responded ${response.status}`);
  const body = (await response.json()) as {
    results?: { content?: string; title?: string; url?: string }[];
  };
  return (body.results ?? []).map((result) => ({
    publishedAt: null,
    snippet: result.content ?? '',
    title: result.title ?? '',
    url: result.url ?? '',
  }));
}

const GLM_SEARCH_TIMEOUT_MS = 60_000;
const MAX_SNIPPET_LENGTH = 400;

/** 用于调用 GLM web_search API 并把失败归类为与 API 侧一致的稳定中文错误。 */
async function searchWithGlm(
  request: { maxResults?: number; query: string },
  apiKey: string,
  baseUrl: string,
): Promise<readonly { publishedAt: string | null; snippet: string; title: string; url: string }[]> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/web_search`, {
      body: JSON.stringify({
        // ponytail: search_std/search_pro 返回 refer 引用而 link 为空，须用夸克引擎拿真实 URL；升级条件为官方 std 引擎补齐链接。
        search_engine: 'search_pro_quark',
        search_query: request.query,
        count: request.maxResults,
      }),
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(GLM_SEARCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('无法连接 Web 搜索服务。');
  }
  if (!response.ok) throw new Error('Web 搜索服务返回错误。');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Web 搜索服务响应无法解析。');
  }
  return parseGlmSearchResponse(payload);
}

/** 用于解析 GLM 响应体，丢弃缺少标题或链接的条目并截断摘要。 */
function parseGlmSearchResponse(
  payload: unknown,
): { publishedAt: string | null; snippet: string; title: string; url: string }[] {
  const results =
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { search_result?: unknown }).search_result)
      ? (payload as { search_result: unknown[] }).search_result
      : [];
  return results.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const url = [record.link, record.url].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
    );
    if (typeof record.title !== 'string' || url === undefined) return [];
    return [
      {
        publishedAt: typeof record.publish_date === 'string' ? record.publish_date : null,
        snippet:
          typeof record.content === 'string' ? record.content.slice(0, MAX_SNIPPET_LENGTH) : '',
        title: record.title,
        url,
      },
    ];
  });
}

/** 用于按主题与覆盖词生成 2..4 组研究查询。 */
export function buildResearchQueries(topic: string, includeTopics: readonly string[]): string[] {
  return [topic, ...includeTopics.filter((item) => item !== topic).slice(0, 3)];
}

/** 用于把大纲 LLM 输出解析为结构化 JSON（容忍栅栏与前后缀文本，拒绝非预期结构）。 */
export function parseOutlineJson(text: string): { chapters: unknown } | null {
  const parsed = extractJsonObject(text);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { chapters?: unknown }).chapters)
  ) {
    return null;
  }
  return parsed as { chapters: unknown };
}

/** 用于构造大纲生成提示词。 */
export function buildOutlinePrompt(input: {
  audience: string;
  depth: string;
  excludeTopics: readonly string[];
  goals: string;
  includeTopics: readonly string[];
  kbTexts: readonly string[];
  level: number;
  researchNotes: string;
  topic: string;
}): string {
  return [
    `请为教程「${input.topic}」设计结构化大纲。受众：${input.audience}；水平：${input.level}/100；深度：${input.depth}。`,
    input.goals.length > 0 ? `学习目标：${input.goals}` : '',
    `必须覆盖：${input.includeTopics.join('、') || '无'}`,
    `必须排除：${input.excludeTopics.join('、') || '无'}`,
    '知识库资料：',
    ...input.kbTexts.map((text, index) => `【资料${index + 1}】${text}`),
    input.researchNotes.length > 0
      ? `Web 研究摘要：\n${input.researchNotes}`
      : '（无 Web 研究来源，仅依据知识库资料）',
    '仅输出 JSON，不要输出任何解释文字或代码栅栏：{"chapters":[{"nodeKey":"kebab-case-key","title":"章节标题","summary":"教学目标摘要","dependsOn":["前置nodeKey"]}]}，章节 4 到 12 个，依赖不得成环。',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

/** 用于构造章节撰写提示词。 */
export function buildChapterPrompt(input: {
  kbTexts: readonly string[];
  level: number;
  researchNotes: string;
  summary: string;
  title: string;
  topic: string;
}): string {
  return [
    `请为教程「${input.topic}」撰写章节「${input.title}」的中文 Markdown 正文。`,
    input.summary.length > 0 ? `章节目标：${input.summary}` : '',
    `读者水平：${input.level}/100。事实句需以 [n] 标注引用，文末按「## 参考来源」列出编号来源列表；无来源的事实不要写。`,
    '知识库资料：',
    ...input.kbTexts.map((text, index) => `【资料${index + 1}】${text}`),
    input.researchNotes.length > 0
      ? `Web 研究摘要：\n${input.researchNotes}`
      : '（无 Web 研究来源，仅依据知识库资料）',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}
