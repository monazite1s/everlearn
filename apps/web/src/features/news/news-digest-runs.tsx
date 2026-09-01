/**
 * @fileoverview 渲染最近简报运行列表并链接到资讯知识库文档。
 */

'use client';

import type { NewsDigestRunItem, NewsSubscriptionItem } from './news-api';

/** 用于渲染最近简报运行列表。 */
export function DigestRuns({
  items,
  runs,
}: {
  items: NewsSubscriptionItem[] | undefined;
  runs: NewsDigestRunItem[];
}) {
  if (runs.length === 0) return null;
  return (
    <section aria-labelledby="news-runs-title" className="mt-8">
      <h2 className="m-0 text-title-small text-foreground" id="news-runs-title">
        最近简报
      </h2>
      <ul className="mt-2 grid gap-2">
        {runs.map((run) => (
          <DigestRunItem items={items} key={run.id} run={run} />
        ))}
      </ul>
    </section>
  );
}

/** 用于渲染单条简报运行及其文档链接。 */
function DigestRunItem({
  items,
  run,
}: {
  items: NewsSubscriptionItem[] | undefined;
  run: NewsDigestRunItem;
}) {
  const subscription = items?.find((item) => item.id === run.subscriptionId);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {new Date(run.createdAt).toLocaleString()} · {run.status}
        {run.errorCode !== null && `（${run.errorCode}）`}
      </span>
      {subscription !== undefined && run.briefDocumentId !== null ? (
        <a
          className="text-primary underline-offset-4 hover:underline"
          href={`/knowledge/${subscription.newsKnowledgeBaseId}/documents/${run.briefDocumentId}`}
        >
          查看简报
        </a>
      ) : null}
    </li>
  );
}
