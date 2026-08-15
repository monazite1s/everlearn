/** @fileoverview 提供镜像卡片网格的列表加载骨架。 */

import { Card, CardContent, CardHeader, Skeleton } from '@everlearn/ui';

interface ListSkeletonProps {
  /** 骨架卡片数量。 */
  count?: number;
}

/** 用于在首次读取期间保持卡片网格布局稳定。 */
export function ListSkeleton({ count = 3 }: ListSkeletonProps) {
  return (
    <div
      aria-label="正在加载列表"
      className="grid auto-rows-min gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3"
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-2/3" />
          </CardHeader>
          <CardContent className="grid gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
