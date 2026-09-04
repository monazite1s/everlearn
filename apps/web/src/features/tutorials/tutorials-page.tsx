/**
 * @fileoverview 渲染教程列表、新建教程表单及其加载与失败状态。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@everlearn/ui';

import { listKnowledgeBases } from '../knowledge/knowledge-api';
import type { KnowledgeApiResult } from '../knowledge/knowledge-api';
import type { KnowledgeBaseListResponse } from '@everlearn/contracts';
import { LoadFailure } from '../../shared/load-failure';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageShell } from '../../shared/page-shell';
import { TutorialCreateForm } from './tutorial-create-form';
import { listTutorials } from './tutorials-api';
import type { TutorialApiErrorCode, TutorialListItem } from './tutorials-api';
import type { ApiResult } from '../../shared/api-request';
import { TUTORIAL_STATUS_LABELS, tutorialBadgeVariant } from './tutorials-status';

interface KnowledgeBaseOption {
  readonly id: string;
  readonly name: string;
}

/** 用于持有教程页的列表数据与重读入口。 */
export function useTutorialsData() {
  const [items, setItems] = useState<TutorialListItem[] | undefined>(undefined);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  /** 用于重读教程列表并返回失败文案。 */
  const load = useCallback(async (): Promise<string | undefined> => {
    const result = await listTutorials();
    if (!result.ok) {
      setLoadError(result.error.message);
      return result.error.message;
    }
    setItems(result.data);
    setLoadError(undefined);
    return undefined;
  }, []);

  useEffect(
    /** 用于启动列表与知识库选项的初始同步。 */
    function synchronizeInitialData(): () => void {
      let active = true;

      /** 用于把一次列表读取结果安全写入状态并忽略过期响应。 */
      function applyList(result: ApiResult<TutorialListItem[], TutorialApiErrorCode>): void {
        if (!active) return;
        if (result.ok) {
          setItems(result.data);
          setLoadError(undefined);
        } else {
          setLoadError(result.error.message);
        }
      }

      void listTutorials().then(applyList);
      void listKnowledgeBases().then(
        /** 用于把知识库选项安全写入状态并忽略过期响应。 */
        function applyKnowledgeBases(result: KnowledgeApiResult<KnowledgeBaseListResponse>) {
          if (!active || !result.ok) return;
          setKnowledgeBases(result.data.items.map((item) => ({ id: item.id, name: item.name })));
        },
      );
      return /** 用于忽略卸载后的状态写入。 */ function cancel(): void {
        active = false;
      };
    },
    [],
  );

  return { knowledgeBases, items, load, loadError };
}

/** 用于渲染教程管理页。 */
export function TutorialsPage() {
  const { knowledgeBases, items, load, loadError } = useTutorialsData();
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  return (
    <PageShell
      lead="围绕知识点研究、确认大纲并生成系统教程。"
      title={
        <h1 data-page-title tabIndex={-1}>
          教程
        </h1>
      }
    >
      <TutorialCreateForm
        knowledgeBases={knowledgeBases}
        onActionError={setActionError}
        onCreated={() => void load()}
      />
      {actionError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}
      {items === undefined && loadError !== undefined && (
        <LoadFailure
          description="请检查网络后重新读取教程列表。"
          onRetry={() => void load()}
          title="无法读取教程"
        />
      )}
      {items === undefined && loadError === undefined && <ListSkeleton count={3} />}
      {items !== undefined && <TutorialList items={items} />}
    </PageShell>
  );
}

/** 用于渲染教程卡片列表。 */
function TutorialList({ items }: { items: TutorialListItem[] }) {
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">还没有教程，先用上方表单创建一个。</p>;
  }
  return (
    <ul className="mt-6 grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <a
            className="block rounded-lg border border-border transition-colors hover:bg-muted/40"
            href={`/tutorials/${item.id}`}
          >
            <Card className="border-0 shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="font-serif text-title-small">{item.topic}</CardTitle>
                <Badge variant={tutorialBadgeVariant(item.status)}>
                  {TUTORIAL_STATUS_LABELS[item.status] ?? item.status}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {describeCounts(item)}
              </CardContent>
            </Card>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** 用于描述教程的章节完成进度文案。 */
function describeCounts(item: TutorialListItem): string {
  if (item.chapterCounts === null || item.chapterCounts.total === 0) return '尚未生成章节';
  const { failed, succeeded, total } = item.chapterCounts;
  return `章节 ${succeeded}/${total} 完成${failed > 0 ? `，${failed} 章失败` : ''}`;
}
