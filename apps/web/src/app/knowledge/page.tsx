/** @fileoverview 将知识库路由接入真实列表和创建功能。 */

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { KnowledgePage as KnowledgeFeaturePage } from '../../features/knowledge/knowledge-page';

export const metadata: Metadata = { title: '知识库 · Everlearn' };

/** 用于渲染知识库入口页。 */
export default function KnowledgePage() {
  return (
    <Suspense fallback={null}>
      <KnowledgeFeaturePage />
    </Suspense>
  );
}
