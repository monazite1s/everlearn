/**
 * @fileoverview 定义 Worker 侧教程执行器的搜索能力契约、研究提示词与大纲解析纯函数。
 */

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
  const baseUrl = config.get('TAVILY_BASE_URL')?.replace(/\/+$/u, '') ?? 'https://api.tavily.com';
  // ponytail: 仅按 provider 名注入单一 Tavily 适配的假设签名，升级条件为接入第二家搜索供应商。
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

/** 用于按主题与覆盖词生成 2..4 组研究查询。 */
export function buildResearchQueries(topic: string, includeTopics: readonly string[]): string[] {
  return [topic, ...includeTopics.filter((item) => item !== topic).slice(0, 3)];
}

/** 用于把大纲 LLM 输出解析为结构化 JSON（容忍代码栅栏与前后缀文本）。 */
export function parseOutlineJson(text: string): { chapters: unknown } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { chapters?: unknown }).chapters)
    ) {
      return null;
    }
    return parsed as { chapters: unknown };
  } catch {
    return null;
  }
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
    '仅输出 JSON：{"chapters":[{"nodeKey":"kebab-case-key","title":"章节标题","summary":"教学目标摘要","dependsOn":["前置nodeKey"]}]}，章节 4 到 12 个，依赖不得成环。',
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
