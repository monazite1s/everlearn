/** @fileoverview 将教程路由接入当前模块页面。 */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '教程 · Everlearn' };

const route = findWorkspaceRoute('tutorials');

/** 用于渲染独立归属的教程入口页。 */
export default function TutorialsPage() {
  if (!route) throw new Error('Tutorials workspace route is not configured.');
  return <SectionPage route={route} />;
}
