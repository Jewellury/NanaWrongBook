/**
 * Session 列表页
 *
 * 双状态：
 * - 空状态：无历史 session → "还没有做过检查" + [先从函数这条线看看 ✦]
 * - 有记录态：显示历史 session 卡片
 *
 * 创建新 session → POST /api/diagnosis/session-items → 跳转 /nana/session/[sessionId]
 * 历史列表 → GET /api/diagnosis/sessions?studentId=xxx
 */
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSessionItems, getSessionList, getSessionDetail } from "@/lib/nana/nana-api-client";
import type { SessionSummary, SessionDetail } from "@/lib/nana/nana-api-client";

interface SessionCard {
  id: string;
  date: string;
  kind: string;
  recordCount: number;
  correctCount: number;
}

export default function SessionListPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const list: SessionSummary[] = await getSessionList(session.user.id);
      // 为每个 session 获取详情（含 record 数）
      const detailPromises = list
        .filter((s) => s.kind === "weekend")
        .slice(0, 20)
        .map(async (s) => {
          try {
            const detail: SessionDetail = await getSessionDetail(s.id);
            const records = detail.records ?? [];
            return {
              id: s.id,
              date: s.startedAt,
              kind: s.kind,
              recordCount: records.length,
              correctCount: records.filter((r) => r.correct).length,
            };
          } catch {
            return {
              id: s.id,
              date: s.startedAt,
              kind: s.kind,
              recordCount: 0,
              correctCount: 0,
            };
          }
        });
      const resolved = await Promise.all(detailPromises);
      setCards(resolved);
    } catch {
      // 静默失败
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async () => {
    if (!session?.user?.id || creating) return;
    setCreating(true);
    try {
      const data = await createSessionItems(session.user.id, "M2a");
      // 存到 sessionStorage 供 [id] 页读取
      sessionStorage.setItem(
        `session_${data.sessionId}`,
        JSON.stringify({
          items: data.items,
          answerKey: data.answerKey,
          studentId: data.studentId,
          mainlineId: data.mainlineId,
        })
      );
      router.push(`/nana/session/${data.sessionId}`);
    } catch {
      setCreating(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      {/* 头部 */}
      <div className="mb-6">
        <Link
          href="/nana"
          className="mb-4 inline-flex items-center gap-1 text-sm text-[#8C857B] hover:text-[#403A33]"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <h1 className="text-2xl font-bold text-[#2C2C2C]">周末小检查</h1>
        <p className="mt-1 text-sm text-[#6B625A]">
          就当和我一起把把脉，看看现在走到哪了。
        </p>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 flex-col">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-20 rounded-2xl bg-white/60" />
            <div className="h-20 rounded-2xl bg-white/60" />
          </div>
        ) : cards.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="rounded-2xl border border-dashed border-[#E8E0D4] bg-white/60 p-8 text-center">
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-amber-100">
                <span className="text-2xl" aria-hidden="true">
                  📋
                </span>
              </div>
              <p className="text-base leading-relaxed text-[#6B625A]">
                还没有做过检查
              </p>
            </div>
            <button
              onClick={handleCreateSession}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-full bg-[#5E8868] px-8 py-4 text-base font-medium text-white shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-all hover:shadow-[0_10px_22px_rgba(94,136,104,0.34)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  准备中…
                </>
              ) : (
                "先从函数这条线看看 ✦"
              )}
            </button>
          </div>
        ) : (
          /* 有记录态 */
          <div className="flex flex-1 flex-col gap-4">
            <div className="space-y-3">
              {cards.map((card) => (
                <Link
                  key={card.id}
                  href={`/nana/session/${card.id}`}
                  className="block rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base" aria-hidden="true">
                          📅
                        </span>
                        <span className="font-semibold text-[#2C2C2C]">
                          {formatDate(card.date)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-[#6B625A]">
                        {card.recordCount > 0
                          ? `${card.correctCount} 道看过，${card.recordCount - card.correctCount} 道还卡着`
                          : "还没做完"}
                      </div>
                    </div>
                    <span className="mt-1 text-sm font-medium text-[#7FA886]">
                      {card.recordCount > 0 ? "再看结果 →" : "继续做 →"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* 再来一次 */}
            <div className="mt-auto pt-4">
              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="w-full rounded-full bg-[#5E8868] px-6 py-4 text-base font-medium text-white shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-all hover:shadow-[0_10px_22px_rgba(94,136,104,0.34)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "准备中…" : "再来一次 ✦"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
