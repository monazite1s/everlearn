/** @fileoverview 验证搜索 Block 参数边界、定位、版本提示与减少动效降级。 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
  parseSearchBlockTarget,
  SearchBlockTarget,
  type SearchBlockTargetQuery,
} from './search-block-target';

const BLOCK_ID = '11111111-1111-4111-8111-111111111111';
const scrollIntoView = vi.fn();

/** 用于返回带目标块的最小正文宿主。 */
function TargetHarness(props: {
  readonly currentVersion: number;
  readonly ready?: boolean;
  readonly target: SearchBlockTargetQuery | null;
  readonly withBlock?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <SearchBlockTarget
        currentDocumentVersion={props.currentVersion}
        ready={props.ready ?? true}
        rootRef={rootRef}
        target={props.target}
      />
      <div ref={rootRef}>
        {props.withBlock !== false && <p data-block-id={BLOCK_ID}>匹配正文</p>}
      </div>
    </div>
  );
}

/** 用于构造合法的定位参数。 */
function target(version = 3): SearchBlockTargetQuery {
  return { blockId: BLOCK_ID, documentVersion: version };
}

/** 用于返回确定的减少动效媒体查询。 */
function matchMotion(reduced: boolean): (query: string) => MediaQueryList {
  return (query) =>
    ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }) as MediaQueryList;
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal('matchMedia', matchMotion(false));
});

afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('只接受成对且唯一的 UUID 与正整数参数', () => {
  expect(
    parseSearchBlockTarget(
      new URLSearchParams(`searchBlockId=${BLOCK_ID}&searchDocumentVersion=3`),
    ),
  ).toEqual(target());
  for (const query of [
    '',
    `searchBlockId=${BLOCK_ID}`,
    `searchBlockId=bad&searchDocumentVersion=3`,
    `searchBlockId=${BLOCK_ID}&searchDocumentVersion=0`,
    `searchBlockId=${BLOCK_ID}&searchDocumentVersion=1.5`,
    `searchBlockId=${BLOCK_ID}&searchDocumentVersion=3&searchDocumentVersion=4`,
  ]) {
    expect(parseSearchBlockTarget(new URLSearchParams(query))).toBeNull();
  }
});

test('目标存在时聚焦滚动并在短标识后恢复原属性', async () => {
  render(<TargetHarness currentVersion={3} target={target()} />);
  const block = screen.getByText('匹配正文');
  expect(block).toHaveFocus();
  expect(block).toHaveAttribute('tabindex', '-1');
  expect(block).toHaveAttribute('data-search-target', 'true');
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(block).not.toHaveAttribute('data-search-target');
  expect(block).not.toHaveAttribute('tabindex');
});

test('文档版本变化时仍定位原块并只播报一次更新提示', async () => {
  const view = render(<TargetHarness currentVersion={4} target={target(3)} />);
  const block = screen.getByText('匹配正文');
  expect(block).toHaveFocus();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(screen.getByRole('status')).toHaveTextContent('文档已更新，已定位到原匹配位置');
  view.rerender(<TargetHarness currentVersion={4} target={target(3)} />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});

test('目标缺失时把焦点交给正文起始状态提示', async () => {
  render(<TargetHarness currentVersion={3} target={target(2)} withBlock={false} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('匹配内容已更新');
  expect(status).toHaveFocus();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('正文未就绪不提前判定缺失且减少动效时即时滚动', () => {
  vi.stubGlobal('matchMedia', matchMotion(true));
  const view = render(<TargetHarness currentVersion={3} ready={false} target={target()} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();
  view.rerender(<TargetHarness currentVersion={3} target={target()} />);
  expect(screen.getByText('匹配正文')).toHaveFocus();
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
});
