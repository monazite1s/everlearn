/**
 * @fileoverview Applies a persisted semantic theme before paint and exposes theme controls.
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

/** Resolves system appearance without assuming matchMedia exists in tests. */
function resolveSystemAppearance(): 'dark' | 'light' {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies semantic theme attributes and returns the resolved color mode. */
function applyTheme(selection: ThemeSelection): 'dark' | 'light' {
  const colorMode =
    selection.appearance === 'system' ? resolveSystemAppearance() : selection.appearance;
  document.documentElement.dataset.appearance = selection.appearance;
  document.documentElement.dataset.colorMode = colorMode;
  document.documentElement.dataset.mantineColorScheme = colorMode;
  document.documentElement.dataset.theme = selection.theme;
  return colorMode;
}

/** Checks whether persisted input names a supported appearance. */
function isAppearance(value: string | undefined): value is Appearance {
  return value === 'dark' || value === 'light' || value === 'system';
}

/** Parses persisted input into a validated theme selection. */
function parseThemeSelection(value: string | null): ThemeSelection {
  const [theme, appearance] = value?.split(':') ?? [];
  return {
    appearance: isAppearance(appearance) ? appearance : DEFAULT_SELECTION.appearance,
    theme: theme === 'neutral' || theme === 'paper' ? theme : DEFAULT_SELECTION.theme,
  };
}

/** Reads and validates the compact local theme preference. */
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

/** Returns one stable client snapshot for React's external-store contract. */
function getClientState(): ThemeState {
  clientState ??= readTheme();
  return clientState;
}

/** Returns the deterministic server snapshot used during hydration. */
function getServerState(): ThemeState {
  return DEFAULT_STATE;
}

/** Subscribes React to local theme changes and changes from other tabs. */
function subscribeTheme(listener: () => void): () => void {
  /** Refreshes the snapshot after another tab changes local storage. */
  function handleStorage(): void {
    clientState = readTheme();
    applyTheme(clientState.selection);
    listener();
  }
  /** Removes this consumer and its cross-tab listener. */
  function unsubscribeTheme(): void {
    themeListeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  }
  clientState = readTheme();
  themeListeners.add(listener);
  window.addEventListener('storage', handleStorage);
  return unsubscribeTheme;
}

/** Publishes a stable snapshot to all mounted theme consumers. */
function publishTheme(state: ThemeState): void {
  /** Notifies one mounted theme consumer. */
  function notifyThemeListener(listener: () => void): void {
    listener();
  }
  clientState = state;
  themeListeners.forEach(notifyThemeListener);
}

/** Persists a validated theme preference and reports storage availability. */
function persistTheme(selection: ThemeSelection): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, `${selection.theme}:${selection.appearance}`);
    return true;
  } catch {
    return false;
  }
}

/** Watches operating-system color changes only while system appearance is selected. */
function watchSystemAppearance(selection: ThemeSelection): (() => void) | undefined {
  if (selection.appearance !== 'system' || typeof window.matchMedia !== 'function') return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  /** Publishes the newly resolved system color mode. */
  function handleSystemChange(): void {
    publishTheme({ ...getClientState(), colorMode: applyTheme(selection) });
  }
  /** Removes the media listener when the active selection changes. */
  function stopWatching(): void {
    media.removeEventListener('change', handleSystemChange);
  }
  media.addEventListener('change', handleSystemChange);
  return stopWatching;
}

/** Keeps the external theme store synchronized with operating-system appearance. */
function useSystemAppearance(selection: ThemeSelection): void {
  /** Subscribes the current selection to system appearance changes. */
  function synchronizeSystemAppearance(): (() => void) | undefined {
    return watchSystemAppearance(selection);
  }
  useEffect(synchronizeSystemAppearance, [selection]);
}

/** Injects the trusted pre-paint initializer before React hydration. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />;
}

/** Owns persisted appearance state without exposing palette values to consumers. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const state = useSyncExternalStore(subscribeTheme, getClientState, getServerState);
  const { selection } = state;
  useSystemAppearance(selection);

  /** Updates only the palette identity while preserving appearance. */
  function setTheme(theme: ThemeId): void {
    const next = { ...selection, theme };
    publishTheme({
      colorMode: applyTheme(next),
      persistenceAvailable: persistTheme(next),
      selection: next,
    });
  }

  /** Updates light, dark, or system appearance while preserving the palette. */
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

/** Returns the active theme controller within the application root. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider.');
  return value;
}
