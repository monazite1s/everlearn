/** @fileoverview 验证不耦合色值的持久主题切换。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { ThemeProvider, useTheme } from './theme-provider';

/** 用于清理组件测试间由 jsdom 共享的全局主题状态。 */
function resetTheme(): void {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.appearance;
  delete document.documentElement.dataset.colorMode;
  delete document.documentElement.dataset.mantineColorScheme;
  delete document.documentElement.dataset.theme;
}

afterEach(resetTheme);

/** 用于通过原生控件公开主题控制器以便行为测试。 */
function ThemeHarness() {
  const theme = useTheme();

  /** 用于选择中性色板。 */
  function chooseNeutral(): void {
    theme.setTheme('neutral');
  }

  /** 用于选择明确深色外观。 */
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

/** 用于验证切换只修改根属性和持久化偏好。 */
async function switchesAndPersistsTheme(): Promise<void> {
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '中性主题' }));
  fireEvent.click(screen.getByRole('button', { name: '深色外观' }));

  await waitFor(
    /** 用于检查两次用户操作后的最终持久化根状态。 */
    () => {
      expect(document.documentElement.dataset.theme).toBe('neutral');
      expect(document.documentElement.dataset.colorMode).toBe('dark');
      expect(document.documentElement.dataset.mantineColorScheme).toBe('dark');
      expect(localStorage.getItem('everlearn-theme')).toBe('neutral:dark');
    },
  );
}

test('switches and persists semantic theme selection', switchesAndPersistsTheme);

/** 用于验证水合后存储设置成为客户端快照。 */
async function loadsPersistedTheme(): Promise<void> {
  localStorage.setItem('everlearn-theme', 'neutral:dark');
  render(
    <ThemeProvider>
      <ThemeHarness />
    </ThemeProvider>,
  );

  await waitFor(
    /** 用于检查外部存储已根据浏览器持久化刷新。 */
    () =>
      expect(screen.getByRole('status', { name: '当前外观' })).toHaveTextContent(
        'neutral:dark:dark',
      ),
  );
}

test('loads a persisted selection after hydration', loadsPersistedTheme);
