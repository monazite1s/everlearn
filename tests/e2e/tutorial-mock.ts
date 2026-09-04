/** @fileoverview 定义教程验收对 mock LLM 与 mock Tavily 的可控路由与固定数据。 */

/** mock 搜索返回的固定结果，教程研究笔记与章节来源列表断言均基于它。 */
export const MOCK_SEARCH_RESULTS = [
  {
    content: 'mock 搜索内容 A：这是验收用研究片段。',
    published_date: '2026-01-01',
    title: 'Mock 来源 A',
    url: 'https://mock.example/a',
  },
  {
    content: 'mock 搜索内容 B：这是验收用研究片段。',
    published_date: '2026-01-02',
    title: 'Mock 来源 B',
    url: 'https://mock.example/b',
  },
];

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

/** 用于写出 mock Tavily 搜索响应。 */
export function writeTavilyResponse(response: {
  end(chunk?: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
}): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ results: MOCK_SEARCH_RESULTS }));
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
