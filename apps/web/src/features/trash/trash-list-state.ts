/** @fileoverview 管理回收站列表的初始同步、游标分页与服务端重读。 */

'use client';

import type { TrashItem } from '@everlearn/contracts';
import { useEffect, useState } from 'react';

import { listTrash } from './trash-api';
import type { TrashApiFailure } from './trash-api';

export interface TrashLoadState {
  readonly error?: TrashApiFailure;
  readonly loading: boolean;
  readonly nextCursor: string | null;
}

const INITIAL_LOAD: TrashLoadState = { loading: true, nextCursor: null };

/** 用于管理游标读取并在恢复确认后重读服务端事实。 */
export function useTrashList() {
  const [items, setItems] = useState<readonly TrashItem[]>([]);
  const [load, setLoad] = useState<TrashLoadState>(INITIAL_LOAD);
  useEffect(
    /** 用于启动并取消初始列表同步。 */
    function synchronizeInitialList(): () => void {
      let active = true;
      void listTrash().then(
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
  async function read(cursor?: string): Promise<readonly TrashItem[] | undefined> {
    setLoad((current) => ({ loading: true, nextCursor: current.nextCursor }));
    const result = await listTrash(cursor);
    if (!result.ok) {
      setLoad((current) => ({ ...current, error: result.error, loading: false }));
      return undefined;
    }
    setItems((current) => (cursor ? [...current, ...result.data.items] : result.data.items));
    setLoad({ loading: false, nextCursor: result.data.nextCursor });
    return result.data.items;
  }
  return { items, load, read };
}
