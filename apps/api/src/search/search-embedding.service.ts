/**
 * @fileoverview 扫描缺失或过期的搜索块向量并按内容哈希幂等回填。
 */

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EmbeddingProvider } from '../ai/embedding';
import { resolveEmbeddingProvider, toVectorLiteral } from '../ai/embedding';
import { DatabaseService } from '../database/database.service';

/** 单次回填扫描的块数上限。 */
export const EMBEDDING_BACKFILL_BATCH_SIZE = 64;

/** 单次回填触发获得的闭合统计。 */
export interface SearchEmbeddingStats {
  readonly skipped: boolean;
  readonly updatedBlocks: number;
}

/** 用于执行向量回填并在 Provider 未配置时整体降级。 */
@Injectable()
export class SearchEmbeddingService {
  private provider: EmbeddingProvider | undefined | 'unconfigured';

  /** 用于注入数据库客户端、进程配置与测试专用的 Provider 覆盖。 */
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Record<string, string>, false>,
    @Optional() private readonly providerOverride?: EmbeddingProvider,
  ) {}

  /** 用于惰性解析并缓存可选向量 Provider。 */
  private resolveProvider(): EmbeddingProvider | undefined {
    if (this.providerOverride !== undefined) return this.providerOverride;
    if (this.provider === 'unconfigured') return undefined;
    const resolved = this.provider ?? resolveEmbeddingProvider(this.config);
    this.provider = resolved ?? 'unconfigured';
    return resolved;
  }

  /** 用于回填一批缺失或内容哈希不一致的块向量，未配置 Provider 时为空操作。 */
  // ponytail: Provider 未配置时回填整体静默降级，FTS 召回继续可用；
  // 引入第二个向量模型或需要并行索引时再扩展为按模型分列。
  async backfill(): Promise<SearchEmbeddingStats> {
    const provider = this.resolveProvider();
    if (provider === undefined) return { skipped: true, updatedBlocks: 0 };
    const model = this.config.getOrThrow<string>('EMBEDDING_MODEL');
    const pending = await this.database.client
      .selectFrom('search_blocks')
      .select(['id', 'text', 'content_hash'])
      .where((qb) =>
        qb.or([
          qb('embedding', 'is', null),
          qb.and([
            qb('embedding_content_hash', 'is not', null),
            qb('embedding_content_hash', '<>', qb.ref('content_hash')),
          ]),
        ]),
      )
      .orderBy('updated_at')
      .orderBy('id')
      .limit(EMBEDDING_BACKFILL_BATCH_SIZE)
      .execute();
    if (pending.length === 0) return { skipped: false, updatedBlocks: 0 };
    const vectors = await provider.embed(pending.map((row) => row.text));
    let updatedBlocks = 0;
    for (const [index, row] of pending.entries()) {
      const vector = vectors[index] ?? [];
      await this.database.client
        .updateTable('search_blocks')
        .set({
          embedding: toVectorLiteral(vector),
          embedding_content_hash: row.content_hash,
          embedding_model: model,
        })
        .where('id', '=', row.id)
        .where('content_hash', '=', row.content_hash)
        .execute();
      // ponytail: 不读回受影响行数，按批次上限逐行计数；出现并发内容竞争时以内容哈希守卫保证幂等。
      updatedBlocks += 1;
    }
    return { skipped: false, updatedBlocks };
  }
}
