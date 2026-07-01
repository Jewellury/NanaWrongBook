/**
 * TranscriptionPanel — 逐字稿展示面板
 *
 * "我的话" tab 的内容区：
 * - editable=false（默认，本轮）：只读占位（无 ASR，转写稍后接入）
 * - editable=true（未来第 5 阶段接通 ASR 后）：每行可点击编辑（contentEditable）
 *
 * Props:
 * - text: 逐字稿全文（行之间用 \n 分隔）
 * - onChange?: 编辑回调（仅 editable=true 时触发）
 * - editable?: 是否可编辑，默认 false
 *
 * 措辞合规（P4）：
 * - 只读态："转写稍后接入，录音已经收好。" ✓（不假装已转写）
 */

"use client";

import { useRef, useCallback } from "react";

interface TranscriptionPanelProps {
  text: string;
  onChange?: (text: string) => void;
  editable?: boolean;
}

export function TranscriptionPanel({ text, onChange, editable = false }: TranscriptionPanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      const newText = editorRef.current.innerText;
      onChange(newText);
    }
  }, [onChange]);

  // ─── 只读占位（本轮：无 ASR）──────────────
  if (!editable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2">
        <div className="flex items-center gap-2 text-[#5E8868]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5E8868"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-[14px] font-medium">录音已经收好</span>
        </div>
        <p className="text-center text-[13.5px] leading-[1.85] text-[#8C857B]">
          转写稍后接入，{text || "这道题的话先放在心里。"}
        </p>
      </div>
    );
  }

  // ─── 可编辑态（未来 ASR 接通后启用）──────
  const lines = text.split("\n");

  return (
    <div className="flex flex-1 flex-col">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="flex-1 overflow-auto text-[14.5px] leading-[1.85] text-[#403A33] outline-none"
        role="textbox"
        aria-multiline="true"
        aria-label="逐字稿编辑"
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className="rounded px-1 transition-colors hover:bg-[#F0F5FA]"
            data-line={i}
          >
            {line || "\u00A0"}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#B4ADA3]">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#7FA886"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>轻点任意一句就能改，改好会自动存。</span>
      </div>
    </div>
  );
}
