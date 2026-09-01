/** @fileoverview 渲染编辑器右栏的标签管理区块：列表、回车添加与点删移除。 */

'use client';

import { useState, type FormEvent } from 'react';

import { Button, Input } from '@everlearn/ui';

import { useDocumentTags } from './use-document-tags';

/** TagsSection 的 props 契约。 */
export interface TagsSectionProps {
  readonly documentId: string;
}

/** 用于按逗号拆分输入并裁剪空白与上限数量。 */
function parseNames(raw: string): string[] {
  return raw
    .split(/[，,]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .slice(0, 20);
}

/** 用于渲染单个标签条目与移除按钮。 */
function TagRow(props: { readonly name: string; readonly onRemove: () => void }) {
  return (
    <li className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm text-foreground">
      <span className="max-w-40 truncate">{props.name}</span>
      <Button
        aria-label={`移除标签 ${props.name}`}
        className="size-4 rounded-full p-0"
        onClick={props.onRemove}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        ×
      </Button>
    </li>
  );
}

/** 用于渲染标签输入与标签列表。 */
export function TagsSection(props: TagsSectionProps) {
  const { applyNames, failed, tags } = useDocumentTags(props);
  const [draft, setDraft] = useState('');

  /** 用于在回车提交时按逗号拆分并追加标签。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const names = parseNames(draft);
    setDraft('');
    if (names.length === 0) return;
    void applyNames([...tags, ...names]);
  }

  return (
    <div>
      <h3 className="m-0 text-sm font-medium text-foreground">标签</h3>
      <form className="mt-1.5 flex items-center gap-1" onSubmit={submit}>
        <Input
          aria-label="添加标签"
          className="h-8 flex-1 text-sm"
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="输入标签，回车添加"
          value={draft}
        />
      </form>
      {tags.length === 0 ? (
        <p className="mt-1.5 mb-0 text-sm text-muted-foreground">还没有标签。</p>
      ) : (
        <ul className="mt-2 mb-0 flex list-none flex-wrap gap-1.5 p-0">
          {tags.map((name, index) => (
            <TagRow
              key={name}
              name={name}
              onRemove={() => void applyNames(tags.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      )}
      {failed && (
        <p className="mt-1.5 mb-0 text-sm text-destructive" role="alert">
          标签保存失败，请重试。
        </p>
      )}
    </div>
  );
}
