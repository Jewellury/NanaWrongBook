/**
 * 批次诊断报告页
 *
 * 数据源（两路并行）：
 * 1. GET /api/diagnosis/sessions/[id] — 获取 session 答题记录（含 nodeId/correct）
 * 2. GET /api/diagnosis/map?studentId=xxx — 获取节点字典（nodeId → name/judgeCriteria）
 *
 * 自身不含 KnowledgeNode.name，必须通过 map API 将 nodeId 映射为口语化名称。
 *
 * 三区内容：
 * - 我们看了什么 — 知识点卡片列表（去重 + "已过"/"还卡着"）
 * - 做题时看到的信号 — 知识点级出现频率统计（不做错因定性）
 * - 先从这里补 — 找第一个"还卡着"节点 → 建议文案
 *
 * P4 措辞铁律全部合规：
 * - 标题："这一轮看完了" ✅
 * - 副标题："来，一起看看我们发现了什么" ✅
 * - 无"薄弱点""未掌握""错因分析""BKT""KST" ✅
 */
"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportSummary } from "@/components/nana/session/report-summary";
import type { SessionDetail } from "@/lib/nana/nana-api-client";

interface MapNode {
  nodeId: string;
  name: string;
  judgeCriteria: string | null;
  status: string;
}

interface MapResponse {
  nodes: MapNode[];
}

export default function ReportPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: session } = useSession();

  const [sessionData, setSessionData] = useState<SessionDetail | null>(null);
  const [mapNodes, setMapNodes] = useState<MapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── 数据加载：并行拉 sessions/[id] + map ───
  useEffect(() => {
    if (!id || !session?.user?.id) return;

    let cancelled = false;

    async function load() {
      const uid = session?.user?.id;
      if (!uid) return;
      setLoading(true);
      setError(null);

      try {
        const [detailRes, mapRes] = await Promise.all([
          fetch(`/api/diagnosis/sessions/${id}`),
          fetch(`/api/diagnosis/map?studentId=${uid}`),
        ]);

        if (!detailRes.ok) {
          throw new Error(`获取会话详情失败: ${detailRes.status}`);
        }
        if (!mapRes.ok) {
          throw new Error(`获取知识地图失败: ${mapRes.status}`);
        }

        const detail: SessionDetail = await detailRes.json();
        const mapData: MapResponse = await mapRes.json();

        if (!cancelled) {
          setSessionData(detail);
          setMapNodes(mapData.nodes ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, session?.user?.id]);

  // ─── 渲染 ───
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-[#FBF7F0] px-5 py-8">
      {/* ← 返回 */}
      <div className="mb-6">
        <Link
          href="/nana/session"
          className="mb-4 inline-flex items-center gap-1 text-sm text-[#8C857B] hover:text-[#403A33]"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>
      </div>

      {/* ✅ 这一轮看完了 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#2C2C2C]">这一轮看完了</h1>
        <p className="mt-1 text-base leading-relaxed text-[#6B625A]">
          来，一起看看我们发现了什么
        </p>
      </div>

      {/* 加载态 */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-[#7FA886] border-t-transparent" />
        </div>
      )}

      {/* 错误态 */}
      {error && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-center text-sm text-[#B35C4A]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#5E8868] px-6 py-3 text-sm font-medium text-white shadow-md"
          >
            再试一次
          </button>
        </div>
      )}

      {/* 报告内容 */}
      {!loading && !error && sessionData && (
        <div className="flex-1">
          <ReportSummary
            records={sessionData.records ?? []}
            mapNodes={mapNodes}
          />
        </div>
      )}

      {/* 无数据 */}
      {!loading && !error && sessionData && (sessionData.records ?? []).length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-[#8C857B]">还没有做题记录</p>
        </div>
      )}
    </div>
  );
}
