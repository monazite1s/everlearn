/** @fileoverview Connects a knowledge-base route to its persisted read-only destination shell. */

import type { Metadata } from 'next';

import { KnowledgeDestination } from '../../../features/knowledge/knowledge-destination';

export const metadata: Metadata = { title: '知识库 · Everlearn' };

interface KnowledgeDestinationPageProps {
  params: Promise<{ knowledgeBaseId: string }>;
}

/** Renders the real post-create destination without adding management behavior. */
export default async function KnowledgeDestinationPage({ params }: KnowledgeDestinationPageProps) {
  const { knowledgeBaseId } = await params;
  return <KnowledgeDestination knowledgeBaseId={knowledgeBaseId} />;
}
