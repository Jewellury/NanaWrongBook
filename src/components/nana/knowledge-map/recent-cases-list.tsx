/**
 * RecentCasesList — 知识地图"最近拍过的题"列表区
 *
 * Stage 1（S1-4）：横向列表 + "未分类"chip + 空态。
 * Stage 2（S2-4）：点 case 展开详情面板 → 懒加载该 case 的知识点标签 +
 *   人工"挂到知识点"操作（从 48 节点里选）。
 *
 * 数据来源决策（S2-4，见执行日志）：
 * - 列表端点不扩展返回 tags[]（避免列表爆体积 + N+1），标签走点击后懒加载 listCaseTags。
 * - 48 节点由知识地图页面（已加载 /api/diagnosis/map）作为 props 传入，
 *   不另起"列出全部节点"端点（避免多余 API）。
 *
 * 措辞合规（OPS §4）：
 * - 人工挂的标签显示节点名 chip；未挂的显示"未分类"。
 * - 不出现 诊断/已诊断/薄弱/得分/掌握/失败；Stage 2 无真 AI 分类，
 *   不说"AI 已识别/已分类"，仅人工挂载。
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ImageIcon, Camera, Tag, Plus, X } from "lucide-react";
import {
  listMyCases,
  listCaseTags,
  tagCaseManually,
  getCase,
  type CaseListItem,
  type CaseKnowledgeTagResponse,
  type CaseResponse,
} from "@/lib/nana/nana-api-client";

// ─── 日期格式化：ISO → "7月1日" ───────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ─── case 详情缓存（Stage 2.5 修复 · 根因 B）───────────────
// 题图是 ~1MB base64，关闭面板再点同一道题不应重拉。
// 本轮 case 创建后不可变（无编辑端点），缓存按 caseId 永久驻留至页面会话结束；
// 标签 (listCaseTags) 不缓存——可经人工挂载变更，每次拉新。
const caseDetailCache = new Map<string, CaseResponse>();

/**
 * 取 case 详情（带内存缓存）。命中直接返回，不命中才请求并写入缓存。
 */
export async function loadCaseDetail(caseId: string): Promise<CaseResponse> {
  const cached = caseDetailCache.get(caseId);
  if (cached) return cached;
  const data = await getCase(caseId);
  caseDetailCache.set(caseId, data);
  return data;
}

/** 仅供单元测试清缓存使用 */
export function __clearCaseDetailCacheForTests(): void {
  caseDetailCache.clear();
}

interface RecentCasesListProps {
  /** 48 个知识点 {id, name}，由知识地图页面（已加载 map）传入；为空时禁用挂载操作 */
  nodes: { id: string; name: string }[];
  /** 浮层抽屉是否打开（可选，不传则按原有常驻模式渲染） */
  open?: boolean;
  /** 关闭浮层回调 */
  onClose?: () => void;
}

export function RecentCasesList({ nodes, open, onClose }: RecentCasesListProps) {
  const isDrawer = open !== undefined && onClose !== undefined;

  const content = <RecentCasesListInner nodes={nodes} />;

  // 非抽屉模式：直接渲染（向后兼容，但当前页面不再使用此路径）
  if (!isDrawer) {
    return (
      <section className="px-4 pb-3">
        {content}
      </section>
    );
  }

  // 抽屉未打开：不渲染任何内容（入口按钮由 page.tsx 渲染）
  if (!open) return null;

  // 抽屉模式：bottom sheet with backdrop
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 半透明遮罩 */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-label="关闭最近拍过的题"
      />
      {/* 底部抽屉 */}
      <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-t-2xl bg-[#FFFDF9] shadow-[0_-8px_40px_rgba(90,80,66,0.22)] border-t border-[#EFE8DD] animate-slide-up">
        {/* 顶部 bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl bg-[#FFFDF9] px-4 pt-3 pb-2 border-b border-[#F2EDE3]">
          <h2 className="text-sm font-semibold text-[#403A33]">最近拍过的题</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center size-7 rounded-full text-[#8C857B] hover:bg-[#F2EDE3] transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 pb-6 pt-3">
          {content}
        </div>
      </div>
    </div>
  );
}

/** Inner content — 原有列表逻辑完全不变 */
function RecentCasesListInner({ nodes }: { nodes: { id: string; name: string }[] }) {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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

  // 列表变化时，若选中的 case 已不在列表，清空选中
  useEffect(() => {
    if (selectedId && !cases.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [cases, selectedId]);

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

  // ─── 有题：横向列表 + 选中详情面板 ───
  return (
    <section className="px-4 pb-3">
      <h2 className="mb-2 text-sm font-semibold text-[#403A33]">
        最近拍过的题
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {cases.map((c) => {
          const isSelected = selectedId === c.id;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelectedId(isSelected ? null : c.id)}
              className={[
                "flex w-[104px] shrink-0 flex-col gap-1.5 rounded-xl border bg-white p-2 text-left transition-colors",
                isSelected
                  ? "border-[#5E8868] ring-1 ring-[#5E8868]"
                  : "border-[#E8E0D4] hover:border-[#B8AFA6]",
              ].join(" ")}
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
            </button>
          );
        })}
      </div>

      {/* ===== 选中 case 的详情面板（Stage 2 S2-4）===== */}
      {selectedId && (
        <CaseTagPanel caseId={selectedId} nodes={nodes} />
      )}
    </section>
  );
}

// ─── 选中 case 的标签面板（懒加载 + 人工挂载）────────────

interface CaseTagPanelProps {
  caseId: string;
  nodes: { id: string; name: string }[];
}

function CaseTagPanel({ caseId, nodes }: CaseTagPanelProps) {
  const [tags, setTags] = useState<CaseKnowledgeTagResponse[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pickedNodeId, setPickedNodeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // 题图懒加载（与标签并行、独立 try/catch，互不阻塞 —— 铁律 6）
  // null=加载中 / {content}=就绪 / 'none'=无题图（不算错）/ 'failed'=拉取失败
  const [imageState, setImageState] = useState<
    { content: string } | "none" | "failed" | null
  >(null);

  // 懒加载该 case 的标签 + 题图（两条请求并行、各自独立 try/catch）
  useEffect(() => {
    let cancelled = false;
    setTags(null);
    setLoadFailed(false);
    setActionMsg(null);
    setImageState(null);

    // 标签（带归属过滤，服务端按当前用户校验）
    listCaseTags(caseId)
      .then((data) => {
        if (!cancelled) setTags(data.tags);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    // 题图（getCase 已带 G1 归属校验：findFirst studentId）
    // 先查内存缓存：关闭面板再点同一道题不重拉 ~1MB base64（Stage 2.5 根因 B）
    const applyCase = (data: CaseResponse) => {
      // 从 artifacts 里找 question_image（seq 最小那条，防万一有多张）
      const imgs = (data.artifacts ?? [])
        .filter((a) => a.type === "question_image")
        .sort((a, b) => a.seq - b.seq);
      if (imgs.length === 0) {
        setImageState("none");
      } else {
        setImageState({ content: imgs[0].content });
      }
    };
    const cached = caseDetailCache.get(caseId);
    if (cached) {
      applyCase(cached);
    } else {
      loadCaseDetail(caseId)
        .then((data) => {
          if (cancelled) return;
          applyCase(data);
        })
        .catch(() => {
          if (cancelled) setImageState("failed");
        });
    }

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));

  async function handleAttach() {
    if (!pickedNodeId) {
      setActionMsg("先选一个知识点");
      return;
    }
    setBusy(true);
    setActionMsg(null);
    try {
      await tagCaseManually(caseId, pickedNodeId);
      // 刷新标签
      const data = await listCaseTags(caseId);
      setTags(data.tags);
      setPickedNodeId("");
      setActionMsg("已挂上");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 409 → 已挂过；其它 → 友好提示，不假装成功（铁律 6）
      if (msg.includes("409")) {
        setActionMsg("这个已经挂过了");
      } else {
        setActionMsg("没挂上，稍后再试");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#E8E0D4] bg-white p-3">
      {/* 题图懒加载（面板顶部；与标签独立，失败不拖标签 —— 铁律 6） */}
      {imageState === null && (
        <div className="mb-3 flex h-[200px] animate-pulse flex-col items-center justify-center gap-2 rounded-xl bg-[#F2EDE3]">
          <ImageIcon className="size-8 text-[#B8AFA6]" />
          <span className="text-[12px] text-[#B8AFA6]">题图加载中…</span>
        </div>
      )}
      {imageState !== null &&
        imageState !== "none" &&
        imageState !== "failed" && (
          <img
            src={imageState.content}
            alt="这道题的原图"
            className="mx-auto mb-3 max-h-[200px] w-auto max-w-full rounded-xl border border-[#E8E0D4] object-contain"
          />
        )}
      {imageState === "failed" && (
        <p className="mb-3 text-[12px] text-[#B8AFA6]">题图没拉到，标签仍可用</p>
      )}

      {/* 已挂标签 */}
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-[#403A33]">
        <Tag className="size-3.5 text-[#5E8868]" />
        知识点
      </div>
      {tags === null && !loadFailed && (
        <p className="text-[13px] text-[#B8AFA6]">加载中…</p>
      )}
      {loadFailed && (
        <p className="text-[13px] text-[#B8AFA6]">没拉到，下拉刷新试试</p>
      )}
      {tags !== null && tags.length === 0 && (
        <span className="inline-block rounded-full bg-[#F2EDE3] px-2 py-0.5 text-[11px] text-[#9A8B7A]">
          未分类
        </span>
      )}
      {tags !== null && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-[#EAF2EC] px-2 py-0.5 text-[11px] text-[#5E8868]"
            >
              {nodeNameById.get(t.nodeId) ?? t.nodeId}
              {t.source === "manual" && (
                <span className="text-[10px] text-[#9ABFA1]">手动</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 挂到知识点（人工，从 48 节点里选） */}
      <div className="mt-3 flex items-center gap-2">
        <select
          value={pickedNodeId}
          onChange={(e) => setPickedNodeId(e.target.value)}
          disabled={busy || nodes.length === 0}
          className="min-w-0 flex-1 rounded-lg border border-[#E8E0D4] bg-[#FBF7F0] px-2 py-1.5 text-[13px] text-[#403A33] focus:border-[#5E8868] focus:outline-none disabled:opacity-50"
        >
          <option value="">{nodes.length === 0 ? "知识点加载中…" : "选一个知识点"}</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAttach}
          disabled={busy || nodes.length === 0 || pickedNodeId === ""}
          className="inline-flex items-center gap-1 rounded-lg bg-[#5E8868] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#4F7858] disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          挂上
        </button>
      </div>
      {actionMsg && (
        <p className="mt-2 text-[12px] text-[#8C857B]">{actionMsg}</p>
      )}
    </div>
  );
}

// end of module
