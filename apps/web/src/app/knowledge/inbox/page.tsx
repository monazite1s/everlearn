/** @fileoverview 将 Inbox 路由接入真实记录与列表功能。 */

import type { Metadata } from 'next';

import { findWorkspaceRoute, getMobileRoutePolicy, homeRoute } from '../../shell/workspace-routes';
import { InboxPage as InboxFeaturePage } from '../../../features/inbox/inbox-page';

export const metadata: Metadata = { title: 'Inbox · Everlearn' };

/** 用于渲染 Inbox 快速记录页。 */
export default function InboxPage() {
  const knowledge = findWorkspaceRoute('knowledge') ?? homeRoute;
  return <InboxFeaturePage mobileNotice={getMobileRoutePolicy(knowledge).creationDescription} />;
}
