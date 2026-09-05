/**
 * @fileoverview 验证 OpenAI 兼容向量 Provider 的请求体契约、维度校验与降级策略。
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS } from './embedding';
import { OpenAiCompatEmbeddingProvider } from './openai-compat-embedding-provider';

/** 用于构造固定维度的假向量。 */
function vectorOf(length: number): number[] {
  return Array.from({ length }, (_, index) => (index % 7) / 7 - 0.5);
}

/** 用于构造携带单条向量数据的 200 响应。 */
function okResponse(length: number): () => Response {
  return () =>
    new Response(JSON.stringify({ data: [{ embedding: vectorOf(length), index: 0 }] }), {
      status: 200,
    });
}

/** 用于按调用序列应答的 mock fetch，记录每次请求体。 */
function stubFetch(responses: (() => Response)[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return responses[Math.min(bodies.length - 1, responses.length - 1)]!();
    }),
  );
  return bodies;
}

/** 用于构造指向测试端点的 Provider。 */
function createProvider(): OpenAiCompatEmbeddingProvider {
  return new OpenAiCompatEmbeddingProvider({
    apiKey: 'k',
    baseUrl: 'https://llm.example/v1',
    model: 'embedding-3',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAiCompatEmbeddingProvider', () => {
  test('请求体显式携带 dimensions=1536 并校验返回维度', async () => {
    const bodies = stubFetch([okResponse(EMBEDDING_DIMENSIONS)]);
    const vectors = await createProvider().embed(['a']);
    expect(bodies[0]).toMatchObject({
      dimensions: EMBEDDING_DIMENSIONS,
      input: ['a'],
      model: 'embedding-3',
    });
    expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  test('上游拒绝 dimensions 参数时降级重试并截断超长向量', async () => {
    const bodies = stubFetch([
      () => new Response('unsupported', { status: 400 }),
      okResponse(2048),
    ]);
    const [vector] = await createProvider().embed(['a']);
    expect(bodies[0]).toHaveProperty('dimensions');
    expect(bodies[1]).not.toHaveProperty('dimensions');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  test('降级重试仍失败时报错', async () => {
    stubFetch([
      () => new Response('bad', { status: 401 }),
      () => new Response('bad', { status: 401 }),
    ]);
    await expect(createProvider().embed(['a'])).rejects.toThrow(/failed/u);
  });

  test('返回向量短于固定维度时报错', async () => {
    stubFetch([okResponse(1024)]);
    await expect(createProvider().embed(['a'])).rejects.toThrow(/malformed/u);
  });
});
