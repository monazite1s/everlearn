/**
 * @fileoverview 图视图单个章节节点与折叠聚合节点的 SVG 形状。
 */

'use client';

import type { KeyboardEvent } from 'react';

import { AGGREGATE_NODE } from './graph-layout';
import type { GraphNodeLayout } from './graph-layout';
import type { TutorialChapter } from './tutorials-contract';
import { CHAPTER_STATUS_LABELS } from './tutorials-status';

/** 用于截断过长的节点标题，保持节点宽度稳定。 */
function truncate(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

/** 图节点的渲染输入。 */
export interface GraphNodeProps {
  readonly chapter: TutorialChapter | null;
  readonly current: boolean;
  readonly dependencies: readonly string[];
  readonly href: string | null;
  readonly node: GraphNodeLayout;
  readonly onAggregateExpand: () => void;
}

/** 用于拼装节点边框样式：状态着色、当前章节与可点击反馈。 */
function frameClass(chapter: TutorialChapter, current: boolean, clickable: boolean): string {
  return [
    'fill-card',
    chapter.status === 'failed' || chapter.status === 'cancelled'
      ? 'stroke-destructive'
      : 'stroke-border',
    current && 'stroke-primary',
    clickable ? 'cursor-pointer hover:stroke-primary' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** 用于渲染节点的矩形与标题、状态标记。 */
function NodeFrame({
  chapter,
  className,
  height,
  strokeWidth,
  width,
}: {
  chapter: TutorialChapter;
  className: string;
  height: number;
  strokeWidth: number;
  width: number;
}) {
  return (
    <>
      <rect className={className} height={height} rx={8} strokeWidth={strokeWidth} width={width} />
      <text className="fill-foreground" fontSize={13} x={12} y={20}>
        {truncate(chapter.title, 12)}
      </text>
      <NodeStatus status={chapter.status} x={12} y={height - 12} />
    </>
  );
}

/** 用于渲染一个章节节点：完成可点击进文档，聚合节点点击展开。 */
export function GraphNodeShape({
  chapter,
  current,
  dependencies,
  href,
  node,
  onAggregateExpand,
}: GraphNodeProps) {
  if (chapter === null) {
    return <AggregateNode node={node} onExpand={onAggregateExpand} />;
  }
  const clickable = href !== null;
  const className = frameClass(chapter, current, clickable);
  const name = describeNode(chapter, dependencies);
  const frame = (
    <NodeFrame
      chapter={chapter}
      className={className}
      height={node.height}
      strokeWidth={current ? 2 : 1.5}
      width={node.width}
    />
  );
  if (!clickable) {
    return (
      <g aria-label={name} role="group" tabIndex={0} transform={`translate(${node.x},${node.y})`}>
        {frame}
      </g>
    );
  }
  return (
    <g transform={`translate(${node.x},${node.y})`}>
      <a aria-label={name} href={href}>
        {frame}
      </a>
    </g>
  );
}

/** 用于渲染节点内随状态变化的标记与文字，颜色之外保留文字通道。 */
function NodeStatus({ status, x, y }: { status: string; x: number; y: number }) {
  const label = CHAPTER_STATUS_LABELS[status] ?? status;
  if (status === 'failed' || status === 'cancelled') {
    return (
      <>
        <circle className="fill-destructive" cx={x + 5} cy={y - 4} r={4.5} />
        <text
          className="fill-destructive-foreground"
          fontSize={10}
          textAnchor="middle"
          x={x + 5}
          y={y - 0.5}
        >
          !
        </text>
        <text className="fill-destructive" fontSize={11} x={x + 16} y={y}>
          {label}
        </text>
      </>
    );
  }
  const generating = status === 'running' || status === 'queued' || status === 'placeholder';
  return (
    <>
      <circle
        aria-hidden="true"
        className={
          generating ? 'fill-primary animate-pulse motion-reduce:animate-none' : 'fill-primary'
        }
        cx={x + 5}
        cy={y - 4}
        r={4}
      />
      <text className="fill-muted-foreground" fontSize={11} x={x + 16} y={y}>
        {label}
      </text>
    </>
  );
}

/** 用于渲染被折叠子图的聚合节点「+N」。 */
function AggregateNode({ node, onExpand }: { node: GraphNodeLayout; onExpand: () => void }) {
  /** 用于支持键盘展开聚合节点。 */
  const handleKey = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onExpand();
    }
  };
  return (
    <g
      aria-label={`展开其余 ${node.label.replace('+', '')} 个章节`}
      onClick={onExpand}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      transform={`translate(${node.x},${node.y})`}
    >
      <rect
        className="fill-muted stroke-border cursor-pointer hover:stroke-primary"
        height={AGGREGATE_NODE.height}
        rx={8}
        strokeDasharray="6 4"
        width={AGGREGATE_NODE.width}
      />
      <text
        className="fill-foreground"
        fontSize={13}
        textAnchor="middle"
        x={AGGREGATE_NODE.width / 2}
        y={29}
      >
        {node.label} 章
      </text>
    </g>
  );
}

/** 用于生成节点的可访问名称，依赖关系以文字描述。 */
function describeNode(chapter: TutorialChapter, dependencies: readonly string[]): string {
  const label = CHAPTER_STATUS_LABELS[chapter.status] ?? chapter.status;
  const dependencyText = dependencies.length > 0 ? `，依赖 ${dependencies.join('、')}` : '';
  return `${chapter.title}，状态 ${label}${dependencyText}`;
}
