/** @fileoverview Owns workspace focus and browser-persisted panel state. */

'use client';

import { useEffect, useState } from 'react';

const LEFT_PANEL_KEY = 'everlearn-left-panel-collapsed';

/** Focuses the new page title after a client-side route transition. */
export function usePageTitleFocus(pathname: string): void {
  useEffect(
    /** Moves keyboard and screen-reader context to the unique page heading. */
    function focusPageTitle(): void {
      document.querySelector<HTMLElement>('[data-page-title]')?.focus();
    },
    [pathname],
  );
}

/** Restores and persists the device-local left panel preference. */
export function usePersistedLeftPanel(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(
    /** Defers browser persistence until after the hydrated frame is stable. */
    function scheduleLeftPanelLoad(): () => void {
      /** Loads a valid local panel preference without blocking hydration. */
      function loadLeftPanel(): void {
        setCollapsed(localStorage.getItem(LEFT_PANEL_KEY) === 'true');
      }
      const timer = window.setTimeout(loadLeftPanel, 0);
      /** Cancels stale persistence work if the shell unmounts immediately. */
      function cancelLeftPanelLoad(): void {
        window.clearTimeout(timer);
      }
      return cancelLeftPanelLoad;
    },
    [],
  );

  /** Toggles and persists the left panel for this browser. */
  function toggleLeftPanel(): void {
    setCollapsed(
      /** Persists the next state derived from the current panel state. */
      function persistNextState(current): boolean {
        const next = !current;
        localStorage.setItem(LEFT_PANEL_KEY, String(next));
        return next;
      },
    );
  }
  return [collapsed, toggleLeftPanel];
}

/** Tracks the right context panel per route for the current browser session. */
export function useRouteContextPanel(pathname: string): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  useEffect(
    /** Defers route restoration until after the hydrated frame is stable. */
    function scheduleRightPanelLoad(): () => void {
      /** Restores the saved choice or applies the documented desktop default. */
      function loadRightPanel(): void {
        const stored = sessionStorage.getItem(`everlearn-right-panel:${pathname}`);
        const desktop =
          typeof window.matchMedia === 'function'
            ? window.matchMedia('(width > 1280px)').matches
            : window.innerWidth > 1280;
        setOpen(stored === null ? desktop : stored === 'true');
      }
      const timer = window.setTimeout(loadRightPanel, 0);
      /** Cancels stale route restoration when navigation changes quickly. */
      function cancelRightPanelLoad(): void {
        window.clearTimeout(timer);
      }
      return cancelRightPanelLoad;
    },
    [pathname],
  );

  /** Toggles the current route context without leaking its state to other pages. */
  function toggleRightPanel(): void {
    setOpen(
      /** Persists the next route-specific context state. */
      function persistNextState(current): boolean {
        const next = !current;
        sessionStorage.setItem(`everlearn-right-panel:${pathname}`, String(next));
        return next;
      },
    );
  }
  return [open, toggleRightPanel];
}
