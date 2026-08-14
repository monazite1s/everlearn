/** @fileoverview 将知识库路由接入持久化概览页面。 */

import type { Metadata } from 'next';

import { KnowledgeDestination } from '../../../features/knowledge/knowledge-destination';

export const metadata: Metadata = { title: '知识库 · Everlearn' };

interface KnowledgeDestinationPageProps {
  params: Promise<{ knowledgeBaseId: string }>;
}

/** 用于渲染创建后的真实目标页面。 */
export default async function KnowledgeDestinationPage({ params }: KnowledgeDestinationPageProps) {
  const { knowledgeBaseId } = await params;
  return <KnowledgeDestination knowledgeBaseId={knowledgeBaseId} />;
}
