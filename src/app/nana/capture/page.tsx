/**
 * 采集壳主页面（客户端组件）—— Phase 1.5 真实采集最小闭环
 *
 * 真实行为：
 * 1. 拍照（QuestionImageCapture：调起相机/相册 → 压缩成 ≤1MB Base64）
 * 2. 可选录音（VoiceRecorder：getUserMedia + MediaRecorder，60s 上限，不转写）
 * 3. 点"收好这道题" → 组装 artifacts → createCase 存库
 * 4. 成功 → "这道题已经收好了，可以再拍一道" + 重置 + captureCount+1
 *    失败 → "没存成功，再试一次"（保留数据可重试，铁律 6 不静默）
 *
 * 状态机（§7.6）：
 * - photoState = "empty" | "photoTaken"
 * - saveState  = "idle" | "saving" | "saved" | "error"
 * - 门禁：无照片禁保存
 *
 * 措辞合规（OPS §4，E1/E2）：
 * - 全页无"诊断/已诊断/薄弱/得分/掌握"
 * - "帮你整理"tab 占位"先把材料收好，等多拍几道再一起看规律"，本轮不调 LightFeedback
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuestionImageCapture } from "@/components/nana/capture/question-image-capture";
import { VoiceRecorder } from "@/components/nana/capture/voice-recorder";
import { TranscriptionPanel } from "@/components/nana/capture/transcription-panel";
import { createCase, type ArtifactInput } from "@/lib/nana/nana-api-client";

// ─── 常量 ─────────────────────────────────────
const TOTAL_PAYLOAD_LIMIT = 3 * 1024 * 1024; // 单次保存总 payload 3MB 上限（前端预检）
const SUCCESS_MSG = "这道题已经收好了，可以再拍一道";
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

  // 保存状态
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const photoTaken = imageBase64 !== null;

  // ─── 录音完成回调 ──────────────────────────
  const handleAudioReady = useCallback(
    (blob: Blob, meta: AudioMeta) => {
      setAudioBlob(blob);
      setAudioMeta(meta);
    },
    [],
  );

  // ─── 题图变化回调 ──────────────────────────
  const handleImageChange = useCallback((base64: string | null) => {
    setImageBase64(base64);
    // 换图后重置保存态
    setSaveState("idle");
    setSaveMsg(null);
  }, []);

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
    artifacts.push({ type: "transcript", content: "尚未转写", seq });
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
      await createCase(artifacts);
      // 成功：显示成功态 → 重置
      setSaveState("saved");
      setSaveMsg(SUCCESS_MSG);
      setCaptureCount((prev) => prev + 1);
      // 重置采集状态（保留 captureCount）
      setTimeout(() => {
        setImageBase64(null);
        setAudioBlob(null);
        setAudioMeta(null);
        setSaveState("idle");
        setSaveMsg(null);
        setCurrentTab("voice");
      }, 1400);
    } catch {
      // 失败：显式报错，保留数据可重试（铁律 6）
      setSaveState("error");
      setSaveMsg(FAILURE_MSG);
    }
  }, [imageBase64, estimatedPayloadBytes, buildArtifacts]);

  // ─── 重置（"再拍一道"快捷入口，未保存时）──
  const handleRetake = useCallback(() => {
    setImageBase64(null);
    setAudioBlob(null);
    setAudioMeta(null);
    setSaveState("idle");
    setSaveMsg(null);
    setCurrentTab("voice");
  }, []);

  const saving = saveState === "saving";
  const saved = saveState === "saved";

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

        {/* 右侧占位（保持标题居中） */}
        <span className="w-[18px]" />
      </div>

      {/* ═══ 2. 题图区域（固定 ~52% 高度） ═══ */}
      <div className="h-[52vh] min-h-[280px] shrink-0 border-b border-[#E4DACB] bg-[#EFE7DA]">
        <QuestionImageCapture value={imageBase64} onChange={handleImageChange} />
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
          <VoiceRecorder onAudioReady={handleAudioReady} />
        )}

        {currentTab === "transcript" && (
          <TranscriptionPanel text="尚未转写" onChange={() => {}} />
        )}

        {currentTab === "feedback" && (
          // 本轮不调 LightFeedback（transcript 恒为"尚未转写"，调接口无意义，§7.4）
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2">
            <p className="text-center text-[14.5px] leading-[1.85] text-[#8C857B]">
              先把材料收好，等多拍几道再一起看规律。
            </p>
          </div>
        )}

        {/* ─── 底部固定操作区 ─── */}
        <div className="mt-auto space-y-3 pt-4">
          {/* 保存状态提示 */}
          {saveMsg && (
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

          {/* 已拍计数 */}
          <div className="text-center text-[13.5px] text-[#8C857B]">
            已收 {captureCount} 道
            {captureCount >= 3 && (
              <span className="ml-1">· 可以一起看看有没有规律了</span>
            )}
          </div>

          {/* 主操作按钮：收好这道题（无照片禁用） */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!photoTaken || saving || saved}
            className={`w-full rounded-[18px] px-5 py-[14px] text-[15.5px] font-medium shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-transform active:scale-95 ${
              !photoTaken
                ? "cursor-not-allowed bg-[#C9C2B6] text-[#FFFDF9] shadow-none"
                : saved
                  ? "cursor-default bg-[#6BBF8A] text-[#FFFDF9]"
                  : "bg-[#7FA886] text-[#FFFDF9] hover:scale-[1.02]"
            }`}
          >
            {saving ? "正在收…" : saved ? "收好了 ✓" : photoTaken ? "收好这道题" : "先拍一下这道题"}
          </button>

          {/* 未拍照时给"再拍一道"重置入口（已有照片但想重拍时） */}
          {photoTaken && saveState === "idle" && (
            <button
              type="button"
              onClick={handleRetake}
              className="w-full text-center text-[13.5px] text-[#8C857B] transition-colors hover:text-[#5E8868]"
            >
              重新拍一张
            </button>
          )}

          {/* 收够 3 道后，温和引导去知识地图/规律（不用"诊断"词） */}
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
        </div>
      </div>
    </div>
  );
}
