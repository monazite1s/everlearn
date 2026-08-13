/** @fileoverview Renders the knowledge-first home page with Mantine primitives and typed states. */

'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  AlertCircleIcon,
  BookOpenIcon,
  InboxIcon,
  LibraryIcon,
  PlusIcon,
  RefreshCwIcon,
  WifiOffIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type {
  ActiveRunSummary,
  HomePageModel,
  KnowledgeBaseSummary,
  Loadable,
  RecentDocument,
} from './home-data';
import { readyHomeModel } from './home-data';
import styles from './home-page.module.css';

interface HomePageProps {
  model?: HomePageModel;
}

interface HomeSectionHeadingProps {
  action?: ReactNode;
  description?: string;
  id: string;
  title: string;
}

interface HomeRegionStateProps<T> {
  emptyContent: ReactNode;
  retryLabel: string;
  state: Loadable<T>;
}

interface HomeSummaryCardProps {
  href: string;
  icon: ReactNode;
  meta: string;
  title: string;
}

const ICON_SIZE = 18;

/** Keeps section titles, supporting copy, and actions aligned across home regions. */
function HomeSectionHeading({ action, description, id, title }: HomeSectionHeadingProps) {
  return (
    <Group align="flex-end" className={styles['section-heading']} justify="space-between">
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
      {action}
    </Group>
  );
}

/** Renders consistent loading, failure, and empty feedback for one independent home region. */
function HomeRegionState<T>({ emptyContent, retryLabel, state }: HomeRegionStateProps<T>) {
  if (state.status === 'loading') {
    return (
      <Stack aria-label="正在加载" gap="sm" mt="md">
        {[0, 1, 2].map((index) => (
          <Skeleton height={48} key={index} radius="md" />
        ))}
      </Stack>
    );
  }
  if (state.status === 'error') {
    return (
      <Alert
        color="red"
        icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
        mt="md"
        title={state.message}
      >
        <Button
          component={Link}
          href="/"
          leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
          size="compact-sm"
          variant="light"
        >
          {retryLabel}
        </Button>
      </Alert>
    );
  }
  return state.items.length === 0 ? emptyContent : null;
}

/** Presents one document-like home destination with consistent hierarchy and focus behavior. */
function HomeSummaryCard({ href, icon, meta, title }: HomeSummaryCardProps) {
  return (
    <Card className={styles['summary-card']} component={Link} href={href} padding="md" withBorder>
      <Group align="flex-start" gap="sm" wrap="nowrap">
        <ThemeIcon aria-hidden="true" radius="md" variant="light">
          {icon}
        </ThemeIcon>
        <div className={styles['summary-copy']}>
          <Text component="span" fw={650} lineClamp={1}>
            {title}
          </Text>
          <Text c="dimmed" component="span" lineClamp={2} size="xs">
            {meta}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

/** Renders one consistent knowledge-base creation action, including offline behavior. */
function CreateKnowledgeBaseButton({ label, offline }: { label: string; offline: boolean }) {
  const icon = <PlusIcon aria-hidden="true" size={ICON_SIZE} />;
  if (offline)
    return (
      <Button disabled leftSection={icon}>
        {label}
      </Button>
    );
  return (
    <Button component={Link} href="/knowledge?create=knowledge-base" leftSection={icon}>
      {label}
    </Button>
  );
}

/** Renders one recently opened document as a quiet reading destination. */
function RecentDocumentCard(document: RecentDocument) {
  const meta = `${document.knowledgeBase} · ${document.path} · ${document.updatedAt}`;
  return (
    <li key={document.id}>
      <HomeSummaryCard
        href={document.href}
        icon={<BookOpenIcon size={ICON_SIZE} />}
        meta={meta}
        title={document.title}
      />
    </li>
  );
}

/** Renders recent reading for the ready state and delegates all other region states. */
function RecentDocuments({ state }: { state: HomePageModel['recentDocuments'] }) {
  const empty = (
    <Text c="dimmed" mt="md">
      还没有最近文档，从知识库开始第一次阅读。
    </Text>
  );
  const feedback = <HomeRegionState emptyContent={empty} retryLabel="重试最近文档" state={state} />;
  if (state.status !== 'ready' || state.items.length === 0) return feedback;
  return <ul className={styles['document-list']}>{state.items.map(RecentDocumentCard)}</ul>;
}

/** Renders one knowledge base with activity and document count. */
function KnowledgeBaseCard(knowledgeBase: KnowledgeBaseSummary) {
  const meta = `${knowledgeBase.documentCount} 篇文档 · ${knowledgeBase.updatedAt}`;
  return (
    <li key={knowledgeBase.id}>
      <HomeSummaryCard
        href={knowledgeBase.href}
        icon={<LibraryIcon size={ICON_SIZE} />}
        meta={meta}
        title={knowledgeBase.name}
      />
    </li>
  );
}

/** Renders the primary knowledge-base region for every documented data state. */
function KnowledgeBases({ model }: { model: HomePageModel }) {
  const empty = (
    <Alert
      icon={<LibraryIcon aria-hidden="true" size={ICON_SIZE} />}
      mt="md"
      title="建立你的第一个知识库"
    >
      <Text c="dimmed" mb="sm" size="sm">
        知识库用于长期沉淀文档、教程与资讯简报。
      </Text>
      <CreateKnowledgeBaseButton label="创建第一个知识库" offline={model.isOffline} />
    </Alert>
  );
  const state = model.knowledgeBases;
  const feedback = <HomeRegionState emptyContent={empty} retryLabel="重试知识库" state={state} />;
  if (state.status !== 'ready' || state.items.length === 0) return feedback;
  return <ul className={styles['knowledge-list']}>{state.items.map(KnowledgeBaseCard)}</ul>;
}

/** Keeps one page-level creation action and defers to the first-use call to action. */
function KnowledgeAction({ model }: { model: HomePageModel }) {
  const state = model.knowledgeBases;
  if (state.status === 'ready' && state.items.length === 0) return null;
  return <CreateKnowledgeBaseButton label="新建知识库" offline={model.isOffline} />;
}

/** Renders one active cross-module run with explicit kind and status. */
function RunCard(run: ActiveRunSummary) {
  return (
    <li key={run.id}>
      <Card className={styles['run-card']} component={Link} href={run.href} padding="sm" withBorder>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Badge size="sm" variant="light">
            {run.kind}
          </Badge>
          <Badge className={styles['run-status']} size="sm" variant="outline">
            {run.status}
          </Badge>
        </Group>
        <Text fw={650} mt="xs" size="sm">
          {run.title}
        </Text>
      </Card>
    </li>
  );
}

/** Omits empty run decoration and otherwise renders the current run state. */
function ActiveRuns({ state }: { state: HomePageModel['runs'] }) {
  const feedback = <HomeRegionState emptyContent={null} retryLabel="重试运行状态" state={state} />;
  if (state.status !== 'ready' || state.items.length === 0) return feedback;
  return <ul className={styles['run-list']}>{state.items.map(RunCard)}</ul>;
}

/** Reports whether the run region has content or a visible transitional state. */
function hasVisibleRuns(state: HomePageModel['runs']): boolean {
  return state.status !== 'ready' || state.items.length > 0;
}

/** Renders the desktop quick-capture affordance without performing a write. */
function QuickCapture({ disabled }: { disabled: boolean }) {
  return (
    <section className={styles['quick-capture']} aria-labelledby="quick-capture-title">
      <div>
        <HomeSectionHeading id="quick-capture-title" title="快速记录" />
        <Text c="dimmed" mt="xs" size="sm">
          纯文本或一个链接会进入 Inbox，稍后再整理。
        </Text>
      </div>
      <Group align="flex-end" className={styles['capture-form']} gap="sm" wrap="nowrap">
        <TextInput disabled={disabled} label="记录内容" placeholder="写下想法或粘贴链接" />
        <Button disabled={disabled} leftSection={<InboxIcon aria-hidden="true" size={ICON_SIZE} />}>
          放入 Inbox
        </Button>
      </Group>
    </section>
  );
}

/** Renders the complete home composition while keeping knowledge visually primary. */
export function HomePage({ model = readyHomeModel }: HomePageProps) {
  const showRuns = hasVisibleRuns(model.runs);
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
      {model.isOffline && (
        <Alert icon={<WifiOffIcon aria-hidden="true" size={ICON_SIZE} />} mt="lg" role="status">
          当前离线：可以阅读缓存内容，新建与快速记录暂不可用。
        </Alert>
      )}
      <section className={styles.recent} aria-labelledby="recent-title">
        <HomeSectionHeading id="recent-title" title="继续学习" />
        <RecentDocuments state={model.recentDocuments} />
      </section>
      <div className={styles.columns} data-has-runs={showRuns}>
        <div className={styles['knowledge-column']}>
          <section aria-labelledby="knowledge-title">
            <HomeSectionHeading
              action={<KnowledgeAction model={model} />}
              description="按最近活动排序"
              id="knowledge-title"
              title="知识库"
            />
            <KnowledgeBases model={model} />
          </section>
          <QuickCapture disabled={model.isOffline} />
        </div>
        {showRuns && (
          <aside className={styles.runs} aria-labelledby="runs-title">
            <HomeSectionHeading id="runs-title" title="进行中" />
            <ActiveRuns state={model.runs} />
          </aside>
        )}
      </div>
    </article>
  );
}
