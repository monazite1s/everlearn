/** @fileoverview 在 App 路由层把壳搜索导航注入 feature 结果页面。 */

'use client';

import { SearchPage } from '../../features/search/search-page';
import { useSearchNavigation } from '../shell/search-navigation';

/** 用于让搜索 feature 不反向依赖 AppShell 路由实现。 */
export function SearchRouteClient({
  initialSearchParams,
}: {
  readonly initialSearchParams: string;
}) {
  const navigation = useSearchNavigation();
  return (
    <SearchPage
      initialSearchParams={initialSearchParams}
      onLeave={() => navigation.leaveSearch()}
    />
  );
}
