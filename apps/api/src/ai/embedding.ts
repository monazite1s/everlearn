/**
 * @fileoverview 定义 Embedding Provider 契约并提供确定性伪实现与环境装配。
 */

import { createHash } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import { OpenAiCompatEmbeddingProvider } from './openai-compat-embedding-provider';

/** 当前向量维度，与迁移中的 vector(1536) 一致。 */
export const EMBEDDING_DIMENSIONS = 1536;

/** 用于屏蔽上游向量服务差异的最小批量嵌入契约。 */
export interface EmbeddingProvider {
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}

/** 用于承载已校验的向量端点配置。 */
export interface EmbeddingEndpointConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

/** 用于把任意字节序列折叠为 [-1, 1) 区间的伪随机数。 */
function byteToUnitValue(byte: number): number {
  return (byte - 127.5) / 127.5;
}

/** 用于从文本哈希链推导确定性的已归一化向量。 */
function deterministicEmbedding(text: string): number[] {
  const values = new Array<number>(EMBEDDING_DIMENSIONS);
  let digest = createSha256(text);
  let filled = 0;
  while (filled < EMBEDDING_DIMENSIONS) {
    for (const byte of digest) {
      if (filled >= EMBEDDING_DIMENSIONS) break;
      values[filled] = byteToUnitValue(byte);
      filled += 1;
    }
    digest = createSha256(digest);
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / norm);
}

/** 用于同步计算 SHA-256 摘要。 */
function createSha256(input: string | Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(input).digest());
}

/** 用于提供无需网络且逐次调用稳定的测试向量。 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  /** 用于返回与文本一一对应的确定性归一化向量。 */
  embed(texts: readonly string[]): Promise<readonly number[][]> {
    return Promise.resolve(texts.map(deterministicEmbedding));
  }
}

/** 用于从进程环境解析可选向量 Provider，未完整配置时返回 undefined 触发 FTS 降级。 */
export function resolveEmbeddingProvider(
  config: ConfigService<Record<string, string>, false>,
): EmbeddingProvider | undefined {
  const model = config.get<string>('EMBEDDING_MODEL');
  const baseUrl = config.get<string>('LLM_BASE_URL');
  const apiKey = config.get<string>('LLM_API_KEY');
  if (model === undefined || baseUrl === undefined || apiKey === undefined) return undefined;
  return new OpenAiCompatEmbeddingProvider({ apiKey, baseUrl, model });
}

/** 用于把向量序列化为 PostgreSQL vector 字面量。 */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}
