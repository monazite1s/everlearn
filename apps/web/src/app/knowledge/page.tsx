/** @fileoverview Connects the knowledge-base route to its current module page. */

import type { Metadata } from 'next';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute } from '../workspace-routes';

export const metadata: Metadata = { title: '知识库 · Everlearn' };

const route = findWorkspaceRoute('knowledge');

/** Renders the independently owned knowledge-base entry page. */
export default function KnowledgePage() {
  if (!route) throw new Error('Knowledge workspace route is not configured.');
  return <SectionPage route={route} />;
}
