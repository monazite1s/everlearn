/** @fileoverview 将文档编辑器路由参数接入页面组件。 */

import type { Metadata } from 'next';

import { EditorPage } from '../../../../../features/editor/editor-page';

interface DocumentEditorPageProps {
  params: Promise<{ docId: string; knowledgeBaseId: string }>;
}

/** 用于渲染指定知识库下的文档编辑器页面。 */
export default async function DocumentEditorPage({ params }: DocumentEditorPageProps) {
  const { docId, knowledgeBaseId } = await params;
  return <EditorPage docId={docId} knowledgeBaseId={knowledgeBaseId} />;
}

/** 用于让文档页继承应用标题模板。 */
export const metadata: Metadata = { title: '文档 · Everlearn' };
