/**
 * 采集壳主页面（客户端组件）—— Phase 1.5 真实采集最小闭环
 *
 * 真实行为：
 * 1. 拍照（QuestionImageCapture：调起相机/相册 → 压缩成 ≤1MB Base64）
 * 2. 可选录音（VoiceRecorder：getUserMedia + MediaRecorder，60s 上限，不转写）
 * 3. 点"收好这道题" → 组装 artifacts → createCase 存库
 * 4. 成功 → "已收好" + 自动触发 AI 整理（Round 4）
 *    失败 → "没存成功，再试一次"（保留数据可重试，铁律 6 不静默）
 * 5. AI 整理中 → 显示"正在帮你整理…"；完成 → 展示 AI 结果卡；失败 → "没整理成功，可以再试一次"
 *
 * 状态机（§7.6 + Round 4）：
 * - photoState = "empty" | "photoTaken"
 * - saveState  = "idle" | "saving" | "saved" | "error"
 * - processState = "idle" | "processing" | "done" | "error"
 * - 门禁：无照片禁保存
 * - 保存成功不被 AI 阻塞（§9.1）：createCase 成功即显示"已收好"
 *
 * 措辞合规（OPS §4，E1/E2 + §9.3）：
 * - 全页无"诊断/已诊断/薄弱/得分/掌握"
 * - AI 卡片用"AI 摘要""可能属于""可能的方向""下一步可以"
 * - 失败时"没整理成功，可以再试一次"，不说"错误"
 */

"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Tag } from "lucide-react";
import { QuestionImageCapture } from "@/components/nana/capture/question-image-capture";
import { VoiceRecorder } from "@/components/nana/capture/voice-recorder";
import { TranscriptionPanel } from "@/components/nana/capture/transcription-panel";
import { AiResultCard } from "@/components/nana/capture/ai-result-card";
import {
  createCase,
  triggerCaseProcess,
  getCaseProcessStatus,
  type ArtifactInput,
  type CaseProcessResult,
} from "@/lib/nana/nana-api-client";
import { PLACEHOLDER_TRANSCRIPT } from "@/lib/nana/transcript-utils";

// ─── 常量 ─────────────────────────────────────
const TOTAL_PAYLOAD_LIMIT = 3 * 1024 * 1024; // 单次保存总 payload 3MB 上限（前端预检）
// Round 4：保存成功即显示"已收好"，AI 整理独立展示（不阻塞保存提示）
const SUCCESS_MSG = "已收好";
const FAILURE_MSG = "没存成功，再试一次";

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

// ─── 工具：Blob → Base64（§7.7）────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ─── 音频 meta 类型 ───────────────────────────
interface AudioMeta {
  durationSec: number;
  mime: string;
  sizeBytes: number;
}

// ─── 主组件 ──────────────────────────────────

export default function CapturePage() {
  // 核心状态
  const [currentTab, setCurrentTab] = useState<TabId>("voice");
  const [captureCount, setCaptureCount] = useState(0);

  // 题图（Base64 或 null=空状态）
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // 录音
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  // recorderKey：换图/保存成功/重拍时 +1 强制 VoiceRecorder remount，
  // 确保内部 state（idle/recording/completed）跟着重置（修复 P1-a）
  const [recorderKey, setRecorderKey] = useState(0);
  // 是否正在录音（修复评审 P1：录音中禁止 tab 切换/换图/保存，避免 recorder 泄漏 + 数据错配）
  const [isRecording, setIsRecording] = useState(false);

  // 保存状态
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // Stage 1：保存成功后改为停留态（显示"去知识地图"+"再拍一道"两个去向），
  // 不再自动 1.4s 重置——用户需要时间点去向按钮（S1-2）
  // 浮动卡状态：保存成功后弹出固定底部卡片，确保小屏可见
  const [toastOpen, setToastOpen] = useState(false);

  // AI 整理状态（Round 4）
  const [processState, setProcessState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [processResult, setProcessResult] = useState<CaseProcessResult | null>(null);
  const [savedCaseId, setSavedCaseId] = useState<string | null>(null);
  // 轮询 cleanup ref（防止 unmount 后继续 setState）
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P1 hotfix：当前正在处理的 caseId ref，用于竞态保护
  // POST/GET 返回时检查 currentCaseIdRef.current === 触发时的 caseId，不一致则丢弃
  const currentCaseIdRef = useRef<string | null>(null);
  // P2-a hotfix：AbortController，组件 unmount 或"再拍一道"时 abort 所有飞行中请求
  const abortControllerRef = useRef<AbortController | null>(null);

  const photoTaken = imageBase64 !== null;

  // ─── 录音完成回调 ──────────────────────────
  const handleAudioReady = useCallback(
    (blob: Blob, meta: AudioMeta) => {
      setAudioBlob(blob);
      setAudioMeta(meta);
    },
    [],
  );

  // ─── 录音状态变化回调（通知父组件是否在录音）──
  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
  }, []);

  // ─── 重置录音 + 录音组件（换图/保存成功/重拍时调用）──
  // 清掉 audioBlob/audioMeta 并强制 VoiceRecorder remount 回 idle（修复 P1-a/P1-b）
  const resetAudioAndRecorder = useCallback(() => {
    setAudioBlob(null);
    setAudioMeta(null);
    setIsRecording(false);
    setRecorderKey((k) => k + 1);
  }, []);

  // ─── 题图变化回调 ──────────────────────────
  const handleImageChange = useCallback((base64: string | null) => {
    setImageBase64(base64);
    // 换图后重置保存态
    setSaveState("idle");
    setSaveMsg(null);
    // 换图清掉旧录音，避免"新题图 + 旧录音"错配（修复 P1-b）
    resetAudioAndRecorder();
  }, [resetAudioAndRecorder]);

  // ─── 组装 artifacts（§7.7 方案 A）──────────
  const buildArtifacts = useCallback(async (): Promise<ArtifactInput[]> => {
    if (!imageBase64) return [];
    const artifacts: ArtifactInput[] = [
      { type: "question_image", content: imageBase64, seq: 0 },
    ];
    let seq = 1;
    if (audioBlob) {
      const audioBase64 = await blobToBase64(audioBlob);
      artifacts.push({ type: "audio_note", content: audioBase64, seq });
      seq += 1;
      artifacts.push({
        type: "audio_meta",
        content: `durationSec=${audioMeta?.durationSec ?? 0};mime=${audioMeta?.mime ?? ""};sizeBytes=${audioMeta?.sizeBytes ?? 0}`,
        seq,
      });
      seq += 1;
    }
    artifacts.push({ type: "transcript", content: PLACEHOLDER_TRANSCRIPT, seq });
    return artifacts;
  }, [imageBase64, audioBlob, audioMeta]);

  // ─── 估算 payload 体积（Base64 字符数 ≈ 字节）──
  const estimatedPayloadBytes = useMemo(() => {
    let total = imageBase64?.length ?? 0;
    // 音频 base64 约 blob.size * 1.37
    if (audioBlob) total += Math.ceil(audioBlob.size * 1.37);
    // audio_meta + transcript 占用很小
    total += 200;
    return total;
  }, [imageBase64, audioBlob]);

  // ─── 保存 ─────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!imageBase64) {
      setSaveMsg("先拍一下这道题");
      return;
    }
    // 录音中禁保存（修复评审 P1：避免保存触发 remount 时 recorder 泄漏）
    if (isRecording) {
      setSaveMsg("先把话说完，再收这道题");
      return;
    }
    // 前端 3MB 预检
    if (estimatedPayloadBytes > TOTAL_PAYLOAD_LIMIT) {
      setSaveState("error");
      setSaveMsg("材料太大，请重新拍一张或录短一些");
      return;
    }

    setSaveState("saving");
    setSaveMsg(null);
    try {
      const artifacts = await buildArtifacts();
      const caseRecord = await createCase(artifacts);
      // 成功：立即显示"已收好"（§9.1：保存不被 AI 阻塞）
      setSaveState("saved");
      setToastOpen(true);
      setCaptureCount((prev) => prev + 1);
      setSavedCaseId(caseRecord.id);

      // Round 4：触发 AI 整理（不阻塞保存成功提示）
      // P1 hotfix：记录当前 caseId + 创建 AbortController
      currentCaseIdRef.current = caseRecord.id;
      abortControllerRef.current?.abort(); // abort 旧的飞行请求
      const ac = new AbortController();
      abortControllerRef.current = ac;
      setProcessState("processing");
      try {
        const result = await triggerCaseProcess(caseRecord.id, ac.signal);
        // P1 hotfix：caseId 不一致则丢弃（用户已"再拍一道"）
        if (currentCaseIdRef.current !== caseRecord.id) return;
        setProcessResult(result);
        setProcessState(result.status === "success" ? "done" : "error");
      } catch (err) {
        // abort 引起的 AbortError 不更新状态
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (currentCaseIdRef.current !== caseRecord.id) return;
        // process 触发失败不阻塞保存——用户可手动重试
        setProcessState("error");
      }
    } catch {
      // 失败：显式报错，保留数据可重试（铁律 6）
      setSaveState("error");
      setSaveMsg(FAILURE_MSG);
    }
  }, [imageBase64, isRecording, estimatedPayloadBytes, buildArtifacts]);

  // ─── AI 整理轮询（Round 4 §9.2）──────────────
  // 触发后如果 POST 已返回但状态不是终态，或 POST 超时，用轮询兜底
  // 停止条件：success / failed / 60 秒超时 / 组件 unmount
  useEffect(() => {
    if (processState !== "processing" || !savedCaseId) return;

    // 如果 processResult 已有终态，不需要轮询
    if (processResult && (processResult.status === "success" || processResult.status === "failed")) {
      return;
    }

    const ac = abortControllerRef.current ?? new AbortController();
    abortControllerRef.current = ac;

    pollRef.current = setInterval(async () => {
      try {
        const result = await getCaseProcessStatus(savedCaseId, ac.signal);
        // P1 hotfix：caseId 不一致则丢弃
        if (currentCaseIdRef.current !== savedCaseId) return;
        if (result.status === "success" || result.status === "failed") {
          setProcessResult(result);
          setProcessState(result.status === "success" ? "done" : "error");
          if (pollRef.current) clearInterval(pollRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        }
      } catch {
        // 轮询失败不立即报错，继续轮询
      }
    }, 3000);

    // 60 秒总超时（§9.2）
    pollTimeoutRef.current = setTimeout(() => {
      setProcessState("error");
      if (pollRef.current) clearInterval(pollRef.current);
    }, 60000);

    // cleanup（§9.2：组件 unmount 时停止，避免离开后继续 setState）
    // P2-a hotfix：同时 abort 飞行中的 fetch
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      ac.abort();
    };
  }, [processState, savedCaseId, processResult]);

  // ─── 重试 AI 整理 ──────────────────────────
  const handleRetryProcess = useCallback(async () => {
    if (!savedCaseId) return;
    // P1 hotfix：重新设置 caseId + AbortController
    currentCaseIdRef.current = savedCaseId;
    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;
    setProcessState("processing");
    setProcessResult(null);
    try {
      const result = await triggerCaseProcess(savedCaseId, ac.signal);
      // P1 hotfix：caseId 不一致则丢弃
      if (currentCaseIdRef.current !== savedCaseId) return;
      setProcessResult(result);
      setProcessState(result.status === "success" ? "done" : "error");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (currentCaseIdRef.current !== savedCaseId) return;
      setProcessState("error");
    }
  }, [savedCaseId]);

  // ─── 切 tab（录音中禁止切走，修复评审 P1）──
  const handleTabChange = useCallback((tab: TabId) => {
    if (isRecording) return;
    setCurrentTab(tab);
  }, [isRecording]);

  // ─── 重置（"再拍一道"快捷入口，未保存时）──
  const handleRetake = useCallback(() => {
    if (isRecording) return; // 录音中禁重拍（修复评审 P1）
    setImageBase64(null);
    resetAudioAndRecorder(); // 清 audio + 重置录音组件（修复 P1-a）
    setSaveState("idle");
    setSaveMsg(null);
    setCurrentTab("voice");
    // Round 4：重置 process 状态（防御性，正常流程 handleRetake 时 processState 应为 idle）
    // P1/P2-a hotfix：abort 飞行请求 + 清除 caseId ref
    abortControllerRef.current?.abort();
    currentCaseIdRef.current = null;
    setProcessState("idle");
    setProcessResult(null);
    setSavedCaseId(null);
  }, [isRecording, resetAudioAndRecorder]);

  // ─── 保存成功后"再拍一道"：重置采集状态 + AI 整理状态（Round 4）──
  const handleTakeAnother = useCallback(() => {
    setImageBase64(null);
    resetAudioAndRecorder();
    setSaveState("idle");
    setSaveMsg(null);
    setToastOpen(false);
    setCurrentTab("voice");
    // Round 4：重置 process 状态
    // P1/P2-a hotfix：abort 飞行请求 + 清除 caseId ref，防止旧请求回来覆盖新状态
    abortControllerRef.current?.abort();
    currentCaseIdRef.current = null;
    setProcessState("idle");
    setProcessResult(null);
    setSavedCaseId(null);
  }, [resetAudioAndRecorder]);

  // ─── 关闭浮动卡，回退显示文档流按钮区 ──
  const handleDismissToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  const saving = saveState === "saving";
  const saved = saveState === "saved";

  // ─── 渲染 ─────────────────────────────────
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#FBF7F0]">
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

        {/* 右侧占位（保持标题居中） */}
        <span className="w-[18px]" />
      </div>

      {/* ═══ 2. 题图区域（固定 ~52% 高度） ═══ */}
      <div className="h-[52vh] min-h-[280px] shrink-0 border-b border-[#E4DACB] bg-[#EFE7DA]">
        <QuestionImageCapture
          value={imageBase64}
          onChange={handleImageChange}
          // 修复评审 P2：保存成功延迟期间 + 录音中，禁止换图（避免新图被旧 timeout 清空 / recorder 泄漏）
          disabled={saving || saveState === "saved" || isRecording}
        />
      </div>

      {/* ═══ 3. 三 tab ═══ */}
      <div className="flex shrink-0 border-b border-[#EFE8DD] px-[22px]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            disabled={isRecording && tab.id !== "voice"}
            className={`relative flex-1 pb-[11px] pt-[13px] text-center text-[14.5px] transition-colors ${
              isRecording && tab.id !== "voice"
                ? "cursor-not-allowed text-[#D8D2C8]"
                : currentTab === tab.id
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
            key={recorderKey}
            onAudioReady={handleAudioReady}
            onRecordingStateChange={handleRecordingStateChange}
          />
        )}

        {currentTab === "transcript" && (
          <TranscriptionPanel
            text={processResult?.transcript || ""}
            editable={false}
          />
        )}

        {currentTab === "feedback" && (
          // LightFeedback 暂未接入（transcript 整理后才有意义，§7.4）
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2">
            <p className="text-center text-[14.5px] leading-[1.85] text-[#8C857B]">
              先把材料收好，等多拍几道再一起看规律。
            </p>
          </div>
        )}

        {/* ─── 底部固定操作区 ─── */}
        <div className="mt-auto space-y-3 pt-4">
          {/* 保存状态提示（浮动卡显示时隐藏，避免信息冗余） */}
          {saveMsg && !(saved && toastOpen) && (
            <div
              className={`animate-fadeIn rounded-xl px-4 py-2.5 text-center text-[14px] leading-relaxed ${
                saved
                  ? "bg-[#EAF2EC] text-[#3F6B4C]"
                  : saveState === "error"
                    ? "bg-[#FBEAE6] text-[#B4553E]"
                    : "bg-[#FAF0DC] text-[#9A7B3C]"
              }`}
            >
              {saveMsg}
            </div>
          )}

          {/* 已拍计数（浮动卡显示时隐藏） */}
          {!(saved && toastOpen) && (
            <div className="text-center text-[13.5px] text-[#8C857B]">
              已收 {captureCount} 道
              {captureCount >= 3 && (
                <span className="ml-1">· 可以一起看看有没有规律了</span>
              )}
            </div>
          )}

          {/* 主操作区 */}
          {saved ? (
            // ─── 保存成功：浮动卡打开时由浮层处理，关闭后显示文档流后备 ──
            !toastOpen && (
              <>
                <Link
                  href="/nana/knowledge-map"
                  className="block w-full rounded-[18px] bg-[#5E8868] px-5 py-[14px] text-center text-[15.5px] font-medium text-[#FFFDF9] shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-transform hover:scale-[1.02] active:scale-95"
                >
                  去知识地图看看
                </Link>
                <Link
                  href="/nana/knowledge-map?openCases=1"
                  className="mt-2.5 block w-full rounded-[18px] border border-[#E8A33D]/30 bg-[#FFF8F0] px-5 py-[13px] text-center text-[15px] font-medium text-[#D4913A] transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="size-4" />
                    给这道题挂个知识点
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={handleTakeAnother}
                  className="w-full text-center text-[14px] text-[#8C857B] transition-colors hover:text-[#5E8868]"
                >
                  再拍一道
                </button>
              </>
            )
          ) : (
            // ─── 保存前：收好这道题（无照片禁用）──
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!photoTaken || saving}
                className={`w-full rounded-[18px] px-5 py-[14px] text-[15.5px] font-medium shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-transform active:scale-95 ${
                  !photoTaken
                    ? "cursor-not-allowed bg-[#C9C2B6] text-[#FFFDF9] shadow-none"
                    : "bg-[#7FA886] text-[#FFFDF9] hover:scale-[1.02]"
                }`}
              >
                {saving ? "正在收…" : photoTaken ? "收好这道题" : "先拍一下这道题"}
              </button>

              {/* 有照片但想重拍时 */}
              {photoTaken && saveState === "idle" && (
                <button
                  type="button"
                  onClick={handleRetake}
                  className="w-full text-center text-[13.5px] text-[#8C857B] transition-colors hover:text-[#5E8868]"
                >
                  重新拍一张
                </button>
              )}

              {/* 收够 3 道后，温和引导回首页看看 */}
              {captureCount >= 3 && (
                <div className="text-center">
                  <Link
                    href="/nana"
                    className="inline-flex items-center gap-2 text-[14px] font-medium text-[#5E8868] transition-colors hover:text-[#403A33]"
                  >
                    回首页看看
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ 5. Toast 浮动卡（保存成功后 fixed 底部弹出）═══ */}
      {saved && toastOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40 bg-black/15"
            onClick={handleDismissToast}
          />
          {/* 浮动卡片 */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up rounded-t-2xl bg-[#FFFDF9] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_40px_rgba(90,80,66,0.22)]"
          >
            {/* 成功确认 */}
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#EAF2EC] px-4 py-2.5 text-[14px] text-[#3F6B4C]">
              <span className="size-5 rounded-full bg-[#5E8868] text-center text-[12px] font-bold leading-5 text-white">
                ✓
              </span>
              已收好
            </div>

            {/* AI 整理状态区（Round 4） */}
            {processState === "processing" && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#F5F1EA] px-4 py-3">
                <span className="flex gap-[3px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block size-[5px] animate-pulse rounded-full bg-[#B4ADA3]"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    />
                  ))}
                </span>
                <span className="text-[13px] text-[#8C857B]">正在帮你整理这道题…</span>
              </div>
            )}

            {processState === "done" && processResult && (
              <div className="mb-3 max-h-[40vh] overflow-y-auto rounded-xl bg-[#FAFAF7] p-3">
                <AiResultCard
                  result={processResult}
                  onRetryAudioTranscribe={handleRetryProcess}
                />
              </div>
            )}

            {processState === "error" && (
              <div className="mb-3 rounded-xl bg-[#FAFAF7] p-3">
                <AiResultCard
                  result={processResult ?? { status: "failed", audioStatus: "skipped", questionSummary: null, textbookTopic: null, feedback: null, possibleMistakeReason: null, nextActionSuggestion: null, transcript: null, error: null }}
                  onRetry={handleRetryProcess}
                  onRetryAudioTranscribe={handleRetryProcess}
                />
              </div>
            )}

            {/* 主按钮：给这道题挂个知识点 */}
            <Link
              href="/nana/knowledge-map?openCases=1"
              className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-[#E8A33D]/30 bg-[#FFF8F0] px-5 py-[14px] text-[15.5px] font-medium text-[#D4913A] shadow-[0_4px_12px_rgba(232,163,61,0.18)] transition-transform hover:scale-[1.02] active:scale-95"
            >
              <Tag className="size-[18px]" />
              给这道题挂个知识点
            </Link>

            {/* 次要入口 */}
            <div className="mt-3 flex items-center justify-center gap-5 text-[14px]">
              <Link
                href="/nana/knowledge-map"
                className="font-medium text-[#5E8868] transition-colors hover:text-[#403A33]"
              >
                去知识地图看看
              </Link>
              <span className="text-[#D8D2C8]">·</span>
              <button
                type="button"
                onClick={handleTakeAnother}
                className="text-[#8C857B] transition-colors hover:text-[#5E8868]"
              >
                再拍一道
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
