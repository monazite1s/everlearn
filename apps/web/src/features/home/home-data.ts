/** @fileoverview Defines typed static data for every documented home-page state. */

export type Loadable<T> =
  | { status: 'error'; message: string }
  | { status: 'loading' }
  | { status: 'ready'; items: readonly T[] };

export interface RecentDocument {
  href: string;
  id: string;
  knowledgeBase: string;
  path: string;
  title: string;
  updatedAt: string;
}

export interface KnowledgeBaseSummary {
  documentCount: number;
  href: string;
  id: string;
  name: string;
  updatedAt: string;
}

export interface ActiveRunSummary {
  href: string;
  id: string;
  kind: '资讯' | '教程' | 'Workflow';
  status: '等待确认' | '运行中';
  title: string;
}

export interface HomePageModel {
  isOffline: boolean;
  knowledgeBases: Loadable<KnowledgeBaseSummary>;
  recentDocuments: Loadable<RecentDocument>;
  runs: Loadable<ActiveRunSummary>;
}

const recentDocuments: readonly RecentDocument[] = [
  {
    href: '/knowledge?document=agent-runtime',
    id: 'document-agent-runtime',
    knowledgeBase: 'Agent 工程',
    path: '运行时 / 状态与检查点',
    title: '可恢复 Agent 的状态设计',
    updatedAt: '18 分钟前',
  },
  {
    href: '/knowledge?document=postgres-search',
    id: 'document-postgres-search',
    knowledgeBase: '后端基础',
    path: 'PostgreSQL / 检索',
    title: '全文搜索与向量召回的边界',
    updatedAt: '昨天',
  },
  {
    href: '/knowledge?document=reading-notes',
    id: 'document-reading-notes',
    knowledgeBase: '阅读笔记',
    path: '系统学习 / 方法',
    title: '把零散资料整理成知识路径',
    updatedAt: '3 天前',
  },
];

const knowledgeBases: readonly KnowledgeBaseSummary[] = [
  {
    documentCount: 26,
    href: '/knowledge?knowledgeBase=agent-engineering',
    id: 'agent-engineering',
    name: 'Agent 工程',
    updatedAt: '今天更新',
  },
  {
    documentCount: 41,
    href: '/knowledge?knowledgeBase=backend-foundation',
    id: 'backend-foundation',
    name: '后端基础',
    updatedAt: '昨天更新',
  },
  {
    documentCount: 18,
    href: '/knowledge?knowledgeBase=reading-notes',
    id: 'reading-notes',
    name: '阅读笔记',
    updatedAt: '3 天前更新',
  },
];

const activeRuns: readonly ActiveRunSummary[] = [
  {
    href: '/tutorials?run=distributed-systems',
    id: 'tutorial-distributed-systems',
    kind: '教程',
    status: '等待确认',
    title: '分布式系统学习路径',
  },
  {
    href: '/news?run=weekly-agent',
    id: 'digest-weekly-agent',
    kind: '资讯',
    status: '运行中',
    title: 'Agent 工程周报',
  },
];

export const readyHomeModel: HomePageModel = {
  isOffline: false,
  knowledgeBases: { items: knowledgeBases, status: 'ready' },
  recentDocuments: { items: recentDocuments, status: 'ready' },
  runs: { items: activeRuns, status: 'ready' },
};

export const homeStateFixtures = {
  empty: {
    isOffline: false,
    knowledgeBases: { items: [], status: 'ready' },
    recentDocuments: { items: [], status: 'ready' },
    runs: { items: [], status: 'ready' },
  },
  loading: {
    isOffline: false,
    knowledgeBases: { status: 'loading' },
    recentDocuments: { status: 'loading' },
    runs: { status: 'loading' },
  },
  offline: { ...readyHomeModel, isOffline: true },
  partialFailure: {
    ...readyHomeModel,
    recentDocuments: { message: '最近文档暂时无法读取。', status: 'error' },
    runs: { message: '运行状态暂时无法读取。', status: 'error' },
  },
} satisfies Record<string, HomePageModel>;
