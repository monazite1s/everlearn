/**
 * @fileoverview 集中维护教程与章节状态的中文标签与轮询判定。
 */

/** 教程整体状态的中文标签。 */
export const TUTORIAL_STATUS_LABELS: Record<string, string> = {
  canceled: '已取消',
  completed: '已完成',
  draft: '草稿',
  failed: '失败',
  generating: '章节生成中',
  outline_ready: '待确认大纲',
  partial: '部分完成',
  researching: '研究中',
};

/** 章节状态的中文标签。 */
export const CHAPTER_STATUS_LABELS: Record<string, string> = {
  canceled: '已取消',
  failed: '失败',
  generating: '生成中',
  pending: '待生成',
  succeeded: '已完成',
};

/** 用于判断教程状态徽章样式。 */
export function tutorialBadgeVariant(
  status: string,
): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'completed') return 'default';
  if (status === 'partial' || status === 'outline_ready' || status === 'draft') return 'secondary';
  return 'outline';
}

/** 用于判断章节状态徽章样式。 */
export function chapterBadgeVariant(
  status: string,
): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'succeeded') return 'default';
  return 'secondary';
}

/** 用于判断详情页是否需要按 5 秒轮询刷新。 */
export function isPollingStatus(status: string): boolean {
  return status === 'researching' || status === 'generating';
}
