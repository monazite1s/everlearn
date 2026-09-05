/**
 * @fileoverview 章节图视图：dagre 布局加 SVG 自绘节点与依赖边，支持折叠、缩放与平移。
 */

'use client';

import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { Button } from '@everlearn/ui';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';

import { chapterDocumentHref, dependencyTitles, hopNeighborhood } from './chapter-projections';
import { GraphNodeShape } from './graph-node';
import { appendAggregateNode, layoutChapterGraph } from './graph-layout';
import type { GraphLayout } from './graph-layout';
import type { TutorialChapter } from './tutorials-contract';

/** 大图默认折叠的节点数阈值与展开跳数。 */
const COLLAPSE_THRESHOLD = 50;
const NEIGHBORHOOD_HOPS = 2;
const ARROW_MARKER_ID = 'tutorial-graph-arrow';

/** 图视图的输入。 */
interface ChapterGraphProps {
  readonly chapters: readonly TutorialChapter[];
  readonly currentChapterId: string | null;
  readonly knowledgeBaseId: string | null;
  /** 用于图内提供切换到列表视图的无障碍等价入口。 */
  readonly onViewList: (view: 'list') => void;
}

/** 用于渲染章节依赖图视图与缩放平移控制。 */
export function ChapterGraphView({
  chapters,
  currentChapterId,
  knowledgeBaseId,
  onViewList,
}: ChapterGraphProps) {
  const collapsible = chapters.length > COLLAPSE_THRESHOLD;
  const [expandedAll, setExpandedAll] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const layout = useMemo(
    () => buildLayout(chapters, currentChapterId, collapsible && !expandedAll),
    [chapters, currentChapterId, collapsible, expandedAll],
  );

  /** 用于按步长缩放并夹紧到安全范围。 */
  const zoom = (factor: number): void => {
    setViewport((current) => ({
      ...current,
      scale: Math.min(2.4, Math.max(0.4, current.scale * factor)),
    }));
  };

  return (
    <section aria-label="章节依赖图" className="grid gap-2">
      <GraphListHint onViewList={onViewList} />
      <div className="relative h-[28rem] overflow-hidden rounded-lg border border-border bg-muted/30">
        <GraphSvg
          chapters={chapters}
          currentChapterId={currentChapterId}
          knowledgeBaseId={knowledgeBaseId}
          layout={layout}
          onAggregateExpand={() => setExpandedAll(true)}
          onPointerDown={(event) => {
            dragRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => applyPan(event, dragRef, setViewport)}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          viewport={viewport}
        />
        <GraphToolbar onFit={() => setViewport({ scale: 1, x: 0, y: 0 })} onZoom={zoom} />
      </div>
    </section>
  );
}

/** 用于渲染图视图到列表视图的无障碍等价提示。 */
function GraphListHint({ onViewList }: { onViewList: (view: 'list') => void }) {
  return (
    <p className="m-0 text-sm text-muted-foreground">
      图内连线展示章节依赖；连线不便阅读时
      <Button
        className="h-auto px-1 py-0"
        onClick={() => onViewList('list')}
        size="xs"
        type="button"
        variant="link"
      >
        切换到列表视图
      </Button>
      可获取同样的章节与依赖信息。
    </p>
  );
}

/** 用于渲染缩放、缩小与适应画布控制。 */
function GraphToolbar({ onFit, onZoom }: { onFit: () => void; onZoom: (factor: number) => void }) {
  return (
    <div className="absolute right-2 top-2 flex flex-col gap-1">
      <Button
        aria-label="放大"
        onClick={() => onZoom(1.2)}
        size="icon-xs"
        type="button"
        variant="outline"
      >
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button
        aria-label="缩小"
        onClick={() => onZoom(1 / 1.2)}
        size="icon-xs"
        type="button"
        variant="outline"
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <Button aria-label="适应画布" onClick={onFit} size="icon-xs" type="button" variant="outline">
        <MaximizeIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/** 用于在大图折叠与全量展开之间计算当前布局。 */
function buildLayout(
  chapters: readonly TutorialChapter[],
  currentChapterId: string | null,
  collapsed: boolean,
): GraphLayout {
  if (!collapsed) return layoutChapterGraph(chapters);
  const neighborhood = hopNeighborhood(chapters, currentChapterId, NEIGHBORHOOD_HOPS);
  const visible = chapters.filter((chapter) => neighborhood.has(chapter.id));
  const base = layoutChapterGraph(visible);
  return appendAggregateNode(base, chapters.length - visible.length, currentChapterId);
}

/** 用于把指针拖拽位移写入视口偏移。 */
function applyPan(
  event: ReactPointerEvent<SVGSVGElement>,
  dragRef: React.RefObject<{ x: number; y: number } | null>,
  setViewport: (
    update: (current: { scale: number; x: number; y: number }) => {
      scale: number;
      x: number;
      y: number;
    },
  ) => void,
): void {
  const start = dragRef.current;
  if (start === null) return;
  setViewport((current) => ({
    ...current,
    x: current.x + event.clientX - start.x,
    y: current.y + event.clientY - start.y,
  }));
  dragRef.current = { x: event.clientX, y: event.clientY };
}

/** 用于渲染依赖边折线与方向箭头。 */
function GraphEdges({ edges }: { edges: readonly GraphLayout['edges'][number][] }) {
  return (
    <>
      {edges.map((edge) => (
        <polyline
          className="fill-none stroke-border"
          key={`${edge.from}-${edge.to}`}
          markerEnd={`url(#${ARROW_MARKER_ID})`}
          points={edge.points.map((point) => `${point.x},${point.y}`).join(' ')}
          strokeWidth={1.5}
        />
      ))}
    </>
  );
}

/** 用于渲染依赖边方向箭头的复用标记。 */
function ArrowMarker() {
  return (
    <defs>
      <marker id={ARROW_MARKER_ID} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
        <path className="fill-border" d="M0,0 L8,4 L0,8 Z" />
      </marker>
    </defs>
  );
}

/** 用于渲染承载布局的 SVG 画布与全部节点、边。 */
function GraphSvg(props: {
  chapters: readonly TutorialChapter[];
  currentChapterId: string | null;
  knowledgeBaseId: string | null;
  layout: GraphLayout;
  onAggregateExpand: () => void;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  viewport: { scale: number; x: number; y: number };
}) {
  const titlesOf = dependencyTitles(props.chapters);
  return (
    <svg
      className="size-full cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      viewBox={`0 0 ${Math.max(props.layout.width, 1)} ${Math.max(props.layout.height, 1)}`}
    >
      {/* ponytail: 节点重排即重绘，不做 220–320ms 布局位移动画；缩放平移已带过渡。 */}
      <ArrowMarker />
      <g
        className="transition-transform duration-300 motion-reduce:transition-none"
        style={{
          transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.scale})`,
        }}
      >
        <GraphEdges edges={props.layout.edges} />
        {props.layout.nodes.map((node) => (
          <GraphNode
            chapters={props.chapters}
            current={node.id === props.currentChapterId}
            key={node.id}
            knowledgeBaseId={props.knowledgeBaseId}
            node={node}
            onAggregateExpand={props.onAggregateExpand}
            titlesOf={titlesOf}
          />
        ))}
      </g>
    </svg>
  );
}

/** 用于查表渲染单个图节点。 */
function GraphNode(props: {
  chapters: readonly TutorialChapter[];
  current: boolean;
  knowledgeBaseId: string | null;
  node: GraphLayout['nodes'][number];
  onAggregateExpand: () => void;
  titlesOf: (chapter: TutorialChapter) => string[];
}) {
  const chapter = props.chapters.find((item) => item.id === props.node.id) ?? null;
  return (
    <GraphNodeShape
      chapter={chapter}
      current={props.current}
      dependencies={chapter === null ? [] : props.titlesOf(chapter)}
      href={chapter === null ? null : chapterDocumentHref(chapter, props.knowledgeBaseId)}
      node={props.node}
      onAggregateExpand={props.onAggregateExpand}
    />
  );
}
