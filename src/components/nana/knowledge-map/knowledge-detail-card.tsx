/**
 * 知识地图 · 节点详情卡
 *
 * 底部弹出式卡片，展示选中节点的名称/描述/判定标准/例题/确认日期。
 * 参考 04-knowledge-map.html 的 kcard 样式。
 *
 * P4 措辞合规：
 * - "最近一次确认是在..." ✓（禁用"掌握概率 85%"）
 * - 显示"下一个要攻克的知识点"提示（禁用"薄弱点"）
 * - 未探索节点显示"还没走到这里"
 * - 不显示 masteryProb 百分比
 */

"use client";

import { parseISO } from "date-fns";

interface DetailNode {
  nodeId: string;
  name: string;
  status: string;
  masteryProb: number;
  judgeCriteria: string | null;
  sampleItem: string | null;
  teachingNotes: string | null;
  lastEvidence: string | null;
  isFrontier: boolean;
}

interface Props {
  node: DetailNode;
  onClose: () => void;
  nextLabel?: "下一个" | "可以先看";
  caseEvidenceCount?: number;
}

export default function KnowledgeDetailCard({
  node,
  onClose,
  nextLabel = "下一个",
  caseEvidenceCount = 0,
}: Props) {
  const isStable = node.status === "stable";
  const isFrontier = node.isFrontier;
  const isUnexplored = !isStable && !isFrontier;

  // 格式化日期："X 月 X 日"
  let formattedDate: string | null = null;
  if (node.lastEvidence) {
    try {
      const date = parseISO(node.lastEvidence);
      formattedDate = `${date.getMonth() + 1}月${date.getDate()}日`;
    } catch {
      formattedDate = node.lastEvidence;
    }
  }

  // 截取 teachingNotes 前 60 字作为描述
  const description =
    node.teachingNotes && node.teachingNotes.length > 0
      ? node.teachingNotes.slice(0, 60) +
        (node.teachingNotes.length > 60 ? "…" : "")
      : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-center">
      {/* 半透明遮罩 */}
      <div
        className="absolute inset-0 bg-black/10"
        onClick={onClose}
        aria-label="关闭详情"
      />

      {/* 卡片 */}
      <div
        className="relative w-full max-w-md rounded-t-2xl bg-[#FFFDF9] shadow-[0_-8px_40px_rgba(90,80,66,0.18)] border-t border-[#EFE8DD] px-5 pt-3 pb-8 animate-slide-up"
        role="dialog"
        aria-label={`知识点详情：${node.name}`}
      >
        {/* Grip 拖动条 */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#EFE8DD]" />

        {/* 节点名称 + 状态圆点 */}
        <div className="flex items-center gap-2.5">
          {isStable && (
            <span className="inline-block h-3 w-3 flex-none rounded-full bg-[#6BBF8A] shadow-[0_0_0_4px_rgba(107,191,138,0.2),0_0_12px_rgba(107,191,138,0.55)]" />
          )}
          {isFrontier && (
            <span className="inline-block h-3.5 w-3.5 flex-none rounded-full bg-[#F2F8FC] border-2 border-dashed border-[#93B8D6]" />
          )}
          {isUnexplored && (
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-[#D9D1C3]" />
          )}
          <h3 className="text-lg font-semibold text-[#403A33]">{node.name}</h3>
        </div>

        {/* 前沿提示 */}
        {isFrontier && (
          <p className="mt-2 text-sm font-medium text-[#5E86A8]">
            {nextLabel}：{node.name}
          </p>
        )}

        {/* 未探索提示 */}
        {isUnexplored && (
          <p className="mt-2 text-sm text-[#8C857B]">还没走到这里</p>
        )}

        {/* 描述 */}
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-[#8C857B]">
            {description}
          </p>
        )}

        {/* 分隔线 */}
        {description && <div className="my-3 h-px bg-[#EFE8DD]" />}

        {/* 判定标准 */}
        {node.judgeCriteria && (
          <div className="mt-2 flex gap-2 text-sm">
            <span className="w-14 flex-none text-[#B4ADA3]">判定标准</span>
            <span className="text-[#403A33]">{node.judgeCriteria}</span>
          </div>
        )}

        {/* 示例题目 */}
        {node.sampleItem && (
          <div className="mt-2 flex gap-2 text-sm">
            <span className="w-14 flex-none text-[#B4ADA3]">例题</span>
            <span className="font-serif text-[#403A33]">{node.sampleItem}</span>
          </div>
        )}

        {/* 最近确认日期 */}
        {formattedDate && (
          <p className="mt-3 text-sm font-medium text-[#E5B570]">
            ✦ 你是在 {formattedDate} 点亮的
          </p>
        )}

        {/* 收过题计数 */}
        {caseEvidenceCount > 0 && (
          <p className="mt-1 text-xs text-[#B8AFA6]">
            （收过 {caseEvidenceCount} 道错题）
          </p>
        )}
      </div>
    </div>
  );
}
