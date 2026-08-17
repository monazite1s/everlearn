/** @fileoverview 渲染 Inbox 快速记录与待处理记录组合页。 */

'use client';

import type { InboxItemSummary } from '@everlearn/contracts';
import { useRef } from 'react';
import type { RefObject } from 'react';

import { OfflineNotice } from '../../shared/offline-notice';
import { PageShell } from '../../shared/page-shell';
import { useMediaQuery } from '../../shared/use-media-query';
import { useOnline } from '../../shared/use-online';
import { InboxItemList } from './inbox-item-list';
import { InboxRecordForm } from './inbox-record-form';
import { useInboxList } from './inbox-list-state';

const DESKTOP_QUERY = '(min-width: 48.0625em)';

interface RecordSectionProps {
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly offline: boolean;
  readonly onCreated: (item: InboxItemSummary) => void;
  readonly onUncertainOutcome: () => Promise<void>;
}

/** 用于渲染桌面端快速记录区块。 */
function InboxRecordSection(props: RecordSectionProps) {
  return (
    <section aria-labelledby="inbox-record-title" className="grid gap-4 pb-2">
      <h2 className="m-0 text-title-small text-foreground" id="inbox-record-title">
        快速记录
      </h2>
      <InboxRecordForm
        inputRef={props.inputRef}
        offline={props.offline}
        onCreated={props.onCreated}
        onUncertainOutcome={props.onUncertainOutcome}
      />
    </section>
  );
}

interface ListSectionProps {
  readonly desktop: boolean;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly list: ReturnType<typeof useInboxList>;
  readonly offline: boolean;
}

/** 用于渲染待处理记录区块并处理分页与删除恢复。 */
function InboxListSection(props: ListSectionProps) {
  const { desktop, inputRef, list, offline } = props;
  /** 用于重试当前列表状态中的失败分页。 */
  function retry(): void {
    void list.read(list.items.length > 0 ? (list.load.nextCursor ?? undefined) : undefined);
  }
  /** 用于请求下一页不透明游标。 */
  function loadMore(): void {
    void list.read(list.load.nextCursor ?? undefined);
  }
  return (
    <section aria-labelledby="inbox-list-title" className="mt-6 grid gap-4 md:mt-8">
      <h2 className="m-0 text-title-small text-foreground" id="inbox-list-title">
        待处理记录
      </h2>
      <InboxItemList
        desktop={desktop}
        inputRef={inputRef}
        items={list.items}
        load={list.load}
        offline={offline}
        onLoadMore={loadMore}
        onRemoved={list.remove}
        onResync={() => list.read()}
        onRetry={retry}
      />
    </section>
  );
}

interface InboxPageProps {
  /** 移动端能力说明，由路由层从路由策略注入。 */
  readonly mobileNotice: string;
}

/** 用于渲染支持桌面记录与移动只读的 Inbox 页面。 */
export function InboxPage({ mobileNotice }: InboxPageProps) {
  const online = useOnline();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const list = useInboxList();
  /** 用于在写入结果不确定后重读第一页。 */
  async function resync(): Promise<void> {
    await list.read();
  }
  return (
    <PageShell
      lead="未归档的快速记录：先存下来，之后再整理进知识库。"
      title={
        <h1 data-page-title tabIndex={-1}>
          Inbox
        </h1>
      }
    >
      {!online && (
        <OfflineNotice description="当前离线：已加载的记录仍可查看，记录与删除暂不可用。" />
      )}
      {desktop === false && <p className="m-0 text-sm text-muted-foreground">{mobileNotice}</p>}
      {desktop && (
        <InboxRecordSection
          inputRef={inputRef}
          offline={!online}
          onCreated={list.acceptCreated}
          onUncertainOutcome={resync}
        />
      )}
      <InboxListSection
        desktop={desktop ?? false}
        inputRef={inputRef}
        list={list}
        offline={!online}
      />
    </PageShell>
  );
}
