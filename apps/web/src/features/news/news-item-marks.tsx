/**
 * @fileoverview 条目行的主题色点与重要性三档形状语言。
 */

import type { NewsColorSlot, NewsImportance } from './news-api';
import { cn } from '@everlearn/ui';
import { Badge } from '@everlearn/ui';

/** 主题色槽到语义 token 的静态映射，避免动态类名。 */
const TOPIC_DOT_CLASS: Record<NewsColorSlot, string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
};

const IMPORTANCE_LABEL: Record<NewsImportance, string> = { high: '高', low: '低', normal: '普通' };

/** 用于把契约色槽数安全收敛到 1..5 色点映射。 */
function toDotSlot(slot: number): NewsColorSlot {
  return slot === 2 || slot === 3 || slot === 4 || slot === 5 ? slot : 1;
}

/** 用于渲染仅装饰并对辅助技术隐藏的主题色点。 */
export function TopicDot({ className, slot }: { className?: string; slot: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', TOPIC_DOT_CLASS[toDotSlot(slot)], className)}
    />
  );
}

/** 用于渲染重要性形状与文字双通道标记：高=实心反转、中=轮廓、低=仅文字。 */
export function ImportanceMark({ importance }: { importance: NewsImportance }) {
  if (importance === 'low') {
    return <span className="sr-only">重要性：低</span>;
  }
  const filled = importance === 'high';
  return (
    <Badge
      className={filled ? 'gap-1 border-transparent bg-foreground text-background' : 'gap-1'}
      variant={filled ? 'default' : 'outline'}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rotate-45', filled ? 'bg-background' : 'border border-foreground')}
      />
      <span className="sr-only">重要性：</span>
      {IMPORTANCE_LABEL[importance]}
    </Badge>
  );
}
