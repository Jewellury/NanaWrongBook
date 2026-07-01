/**
 * 知识地图页面（客户端组件）
 *
 * 加载 GET /api/diagnosis/map 数据，展示全量知识图谱。
 * 框架层（Commit ①）：顶栏 + 图例 + SVG 画布容器 + 空状态
 * 可视化渲染（Commit ②）：节点/边/前沿/交互
 *
 * P4 措辞合规：
 * - "已点亮" ✓（禁用"已掌握"）
 * - "下一个" ✓（禁用"薄弱点"）
 * - "未探索" ✓（禁用"未掌握"）
 * - "你已经点亮了 N 个光点 ✦" ✓（禁用"你的正确率：xx%"）
 * - "最近一次确认是在..." ✓（禁用"点亮于"）
 * - "旅程从这一步开始" ✓（禁用"你还没有掌握任何知识点"）
 */

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import KnowledgeMapCanvas from "@/components/nana/knowledge-map/knowledge-map-canvas";
import KnowledgeDetailCard from "@/components/nana/knowledge-map/knowledge-detail-card";
import { RecentCasesList } from "@/components/nana/knowledge-map/recent-cases-list";
import type { KnowledgeNodeData, EdgeData, MainlineData } from "@/components/nana/knowledge-map/knowledge-map-canvas";

interface MapNode {
  nodeId: string;
  name: string;
  layer: string;
  tier: string | null;
  status: string;
  masteryProb: number;
  judgeCriteria: string;
  sampleItem: string | null;
  teachingNotes: string | null;
  lastEvidence: string | null;
}

interface MapResponse {
  nodes: MapNode[];
  learningFrontier: string[];
  stats: {
    total: number;
    stable: number;
    gap: number;
    uncertain: number;
    untested: number;
  };
  edges: EdgeData[];
  mainlines: MainlineData[];
}

export default function KnowledgeMapPage() {
  const { data: session } = useSession();
  const [mapData, setMapData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 空状态判定：少于 2 个节点有状态记录
  const litNodeCount = mapData
    ? mapData.stats.stable + mapData.stats.gap + mapData.stats.uncertain
    : 0;
  const isEmpty = !loading && mapData && litNodeCount < 2;

  useEffect(() => {
    if (!session?.user?.id) return;

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
        setMapData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session]);

  // 节点点击处理
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (!mapData) return;
      const node = mapData.nodes.find((n) => n.nodeId === nodeId);
      if (!node) return;

      const isStable = node.status === "stable";
      const isFrontier = mapData.learningFrontier.includes(nodeId);

      // 未探索节点点击不弹出
      if (!isStable && !isFrontier) return;

      setSelectedNodeId(nodeId);
    },
    [mapData]
  );

  // 选中的节点详情数据
  const selectedNode = mapData && selectedNodeId
    ? mapData.nodes.find((n) => n.nodeId === selectedNodeId) ?? null
    : null;

  const selectedDetail = selectedNode
    ? {
        nodeId: selectedNode.nodeId,
        name: selectedNode.name,
        status: selectedNode.status,
        masteryProb: selectedNode.masteryProb,
        judgeCriteria: selectedNode.judgeCriteria ?? null,
        sampleItem: selectedNode.sampleItem ?? null,
        teachingNotes: selectedNode.teachingNotes ?? null,
        lastEvidence: selectedNode.lastEvidence ?? null,
        isFrontier: mapData?.learningFrontier.includes(selectedNode.nodeId) ?? false,
      }
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-[#FBF7F0]">
      {/* ===== 顶栏 ===== */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-2">
        <Link
          href="/nana"
          className="flex items-center text-[#8C857B] hover:text-[#403A33] transition-colors"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#403A33]">我的知识地图</h1>
          {mapData && !isEmpty && (
            <p className="text-xs text-[#5E8868] mt-0.5">
              你已经点亮了 {mapData.stats.stable} 个光点 ✦
            </p>
          )}
        </div>
      </div>

      {/* ===== 最近拍过的题（Stage 1 S1-4 列表 / Stage 2 S2-4 标签+挂载） ===== */}
      <RecentCasesList
        nodes={
          mapData?.nodes.map((n) => ({ id: n.nodeId, name: n.name })) ?? []
        }
      />

      {/* ===== 图例（非空态显示） ===== */}
      {!isEmpty && !loading && mapData && (
        <div className="flex justify-center gap-5 px-4 py-2 text-xs text-[#8C857B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#6BBF8A] shadow-[0_0_0_3px_rgba(107,191,138,0.2)]" />
            已点亮
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-[#F2F8FC] border-2 border-dashed border-[#93B8D6]" />
            下一个
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D9D1C3]" />
            未探索
          </span>
        </div>
      )}

      {/* ===== 加载中骨架 ===== */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse rounded-2xl bg-white/60 p-5 w-3/4">
            <div className="h-4 w-3/4 rounded bg-[#E8E0D4]" />
            <div className="mt-2 h-4 w-1/2 rounded bg-[#E8E0D4]" />
          </div>
        </div>
      )}

      {/* ===== 空状态 ===== */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          {/* 全灰底图示意 —— 一排灰色圆点 */}
          <div className="flex gap-4 mb-8 opacity-40">
            <div className="flex flex-col items-center gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-4 h-4 rounded-full bg-[#D9D1C3]" />
              ))}
            </div>
            <div className="flex flex-col items-center gap-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-4 h-4 rounded-full bg-[#D9D1C3]" />
              ))}
            </div>
            <div className="flex flex-col items-center gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-4 h-4 rounded-full bg-[#D9D1C3]" />
              ))}
            </div>
          </div>
          {/* 第一个已点亮节点（绿色发光） */}
          {mapData && mapData.stats.stable === 1 && (
            <div className="mb-4">
              <div className="w-5 h-5 rounded-full bg-[#6BBF8A] shadow-[0_0_0_4px_rgba(107,191,138,0.2),0_0_12px_rgba(107,191,138,0.4)] mx-auto" />
            </div>
          )}
          <h2 className="font-serif text-xl text-[#5E8868]">
            旅程从这一步开始
          </h2>
          <p className="mt-2 text-sm text-[#8C857B] max-w-xs">
            点亮一道题，灰色地图就会染上一块绿 ✦
          </p>
        </div>
      )}

      {/* ===== SVG 画布容器 ===== */}
      {!loading && mapData && !isEmpty && (
        <div className="flex-1 overflow-auto px-2 pb-6">
          <KnowledgeMapCanvas
            nodes={mapData.nodes as KnowledgeNodeData[]}
            edges={mapData.edges}
            mainlines={mapData.mainlines}
            frontier={mapData.learningFrontier}
            onNodeClick={handleNodeClick}
          />
        </div>
      )}

      {/* ===== 节点详情卡 ===== */}
      {selectedDetail && (
        <KnowledgeDetailCard
          node={selectedDetail}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
