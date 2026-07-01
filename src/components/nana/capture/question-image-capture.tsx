/**
 * QuestionImageCapture — 真实题图采集（替代第 1 阶段的纯文字 mock 题卡）
 *
 * 职责（Phase 1.5）：
 * - `<input type="file" accept="image/*" capture="environment">` 调起后置相机/相册
 * - 选图后用既有 compressImage/processImageFile（src/lib/image-utils.ts 只读复用）
 *   压缩成 ≤1MB Base64，经 onChange 上抛给父页
 * - 显示真实图片预览（`<img src={base64}>`）；未拍照时显示空状态"先拍一下这道题"
 *
 * 措辞合规（OPS §4）：不说"诊断/薄弱/掌握"，只说"先拍一下这道题"。
 *
 * Props:
 * - value: string | null  当前 Base64 预览（null = 空状态）
 * - onChange: (base64: string | null) => void
 */

"use client";

import { useRef, useState, useCallback } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { processImageFile } from "@/lib/image-utils";

interface QuestionImageCaptureProps {
  value: string | null;
  onChange: (base64: string | null) => void;
}

export function QuestionImageCapture({ value, onChange }: QuestionImageCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 清空 input value 以便相同文件可再次触发
      e.target.value = "";
      if (!file) return;

      setError(null);
      setBusy(true);
      try {
        const base64 = await processImageFile(file);
        onChange(base64);
      } catch {
        // 显式失败（铁律 6）：不静默吞错
        setError("图片没读取成功，换个角度再试一下");
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  // ─── 空状态：未拍照 ─────────────────────────
  if (!value) {
    return (
      <div className="relative flex h-full w-full items-center justify-center px-5 py-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#D9C9AC] bg-[#FFFDF8]/60 transition-colors hover:border-[#B4905A] hover:bg-[#FFFDF8]"
          aria-label="先拍一下这道题"
        >
          <span className="flex size-[52px] items-center justify-center rounded-full bg-[#EFE7DA]">
            <Camera className="size-[24px] text-[#8C857B]" strokeWidth={1.8} />
          </span>
          <span className="font-['LXGW_WenKai', 'PingFang_SC', sans-serif] text-[19px] text-[#8C857B]">
            先拍一下这道题
          </span>
          <span className="text-[12.5px] text-[#B4ADA3]">
            点这里拍照，或从相册选
          </span>
        </button>
        {error && (
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#FBEAE6] px-3 py-1 text-[12px] text-[#B4553E]">
            {error}
          </span>
        )}
      </div>
    );
  }

  // ─── 已拍照：显示真实图片预览 + 重拍入口 ──────────
  return (
    <div className="relative flex h-full w-full items-center justify-center px-3 py-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* 题图预览 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={value}
        alt="刚拍的题图"
        className="max-h-full max-w-full rounded-xl object-contain shadow-[0_10px_26px_rgba(90,80,66,0.18)]"
      />

      {/* 右下角重拍按钮 */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[12.5px] font-medium text-[#5E8868] shadow-[0_4px_12px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
        aria-label="重拍一张"
      >
        <RefreshCw className="size-[14px]" strokeWidth={2} />
        重拍一张
      </button>

      {busy && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3 py-1 text-[12px] text-white">
          正在处理…
        </span>
      )}
    </div>
  );
}
