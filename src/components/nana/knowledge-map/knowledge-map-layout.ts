/**
 * 知识地图 · 主线列布局算法
 *
 * 纯函数，无 React 依赖。可独立测试。
 *
 * 布局规则：
 * - 每条主线占一列，列号由 COLUMN_MAP 定义
 * - 列内节点按 mainlines 中 nodeIds 顺序排列
 * - 不属于任何主线的节点归入"其他"列（最右侧）
 * - 多主线节点出现在最左侧主线所在列
 */

import type { KnowledgeNodeData, MainlineData } from "./knowledge-map-canvas";

// ── 常量 ──
export const COLUMN_MAP: Record<string, number> = {
  M0: 0,
  M1: 1,
  M2a: 2,
  M3: 3,
  M5: 4,
  M8: 5,
  M4: 6,
  M2b: 7,
  M6: 8,
  M7: 9,
};

export const COL_WIDTH = 180;
export const COL_GAP = 40;
export const COL_TOTAL = COL_WIDTH + COL_GAP; // 220
export const START_Y = 60;
export const NODE_GAP = 80;

// ── 类型 ──
export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  columnCount: number;
  columnHeights: number[];
  columnMainlines: Map<number, string>; // columnIdx → mainline name
  nodeColumns: Map<string, number>; // nodeId → columnIdx
}

// ── 布局计算（纯函数） ──
export function computeLayout(
  nodes: KnowledgeNodeData[],
  mainlines: MainlineData[]
): LayoutResult {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeColumns = new Map<string, number>();
  const columnHeights: number[] = [];
  const columnMainlines = new Map<number, string>();
  const assigned = new Set<string>();

  // 节点 lookup
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));

  // 1. 按列号排序的主线，分配节点到各列
  const sortedMainlines = [...mainlines]
    .filter((m) => COLUMN_MAP[m.mainlineId] !== undefined)
    .sort((a, b) => COLUMN_MAP[a.mainlineId] - COLUMN_MAP[b.mainlineId]);

  for (const mainline of sortedMainlines) {
    const colIdx = COLUMN_MAP[mainline.mainlineId];
    if (!columnMainlines.has(colIdx)) {
      columnMainlines.set(colIdx, mainline.name);
    }

    let yPos = START_Y;

    for (const nodeId of mainline.nodeIds) {
      if (!nodeMap.has(nodeId)) continue; // 节点不在当前数据集中

      if (!assigned.has(nodeId)) {
        const colCenterX = colIdx * COL_TOTAL + COL_WIDTH / 2;
        positions.set(nodeId, { x: colCenterX, y: yPos });
        nodeColumns.set(nodeId, colIdx);
        assigned.add(nodeId);
        yPos += NODE_GAP;
      }
    }

    columnHeights[colIdx] = yPos;
  }

  // 2. 未分配节点 -> "其他"列（最右侧）
  const sortedColumns = Object.entries(COLUMN_MAP)
    .sort((a, b) => a[1] - b[1]);
  const otherColIdx = Math.max(
    Math.max(0, ...Object.values(COLUMN_MAP)) + 1,
    columnHeights.length
  );
  let otherY = START_Y;

  for (const node of nodes) {
    if (!assigned.has(node.nodeId)) {
      const colCenterX = otherColIdx * COL_TOTAL + COL_WIDTH / 2;
      positions.set(node.nodeId, { x: colCenterX, y: otherY });
      nodeColumns.set(node.nodeId, otherColIdx);
      assigned.add(node.nodeId);
      otherY += NODE_GAP;
    }
  }

  columnHeights[otherColIdx] = otherY;

  // 3. 补充未出现在 mainlines 中的列（空列占位，确保视图完整）
  for (const [, colIdx] of sortedColumns) {
    if (!columnHeights[colIdx]) {
      columnHeights[colIdx] = START_Y;
    }
  }

  return {
    positions,
    columnCount: columnHeights.length,
    columnHeights,
    columnMainlines,
    nodeColumns,
  };
}
