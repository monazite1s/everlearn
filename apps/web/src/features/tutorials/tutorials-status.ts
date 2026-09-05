/**
 * @fileoverview 集中维护教程与章节状态的中文标签、徽章样式与轮询判定。
 */

/** 教程整体状态的中文标签，枚举对齐数据模型的 Tutorial 状态。 */
export const TUTORIAL_STATUS_LABELS: Record<string, string> = {
  awaiting_outline: '等待大纲确认',
  cancelled: '已取消',
  completed: '已完成',
  draft_scope: '草稿',
  failed: '失败',
  generating: '生成中',
  partial: '部分完成',
  researching: '研究中',
};

/** 章节状态的中文标签，枚举对齐数据模型的章节状态。 */
export const CHAPTER_STATUS_LABELS: Record<string, string> = {
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败',
  placeholder: '未开始',
  queued: '排队中',
  running: '生成中',
  warning: '有警告',
};

/** 用于判断教程状态徽章样式。 */
export function tutorialBadgeVariant(
  status: string,
): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (status === 'failed' || status === 'cancelled') return 'destructive';
  if (status === 'completed') return 'default';
  if (status === 'draft_scope' || status === 'awaiting_outline') return 'secondary';
  return 'outline';
}

/** 用于判断章节状态徽章样式。 */
export function chapterBadgeVariant(
  status: string,
): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (status === 'failed' || status === 'cancelled') return 'destructive';
  if (status === 'completed' || status === 'warning') return 'default';
  if (status === 'placeholder' || status === 'queued') return 'secondary';
  return 'outline';
}

/** 用于判断教程状态是否处于异步运行期需要轮询刷新。 */
export function isPollingStatus(status: string): boolean {
  return status === 'researching' || status === 'generating' || status === 'awaiting_outline';
}

/** 用于判断章节状态是否属于可进入文档阅读的完成态。 */
export function isReadableChapter(status: string): boolean {
  return status === 'completed' || status === 'warning';
}

/** 用于判断章节状态是否可发起单章重试。 */
export function isRetryableChapter(status: string): boolean {
  return status === 'failed' || status === 'cancelled';
}
