/** @fileoverview 提供文档树移动组件测试共享的内存服务与请求断言工具。 */

import type { DocumentTreeItem } from '@everlearn/contracts';
import { vi } from 'vitest';

const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';

export interface ServerDocument {
  childCount: number;
  id: string;
  parentId: string | null;
  title: string;
  version: number;
}

export interface MoveRequestBody {
  afterId?: string;
  beforeId?: string;
  targetParentId?: string;
  version: number;
}

interface MoveRecord {
  fingerprint: string;
  response: unknown;
}

/** 用于返回移动场景所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于把 Fetch 输入收敛为可解析的 URL 对象。 */
export function toUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, 'http://localhost');
}

/** 用于读取请求初始化中的指定头。 */
export function headerOf(init: RequestInit | undefined, name: string): string {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.[name] ?? '';
}

/** 用于把请求体安全解析为移动输入。 */
export function parseMoveBody(init: RequestInit | undefined): MoveRequestBody {
  return typeof init?.body === 'string'
    ? (JSON.parse(init.body) as MoveRequestBody)
    : { version: -1 };
}

/** 用于返回一个文档的公开树节点投影。 */
function itemOf(document: ServerDocument): DocumentTreeItem {
  return {
    childCount: document.childCount,
    id: document.id,
    title: document.title,
    updatedAt: '2026-08-17T08:00:00.000000Z',
    version: document.version,
  };
}

/** 用于返回一个文档的公开详情投影。 */
function toDetail(document: ServerDocument): Record<string, unknown> {
  return { ...itemOf(document), knowledgeBaseId: KNOWLEDGE_BASE_ID, parentId: document.parentId };
}

/** 用于按锚点或末尾套用一次移动并重算计数。 */
function applyServerMove(
  documents: ServerDocument[],
  document: ServerDocument,
  body: MoveRequestBody,
): void {
  const target = body.targetParentId ?? null;
  documents.splice(documents.indexOf(document), 1);
  let insertAt = documents.length;
  const anchorId = body.beforeId ?? body.afterId;
  if (anchorId !== undefined) {
    const anchorIndex = documents.findIndex((candidate) => candidate.id === anchorId);
    if (anchorIndex >= 0) insertAt = body.afterId !== undefined ? anchorIndex + 1 : anchorIndex;
  } else {
    const lastSibling = documents.filter((candidate) => candidate.parentId === target).at(-1);
    if (lastSibling !== undefined) insertAt = documents.indexOf(lastSibling) + 1;
  }
  document.parentId = target;
  document.version += 1;
  documents.splice(insertAt, 0, document);
  for (const candidate of documents) {
    candidate.childCount = documents.filter((child) => child.parentId === candidate.id).length;
  }
}

/** 用于响应一次移动请求：幂等重放、版本校验与套用。 */
function respondToMove(args: {
  counter: { applied: number };
  documents: ServerDocument[];
  garbage: boolean;
  id: string;
  init: RequestInit | undefined;
  moves: Map<string, MoveRecord>;
}): Response {
  const body = parseMoveBody(args.init);
  const key = headerOf(args.init, 'Idempotency-Key');
  const fingerprint = JSON.stringify(body);
  const record = args.moves.get(key);
  if (record) {
    return record.fingerprint === fingerprint
      ? jsonResponse(record.response)
      : jsonResponse({ code: 'IDEMPOTENCY_CONFLICT', message: '重复请求不一致。' }, 409);
  }
  const document = args.documents.find((candidate) => candidate.id === args.id);
  if (!document) return jsonResponse({ code: 'NOT_FOUND', message: '不存在。' }, 404);
  if (document.version !== body.version) {
    return jsonResponse({ code: 'VERSION_CONFLICT', message: '文档已更新。' }, 409);
  }
  applyServerMove(args.documents, document, body);
  args.counter.applied += 1;
  const detail = toDetail(document);
  args.moves.set(key, { fingerprint, response: detail });
  return jsonResponse(args.garbage ? {} : detail);
}

/** 用于构造支持读取、幂等移动与可选首次响应损坏的内存文档服务。 */
export function createMoveServer(initial: readonly ServerDocument[], garbageFirstResponse = false) {
  const documents = initial.map((document) => ({ ...document }));
  const moves = new Map<string, MoveRecord>();
  const counter = { applied: 0 };
  /** 用于按方法和路径响应文档树与移动请求。 */
  function route(input: RequestInfo | URL, init?: RequestInit): Response {
    const url = toUrl(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.pathname.endsWith('/documents')) {
      const parentId = url.searchParams.get('parentId');
      return jsonResponse({
        items: documents.filter((document) => document.parentId === parentId).map(itemOf),
        nextCursor: null,
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/move')) {
      return respondToMove({
        counter,
        documents,
        garbage: garbageFirstResponse,
        id: url.pathname.split('/').at(-2) ?? '',
        init,
        moves,
      });
    }
    return jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持的操作。' }, 500);
  }
  return { counter, documents, fetchMock: vi.fn(route) };
}

/** 用于读取 Fetch 调用数组的静态类型视图。 */
export function callsOf(
  fetchMock: ReturnType<typeof vi.fn>,
): [RequestInfo | URL, RequestInit | undefined][] {
  return fetchMock.mock.calls as [RequestInfo | URL, RequestInit | undefined][];
}

/** 用于返回全部移动请求调用。 */
export function moveCallsOf(fetchMock: ReturnType<typeof vi.fn>) {
  return callsOf(fetchMock).filter(
    ([input, init]) => init?.method === 'POST' && toUrl(input).pathname.endsWith('/move'),
  );
}
