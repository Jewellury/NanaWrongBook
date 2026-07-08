/**
 * AiResultCard — AI 整理结果卡
 *
 * 展示 /process 返回的 AI 整理结果：摘要、课本分类、轻反馈、可能方向、下一步建议。
 * 空值字段自动隐藏（不占位）。
 *
 * 措辞合规（OPS §4 + 计划 §9.3）：
 * - "AI 摘要" ✓（禁用"诊断完成""识别出了完整题目"）
 * - "可能属于" ✓（禁用"分类结果"）
 * - "可能的方向" ✓（禁用"错因""错误"）
 * - "下一步可以" ✓（禁用"你需要"）
 * - 失败时"没整理成功，可以再试一次" ✓（禁用"错误""失败"）
 *
 * Props:
 * - result: CaseProcessResult — /process 返回的结果
 * - onRetry?: () => void — 失败时点击"再试一次"
 */

"use client";

import { Sparkles, BookMarked, Lightbulb, ArrowRight, RotateCcw, Mic } from "lucide-react";
import type { CaseProcessResult } from "@/lib/nana/nana-api-client";

interface AiResultCardProps {
  result: CaseProcessResult;
  onRetry?: () => void;
}

// ─── 失败状态 ──────────────────────────────────

function FailedState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <p className="text-[14px] text-[#8C857B]">
        没整理成功，可以再试一次
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF8F0] px-4 py-2 text-[13px] font-medium text-[#D4913A] border border-[#E8A33D]/30 transition-transform active:scale-95"
        >
          <RotateCcw className="size-3.5" />
          再试一次
        </button>
      )}
    </div>
  );
}

// ─── 成功状态 ──────────────────────────────────

function SuccessContent({ result }: { result: CaseProcessResult }) {
  return (
    <div className="space-y-3">
      {/* AI 摘要 */}
      {result.questionSummary && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8C857B]">
            <Sparkles className="size-3 text-[#5E8868]" />
            AI 摘要
          </div>
          <p className="mt-1 text-[14px] leading-[1.7] text-[#403A33]">
            {result.questionSummary}
          </p>
        </div>
      )}

      {/* 转写文字 / 音频状态 */}
      {result.audioStatus && result.audioStatus !== "skipped" && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8C857B]">
            <Mic className="size-3 text-[#5E8868]" />
            我说了
          </div>
          {result.audioStatus === "success" && result.transcript ? (
            <p className="mt-1 text-[14px] leading-[1.7] text-[#403A33]">
              {result.transcript}
            </p>
          ) : result.audioStatus === "failed" ? (
            <p className="mt-1 text-[13px] leading-[1.7] text-[#8C857B]">
              语音没转成功，题已经整理好了
            </p>
          ) : result.audioStatus === "timeout" ? (
            <p className="mt-1 text-[13px] leading-[1.7] text-[#8C857B]">
              语音转写超时了，题已经整理好了
            </p>
          ) : null}
        </div>
      )}

      {/* 课本分类 */}
      {result.textbookTopic && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8C857B]">
            <BookMarked className="size-3 text-[#5E8868]" />
            可能属于
          </div>
          <div className="mt-1">
            <span className="inline-flex items-center rounded-full bg-[#EAF2EC] px-3 py-1 text-[12px] text-[#5E8868]">
              {result.textbookTopic.name}
            </span>
          </div>
        </div>
      )}

      {/* 轻反馈 */}
      {result.feedback && (
        <div className="rounded-lg bg-[#F5F1EA] px-3 py-2">
          <p className="text-[13px] leading-[1.7] text-[#5E8868]">
            {result.feedback}
          </p>
        </div>
      )}

      {/* 可能的方向 */}
      {result.possibleMistakeReason && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8C857B]">
            <Lightbulb className="size-3 text-[#E8A33D]" />
            可能的方向
          </div>
          <p className="mt-1 text-[13px] leading-[1.7] text-[#8C857B]">
            {result.possibleMistakeReason}
          </p>
        </div>
      )}

      {/* 下一步建议 */}
      {result.nextActionSuggestion && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8C857B]">
            <ArrowRight className="size-3 text-[#5E8868]" />
            下一步可以
          </div>
          <p className="mt-1 text-[13px] leading-[1.7] text-[#403A33]">
            {result.nextActionSuggestion}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────

export function AiResultCard({ result, onRetry }: AiResultCardProps) {
  // failed / timeout → 失败状态
  if (result.status === "failed" || result.status === "timeout") {
    return <FailedState onRetry={onRetry} />;
  }

  // success → 展示结果
  // pending → 不应该到此组件（由调用方处理 loading 态），但防御性渲染空
  if (result.status === "success") {
    return <SuccessContent result={result} />;
  }

  return null;
}
