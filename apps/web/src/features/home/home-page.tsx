/** @fileoverview Renders the knowledge-first home page from a typed view model. */

import { Button, TextInput } from '@everlearn/ui';
import Link from 'next/link';

import type {
  ActiveRunSummary,
  HomePageModel,
  KnowledgeBaseSummary,
  RecentDocument,
} from './home-data';
import { readyHomeModel } from './home-data';
import styles from './home-page.module.css';

interface HomePageProps {
  model?: HomePageModel;
}

interface ErrorStateProps {
  message: string;
  retryLabel: string;
}

/** Renders a local error with a reload-based retry until data fetching is connected. */
function ErrorState({ message, retryLabel }: ErrorStateProps) {
  return (
    <div className={styles.error} role="alert">
      <p className={styles['state-copy']}>{message}</p>
      <Link className={styles['retry-link']} href="/">
        {retryLabel}
      </Link>
    </div>
  );
}

/** Preserves section geometry while static home data is loading. */
function SectionSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="正在加载">
      <span />
      <span />
      <span />
    </div>
  );
}

/** Renders one recently opened document as a quiet reading row. */
function RecentDocumentRow(document: RecentDocument) {
  return (
    <li key={document.id}>
      <Link className={styles['row-link']} href={document.href}>
        <span className={styles['item-title']}>{document.title}</span>
        <span className={styles.meta}>
          {document.knowledgeBase} · {document.path} · {document.updatedAt}
        </span>
      </Link>
    </li>
  );
}

/** Renders recent reading, loading, empty, or local failure state. */
function RecentDocuments({ state }: { state: HomePageModel['recentDocuments'] }) {
  if (state.status === 'loading') return <SectionSkeleton />;
  if (state.status === 'error') {
    return <ErrorState message={state.message} retryLabel="重试最近文档" />;
  }
  if (state.items.length === 0) {
    return <p className={styles.empty}>还没有最近文档，从知识库开始第一次阅读。</p>;
  }
  return <ul className={styles['document-list']}>{state.items.map(RecentDocumentRow)}</ul>;
}

/** Renders one knowledge base with activity and document count. */
function KnowledgeBaseRow(knowledgeBase: KnowledgeBaseSummary) {
  return (
    <li key={knowledgeBase.id}>
      <Link
        className={`${styles['row-link']} ${styles['knowledge-link']}`}
        href={knowledgeBase.href}
      >
        <span className={styles['item-title']}>{knowledgeBase.name}</span>
        <span className={styles.meta}>
          {knowledgeBase.documentCount} 篇文档 · {knowledgeBase.updatedAt}
        </span>
      </Link>
    </li>
  );
}

/** Renders the primary knowledge-base area for all documented states. */
function KnowledgeBases({ model }: { model: HomePageModel }) {
  const state = model.knowledgeBases;
  if (state.status === 'loading') return <SectionSkeleton />;
  if (state.status === 'error') {
    return <ErrorState message={state.message} retryLabel="重试知识库" />;
  }
  if (state.items.length === 0) {
    return (
      <div className={styles['first-use']}>
        <p className={styles['state-copy']}>知识库用于长期沉淀文档、教程与资讯简报。</p>
        <Link className={styles['primary-link']} href="/knowledge?create=knowledge-base">
          创建第一个知识库
        </Link>
      </div>
    );
  }
  return <ul className={styles['knowledge-list']}>{state.items.map(KnowledgeBaseRow)}</ul>;
}

/** Keeps one page-level creation action and defers to the first-use call to action. */
function KnowledgeAction({ model }: { model: HomePageModel }) {
  const state = model.knowledgeBases;
  if (state.status === 'ready' && state.items.length === 0) return null;
  if (model.isOffline) {
    return (
      <span aria-disabled="true" className={styles['disabled-action']}>
        新建知识库
      </span>
    );
  }
  return (
    <Link className={styles['primary-link']} href="/knowledge?create=knowledge-base">
      新建知识库
    </Link>
  );
}

/** Renders one active cross-module run with text status. */
function RunRow(run: ActiveRunSummary) {
  return (
    <li key={run.id}>
      <Link className={`${styles['row-link']} ${styles['run-link']}`} href={run.href}>
        <span className={styles['run-kind']}>{run.kind}</span>
        <span className={styles['item-title']}>{run.title}</span>
        <span className={styles['run-status']}>{run.status}</span>
      </Link>
    </li>
  );
}

/** Omits empty run decoration and otherwise renders the current run state. */
function ActiveRuns({ state }: { state: HomePageModel['runs'] }) {
  if (state.status === 'loading') return <SectionSkeleton />;
  if (state.status === 'error') {
    return <ErrorState message={state.message} retryLabel="重试运行状态" />;
  }
  if (state.items.length === 0) return null;
  return <ul className={styles['run-list']}>{state.items.map(RunRow)}</ul>;
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
        <h2 id="quick-capture-title">快速记录</h2>
        <p className={styles['supporting-copy']}>纯文本或一个链接会进入 Inbox，稍后再整理。</p>
      </div>
      <div className={styles['capture-form']}>
        <TextInput disabled={disabled} label="记录内容" placeholder="写下想法或粘贴链接" />
        <Button disabled={disabled}>放入 Inbox</Button>
      </div>
    </section>
  );
}

/** Renders the complete home composition while keeping knowledge visually primary. */
export function HomePage({ model = readyHomeModel }: HomePageProps) {
  const showRuns = hasVisibleRuns(model.runs);
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Everlearn · 首页</p>
        <h1 data-page-title tabIndex={-1}>
          首页
        </h1>
        <p className={styles['header-description']}>继续最近学习，把新的资料沉淀到知识库。</p>
      </header>
      {model.isOffline && (
        <p className={styles['offline-notice']} role="status">
          当前离线：可以阅读缓存内容，新建与快速记录暂不可用。
        </p>
      )}
      <section className={styles.recent} aria-labelledby="recent-title">
        <h2 id="recent-title">继续学习</h2>
        <RecentDocuments state={model.recentDocuments} />
      </section>
      <div className={styles.columns} data-has-runs={showRuns}>
        <div className={styles['knowledge-column']}>
          <section aria-labelledby="knowledge-title">
            <div className={styles['section-heading']}>
              <div>
                <h2 id="knowledge-title">知识库</h2>
                <p className={styles['supporting-copy']}>按最近活动排序</p>
              </div>
              <KnowledgeAction model={model} />
            </div>
            <KnowledgeBases model={model} />
          </section>
          <QuickCapture disabled={model.isOffline} />
        </div>
        {showRuns && (
          <aside className={styles.runs} aria-labelledby="runs-title">
            <h2 id="runs-title">进行中</h2>
            <ActiveRuns state={model.runs} />
          </aside>
        )}
      </div>
    </article>
  );
}
