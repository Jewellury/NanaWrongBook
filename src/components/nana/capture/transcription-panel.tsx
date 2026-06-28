/**
 * TranscriptionPanel — 逐字稿展示和编辑面板
 *
 * "我的话" tab 的内容区：
 * - 从上往下显示逐行文字
 * - 每行文字可点击编辑（contentEditable）
 * - 底部显示保存提示
 *
 * Props:
 * - text: 逐字稿全文（行之间用 \n 分隔）
 * - onChange?: 编辑回调
 *
 * 措辞合规（P4）：
 * - "轻点任意一句就能改，改好会自动存" ✓
 */

"use client";

import { useRef, useCallback } from "react";

interface TranscriptionPanelProps {
  text: string;
  onChange?: (text: string) => void;
}

export function TranscriptionPanel({ text, onChange }: TranscriptionPanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      const newText = editorRef.current.innerText;
      onChange(newText);
    }
  }, [onChange]);

  // 将文本按行分割，渲染为带编辑功能的 div
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

      {/* 底部提示 */}
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
