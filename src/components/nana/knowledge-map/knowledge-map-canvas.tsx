/**
 * 知识地图 SVG 画布
 *
 * 主线列布局：每条主线一列，节点按依赖顺序垂直排列。
 * 三态渲染：稳定(绿发光)/前沿(蓝虚线)/未探索(灰)
 * 零新依赖（纯 SVG）
 *
 * P4 措辞合规：
 * - "已点亮" ✓（禁用"已掌握"）
 * - "下一个" ✓（禁用"薄弱点"）
 * - "未探索" ✓（禁用"未掌握"）
 */

"use client";

import { useMemo, useCallback } from "react";
import {
  computeLayout,
  COL_WIDTH,
  COL_GAP,
  COL_TOTAL,
  START_Y,
} from "./knowledge-map-layout";

// ── 类型 ──
export interface KnowledgeNodeData {
  nodeId: string;
  name: string;
  layer: string;
  tier: string | null;
  status: string;
  masteryProb: number;
  judgeCriteria: string | null;
  sampleItem: string | null;
  teachingNotes: string | null;
  lastEvidence: string | null;
}

export interface EdgeData {
  sourceId: string;
  targetId: string;
  type: "prerequisite" | "tool";
}

export interface MainlineData {
  mainlineId: string;
  name: string;
  priority: number;
  nodeIds: string[];
}

interface Props {
  nodes: KnowledgeNodeData[];
  edges: EdgeData[];
  mainlines: MainlineData[];
  frontier: string[];
  onNodeClick: (nodeId: string) => void;
}

// ── 渲染常量 ──
const NODE_R = 8.5;
const FRONTIER_R = 11;
const OTHER_R = 6;
const FONT_SIZE = 9.5;
const TEXT_Y_OFFSET = 16; // 节点名在 circle 下方
const LABEL_Y_OFFSET = -14; // "下一个" 标签在 circle 上方

// ── 组件 ──
export default function KnowledgeMapCanvas({
  nodes,
  edges,
  mainlines,
  frontier,
  onNodeClick,
}: Props) {
  const frontierSet = useMemo(() => new Set(frontier), [frontier]);

  const layout = useMemo(
    () => computeLayout(nodes, mainlines),
    [nodes, mainlines]
  );

  const { positions, columnCount, columnHeights, columnMainlines } = layout;

  // SVG 尺寸
  const svgWidth = Math.max(columnCount * COL_TOTAL + COL_GAP, 368);
  const svgHeight = Math.max(
    Math.max(...columnHeights.filter(Boolean)) + 80,
    400
  );

  // 节点位置 lookup
  const pos = useCallback(
    (nodeId: string) => positions.get(nodeId),
    [positions]
  );

  // ── 边渲染 ──
  const renderedEdges = useMemo(() => {
    return edges.map((edge) => {
      const src = positions.get(edge.sourceId);
      const tgt = positions.get(edge.targetId);
      if (!src || !tgt) return null;

      // 判定颜色
      const srcNode = nodes.find((n) => n.nodeId === edge.sourceId);
      const tgtNode = nodes.find((n) => n.nodeId === edge.targetId);
      const srcStable = srcNode?.status === "stable";
      const tgtStable = tgtNode?.status === "stable";
      const tgtIsFrontier = frontierSet.has(edge.targetId);

      let strokeColor: string;
      let strokeWidth: number;
      let strokeDasharray: string | undefined;

      if (tgtIsFrontier) {
        // 前沿节点的入边 → 蓝色虚线
        strokeColor = "#9FC3DE";
        strokeWidth = 2.2;
        strokeDasharray = "5 4";
      } else if (srcStable && tgtStable) {
        // 两端 stable → 绿色
        strokeColor = "#9CCBA6";
        strokeWidth = 2.4;
      } else {
        // 其他 → 灰色
        strokeColor = "#E7DFD0";
        strokeWidth = 1.4;
      }

      // 贝塞尔曲线路径
      const midY = (src.y + tgt.y) / 2;
      const d = `M ${src.x} ${src.y} C ${src.x} ${midY}, ${tgt.x} ${midY}, ${tgt.x} ${tgt.y}`;

      return (
        <path
          key={`edge-${edge.sourceId}-${edge.targetId}`}
          d={d}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          fill="none"
          strokeLinecap="round"
        />
      );
    });
  }, [edges, positions, nodes, frontierSet]);

  // ── 节点渲染 ──
  const renderedNodes = useMemo(() => {
    return nodes.map((node) => {
      const p = positions.get(node.nodeId);
      if (!p) return null;

      const isStable = node.status === "stable";
      const isFrontier = frontierSet.has(node.nodeId);
      const isSelected = false; // 选中态由外层处理

      const { x, y } = p;

      if (isStable) {
        // 已点亮节点：外层光晕 + 实心圆 + 白色高光 + 名称
        return (
          <g
            key={`node-${node.nodeId}`}
            className="cursor-pointer"
            onClick={() => onNodeClick(node.nodeId)}
            style={{ cursor: "pointer" }}
          >
            {/* 外层半透明光晕 */}
            <circle
              cx={x}
              cy={y}
              r={NODE_R * 2}
              fill="#6BBF8A"
              opacity={0.18}
              filter="url(#node-glow)"
            />
            {/* 实心圆 */}
            <circle cx={x} cy={y} r={NODE_R} fill="#6BBF8A" />
            {/* 白色高光 */}
            <circle
              cx={x}
              cy={y}
              r={NODE_R}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.55}
              strokeWidth={1.7}
            />
            {/* 节点名称 */}
            <text
              x={x}
              y={y + TEXT_Y_OFFSET}
              textAnchor="middle"
              fontSize={FONT_SIZE}
              fill="#557A5F"
              fontWeight={500}
            >
              {node.name}
            </text>
          </g>
        );
      }

      if (isFrontier) {
        // 前沿节点：蓝色虚线框 + "下一个"标签 + 名称
        return (
          <g
            key={`node-${node.nodeId}`}
            className="cursor-pointer"
            onClick={() => onNodeClick(node.nodeId)}
            style={{ cursor: "pointer" }}
          >
            {/* "下一个" 标签 */}
            <text
              x={x}
              y={y + LABEL_Y_OFFSET}
              textAnchor="middle"
              fontSize={FONT_SIZE}
              fill="#5E86A8"
              fontWeight={600}
            >
              下一个
            </text>
            {/* 虚线圆 */}
            <circle
              cx={x}
              cy={y}
              r={FRONTIER_R}
              fill="#F2F8FC"
              stroke="#93B8D6"
              strokeWidth={2.5}
              strokeDasharray="4 3"
            />
            {/* 节点名称 */}
            <text
              x={x}
              y={y + TEXT_Y_OFFSET + 4}
              textAnchor="middle"
              fontSize={FONT_SIZE}
              fill="#5E86A8"
              fontWeight={500}
            >
              {node.name}
            </text>
          </g>
        );
      }

      // 未探索节点：灰色实心圆 + 灰色名称
      return (
        <g
          key={`node-${node.nodeId}`}
          onClick={() => onNodeClick(node.nodeId)}
          style={{ cursor: "pointer" }}
        >
          <circle cx={x} cy={y} r={OTHER_R} fill="#D9D1C3" />
          <text
            x={x}
            y={y + TEXT_Y_OFFSET}
            textAnchor="middle"
            fontSize={FONT_SIZE}
            fill="#BDB3A3"
          >
            {node.name}
          </text>
        </g>
      );
    });
  }, [nodes, positions, frontierSet, onNodeClick]);

  // ── 主线名称（列底部） ──
  const renderedMainlineLabels = useMemo(() => {
    const labels: React.ReactNode[] = [];

    for (const [colIdxStr, name] of columnMainlines.entries()) {
      const colIdx = Number(colIdxStr);
      const colCenterX = colIdx * COL_TOTAL + COL_WIDTH / 2;
      const colBottom = columnHeights[colIdx] ?? START_Y;

      labels.push(
        <text
          key={`ml-label-${colIdx}`}
          x={colCenterX}
          y={colBottom + 30}
          textAnchor="middle"
          fontSize={11}
          fill="#BDB3A3"
          fontWeight={500}
        >
          {name}
        </text>
      );
    }

    return labels;
  }, [columnMainlines, columnHeights]);

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ minHeight: "400px" }}
    >
      <defs>
        <filter
          id="node-glow"
          x="-70%"
          y="-70%"
          width="240%"
          height="240%"
        >
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* 边 */}
      {renderedEdges}

      {/* 节点 */}
      {renderedNodes}

      {/* 主线名称 */}
      {renderedMainlineLabels}
    </svg>
  );
}
