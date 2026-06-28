/**
 * VoiceRecorder — 录音控件壳
 *
 * 三态：idle → recording → completed
 * 内部定义 AsrProvider 抽象接口 + MockAsrProvider 实现。
 *
 * Props:
 * - onTranscriptComplete?: (text: string) => void
 *
 * 措辞合规（P4）：
 * - "说说看" ✓（禁用"开始录音"）
 * - "我听完了" ✓（禁用"停止"）
 * - "想到哪说到哪，不用完整" ✓
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MOCK_TRANSCRIPT } from "./mock-data";

// ─── AsrProvider 抽象接口 ──────────────────────
// 供第 5 阶段替换为真实 ASR 实现
interface AsrProvider {
  streamTranscribe(audio: Blob, onText: (t: string) => void): Promise<void>;
  fileTranscribe(audio: Blob): Promise<string>;
}

// ─── MockAsrProvider ───────────────────────────
// 延迟 2-3 秒后逐行返回预定义文本
class MockAsrProvider implements AsrProvider {
  async streamTranscribe(_audio: Blob, onText: (t: string) => void): Promise<void> {
    for (let i = 0; i < MOCK_TRANSCRIPT.length; i++) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
      onText(MOCK_TRANSCRIPT[i] ?? "");
    }
  }

  async fileTranscribe(_audio: Blob): Promise<string> {
    await new Promise((r) => setTimeout(r, 1500));
    return MOCK_TRANSCRIPT.join("\n");
  }
}

// ─── 类型 ─────────────────────────────────────

type RecorderState = "idle" | "recording" | "completed";

interface VoiceRecorderProps {
  onTranscriptComplete?: (text: string) => void;
}

// ─── 波形柱状条 ───────────────────────────────
// 20 条不同高度 / 延迟的 CSS 动画柱
const WAVE_BARS = Array.from({ length: 20 }, (_, i) => ({
  key: i,
  delay: `${-(0.05 * i).toFixed(2)}s`,
  duration: `${(0.9 + Math.random() * 0.5).toFixed(2)}s`,
}));

// ─── 组件 ─────────────────────────────────────

export function VoiceRecorder({ onTranscriptComplete }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [displayLines, setDisplayLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState<string>("");
  const asrRef = useRef<AsrProvider | null>(null);

  // 初始化 MockAsrProvider
  useEffect(() => {
    asrRef.current = new MockAsrProvider();
  }, []);

  const handleStartRecording = useCallback(() => {
    setState("recording");
    setDisplayLines([]);
    setCurrentLine("");

    // 模拟 ASR 流式转写
    const asr = asrRef.current;
    if (asr) {
      asr
        .streamTranscribe(new Blob(), (text) => {
          setCurrentLine(text);
          setDisplayLines((prev) => [...prev, text]);
        })
        .then(() => {
          // 流结束后，清除当前行
          setCurrentLine("");
        })
        .catch(() => {
          // 静默处理 mock 错误
        });
    }
  }, []);

  const handleFinishRecording = useCallback(() => {
    setState("completed");
    const fullText = displayLines.join("\n");
    // 延迟 300ms 再触发完成回调，让组件有时间渲染 completed 态
    setTimeout(() => {
      onTranscriptComplete?.(fullText);
    }, 300);
  }, [displayLines, onTranscriptComplete]);

  // ─── idle 态 ───────────────────────────────
  if (state === "idle") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {/* 绿色录音按钮 */}
        <button
          type="button"
          onClick={handleStartRecording}
          className="flex size-[88px] items-center justify-center rounded-full bg-[#7FA886] shadow-[0_0_0_8px_rgba(127,168,134,0.16),0_10px_24px_rgba(94,136,104,0.32)] transition-transform hover:scale-105 active:scale-95"
          aria-label="说说看"
        >
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFDF9"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
        </button>

        {/* "说说看" 手写体文案 */}
        <p className="font-['LXGW_WenKai','PingFang_SC',sans-serif] text-[21px] text-[#5E8868]">
          说说看
        </p>

        {/* 副标题 */}
        <p className="text-[13.5px] text-[#8C857B]">
          想到哪说到哪，不用完整。
        </p>
      </div>
    );
  }

  // ─── recording 态 ───────────────────────────
  if (state === "recording") {
    return (
      <div className="flex flex-1 flex-col">
        {/* "正在听你说" + 闪烁圆点 */}
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="text-[14px] text-[#5E8868]">正在听你说</span>
          <span className="flex gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block size-[5px] animate-pulse rounded-full bg-[#6BBF8A]"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  opacity: 0.25,
                }}
              />
            ))}
          </span>
        </div>

        {/* 波形动画 */}
        <div className="flex h-[46px] items-center justify-center gap-[3px]">
          {WAVE_BARS.map((bar) => (
            <span
              key={bar.key}
              className="w-[4px] rounded-[3px] bg-[#8FBE9C]"
              style={{
                height: "38px",
                transform: "scaleY(0.4)",
                transformOrigin: "center",
                animation: `waveAnim 1.1s ease-in-out infinite`,
                animationDelay: bar.delay,
                animationDuration: bar.duration,
              }}
            />
          ))}
        </div>

        {/* Mock 转写文字逐行出现 */}
        <div className="flex flex-1 flex-col justify-end gap-[2px] overflow-hidden px-2">
          {displayLines.map((line, i) => (
            <div
              key={i}
              className={`text-[14px] leading-relaxed ${
                i === displayLines.length - 1 && !currentLine
                  ? "animate-fadeIn text-[#403A33]"
                  : i === displayLines.length - 1
                    ? "animate-fadeIn text-[#403A33]"
                    : "text-[#8C857B] opacity-55"
              }`}
            >
              {line}
            </div>
          ))}
          {currentLine && (
            <div className="animate-fadeIn text-[14px] leading-relaxed text-[#403A33]">
              {currentLine}
            </div>
          )}
        </div>

        {/* "我听完了" 按钮 */}
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={handleFinishRecording}
            className="flex items-center gap-2 rounded-full bg-[#5E8868] px-[34px] py-[13px] text-[15.5px] font-medium text-[#FFFDF9] shadow-[0_8px_18px_rgba(94,136,104,0.3)] transition-transform hover:scale-[1.02] active:scale-95"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFDF9"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            我听完了
          </button>
        </div>
      </div>
    );
  }

  // ─── completed 态 ──────────────────────────
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-2 text-[#5E8868]">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#5E8868"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="font-medium">我听完了</span>
      </div>
      <p className="text-[13.5px] text-[#8C857B]">
        正在整理你说的内容…
      </p>
    </div>
  );
}
