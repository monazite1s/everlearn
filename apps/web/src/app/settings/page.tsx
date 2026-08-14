/** @fileoverview 将设置路由接入当前模块页面。 */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '设置 · Everlearn' };

const route = findWorkspaceRoute('settings');

/** 用于渲染独立归属的设置入口页。 */
export default function SettingsPage() {
  if (!route) throw new Error('Settings workspace route is not configured.');
  return <SectionPage route={route} />;
}
