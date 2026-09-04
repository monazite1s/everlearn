/**
 * @fileoverview 提供教程会话行与公开契约之间的投影函数。
 */

import type { TutorialChapterView, TutorialOutline } from './tutorial.dto';
import type { TutorialScopeDto } from './tutorial-scope.dto';

/** 用于把 DTO 投影为会话范围列。 */
export function toScopeRow(input: TutorialScopeDto) {
  return {
    audience: input.audience,
    depth: input.depth,
    exclude_topics: input.excludeTopics,
    goals: input.goals,
    include_topics: input.includeTopics,
    kb_scope: input.knowledgeBaseIds,
    level: input.level,
    topic: input.topic,
  };
}

/** 用于把会话行投影为公开范围字段。 */
export function toScopeView(row: {
  audience: string;
  depth: string;
  exclude_topics: string[];
  goals: string;
  include_topics: string[];
  kb_scope: string[];
  level: number;
  topic: string;
}) {
  return {
    audience: row.audience,
    depth: row.depth as TutorialScopeDto['depth'],
    excludeTopics: row.exclude_topics,
    goals: row.goals,
    includeTopics: row.include_topics,
    knowledgeBaseIds: row.kb_scope,
    level: row.level,
    topic: row.topic,
  };
}

/** 用于把章节行投影为公开视图。 */
export function toChapterView(row: {
  attempt: number;
  depends_on: string[];
  document_id: string | null;
  error_code: string | null;
  id: string;
  node_key: string;
  status: string;
  title: string;
}): TutorialChapterView {
  return {
    attempt: row.attempt,
    dependsOn: row.depends_on,
    documentId: row.document_id,
    errorCode: row.error_code,
    id: row.id,
    nodeKey: row.node_key,
    status: row.status,
    title: row.title,
  };
}

/** 用于把 warnings jsonb 投影为字符串列表。 */
export function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 用于把公开大纲读取为会话行内的大纲 JSON。 */
export function readOutline(outline: unknown): TutorialOutline | null {
  return (outline as TutorialOutline | null) ?? null;
}
