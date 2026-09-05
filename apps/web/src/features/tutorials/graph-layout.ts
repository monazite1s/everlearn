/**
 * @fileoverview 以 dagre 计算章节依赖图布局，输出 SVG 可直接消费的坐标。
 */

import dagre from 'dagre';

import type { TutorialChapter } from './tutorials-contract';

/** 单个图节点的布局结果，x/y 为左上角坐标。 */
export interface GraphNodeLayout {
  readonly height: number;
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/** 单条依赖边的布局结果，points 含起终点折线。 */
export interface GraphEdgeLayout {
  readonly from: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly to: string;
}

/** 一次布局的完整结果，width/height 为画布尺寸。 */
export interface GraphLayout {
  readonly edges: readonly GraphEdgeLayout[];
  readonly height: number;
  readonly nodes: readonly GraphNodeLayout[];
  readonly width: number;
}

const NODE_WIDTH = 176;
const NODE_HEIGHT = 48;
const GRAPH_OPTIONS = { marginx: 24, marginy: 24, nodesep: 40, rankdir: 'LR', ranksep: 88 };

/** 用于计算布局中单个节点的左上角坐标。 */
function topleft(node: dagre.Node): { x: number; y: number } {
  return { x: node.x - node.width / 2, y: node.y - node.height / 2 };
}

/** 用于把章节依赖写入图，只保留本教程内已确认的边。 */
function setDependencyEdges(
  graph: dagre.graphlib.Graph<{ width: number; height: number }>,
  chapters: readonly TutorialChapter[],
  idByNodeKey: Map<string, string>,
): void {
  for (const chapter of chapters) {
    for (const nodeKey of chapter.dependsOn) {
      const from = idByNodeKey.get(nodeKey);
      // 只渲染本教程大纲内的依赖边，跨教程或悬空引用直接忽略。
      if (from === undefined || from === chapter.id) continue;
      graph.setEdge(from, chapter.id);
    }
  }
}

/** 用于对可见章节计算 dagre 布局，只保留本教程内已确认的依赖边。 */
export function layoutChapterGraph(chapters: readonly TutorialChapter[]): GraphLayout {
  const graph = new dagre.graphlib.Graph<{ width: number; height: number }>();
  graph.setGraph(GRAPH_OPTIONS);
  graph.setDefaultEdgeLabel(() => ({}));
  const idByNodeKey = new Map(chapters.map((chapter) => [chapter.nodeKey, chapter.id]));
  for (const chapter of chapters) {
    graph.setNode(chapter.id, { height: NODE_HEIGHT, label: chapter.title, width: NODE_WIDTH });
  }
  setDependencyEdges(graph, chapters, idByNodeKey);
  dagre.layout(graph);
  const nodes: GraphNodeLayout[] = graph.nodes().map((id) => {
    const node = graph.node(id);
    const corner = topleft(node);
    return {
      height: node.height,
      id,
      label: typeof node.label === 'string' ? node.label : id,
      width: node.width,
      x: corner.x,
      y: corner.y,
    };
  });
  const edges: GraphEdgeLayout[] = graph.edges().map((edge) => ({
    from: edge.v,
    points: graph.edge(edge).points.map((point) => ({ x: point.x, y: point.y })),
    to: edge.w,
  }));
  const size = graph.graph();
  return {
    edges,
    height: size?.height ?? 0,
    nodes,
    width: size?.width ?? 0,
  };
}

/** 折叠聚合节点的固定尺寸与标识。 */
export const AGGREGATE_NODE = { height: 48, id: '__collapsed__', width: 120 } as const;

/** 用于在布局结果中追加折叠聚合节点及其与邻域的连接边。 */
export function appendAggregateNode(
  layout: GraphLayout,
  collapsedCount: number,
  anchorId: string | null,
): GraphLayout {
  const anchor = layout.nodes.find((node) => node.id === anchorId) ?? layout.nodes.at(-1);
  const x = layout.width - AGGREGATE_NODE.width;
  const y = anchor ? anchor.y : 0;
  const node: GraphNodeLayout = {
    height: AGGREGATE_NODE.height,
    id: AGGREGATE_NODE.id,
    label: `+${collapsedCount}`,
    width: AGGREGATE_NODE.width,
    x,
    y,
  };
  const edge: GraphEdgeLayout | null = anchor
    ? {
        from: anchor.id,
        points: [
          { x: anchor.x + anchor.width, y: anchor.y + anchor.height / 2 },
          { x, y: y + AGGREGATE_NODE.height / 2 },
        ],
        to: AGGREGATE_NODE.id,
      }
    : null;
  return {
    edges: edge ? [...layout.edges, edge] : layout.edges,
    height: layout.height,
    nodes: [...layout.nodes, node],
    width: layout.width + AGGREGATE_NODE.width + 40,
  };
}
