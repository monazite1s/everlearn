/** @fileoverview 提供跨页面一致的离线只读状态提示。 */

'use client';

import { WifiOffIcon } from 'lucide-react';

import { Badge } from '@everlearn/ui';

/** 用于渲染离线提示。 */
export function OfflineNotice() {
  return (
    <Badge
      className="mt-6 w-fit gap-2 border-warning/40 bg-muted px-3 py-1 text-xs text-foreground"
      role="status"
      variant="outline"
    >
      <WifiOffIcon aria-hidden="true" />
      当前离线：已加载的知识库仍可查看，新建暂不可用。
    </Badge>
  );
}
