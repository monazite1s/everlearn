/** @fileoverview 统一全局搜索的来源记录、路由跳转、快捷键与焦点恢复。 */

'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';

export const GLOBAL_SEARCH_TRIGGER_ID = 'global-search-trigger';
const SEARCH_ROUTE = '/search';
const SEARCH_FALLBACK_ROUTE = '/knowledge';

interface SearchSource {
  readonly href: string;
  readonly triggerId?: string | undefined;
}

interface SearchNavigationValue {
  /** 离开搜索并回到进入前的页面。 */
  readonly leaveSearch: () => void;
  /** 从稳定触发器进入搜索；已在搜索页时只聚焦输入。 */
  readonly openSearch: (triggerId?: string) => void;
}

const SearchNavigationContext = createContext<SearchNavigationValue | undefined>(undefined);

/** 用于读取包含查询参数和哈希的当前同源地址。 */
function currentHref(pathname: string): string {
  return `${pathname}${window.location.search}${window.location.hash}`;
}

/** 用于把焦点交给页面声明的搜索输入，页面尚未挂载完成时按帧重试。 */
function focusSearchInput(): void {
  const attempts = 10;
  /** 用于逐帧等待搜索输入出现后再聚焦。 */
  function attempt(remaining: number): void {
    const input = document.querySelector<HTMLElement>('[data-route-focus]');
    if (input) {
      input.focus();
      return;
    }
    if (remaining > 0) requestAnimationFrame(() => attempt(remaining - 1));
  }
  attempt(attempts);
}

/** 用于在路由稳定后按搜索来源或页面标题恢复焦点。 */
function focusRoute(pathname: string, restoreTriggerId: string | undefined): void {
  if (pathname === SEARCH_ROUTE) {
    focusSearchInput();
    return;
  }
  const trigger = restoreTriggerId ? document.getElementById(restoreTriggerId) : null;
  (trigger ?? document.querySelector<HTMLElement>('[data-page-title]'))?.focus();
}

/** 用于判断点击会在当前标签页执行普通主按钮导航。 */
function isPlainPrimaryClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** 用于从事件中解析已声明且真实指向搜索路由的稳定入口。 */
function findSearchTrigger(event: MouseEvent): HTMLElement | null {
  if (!isPlainPrimaryClick(event) || !(event.target instanceof Element)) return null;
  const element = event.target.closest<HTMLElement>('a[data-search-trigger][id]');
  const href = element?.getAttribute('href');
  if (!element || element.id === '' || !href) return null;
  return new URL(href, window.location.origin).pathname === SEARCH_ROUTE ? element : null;
}

/** 用于统一路由焦点并持续记录最后一个非搜索地址。 */
function useSearchRouteFocus(
  pathname: string,
  sourceRef: MutableRefObject<SearchSource | undefined>,
  restoreTriggerRef: MutableRefObject<string | undefined>,
): void {
  useEffect(() => {
    const restoreTriggerId = restoreTriggerRef.current;
    restoreTriggerRef.current = undefined;
    focusRoute(pathname, restoreTriggerId);
    if (pathname !== SEARCH_ROUTE) sourceRef.current = { href: currentHref(pathname) };
  }, [pathname, restoreTriggerRef, sourceRef]);
}

/** 用于捕获由页面真实链接进入搜索时的来源与触发器。 */
function useSearchSourceLinks(
  pathname: string,
  sourceRef: MutableRefObject<SearchSource | undefined>,
): void {
  useEffect(() => {
    /** 用于记录可在返回页面重新解析的稳定搜索入口。 */
    function recordSearchSource(event: MouseEvent): void {
      const element = findSearchTrigger(event);
      if (element) sourceRef.current = { href: currentHref(pathname), triggerId: element.id };
    }
    document.addEventListener('click', recordSearchSource, true);
    return /** 用于解除声明式搜索入口监听。 */ function unbindSearchSourceLinks(): void {
      document.removeEventListener('click', recordSearchSource, true);
    };
  }, [pathname, sourceRef]);
}

/** 用于把 Cmd/Ctrl+K 绑定到真实搜索路由且避开输入法组合。 */
function useSearchShortcut(openSearch: () => void): void {
  useEffect(() => {
    /** 用于处理全局搜索快捷键。 */
    function handleShortcut(event: KeyboardEvent): void {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key.toLowerCase() !== 'k' ||
        (!event.metaKey && !event.ctrlKey)
      )
        return;
      event.preventDefault();
      openSearch();
    }
    window.addEventListener('keydown', handleShortcut);
    return /** 用于解除应用壳快捷键。 */ function unbindSearchShortcut(): void {
      window.removeEventListener('keydown', handleShortcut);
    };
  }, [openSearch]);
}

/** 用于在持久 AppShell 生命周期内保存搜索来源而不受查询 replace 影响。 */
export function SearchNavigationProvider({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const sourceRef = useRef<SearchSource | undefined>(undefined);
  const restoreTriggerRef = useRef<string | undefined>(undefined);

  const openSearch = useCallback(
    /** 用于记录来源后进入搜索，或复用当前搜索输入。 */
    function openSearchFrom(triggerId = GLOBAL_SEARCH_TRIGGER_ID): void {
      if (pathname === SEARCH_ROUTE) {
        focusSearchInput();
        return;
      }
      sourceRef.current = { href: currentHref(pathname), triggerId };
      router.push(SEARCH_ROUTE);
    },
    [pathname, router],
  );
  const leaveSearch = useCallback(
    /** 用于退出搜索并安排来源触发器焦点恢复。 */
    function leaveSearchForSource(): void {
      const source = sourceRef.current;
      restoreTriggerRef.current = source?.triggerId;
      if (source) router.back();
      else router.replace(SEARCH_FALLBACK_ROUTE);
    },
    [router],
  );
  useSearchRouteFocus(pathname, sourceRef, restoreTriggerRef);
  useSearchSourceLinks(pathname, sourceRef);
  useSearchShortcut(openSearch);

  const value = useMemo(() => ({ leaveSearch, openSearch }), [leaveSearch, openSearch]);
  return <SearchNavigationContext value={value}>{children}</SearchNavigationContext>;
}

/** 用于让顶栏和搜索结果层共享唯一导航来源。 */
export function useSearchNavigation(): SearchNavigationValue {
  const value = useContext(SearchNavigationContext);
  if (!value) throw new Error('useSearchNavigation 必须在 SearchNavigationProvider 内使用。');
  return value;
}
