/** @fileoverview 渲染编辑器右栏的反向链接区块：来源文档列表与失效标注。 */

'use client';

import { useEffect, useState } from 'react';

import { getDocumentBacklinks } from './document-tags-api';

/** BacklinksSection 的 props 契约。 */
export interface BacklinksSectionProps {
  /** 当前文档所在知识库，用于拼接同库来源的跳转地址。 */
  readonly knowledgeBaseId: string;
  readonly documentId: string;
}

/** 单条反向链接展示项。 */
interface BacklinkView {
  readonly key: string;
  readonly title: string;
  readonly href: string | null;
  readonly deleted: boolean;
}

/** 用于把服务端反链投影折叠为展示项，来源已删时仅标注不可跳转。 */
function toViews(
  items: readonly {
    blockId: string | null;
    documentId: string;
    documentTitle: string | null;
    sourceDeleted: boolean;
  }[],
  knowledgeBaseId: string,
): BacklinkView[] {
  return items.map((item) => ({
    deleted: item.sourceDeleted || item.documentTitle === null,
    href:
      item.sourceDeleted || item.documentTitle === null
        ? null
        : `/knowledge/${knowledgeBaseId}/documents/${item.documentId}`,
    key: `${item.documentId}:${item.blockId ?? ''}`,
    title: item.documentTitle ?? '来源已删除',
  }));
}

/** 用于加载并渲染指向当前文档的反向链接列表。 */
export function BacklinksSection(props: BacklinksSectionProps) {
  const [links, setLinks] = useState<BacklinkView[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getDocumentBacklinks(props.documentId);
      if (cancelled) return;
      setLinks(result.ok ? toViews(result.data.items, props.knowledgeBaseId) : []);
      setFailed(!result.ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.documentId, props.knowledgeBaseId]);

  return (
    <div>
      <h3 className="m-0 text-sm font-medium text-foreground">反向链接</h3>
      {links.length === 0 ? (
        <p className="mt-1 mb-0 text-sm text-muted-foreground">
          {failed ? '反向链接加载失败，请重试。' : '还没有文档链接到这里。'}
        </p>
      ) : (
        <ul className="mt-2 mb-0 grid list-none gap-1 p-0">
          {links.map((link) => (
            <li className="truncate text-sm" key={link.key}>
              {link.href === null ? (
                <span className="text-muted-foreground">{link.title}（来源已删除）</span>
              ) : (
                <a className="text-foreground hover:underline" href={link.href}>
                  {link.title}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
