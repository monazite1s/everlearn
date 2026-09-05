/**
 * @fileoverview 定义资讯模块的 HTTP 响应投影与 Worker 载荷接口。
 */

/** 单条订阅来源的公开投影。 */
export interface NewsSourceView {
  readonly type: 'rss' | 'search' | 'site';
  readonly value: string;
}

/** 订阅计划的公开投影。 */
export interface NewsScheduleView {
  readonly kind: 'daily' | 'weekly';
  readonly time: string;
  readonly timezone: string;
  readonly weekday: number | null;
}

/** 订阅列表与详情的公开投影。 */
export interface NewsSubscriptionSummary {
  readonly colorSlot: number;
  readonly enabled: boolean;
  readonly excludeKeywords: readonly string[];
  readonly id: string;
  readonly includeKeywords: readonly string[];
  readonly name: string;
  readonly newsKnowledgeBaseId: string;
  readonly nextRunAt: string | null;
  readonly schedule: NewsScheduleView | null;
  readonly sources: readonly NewsSourceView[];
  readonly topic: string;
  readonly version: number;
}

/** 单条来源在简报运行中的决策记录。 */
export interface NewsSourceResult {
  readonly decision: 'adopted' | 'skipped';
  readonly reason: string;
  readonly title: string;
  readonly url: string;
}

/** 简报运行投影。 */
export interface NewsDigestRunSummary {
  readonly briefDocumentId: string | null;
  readonly createdAt: string;
  readonly errorCode: string | null;
  readonly id: string;
  readonly sourceResults: readonly NewsSourceResult[];
  readonly status: string;
  readonly subscriptionId: string;
  readonly warnings: readonly string[];
}

/** Worker 领取待执行简报运行时的载荷。 */
export interface NewsDigestDispatchItem {
  /** 同订阅近期条目标题，供重要性评定对照。 */
  readonly recentItemTitles: readonly string[];
  readonly seenHashes: readonly string[];
  readonly subscription: {
    readonly excludeKeywords: readonly string[];
    readonly includeKeywords: readonly string[];
    readonly name: string;
    readonly newsKnowledgeBaseId: string;
    readonly sources: readonly NewsSourceView[];
    readonly topic: string;
  };
  readonly runId: string;
}

/** 计划条目投影。 */
export interface NewsScheduleItem {
  readonly schedule: NewsScheduleView;
  readonly subscriptionId: string;
}

/** 简报按日列表的单项投影。 */
export interface NewsDigestListItem {
  readonly digestDate: string;
  readonly documentId: string | null;
  readonly id: string;
  readonly itemCount: number;
  readonly knowledgeBaseId: string;
  readonly status: string;
  readonly title: string;
  readonly warningCount: number;
}

/** 简报按日列表的分页响应。 */
export interface NewsDigestListResponse {
  readonly items: readonly NewsDigestListItem[];
  readonly nextCursor: string | null;
}
