/**
 * @fileoverview 渲染资讯订阅列表、新建表单、立即运行与最近简报。
 */

'use client';

import { useState } from 'react';

import { LoadFailure } from '../../shared/load-failure';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageShell } from '../../shared/page-shell';
import { DigestRuns } from './news-digest-runs';
import { INITIAL_NEWS_FORM, SubscriptionForm } from './news-subscription-form';
import type { NewsFormState } from './news-subscription-form';
import { SubscriptionList } from './news-subscription-list';
import { useNewsActions } from './use-news-actions';
import { useNewsData } from './use-news-data';

/** 用于渲染资讯最小管理页。 */
export function NewsManagement() {
  const { items, load, loadError, runs } = useNewsData();
  const { actionError, handleCreate, handleRun, pending } = useNewsActions(load);
  const [form, setForm] = useState<NewsFormState>(INITIAL_NEWS_FORM);

  return (
    <PageShell
      lead="订阅 RSS 源，按计划或手动生成中文资讯简报到资讯知识库。"
      title={
        <h1 data-page-title tabIndex={-1}>
          资讯
        </h1>
      }
    >
      <SubscriptionForm
        form={form}
        onChange={setForm}
        onSubmit={(event) => void handleCreate(event, form)}
        pending={pending}
      />
      {actionError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}
      {items === undefined && loadError !== undefined && (
        <LoadFailure
          description="请检查网络后重新读取订阅列表。"
          onRetry={() => void load()}
          title="无法读取订阅"
        />
      )}
      {items === undefined && loadError === undefined && <ListSkeleton count={3} />}
      {items !== undefined && (
        <SubscriptionList
          items={items}
          onRun={(subscriptionId) => void handleRun(subscriptionId)}
          pending={pending}
        />
      )}
      <DigestRuns items={items} runs={runs} />
    </PageShell>
  );
}
