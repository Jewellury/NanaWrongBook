/**
 * ReportKnowledgeCard — 知识点卡片组件
 *
 * 渲染单个知识点状态卡片：
 * - 绿色圆点（已过）/ 灰色圆点（还卡着）
 * - 知识点口语名称
 * - 判定标准（judgeCriteria）
 * - 标签："这道已经过了 ✓" / "这道还卡着 ✗"
 *
 * Props:
 * - name: 知识点口语名称（如"求函数定义域"）
 * - judgeCriteria: 判定标准文字（如"能求简单解析式"）
 * - passed: true="已过" false="还卡着"
 */
"use client";

interface ReportKnowledgeCardProps {
  name: string;
  judgeCriteria: string | null;
  passed: boolean;
}

export function ReportKnowledgeCard({
  name,
  judgeCriteria,
  passed,
}: ReportKnowledgeCardProps) {
  return (
    <div className="rounded-2xl border border-[#EFE8DD] bg-[#FFFDF9] p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-3">
        {/* 状态圆点：绿色（已过）/ 灰色（还卡着） */}
        <span
          className={`mt-1 inline-block size-3 shrink-0 rounded-full ${
            passed
              ? "bg-[#6BBF8A] shadow-[0_0_0_4px_rgba(107,191,138,0.2)]"
              : "bg-[#D9D1C3]"
          }`}
        />

        <div className="min-w-0 flex-1">
          {/* 知识点名称 */}
          <h3 className="text-base font-semibold text-[#403A33]">{name}</h3>

          {/* 判定标准 */}
          {judgeCriteria && (
            <p className="mt-1 text-sm leading-relaxed text-[#8C857B]">
              判定：{judgeCriteria}
            </p>
          )}

          {/* 状态标签 */}
          <span
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              passed
                ? "bg-[#EAF2EC] text-[#5E8868]"
                : "bg-[#F3F0ED] text-[#8C857B]"
            }`}
          >
            {passed ? "这道已经过了 ✓" : "这道还卡着 ✗"}
          </span>
        </div>
      </div>
    </div>
  );
}
