/**
 * @fileoverview 定义业务模块唯一依赖的 Web 搜索能力接口与结果形态。
 */

/** 单条 Web 搜索结果的公开形态。 */
export interface WebSearchResult {
  /** 结果标题。 */
  readonly title: string;
  /** 结果页 URL（已规范化）。 */
  readonly url: string;
  /** 摘要或内容短摘录。 */
  readonly snippet: string;
  /** 发布时间（ISO 8601，来源缺失时为 null）。 */
  readonly publishedAt: string | null;
}

/** 一次 Web 搜索查询的输入。 */
export interface WebSearchRequest {
  /** 查询文本。 */
  readonly query: string;
  /** 期望返回条数上限（provider 可截断）。 */
  readonly maxResults?: number;
  /** 仅包含的域名（可空）。 */
  readonly includeDomains?: readonly string[];
  /** 排除的域名（可空）。 */
  readonly excludeDomains?: readonly string[];
}

/** 业务模块唯一依赖的 Web 搜索能力接口。 */
export interface WebSearchProvider {
  search(request: WebSearchRequest): Promise<readonly WebSearchResult[]>;
}
