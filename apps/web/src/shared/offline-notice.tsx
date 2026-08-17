/** @fileoverview 提供跨页面一致的离线只读状态提示。 */

'use client';

import { WifiOffIcon } from 'lucide-react';

import { Badge, cn } from '@everlearn/ui';

interface OfflineNoticeProps {
  /** 宿主自定义间距等布局差异。 */
  className?: string;
  /** 离线期间的能力说明。 */
  description?: string;
}

/** 用于渲染离线提示。 */
export function OfflineNotice({ className, description }: OfflineNoticeProps) {
  return (
    <Badge
      className={cn(
        'mt-6 w-fit gap-2 border-warning/40 bg-muted px-3 py-1 text-xs text-foreground',
        className,
      )}
      role="status"
      variant="outline"
    >
      <WifiOffIcon aria-hidden="true" />
      {description ?? '当前离线：已加载的知识库仍可查看，新建暂不可用。'}
    </Badge>
  );
}
