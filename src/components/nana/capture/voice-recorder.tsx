/**
 * VoiceRecorder — 真实录音控件（Phase 1.5）
 *
 * 三态：idle → recording → completed
 *
 * 真实行为：
 * - getUserMedia({ audio: true }) 请求麦克风权限；拒绝时显式提示（不静默，铁律 6）
 * - MediaRecorder 收集音频 chunk，停止时合成 Blob；mimeType 动态探测（webm→mp4）
 * - 60 秒自动停止
 * - 不做 ASR 转写（第 5 阶段接通）
 *
 * 接口缝保留：
 * - AsrProvider 接口保留为第 5 阶段替换缝（本轮不实例化、不调用）
 *
 * Props:
 * - onAudioReady?: (blob: Blob, meta: { durationSec: number; mime: string }) => void
 *
 * 措辞合规（P4）：
 * - "说说看" ✓（禁用"开始录音"）
 * - "我听完了" ✓（禁用"停止"）
 * - 完成态："录音收好了，转写稍后接入" ✓
 */

"use client";

import { useState, useRef, useCallback } from "react";

// ─── AsrProvider 接口（缝：第 5 阶段替换为真实 ASR，本轮不实现） ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface AsrProvider {
  streamTranscribe(audio: Blob, onText: (t: string) => void): Promise<void>;
  fileTranscribe(audio: Blob): Promise<string>;
}

// ─── 类型 ─────────────────────────────────────

type RecorderState = "idle" | "recording" | "completed";

interface AudioMeta {
  durationSec: number;
  mime: string;
  sizeBytes: number;
}

interface VoiceRecorderProps {
  onAudioReady?: (blob: Blob, meta: AudioMeta) => void;
}

// ─── 常量 ─────────────────────────────────────
const MAX_RECORDING_SEC = 60; // 单次录音时长上限

// ─── 波形柱状条 ───────────────────────────────
const WAVE_BARS = Array.from({ length: 20 }, (_, i) => ({
  key: i,
  delay: `${-(0.05 * i).toFixed(2)}s`,
  duration: `${(0.9 + (i % 5) * 0.1).toFixed(2)}s`,
}));

// ─── 工具：探测可用的录音 mimeType ────────────────
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  // 优先 webm，iOS Safari 较新版本可能用 mp4 容器
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return ""; // 用默认（浏览器自选）
}

// ─── 组件 ─────────────────────────────────────

export function VoiceRecorder({ onAudioReady }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 清理资源 ───────────────────────────────
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ─── 开始录音 ───────────────────────────────
  const handleStartRecording = useCallback(async () => {
    setPermissionMsg(null);

    // 浏览器兼容探测（§7.8）
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPermissionMsg("当前浏览器不支持录音");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setPermissionMsg("当前浏览器不支持录音");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // 权限拒绝或不可用：显式提示（铁律 6）
      setPermissionMsg("没拿到麦克风权限，可以在浏览器设置里打开。不录音也能保存这道题。");
      return;
    }

    streamRef.current = stream;
    const mime = pickMimeType();
    mimeRef.current = mime;

    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeRef.current || recorder.mimeType || "audio/webm",
      });
      const durationSec = Math.min(
        MAX_RECORDING_SEC,
        Math.round((Date.now() - startTsRef.current) / 1000),
      );
      const meta: AudioMeta = {
        durationSec,
        mime: mimeRef.current || recorder.mimeType || "",
        sizeBytes: blob.size,
      };
      onAudioReady?.(blob, meta);
      cleanup();
    };

    recorder.start();
    startTsRef.current = Date.now();
    setState("recording");
    setElapsed(0);

    // 计时器（更新 elapsed 展示）
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTsRef.current) / 1000));
    }, 1000);

    // 60 秒自动停止
    autoStopTimerRef.current = setTimeout(() => {
      const r = mediaRecorderRef.current;
      if (r && r.state !== "inactive") r.stop();
    }, MAX_RECORDING_SEC * 1000);
  }, [onAudioReady, cleanup]);

  // ─── 停止录音 ───────────────────────────────
  const handleFinishRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setState("completed");
  }, []);

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
          想到哪说到哪，不用完整。最长录 60 秒。
        </p>

        {/* 权限拒绝提示 */}
        {permissionMsg && (
          <p className="max-w-[280px] rounded-xl bg-[#FAF0DC] px-3 py-2 text-center text-[13px] leading-relaxed text-[#9A7B3C]">
            {permissionMsg}
          </p>
        )}
      </div>
    );
  }

  // ─── recording 态 ───────────────────────────
  if (state === "recording") {
    return (
      <div className="flex flex-1 flex-col">
        {/* "正在听你说" + 计时 + 闪烁圆点 */}
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="text-[14px] text-[#5E8868]">正在听你说</span>
          <span className="text-[12.5px] tabular-nums text-[#B4ADA3]">
            {elapsed}s / {MAX_RECORDING_SEC}s
          </span>
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
        录音收好了，转写稍后接入
      </p>
      <p className="text-[12.5px] text-[#B4ADA3]">
        已录音 {elapsed} 秒
      </p>
    </div>
  );
}
