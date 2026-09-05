/** @fileoverview 将资讯路由的可分享查询参数交给客户端页面。 */

import type { Metadata } from 'next';

import { NewsPage } from '../../features/news/news-page';

export const metadata: Metadata = { title: '资讯 · Everlearn' };

interface NewsRouteProps {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}

/** 用于保留重复查询值，让客户端拒绝含糊的深链身份。 */
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

/** 用于渲染资讯路由并支持刷新与分享恢复视图。 */
export default async function NewsRoute({ searchParams }: NewsRouteProps) {
  return <NewsPage initialSearchParams={serializeSearchParams(await searchParams)} />;
}
