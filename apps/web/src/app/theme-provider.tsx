/**
 * @fileoverview 在首次绘制前应用持久语义主题并提供主题控制。
 */

'use client';

import { EverlearnUiProvider } from '@everlearn/ui';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export const themeOptions = [
  { id: 'paper', label: '纸张棕金' },
  { id: 'neutral', label: '雾灰中性' },
] as const;
export const appearanceOptions = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
] as const;

export type ThemeId = (typeof themeOptions)[number]['id'];
export type Appearance = (typeof appearanceOptions)[number]['id'];

interface ThemeSelection {
  appearance: Appearance;
  theme: ThemeId;
}

interface ThemeContextValue extends ThemeSelection {
  colorMode: 'dark' | 'light';
  persistenceAvailable: boolean;
  setAppearance: (appearance: Appearance) => void;
  setTheme: (theme: ThemeId) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
}

interface ThemeState {
  colorMode: 'dark' | 'light';
  persistenceAvailable: boolean;
  selection: ThemeSelection;
}

const STORAGE_KEY = 'everlearn-theme';
const DEFAULT_SELECTION: ThemeSelection = { appearance: 'system', theme: 'paper' };
const DEFAULT_STATE: ThemeState = {
  colorMode: 'light',
  persistenceAvailable: true,
  selection: DEFAULT_SELECTION,
};
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const themeListeners = new Set<() => void>();
let clientState: ThemeState | undefined;

export const themeInitializer = `
(function () {
  var root = document.documentElement;
  var value = 'paper:system';
  try { value = localStorage.getItem('${STORAGE_KEY}') || value; }
  catch (error) { root.dataset.themeStorage = 'unavailable'; }
  var parts = value.split(':');
  var theme = parts[0] === 'neutral' ? 'neutral' : 'paper';
  var appearance = ['light', 'dark', 'system'].includes(parts[1]) ? parts[1] : 'system';
  var dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = theme;
  root.dataset.appearance = appearance;
  root.dataset.colorMode = dark ? 'dark' : 'light';
  root.dataset.mantineColorScheme = dark ? 'dark' : 'light';
}());`;

/** 用于解析系统外观且不假设测试环境存在 matchMedia。 */
function resolveSystemAppearance(): 'dark' | 'light' {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 用于应用语义主题属性并返回解析后的颜色模式。 */
function applyTheme(selection: ThemeSelection): 'dark' | 'light' {
  const colorMode =
    selection.appearance === 'system' ? resolveSystemAppearance() : selection.appearance;
  document.documentElement.dataset.appearance = selection.appearance;
  document.documentElement.dataset.colorMode = colorMode;
  document.documentElement.dataset.mantineColorScheme = colorMode;
  document.documentElement.dataset.theme = selection.theme;
  return colorMode;
}

/** 用于判断持久化输入是否为受支持外观。 */
function isAppearance(value: string | undefined): value is Appearance {
  return value === 'dark' || value === 'light' || value === 'system';
}

/** 用于将持久化输入解析为有效主题选择。 */
function parseThemeSelection(value: string | null): ThemeSelection {
  const [theme, appearance] = value?.split(':') ?? [];
  return {
    appearance: isAppearance(appearance) ? appearance : DEFAULT_SELECTION.appearance,
    theme: theme === 'neutral' || theme === 'paper' ? theme : DEFAULT_SELECTION.theme,
  };
}

/** 用于读取并校验紧凑本地主题偏好。 */
function readTheme(): ThemeState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE;
  }
  try {
    const selection = parseThemeSelection(localStorage.getItem(STORAGE_KEY));
    return {
      colorMode:
        selection.appearance === 'system' ? resolveSystemAppearance() : selection.appearance,
      persistenceAvailable: true,
      selection,
    };
  } catch {
    return { ...DEFAULT_STATE, persistenceAvailable: false };
  }
}

/** 用于为 React 外部存储契约返回稳定客户端快照。 */
function getClientState(): ThemeState {
  clientState ??= readTheme();
  return clientState;
}

/** 用于返回水合期间使用的确定服务端快照。 */
function getServerState(): ThemeState {
  return DEFAULT_STATE;
}

/** 用于让 React 订阅本地和其他标签页的主题变化。 */
function subscribeTheme(listener: () => void): () => void {
  /** 用于在其他标签页修改本地存储后刷新快照。 */
  function handleStorage(): void {
    clientState = readTheme();
    applyTheme(clientState.selection);
    listener();
  }
  /** 用于移除当前订阅者及跨标签页监听。 */
  function unsubscribeTheme(): void {
    themeListeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  }
  clientState = readTheme();
  themeListeners.add(listener);
  window.addEventListener('storage', handleStorage);
  return unsubscribeTheme;
}

/** 用于向所有已挂载主题订阅者发布稳定快照。 */
function publishTheme(state: ThemeState): void {
  /** 用于通知单个已挂载主题订阅者。 */
  function notifyThemeListener(listener: () => void): void {
    listener();
  }
  clientState = state;
  themeListeners.forEach(notifyThemeListener);
}

/** 用于保存有效主题偏好并返回存储是否可用。 */
function persistTheme(selection: ThemeSelection): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, `${selection.theme}:${selection.appearance}`);
    return true;
  } catch {
    return false;
  }
}

/** 用于仅在选择系统外观时监听系统颜色变化。 */
function watchSystemAppearance(selection: ThemeSelection): (() => void) | undefined {
  if (selection.appearance !== 'system' || typeof window.matchMedia !== 'function') return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  /** 用于发布新解析的系统颜色模式。 */
  function handleSystemChange(): void {
    publishTheme({ ...getClientState(), colorMode: applyTheme(selection) });
  }
  /** 用于在当前选择变化时移除媒体监听。 */
  function stopWatching(): void {
    media.removeEventListener('change', handleSystemChange);
  }
  media.addEventListener('change', handleSystemChange);
  return stopWatching;
}

/** 用于保持外部主题存储与系统外观同步。 */
function useSystemAppearance(selection: ThemeSelection): void {
  /** 用于让当前选择订阅系统外观变化。 */
  function synchronizeSystemAppearance(): (() => void) | undefined {
    return watchSystemAppearance(selection);
  }
  useEffect(synchronizeSystemAppearance, [selection]);
}

/** 用于在 React 水合前注入可信预绘制初始化器。 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />;
}

/** 用于管理持久外观状态且不向使用方暴露色值。 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const state = useSyncExternalStore(subscribeTheme, getClientState, getServerState);
  const { selection } = state;
  useSystemAppearance(selection);

  /** 用于只更新色板标识并保留外观。 */
  function setTheme(theme: ThemeId): void {
    const next = { ...selection, theme };
    publishTheme({
      colorMode: applyTheme(next),
      persistenceAvailable: persistTheme(next),
      selection: next,
    });
  }

  /** 用于更新浅色、深色或系统外观并保留色板。 */
  function setAppearance(appearance: Appearance): void {
    const next = { ...selection, appearance };
    publishTheme({
      colorMode: applyTheme(next),
      persistenceAvailable: persistTheme(next),
      selection: next,
    });
  }

  return (
    <ThemeContext
      value={{
        ...selection,
        colorMode: state.colorMode,
        persistenceAvailable: state.persistenceAvailable,
        setAppearance,
        setTheme,
      }}
    >
      <EverlearnUiProvider colorMode={state.colorMode}>{children}</EverlearnUiProvider>
    </ThemeContext>
  );
}

/** 用于返回应用根节点中的当前主题控制器。 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider.');
  return value;
}
