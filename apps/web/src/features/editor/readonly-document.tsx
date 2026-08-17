/** @fileoverview 用 @tiptap/html 在无编辑实例的设备上静态渲染正文与锚点目录。 */

'use client';

import { useMemo, useRef } from 'react';
import { generateHTML } from '@tiptap/html';

import { Alert, AlertDescription, cn } from '@everlearn/ui';

import './editor-content.css';
import { createEditorSchema, type EditorDocumentJson } from './editor-schema';
import { parseDocumentJson } from './parse-document-json';

/** 目录条目：标题层级、文本与定位用块 ID。 */
export interface DocumentHeadingRef {
  readonly blockId: string;
  readonly level: number;
  readonly text: string;
}

/** 用于按共享 schema 把正文 JSON 渲染为可信静态 HTML。 */
function renderDocumentHtml(contentJson: unknown): string {
  // 信任边界收窄：非法结构回退空文档，不在只读设备上抛错。
  const parsed: EditorDocumentJson = parseDocumentJson(contentJson) ?? { type: 'doc', content: [] };
  return generateHTML(parsed, createEditorSchema());
}

/** 用于收集标题节点内的全部文本叶子。 */
function headingText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((child) => {
      const record =
        typeof child === 'object' && child !== null && !Array.isArray(child)
          ? (child as Record<string, unknown>)
          : null;
      if (!record) return '';
      if (typeof record.text === 'string') return record.text;
      return headingText(record.content);
    })
    .join('');
}

/** 用于把标题节点收敛为目录条目，不满足约束时返回 undefined。 */
function toHeadingRef(record: Record<string, unknown>): DocumentHeadingRef | undefined {
  if (record.type !== 'heading') return undefined;
  const attrs = (
    typeof record.attrs === 'object' && record.attrs !== null ? record.attrs : {}
  ) as Record<string, unknown>;
  const blockId = typeof attrs.blockId === 'string' ? attrs.blockId : '';
  const level = typeof attrs.level === 'number' ? attrs.level : 0;
  const text = headingText(record.content).trim();
  if (blockId === '' || level < 1 || level > 4 || text === '') return undefined;
  return { blockId, level, text };
}

/** 用于从已通过信任边界的正文提取标题目录条目。 */
export function extractHeadings(node: unknown): DocumentHeadingRef[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return [];
  const record = node as Record<string, unknown>;
  const heading = toHeadingRef(record);
  const headings = heading === undefined ? [] : [heading];
  if (Array.isArray(record.content)) {
    for (const child of record.content) headings.push(...extractHeadings(child));
  }
  return headings;
}

/** 用于按块 ID 把目录点击定位到正文中的对应标题。 */
function scrollToHeading(blockId: string, container: HTMLElement | null): void {
  container?.querySelector(`[data-block-id="${blockId}"]`)?.scrollIntoView({ block: 'start' });
}

/** 目录条目按标题层级使用的缩进类。 */
const HEADING_INDENTS = ['pl-0', 'pl-3', 'pl-6', 'pl-9'] as const;

/** 用于渲染锚点目录，点击按块 ID 定位到正文标题。 */
function DocumentToc(props: {
  readonly bodyRef: { current: HTMLDivElement | null };
  readonly headings: readonly DocumentHeadingRef[];
}) {
  return (
    <nav aria-label="文档目录" className="mb-4 rounded-lg border border-border bg-card p-3">
      <p className="m-0 mb-2 text-sm font-medium text-foreground">目录</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {props.headings.map((heading) => (
          <li key={heading.blockId}>
            <a
              className={cn(
                'block truncate text-sm text-muted-foreground hover:text-foreground',
                HEADING_INDENTS[heading.level - 1],
              )}
              href={`#${heading.blockId}`}
              onClick={(event) => {
                event.preventDefault();
                scrollToHeading(heading.blockId, props.bodyRef.current);
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** ReadonlyDocument 的 props 契约。 */
export interface ReadonlyDocumentProps {
  contentJson: unknown;
  /** 是否展示移动设备阅读提示条。 */
  showReadonlyHint?: boolean;
}

/** 用于在无编辑实例的设备上静态渲染正文、目录并提示能力边界。 */
export function ReadonlyDocument(props: ReadonlyDocumentProps) {
  const html = useMemo(() => renderDocumentHtml(props.contentJson), [props.contentJson]);
  const headings = useMemo(() => extractHeadings(props.contentJson), [props.contentJson]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="mx-auto w-full max-w-prose px-4 md:px-6">
      {props.showReadonlyHint && (
        <Alert className="mb-4" role="status">
          <AlertDescription>当前设备支持阅读，编辑请使用桌面端。</AlertDescription>
        </Alert>
      )}
      {headings.length > 0 && <DocumentToc bodyRef={bodyRef} headings={headings} />}
      {/* HTML 由共享 schema 与信任边界解析器生成，不含用户原始输入。 */}
      <div
        className="editor-content pb-16"
        dangerouslySetInnerHTML={{ __html: html }}
        ref={bodyRef}
        role="region"
        aria-label="文档正文（只读）"
      />
    </div>
  );
}
