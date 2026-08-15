/**
 * @fileoverview 在首次绘制前应用持久外观（浅色/深色/跟随系统，ADR 002）。
 */

'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export const appearanceOptions = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
] as const;

export type Appearance = (typeof appearanceOptions)[number]['id'];

interface ThemeContextValue {
  appearance: Appearance;
  colorMode: 'dark' | 'light';
  persistenceAvailable: boolean;
  setAppearance: (appearance: Appearance) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
}

interface ThemeState {
  colorMode: 'dark' | 'light';
  persistenceAvailable: boolean;
  appearance: Appearance;
}

const STORAGE_KEY = 'everlearn-theme';
const DEFAULT_APPEARANCE: Appearance = 'system';
const DEFAULT_STATE: ThemeState = {
  colorMode: 'light',
  persistenceAvailable: true,
  appearance: DEFAULT_APPEARANCE,
};
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const themeListeners = new Set<() => void>();
let clientState: ThemeState | undefined;

export const themeInitializer = `
(function () {
  var root = document.documentElement;
  var value = 'system';
  try { value = localStorage.getItem('${STORAGE_KEY}') || value; }
  catch (error) { root.dataset.themeStorage = 'unavailable'; }
  var appearance = ['light', 'dark', 'system'].includes(value) ? value : 'system';
  var dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.appearance = appearance;
  root.dataset.colorMode = dark ? 'dark' : 'light';
  root.classList.toggle('dark', dark);
}());`;

/** 用于解析系统外观且不假设测试环境存在 matchMedia。 */
function resolveSystemAppearance(): 'dark' | 'light' {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 用于应用外观属性并返回解析后的颜色模式。 */
function applyAppearance(appearance: Appearance): 'dark' | 'light' {
  const colorMode = appearance === 'system' ? resolveSystemAppearance() : appearance;
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.dataset.colorMode = colorMode;
  document.documentElement.classList.toggle('dark', colorMode === 'dark');
  return colorMode;
}

/** 用于判断持久化输入是否为受支持外观。 */
function isAppearance(value: string | undefined): value is Appearance {
  return value === 'dark' || value === 'light' || value === 'system';
}

/** 用于读取并校验本地外观偏好。 */
function readAppearance(): ThemeState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const appearance = isAppearance(stored ?? undefined)
      ? (stored as Appearance)
      : DEFAULT_APPEARANCE;
    return {
      appearance,
      colorMode: appearance === 'system' ? resolveSystemAppearance() : appearance,
      persistenceAvailable: true,
    };
  } catch {
    return { ...DEFAULT_STATE, persistenceAvailable: false };
  }
}

/** 用于为 React 外部存储契约返回稳定客户端快照。 */
function getClientState(): ThemeState {
  clientState ??= readAppearance();
  return clientState;
}

/** 用于返回水合期间使用的确定服务端快照。 */
function getServerState(): ThemeState {
  return DEFAULT_STATE;
}

/** 用于让 React 订阅本地和其他标签页的外观变化。 */
function subscribeAppearance(listener: () => void): () => void {
  /** 用于在其他标签页修改本地存储后刷新快照。 */
  function handleStorage(): void {
    const next = readAppearance();
    clientState = { ...next, colorMode: applyAppearance(next.appearance) };
    listener();
  }
  /** 用于移除当前订阅者及跨标签页监听。 */
  function unsubscribeAppearance(): void {
    themeListeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  }
  clientState = readAppearance();
  themeListeners.add(listener);
  window.addEventListener('storage', handleStorage);
  return unsubscribeAppearance;
}

/** 用于向所有已挂载订阅者发布稳定快照。 */
function publishAppearance(state: ThemeState): void {
  /** 用于通知单个已挂载订阅者。 */
  function notifyListener(listener: () => void): void {
    listener();
  }
  clientState = state;
  themeListeners.forEach(notifyListener);
}

/** 用于保存有效外观偏好并返回存储是否可用。 */
function persistAppearance(appearance: Appearance): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, appearance);
    return true;
  } catch {
    return false;
  }
}

/** 用于仅在跟随系统时监听系统颜色变化。 */
function watchSystemAppearance(appearance: Appearance): (() => void) | undefined {
  if (appearance !== 'system' || typeof window.matchMedia !== 'function') return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  /** 用于发布新解析的系统颜色模式。 */
  function handleSystemChange(): void {
    const current = getClientState();
    publishAppearance({ ...current, colorMode: applyAppearance(current.appearance) });
  }
  /** 用于在偏好变化时移除媒体监听。 */
  function stopWatching(): void {
    media.removeEventListener('change', handleSystemChange);
  }
  media.addEventListener('change', handleSystemChange);
  return stopWatching;
}

/** 用于保持外部主题存储与系统外观同步。 */
function useSystemAppearance(appearance: Appearance): void {
  /** 用于让当前选择订阅系统外观变化。 */
  function synchronizeSystemAppearance(): (() => void) | undefined {
    return watchSystemAppearance(appearance);
  }
  useEffect(synchronizeSystemAppearance, [appearance]);
}

/** 用于在 React 水合前注入可信预绘制初始化器。 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />;
}

/** 用于管理持久外观状态且不向使用方暴露色值。 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const state = useSyncExternalStore(subscribeAppearance, getClientState, getServerState);
  const { appearance } = state;
  useSystemAppearance(appearance);

  /** 用于更新浅色、深色或跟随系统偏好。 */
  function setAppearance(next: Appearance): void {
    publishAppearance({
      appearance: next,
      colorMode: applyAppearance(next),
      persistenceAvailable: persistAppearance(next),
    });
  }

  return (
    <ThemeContext
      value={{
        appearance,
        colorMode: state.colorMode,
        persistenceAvailable: state.persistenceAvailable,
        setAppearance,
      }}
    >
      {children}
    </ThemeContext>
  );
}

/** 用于返回应用根节点中的当前外观控制器。 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider.');
  return value;
}
