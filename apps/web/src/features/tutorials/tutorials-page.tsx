/**
 * @fileoverview 渲染教程书架列表、新建入口与加载、空、失败状态。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpenIcon } from 'lucide-react';

import { EmptyState } from '../../shared/empty-state';
import { LoadFailure } from '../../shared/load-failure';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageShell } from '../../shared/page-shell';
import { TutorialCreateDialog } from './tutorial-create-dialog';
import { TutorialShelfCard } from './tutorial-shelf-card';
import { listTutorials } from './tutorials-api';
import type { TutorialListItem } from './tutorials-contract';

/** 用于持有书架数据并提供手动重读入口。 */
export function useTutorialsData() {
  const [items, setItems] = useState<TutorialListItem[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  /** 用于重读书架列表并返回失败文案。 */
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
    /** 用于完成首屏列表读取。 */
    function synchronizeInitialList(): void {
      void listTutorials().then(
        /** 用于把首读结果写入状态。 */
        (result) => applyListResult(result, setItems, setLoadError),
      );
    },
    [],
  );

  return { items, load, loadError };
}

/** 用于把一次列表读取结果安全写入状态。 */
function applyListResult(
  result: Awaited<ReturnType<typeof listTutorials>>,
  setItems: (items: TutorialListItem[] | undefined) => void,
  setLoadError: (message: string | undefined) => void,
): void {
  if (result.ok) {
    setItems(result.data);
    setLoadError(undefined);
  } else {
    setLoadError(result.error.message);
  }
}

/** 用于渲染教程书架页。 */
export function TutorialsPage() {
  const { items, load, loadError } = useTutorialsData();
  return (
    <PageShell
      actions={<TutorialCreateDialog />}
      lead="围绕知识点研究、确认大纲并生成系统教程。"
      title={
        <h1 data-page-title tabIndex={-1}>
          教程
        </h1>
      }
    >
      {items === undefined && loadError !== undefined && (
        <LoadFailure
          description="请检查网络后重新读取教程列表。"
          onRetry={() => void load()}
          title="无法读取教程"
        />
      )}
      {items === undefined && loadError === undefined && <ListSkeleton count={3} />}
      {items !== undefined && <ShelfBody items={items} />}
    </PageShell>
  );
}

/** 用于在空列表与卡片网格之间切换书架主体。 */
function ShelfBody({ items }: { items: readonly TutorialListItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        action={<TutorialCreateDialog triggerVariant="outline" />}
        description="书架还没有教程。创建第一个教程，确认范围与大纲后会自动生成章节内容。"
        icon={BookOpenIcon}
        title="还没有教程"
      />
    );
  }
  return (
    <ul className="mt-2 grid list-none gap-4 p-0 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <TutorialShelfCard item={item} />
        </li>
      ))}
    </ul>
  );
}
