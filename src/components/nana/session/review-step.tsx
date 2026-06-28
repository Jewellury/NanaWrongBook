/**
 * ReviewStep — 核对一下步骤组件
 *
 * 学生/大人对照 answerKey 逐道手动标记：
 * - "这道过了 ✓"（correct: true）
 * - "这道还卡着 ✗"（correct: false）
 *
 * Props:
 * - stem: 题目内容（只读）
 * - answerKey: 参考答案文本
 * - nodeName: 知识点名称
 * - reviewIndex: 当前第几道 (0-based)
 * - totalReviews: 总道数
 * - progressDots: 进度点状态数组
 * - onMark: (correct: boolean) => void
 */
"use client";

interface ReviewStepProps {
  stem: string;
  answerKey: string;
  nodeName?: string;
  reviewIndex: number;
  totalReviews: number;
  progressDots: ("done" | "current" | "pending")[];
  onMark: (correct: boolean) => void;
}

export function ReviewStep({
  stem,
  answerKey,
  nodeName,
  reviewIndex,
  totalReviews,
  progressDots,
  onMark,
}: ReviewStepProps) {
  return (
    <div className="flex flex-1 flex-col">
      {/* 核对标题 */}
      <h2 className="mb-1 text-xl font-bold text-[#2C2C2C]">核对一下</h2>
      <p className="mb-4 text-sm text-[#6B625A]">
        对照答案看看你的思路是不是走对了
      </p>

      {/* 进度点 */}
      <div className="mb-5 flex items-center gap-2">
        {progressDots.map((dot, i) => (
          <span
            key={i}
            className={`rounded-full ${
              dot === "current"
                ? "h-3 w-3 bg-[#7FA886] shadow-[0_0_0_4px_rgba(127,168,134,0.18)]"
                : dot === "done"
                  ? "h-2.5 w-2.5 bg-[#6BBF8A]"
                  : "h-2.5 w-2.5 bg-[#EFE8DD]"
            }`}
          />
        ))}
        <span className="ml-2 text-sm text-[#8C857B]">
          第 {reviewIndex + 1} 个，共 {totalReviews} 个
        </span>
      </div>

      {/* 知识点标签 */}
      {nodeName && (
        <div className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full bg-[#EAF2EC] px-3 py-1 text-xs font-medium text-[#5E8868]">
          <span className="size-1.5 rounded-full bg-[#6BBF8A]" />
          {nodeName}
        </div>
      )}

      {/* 题目（只读） */}
      <div className="mb-4 rounded-2xl border border-[#EFE8DD] bg-[#FFFDF9] p-4">
        <div className="mb-2 text-xs font-medium text-[#8C857B]">题目</div>
        <div className="text-base leading-relaxed text-[#403A33]">{stem}</div>
      </div>

      {/* 参考答案 */}
      <div className="mb-6 rounded-2xl border border-[#DCEBE0] bg-[#F2F9F3] p-4">
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[#7FA886] px-2.5 py-0.5 text-xs font-medium text-white">
          参考答案
        </div>
        <div className="text-base leading-relaxed text-[#403A33]">
          {answerKey}
        </div>
      </div>

      {/* 按钮区 */}
      <div className="mt-auto space-y-3 pt-4">
        <div className="flex gap-3">
          <button
            onClick={() => onMark(false)}
            className="flex-1 rounded-2xl bg-[#FDF0EE] px-4 py-4 text-base font-medium text-[#B35C4A] transition-all hover:bg-[#FAE3DF] active:scale-[0.98]"
          >
            这道还卡着 ✗
          </button>
          <button
            onClick={() => onMark(true)}
            className="flex-1 rounded-2xl bg-[#EAF2EC] px-4 py-4 text-base font-medium text-[#5E8868] transition-all hover:bg-[#DCEBE0] active:scale-[0.98]"
          >
            这道过了 ✓
          </button>
        </div>
      </div>
    </div>
  );
}
