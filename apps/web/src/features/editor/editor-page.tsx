/** @fileoverview 文档编辑器页面：内容加载、设备分支与三栏布局组装。 */

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { DocumentContentDetail } from '@everlearn/contracts';
import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from '@everlearn/ui';

import { LoadFailure } from '../../shared/load-failure';
import { useMediaQuery } from '../../shared/use-media-query';
import { useOnline } from '../../shared/use-online';
import { getKnowledgeBase } from '../knowledge/knowledge-api';
import { EditorWorkbench } from './editor-workbench';
import { getDocumentContent } from './editor-api';
import { ReadonlyDocument } from './readonly-document';
import { parseSearchBlockTarget, type SearchBlockTargetQuery } from './search-block-target';

/** 编辑断点与三栏断点：按布局规格 769px 起桌面、1537px 起常驻右栏。 */
const DESKTOP_QUERY = '(min-width: 48.0625em)';
const WIDE_QUERY = '(min-width: 96.0625em)';

/** 页面加载的稳定状态。 */
type PageLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly detail: DocumentContentDetail }
  | { readonly status: 'deleted' }
  | { readonly status: 'failed'; readonly message: string };

/** EditorPage 的 props 契约。 */
export interface EditorPageProps {
  readonly docId: string;
  readonly knowledgeBaseId: string;
}

/** 用于读取文档内容并按 404 归一为删除态。 */
function useDocumentLoad(docId: string): [PageLoad, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<PageLoad>({ status: 'loading' });
  const retry = /** 用于重试时重置为加载态并递增读取序号。 */ () => {
    setLoad({ status: 'loading' });
    setAttempt((current) => current + 1);
  };
  useEffect(
    /** 用于发起一次内容读取并丢弃过期响应。 */ function readContent(): () => void {
      let active = true;
      void getDocumentContent(docId).then((result) => {
        if (!active) return;
        if (result.ok) {
          setLoad({ detail: result.data, status: 'ok' });
          return;
        }
        if (result.error.code === 'NOT_FOUND') {
          setLoad({ status: 'deleted' });
          return;
        }
        setLoad({ message: result.error.message, status: 'failed' });
      });
      return /** 用于丢弃卸载或重试后的过期响应。 */ function cancel(): void {
        active = false;
      };
    },
    [attempt, docId],
  );
  return [load, retry];
}

/** 用于渲染与最终结构同形的正文加载骨架。 */
function EditorSkeleton() {
  return (
    <div aria-label="正在加载文档" className="mx-auto w-full max-w-prose px-6" role="status">
      <div className="grid gap-3 pt-3 pb-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/** 用于渲染文档删除态与回收站入口。 */
function DeletedNotice() {
  return (
    <div className="mx-auto grid w-full max-w-prose gap-4 px-6 py-8">
      <Alert variant="destructive">
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle>文档已删除</AlertTitle>
        <AlertDescription>
          <p className="m-0">该文档已进入回收站，当前页面转为只读。</p>
          <Button asChild className="mt-2" size="sm" variant="outline">
            <Link href="/knowledge/trash">前往回收站</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

/** 用于渲染移动端只读正文与返回入口。 */
function MobileReadonlyPage(props: {
  detail: DocumentContentDetail;
  searchTarget: SearchBlockTargetQuery | null;
}) {
  return (
    <div className="py-4">
      <h1
        className="m-0 px-4 font-serif text-title-large text-foreground md:px-6"
        data-page-title
        tabIndex={-1}
      >
        {props.detail.title || '无标题'}
      </h1>
      <ReadonlyDocument
        contentJson={props.detail.contentJson}
        documentVersion={props.detail.version}
        searchTarget={props.searchTarget}
        showReadonlyHint
      />
    </div>
  );
}

/** 用于渲染编辑会话与宽屏历史/信息面板的双栏网格。 */
function DesktopEditorLayout(props: {
  readonly detail: DocumentContentDetail;
  readonly kbName?: string | undefined;
  readonly knowledgeBaseId: string;
  readonly offline: boolean;
  readonly searchTarget: SearchBlockTargetQuery | null;
  readonly wide: boolean;
}) {
  return (
    // 网格列由 JS 断点驱动，与 wide 渲染分支同源，避免 CSS 断点在边界像素预留空列。
    <div className={props.wide ? 'grid grid-cols-[minmax(0,1fr)_20rem]' : 'min-w-0'}>
      <EditorWorkbench
        initialDetail={props.detail}
        kbName={props.kbName}
        knowledgeBaseId={props.knowledgeBaseId}
        offline={props.offline}
        searchTarget={props.searchTarget}
        wide={props.wide}
      />
    </div>
  );
}

/** 用于按需读取知识库显示名，面包屑首项使用。 */
function useKnowledgeBaseName(knowledgeBaseId: string): [string | undefined] {
  const [name, setName] = useState<string>();
  useEffect(
    /** 用于读取一次知识库名称并丢弃过期响应。 */ function readName(): () => void {
      let active = true;
      void getKnowledgeBase(knowledgeBaseId).then((result) => {
        if (active && result.ok) setName(result.data.name);
      });
      return /** 用于丢弃卸载后的过期响应。 */ function cancel(): void {
        active = false;
      };
    },
    [knowledgeBaseId],
  );
  return [name];
}

/** 用于按设备与数据状态渲染文档编辑器页面。 */
export function EditorPage(props: EditorPageProps) {
  const { docId, knowledgeBaseId } = props;
  const [load, retry] = useDocumentLoad(docId);
  const [kbName] = useKnowledgeBaseName(knowledgeBaseId);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const online = useOnline();
  const searchTarget = parseSearchBlockTarget(useSearchParams());

  if (load.status === 'loading') return <EditorSkeleton />;
  if (load.status === 'deleted') return <DeletedNotice />;
  if (load.status === 'failed') {
    return (
      <div className="mx-auto w-full max-w-prose px-6">
        <LoadFailure description={load.message} onRetry={retry} title="文档未加载" />
      </div>
    );
  }
  if (desktop === undefined) return <EditorSkeleton />;
  if (!desktop) return <MobileReadonlyPage detail={load.detail} searchTarget={searchTarget} />;
  return (
    <DesktopEditorLayout
      detail={load.detail}
      kbName={kbName}
      knowledgeBaseId={knowledgeBaseId}
      offline={!online}
      searchTarget={searchTarget}
      wide={wide ?? false}
    />
  );
}
