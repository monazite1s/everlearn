/** @fileoverview Connects the news route to its current module page. */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '资讯 · Everlearn' };

const route = findWorkspaceRoute('news');

/** Renders the independently owned news entry page. */
export default function NewsPage() {
  if (!route) throw new Error('News workspace route is not configured.');
  return <SectionPage route={route} />;
}
