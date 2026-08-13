/** @fileoverview Connects the knowledge-base route to its real list and creation feature. */

import type { Metadata } from 'next';

import { KnowledgePage as KnowledgeFeaturePage } from '../../features/knowledge/knowledge-page';

export const metadata: Metadata = { title: '知识库 · Everlearn' };

/** Renders the independently owned knowledge-base entry page. */
export default function KnowledgePage() {
  return <KnowledgeFeaturePage />;
}
