/** @fileoverview 文档区共享布局：树列跨文档导航持久挂载，仅内容区随路由切换。 */

'use client';

import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { DocumentTree } from '../../../../features/knowledge/document-tree';
import { useOnline } from '../../../../shared/use-online';

/** 用于从路径提取当前文档 id 供树高亮与当前位置标识。 */
function activeDocumentFromPath(pathname: string): string | undefined {
  const match = /\/documents\/([0-9a-f-]{36})/.exec(pathname);
  return match?.[1];
}

/** 用于渲染文档树列与内容插槽的两栏骨架，树不随文档切换重挂。 */
export default function DocumentsLayout(props: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ knowledgeBaseId: string }>();
  const online = useOnline();
  const activeDocumentId = activeDocumentFromPath(pathname);
  return (
    // 树列 ≥1024px 显示：更窄时壳侧栏加文档树会挤压编辑列低于工具栏最小宽度。
    <div className="xl:grid xl:grid-cols-[16rem_minmax(0,1fr)]">
      <aside
        aria-label="文档树"
        className="hidden min-w-0 border-r border-border px-4 py-4 xl:block"
      >
        <DocumentTree
          {...(activeDocumentId ? { activeDocumentId } : {})}
          desktop
          knowledgeBaseId={params.knowledgeBaseId}
          offline={!online}
          onCreated={() => undefined}
        />
      </aside>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}
