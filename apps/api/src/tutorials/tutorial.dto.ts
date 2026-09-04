/**
 * @fileoverview 定义教程会话的公开摘要、详情与大纲数据形态。
 */

/** 大纲内单章的可编辑输入形态。 */
export interface TutorialOutlineChapter {
  /** 章节稳定键，会话内唯一。 */
  readonly nodeKey: string;
  /** 章节标题。 */
  readonly title: string;
  /** 章节内容摘要或教学目标。 */
  readonly summary?: string;
  /** 依赖的前置章节 nodeKey 列表。 */
  readonly dependsOn?: readonly string[];
}

/** 一次教程的结构化大纲。 */
export interface TutorialOutline {
  /** 有序章节列表，执行顺序即数组顺序。 */
  readonly chapters: readonly TutorialOutlineChapter[];
}

/** 会话研究范围的完整字段集合。 */
export interface TutorialScope {
  readonly topic: string;
  readonly audience: string;
  readonly level: number;
  readonly goals: string;
  readonly depth: 'deep' | 'overview' | 'standard';
  readonly includeTopics: readonly string[];
  readonly excludeTopics: readonly string[];
  readonly knowledgeBaseIds: readonly string[];
}

/** 列表项携带的章节状态计数。 */
export interface TutorialChapterCounts {
  readonly failed: number;
  readonly pending: number;
  readonly succeeded: number;
  readonly total: number;
}

/** 教程会话列表项。 */
export interface TutorialSummary {
  readonly chapterCounts: TutorialChapterCounts;
  readonly createdAt: string;
  readonly id: string;
  readonly status: string;
  readonly topic: string;
}

/** 教程章节详情项。 */
export interface TutorialChapterView {
  readonly attempt: number;
  readonly dependsOn: readonly string[];
  readonly documentId: string | null;
  readonly errorCode: string | null;
  readonly id: string;
  readonly nodeKey: string;
  readonly status: string;
  readonly title: string;
}

/** 教程会话详情。 */
export interface TutorialDetail {
  readonly scope: TutorialScope;
  readonly chapters: readonly TutorialChapterView[];
  readonly errorCode: string | null;
  readonly id: string;
  readonly outline: TutorialOutline | null;
  readonly status: string;
  readonly tutorialKnowledgeBaseId: string | null;
  readonly warnings: readonly string[];
}
