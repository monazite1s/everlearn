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
    // 上游对 dimensions 参数报错时的降级：改为不带 dimensions 重试，超长向量按前缀截断。
    const payload =
      (await this.requestEmbeddings(texts, true)) ?? (await this.requestEmbeddings(texts, false));
    if (payload === null) throw new Error('embedding endpoint request failed');
    return this.parseEmbeddings(payload, texts.length);
  }

  /** 用于发起一次 embeddings 请求，非 2xx 时返回 null 交由调用方决定降级。 */
  private async requestEmbeddings(
    texts: readonly string[],
    withDimensions: boolean,
  ): Promise<readonly { embedding?: unknown; index?: number }[] | null> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const url = `${this.config.baseUrl.replace(/\/+$/u, '')}/embeddings`;
    const response = await fetch(url, {
      body: JSON.stringify({
        ...(withDimensions ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
        input: [...texts],
        model: this.config.model,
      }),
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      await response.text().catch(() => undefined);
      return null;
    }
    const payload = (await response.json()) as {
      data?: readonly { embedding?: unknown; index?: number }[];
    };
    return payload.data ?? [];
  }

  /** 用于校验返回条数与向量形态，超长向量截断到固定维度。 */
  private parseEmbeddings(
    data: readonly { embedding?: unknown; index?: number }[],
    expectedCount: number,
  ): readonly number[][] {
    if (data.length !== expectedCount) throw new Error('embedding endpoint returned wrong count');
    return data
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => {
        const embedding = item.embedding;
        if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number'))
          throw new Error('embedding vector malformed');
        if (embedding.length < EMBEDDING_DIMENSIONS) throw new Error('embedding vector malformed');
        // cosine 距离与向量幅度无关，截断前缀维度即可保持降级路径可用。
        return (embedding as number[]).slice(0, EMBEDDING_DIMENSIONS);
      });
  }
}
