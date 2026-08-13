/** @fileoverview Verifies persisted theme switching without coupling to palette values. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { ThemeProvider, useTheme } from './theme-provider';

/** Clears global theme state shared by jsdom between component tests. */
function resetTheme(): void {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.appearance;
  delete document.documentElement.dataset.colorMode;
  delete document.documentElement.dataset.mantineColorScheme;
  delete document.documentElement.dataset.theme;
}

afterEach(resetTheme);

/** Exposes the theme controller through native controls for behavioral testing. */
function ThemeHarness() {
  const theme = useTheme();

  /** Chooses the neutral palette. */
  function chooseNeutral(): void {
    theme.setTheme('neutral');
  }

  /** Chooses explicit dark appearance. */
  function chooseDark(): void {
    theme.setAppearance('dark');
  }

  return (
    <>
      <output aria-label="当前外观">
        {`${theme.theme}:${theme.appearance}:${theme.colorMode}`}
      </output>
      <button type="button" onClick={chooseNeutral}>
        中性主题
      </button>
      <button type="button" onClick={chooseDark}>
        深色外观
      </button>
    </>
  );
}

/** Confirms switching changes only root attributes and a persisted preference. */
async function switchesAndPersistsTheme(): Promise<void> {
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '中性主题' }));
  fireEvent.click(screen.getByRole('button', { name: '深色外观' }));

  await waitFor(
    /** Checks the final persisted root state after both user actions. */
    () => {
      expect(document.documentElement.dataset.theme).toBe('neutral');
      expect(document.documentElement.dataset.colorMode).toBe('dark');
      expect(document.documentElement.dataset.mantineColorScheme).toBe('dark');
      expect(localStorage.getItem('everlearn-theme')).toBe('neutral:dark');
    },
  );
}

test('switches and persists semantic theme selection', switchesAndPersistsTheme);

/** Confirms stored settings become the client snapshot after hydration. */
async function loadsPersistedTheme(): Promise<void> {
  localStorage.setItem('everlearn-theme', 'neutral:dark');
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  await waitFor(
    /** Checks that the external store refreshed from browser persistence. */
    () =>
      expect(screen.getByRole('status', { name: '当前外观' })).toHaveTextContent(
        'neutral:dark:dark',
      ),
  );
}

test('loads a persisted selection after hydration', loadsPersistedTheme);
