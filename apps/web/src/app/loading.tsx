/** @fileoverview 在路由加载期间以卡片骨架保持页面结构。 */

import { Skeleton } from '@everlearn/ui';

/** 用于在工作区路由解析期间渲染匹配布局的骨架。 */
export default function WorkspaceLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载页面"
      className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12"
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 max-w-md" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
