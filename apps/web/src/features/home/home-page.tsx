/** @fileoverview 根据真实知识库数据渲染知识优先首页。 */

'use client';

import { Alert, Button, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { AlertCircleIcon, LibraryIcon, PlusIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react';
import Link from 'next/link';

import { KnowledgeBaseCard } from '../knowledge/knowledge-base-card';
import { useKnowledgeList, useOnline } from '../knowledge/knowledge-list-state';
import type { KnowledgeLoadState } from '../knowledge/knowledge-list-state';
import styles from './home-page.module.css';

const ICON_SIZE = 18;

/** 用于统一首页区块标题和辅助文案布局。 */
function HomeSectionHeading(props: { description?: string; id: string; title: string }) {
  const { description, id, title } = props;
  return (
    <div>
      <Title id={id} order={2}>
        {title}
      </Title>
      {description && (
        <Text c="dimmed" className={styles['supporting-copy']} size="sm">
          {description}
        </Text>
      )}
    </div>
  );
}

/** 用于在首次请求期间保持双栏知识库布局。 */
function KnowledgeLoading() {
  return (
    <Stack aria-label="正在加载首页知识库" gap="sm" mt="md">
      {[0, 1].map((index) => (
        <Skeleton height={126} key={index} radius="md" />
      ))}
    </Stack>
  );
}

/** 用于展示可局部重试的知识库读取失败。 */
function KnowledgeFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      color="red"
      icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
      mt="md"
      title="首页知识库未加载"
    >
      <Text size="sm">{message}</Text>
      <Button
        leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
        mt="sm"
        onClick={onRetry}
        size="compact-sm"
        variant="light"
      >
        重新读取
      </Button>
    </Alert>
  );
}

/** 用于链接统一创建流程，避免重复创建对话框。 */
function CreateKnowledgeBaseAction({
  firstUse,
  offline,
}: {
  firstUse?: boolean;
  offline: boolean;
}) {
  const label = firstUse ? '创建第一个知识库' : '新建知识库';
  const icon = <PlusIcon aria-hidden="true" size={ICON_SIZE} />;
  if (offline) {
    return (
      <Button className={styles['desktop-create']} disabled leftSection={icon}>
        {label}
      </Button>
    );
  }
  return (
    <Button
      className={styles['desktop-create']}
      component={Link}
      href="/knowledge?create=knowledge-base"
      leftSection={icon}
    >
      {label}
    </Button>
  );
}

/** 用于渲染真实知识库数据并局部管理分页和失败状态。 */
function KnowledgeContent(props: {
  items: ReturnType<typeof useKnowledgeList>['items'];
  load: KnowledgeLoadState;
  offline: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const { items, load, offline, onLoadMore, onRetry } = props;
  if (load.loading && items.length === 0) return <KnowledgeLoading />;
  if (load.error && items.length === 0)
    return <KnowledgeFailure message={load.error.message} onRetry={onRetry} />;
  if (items.length === 0) {
    return (
      <Alert
        icon={<LibraryIcon aria-hidden="true" size={ICON_SIZE} />}
        mt="md"
        title="建立你的第一个知识库"
      >
        <Text c="dimmed" mb="sm" size="sm">
          知识库用于长期沉淀文档、教程与资讯简报。
        </Text>
        <CreateKnowledgeBaseAction firstUse offline={offline} />
      </Alert>
    );
  }
  return (
    <>
      <ul className={styles['knowledge-list']}>
        {items.map((item) => (
          <li key={item.id}>
            <KnowledgeBaseCard knowledgeBase={item} />
          </li>
        ))}
      </ul>
      {load.error && <KnowledgeFailure message={load.error.message} onRetry={onRetry} />}
      {!load.error && load.nextCursor && (
        <Button loading={load.loading} onClick={onLoadMore} variant="subtle">
          加载更多
        </Button>
      )}
    </>
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
    <article className={styles.page}>
      <header className={styles.header}>
        <Text className={styles.eyebrow}>Everlearn · 首页</Text>
        <Title data-page-title order={1} tabIndex={-1}>
          首页
        </Title>
        <Text c="dimmed" mt="sm">
          继续最近学习，把新的资料沉淀到知识库。
        </Text>
      </header>
      {!online && (
        <Alert icon={<WifiOffIcon aria-hidden="true" size={ICON_SIZE} />} mt="lg" role="status">
          当前离线：已加载的知识库仍可查看，新建暂不可用。
        </Alert>
      )}
      <section className={styles.recent} aria-labelledby="recent-title">
        <HomeSectionHeading id="recent-title" title="继续学习" />
        <Text c="dimmed" mt="md">
          最近打开记录将在文档阅读能力接入后显示。
        </Text>
      </section>
      <section aria-labelledby="knowledge-title" className={styles.knowledge}>
        <Group align="flex-end" justify="space-between">
          <HomeSectionHeading description="按最近活动排序" id="knowledge-title" title="知识库" />
          {items.length > 0 && <CreateKnowledgeBaseAction offline={!online} />}
        </Group>
        <KnowledgeContent
          items={items}
          load={load}
          offline={!online}
          onLoadMore={loadMore}
          onRetry={retry}
        />
      </section>
    </article>
  );
}
