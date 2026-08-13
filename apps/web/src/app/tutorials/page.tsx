/** @fileoverview Connects the tutorials route to its current module page. */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '教程 · Everlearn' };

const route = findWorkspaceRoute('tutorials');

/** Renders the independently owned tutorials entry page. */
export default function TutorialsPage() {
  if (!route) throw new Error('Tutorials workspace route is not configured.');
  return <SectionPage route={route} />;
}
