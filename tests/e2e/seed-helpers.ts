/** @fileoverview 通过真实 HTTP API 种子知识库、文档并等待搜索投影收敛。 */

import type { APIRequestContext } from '@playwright/test';

import { E2E_INTERNAL_SECRET } from './environment';

/** 收敛轮询的统一超时。 */
const CONVERGE_TIMEOUT_MS = 40_000;

/** 用于带重试地读取知识库列表，吸收代理与 API 就绪间隙。 */
async function listKnowledgeBases(
  request: APIRequestContext,
): Promise<{ items?: { id: string; name: string }[] }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await request.get('/api/v1/knowledge-bases');
    if (response.ok()) return (await response.json()) as { items?: { id: string; name: string }[] };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('knowledge base list endpoint did not become ready');
}

/** 用于删除同名知识库以保证重跑幂等（删除必须携带当前版本号）。 */
async function deleteKnowledgeBaseByName(request: APIRequestContext, name: string): Promise<void> {
  const body = await listKnowledgeBases(request);
  const items = Array.isArray(body.items)
    ? body.items
    : (body as unknown as { id: string; name: string }[]);
  for (const item of items) {
    if (item.name !== name) continue;
    const detail = await request.get(`/api/v1/knowledge-bases/${item.id}`);
    const { version } = (await detail.json()) as { version: number };
    await request.delete(`/api/v1/knowledge-bases/${item.id}`, { data: { version } });
  }
}

/** 用于按名称创建全新知识库并返回其 id。 */
export async function seedKnowledgeBase(request: APIRequestContext, name: string): Promise<string> {
  await deleteKnowledgeBaseByName(request, name);
  const response = await request.post('/api/v1/knowledge-bases', { data: { name } });
  if (!response.ok()) throw new Error(`create knowledge base failed: ${response.status()}`);
  const body = (await response.json()) as { id: string };
  return body.id;
}

/** 用于在知识库下创建文档并返回其 id。 */
export async function seedDocument(
  request: APIRequestContext,
  knowledgeBaseId: string,
  title: string,
): Promise<string> {
  const response = await request.post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`, {
    data: { title },
  });
  if (!response.ok()) throw new Error(`create document failed: ${response.status()}`);
  const body = (await response.json()) as { id: string };
  return body.id;
}

/** 用于保存带 blockId 的 Tiptap 正文并返回服务端投影。 */
export async function saveDocumentContent(
  request: APIRequestContext,
  documentId: string,
  contentJson: unknown,
): Promise<void> {
  const current = await request.get(`/api/v1/documents/${documentId}/content`);
  const detail = (await current.json()) as { version: number };
  const response = await request.patch(`/api/v1/documents/${documentId}/content`, {
    data: { contentJson, schemaVersion: 1, version: detail.version },
  });
  if (!response.ok()) throw new Error(`save content failed: ${response.status()}`);
}

/** 用于触发一次内部投影维护（事件排空 + 补偿扫描）。 */
async function triggerProjection(request: APIRequestContext): Promise<void> {
  await request.post('/api/v1/internal/search-projection', {
    headers: { 'x-purge-secret': E2E_INTERNAL_SECRET },
  });
}

/** 用于轮询搜索接口直到投影收敛且结果数量达到预期。 */
export async function waitForSearchResults(
  request: APIRequestContext,
  query: { field?: string; knowledgeBaseId?: string; minItems: number; text: string },
): Promise<void> {
  const deadline = Date.now() + CONVERGE_TIMEOUT_MS;
  const params = new URLSearchParams({ query: query.text });
  if (query.field) params.set('field', query.field);
  if (query.knowledgeBaseId) {
    params.set('knowledgeBaseId', query.knowledgeBaseId);
    params.set('scope', 'knowledgeBase');
  }
  while (Date.now() < deadline) {
    await triggerProjection(request);
    const response = await request.get(`/api/v1/search?${params.toString()}`);
    if (response.ok()) {
      const body = (await response.json()) as {
        indexStatus: string;
        items: unknown[];
      };
      if (body.indexStatus === 'ready' && body.items.length >= query.minItems) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`search projection did not converge for query "${query.text}"`);
}
