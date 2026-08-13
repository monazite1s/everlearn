/** @fileoverview Owns knowledge list synchronization and browser connectivity state. */

'use client';

import type { KnowledgeBaseListResponse, KnowledgeBaseSummary } from '@everlearn/contracts';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { listKnowledgeBases } from './knowledge-api';
import type { KnowledgeApiFailure, KnowledgeApiResult } from './knowledge-api';

export interface KnowledgeLoadState {
  readonly error?: KnowledgeApiFailure;
  readonly loading: boolean;
  readonly nextCursor: string | null;
}

const INITIAL_LOAD: KnowledgeLoadState = { loading: true, nextCursor: null };

/** Owns cursor reads and retains successful items when a later page fails. */
export function useKnowledgeList() {
  const [items, setItems] = useState<readonly KnowledgeBaseSummary[]>([]);
  const [load, setLoad] = useState<KnowledgeLoadState>(INITIAL_LOAD);
  /** Applies the first response without merging it into stale items. */
  function applyInitial(result: KnowledgeApiResult<KnowledgeBaseListResponse>): void {
    if (result.ok) {
      setItems(result.data.items);
      setLoad({ loading: false, nextCursor: result.data.nextCursor });
      return;
    }
    setLoad({ error: result.error, loading: false, nextCursor: null });
  }
  useEffect(
    /** Starts and cancels the initial list synchronization. */
    function synchronizeInitialList(): () => void {
      let active = true;
      void listKnowledgeBases().then(
        /** Ignores stale responses after route disposal. */
        function applyIfActive(result): void {
          if (active) applyInitial(result);
        },
      );
      return /** Marks later request completion as stale. */ function cancel(): void {
        active = false;
      };
    },
    [],
  );
  /** Reads one page and retains prior items when the request fails. */
  async function read(cursor?: string): Promise<void> {
    setLoad((current) => ({ loading: true, nextCursor: current.nextCursor }));
    const result = await listKnowledgeBases(cursor);
    if (!result.ok) {
      setLoad((current) => ({ ...current, error: result.error, loading: false }));
      return;
    }
    setItems((current) => (cursor ? [...current, ...result.data.items] : result.data.items));
    setLoad({ loading: false, nextCursor: result.data.nextCursor });
  }
  return { items, load, read };
}

/** Subscribes to paired browser connectivity changes. */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return /** Removes the paired connectivity listeners. */ function unsubscribe(): void {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Returns the current browser connectivity flag. */
function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

/** Keeps server rendering deterministic before browser hydration. */
function getServerOnlineSnapshot(): boolean {
  return true;
}

/** Exposes browser connectivity without event-listener duplication. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
}
