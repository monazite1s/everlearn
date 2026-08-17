/** @fileoverview 渲染文档属性与当前正文引用的附件清单。 */

'use client';

import type { DocumentContentDetail } from '@everlearn/contracts';
import { DOCUMENT_BLOCK_ID_PATTERN } from '@everlearn/contracts';
import { DownloadIcon, FileIcon, ImageIcon } from 'lucide-react';

import { Button } from '@everlearn/ui';

import { formatDateTime } from '../../shared/format-datetime';
import { isRecord } from '../../shared/api-request';
import { attachmentDownloadHref } from './attachment-node-views';

/** 正文引用的一个附件节点投影。 */
export interface DocumentAttachmentRef {
  readonly attachmentId: string;
  readonly kind: 'attachment' | 'image';
  readonly label: string | null;
}

/** 用于从属性集中提取合法的附件 id。 */
function validAttachmentId(attrs: Record<string, unknown> | undefined): string | undefined {
  const value = attrs?.attachmentId;
  return typeof value === 'string' && DOCUMENT_BLOCK_ID_PATTERN.test(value) ? value : undefined;
}

/** 用于判定节点是否为引用合法附件 id 的图片或附件节点。 */
function toAttachmentRef(node: unknown): DocumentAttachmentRef | undefined {
  const record = isRecord(node) ? node : undefined;
  if (!record || (record.type !== 'image' && record.type !== 'attachment')) return undefined;
  const attrs = isRecord(record.attrs) ? record.attrs : undefined;
  const attachmentId = validAttachmentId(attrs);
  if (attachmentId === undefined) return undefined;
  return {
    attachmentId,
    kind: record.type,
    label: stringOr(attrs?.fileName) ?? stringOr(attrs?.alt),
  };
}

/** 用于把未知值收窄为非空字符串。 */
function stringOr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 用于宽容遍历正文 JSON 并提取引用合法附件 id 的节点。 */
export function extractAttachmentRefs(contentJson: unknown): DocumentAttachmentRef[] {
  const refs: DocumentAttachmentRef[] = [];
  /** 用于按深度优先收集附件节点引用。 */
  function visit(node: unknown): void {
    const ref = toAttachmentRef(node);
    if (ref) refs.push(ref);
    const record = isRecord(node) ? node : undefined;
    if (record && Array.isArray(record.content)) record.content.forEach(visit);
  }
  visit(contentJson);
  return refs;
}

/** 用于渲染单个附件引用行与授权下载入口。 */
function AttachmentRefRow(props: { item: DocumentAttachmentRef }) {
  const item = props.item;
  const Icon = item.kind === 'image' ? ImageIcon : FileIcon;
  const label = item.label ?? (item.kind === 'image' ? '图片' : '附件');
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1.5">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={label}>
        {label}
      </span>
      <Button asChild size="icon-xs" type="button" variant="ghost">
        <a download={label} href={attachmentDownloadHref(item.attachmentId)}>
          <DownloadIcon aria-hidden="true" />
          <span className="sr-only">下载 {label}</span>
        </a>
      </Button>
    </li>
  );
}

/** PropertiesPanel 的 props 契约。 */
export interface PropertiesPanelProps {
  readonly attachmentRefs: readonly DocumentAttachmentRef[];
  readonly contentDetail: DocumentContentDetail;
}

/** 用于渲染文档属性与附件引用清单。 */
export function PropertiesPanel(props: PropertiesPanelProps) {
  return (
    <div className="grid gap-4 py-2">
      <dl className="m-0 grid gap-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">更新时间</dt>
          <dd className="m-0 text-foreground">{formatDateTime(props.contentDetail.updatedAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">当前版本</dt>
          <dd className="m-0 font-mono text-xs text-foreground">v{props.contentDetail.version}</dd>
        </div>
      </dl>
      <div>
        <h3 className="m-0 text-sm font-medium text-foreground">附件</h3>
        {props.attachmentRefs.length === 0 ? (
          <p className="mt-1 mb-0 text-sm text-muted-foreground">正文没有引用附件。</p>
        ) : (
          <ul className="mt-2 mb-0 grid list-none gap-1.5 p-0">
            {props.attachmentRefs.map((ref_) => (
              <AttachmentRefRow item={ref_} key={ref_.attachmentId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
