/**
 * @fileoverview 验证伪向量 Provider 的确定性与归一化约束。
 */

import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS, FakeEmbeddingProvider } from './embedding';

describe('FakeEmbeddingProvider', () => {
  it('同一文本多次调用输出完全一致的向量', async () => {
    const provider = new FakeEmbeddingProvider();
    const first = await provider.embed(['向量检索']);
    const second = await provider.embed(['向量检索']);
    expect(second).toEqual(first);
    expect(await provider.embed(['另不同文本'])).not.toEqual(first);
  });

  it('向量维度固定为 1536 且 L2 范数为 1', async () => {
    const [vector = []] = await new FakeEmbeddingProvider().embed(['hybrid recall']);
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 12);
    expect(vector.every((value) => value >= -1 && value <= 1)).toBe(true);
  });

  it('批量嵌入按输入顺序一一对应', async () => {
    const [a, b] = await new FakeEmbeddingProvider().embed(['alpha', 'beta']);
    const [single] = await new FakeEmbeddingProvider().embed(['beta']);
    expect(b).toEqual(single);
    expect(a).not.toEqual(b);
  });
});
