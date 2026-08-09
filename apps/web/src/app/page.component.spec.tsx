/** @fileoverview Verifies the theme specimen through accessible DOM semantics. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import HomePage from './page';
import { ThemeProvider } from './theme-provider';

afterEach(cleanup);

/** Confirms the specimen exposes one heading and labeled native theme controls. */
function rendersThemeSpecimen(): void {
  render(
    <ThemeProvider>
      <HomePage />
    </ThemeProvider>,
  );

  expect(screen.getByRole('heading', { level: 1, name: '一套语义，四种光线' })).toBeVisible();
  const theme = screen.getByRole('combobox', { name: '主题' });
  const appearance = screen.getByRole('combobox', { name: '外观' });
  fireEvent.change(theme, { target: { value: 'neutral' } });
  expect(document.documentElement.dataset.theme).toBe('neutral');
  fireEvent.change(theme, { target: { value: 'paper' } });
  expect(document.documentElement.dataset.theme).toBe('paper');
  fireEvent.change(appearance, { target: { value: 'dark' } });
  expect(document.documentElement.dataset.colorMode).toBe('dark');
  fireEvent.change(appearance, { target: { value: 'light' } });
  expect(document.documentElement.dataset.colorMode).toBe('light');
  fireEvent.change(appearance, { target: { value: 'system' } });
  expect(document.documentElement.dataset.colorMode).toBe('light');
}

test('renders the theme specimen and controls', rendersThemeSpecimen);
