/**
 * @fileoverview 渲染大纲编辑器，支持行内编辑标题摘要与排序、删除章节。
 */

'use client';

import { useState } from 'react';

import { Badge, Button, Input, Textarea } from '@everlearn/ui';
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from 'lucide-react';

import type { TutorialOutlineChapter } from './tutorials-api';

interface OutlineEditorProps {
  initialChapters: readonly TutorialOutlineChapter[];
  onActionError: (message: string) => void;
  onConfirm: (chapters: TutorialOutlineChapter[]) => Promise<string | undefined>;
}

/** 用于渲染可编辑大纲并提交确认。 */
export function OutlineEditor({ initialChapters, onActionError, onConfirm }: OutlineEditorProps) {
  const [chapters, setChapters] = useState<TutorialOutlineChapter[]>([...initialChapters]);
  const [pending, setPending] = useState(false);

  /** 用于保存编辑并确认大纲。 */
  const handleConfirm = async (): Promise<void> => {
    if (pending || chapters.length === 0) return;
    setPending(true);
    const error = await onConfirm(chapters);
    setPending(false);
    if (error !== undefined) onActionError(error);
  };

  return (
    <section aria-labelledby="outline-editor-title" className="grid gap-3">
      <h2 className="m-0 text-title-small text-foreground" id="outline-editor-title">
        确认大纲
      </h2>
      <OutlineChapterList chapters={chapters} setChapters={setChapters} />
      <OutlineConfirmFooter
        disabled={pending || chapters.length === 0}
        onConfirm={() => void handleConfirm()}
      />
    </section>
  );
}

/** 用于渲染大纲章节的可编辑列表并持有排序与编辑操作。 */
function OutlineChapterList({
  chapters,
  setChapters,
}: {
  chapters: TutorialOutlineChapter[];
  setChapters: (update: (current: TutorialOutlineChapter[]) => TutorialOutlineChapter[]) => void;
}) {
  /** 用于更新一个章节的可编辑字段。 */
  const patchChapter = (index: number, patch: Partial<TutorialOutlineChapter>): void => {
    setChapters((current) =>
      current.map((chapter, position) => (position === index ? { ...chapter, ...patch } : chapter)),
    );
  };

  /** 用于交换相邻章节顺序。 */
  const move = (index: number, offset: -1 | 1): void => {
    const target = index + offset;
    if (target < 0 || target >= chapters.length) return;
    setChapters((current) => {
      const next = [...current];
      const moving = next[index];
      const neighbor = next[target];
      if (moving === undefined || neighbor === undefined) return current;
      next[index] = neighbor;
      next[target] = moving;
      return next;
    });
  };

  /** 用于删除指定位置的章节。 */
  const removeChapter = (position: number): void => {
    setChapters((current) => current.filter((_, i) => i !== position));
  };

  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {chapters.map((chapter, index) => (
        <OutlineChapterRow
          chapter={chapter}
          index={index}
          key={chapter.nodeKey}
          onMove={move}
          onPatch={patchChapter}
          onRemove={removeChapter}
          total={chapters.length}
        />
      ))}
    </ol>
  );
}

/** 用于渲染大纲确认按钮与副作用说明。 */
function OutlineConfirmFooter({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <>
      <p className="m-0 text-xs text-muted-foreground">
        章节依赖关系以标签展示，暂不支持在页面调整。
      </p>
      <Button className="w-fit" disabled={disabled} onClick={onConfirm} type="button">
        确认大纲并创建教程知识库
      </Button>
      <p className="m-0 text-xs text-muted-foreground">
        确认后将创建独立知识库与章节占位文档，并开始逐章生成。
      </p>
    </>
  );
}

/** 用于渲染单章的编辑行。 */
function OutlineChapterRow({
  chapter,
  index,
  onMove,
  onPatch,
  onRemove,
  total,
}: {
  chapter: TutorialOutlineChapter;
  index: number;
  onMove: (index: number, offset: -1 | 1) => void;
  onPatch: (index: number, patch: Partial<TutorialOutlineChapter>) => void;
  onRemove: (index: number) => void;
  total: number;
}) {
  return (
    <li className="grid gap-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{index + 1}.</span>
        <Input
          aria-label={`第 ${index + 1} 章标题`}
          onChange={(event) => onPatch(index, { title: event.target.value })}
          value={chapter.title}
        />
        <ChapterRowActions index={index} onMove={onMove} onRemove={onRemove} total={total} />
      </div>
      <Textarea
        aria-label={`第 ${index + 1} 章摘要`}
        onChange={(event) => onPatch(index, { summary: event.target.value })}
        rows={2}
        value={chapter.summary}
      />
      <DependsOnTags dependsOn={chapter.dependsOn} />
    </li>
  );
}

/** 用于渲染单章的上移、下移与删除按钮。 */
function ChapterRowActions({
  index,
  onMove,
  onRemove,
  total,
}: {
  index: number;
  onMove: (index: number, offset: -1 | 1) => void;
  onRemove: (index: number) => void;
  total: number;
}) {
  return (
    <span className="flex items-center gap-1">
      <Button
        aria-label={`上移第 ${index + 1} 章`}
        disabled={index === 0}
        onClick={() => onMove(index, -1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        aria-label={`下移第 ${index + 1} 章`}
        disabled={index === total - 1}
        onClick={() => onMove(index, 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
      <Button
        aria-label={`删除第 ${index + 1} 章`}
        onClick={() => onRemove(index)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </span>
  );
}

/** 用于渲染章节依赖标签。 */
function DependsOnTags({ dependsOn }: { dependsOn: readonly string[] }) {
  if (dependsOn.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {dependsOn.map((nodeKey) => (
        <Badge key={nodeKey} variant="secondary">
          依赖：{nodeKey}
        </Badge>
      ))}
    </div>
  );
}
