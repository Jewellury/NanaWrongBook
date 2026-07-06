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
import { ArrowLeft, ListFilter, ImageIcon } from "lucide-react";
import KnowledgeMapCanvas from "@/components/nana/knowledge-map/knowledge-map-canvas";
import KnowledgeMapListView from "@/components/nana/knowledge-map/knowledge-map-list-view";
import KnowledgeDetailCard from "@/components/nana/knowledge-map/knowledge-detail-card";
import { RecentCasesList } from "@/components/nana/knowledge-map/recent-cases-list";
import { getCaseSummary, type CaseSummaryGroup } from "@/lib/nana/nana-api-client";
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
  // 三 tab：汇总(默认) | 图谱 | 列表
  const [activeTab, setActiveTab] = useState<"summary" | "graph" | "list">("summary");
  // 兼容原 viewMode
  const viewMode = activeTab === "list" ? "list" : "graph";
  // 题目汇总数据
  const [summaryData, setSummaryData] = useState<{ groups: CaseSummaryGroup[]; total: number } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // 浮层抽屉：RecentCasesList 不再常驻上方，改为浮层入口
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 浮层入口按钮 pressed 态（仅浮层入口按钮，不含空状态按钮和 URL 参数自动打开）
  const [floatingBtnPressed, setFloatingBtnPressed] = useState(false);

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

  // 冷启动死锁修复：从拍题页 ?openCases=1 跳转过来时，自动打开最近题抽屉
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openCases") === "1") {
      setDrawerOpen(true);
    }
  }, []);

  // 题目汇总数据懒加载（切到 summary tab 时加载）
  useEffect(() => {
    if (activeTab !== "summary" || summaryData) return;
    setSummaryLoading(true);
    getCaseSummary()
      .then((data) => setSummaryData(data))
      .catch(() => setSummaryData(null))
      .finally(() => setSummaryLoading(false));
  }, [activeTab, summaryData]);

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
          {mapData && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-5 py-2.5 text-sm font-medium text-[#5E8868] border border-[#E8E0D4] shadow-sm transition-colors hover:bg-[#EAF2EC]"
            >
              <ListFilter className="size-4" />
              最近拍过的题
            </button>
          )}
        </div>
      )}

      {/* ===== 三 tab 切换（汇总 | 图谱 | 列表）===== */}
      {!loading && mapData && !isEmpty && (
        <>
          <div className="flex items-center justify-between px-4 py-1.5">
            {/* 图例（仅图谱 tab 显示） */}
            <div className="flex gap-3 text-[11px] text-[#8C857B]">
              {activeTab === "graph" && (
                <>
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
                </>
              )}
            </div>

            {/* segmented control: 汇总 | 图谱 | 列表 */}
            <div className="inline-flex rounded-full bg-[#EFE8DD] p-1 text-[11px] shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={
                  activeTab === "summary"
                    ? "rounded-full bg-white px-3 py-1 font-medium text-[#403A33]"
                    : "px-3 py-1 text-[#8C857B]"
                }
              >
                汇总
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("graph")}
                className={
                  activeTab === "graph"
                    ? "rounded-full bg-white px-3 py-1 font-medium text-[#403A33]"
                    : "px-3 py-1 text-[#8C857B]"
                }
              >
                图谱
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("list")}
                className={
                  activeTab === "list"
                    ? "rounded-full bg-white px-3 py-1 font-medium text-[#403A33]"
                    : "px-3 py-1 text-[#8C857B]"
                }
              >
                列表
              </button>
            </div>
          </div>

          {/* ===== 主内容区 flex-1 ===== */}
          <div className="relative flex-1 px-0">
            {/* ── 汇总 tab ── */}
            {activeTab === "summary" && (
              <div className="px-4 pb-20 overflow-y-auto">
                {summaryLoading && (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-xl bg-white/60 p-4">
                        <div className="h-3 w-1/3 rounded bg-[#E8E0D4]" />
                        <div className="mt-2 h-4 w-2/3 rounded bg-[#E8E0D4]" />
                      </div>
                    ))}
                  </div>
                )}
                {!summaryLoading && summaryData && summaryData.total === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ImageIcon className="size-12 text-[#D9D1C3] mb-3" />
                    <p className="text-sm text-[#8C857B]">还没有拍过的题</p>
                    <p className="text-xs text-[#8C857B] mt-1">去拍一道题试试 ✦</p>
                  </div>
                )}
                {!summaryLoading && summaryData && summaryData.total > 0 && (
                  <div className="space-y-4">
                    {summaryData.groups.map((group, gi) => (
                      <div key={gi}>
                        {/* 分组标题 */}
                        <div className="sticky top-0 z-10 bg-[#FBF7F0] py-1.5">
                          <p className="text-xs font-medium text-[#5E8868]">
                            {group.topic ? group.topic.name : "未分类/暂未覆盖"}
                          </p>
                          {group.topic && (
                            <p className="text-[10px] text-[#8C857B]">{group.topic.chapter}</p>
                          )}
                        </div>
                        {/* case 卡片列表 */}
                        <div className="space-y-2">
                          {group.cases.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl bg-white/80 p-3 border border-[#E8E0D4] flex items-start gap-3"
                            >
                              {/* 题图占位 */}
                              <div className="shrink-0 w-10 h-10 rounded-lg bg-[#F5F1EA] flex items-center justify-center">
                                {item.hasImage ? (
                                  <ImageIcon className="size-4 text-[#8C857B]" />
                                ) : (
                                  <span className="text-[10px] text-[#8C857B]">无图</span>
                                )}
                              </div>
                              {/* 内容 */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[#403A33] truncate">
                                  {item.aiSummary || "暂无摘要"}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-[#8C857B]">
                                    {new Date(item.createdAt).getMonth() + 1}月{new Date(item.createdAt).getDate()}日
                                  </span>
                                  {item.textbookChapter && (
                                    <span className="text-[10px] text-[#8C857B] truncate">
                                      {item.textbookChapter}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* processStatus chip */}
                              <span
                                className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  item.processStatus === "success"
                                    ? "bg-[#6BBF8A]/15 text-[#5E8868]"
                                    : item.processStatus === "failed"
                                    ? "bg-[#E8A33D]/15 text-[#E8A33D]"
                                    : "bg-[#D9D1C3]/30 text-[#8C857B]"
                                }`}
                              >
                                {item.processStatus === "success"
                                  ? "已完成"
                                  : item.processStatus === "failed"
                                  ? "需重试"
                                  : "待处理"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 图谱 tab ── */}
            {activeTab === "graph" && (
              <>
                <KnowledgeMapCanvas
                  variant="mobile"
                  nodes={mapData.nodes as KnowledgeNodeData[]}
                  edges={mapData.edges}
                  mainlines={mapData.mainlines}
                  frontier={mapData.learningFrontier}
                  onNodeClick={handleNodeClick}
                  nextLabel={nextLabel}
                />

                {/* 浮层入口按钮（图谱模式下显示，左下角） */}
                <button
                  type="button"
                  onClick={() => { setDrawerOpen(true); setFloatingBtnPressed(true); }}
                  className={`absolute bottom-3 left-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-[12px] font-medium text-[#403A33] shadow-[0_4px_16px_rgba(90,80,66,0.18)] border border-[#E8E0D4] backdrop-blur-sm transition-transform hover:bg-white ${floatingBtnPressed ? 'scale-95 opacity-80' : ''}`}
                >
                  <ListFilter className="size-3.5 text-[#5E8868]" />
                  最近拍过
                </button>
              </>
            )}

            {/* ── 列表 tab ── */}
            {activeTab === "list" && (
              <KnowledgeMapListView
                nodes={mapData.nodes as KnowledgeNodeData[]}
                frontier={mapData.learningFrontier}
                onNodeClick={handleNodeClick}
                nextLabel={nextLabel}
              />
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
          onClose={() => { setDrawerOpen(false); setFloatingBtnPressed(false); }}
        />
      )}
    </div>
  );
}
