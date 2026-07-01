/**
 * Nana 场景入口首页（客户端组件）
 *
 * Stage 1 动线修正：3 个一级入口（拍题 / 知识地图 / 周末小检查）。
 * - 拍题 → /nana/capture
 * - 知识地图 → /nana/knowledge-map（新增一级入口）
 * - 周末小检查 → /nana/session（从正文提升为一级卡片）
 * 删除"补一段你当时怎么想的"（与拍题重复跳同一采集页）。
 *
 * 有/无记录的轻提示（RecapBar/EmptyHint）保留，移到三卡片下方。
 *
 * 数据来源：GET /api/diagnosis/map?studentId=xxx
 *
 * 措辞合规（OPS §4）：无 诊断/已诊断/薄弱/得分/掌握/失败。
 */

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Camera, Map, ClipboardCheck } from "lucide-react";
import { ActionCard } from "@/components/nana/shared/action-card";
import { RecapBar } from "@/components/nana/shared/recap-bar";
import { EmptyHint } from "@/components/nana/shared/empty-hint";

interface MapNode {
  nodeId: string;
  name: string;
  status: string;
}

interface MapResponse {
  nodes: MapNode[];
  stats: {
    total: number;
    stable: number;
    gap: number;
    uncertain: number;
    untested: number;
  };
}

export default function NanaPage() {
  const { data: session } = useSession();
  const [mapData, setMapData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      // 等待 session 加载
      return;
    }

    setLoading(true);
    fetch(`/api/diagnosis/map?studentId=${session.user.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`map API 返回 ${res.status}`);
        return res.json();
      })
      .then((data: MapResponse) => {
        setMapData(data);
      })
      .catch(() => {
        // 静默失败，页面仍可显示行动卡
        setMapData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session]);

  // 有记录态判定：存在非 untested 的节点
  const litNodes = mapData?.nodes?.filter((n) => n.status !== "untested") ?? [];
  const hasRecords = litNodes.length > 0;

  // 取最近点亮的一个节点（map API 按层排序，取最后一个有状态的作为近似）
  const latestLitNode = litNodes[litNodes.length - 1];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      {/* 顶部问候 */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold leading-tight text-[#2C2C2C]">
          嗨，今天想从哪开始？
        </h1>
        <p className="mt-1 text-sm text-[#6B625A]">不急，挑一个就好。</p>
      </div>

      {/* 三个一级入口 —— 始终显示 */}
      <div className="mt-6 flex flex-col gap-3">
        <ActionCard
          title="拍一道题"
          description="把刚卡住的那道拍进来"
          icon={Camera}
          href="/nana/capture"
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
        />
        <ActionCard
          title="看看知识地图"
          description="拍过的题和整张地图都在这儿"
          icon={Map}
          href="/nana/knowledge-map"
          iconBgClass="bg-sky-100"
          iconColorClass="text-sky-600"
        />
        <ActionCard
          title="周末小检查"
          description="做几道题，看看线点亮了没"
          icon={ClipboardCheck}
          href="/nana/session"
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />
      </div>

      {/* 有记录 / 空状态轻提示（移到三卡片下方） */}
      <div className="mt-8">
        {loading ? (
          /* 加载中骨架 */
          <div className="animate-pulse rounded-2xl bg-white/60 p-5">
            <div className="h-4 w-3/4 rounded bg-[#E8E0D4]" />
            <div className="mt-2 h-4 w-1/2 rounded bg-[#E8E0D4]" />
          </div>
        ) : hasRecords ? (
          <RecapBar
            latestNodeName={latestLitNode.name}
            totalLitCount={litNodes.length}
          />
        ) : (
          <EmptyHint />
        )}
      </div>

      {/* 底部装饰 */}
      <div className="mt-auto pt-8 text-center">
        <p className="text-xs text-[#B8AFA6]">
          ✦ 不急，每题都是光点 ✦
        </p>
      </div>
    </div>
  );
}
