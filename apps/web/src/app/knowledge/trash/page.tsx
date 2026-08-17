/** @fileoverview 将回收站路由接入真实列表与恢复功能。 */

import type { Metadata } from 'next';

import { findWorkspaceRoute, getMobileRoutePolicy, homeRoute } from '../../shell/workspace-routes';
import { TrashPage as TrashFeaturePage } from '../../../features/trash/trash-page';

export const metadata: Metadata = { title: '回收站 · Everlearn' };

/** 用于渲染统一回收站页面。 */
export default function TrashPage() {
  const knowledge = findWorkspaceRoute('knowledge') ?? homeRoute;
  return <TrashFeaturePage mobileNotice={getMobileRoutePolicy(knowledge).creationDescription} />;
}
