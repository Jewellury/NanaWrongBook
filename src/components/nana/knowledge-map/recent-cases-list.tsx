/**
 * RecentCasesList — 知识地图"最近拍过的题"列表区（Stage 1 S1-4）
 *
 * 调 GET /api/nana/cases（S1-3）显示当前用户最近的错题。
 * - 空态："还没拍过题，去拍一道 →"（→ /nana/capture）
 * - 有题：每条 = 占位缩略 + 拍摄日期 + "未分类"chip（Stage 1 恒 untagged）
 *
 * Stage 1 列表端点不返回完整 base64 题图（§12.2 体积注意），
 * 故用图标占位代替真实缩略；完整题图走 GET /cases/[id]（未来详情页）。
 *
 * 措辞合规（OPS §4）：无 诊断/已诊断/薄弱/得分/掌握/失败。
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ImageIcon, Camera } from "lucide-react";
import { listMyCases, type CaseListItem } from "@/lib/nana/nana-api-client";

// ─── 日期格式化：ISO → "7月1日" ───────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function RecentCasesList() {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // loading 初值已为 true，effect 仅跑一次，无需重复 setLoading(true)
    listMyCases()
      .then((data) => {
        if (!cancelled) setCases(data.cases);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 加载中骨架 ───
  if (loading) {
    return (
      <section className="px-4 pb-3">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-24 rounded bg-[#E8E0D4]" />
          <div className="flex gap-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[72px] w-24 rounded-xl bg-white/60"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ─── 空态：还没拍过题 ───
  if (!failed && cases.length === 0) {
    return (
      <section className="px-4 pb-4">
        <h2 className="mb-2 text-sm font-semibold text-[#403A33]">最近拍过的题</h2>
        <Link
          href="/nana/capture"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-[#E8E0D4] bg-white/50 px-4 py-4 transition-colors hover:bg-[#EAF2EC]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF2EC]">
            <Camera className="size-5 text-[#5E8868]" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-[#403A33]">还没拍过题</p>
            <p className="text-[13px] text-[#8C857B]">去拍一道 →</p>
          </div>
        </Link>
      </section>
    );
  }

  // ─── 加载失败：静默弱化，不阻断图谱区 ───
  if (failed) {
    return (
      <section className="px-4 pb-3">
        <h2 className="mb-2 text-sm font-semibold text-[#403A33]">最近拍过的题</h2>
        <p className="text-[13px] text-[#B8AFA6]">暂时没拉到，下拉刷新试试</p>
      </section>
    );
  }

  // ─── 有题：横向列表 ───
  return (
    <section className="px-4 pb-3">
      <h2 className="mb-2 text-sm font-semibold text-[#403A33]">
        最近拍过的题
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {cases.map((c) => (
          <div
            key={c.id}
            className="flex w-[104px] shrink-0 flex-col gap-1.5 rounded-xl border border-[#E8E0D4] bg-white p-2"
          >
            {/* 占位缩略（列表端点不返回完整题图，§12.2） */}
            <div className="flex h-[60px] items-center justify-center rounded-lg bg-[#F2EDE3]">
              {c.hasImage ? (
                <ImageIcon className="size-6 text-[#B8AFA6]" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <span className="text-[12px] text-[#8C857B]">
              {formatDate(c.createdAt)}
            </span>
            <span className="inline-block w-fit rounded-full bg-[#F2EDE3] px-2 py-0.5 text-[11px] text-[#9A8B7A]">
              未分类
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
