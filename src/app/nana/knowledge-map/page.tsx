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
import { ArrowLeft, ListFilter } from "lucide-react";
import KnowledgeMapCanvas from "@/components/nana/knowledge-map/knowledge-map-canvas";
import KnowledgeMapListView from "@/components/nana/knowledge-map/knowledge-map-list-view";
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
  /** collected 弱标记计数（CaseKnowledgeTag 数）—— 与 status 正交 */
  caseEvidenceCount: number;
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
  // 视图模式：图谱(手机默认) | 列表(无障碍备选)。默认 graph (DP2)
  const [viewMode, setViewMode] = useState<"list" | "graph">("graph");
  // 浮层抽屉：RecentCasesList 不再常驻上方，改为浮层入口
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 空状态判定：少于 2 个节点有状态记录，且没有任何 collected（收过题）节点
  // → 放宽：只挂过题、没测过的孩子也能看到画布 + 琥珀环（修断点 2）
  const litNodeCount = mapData
    ? mapData.stats.stable + mapData.stats.gap + mapData.stats.uncertain
    : 0;
  const collectedNodeCount = mapData
    ? mapData.nodes.filter((n) => (n.caseEvidenceCount ?? 0) > 0).length
    : 0;
  const isEmpty = !loading && mapData && litNodeCount < 2 && collectedNodeCount === 0;

  // "可以先看" / "下一个" 动态措辞（DP3）—— 零数据态语义修正
  const nextLabel: "可以先看" | "下一个" =
    mapData && mapData.stats.stable === 0 ? "可以先看" : "下一个";

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
      const hasEvidence = (node.caseEvidenceCount ?? 0) > 0;

      // stable / frontier / 收过题 的节点点击弹出详情卡
      // 纯未探索节点（没测过、没收过题）点击不弹出
      if (!isStable && !isFrontier && !hasEvidence) return;

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
        caseEvidenceCount: selectedNode.caseEvidenceCount ?? 0,
      }
    : null;

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-[#FBF7F0]">
      {/* ===== 顶栏（紧凑 ~50px）===== */}
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

      {/* ===== 图例 + 视图切换（非空态、非加载时显示）===== */}
      {!loading && mapData && !isEmpty && (
        <>
          {/* 图例 + toggle 并排 */}
          <div className="flex items-center justify-between px-4 py-1.5">
            {/* 图例（紧凑单行） */}
            <div className="flex gap-3 text-[11px] text-[#8C857B]">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-[#6BBF8A] shadow-[0_0_0_3px_rgba(107,191,138,0.2)]" />
                已点亮
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F2F8FC] border-2 border-dashed border-[#93B8D6]" />
                {nextLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-[#D9D1C3]" />
                未探索
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-[#E8A33D]/30 ring-2 ring-[#E8A33D]" />
                收过题
              </span>
            </div>

            {/* segmented control: 图谱 | 列表 (DP2) */}
            <div className="inline-flex rounded-full bg-[#EFE8DD] p-1 text-[11px] shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setViewMode("graph")}
                className={
                  viewMode === "graph"
                    ? "rounded-full bg-white px-3 py-1 font-medium text-[#403A33]"
                    : "px-3 py-1 text-[#8C857B]"
                }
              >
                图谱
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={
                  viewMode === "list"
                    ? "rounded-full bg-white px-3 py-1 font-medium text-[#403A33]"
                    : "px-3 py-1 text-[#8C857B]"
                }
              >
                列表
              </button>
            </div>
          </div>

          {/* ===== 主内容区 flex-1（图谱或列表独占）===== */}
          <div className="relative flex-1 px-0">
            {viewMode === "list" ? (
              <KnowledgeMapListView
                nodes={mapData.nodes as KnowledgeNodeData[]}
                frontier={mapData.learningFrontier}
                onNodeClick={handleNodeClick}
                nextLabel={nextLabel}
              />
            ) : (
              <KnowledgeMapCanvas
                variant="mobile"
                nodes={mapData.nodes as KnowledgeNodeData[]}
                edges={mapData.edges}
                mainlines={mapData.mainlines}
                frontier={mapData.learningFrontier}
                onNodeClick={handleNodeClick}
                nextLabel={nextLabel}
              />
            )}

            {/* ===== 浮层入口按钮（图谱模式下显示，左下角）===== */}
            {viewMode === "graph" && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="absolute bottom-3 left-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-[12px] font-medium text-[#403A33] shadow-[0_4px_16px_rgba(90,80,66,0.18)] border border-[#E8E0D4] backdrop-blur-sm transition-colors hover:bg-white"
              >
                <ListFilter className="size-3.5 text-[#5E8868]" />
                最近拍过
              </button>
            )}
          </div>
        </>
      )}

      {/* ===== 节点详情卡（overlay，不挤压画布）===== */}
      {selectedDetail && (
        <KnowledgeDetailCard
          node={selectedDetail}
          onClose={() => setSelectedNodeId(null)}
          nextLabel={nextLabel}
          caseEvidenceCount={selectedDetail.caseEvidenceCount ?? 0}
        />
      )}

      {/* ===== RecentCasesList 浮层抽屉（bottom sheet）===== */}
      {!loading && mapData && (
        <RecentCasesList
          nodes={
            mapData.nodes.map((n) => ({ id: n.nodeId, name: n.name })) ?? []
          }
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
