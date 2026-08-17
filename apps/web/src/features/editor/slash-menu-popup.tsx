/** @fileoverview 斜杠菜单弹层渲染：cmdk 列表语义与受控键盘选择。 */

'use client';

import { useEffect, useRef, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@everlearn/ui/components/command';

import type { SlashMenuPopupApi, SlashMenuItemView } from './slash-menu';
import { neighborValue } from './slash-menu';

/** SlashMenuPopup 的 props 契约。 */
interface SlashMenuPopupProps {
  items: SlashMenuItemView[];
  registerApi: (api: SlashMenuPopupApi | null) => void;
  run: (value: string) => void;
}

/** 用于把展示项按分组标题聚合为连续分组。 */
function groupItemViews(items: readonly SlashMenuItemView[]): {
  group: string;
  items: SlashMenuItemView[];
}[] {
  const groups: { group: string; items: SlashMenuItemView[] }[] = [];
  for (const item of items) {
    const current = groups.at(-1);
    if (current?.group === item.group) {
      current?.items.push(item);
    } else {
      groups.push({ group: item.group, items: [item] });
    }
  }
  return groups;
}

/** 斜杠菜单内容：cmdk 承担列表语义与可访问性，选择状态由编辑器按键驱动。 */
export function SlashMenuPopup({ items, registerApi, run }: SlashMenuPopupProps) {
  const [activeValue, setActiveValue] = useState(() => items[0]?.value ?? '');
  const activeValueRef = useRef(activeValue);
  const groups = groupItemViews(items);

  /** 用于同步提交受控选择，保证键盘路径在同一事件内读到最新值。 */
  function commitActiveValue(next: string): void {
    activeValueRef.current = next;
    setActiveValue(next);
  }

  useEffect(() => {
    if (!items.some((item) => item.value === activeValueRef.current)) {
      commitActiveValue(items[0]?.value ?? '');
    }
  }, [items]);

  useEffect(() => {
    registerApi({
      moveSelection: /** 用于按键循环移动受控选择。 */ (delta) =>
        commitActiveValue(neighborValue(items, activeValueRef.current, delta)),
      runActive: /** 用于执行当前选中项的插入命令。 */ () => {
        const current = activeValueRef.current;
        if (items.some((item) => item.value === current)) {
          run(current);
        }
      },
    });
    return () => registerApi(null);
  }, [items, registerApi, run]);

  return (
    <Command loop shouldFilter={false} value={activeValue} onValueChange={commitActiveValue}>
      <CommandList>
        <CommandEmpty>没有匹配的块类型</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup heading={group.group} key={group.group}>
            {group.items.map(({ icon: Icon, label, value }) => (
              <CommandItem key={value} onSelect={() => run(value)} value={value}>
                <Icon />
                <span>{label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
