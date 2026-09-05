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

/** 教程产出知识库的最小引用投影。 */
export interface TutorialKnowledgeBaseView {
  readonly id: string;
  readonly kind: string;
}

/** 书架卡片携带的章节进度计数。 */
export interface TutorialProgressView {
  readonly completed: number;
  readonly failed: number;
  readonly total: number;
}

/** 继续阅读定位：指向章节文档路由。 */
export interface TutorialContinueTarget {
  readonly chapterTitle: string;
  readonly documentId: string;
  readonly knowledgeBaseId: string;
}

/** 教程会话列表项。 */
export interface TutorialSummary {
  readonly continueTo: TutorialContinueTarget | null;
  readonly createdAt: string;
  readonly id: string;
  readonly knowledgeBase: TutorialKnowledgeBaseView | null;
  readonly progress: TutorialProgressView | null;
  readonly status: string;
  readonly topic: string;
  readonly updatedAt: string;
}

/** 异步阶段的真实计数投影，不伪造百分比。 */
export interface TutorialStageView {
  readonly completed: number | null;
  readonly phase: 'generating' | 'researching';
  readonly sourcesGathered: number | null;
  readonly total: number | null;
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
  readonly summary: string;
  readonly title: string;
}

/** 教程会话详情。 */
export interface TutorialDetail {
  readonly chapters: readonly TutorialChapterView[];
  readonly continueTo: TutorialContinueTarget | null;
  readonly currentChapterId: string | null;
  readonly errorCode: string | null;
  readonly id: string;
  readonly knowledgeBase: TutorialKnowledgeBaseView | null;
  readonly outline: TutorialOutline | null;
  readonly scope: TutorialScope;
  readonly stage: TutorialStageView | null;
  readonly status: string;
  readonly tutorialKnowledgeBaseId: string | null;
  readonly warnings: readonly string[];
}

/** 三视图图的节点：来自已确认大纲的章节行。 */
export interface TutorialGraphNode {
  readonly documentId: string | null;
  readonly nodeKey: string;
  readonly status: string;
  readonly title: string;
}

/** 三视图图的依赖边：from 为前置章节 nodeKey。 */
export interface TutorialGraphEdge {
  readonly from: string;
  readonly to: string;
}

/** 三视图图数据；无已确认大纲时两侧均为空集。 */
export interface TutorialGraph {
  readonly edges: readonly TutorialGraphEdge[];
  readonly nodes: readonly TutorialGraphNode[];
}
