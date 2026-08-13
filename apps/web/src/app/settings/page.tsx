/** @fileoverview Connects the settings route to its current module page. */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '设置 · Everlearn' };

const route = findWorkspaceRoute('settings');

/** Renders the independently owned settings entry page. */
export default function SettingsPage() {
  if (!route) throw new Error('Settings workspace route is not configured.');
  return <SectionPage route={route} />;
}
