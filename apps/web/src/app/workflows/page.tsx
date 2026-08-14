/** @fileoverview 将工作流路由接入当前模块页面。 */

import type { Metadata } from 'next';

import { SectionPage } from '../shell/section-page';
import { findWorkspaceRoute } from '../shell/workspace-routes';

export const metadata: Metadata = { title: '工作流 · Everlearn' };

const route = findWorkspaceRoute('workflows');

/** 用于渲染独立归属的工作流入口页。 */
export default function WorkflowsPage() {
  if (!route) throw new Error('Workflows workspace route is not configured.');
  return <SectionPage route={route} />;
}
