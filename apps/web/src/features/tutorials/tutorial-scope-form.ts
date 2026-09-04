/**
 * @fileoverview 维护教程范围表单的受控状态与提交载荷转换。
 */

import type { CreateTutorialInput, TutorialScope } from './tutorials-api';

/** 表单受控字段的形状，主题列表以逗号分隔文本编辑。 */
export interface ScopeFormState {
  readonly audience: string;
  readonly depth: 'deep' | 'overview' | 'standard';
  readonly exclude: string;
  readonly goals: string;
  readonly include: string;
  readonly knowledgeBaseIds: readonly string[];
  readonly level: string;
  readonly topic: string;
}

export const INITIAL_SCOPE_FORM: ScopeFormState = {
  audience: '',
  depth: 'standard',
  exclude: '',
  goals: '',
  include: '',
  knowledgeBaseIds: [],
  level: '',
  topic: '',
};

/** 用于把教程范围投影回填为表单状态。 */
export function scopeToForm(scope: TutorialScope): ScopeFormState {
  return {
    audience: scope.audience,
    depth: scope.depth,
    exclude: scope.excludeTopics.join('，'),
    goals: scope.goals,
    include: scope.includeTopics.join('，'),
    knowledgeBaseIds: scope.knowledgeBaseIds,
    level: scope.level,
    topic: scope.topic,
  };
}

/** 用于把逗号分隔的主题输入解析为数组。 */
export function splitKeywords(value: string): string[] {
  return value
    .split(/[,，]/u)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

/** 用于把表单状态组装为创建或保存范围的载荷。 */
export function formToScopeInput(form: ScopeFormState): CreateTutorialInput {
  return {
    audience: form.audience.trim(),
    depth: form.depth,
    excludeTopics: splitKeywords(form.exclude),
    goals: form.goals.trim(),
    includeTopics: splitKeywords(form.include),
    knowledgeBaseIds: [...form.knowledgeBaseIds],
    level: form.level.trim(),
    topic: form.topic.trim(),
  };
}
