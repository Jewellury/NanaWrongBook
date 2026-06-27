/**
 * 采集壳占位页
 *
 * 本页为 Commit ② 预留的占位页面。
 * 完整采集壳 UI + 交互将在 Commit ③ 实现。
 * 当前仅显示"功能建设中"提示，确保首页"拍一下这道题"链接不跳 404。
 */

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CapturePlaceholderPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5">
      <div className="rounded-2xl border border-[#E8E0D4] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-amber-100">
          <span className="text-2xl" aria-hidden="true">
            🛠️
          </span>
        </div>
        <h2 className="text-lg font-semibold text-[#2C2C2C]">
          功能建设中
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B625A]">
          拍照录入和思路录音功能正在搭建中，
          <br />
          很快就能用了。
        </p>
        <Link
          href="/nana"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D97706] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B45309]"
        >
          <ArrowLeft className="size-4" />
          回到首页
        </Link>
      </div>
    </div>
  );
}
