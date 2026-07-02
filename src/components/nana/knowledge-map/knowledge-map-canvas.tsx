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
import {
  MOBILE_W,
  MOBILE_H,
  getMobileCoord,
  CLUSTER_LABELS,
  CLUSTER_DECORATIONS,
} from "./mobile-layout-coords";

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
  /** collected 弱标记计数（CaseKnowledgeTag 数量，0 = 没收过题）—— 与 status 正交 */
  caseEvidenceCount: number;
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
  variant?: "desktop" | "mobile";
  nextLabel?: "下一个" | "可以先看";
}

// ── 渲染常量 ──
const NODE_R = 8.5;
const FRONTIER_R = 11;
const OTHER_R = 6;
const FONT_SIZE = 9.5;
const TEXT_Y_OFFSET = 16; // 节点名在 circle 下方
const LABEL_Y_OFFSET = -14; // "下一个" 标签在 circle 上方

// ── collected 弱标记：琥珀色外环（additive，叠加在原三态渲染之上，不替换）──
const COLLECTED_AMBER = "#E8A33D";

// ── 组件 ──
export default function KnowledgeMapCanvas({
  nodes,
  edges,
  mainlines,
  frontier,
  onNodeClick,
  variant = "mobile",
  nextLabel = "下一个",
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

  // 节点位置 lookup（按模式切换）
  const pos = useCallback(
    (nodeId: string) => {
      if (variant === "mobile") return getMobileCoord(nodeId);
      return positions.get(nodeId);
    },
    [positions, variant]
  );

  // ── 边渲染 ──
  const renderedEdges = useMemo(() => {
    return edges.map((edge) => {
      const srcPos = pos(edge.sourceId);
      const tgtPos = pos(edge.targetId);
      if (!srcPos || !tgtPos) return null;

      // mobile 模式：只画两端都在 MOBILE_COORDS 里的边（河道区），过滤边缘簇噪声
      if (variant === "mobile") {
        if (
          !getMobileCoord(edge.sourceId) ||
          MOBILE_W / 2 === getMobileCoord(edge.sourceId).x
        ) {
          // fallback → skip
        }
        // 两端都必须是显式坐标（非 fallback）
        const srcC = getMobileCoord(edge.sourceId);
        const tgtC = getMobileCoord(edge.targetId);
        const isSrcFallback = srcC.x === MOBILE_W / 2 && srcC.y === MOBILE_H / 2;
        const isTgtFallback = tgtC.x === MOBILE_W / 2 && tgtC.y === MOBILE_H / 2;
        if (isSrcFallback || isTgtFallback) return null;
      }

      const src = { x: srcPos.x, y: srcPos.y };
      const tgt = { x: tgtPos.x, y: tgtPos.y };

      const srcNode = nodes.find((n) => n.nodeId === edge.sourceId);
      const tgtNode = nodes.find((n) => n.nodeId === edge.targetId);
      const srcStable = srcNode?.status === "stable";
      const tgtStable = tgtNode?.status === "stable";
      const tgtIsFrontier = frontierSet.has(edge.targetId);

      let strokeColor: string;
      let strokeWidth: number;
      let strokeDasharray: string | undefined;

      if (tgtIsFrontier) {
        strokeColor = "#9FC3DE";
        strokeWidth = 2.2;
        strokeDasharray = "5 4";
      } else if (srcStable && tgtStable) {
        strokeColor = "#9CCBA6";
        strokeWidth = 2.4;
      } else {
        strokeColor = "#E7DFD0";
        strokeWidth = 1.4;
      }

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
  }, [edges, pos, nodes, frontierSet, variant]);

  // ── 灰底图渲染（mobile 模式：所有 48 节点灰色底图圆 + 边缘簇装饰）──
  // 注意：底图只画圆点，不画节点名——节点名由 renderedNodes 层按状态着色统一画。
  // 否则未探索节点的灰名会被画两遍（底图灰名 + 节点层灰名 = 重影）。
  const renderedBaseMap = useMemo(() => {
    if (variant !== "mobile") return null;

    return (
      <>
        {/* 所有 48 节点灰色底图圆（只画圆，名字由上层 renderedNodes 负责） */}
        <g fill="#D9D1C3">
          {nodes.map((node) => {
            const c = getMobileCoord(node.nodeId);
            return (
              <circle key={`base-${node.nodeId}`} cx={c.x} cy={c.y} r={6} />
            );
          })}
        </g>

        {/* 边缘簇装饰灰点（无对应 DB 节点） */}
        <g fill="#D9D1C3">
          {CLUSTER_DECORATIONS.map((d, i) => (
            <circle key={`dec-${i}`} cx={d.x} cy={d.y} r={d.r} />
          ))}
        </g>

        {/* 边缘簇标签（只有簇名，不是每个节点的名字） */}
        <g fontSize={10} fill="#BDB3A3" textAnchor="middle">
          {CLUSTER_LABELS.map((cl) => (
            <text key={`cl-${cl.name}`} x={cl.x} y={cl.y}>
              {cl.name}
            </text>
          ))}
        </g>
      </>
    );
  }, [variant, nodes]);

  // ── 节点渲染 ──
  const renderedNodes = useMemo(() => {
    return nodes.map((node) => {
      const p = pos(node.nodeId);
      if (!p) return null;

      const isStable = node.status === "stable";
      const isFrontier = frontierSet.has(node.nodeId);
      const isSelected = false;

      const { x, y } = p;

      if (isStable) {
        return (
          <g
            key={`node-${node.nodeId}`}
            className="cursor-pointer"
            onClick={() => onNodeClick(node.nodeId)}
            style={{ cursor: "pointer" }}
          >
            {node.caseEvidenceCount > 0 && (
              <circle
                cx={x}
                cy={y}
                r={NODE_R + 5}
                fill="none"
                stroke={COLLECTED_AMBER}
                strokeWidth={2}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={NODE_R * 2}
              fill="#6BBF8A"
              opacity={0.18}
              filter="url(#node-glow)"
            />
            <circle cx={x} cy={y} r={NODE_R} fill="#6BBF8A" />
            <circle
              cx={x}
              cy={y}
              r={NODE_R}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.55}
              strokeWidth={1.7}
            />
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
        return (
          <g
            key={`node-${node.nodeId}`}
            className="cursor-pointer"
            onClick={() => onNodeClick(node.nodeId)}
            style={{ cursor: "pointer" }}
          >
            {node.caseEvidenceCount > 0 && (
              <circle
                cx={x}
                cy={y}
                r={FRONTIER_R + 4}
                fill="none"
                stroke={COLLECTED_AMBER}
                strokeWidth={2}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={FRONTIER_R}
              fill="#F2F8FC"
              stroke="#93B8D6"
              strokeWidth={2.5}
              strokeDasharray="4 3"
            />
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

      return (
        <g
          key={`node-${node.nodeId}`}
          onClick={() => onNodeClick(node.nodeId)}
          style={{ cursor: "pointer" }}
        >
          {node.caseEvidenceCount > 0 && (
            <circle
              cx={x}
              cy={y}
              r={OTHER_R + 5}
              fill="none"
              stroke={COLLECTED_AMBER}
              strokeWidth={2}
            />
          )}
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
  }, [nodes, pos, frontierSet, onNodeClick, nextLabel]);

  // ── 主线名称（desktop 模式用）──
  const renderedMainlineLabels = useMemo(() => {
    if (variant === "mobile") return null;

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
  }, [variant, columnMainlines, columnHeights]);

  // viewBox 尺寸：mobile 固定 368×700，desktop 动态算
  const w = variant === "mobile" ? MOBILE_W : svgWidth;
  const h = variant === "mobile" ? MOBILE_H : svgHeight;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ minHeight: variant === "mobile" ? "600px" : "400px" }}
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

      {/* 灰底图（mobile 模式底层） */}
      {renderedBaseMap}

      {/* 边 */}
      {renderedEdges}

      {/* 节点（覆盖在底图上） */}
      {renderedNodes}

      {/* 主线名称 */}
      {renderedMainlineLabels}
    </svg>
  );
}
