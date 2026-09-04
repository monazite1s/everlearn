/**
 * @fileoverview 渲染最近简报运行列表，支持页内展开来源明细与失败重试。
 */

'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@everlearn/ui';
import { AlertTriangleIcon, ChevronDownIcon, RotateCcwIcon } from 'lucide-react';

import { describeRunErrorCode } from './news-api';
import type { NewsDigestRunItem, NewsDigestSourceResult, NewsSubscriptionItem } from './news-api';

interface DigestRunsProps {
  items: NewsSubscriptionItem[] | undefined;
  onRetry: (subscriptionId: string) => void;
  pending: boolean;
  runs: NewsDigestRunItem[];
}

interface DigestRunItemProps {
  items: NewsSubscriptionItem[] | undefined;
  onRetry: (subscriptionId: string) => void;
  pending: boolean;
  run: NewsDigestRunItem;
}

/** 用于渲染最近简报运行列表。 */
export function DigestRuns({ items, onRetry, pending, runs }: DigestRunsProps) {
  if (runs.length === 0) return null;
  return (
    <section aria-labelledby="news-runs-title" className="mt-8">
      <h2 className="m-0 text-title-small text-foreground" id="news-runs-title">
        最近简报
      </h2>
      <ul className="mt-2 grid gap-2">
        {runs.map((run) => (
          <DigestRunItem items={items} key={run.id} onRetry={onRetry} pending={pending} run={run} />
        ))}
      </ul>
    </section>
  );
}

/** 用于渲染单条简报运行的摘要行。 */
function DigestRunSummary({
  expanded,
  failed,
  items,
  onExpand,
  onRetry,
  pending,
  run,
}: DigestRunItemProps & { expanded: boolean; failed: boolean; onExpand: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <button
        aria-expanded={expanded}
        aria-label="展开或收起运行详情"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onExpand}
        type="button"
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
        <span className="truncate text-muted-foreground">
          {new Date(run.createdAt).toLocaleString()} · {run.status}
        </span>
      </button>
      <div className="flex items-center gap-2">
        {failed && (
          <Button
            aria-label="重试本轮简报"
            disabled={pending}
            onClick={() => onRetry(run.subscriptionId)}
            size="sm"
            variant="outline"
          >
            <RotateCcwIcon aria-hidden="true" />
            重试
          </Button>
        )}
        <BriefLink run={run} subscription={items?.find((item) => item.id === run.subscriptionId)} />
      </div>
    </div>
  );
}

/** 用于渲染简报文档链接或其降级展示。 */
function BriefLink({
  run,
  subscription,
}: {
  run: NewsDigestRunItem;
  subscription: NewsSubscriptionItem | undefined;
}) {
  if (run.briefDocumentId === null) return null;
  if (!subscription?.newsKnowledgeBaseId) {
    return (
      <span className="text-xs text-muted-foreground">
        简报已生成，但缺少所属知识库信息，暂时无法打开链接。
      </span>
    );
  }
  return (
    <a
      className="text-primary underline-offset-4 hover:underline"
      href={`/knowledge/${subscription.newsKnowledgeBaseId}/documents/${run.briefDocumentId}`}
    >
      查看简报
    </a>
  );
}

/** 用于渲染展开后的运行详情。 */
function DigestRunDetails({ failed, run }: { failed: boolean; run: NewsDigestRunItem }) {
  return (
    <div className="grid gap-2 border-t border-border px-3 py-2">
      {failed && run.errorCode !== null && (
        <p className="m-0 text-destructive" role="alert">
          {describeRunErrorCode(run.errorCode)}
        </p>
      )}
      {run.warnings.length > 0 && (
        <Alert>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>本轮运行有告警</AlertTitle>
          <AlertDescription>
            <ul className="m-0 list-disc pl-4">
              {run.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <SourceResultList results={run.sourceResults} />
      {failed && (
        <p className="m-0 text-xs text-muted-foreground">
          重试将生成新一轮简报，不会复用本轮结果。
        </p>
      )}
    </div>
  );
}

/** 用于渲染单条简报运行及其展开详情。 */
function DigestRunItem({ items, onRetry, pending, run }: DigestRunItemProps) {
  const [expanded, setExpanded] = useState(false);
  const failed = run.status === 'failed';
  return (
    <li className="rounded-md border border-border text-sm">
      <DigestRunSummary
        expanded={expanded}
        failed={failed}
        items={items}
        onExpand={() => setExpanded((value) => !value)}
        onRetry={onRetry}
        pending={pending}
        run={run}
      />
      {expanded && <DigestRunDetails failed={failed} run={run} />}
    </li>
  );
}

/** 用于渲染来源采纳明细列表。 */
function SourceResultList({ results }: { results: readonly NewsDigestSourceResult[] }) {
  if (results.length === 0) {
    return <p className="m-0 text-xs text-muted-foreground">本轮没有来源明细。</p>;
  }
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {results.map((result) => (
        <li className="grid gap-0.5" key={`${result.url}-${result.decision}`}>
          <span className="flex items-center gap-2">
            <Badge variant={result.decision === 'adopted' ? 'default' : 'secondary'}>
              {result.decision === 'adopted' ? '✓ 已采纳' : '✗ 已跳过'}
            </Badge>
            <a
              className="truncate text-foreground underline-offset-4 hover:underline"
              href={result.url}
              rel="noreferrer"
              target="_blank"
            >
              {result.title}
            </a>
          </span>
          <span className="text-xs text-muted-foreground">{result.reason}</span>
        </li>
      ))}
    </ul>
  );
}
