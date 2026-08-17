/** @fileoverview 管理 Inbox 列表的初始同步、游标分页与本地移除。 */

'use client';

import type { InboxItemSummary } from '@everlearn/contracts';
import { useEffect, useState } from 'react';

import { listInboxItems } from './inbox-api';
import type { InboxApiFailure } from './inbox-api';

export interface InboxLoadState {
  readonly error?: InboxApiFailure;
  readonly loading: boolean;
  readonly nextCursor: string | null;
}

const INITIAL_LOAD: InboxLoadState = { loading: true, nextCursor: null };

/** 用于管理游标读取并在写入确认后维护列表。 */
export function useInboxList() {
  const [items, setItems] = useState<readonly InboxItemSummary[]>([]);
  const [load, setLoad] = useState<InboxLoadState>(INITIAL_LOAD);
  useEffect(
    /** 用于启动并取消初始列表同步。 */
    function synchronizeInitialList(): () => void {
      let active = true;
      void listInboxItems().then(
        /** 用于在路由释放后忽略过期响应。 */
        function applyIfActive(result): void {
          if (!active) return;
          if (result.ok) {
            setItems(result.data.items);
            setLoad({ loading: false, nextCursor: result.data.nextCursor });
            return;
          }
          setLoad({ error: result.error, loading: false, nextCursor: null });
        },
      );
      return /** 用于忽略组件卸载后到达的过期响应。 */ function cancel(): void {
        active = false;
      };
    },
    [],
  );
  /** 用于读取一页并在失败时保留已有结果。 */
  async function read(cursor?: string): Promise<readonly InboxItemSummary[] | undefined> {
    setLoad((current) => ({ loading: true, nextCursor: current.nextCursor }));
    const result = await listInboxItems(cursor);
    if (!result.ok) {
      setLoad((current) => ({ ...current, error: result.error, loading: false }));
      return undefined;
    }
    setItems((current) => (cursor ? [...current, ...result.data.items] : result.data.items));
    setLoad({ loading: false, nextCursor: result.data.nextCursor });
    return result.data.items;
  }
  /** 用于把服务端确认的新记录放到列表顶部。 */
  function acceptCreated(item: InboxItemSummary): void {
    setItems((current) =>
      current.some((existing) => existing.id === item.id) ? current : [item, ...current],
    );
  }
  /** 用于在删除确认后从列表移除记录。 */
  function remove(id: string): void {
    setItems((current) => current.filter((item) => item.id !== id));
  }
  return { acceptCreated, items, load, read, remove };
}
