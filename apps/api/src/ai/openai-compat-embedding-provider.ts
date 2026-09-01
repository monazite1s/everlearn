/**
 * @fileoverview 实现 OpenAI 兼容 /embeddings 端点的向量 Provider。
 */

import type { EmbeddingEndpointConfig, EmbeddingProvider } from './embedding';
import { EMBEDDING_DIMENSIONS } from './embedding';

/** 用于调用 OpenAI 兼容 /embeddings 端点的原生 fetch 实现。 */
export class OpenAiCompatEmbeddingProvider implements EmbeddingProvider {
  /** 用于保存只读端点配置并固定超时上限。 */
  constructor(
    private readonly config: EmbeddingEndpointConfig,
    private readonly timeoutMs = 30_000,
  ) {}

  /** 用于按输入顺序批量获取向量并校验维度。 */
  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    if (texts.length === 0) return [];
    const signal = AbortSignal.timeout(this.timeoutMs);
    const url = `${this.config.baseUrl.replace(/\/+$/u, '')}/embeddings`;
    const response = await fetch(url, {
      body: JSON.stringify({ input: [...texts], model: this.config.model }),
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });
    if (!response.ok) throw new Error(`embedding endpoint responded ${response.status}`);
    const payload = (await response.json()) as {
      data?: readonly { embedding?: unknown; index?: number }[];
    };
    const data = payload.data ?? [];
    if (data.length !== texts.length) throw new Error('embedding endpoint returned wrong count');
    return data
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => {
        const embedding = item.embedding;
        if (
          !Array.isArray(embedding) ||
          embedding.length !== EMBEDDING_DIMENSIONS ||
          embedding.some((value) => typeof value !== 'number')
        )
          throw new Error('embedding vector malformed');
        return embedding as number[];
      });
  }
}
