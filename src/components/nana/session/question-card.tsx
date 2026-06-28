/**
 * QuestionCard — 答题卡片组件
 *
 * 参考 05-quiz.html 帧 1 + 帧 2 + 帧 3（跳过态）。
 * 支持：选择题（如有 options）、填空/解答（textarea）、跳过态。
 *
 * Props:
 * - stem: 题目内容
 * - answerKey: 参考答案（只用于跳过态中显示 "已收起" 时标识题目仅读）
 * - questionIndex: 当前第几题 (0-based)
 * - totalQuestions: 总题数
 * - isSkipped: 是否已跳过的状态
 * - onAnswer: (answer: string) => void 用户作答
 * - onSkip: () => void 用户点击跳过
 * - onNext: () => void 跳过态后点击 "下一道"
 */
"use client";

import { useState, useRef, useEffect } from "react";

interface QuestionCardProps {
  stem: string;
  questionIndex: number;
  totalQuestions: number;
  progressDots: ("done" | "current" | "pending")[];
  isSkipped: boolean;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  onNext: () => void;
}

export function QuestionCard({
  stem,
  questionIndex,
  totalQuestions,
  progressDots,
  isSkipped,
  onAnswer,
  onSkip,
  onNext,
}: QuestionCardProps) {
  const [input, setInput] = useState("");
  const [showSkipNote, setShowSkipNote] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 切换跳过态时重置本地状态
  useEffect(() => {
    if (isSkipped) {
      setShowSkipNote(true);
    } else {
      setShowSkipNote(false);
    }
  }, [isSkipped, questionIndex]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onAnswer(input.trim());
    setInput("");
  };

  const handleSkip = () => {
    setShowSkipNote(true);
    onSkip();
  };

  // 跳过态 → 温和接纳 UI
  if (isSkipped) {
    return (
      <div className="flex flex-1 flex-col">
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
            第 {questionIndex + 1} 个，共 {totalQuestions} 个
          </span>
        </div>

        {/* 题目（半透明） */}
        <div className="mb-5 text-lg leading-relaxed text-[#B4ADA3]">{stem}</div>

        {/* 跳过接纳卡 */}
        <div className="flex gap-4 rounded-2xl bg-[#EAF2EC] p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#DCEBE0]">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5E8868"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="text-sm leading-relaxed text-[#5E8868]">
            好，<b>先帮你收起来了。</b>等你把前面几步点亮，再回头看它，会比现在轻松很多。
          </div>
        </div>

        {/* 按钮 */}
        <div className="mt-auto space-y-2 pt-6">
          <button
            className="w-full rounded-full bg-white px-6 py-3.5 text-sm font-medium text-[#5E8868] shadow-sm transition-all hover:shadow-md"
            disabled
          >
            已收起 · 还没学这个 ✓
          </button>
          <button
            onClick={onNext}
            className="w-full rounded-full bg-[#5E8868] px-6 py-3.5 text-base font-medium text-white shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-all hover:shadow-[0_10px_22px_rgba(94,136,104,0.34)] active:scale-[0.98]"
          >
            下一道 →
          </button>
        </div>
      </div>
    );
  }

  // 正常答题态
  return (
    <div className="flex flex-1 flex-col">
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
          第 {questionIndex + 1} 个，共 {totalQuestions} 个
        </span>
      </div>

      {/* 题目 */}
      <div className="mb-5 text-lg leading-relaxed text-[#403A33]">{stem}</div>

      {/* 输入区 */}
      <div className="mb-4">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="凭感觉写就好，写一半也算，我都看得到。"
          className="min-h-[130px] w-full resize-none rounded-2xl border border-[#EFE8DD] bg-[#FFFDF9] p-4 text-base leading-relaxed text-[#403A33] placeholder-[#B4ADA3] outline-none transition-colors focus:border-[#7FA886]"
        />
        <div className="mt-2 flex items-center gap-2 text-sm text-[#5E8868]">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8a2 2 0 0 1 2-2h2l1-1.5h6L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            <circle cx="12" cy="12.5" r="3" />
          </svg>
          手写在纸上？拍下来也行
        </div>
      </div>

      {/* 按钮区 */}
      <div className="mt-auto space-y-2 pt-2">
        <button
          onClick={handleSkip}
          className="w-full py-2 text-center text-sm text-[#B4ADA3] transition-colors hover:text-[#8C857B]"
        >
          还没学这个，先跳过
        </button>
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="w-full rounded-full bg-[#5E8868] px-6 py-3.5 text-base font-medium text-white shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-all hover:shadow-[0_10px_22px_rgba(94,136,104,0.34)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          记一下这道
        </button>
      </div>
    </div>
  );
}
