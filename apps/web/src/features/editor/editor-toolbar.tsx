/** @fileoverview 正文上方的键盘可达格式化工具栏（roving tabindex + 行内链接输入）。 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  SquareCodeIcon,
  StrikethroughIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormEvent } from 'react';

import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@everlearn/ui';

/** 单个工具栏按钮的描述：命令、激活判定与可执行判定。 */
export interface ToolbarAction {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  isActive(this: void, editor: Editor): boolean;
  canRun(this: void, editor: Editor): boolean;
  run(this: void, editor: Editor): void;
}

/** 工具栏的基础格式化动作清单。 */
export const FORMATTING_ACTIONS: readonly ToolbarAction[] = [
  {
    canRun: /** 用于判定当前选区能否切换粗体。 */ (editor) => editor.can().toggleBold(),
    icon: BoldIcon,
    id: 'bold',
    isActive: /** 用于判定选区是否已带粗体标记。 */ (editor) => editor.isActive('bold'),
    label: '粗体',
    run: /** 用于切换选区粗体。 */ (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    canRun: /** 用于判定当前选区能否切换斜体。 */ (editor) => editor.can().toggleItalic(),
    icon: ItalicIcon,
    id: 'italic',
    isActive: /** 用于判定选区是否已带斜体标记。 */ (editor) => editor.isActive('italic'),
    label: '斜体',
    run: /** 用于切换选区斜体。 */ (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    canRun: /** 用于判定当前选区能否切换删除线。 */ (editor) => editor.can().toggleStrike(),
    icon: StrikethroughIcon,
    id: 'strike',
    isActive: /** 用于判定选区是否已带删除线标记。 */ (editor) => editor.isActive('strike'),
    label: '删除线',
    run: /** 用于切换选区删除线。 */ (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    canRun: /** 用于判定当前选区能否切换行内代码。 */ (editor) => editor.can().toggleCode(),
    icon: CodeIcon,
    id: 'code',
    isActive: /** 用于判定选区是否已带行内代码标记。 */ (editor) => editor.isActive('code'),
    label: '行内代码',
    run: /** 用于切换选区行内代码。 */ (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    canRun: /** 用于判定当前块能否切换无序列表。 */ (editor) => editor.can().toggleBulletList(),
    icon: ListIcon,
    id: 'bullet-list',
    isActive: /** 用于判定当前块是否为无序列表。 */ (editor) => editor.isActive('bulletList'),
    label: '无序列表',
    run: /** 用于切换无序列表。 */ (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    canRun: /** 用于判定当前块能否切换有序列表。 */ (editor) => editor.can().toggleOrderedList(),
    icon: ListOrderedIcon,
    id: 'ordered-list',
    isActive: /** 用于判定当前块是否为有序列表。 */ (editor) => editor.isActive('orderedList'),
    label: '有序列表',
    run: /** 用于切换有序列表。 */ (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    canRun: /** 用于判定当前块能否切换代码块。 */ (editor) => editor.can().toggleCodeBlock(),
    icon: SquareCodeIcon,
    id: 'code-block',
    isActive: /** 用于判定当前块是否为代码块。 */ (editor) => editor.isActive('codeBlock'),
    label: '代码块',
    run: /** 用于切换代码块。 */ (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

/** EditorToolbar 的 props 契约。 */
export interface EditorToolbarProps {
  readonly editor: Editor | null;
  /** 只读、离线或冲突期间禁用全部动作。 */
  readonly disabled: boolean;
}

/** 用于订阅编辑器事务驱动激活态刷新。 */
function useEditorTransactions(editor: Editor | null): void {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = /** 用于强制刷新激活与可执行判定。 */ () => bump((count) => count + 1);
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);
}

/** 用于判定键盘事件目标是否文本输入，放行其光标移动。 */
function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** 用于登记按钮 DOM 引用，供方向键移动 roving 焦点。 */
function registerButtonRef(
  refs: { current: (HTMLButtonElement | null)[] },
  index: number,
  element: HTMLButtonElement | null,
): void {
  refs.current[index] = element;
}

/** 用于统一渲染禁用降透明与激活反馈的工具栏图标按钮。 */
function ToolbarIconButton(props: {
  readonly active: boolean;
  readonly disabled: boolean;
  readonly focused: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onFocus: () => void;
  readonly onRun: () => void;
  readonly registerRef?: (element: HTMLButtonElement | null) => void;
}) {
  const Icon = props.icon;
  /* eslint-disable react-hooks/refs -- 回调 ref 由 React 在提交期调用并写入按钮引用，非渲染路径 */
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-disabled={props.disabled || undefined}
          aria-label={props.label}
          aria-pressed={props.active || undefined}
          className={cn(props.disabled ? 'pointer-events-none opacity-50' : 'opacity-100')}
          data-active={props.active || undefined}
          onFocus={props.onFocus}
          onClick={() => {
            if (!props.disabled) props.onRun();
          }}
          ref={props.registerRef}
          size="icon-sm"
          tabIndex={props.focused ? 0 : -1}
          type="button"
          variant="ghost"
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
  /* eslint-enable react-hooks/refs -- 恢复渲染期引用检查 */
}

/** 用于渲染基础动作按钮组并维持 roving tabindex。 */
function FormattingButtons(props: {
  readonly disabled: boolean;
  readonly editor: Editor | null;
  readonly focusIndex: number;
  readonly onFocusIndex: (index: number) => void;
  readonly registerButton: (index: number, element: HTMLButtonElement | null) => void;
}) {
  const { editor } = props;
  return (
    <>
      {FORMATTING_ACTIONS.map((action, index) => (
        <ToolbarIconButton
          active={editor !== null && action.isActive(editor)}
          disabled={props.disabled || editor === null || !action.canRun(editor)}
          focused={index === props.focusIndex}
          icon={action.icon}
          key={action.id}
          label={action.label}
          onFocus={() => props.onFocusIndex(index)}
          onRun={() => {
            if (editor) action.run(editor);
          }}
          registerRef={(element) => props.registerButton(index, element)}
        />
      ))}
    </>
  );
}

/** 用于渲染行内 URL 输入并把地址应用到选区。 */
function LinkDraftForm(props: {
  readonly draft: string;
  readonly editor: Editor | null;
  readonly onDone: () => void;
  readonly onDraftChange: (draft: string) => void;
}) {
  /** 用于把输入的地址应用到当前选区并关闭输入行。 */
  function apply(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const href = props.draft.trim();
    if (href.length > 0) {
      props.editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    props.onDone();
  }

  return (
    <form className="flex items-center gap-1 pl-1" onSubmit={apply}>
      <Input
        aria-label="链接地址"
        autoFocus
        className="h-8 w-52 text-sm"
        onChange={(event) => props.onDraftChange(event.currentTarget.value)}
        placeholder="https://"
        type="url"
        value={props.draft}
      />
      <Button size="xs" type="submit" variant="secondary">
        应用
      </Button>
      <Button onClick={props.onDone} size="xs" type="button" variant="ghost">
        取消
      </Button>
    </form>
  );
}

/** 用于渲染链接按钮与行内 URL 输入并接管链接 mark 的插入与解除。 */
function LinkControl(props: {
  readonly disabled: boolean;
  readonly editor: Editor | null;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly registerRef: (element: HTMLButtonElement | null) => void;
}) {
  const { disabled, editor, focused, onFocus, registerRef } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const active = editor?.isActive('link') ?? false;
  const cannotRun = disabled || editor === null;

  /** 用于在链接激活时解除、未激活时展开输入行。 */
  function toggle(): void {
    if (cannotRun || editor === null) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setDraft('');
  }

  return (
    <>
      <ToolbarIconButton
        active={active}
        disabled={cannotRun}
        focused={focused}
        icon={LinkIcon}
        label={active ? '解除链接' : '链接'}
        onFocus={onFocus}
        onRun={toggle}
        registerRef={registerRef}
      />
      {draft !== null && (
        <LinkDraftForm
          draft={draft}
          editor={editor}
          onDraftChange={setDraft}
          onDone={() => setDraft(null)}
        />
      )}
    </>
  );
}

/** 用于渲染正文上方的格式化工具栏，箭头键移动焦点、Tab 逃逸。 */
export function EditorToolbar(props: EditorToolbarProps) {
  const { editor, disabled } = props;
  useEditorTransactions(editor);
  const [focusIndex, setFocusIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const linkIndex = FORMATTING_ACTIONS.length;

  /** 用于按方向键把 roving 焦点实际移动到相邻按钮，放行文本输入内的光标键。 */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (isTextInput(event.target)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    const next = Math.max(0, Math.min(linkIndex, focusIndex + delta));
    setFocusIndex(next);
    buttonRefs.current[next]?.focus();
  }

  return (
    <TooltipProvider>
      <div
        aria-label="格式化"
        aria-orientation="horizontal"
        className="flex h-10 items-center gap-0.5 px-2"
        onKeyDown={handleKeyDown}
        role="toolbar"
      >
        <FormattingButtons
          disabled={disabled}
          editor={editor}
          focusIndex={focusIndex}
          onFocusIndex={setFocusIndex}
          registerButton={(index, element) => registerButtonRef(buttonRefs, index, element)}
        />
        <LinkControl
          disabled={disabled}
          editor={editor}
          focused={focusIndex === linkIndex}
          onFocus={() => setFocusIndex(linkIndex)}
          registerRef={(element) => registerButtonRef(buttonRefs, linkIndex, element)}
        />
      </div>
    </TooltipProvider>
  );
}
