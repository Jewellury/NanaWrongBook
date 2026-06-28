/**
 * Nana 场景入口首页（客户端组件）
 *
 * 双状态：
 * - 有记录态（nodes 中有非 untested 状态）：显示 RecapBar + 行动卡 + 地图链接
 * - 空状态（所有节点均为 untested）：显示 EmptyHint + 行动卡
 *
 * 两个行动卡始终显示：
 * 1. "拍一下这道题" → /nana/capture
 * 2. "补一段你当时怎么想的" → /nana/capture
 *
 * 数据来源：GET /api/diagnosis/map?studentId=xxx
 */

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, MessageSquareText } from "lucide-react";
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

      {/* 行动卡区域 —— 始终显示 */}
      <div className="mt-6 flex flex-col gap-3">
        <ActionCard
          title="拍一下这道题"
          description="把刚卡住的那道拍进来"
          icon={Camera}
          href="/nana/capture"
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
        />
        <ActionCard
          title="补一段你当时怎么想的"
          description="说说看就好，想到哪说到哪"
          icon={MessageSquareText}
          href="/nana/capture"
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />
      </div>

      {/* 有记录 / 空状态切换区域 */}
      <div className="mt-8">
        {loading ? (
          /* 加载中骨架 */
          <div className="animate-pulse rounded-2xl bg-white/60 p-5">
            <div className="h-4 w-3/4 rounded bg-[#E8E0D4]" />
            <div className="mt-2 h-4 w-1/2 rounded bg-[#E8E0D4]" />
          </div>
        ) : hasRecords ? (
          <>
            <RecapBar
              latestNodeName={latestLitNode.name}
              totalLitCount={litNodes.length}
            />
            {/* Session 入口（有记录态） */}
            <Link
              href="/nana/session"
              className="mt-3 block rounded-2xl border border-dashed border-[#E8E0D4] bg-white/50 px-5 py-4 text-center text-sm font-medium text-[#5E8868] transition-all hover:bg-[#EAF2EC] hover:shadow-sm"
            >
              做个周末小检查？先从函数这条线看看 ✦
            </Link>
          </>
        ) : (
          <>
            <EmptyHint />
            {/* Session 入口（空状态） */}
            <Link
              href="/nana/session"
              className="mt-3 block rounded-2xl border border-dashed border-[#E8E0D4] bg-white/50 px-5 py-4 text-center text-sm font-medium text-[#5E8868] transition-all hover:bg-[#EAF2EC] hover:shadow-sm"
            >
              做个周末小检查？先从函数这条线看看 ✦
            </Link>
          </>
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
