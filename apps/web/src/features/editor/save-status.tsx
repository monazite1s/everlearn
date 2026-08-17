/** @fileoverview 渲染保存五态徽标与版本冲突的常驻提示。 */

'use client';

import { useEffect, useState } from 'react';
import { AlertCircleIcon, CheckIcon, CopyIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@everlearn/ui';

import { formatDateTime } from '../../shared/format-datetime';
import type { DocumentSaveStatus } from './use-debounced-save';

/** 已保存徽标与复制反馈的短暂停留时长。 */
const SAVED_BADGE_MS = 2000;

/** SaveStatusBadge 的 props 契约。 */
export interface SaveStatusBadgeProps {
  readonly status: DocumentSaveStatus;
  readonly onRetry: () => void;
  readonly onCopyLocal: () => void;
}

/** 用于渲染保存中徽标。 */
function SavingBadge() {
  return (
    <Badge variant="secondary">
      <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      保存中
    </Badge>
  );
}

/** 用于渲染保存失败徽标与旁挂的重试、复制入口。 */
function FailedBadge(props: { readonly onRetry: () => void; readonly onCopyLocal: () => void }) {
  return (
    <>
      <Badge variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        保存失败
      </Badge>
      <Button
        aria-label="重试保存"
        onClick={props.onRetry}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <RefreshCwIcon aria-hidden="true" />
      </Button>
      <Button
        aria-label="复制本地内容"
        onClick={props.onCopyLocal}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <CopyIcon aria-hidden="true" />
      </Button>
    </>
  );
}

/** 用于渲染标题旁的保存状态徽标，冲突态由常驻提示承接。 */
export function SaveStatusBadge(props: SaveStatusBadgeProps) {
  // 以状态为 key 重挂内部状态，保证已保存徽标短暂展示后按新状态复位。
  return <SaveStatusBadgeInner {...props} key={props.status} />;
}

/** 用于承载单个状态生命周期的徽标内容。 */
function SaveStatusBadgeInner(props: SaveStatusBadgeProps) {
  const [hiddenAfterSaved, setHiddenAfterSaved] = useState(false);
  useEffect(() => {
    if (props.status !== 'saved') return;
    const timer = setTimeout(() => setHiddenAfterSaved(true), SAVED_BADGE_MS);
    return () => clearTimeout(timer);
  }, [props.status]);
  if (props.status === 'idle' || props.status === 'conflict' || hiddenAfterSaved) return null;
  return (
    <span aria-live="polite" className="flex items-center gap-1">
      {props.status === 'saving' && <SavingBadge />}
      {props.status === 'saved' && (
        <Badge className="text-success" variant="outline">
          <CheckIcon aria-hidden="true" />
          已保存
        </Badge>
      )}
      {props.status === 'failed' && (
        <FailedBadge onCopyLocal={props.onCopyLocal} onRetry={props.onRetry} />
      )}
    </span>
  );
}

/** ConflictAlert 的 props 契约。 */
export interface ConflictAlertProps {
  /** 冲突期间可读的服务端版本时间，拉取失败时为 undefined。 */
  readonly serverUpdatedAt: string | undefined;
  readonly onReload: () => void;
  readonly onCopyLocal: () => Promise<boolean>;
}

/** 用于执行复制并把成功与否回显到提示条。 */
function useCopyOutcome(onCopyLocal: () => Promise<boolean>) {
  const [outcome, setOutcome] = useState<'copied' | 'failed' | undefined>();
  useEffect(() => {
    if (outcome === undefined) return;
    const timer = setTimeout(() => setOutcome(undefined), SAVED_BADGE_MS);
    return () => clearTimeout(timer);
  }, [outcome]);
  return {
    copy: /** 用于复制本地内容并记录反馈。 */ async () => {
      setOutcome((await onCopyLocal()) ? 'copied' : 'failed');
    },
    outcome,
  };
}

/** 用于渲染版本冲突常驻提示并提供重载与复制本地内容出口。 */
export function ConflictAlert(props: ConflictAlertProps) {
  const { outcome, copy } = useCopyOutcome(props.onCopyLocal);
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>版本冲突</AlertTitle>
      <AlertDescription>
        <p className="m-0">
          文档已在其他位置更新
          {props.serverUpdatedAt
            ? `（服务端版本时间 ${formatDateTime(props.serverUpdatedAt)}）`
            : ''}
          ，已停止自动保存；请重载文档或复制本地内容。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={props.onReload} size="sm" type="button" variant="secondary">
            <RefreshCwIcon aria-hidden="true" />
            重载文档
          </Button>
          <Button onClick={() => void copy()} size="sm" type="button" variant="outline">
            <CopyIcon aria-hidden="true" />
            复制本地内容
          </Button>
          {outcome !== undefined && (
            <span aria-live="polite" className="text-sm text-muted-foreground">
              {outcome === 'copied' ? '已复制到剪贴板' : '复制失败，请重试'}
            </span>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
