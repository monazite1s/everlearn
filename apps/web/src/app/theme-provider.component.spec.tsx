/** @fileoverview 验证不耦合色值的持久外观切换。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { ThemeProvider, useTheme } from './theme-provider';

/** 用于清理组件测试间由 jsdom 共享的全局主题状态。 */
function resetTheme(): void {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.appearance;
  delete document.documentElement.dataset.colorMode;
  document.documentElement.classList.remove('dark');
}

afterEach(resetTheme);

/** 用于通过原生控件公开外观控制器以便行为测试。 */
function ThemeHarness() {
  const theme = useTheme();

  /** 用于选择明确深色外观。 */
  function chooseDark(): void {
    theme.setAppearance('dark');
  }

  /** 用于恢复明确浅色外观。 */
  function chooseLight(): void {
    theme.setAppearance('light');
  }

  return (
    <>
      <output aria-label="当前外观">{`${theme.appearance}:${theme.colorMode}`}</output>
      <button type="button" onClick={chooseDark}>
        深色外观
      </button>
      <button type="button" onClick={chooseLight}>
        浅色外观
      </button>
    </>
  );
}

/** 用于验证切换只修改根属性和持久化偏好。 */
async function switchesAndPersistsAppearance(): Promise<void> {
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '深色外观' }));

  await waitFor(
    /** 用于检查用户操作后的最终持久化根状态。 */
    () => {
      expect(document.documentElement.dataset.appearance).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('everlearn-theme')).toBe('dark');
    },
  );
}

test('switches and persists semantic appearance selection', switchesAndPersistsAppearance);

/** 用于验证水合后存储设置成为客户端快照。 */
async function loadsPersistedAppearance(): Promise<void> {
  localStorage.setItem('everlearn-theme', 'dark');
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  await waitFor(
    /** 用于检查外部存储已根据浏览器持久化刷新。 */
    () => expect(screen.getByRole('status', { name: '当前外观' })).toHaveTextContent('dark:dark'),
  );
}

test('loads a persisted selection after hydration', loadsPersistedAppearance);

/** 用于验证切回浅色时移除根节点 dark class。 */
async function removesDarkClassOnLightAppearance(): Promise<void> {
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '深色外观' }));
  fireEvent.click(screen.getByRole('button', { name: '浅色外观' }));

  await waitFor(
    /** 用于检查深色 class 已随浅色外观移除。 */
    () => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.dataset.colorMode).toBe('light');
    },
  );
}

test('removes the dark class when switching back to light', removesDarkClassOnLightAppearance);
