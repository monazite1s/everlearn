/**
 * @fileoverview 教程前后端契约的局部投影与解析守卫，字段以页面规格为准。
 */
// 契约暂由本文件局部声明，待后端定稿后并入 packages/contracts，禁止在并入前被其他 feature 复用。

import { isRecord } from '../../shared/api-request';

/** 教程产出知识库的最小投影，kind=tutorial 时界面展示教程徽标。 */
export interface TutorialKnowledgeBaseRef {
  readonly id: string;
  readonly kind: string;
}

/** 章节完成进度的局部投影。 */
export interface TutorialProgress {
  readonly completed: number;
  readonly failed: number;
  readonly total: number;
}

/** 继续阅读定位的局部投影，指向章节文档路由。 */
export interface TutorialContinueTarget {
  readonly chapterTitle: string;
  readonly documentId: string;
  readonly knowledgeBaseId: string;
}

/** 书架列表条目的局部投影。 */
export interface TutorialListItem {
  readonly continueTo: TutorialContinueTarget | null;
  readonly createdAt: string;
  readonly id: string;
  readonly knowledgeBase: TutorialKnowledgeBaseRef | null;
  readonly progress: TutorialProgress | null;
  readonly status: string;
  readonly topic: string;
  readonly updatedAt: string;
}

/** 教程章节的局部投影，三视图共用的唯一数据源。 */
export interface TutorialChapter {
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

/** 异步阶段的真实计数投影，不伪造百分比。 */
export interface TutorialStage {
  readonly completed: number | null;
  readonly phase: 'researching' | 'generating';
  readonly sourcesGathered: number | null;
  readonly total: number | null;
}

/** 教程详情的局部投影。 */
export interface TutorialDetail {
  readonly chapters: readonly TutorialChapter[];
  readonly continueTo: TutorialContinueTarget | null;
  readonly currentChapterId: string | null;
  readonly errorCode: string | null;
  readonly id: string;
  readonly knowledgeBase: TutorialKnowledgeBaseRef | null;
  readonly stage: TutorialStage | null;
  readonly status: string;
  readonly topic: string;
  readonly warnings: readonly string[];
}

/** 对话内差异确认卡的单段差异投影。 */
export interface ComposeDiffSection {
  readonly after: string;
  readonly before: string;
  readonly name: string;
}

/** 对话内确认卡投影：闸门、提案与差异共用一种呈现。 */
export interface ComposeCard {
  readonly body: string;
  readonly diff: { generationId: string; sections: readonly ComposeDiffSection[] } | null;
  readonly gate: 'outline' | 'scope' | null;
  readonly proposalId: string | null;
  readonly state: 'accepted' | 'pending' | 'rejected';
  readonly title: string;
  readonly variant: 'diff' | 'gate' | 'proposal';
}

/** 对话消息投影，角色与类型对齐 TutorialMessage。 */
export interface ComposeMessage {
  readonly card: ComposeCard | null;
  readonly createdAt: string;
  readonly id: string;
  readonly role: 'agent' | 'user';
  readonly text: string;
}

/** compose 会话快照的局部投影。 */
export interface ComposeSnapshot {
  readonly chapters: readonly TutorialChapter[];
  readonly hasEarlierMessages: boolean;
  readonly knowledgeBase: TutorialKnowledgeBaseRef | null;
  readonly messages: readonly ComposeMessage[];
  readonly stage: TutorialStage | null;
  readonly status: string;
  readonly tutorialId: string;
  readonly topic: string;
}

/** 用于只读取字符串数组且容忍缺省。 */
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 用于只读取字符串或 null 字段。 */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 用于收窄教程产出知识库引用。 */
function parseKnowledgeBaseRef(value: unknown): TutorialKnowledgeBaseRef | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  return { id: value.id, kind: typeof value.kind === 'string' ? value.kind : 'normal' };
}

/** 用于收窄章节完成进度。 */
function parseProgress(value: unknown): TutorialProgress | null {
  if (!isRecord(value)) return null;
  const numbers = [value.completed, value.failed, value.total];
  if (numbers.some((item) => typeof item !== 'number')) return null;
  return {
    completed: value.completed as number,
    failed: value.failed as number,
    total: value.total as number,
  };
}

/** 用于收窄继续阅读定位。 */
function parseContinueTarget(value: unknown): TutorialContinueTarget | null {
  if (!isRecord(value)) return null;
  const { chapterTitle, documentId, knowledgeBaseId } = value;
  if (
    typeof chapterTitle !== 'string' ||
    typeof documentId !== 'string' ||
    typeof knowledgeBaseId !== 'string'
  ) {
    return null;
  }
  return { chapterTitle, documentId, knowledgeBaseId };
}

/** 用于收窄异步阶段计数。 */
function parseStage(value: unknown): TutorialStage | null {
  if (!isRecord(value)) return null;
  if (value.phase !== 'researching' && value.phase !== 'generating') return null;
  /** 用于收窄可选数值字段。 */
  const numberOrNull = (item: unknown): number | null => (typeof item === 'number' ? item : null);
  return {
    completed: numberOrNull(value.completed),
    phase: value.phase,
    sourcesGathered: numberOrNull(value.sourcesGathered),
    total: numberOrNull(value.total),
  };
}

/** 用于收窄章节列表，三视图与预览共用的唯一投影。 */
export function parseChapters(value: unknown): TutorialChapter[] {
  if (!Array.isArray(value)) return [];
  const chapters: TutorialChapter[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    chapters.push({
      attempt: typeof entry.attempt === 'number' ? entry.attempt : 0,
      dependsOn: stringList(entry.dependsOn),
      documentId: stringOrNull(entry.documentId),
      errorCode: stringOrNull(entry.errorCode),
      id: entry.id,
      nodeKey: typeof entry.nodeKey === 'string' ? entry.nodeKey : entry.id,
      status: typeof entry.status === 'string' ? entry.status : 'placeholder',
      summary: typeof entry.summary === 'string' ? entry.summary : '',
      title: typeof entry.title === 'string' ? entry.title : '',
    });
  }
  return chapters;
}

/** 用于把未知响应收窄为书架列表投影。 */
export function parseTutorialList(value: unknown): TutorialListItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: TutorialListItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.topic !== 'string')
      return undefined;
    items.push({
      continueTo: parseContinueTarget(entry.continueTo),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      id: entry.id,
      knowledgeBase: parseKnowledgeBaseRef(entry.knowledgeBase),
      progress: parseProgress(entry.progress),
      status: typeof entry.status === 'string' ? entry.status : '',
      topic: entry.topic,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    });
  }
  return items;
}

/** 用于把未知响应收窄为教程详情投影。 */
export function parseTutorialDetail(value: unknown): TutorialDetail | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined;
  return {
    chapters: parseChapters(value.chapters),
    continueTo: parseContinueTarget(value.continueTo),
    currentChapterId: stringOrNull(value.currentChapterId),
    errorCode: stringOrNull(value.errorCode),
    id: value.id,
    knowledgeBase: parseKnowledgeBaseRef(value.knowledgeBase),
    stage: parseStage(value.stage),
    status: typeof value.status === 'string' ? value.status : '',
    topic: typeof value.topic === 'string' ? value.topic : '',
    warnings: stringList(value.warnings),
  };
}

/** 用于收窄确认卡内的差异载荷。 */
function parseDiff(value: unknown): ComposeCard['diff'] {
  if (!isRecord(value) || typeof value.generationId !== 'string') return null;
  if (!Array.isArray(value.sections)) return null;
  const sections: ComposeDiffSection[] = [];
  for (const entry of value.sections) {
    if (!isRecord(entry)) continue;
    if (
      typeof entry.name !== 'string' ||
      typeof entry.before !== 'string' ||
      typeof entry.after !== 'string'
    ) {
      continue;
    }
    sections.push({ after: entry.after, before: entry.before, name: entry.name });
  }
  return { generationId: value.generationId, sections };
}

/** 用于收窄确认卡状态。 */
function parseCardState(value: unknown): ComposeCard['state'] {
  return value === 'accepted' || value === 'rejected' ? value : 'pending';
}

/** 用于收窄单条消息内的确认卡。 */
function parseCard(value: unknown): ComposeCard | null {
  if (!isRecord(value)) return null;
  if (value.variant !== 'gate' && value.variant !== 'proposal' && value.variant !== 'diff')
    return null;
  if (typeof value.title !== 'string' || typeof value.body !== 'string') return null;
  return {
    body: value.body,
    diff: parseDiff(value.diff),
    gate: value.gate === 'scope' || value.gate === 'outline' ? value.gate : null,
    proposalId: stringOrNull(value.proposalId),
    state: parseCardState(value.state),
    title: value.title,
    variant: value.variant,
  };
}

/** 用于把消息数组收窄为对话消息投影。 */
function parseMessages(value: unknown): ComposeMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ComposeMessage[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    if (entry.role !== 'user' && entry.role !== 'agent') continue;
    messages.push({
      card: parseCard(entry.card),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      id: entry.id,
      role: entry.role,
      text: typeof entry.text === 'string' ? entry.text : '',
    });
  }
  return messages;
}

/** 用于把未知响应收窄为 compose 会话快照投影。 */
export function parseComposeSnapshot(value: unknown): ComposeSnapshot | undefined {
  if (!isRecord(value) || typeof value.tutorialId !== 'string') return undefined;
  return {
    chapters: parseChapters(value.chapters),
    hasEarlierMessages: value.hasEarlierMessages === true,
    knowledgeBase: parseKnowledgeBaseRef(value.knowledgeBase),
    messages: parseMessages(value.messages),
    stage: parseStage(value.stage),
    status: typeof value.status === 'string' ? value.status : '',
    tutorialId: value.tutorialId,
    topic: typeof value.topic === 'string' ? value.topic : '',
  };
}
