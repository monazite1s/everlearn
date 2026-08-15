/** @fileoverview 根据真实知识库数据渲染知识优先首页。 */

'use client';

import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import {
  BookOpenIcon,
  ClockIcon,
  FileTextIcon,
  LibraryBigIcon,
  Loader2Icon,
  PlusIcon,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@everlearn/ui';

import { formatDateTime } from '../../shared/format-datetime';
import { ListSkeleton } from '../../shared/list-skeleton';
import { LoadFailure } from '../../shared/load-failure';
import { OfflineNotice } from '../../shared/offline-notice';
import { PageShell } from '../../shared/page-shell';
import { SectionCards } from '../../shared/section-cards';
import { useOnline } from '../../shared/use-online';
import { KnowledgeBaseCard } from '../knowledge/knowledge-base-card';
import { KnowledgeEmptyState } from '../knowledge/knowledge-empty-state';
import { useKnowledgeList } from '../knowledge/knowledge-list-state';
import type { KnowledgeLoadState } from '../knowledge/knowledge-list-state';

/** 用于链接统一创建流程，离线时保留禁用入口。 */
function CreateKnowledgeBaseAction({
  firstUse,
  offline,
}: {
  firstUse?: boolean;
  offline: boolean;
}) {
  const label = firstUse ? '创建第一个知识库' : '新建知识库';
  const icon = <PlusIcon aria-hidden="true" />;
  if (offline) {
    return (
      <Button disabled>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <Button asChild>
      <Link href="/knowledge?create=knowledge-base">{label}</Link>
    </Button>
  );
}

/** 用于统计当前已加载知识库的总量指标。 */
function summarizeItems(items: readonly KnowledgeBaseSummary[]) {
  const documentCount = items.reduce((total, item) => total + item.documentCount, 0);
  const latestActivity = items.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    '',
  );
  return { documentCount, latestActivity };
}

/** 用于渲染首页统计卡区块，读取未完成时不展示误导数值。 */
function HomeSectionCards({ items }: { items: readonly KnowledgeBaseSummary[] }) {
  if (items.length === 0) return null;
  const { documentCount, latestActivity } = summarizeItems(items);
  return (
    <SectionCards
      items={[
        {
          hint: '当前账号下的知识库总数',
          icon: LibraryBigIcon,
          label: '知识库',
          value: String(items.length),
        },
        {
          hint: '各知识库文档数量之和',
          icon: FileTextIcon,
          label: '文档',
          value: String(documentCount),
        },
        {
          hint: '最近一次内容更新时间',
          icon: ClockIcon,
          label: '最近活动',
          value: formatDateTime(latestActivity),
        },
      ]}
    />
  );
}

/** 用于渲染真实知识库数据并局部管理分页和失败状态。 */
function KnowledgeContent(props: {
  items: readonly KnowledgeBaseSummary[];
  load: KnowledgeLoadState;
  offline: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const { items, load, offline, onLoadMore, onRetry } = props;
  if (load.loading && items.length === 0) return <ListSkeleton />;
  if (load.error && items.length === 0)
    return (
      <LoadFailure description={load.error.message} onRetry={onRetry} title="首页知识库未加载" />
    );
  if (items.length === 0) {
    return (
      <KnowledgeEmptyState action={<CreateKnowledgeBaseAction firstUse offline={offline} />} />
    );
  }
  return (
    <>
      <ul className="mt-6 grid list-none gap-4 p-0 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <KnowledgeBaseCard knowledgeBase={item} />
          </li>
        ))}
      </ul>
      {load.error && (
        <LoadFailure description={load.error.message} onRetry={onRetry} title="首页知识库未加载" />
      )}
      {!load.error && load.nextCursor && (
        <Button className="mt-4" disabled={load.loading} onClick={onLoadMore} variant="outline">
          {load.loading && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          加载更多
        </Button>
      )}
    </>
  );
}

/** 用于渲染“继续学习”区块占位。 */
function RecentSection() {
  return (
    <section aria-labelledby="recent-title" className="py-6 md:py-8">
      <h2 className="m-0 text-title-small text-foreground" id="recent-title">
        继续学习
      </h2>
      <div className="mt-3 flex items-center gap-2 text-sm leading-6 text-muted-foreground">
        <BookOpenIcon aria-hidden="true" />
        <p className="m-0">最近打开记录将在文档阅读能力接入后显示。</p>
      </div>
    </section>
  );
}

/** 用于渲染不依赖生产夹具的完整首页组合。 */
export function HomePage() {
  const online = useOnline();
  const { items, load, read } = useKnowledgeList();
  /** 用于重试当前列表状态中的失败分页。 */
  function retry(): void {
    void read(items.length > 0 ? (load.nextCursor ?? undefined) : undefined);
  }
  /** 用于请求下一页不透明知识库游标。 */
  function loadMore(): void {
    void read(load.nextCursor ?? undefined);
  }
  return (
    <PageShell
      actions={<CreateKnowledgeBaseAction offline={!online} />}
      lead="继续最近学习，把新的资料沉淀到知识库。"
      title={
        <h1 data-page-title tabIndex={-1}>
          首页
        </h1>
      }
    >
      {!online && <OfflineNotice />}
      <HomeSectionCards items={items} />
      <RecentSection />
      <section aria-labelledby="knowledge-title" className="border-t border-border py-6 md:py-8">
        <h2 className="m-0 text-title-small text-foreground" id="knowledge-title">
          知识库
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">按最近活动排序。</p>
        <KnowledgeContent
          items={items}
          load={load}
          offline={!online}
          onLoadMore={loadMore}
          onRetry={retry}
        />
      </section>
    </PageShell>
  );
}
