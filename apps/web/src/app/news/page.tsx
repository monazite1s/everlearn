/** @fileoverview 将资讯路由接入订阅与简报管理页。 */

import type { Metadata } from 'next';

import { NewsManagement } from '../../features/news/news-management';

export const metadata: Metadata = { title: '资讯 · Everlearn' };

/** 用于渲染资讯入口页。 */
export default function NewsPage() {
  return <NewsManagement />;
}
