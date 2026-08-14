/** @fileoverview 将资讯路由接入当前模块页面。 */

import type { Metadata } from 'next';

import { SectionPage } from '../shell/section-page';
import { findWorkspaceRoute } from '../shell/workspace-routes';

export const metadata: Metadata = { title: '资讯 · Everlearn' };

const route = findWorkspaceRoute('news');

/** 用于渲染独立归属的资讯入口页。 */
export default function NewsPage() {
  if (!route) throw new Error('News workspace route is not configured.');
  return <SectionPage route={route} />;
}
