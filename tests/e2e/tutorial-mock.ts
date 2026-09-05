/** @fileoverview 定义浏览器验收对 mock LLM 与 mock GLM 搜索的可控路由与固定数据。 */

/** mock 搜索返回的默认结果，教程研究笔记与章节来源列表断言均基于它。 */
export const MOCK_SEARCH_RESULTS = [
  {
    content: 'mock 搜索内容 A：这是验收用研究片段。',
    publish_date: '2026-01-01',
    title: 'Mock 来源 A',
    url: 'https://mock.example/a',
  },
  {
    content: 'mock 搜索内容 B：这是验收用研究片段。',
    publish_date: '2026-01-02',
    title: 'Mock 来源 B',
    url: 'https://mock.example/b',
  },
];

/** mock 简报生成的固定 Markdown 文本。 */
export const MOCK_BRIEF_TEXT = [
  '## Mock 简报总述',
  '',
  '本简报由 mock LLM 生成，聚合本轮采集到的全部条目。',
].join('\n');

/** mock 搜索结果条目的可控形态，缺省字段由响应构造兜底。 */
export interface MockSearchResult {
  readonly content?: string;
  readonly publish_date?: string;
  readonly title: string;
  readonly url: string;
}

/** 资讯验收对 mock 搜索与判定的可控开关，由 spec 在运行期间改写并在用例开头复位。 */
export const mockNewsControl = {
  /** 覆盖 /web_search 返回的条目，null 时回落默认结果。 */
  webSearchResults: null as readonly MockSearchResult[] | null,
};

/** mock 章节请求挂起时长，用于占住执行并发制造取消窗口。 */
const CHAPTER_HANG_MS = 15_000;

/** 教程验收对 mock LLM 的可控开关，由 spec 在运行期间改写并在用例开头复位。 */
export const mockTutorialControl = {
  /** 命中标题的章节请求返回 500，用于制造章节失败。 */
  brokenChapterTitles: [] as string[],
  /** 命中标题的章节请求延迟应答，用于占住执行并发制造取消窗口。 */
  hangingChapterTitles: [] as string[],
  /** 大纲请求返回的章节 JSON 文本。 */
  outlineContent: JSON.stringify({
    chapters: [
      { dependsOn: [], nodeKey: 'getting-started', summary: '建立基础认知。', title: '入门基础' },
      {
        dependsOn: ['getting-started'],
        nodeKey: 'core-concepts',
        summary: '掌握核心机制。',
        title: '核心概念',
      },
      {
        dependsOn: ['core-concepts'],
        nodeKey: 'advanced',
        summary: '综合运用核心机制。',
        title: '进阶实战',
      },
    ],
  }),
};

/** 用于生成带 [1] 引用与来源列表的 mock 章节正文。 */
export function buildMockChapterMarkdown(title: string): string {
  return [
    `## ${title}`,
    '',
    '本章依据研究来源 [1] 展开讲解，事实句均以 [1] 标注引用。',
    '',
    '## 参考来源',
    '',
    '1. Mock 来源 A：https://mock.example/a',
  ].join('\n');
}

/** 用于写出 mock GLM web_search 响应，条目按 news 开关可覆盖。 */
export function writeGlmSearchResponse(response: {
  end(chunk?: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
}): void {
  const base = mockNewsControl.webSearchResults ?? MOCK_SEARCH_RESULTS;
  const search_result = base.map((result) => ({
    content: result.content ?? 'mock 资讯搜索摘要。',
    link: result.url,
    publish_date: result.publish_date ?? '2026-09-01',
    title: result.title,
  }));
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ search_result }));
}

/** 用于判断提示词是否为章节撰写请求并提取章节标题。 */
function chapterTitleOf(promptText: string): string | null {
  return /撰写章节「([^」]+)」/u.exec(promptText)?.[1] ?? null;
}

/** 用于判断提示词是否为教程大纲请求。 */
function isOutlineRequest(promptText: string): boolean {
  return promptText.includes('结构化大纲');
}

interface ServerResponseLike {
  end(chunk?: string): void;
  write(chunk: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
}

/** 用于按提示词路由教程大纲与章节请求，返回 null 表示非教程请求。 */
export async function resolveTutorialContent(
  promptText: string,
  response: ServerResponseLike,
): Promise<string | null> {
  if (isOutlineRequest(promptText)) return mockTutorialControl.outlineContent;
  const title = chapterTitleOf(promptText);
  if (title === null) return null;
  if (mockTutorialControl.brokenChapterTitles.some((item) => promptText.includes(item))) {
    response.writeHead(500);
    response.end();
    return '';
  }
  if (mockTutorialControl.hangingChapterTitles.some((item) => promptText.includes(item))) {
    await new Promise((resolve) => setTimeout(resolve, CHAPTER_HANG_MS));
  }
  return buildMockChapterMarkdown(title);
}

/** 用于构造 compose Agent 的 scope 提案回复，范围主题取自会话状态行。 */
export function resolveComposeContent(promptText: string): string | null {
  if (!promptText.includes('Everlearn 教程创作助手')) return null;
  const topic = /主题「([^」]+)」/u.exec(promptText)?.[1] ?? 'E2E 教程主题';
  return JSON.stringify({
    proposal: {
      kind: 'scope',
      payload: {
        audience: 'E2E 验收受众',
        depth: 'standard',
        excludeTopics: [],
        goals: '',
        includeTopics: [],
        knowledgeBaseIds: [],
        level: 50,
        topic,
      },
    },
    reply: 'mock Agent 回复：已按你的要求整理范围提案，请确认。',
  });
}

/** 用于从判定提示词解析带编号的条目标题（形如「0. 标题」的行）。 */
function judgeEntries(promptText: string): { index: number; title: string }[] {
  return Array.from(promptText.matchAll(/^(\d+)\. (.+)$/gmu), (match) => ({
    index: Number(match[1]),
    title: match[2]!.trim(),
  }));
}

/** 用于按标题标记生成单条三合一判定，支持 [高]/[低]/[无关] 前缀标记。 */
function judgeEntryOf(index: number, title: string): Record<string, string | number | boolean> {
  return {
    importance: title.includes('[高]') ? 'high' : title.includes('[低]') ? 'low' : 'normal',
    index,
    keep: !title.includes('[无关]'),
    summary: `mock 摘要：${title.replace(/^\[[^\]]+\]\s*/u, '')}`,
  };
}

/** 用于构造资讯三合一判定的 JSON 回复，返回 null 表示非判定请求。 */
export function resolveNewsJudgeContent(promptText: string): string | null {
  if (!promptText.includes('请对以下每条资讯完成三件事')) return null;
  // 条目行在格式说明（以「不要输出其他内容。」收尾）之后，避免误读说明里的编号行。
  const marker = promptText.lastIndexOf('不要输出其他内容。');
  const entryText = marker === -1 ? promptText : promptText.slice(marker);
  const items = judgeEntries(entryText).map((entry) => judgeEntryOf(entry.index, entry.title));
  return JSON.stringify({ items });
}
