/** @fileoverview 校验搜索 Block 深链并在正文就绪后安全定位或回退提示。 */

'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { isBlockId } from './block-id';

const TARGET_MARK_DURATION_MS = 2000;
// ponytail: 聚焦重试按帧对齐 2 秒标识窗口，天花板为慢机重挂延迟；再慢需改为事件驱动。
const TARGET_FOCUS_RETRY_FRAMES = 120;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const SEARCH_TARGET_PLUGIN_KEY = new PluginKey('everlearnSearchTarget');

/** 搜索目标标记的插件状态：目标块 ID 或空。 */
type SearchTargetState = string | null;

/**
 * @designPattern ProseMirror 插件（节点装饰）
 * 用节点装饰输出 data-search-target 标记；解决直接改写编辑器受管 DOM 会被
 * 重绘剥离的问题，移除条件为搜索深链定位改为由服务端渲染。
 */
export const SearchTargetMark = Extension.create({
  name: 'searchTargetMark',
  /** 用于注册承载搜索目标标记的 ProseMirror 插件。 */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SEARCH_TARGET_PLUGIN_KEY,
        props: {
          /** 用于按插件状态产出目标块的节点装饰。 */
          decorations(state) {
            const blockId = SEARCH_TARGET_PLUGIN_KEY.getState(state) as SearchTargetState;
            if (!blockId) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (decorations.length > 0) return false;
              if (isBlockId(node.attrs.blockId))
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-search-target': 'true',
                    tabindex: '-1',
                  }),
                );
              return undefined;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
        state: {
          /** 用于初始化为无目标。 */
          init: (): SearchTargetState => null,
          /** 用于消费定位元数据并更新目标状态。 */
          apply(tr, value): SearchTargetState {
            const meta = tr.getMeta(SEARCH_TARGET_PLUGIN_KEY) as SearchTargetState | undefined;
            return meta === undefined ? value : meta;
          },
        },
      }),
    ];
  },
});

/** 用于设置或清除编辑器中的搜索目标块装饰。 */
function applySearchTargetMark(editor: Editor, blockId: string | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(SEARCH_TARGET_PLUGIN_KEY, blockId));
}

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
  /** 编辑实例存在时走装饰标记；只读静态渲染传 null 走普通 DOM 标记。 */
  readonly editor: Editor | null;
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

/** 用于聚焦并短暂标识只读静态渲染中的目标块。 */
function markStaticTarget(element: HTMLElement): () => void {
  const previousTabIndex = element.getAttribute('tabindex');
  element.setAttribute('tabindex', '-1');
  element.setAttribute('data-search-target', 'true');
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth',
    block: 'start',
  });
  const timer = window.setTimeout(
    /** 用于在识别时限结束后撤下视觉标识。 */ () => restoreTarget(element, previousTabIndex),
    TARGET_MARK_DURATION_MS,
  );
  return /** 用于在目标切换或卸载时撤销临时 DOM 属性。 */ function clearTarget(): void {
    window.clearTimeout(timer);
    restoreTarget(element, previousTabIndex);
  };
}

/** 用于在有限帧内对装饰产出的目标元素补聚焦，吸收编辑器重挂延迟。 */
function focusDecoratedTarget(rootRef: RefObject<HTMLElement | null>, blockId: string): () => void {
  let active = true;
  let rafId = 0;
  let frames = 0;
  const tick = /** 用于逐帧查找目标块并补聚焦。 */ (): void => {
    if (!active || frames >= TARGET_FOCUS_RETRY_FRAMES) return;
    frames += 1;
    const current = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    if (current && document.activeElement !== current) current.focus({ preventScroll: true });
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return /** 用于在卸载时停止聚焦重试。 */ function stopFocusRetries(): void {
    active = false;
    window.cancelAnimationFrame(rafId);
  };
}

/** 用于把定位结果归一为一次性状态文案。 */
function locateStatus(
  element: HTMLElement | null | undefined,
  requestedVersion: number,
  currentDocumentVersion: number,
): string | undefined {
  if (!element) return '匹配内容已更新';
  if (requestedVersion !== currentDocumentVersion) return '文档已更新，已定位到原匹配位置';
  return undefined;
}

/** 定位参数就绪后执行一次目标定位所需的最小上下文。 */
interface TargetLocationInput {
  readonly blockId: string;
  readonly editor: Editor | null;
  readonly ready: boolean;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly currentDocumentVersion: number;
  readonly requestedVersion: number;
  readonly onStatus: (key: string, status: string) => void;
}

/** 用于执行一次目标定位并返回清理函数。 */
function runTargetLocation(input: TargetLocationInput): () => void {
  const { blockId, editor, requestedVersion, rootRef, currentDocumentVersion } = input;
  const element = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  const status = locateStatus(element, requestedVersion, currentDocumentVersion);
  const timer =
    status === undefined
      ? undefined
      : window.setTimeout(
          /** 用于在 DOM 查询完成后异步提交一次性定位状态。 */
          () => input.onStatus(`${blockId}:${requestedVersion}:${currentDocumentVersion}`, status),
          0,
        );
  // 编辑器已就绪但元素尚缺失时只播报状态，不存在可标识的块。
  if (!editor || !element) {
    const clearStatic = element ? markStaticTarget(element) : undefined;
    return /** 用于目标切换时取消过期状态。 */ () => {
      if (timer !== undefined) window.clearTimeout(timer);
      clearStatic?.();
    };
  }
  applySearchTargetMark(editor, blockId);
  // 滚动在定位时同步执行一次，目标元素被编辑器重挂后由聚焦重试兜底。
  element.scrollIntoView({
    behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth',
    block: 'start',
  });
  const stopFocusRetries = focusDecoratedTarget(rootRef, blockId);
  const expiryTimer = window.setTimeout(
    /** 用于在识别时限结束后撤下装饰标识。 */ () => applySearchTargetMark(editor, null),
    TARGET_MARK_DURATION_MS,
  );
  return /** 用于目标切换时撤销装饰、聚焦与过期计时。 */ () => {
    if (timer !== undefined) window.clearTimeout(timer);
    window.clearTimeout(expiryTimer);
    stopFocusRetries();
    applySearchTargetMark(editor, null);
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
    return runTargetLocation({
      blockId,
      editor: props.editor,
      ready: props.ready,
      rootRef: props.rootRef,
      currentDocumentVersion: props.currentDocumentVersion,
      requestedVersion,
      onStatus: /** 用于提交一次性定位状态。 */ (outcomeKey, status) =>
        setOutcome({ key: outcomeKey, status }),
    });
  }, [
    blockId,
    props.editor,
    props.currentDocumentVersion,
    props.ready,
    props.rootRef,
    requestedVersion,
  ]);
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
      aria-label={status}
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
