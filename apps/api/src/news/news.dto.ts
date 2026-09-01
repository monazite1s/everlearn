/**
 * @fileoverview 定义资讯模块的 HTTP 响应投影与 Worker 载荷接口。
 */

/** 订阅列表与详情的公开投影。 */
export interface NewsSubscriptionSummary {
  readonly createdAt: string;
  readonly excludeKeywords: readonly string[];
  readonly feedUrl: string;
  readonly id: string;
  readonly includeKeywords: readonly string[];
  readonly latestRunStatus: string | null;
  readonly name: string;
  readonly newsKnowledgeBaseId: string;
  readonly schedule: {
    readonly kind: 'daily' | 'weekly';
    readonly time: string;
    readonly timezone: string;
  } | null;
}

/** 简报运行投影。 */
export interface NewsDigestRunSummary {
  readonly briefDocumentId: string | null;
  readonly createdAt: string;
  readonly errorCode: string | null;
  readonly id: string;
  readonly status: string;
  readonly subscriptionId: string;
}

/** Worker 领取待执行简报运行时的载荷。 */
export interface NewsDigestDispatchItem {
  readonly seenHashes: readonly string[];
  readonly subscription: {
    readonly excludeKeywords: readonly string[];
    readonly feedUrl: string;
    readonly includeKeywords: readonly string[];
    readonly newsKnowledgeBaseId: string;
  };
  readonly runId: string;
}

/** 计划条目投影。 */
export interface NewsScheduleItem {
  readonly schedule: {
    readonly kind: 'daily' | 'weekly';
    readonly time: string;
    readonly timezone: string;
  };
  readonly subscriptionId: string;
}
