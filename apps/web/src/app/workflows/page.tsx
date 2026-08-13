/** @fileoverview Connects the workflows route to its current module page. */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '工作流 · Everlearn' };

const route = findWorkspaceRoute('workflows');

/** Renders the independently owned workflows entry page. */
export default function WorkflowsPage() {
  if (!route) throw new Error('Workflows workspace route is not configured.');
  return <SectionPage route={route} />;
}
