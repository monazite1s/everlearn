/** @fileoverview 校验搜索 Block 深链并在正文就绪后安全定位或回退提示。 */

'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { isBlockId } from './block-id';

const TARGET_MARK_DURATION_MS = 2000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface SearchParamReader {
  getAll(name: string): string[];
}

interface TargetOutcome {
  readonly key: string;
  readonly status: string;
}

export interface SearchBlockTargetQuery {
  readonly blockId: string;
  readonly documentVersion: number;
}

export interface SearchBlockTargetProps {
  readonly currentDocumentVersion: number;
  readonly ready: boolean;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly target: SearchBlockTargetQuery | null;
}

/** 用于把正整数字符串解析为安全文档版本。 */
function parsePositiveInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** 用于在浏览器信任边界只接受成对、唯一且合法的 Block 定位参数。 */
export function parseSearchBlockTarget(params: SearchParamReader): SearchBlockTargetQuery | null {
  const blockIds = params.getAll('searchBlockId');
  const versions = params.getAll('searchDocumentVersion');
  if (blockIds.length !== 1 || versions.length !== 1) return null;
  const blockId = blockIds[0];
  const documentVersion = parsePositiveInteger(versions[0] ?? '');
  if (!isBlockId(blockId) || documentVersion === undefined) return null;
  return { blockId, documentVersion };
}

/** 用于在临时标识结束或目标替换时恢复元素原有可聚焦属性。 */
function restoreTarget(element: HTMLElement, previousTabIndex: string | null): void {
  element.removeAttribute('data-search-target');
  if (previousTabIndex === null) element.removeAttribute('tabindex');
  else element.setAttribute('tabindex', previousTabIndex);
}

/** 用于聚焦、滚动并短暂标识仍存在的目标 Block。 */
function markTarget(element: HTMLElement): () => void {
  const previousTabIndex = element.getAttribute('tabindex');
  element.setAttribute('tabindex', '-1');
  element.setAttribute('data-search-target', 'true');
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth',
    block: 'start',
  });
  const focusTimer = window.setTimeout(
    /** 用于在编辑器完成同轮 DOM 同步后再次确认目标焦点。 */ () =>
      element.focus({ preventScroll: true }),
    100,
  );
  const timer = window.setTimeout(
    /** 用于在识别时限结束后撤下视觉标识。 */ () => restoreTarget(element, previousTabIndex),
    TARGET_MARK_DURATION_MS,
  );
  return /** 用于在目标切换或卸载时撤销临时 DOM 属性。 */ function clearTarget(): void {
    window.clearTimeout(focusTimer);
    window.clearTimeout(timer);
    restoreTarget(element, previousTabIndex);
  };
}

/** 用于在正文就绪后执行至多一次的目标定位。 */
function useTargetLocation(props: SearchBlockTargetProps): [string | undefined, boolean] {
  const [outcome, setOutcome] = useState<TargetOutcome>();
  const processedKeyRef = useRef<string | undefined>(undefined);
  const blockId = props.target?.blockId;
  const requestedVersion = props.target?.documentVersion;
  useEffect(() => {
    if (!props.ready || blockId === undefined || requestedVersion === undefined) return;
    const key = `${blockId}:${requestedVersion}:${props.currentDocumentVersion}`;
    if (processedKeyRef.current === key) return;
    processedKeyRef.current = key;
    const element = props.rootRef.current?.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"]`,
    );
    let status: string | undefined;
    if (!element) status = '匹配内容已更新';
    else if (requestedVersion !== props.currentDocumentVersion)
      status = '文档已更新，已定位到原匹配位置';
    const timer =
      status === undefined
        ? undefined
        : window.setTimeout(
            /** 用于在 DOM 查询完成后异步提交一次性定位状态。 */ () => setOutcome({ key, status }),
            0,
          );
    const clearTarget = element ? markTarget(element) : undefined;
    return /** 用于目标切换时取消过期状态和临时标识。 */ () => {
      if (timer !== undefined) window.clearTimeout(timer);
      clearTarget?.();
    };
  }, [blockId, props.currentDocumentVersion, props.ready, props.rootRef, requestedVersion]);
  const key =
    blockId === undefined || requestedVersion === undefined
      ? undefined
      : `${blockId}:${requestedVersion}:${props.currentDocumentVersion}`;
  const status = key !== undefined && outcome?.key === key ? outcome.status : undefined;
  return [status, status === '匹配内容已更新'];
}

/** 用于在正文起始处承载版本变化或失效定位的一次性状态播报。 */
export function SearchBlockTarget(props: SearchBlockTargetProps) {
  const [status, focusStatus] = useTargetLocation(props);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (focusStatus) statusRef.current?.focus();
  }, [focusStatus]);
  if (!status) return null;
  return (
    <p
      aria-live="polite"
      className="mb-3 mt-0 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
      ref={statusRef}
      role="status"
      tabIndex={-1}
    >
      {status}
    </p>
  );
}
