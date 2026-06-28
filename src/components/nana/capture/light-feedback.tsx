/**
 * LightFeedback — 单题轻反馈展示区
 *
 * 用途：录音完成后展示"帮你整理"内容。
 * 连接 POST /api/nana/cases/:id/feedback 获取关键词匹配 hint。
 *
 * Props:
 * - transcript: string — 逐字稿文本
 * - caseId?: string — case ID（可选，预备未来场景）
 *
 * 状态:
 * - loading: 显示"正在看你的描述…"
 * - loaded: 显示 hint + tags + "不是终诊"标识
 * - error: 显示 fallback "这条先记下来了"
 *
 * 措辞合规（P4）：
 * - "这只是初步线索" ✓（禁用"诊断结论"）
 * - 不出现掌握度/百分比/分数 ✓
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

export interface FeedbackData {
  hint: string;
  relatedTags: string[];
}

interface LightFeedbackProps {
  transcript: string;
  caseId?: string;
}

type FeedbackState = "loading" | "loaded" | "error";

// ─── 加载骨架 ──────────────────────────────────

function LoadingSkeleton() {
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

// ─── 错误 Fallback ─────────────────────────────

function ErrorFallback() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <p className="text-[14.5px] leading-[1.75] text-[#8C857B]">
        这条先记下来了
      </p>
    </div>
  );
}

// ─── 反馈内容 ──────────────────────────────────

function FeedbackContent({
  hint,
  relatedTags,
}: FeedbackData) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-auto">
        {/* 不是终诊标识 */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF0DC] px-3 py-1 text-[12px] font-medium text-[#9A7B3C]">
          <Sparkles className="size-3" />
          不是终诊 · 这只是初步线索
        </span>

        {/* 反馈文案 */}
        <p className="mt-3 animate-fadeIn text-[14.5px] leading-[1.75] text-[#403A33]">
          {hint}
        </p>

        {/* 相关标签 */}
        {relatedTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {relatedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex animate-fadeIn items-center gap-1.5 rounded-full bg-[#EAF2EC] px-3 py-1 text-[12px] text-[#5E8868]"
                style={{ animationDelay: "0.3s" }}
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

// ─── 主组件 ──────────────────────────────────

export function LightFeedback({
  transcript,
  caseId,
}: LightFeedbackProps) {
  const [state, setState] = useState<FeedbackState>("loading");
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // 重置状态
    setState("loading");
    setFeedback(null);
    fetchedRef.current = false;

    if (!transcript) {
      setState("loaded");
      setFeedback(null);
      return;
    }

    let cancelled = false;

    async function fetchFeedback() {
      try {
        // 使用 caseId 或 fallback ID；本阶段 we may not have a real caseId
        const id = caseId || "__preliminary__";
        const res = await fetch(`/api/nana/cases/${id}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        });

        if (cancelled) return;

        if (!res.ok) {
          setState("error");
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        setFeedback({ hint: data.hint, relatedTags: data.relatedTags ?? [] });
        setState("loaded");
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    fetchFeedback();

    return () => {
      cancelled = true;
    };
  }, [transcript, caseId]);

  // ─── 渲染 ─────────────────────────────────
  if (state === "loading") return <LoadingSkeleton />;
  if (state === "error") return <ErrorFallback />;

  // loaded
  if (feedback) {
    return (
      <FeedbackContent
        hint={feedback.hint}
        relatedTags={feedback.relatedTags}
      />
    );
  }

  // loaded but no feedback data (空 transcript 时)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <p className="text-[14.5px] leading-[1.75] text-[#8C857B]">
        收到这道题。你谈到的这些都帮你记下来了，再拍几道后我们一起看看有没有规律。
      </p>
    </div>
  );
}
