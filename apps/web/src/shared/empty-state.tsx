/** @fileoverview 提供跨页面统一结构的空态区块。 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@everlearn/ui';

interface EmptyStateProps {
  /** 空态主行动。 */
  action?: ReactNode;
  /** 缺失对象说明。 */
  description: string;
  /** 视觉锚点图标。 */
  icon?: LucideIcon;
  /** 空态标题。 */
  title: string;
}

/** 用于渲染图标位加缺失对象说明加主行动的结构化空态。 */
export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  const Icon = icon;
  return (
    <Empty className="mt-4 border border-dashed border-border">
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        )}
        <EmptyTitle className="font-serif text-title-small text-foreground">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
