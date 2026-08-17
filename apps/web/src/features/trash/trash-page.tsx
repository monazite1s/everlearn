/** @fileoverview 渲染统一回收站列表与桌面恢复能力。 */

'use client';

import { TRASH_RETENTION_DAYS } from '@everlearn/contracts';
import { useMediaQuery } from '../../shared/use-media-query';
import { useOnline } from '../../shared/use-online';
import { OfflineNotice } from '../../shared/offline-notice';
import { PageShell } from '../../shared/page-shell';
import { TrashItemList } from './trash-item-list';
import { useTrashList } from './trash-list-state';

const DESKTOP_QUERY = '(min-width: 48.0625em)';

interface TrashPageProps {
  /** 移动端能力说明，由路由层从路由策略注入。 */
  readonly mobileNotice: string;
}

/** 用于渲染支持桌面恢复与移动只读的回收站页面。 */
export function TrashPage({ mobileNotice }: TrashPageProps) {
  const online = useOnline();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { items, load, read } = useTrashList();
  /** 用于重试当前列表状态中的失败分页。 */
  function retry(): void {
    void read(items.length > 0 ? (load.nextCursor ?? undefined) : undefined);
  }
  /** 用于请求下一页不透明游标。 */
  function loadMore(): void {
    void read(load.nextCursor ?? undefined);
  }
  return (
    <PageShell
      lead={`已删除的知识库与文档保留 ${TRASH_RETENTION_DAYS} 天，期间可恢复；到期后由系统永久清理。`}
      title={
        <h1 data-page-title tabIndex={-1}>
          回收站
        </h1>
      }
    >
      {!online && (
        <OfflineNotice description="当前离线：已加载的回收站条目仍可查看，恢复暂不可用。" />
      )}
      {desktop === false && <p className="m-0 text-sm text-muted-foreground">{mobileNotice}</p>}
      <section aria-labelledby="trash-list-title" className="mt-6 grid gap-4 md:mt-8">
        <h2 className="m-0 text-title-small text-foreground" id="trash-list-title">
          已删除内容
        </h2>
        <TrashItemList
          desktop={desktop ?? false}
          items={items}
          load={load}
          offline={!online}
          onLoadMore={loadMore}
          onRestored={() => read()}
          onRetry={retry}
        />
      </section>
    </PageShell>
  );
}
