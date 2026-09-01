/** @fileoverview 将可分享搜索参数交给客户端结果层。 */

import type { Metadata } from 'next';

import { SearchRouteClient } from './search-route-client';

export const metadata: Metadata = { title: '搜索 · Everlearn' };

interface SearchRouteProps {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}

/** 用于保留 Next 路由中的重复值，让客户端拒绝含糊的身份深链。 */
function serializeSearchParams(
  values: Record<string, string | readonly string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const entries = typeof value === 'string' ? [value] : value;
    for (const entry of entries ?? []) params.append(key, entry);
  }
  return params.toString();
}

/** 用于渲染搜索路由并支持刷新恢复筛选。 */
export default async function SearchRoute({ searchParams }: SearchRouteProps) {
  return <SearchRouteClient initialSearchParams={serializeSearchParams(await searchParams)} />;
}
