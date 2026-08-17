/** @fileoverview 基于 Tiptap suggestion 官方工具与 shadcn Command 的斜杠命令菜单。 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  SquareCode,
  TextQuote,
} from 'lucide-react';
import type { Editor, Range as EditorRange } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, exitSuggestion } from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';

/** 单个斜杠菜单项：值、标签、图标与插入命令。 */
export interface SlashMenuItem {
  value: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
  group?: string;
  command: (target: { editor: Editor; range: EditorRange }) => void;
}

/** 菜单弹层的展示项，只含渲染所需字段。 */
export interface SlashMenuItemView {
  value: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

/** 宿主组件实现的菜单生命周期回调。 */
export interface SlashMenuHandlers {
  onStart: (suggestion: SuggestionProps<SlashMenuItem>) => void;
  onUpdate: (suggestion: SuggestionProps<SlashMenuItem>) => void;
  onExit: () => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** 弹层暴露给编辑器按键回调的受控选择接口。 */
export interface SlashMenuPopupApi {
  moveSelection: (delta: 1 | -1) => void;
  runActive: () => void;
}

export const SLASH_MENU_PLUGIN_KEY = new PluginKey('slashMenu');

export const SLASH_MENU_ITEMS: readonly SlashMenuItem[] = [
  {
    command: /** 用于清除触发词并把当前块设为段落。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
    icon: Pilcrow,
    keywords: ['paragraph', 'wen', 'duanluo'],
    label: '段落',
    value: 'paragraph',
  },
  {
    command: /** 用于清除触发词并转为一级标题。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
    icon: Heading1,
    keywords: ['heading', 'h1', 'biaoti'],
    label: '标题 1',
    value: 'heading-1',
  },
  {
    command: /** 用于清除触发词并转为二级标题。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    icon: Heading2,
    keywords: ['heading', 'h2', 'biaoti'],
    label: '标题 2',
    value: 'heading-2',
  },
  {
    command: /** 用于清除触发词并转为三级标题。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    icon: Heading3,
    keywords: ['heading', 'h3', 'biaoti'],
    label: '标题 3',
    value: 'heading-3',
  },
  {
    command: /** 用于清除触发词并转为四级标题。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run(),
    icon: Heading4,
    keywords: ['heading', 'h4', 'biaoti'],
    label: '标题 4',
    value: 'heading-4',
  },
  {
    command: /** 用于清除触发词并切换无序列表。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    icon: List,
    keywords: ['bullet', 'list', 'liebiao'],
    label: '无序列表',
    value: 'bullet-list',
  },
  {
    command: /** 用于清除触发词并切换有序列表。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    icon: ListOrdered,
    keywords: ['ordered', 'list', 'youxu', 'liebiao'],
    label: '有序列表',
    value: 'ordered-list',
  },
  {
    command: /** 用于清除触发词并切换引用块。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleWrap('blockquote').run(),
    icon: TextQuote,
    keywords: ['quote', 'yinyong'],
    label: '引用',
    value: 'blockquote',
  },
  {
    command: /** 用于清除触发词并把当前块设为代码块。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCodeBlock().run(),
    icon: SquareCode,
    keywords: ['code', 'daima'],
    label: '代码块',
    value: 'code-block',
  },
  {
    command: /** 用于清除触发词并插入分割线。 */ ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    icon: Minus,
    keywords: ['hr', 'divider', 'fenge'],
    label: '分割线',
    value: 'horizontal-rule',
  },
];

/** 用于按查询过滤菜单项，匹配标签或关键词。 */
export function filterSlashMenuItems(
  items: readonly SlashMenuItem[],
  query: string,
): SlashMenuItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return [...items];
  }
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(keyword) ||
      item.keywords.some((candidate) => candidate.includes(keyword)),
  );
}

/** 用于构建斜杠菜单扩展，宿主负责弹层渲染与按键处理。 */
export function createSlashMenuExtension(
  handlers: SlashMenuHandlers,
  extraItems: readonly SlashMenuItem[] = [],
): Extension {
  const menuItems = [...SLASH_MENU_ITEMS, ...extraItems];
  return Extension.create({
    name: 'slashMenu',
    /** 注册官方 suggestion 插件并转发渲染回调给宿主。 */
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashMenuItem, SlashMenuItem>({
          allowSpaces: true,
          char: '/',
          command: /** 用于执行选中菜单项自带的插入命令。 */ ({ editor, props, range }) =>
            props.command({ editor, range }),
          editor: this.editor,
          items: /** 用于按输入查询过滤菜单项。 */ ({ query }) =>
            filterSlashMenuItems(menuItems, query),
          pluginKey: SLASH_MENU_PLUGIN_KEY,
          render: /** 用于桥接 suggestion 生命周期到宿主处理器。 */ () => ({
            onExit: /** 用于关闭菜单并释放定位容器。 */ () => handlers.onExit(),
            onKeyDown: /** 用于把菜单按键转交宿主处理。 */ ({ event }) => handlers.onKeyDown(event),
            onStart: /** 用于打开菜单并挂载定位容器。 */ (suggestion) =>
              handlers.onStart(suggestion),
            onUpdate: /** 用于查询变化后刷新菜单项。 */ (suggestion) =>
              handlers.onUpdate(suggestion),
          }),
        }),
      ];
    },
  });
}

/** 菜单打开期间的会话：定位容器、卸载函数与最新 suggestion props。 */
interface SlashMenuSession {
  container: HTMLElement;
  props: SuggestionProps<SlashMenuItem>;
  unmount: () => void;
}

/** 斜杠菜单会话的渲染状态与控制接口。 */
export interface SlashMenuSessionState {
  container: HTMLElement;
  items: SlashMenuItemView[];
}

/** useSlashMenuSession 返回的会话 API。 */
export interface SlashMenuSessionApi {
  handlers: SlashMenuHandlers;
  menu: SlashMenuSessionState | null;
  registerPopupApi: (api: SlashMenuPopupApi | null) => void;
  runCommand: (value: string) => void;
}

/** 用于把 suggestion 项收敛为弹层渲染所需的展示字段。 */
function toItemViews(items: readonly SlashMenuItem[]): SlashMenuItemView[] {
  return items.map(({ group, icon, label, value }) => ({
    group: group ?? '基础块',
    icon,
    label,
    value,
  }));
}

/** 用于计算循环移动后的相邻项值。 */
export function neighborValue(items: SlashMenuItemView[], current: string, delta: 1 | -1): string {
  if (items.length === 0) {
    return current;
  }
  const index = items.findIndex((item) => item.value === current);
  const next = items[(Math.max(0, index) + delta + items.length) % items.length];
  return next ? next.value : current;
}

/** 用于卸载定位容器并清空菜单状态。 */
function closeSlashMenu(
  sessionRef: { current: SlashMenuSession | null },
  setMenu: (next: SlashMenuSessionState | null) => void,
): void {
  sessionRef.current?.unmount();
  sessionRef.current = null;
  setMenu(null);
}

/** 用于把菜单键盘操作映射为受控选择或关闭。 */
function handleSlashMenuKey(
  sessionRef: { current: SlashMenuSession | null },
  popupApiRef: { current: SlashMenuPopupApi | null },
  event: KeyboardEvent,
): boolean {
  if (event.key === 'Escape') {
    const view = sessionRef.current?.props.editor.view;
    if (view) {
      exitSuggestion(view, SLASH_MENU_PLUGIN_KEY);
    }
    return true;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    popupApiRef.current?.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return true;
  }
  if (event.key === 'Enter') {
    popupApiRef.current?.runActive();
    return true;
  }
  return false;
}

/** 用于挂载定位容器并打开菜单。 */
function openSlashMenu(
  sessionRef: { current: SlashMenuSession | null },
  setMenu: (next: SlashMenuSessionState | null) => void,
  suggestion: SuggestionProps<SlashMenuItem>,
): void {
  const container = document.createElement('div');
  container.className =
    'w-56 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md';
  const unmount = suggestion.mount(container);
  sessionRef.current = { container, props: suggestion, unmount };
  setMenu({ container, items: toItemViews(suggestion.items) });
}

/** 用于刷新菜单项并保持最新 suggestion 引用。 */
function updateSlashMenu(
  sessionRef: { current: SlashMenuSession | null },
  setMenu: (next: SlashMenuSessionState | null) => void,
  suggestion: SuggestionProps<SlashMenuItem>,
): void {
  if (!sessionRef.current) {
    return;
  }
  sessionRef.current.props = suggestion;
  setMenu({ container: sessionRef.current.container, items: toItemViews(suggestion.items) });
}

/** useSlashMenuSession 的可选配置。 */
export interface SlashMenuSessionOptions {
  /** 宿主注入的额外菜单项，与基础项合并为统一清单。 */
  readonly extraItems?: readonly SlashMenuItem[] | undefined;
}

/** 管理斜杠菜单会话生命周期：挂载定位容器、转发按键并渲染受控选择。 */
export function useSlashMenuSession(options: SlashMenuSessionOptions = {}): SlashMenuSessionApi {
  const menuItems = useMemo(
    /** 用于合并基础项与宿主注入项。 */ () => [...SLASH_MENU_ITEMS, ...(options.extraItems ?? [])],
    [options.extraItems],
  );
  const [menu, setMenu] = useState<SlashMenuSessionState | null>(null);
  const sessionRef = useRef<SlashMenuSession | null>(null);
  const popupApiRef = useRef<SlashMenuPopupApi | null>(null);
  const handlers = useMemo<SlashMenuHandlers>(() => {
    return {
      onExit: /** 用于关闭当前菜单会话。 */ () => closeSlashMenu(sessionRef, setMenu),
      onKeyDown: /** 用于处理菜单打开期间的键盘事件。 */ (event) =>
        handleSlashMenuKey(sessionRef, popupApiRef, event),
      onStart: /** 用于打开菜单会话。 */ (suggestion) =>
        openSlashMenu(sessionRef, setMenu, suggestion),
      onUpdate: /** 用于查询变化后刷新菜单会话。 */ (suggestion) =>
        updateSlashMenu(sessionRef, setMenu, suggestion),
    };
  }, []);

  /** 用于执行指定菜单项的插入命令。 */
  const runCommand = useCallback(
    (value: string) => {
      const item = menuItems.find((candidate) => candidate.value === value);
      if (item && sessionRef.current) {
        sessionRef.current.props.command(item);
      }
    },
    [menuItems],
  );

  /** 用于登记弹层暴露的受控选择接口。 */
  const registerPopupApi = useCallback((api: SlashMenuPopupApi | null) => {
    popupApiRef.current = api;
  }, []);

  return { handlers, menu, registerPopupApi, runCommand };
}
