/**
 * 知识地图 · 列表视图（移动端可读模式）
 *
 * 手机默认视图：把节点按状态分组成 4 段卡片列表，每项 14px 字号（375px 可读）。
 * 与 SVG 图谱模式吃同一套数据（nodes[] + frontier[] + onNodeClick），只换展示形态。
 *
 * 分组优先级（互斥完备，无重复）：stable > frontier > collected > untested
 *   - 已点亮 (green #6BBF8A)：status === "stable"
 *   - 下一个 (blue #93B8D6)：在 frontier 数组里
 *   - 收过题 (amber #E8A33D)：caseEvidenceCount > 0 且非 stable 非 frontier
 *   - 未探索 (gray #D9D1C3)：其余
 *
 * 措辞合规（OPS §4）：用"已点亮/下一个/收过题/未探索"，禁用"掌握/薄弱/诊断/得分/失败"。
 * 语义色 hex 严格沿用 canvas + 图例。
 */

"use client";

import { useState } from "react";
import type { KnowledgeNodeData } from "./knowledge-map-canvas";

// ── 语义色（与 canvas + 图例严格一致）──
const COLOR_LIT = "#6BBF8A"; // 已点亮 绿
const COLOR_NEXT = "#93B8D6"; // 下一个 蓝
const COLOR_COLLECTED = "#E8A33D"; // 收过题 琥珀
const COLOR_UNTESTED = "#D9D1C3"; // 未探索 灰

// ── 分组 key ──
type GroupKey = "lit" | "next" | "collected" | "untested";

interface Props {
  nodes: KnowledgeNodeData[];
  frontier: string[];
  onNodeClick: (nodeId: string) => void;
  nextLabel?: "下一个" | "可以先看";
}

/**
 * 分组算法（纯函数，便于单测）。
 * 优先级：stable > frontier > collected > untested。每个节点恰好落入一组。
 */
export function groupNodesByStatus(
  nodes: KnowledgeNodeData[],
  frontier: string[]
): {
  lit: KnowledgeNodeData[];
  next: KnowledgeNodeData[];
  collected: KnowledgeNodeData[];
  untested: KnowledgeNodeData[];
} {
  const frontierSet = new Set(frontier);
  const lit: KnowledgeNodeData[] = [];
  const next: KnowledgeNodeData[] = [];
  const collected: KnowledgeNodeData[] = [];
  const untested: KnowledgeNodeData[] = [];

  for (const n of nodes) {
    const isStable = n.status === "stable";
    const isFrontier = frontierSet.has(n.nodeId);
    const hasEvidence = (n.caseEvidenceCount ?? 0) > 0;

    if (isStable) {
      lit.push(n);
    } else if (isFrontier) {
      next.push(n);
    } else if (hasEvidence) {
      collected.push(n);
    } else {
      untested.push(n);
    }
  }

  return { lit, next, collected, untested };
}

// ── 单组 section ──
interface SectionConfig {
  key: GroupKey;
  title: string;
  color: string;
}

const SECTIONS: SectionConfig[] = [
  { key: "lit", title: "已点亮", color: COLOR_LIT },
  { key: "next", title: "下一个", color: COLOR_NEXT },
  { key: "collected", title: "收过题", color: COLOR_COLLECTED },
  { key: "untested", title: "未探索", color: COLOR_UNTESTED },
];

export default function KnowledgeMapListView({
  nodes,
  frontier,
  onNodeClick,
  nextLabel = "下一个",
}: Props) {
  const [untestedExpanded, setUntestedExpanded] = useState(false);

  const groups = groupNodesByStatus(nodes, frontier);

  return (
    <div className="flex-1 px-4 pb-6">
      {SECTIONS.map((section) => {
        const groupNodes = groups[section.key];
        if (groupNodes.length === 0) return null;

        const isUntested = section.key === "untested";
        const isExpanded = !isUntested || untestedExpanded;
        const title =
          section.key === "next" ? nextLabel : section.title;

        return (
          <section key={section.key} className="mb-5">
            {/* 组标题 + 计数 */}
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: section.color }}
              />
              <h2 className="text-sm font-semibold text-[#403A33]">
                {title}
                <span className="ml-1.5 text-xs font-normal text-[#8C857B]">
                  {groupNodes.length} 个
                </span>
              </h2>
            </div>

            {/* 未探索组折叠/展开切换 */}
            {isUntested && !untestedExpanded && (
              <button
                type="button"
                onClick={() => setUntestedExpanded(true)}
                className="w-full rounded-xl border border-dashed border-[#E8E0D4] bg-white/40 py-2.5 text-[13px] text-[#8C857B] transition-colors hover:bg-white/70"
              >
                展开 {groupNodes.length} 个未探索知识点
              </button>
            )}
            {isUntested && untestedExpanded && (
              <button
                type="button"
                onClick={() => setUntestedExpanded(false)}
                className="mb-2 w-full text-center text-[12px] text-[#B8AFA6] transition-colors hover:text-[#8C857B]"
              >
                收起
              </button>
            )}

            {/* 节点卡片列表 */}
            {isExpanded && (
              <ul className="space-y-1.5">
                {groupNodes.map((node) => {
                  const hasEvidence = (node.caseEvidenceCount ?? 0) > 0;
                  // lit / next 组里若又收过题 → 显示琥珀小角标（additive，对应 SVG 绿芯+琥珀环）
                  const showEvidenceBadge =
                    hasEvidence && (section.key === "lit" || section.key === "next");
                  // collected 组本身用琥珀 chip，不再重复角标
                  const isCollectedChip = section.key === "collected";

                  return (
                    <li key={node.nodeId}>
                      <button
                        type="button"
                        onClick={() => onNodeClick(node.nodeId)}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-[#EFE8DD] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#D9D1C3]"
                      >
                        {/* 色点 */}
                        <span
                          className="inline-block h-3 w-3 flex-none rounded-full"
                          style={{
                            backgroundColor: isCollectedChip
                              ? COLOR_UNTESTED
                              : section.color,
                            boxShadow:
                              section.key === "lit"
                                ? "0 0 0 3px rgba(107,191,138,0.2)"
                                : undefined,
                          }}
                        />
                        {/* 节点名（≥14px，核心可读性要求） */}
                        <span className="min-w-0 flex-1 truncate text-[14px] text-[#403A33]">
                          {node.name}
                        </span>

                        {/* 状态 chip */}
                        <span
                          className="flex-none rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: `${section.color}26`, // ~15% 透明度底
                            color: section.color,
                          }}
                        >
                          {title}
                        </span>

                        {/* 收过题计数角标（lit/next 组 additive） */}
                        {showEvidenceBadge && (
                          <span
                            className="flex-none rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${COLOR_COLLECTED}26`,
                              color: COLOR_COLLECTED,
                            }}
                          >
                            收过 {node.caseEvidenceCount}
                          </span>
                        )}

                        {/* collected 组显示具体计数 */}
                        {isCollectedChip && (
                          <span className="flex-none text-[11px] text-[#B8AFA6]">
                            {node.caseEvidenceCount} 道
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
