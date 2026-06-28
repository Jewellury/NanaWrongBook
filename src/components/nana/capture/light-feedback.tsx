/**
 * LightFeedback — 单题轻反馈展示区
 *
 * 用途：录音完成后展示"帮你整理"内容。
 * 本 commit 搭建 UI 位置和骨架，Commit ④ 再接真实 API。
 *
 * Props:
 * - feedback: FeedbackData | null（null 显示骨架，有值展示反馈）
 * - isPreliminary?: boolean（默认 true，始终标识非终诊）
 *
 * 措辞合规（P4）：
 * - "收到这道题。你谈到的…" ✓（禁用"诊断结论"）
 * - "这只是初步线索" ✓（禁用"终诊""判断""薄弱"）
 * - 不出现掌握度/百分比/分数 ✓
 */

"use client";

import { Sparkles } from "lucide-react";

export interface FeedbackData {
  hint: string;
  relatedTags: string[];
}

interface LightFeedbackProps {
  feedback: FeedbackData | null;
  isPreliminary?: boolean;
}

export function LightFeedback({
  feedback,
  isPreliminary = true,
}: LightFeedbackProps) {
  // ─── 骨架态（feedback === null） ──────────────
  if (!feedback) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-2 text-[#8C857B]">
          <span className="flex gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block size-[5px] animate-pulse rounded-full bg-[#B4ADA3]"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </span>
          <span className="text-[14px]">正在看你的描述…</span>
        </div>
      </div>
    );
  }

  // ─── 反馈展示态 ─────────────────────────────
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-auto">
        {/* 不是终诊标识 */}
        {isPreliminary && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF0DC] px-3 py-1 text-[12px] font-medium text-[#9A7B3C]">
            <Sparkles className="size-3" />
            不是终诊 · 这只是初步线索
          </span>
        )}

        {/* 反馈文案 */}
        <p className="mt-3 text-[14.5px] leading-[1.75] text-[#403A33]">
          {feedback.hint}
        </p>

        {/* 相关标签 */}
        {feedback.relatedTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {feedback.relatedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF2EC] px-3 py-1 text-[12px] text-[#5E8868]"
              >
                <span className="size-[6px] rounded-full bg-[#6BBF8A]" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
