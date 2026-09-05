/** @fileoverview 定义资讯条目流与详情的公开传输契约。 */

export const NEWS_ITEMS_DEFAULT_LIMIT = 20;
export const NEWS_ITEMS_MAX_LIMIT = 100;

/** 资讯条目的来源类型。 */
export type NewsItemSourceType = 'rss' | 'search';

/** 资讯条目的重要性评级。 */
export type NewsItemImportance = 'high' | 'normal' | 'low';

/** 资讯条目流摘要投影，字段以页面规格为准。 */
export interface NewsItemSummary {
  readonly colorSlot: number;
  readonly discoveredAt: string;
  readonly id: string;
  readonly importance: NewsItemImportance;
  readonly snippet: string;
  readonly sourceType: NewsItemSourceType;
  readonly subscriptionId: string;
  readonly title: string;
  readonly topic: string;
  readonly url: string;
}

/** 资讯条目详情投影，在流投影外附处理正文、判定与发现运行。 */
export interface NewsItemDetail extends NewsItemSummary {
  readonly discoveredRunId: string | null;
  readonly processedContent: string;
  readonly relevance: 'accepted' | 'rejected';
}

/** 条目流 keyset 分页响应。 */
export interface NewsItemListResponse {
  readonly items: readonly NewsItemSummary[];
  readonly nextCursor: string | null;
}
