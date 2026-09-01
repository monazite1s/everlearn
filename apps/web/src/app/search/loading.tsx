/** @fileoverview 为搜索路由切换提供与最终页面层级一致的局部骨架。 */

import { Skeleton } from '@everlearn/ui';

import { PageShell } from '../../shared/page-shell';

/** 用于在搜索页面代码加载期间保持输入与结果区域尺寸稳定。 */
export default function SearchLoading() {
  return (
    <PageShell
      title={
        <h1 data-page-title tabIndex={-1}>
          搜索
        </h1>
      }
    >
      <div aria-label="正在加载搜索页面" className="grid gap-4" role="status">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-28 w-full" />
      </div>
    </PageShell>
  );
}
