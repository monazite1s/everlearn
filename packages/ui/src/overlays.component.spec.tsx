/** @fileoverview Verifies floating UI primitives through keyboard-visible behavior. */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import {
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from './index';

afterEach(cleanup);

/** Confirms modal dismissal restores focus to the opening action. */
async function restoresDialogFocus(): Promise<void> {
  render(
    <Dialog>
      <DialogTrigger asChild>
        <Button>打开设置</Button>
      </DialogTrigger>
      <DialogContent heading="文档设置">设置内容</DialogContent>
    </Dialog>,
  );

  const trigger = screen.getByRole('button', { name: '打开设置' });
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: '文档设置' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '关闭对话框' }));
  await waitFor(() => expect(trigger).toHaveFocus());
}

/** Confirms anchored content closes through the standard Escape interaction. */
async function dismissesPopover(): Promise<void> {
  render(
    <Popover>
      <PopoverTrigger asChild>
        <Button>显示详情</Button>
      </PopoverTrigger>
      <PopoverContent>最近保存于一分钟前</PopoverContent>
    </Popover>,
  );

  fireEvent.click(screen.getByRole('button', { name: '显示详情' }));
  expect(screen.getByText('最近保存于一分钟前')).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByText('最近保存于一分钟前')).not.toBeInTheDocument());
}

/** Confirms menu items expose action semantics and invoke selection handlers. */
async function selectsMenuAction(): Promise<void> {
  const onSelect = vi.fn();
  render(
    <Menu>
      <MenuTrigger asChild>
        <Button>更多操作</Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={onSelect}>移动文档</MenuItem>
      </MenuContent>
    </Menu>,
  );

  fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作' }), {
    button: 0,
    ctrlKey: false,
  });
  const item = await screen.findByRole('menuitem', { name: '移动文档' });
  fireEvent.click(item);
  expect(onSelect).toHaveBeenCalledOnce();
}

/** Confirms focused controls reveal concise supplemental help. */
async function revealsTooltipOnFocus(): Promise<void> {
  render(
    <TooltipProvider delayDuration={0}>
      <Tooltip content="创建空白文档">
        <Button aria-label="新建文档">＋</Button>
      </Tooltip>
    </TooltipProvider>,
  );

  fireEvent.focus(screen.getByRole('button', { name: '新建文档' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('创建空白文档');
}

test('restores focus after closing a dialog', restoresDialogFocus);
test('dismisses a popover with Escape', dismissesPopover);
test('runs selected menu actions', selectsMenuAction);
test('reveals tooltips on keyboard focus', revealsTooltipOnFocus);
