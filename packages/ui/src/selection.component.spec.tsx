/** @fileoverview Verifies tab and select primitives through their accessible state changes. */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './index';

afterEach(cleanup);

/** Confirms arrow navigation activates the adjacent tab and its panel. */
async function navigatesTabsWithKeyboard(): Promise<void> {
  render(
    <Tabs defaultValue="recent">
      <TabsList aria-label="文档视图">
        <TabsTrigger value="recent">最近</TabsTrigger>
        <TabsTrigger value="favorites">收藏</TabsTrigger>
      </TabsList>
      <TabsContent value="recent">最近文档</TabsContent>
      <TabsContent value="favorites">收藏文档</TabsContent>
    </Tabs>,
  );

  const recent = screen.getByRole('tab', { name: '最近' });
  recent.focus();
  fireEvent.keyDown(recent, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: '收藏' })).toHaveAttribute('aria-selected', 'true'),
  );
  expect(screen.getByRole('tabpanel')).toHaveTextContent('收藏文档');
}

/** Confirms selecting an option reports its stable value to the caller. */
function selectsOneValue(): void {
  const onValueChange = vi.fn();
  render(
    <Select defaultOpen onValueChange={onValueChange}>
      <SelectTrigger aria-label="界面主题" placeholder="选择主题" />
      <SelectContent>
        <SelectItem value="paper">温润纸张</SelectItem>
        <SelectItem value="neutral">中性灰阶</SelectItem>
      </SelectContent>
    </Select>,
  );

  fireEvent.click(screen.getByRole('option', { name: '温润纸张' }));
  expect(onValueChange).toHaveBeenCalledWith('paper');
}

test('navigates tabs with arrow keys', navigatesTabsWithKeyboard);
test('selects one value', selectsOneValue);
