/** @fileoverview 将工作流路由接入最小列表与运行页。 */

import type { Metadata } from 'next';

import { WorkflowsManagement } from '../../features/workflows/workflows-management';

export const metadata: Metadata = { title: '工作流 · Everlearn' };

/** 用于渲染工作流入口页。 */
export default function WorkflowsPage() {
  return <WorkflowsManagement />;
}
