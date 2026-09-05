/**
 * @fileoverview 解析并生成资讯页可分享的 URL 状态（tab、过滤与条目深链）。
 */

import type { NewsImportance, NewsStreamSourceType } from './news-api';

/** 资讯页两个主 tab。 */
export type NewsTab = 'items' | 'digests';
/** 资讯页完整可恢复视图状态，可选字段允许显式清除。 */
export interface NewsView {
  readonly importance?: NewsImportance | undefined;
  readonly item?: string | undefined;
  readonly sourceType?: NewsStreamSourceType | undefined;
  readonly subscriptionId?: string | undefined;
  readonly tab: NewsTab;
}

const IMPORTANCES: readonly NewsImportance[] = ['high', 'normal', 'low'];
const SOURCE_TYPES: readonly NewsStreamSourceType[] = ['rss', 'search'];

/** 用于识别单一 UUID 查询值。 */
function uuid(value: string | null): string | undefined {
  return value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

/** 用于把 URL 查询字符串收窄为批准的视图状态。 */
export function parseNewsView(search: string): NewsView {
  const params = new URLSearchParams(search);
  const sourceType = SOURCE_TYPES.find((value) => value === params.get('sourceType'));
  const importance = IMPORTANCES.find((value) => value === params.get('importance'));
  const subscriptionId = uuid(params.get('subscriptionId'));
  const item = uuid(params.get('item'));
  return {
    tab: params.get('tab') === 'digests' ? 'digests' : 'items',
    ...(subscriptionId ? { subscriptionId } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(importance ? { importance } : {}),
    ...(item ? { item } : {}),
  };
}

/** 用于生成只含非默认值的资讯页 URL。 */
export function buildNewsHref(view: NewsView): string {
  const params = new URLSearchParams();
  if (view.tab !== 'items') params.set('tab', view.tab);
  if (view.subscriptionId) params.set('subscriptionId', view.subscriptionId);
  if (view.sourceType) params.set('sourceType', view.sourceType);
  if (view.importance) params.set('importance', view.importance);
  if (view.item) params.set('item', view.item);
  const query = params.toString();
  return query ? `/news?${query}` : '/news';
}

/** 用于比较视图是否落在同一过滤会话，驱动游标与键盘焦点的重置。 */
export function newsFiltersKey(view: NewsView): string {
  return JSON.stringify([
    view.subscriptionId ?? null,
    view.sourceType ?? null,
    view.importance ?? null,
  ]);
}
