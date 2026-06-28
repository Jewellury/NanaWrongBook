/**
 * 采集壳主页面（客户端组件）
 *
 * 布局结构（4 分区）：
 * 1. 顶栏：← 返回 / 这道题 / 重拍 📷
 * 2. 题图区域（固定 ~52% 高度，不含滚动）
 * 3. 三 tab：[讲讲思路] [我的话] [帮你整理]
 * 4. 下半屏 tab 内容区 + 底部已拍计数/操作按钮
 *
 * Tab 切换逻辑：
 * - 默认 tab = "讲讲思路"
 * - 录音完成后自动切换到"帮你整理"tab（3 秒内）
 * - 可手动在三个 tab 间切换
 *
 * 措辞合规（P4）：
 * - "说说看" ✓（禁用"开始录音"）
 * - "我听完了" ✓（禁用"停止"）
 * - "再拍一道" ✓（禁用"下一题"）
 * - "已拍 N 道" ✓（禁用"你还有 N 题未完成"）
 * - "拍了 N 道了，开始诊断？" ✓（禁用"够了，开始诊断"）
 * - "不是终诊 · 这只是初步线索" ✓（禁用"诊断结论""薄弱"）
 */

"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { QuestionImageViewer } from "@/components/nana/capture/question-image-viewer";
import { VoiceRecorder } from "@/components/nana/capture/voice-recorder";
import { TranscriptionPanel } from "@/components/nana/capture/transcription-panel";
import { LightFeedback } from "@/components/nana/capture/light-feedback";
import type { FeedbackData } from "@/components/nana/capture/light-feedback";
import {
  MOCK_QUESTION,
  MOCK_TRANSCRIPT,
  MOCK_FEEDBACK,
  joinTranscript,
} from "@/components/nana/capture/mock-data";

// ─── Tab 定义 ─────────────────────────────────

type TabId = "voice" | "transcript" | "feedback";

interface TabItem {
  id: TabId;
  label: string;
}

const TABS: TabItem[] = [
  { id: "voice", label: "讲讲思路" },
  { id: "transcript", label: "我的话" },
  { id: "feedback", label: "帮你整理" },
];

// ─── 主组件 ──────────────────────────────────

export default function CapturePage() {
  // 核心状态
  const [currentTab, setCurrentTab] = useState<TabId>("voice");
  const [captureCount, setCaptureCount] = useState(0);
  const [transcriptText, setTranscriptText] = useState(
    () => joinTranscript(MOCK_TRANSCRIPT),
  );
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const autoSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 录音完成回调 ──────────────────────────

  const handleTranscriptComplete = useCallback(
    (text: string) => {
      setTranscriptText(text);
      setFeedbackData(null); // 先清空，显示骨架
      setIsProcessing(true);

      // 模拟 AI 处理延迟
      autoSwitchTimerRef.current = setTimeout(() => {
        setFeedbackData(MOCK_FEEDBACK);
        setIsProcessing(false);
        // 自动切换到"帮你整理"tab
        setCurrentTab("feedback");
        autoSwitchTimerRef.current = null;
      }, 2000);
    },
    [],
  );

  // ─── 逐字稿编辑回调 ────────────────────────

  const handleTranscriptChange = useCallback((text: string) => {
    setTranscriptText(text);
  }, []);

  // ─── "再拍一道" ────────────────────────────

  const handleRetake = useCallback(() => {
    // 重置采集页状态
    setCurrentTab("voice");
    setTranscriptText(joinTranscript(MOCK_TRANSCRIPT));
    setFeedbackData(null);
    setIsProcessing(false);
    setCaptureCount((prev) => prev + 1);

    // 清除自动切换计时器
    if (autoSwitchTimerRef.current) {
      clearTimeout(autoSwitchTimerRef.current);
      autoSwitchTimerRef.current = null;
    }
  }, []);

  // 当 feedback tab 已展示时，再拍一道按钮需要显示在 feedback tab 底部
  const showRetakeButton = currentTab === "feedback" && feedbackData !== null;
  const canStartDiagnosis = captureCount + 1 >= 3; // +1 because we count the current one

  // ─── 渲染 ─────────────────────────────────

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-[#FBF7F0]">
      {/* 自定义动画 keyframes */}
      <style>{`
        @keyframes waveAnim {
          0%, 100% { transform: scaleY(0.32); }
          50% { transform: scaleY(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes blink {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease both;
        }
        .animate-blink {
          animation: blink 1.4s ease-in-out infinite;
        }
        .animate-wave {
          animation: waveAnim 1.1s ease-in-out infinite;
        }
      `}</style>

      {/* ═══ 1. 顶栏 ═══ */}
      <div className="flex h-[42px] shrink-0 items-center justify-between px-[18px]">
        {/* 返回按钮 */}
        <Link
          href="/nana"
          className="flex items-center gap-1 text-[13.5px] text-[#8C857B] transition-colors hover:text-[#403A33]"
        >
          <ArrowLeft className="size-[18px]" strokeWidth={2} />
        </Link>

        {/* 标题 */}
        <span className="text-[15px] font-semibold text-[#403A33]">
          这道题
        </span>

        {/* 重拍按钮 */}
        <button
          type="button"
          className="flex items-center gap-1 text-[13.5px] text-[#8C857B] transition-colors hover:text-[#403A33]"
          onClick={handleRetake}
          aria-label="重拍"
        >
          <Camera className="size-[16px]" strokeWidth={1.8} />
          重拍
        </button>
      </div>

      {/* ═══ 2. 题图区域（固定 ~52% 高度） ═══ */}
      <div className="h-[52vh] min-h-[280px] shrink-0 border-b border-[#E4DACB] bg-[#EFE7DA]">
        <QuestionImageViewer stem={MOCK_QUESTION.stem} />
      </div>

      {/* ═══ 3. 三 tab ═══ */}
      <div className="flex shrink-0 border-b border-[#EFE8DD] px-[22px]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCurrentTab(tab.id)}
            className={`relative flex-1 pb-[11px] pt-[13px] text-center text-[14.5px] transition-colors ${
              currentTab === tab.id
                ? "font-semibold text-[#5E8868]"
                : "text-[#B4ADA3] hover:text-[#8C857B]"
            }`}
          >
            {tab.label}
            {/* 激活指示器 */}
            {currentTab === tab.id && (
              <span className="absolute bottom-[-1px] left-1/2 h-[3px] w-[30px] -translate-x-1/2 rounded-full bg-[#6BBF8A]" />
            )}
          </button>
        ))}
      </div>

      {/* ═══ 4. Tab 内容区 + 底部 ═══ */}
      <div className="flex flex-1 flex-col px-[22px] pb-5 pt-[18px]">
        {/* Tab 内容 */}
        {currentTab === "voice" && (
          <VoiceRecorder
            onTranscriptComplete={handleTranscriptComplete}
          />
        )}

        {currentTab === "transcript" && (
          <TranscriptionPanel
            text={transcriptText}
            onChange={handleTranscriptChange}
          />
        )}

        {currentTab === "feedback" && (
          <>
            <LightFeedback
              feedback={feedbackData}
              isPreliminary
            />

            {/* 已拍计数 + 操作按钮 */}
            <div className="mt-4 space-y-3">
              {/* 已拍计数 */}
              <div className="text-center text-[13.5px] text-[#8C857B]">
                已拍 {captureCount + 1} 道
              </div>

              {/* "再拍一道" 按钮 */}
              <button
                type="button"
                onClick={handleRetake}
                className="w-full rounded-[18px] bg-[#7FA886] px-5 py-[14px] text-[15.5px] font-medium text-[#FFFDF9] shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-transform hover:scale-[1.02] active:scale-95"
              >
                再拍一道
              </button>

              {/* N≥3 时显示 "开始诊断" */}
              {canStartDiagnosis && (
                <div className="text-center">
                  <Link
                    href="/nana/session"
                    className="inline-flex items-center gap-2 text-[14px] font-medium text-[#5E8868] transition-colors hover:text-[#403A33]"
                  >
                    拍了 {captureCount + 1} 道了，开始诊断？
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              )}
            </div>
          </>
        )}

        {/* 非 feedback tab 的底部提示 */}
        {currentTab !== "feedback" && (
          <div className="mt-auto pt-4">
            <div className="text-center text-[13.5px] text-[#8C857B]">
              已拍 {captureCount} 道
              {captureCount > 0 && (
                <span className="ml-1">
                  · 再拍 {Math.max(0, 3 - captureCount)} 道就能看看有没有规律
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
