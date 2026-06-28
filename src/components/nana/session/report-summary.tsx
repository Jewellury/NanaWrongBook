/**
 * ReportSummary — 报告汇总组件
 *
 * 三个区域：
 * 1. "我们看了什么" — 知识点卡片列表（去重节点，以 correct 全 true 判定"已过"）
 * 2. "做题时看到的信号" — 知识点级出现次数统计文字
 * 3. "先从这里补" — 第一个"还卡着"节点 + 建议模板
 *
 * 纯数据逻辑函数（buildReportData / generateSignalText / findFirstStuckSuggestion）
 * 已导出供单元测试。
 *
 * P4 措辞合规：
 * - "这道已经过了 ✓" / "这道还卡着 ✗" ✅
 * - "做题时看到的信号" ✅（非"错因分析"）
 * - "先从这里补" ✅（非"补救计划"）
 * - 无"薄弱点""未掌握""BKT""KST""masteryProb" ✅
 */
"use client";

import { ReportKnowledgeCard } from "./report-knowledge-card";

// ─── 类型定义 ──────────────────────────────────────────

export interface RecordLike {
  nodeId: string;
  correct: boolean;
}

export interface MapNodeLike {
  nodeId: string;
  name: string;
  judgeCriteria: string | null;
}

export interface KnowledgeCardData {
  nodeId: string;
  name: string;
  judgeCriteria: string | null;
  passed: boolean;
  count: number;
}

// ─── 纯数据逻辑（导出供测试） ───────────────────────────

/**
 * 将答题记录按 nodeId 分组、匹配地图节点信息，
 * 生成知识点卡片渲染所需数据。
 *
 * @param records 答题记录数组（含 nodeId/correct）
 * @param mapNodes 地图节点数组（含 nodeId/name/judgeCriteria）
 * @returns 知识点卡片数据列表
 */
export function buildReportData(
  records: RecordLike[],
  mapNodes: MapNodeLike[]
): KnowledgeCardData[] {
  const nodeLookup = new Map(mapNodes.map((n) => [n.nodeId, n]));

  // 按 nodeId 分组
  const groups = new Map<string, RecordLike[]>();
  for (const r of records) {
    const list = groups.get(r.nodeId) ?? [];
    list.push(r);
    groups.set(r.nodeId, list);
  }

  return Array.from(groups.entries()).map(([nodeId, recs]) => {
    const info = nodeLookup.get(nodeId);
    return {
      nodeId,
      name: info?.name ?? nodeId,
      judgeCriteria: info?.judgeCriteria ?? null,
      passed: recs.every((r) => r.correct),
      count: recs.length,
    };
  });
}

/**
 * 生成"做题时看到的信号"文案。
 * 统计各知识点出现次数，找 top 2-3 生成文字。
 *
 * @returns 如 "这 4 道题集中在「求函数定义域」和「配方法」这两个点上"
 */
export function generateSignalText(
  records: RecordLike[],
  mapNodes: MapNodeLike[]
): string {
  const cards = buildReportData(records, mapNodes);
  const sorted = [...cards].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 3);
  const total = records.length;

  if (top.length === 0) return "还没有做题记录";
  if (top.length === 1) {
    return `这 ${total} 道题集中在「${top[0].name}」这一个点上`;
  }
  if (top.length === 2) {
    return `这 ${total} 道题集中在「${top[0].name}」和「${top[1].name}」这两个点上`;
  }
  // top.length >= 3
  const names = top.map((n) => `「${n.name}」`);
  return `这 ${total} 道题集中在 ${names.slice(0, -1).join("、")}和${names[names.length - 1]}这几个点上`;
}

/**
 * 找第一个"还卡着"的知识点（用于"先从这里补"建议）。
 *
 * @returns 第一个 stuck 节点的 name + nodeId，或 null（全过）
 */
export function findFirstStuckSuggestion(
  records: RecordLike[],
  mapNodes: MapNodeLike[]
): { name: string; nodeId: string } | null {
  const cards = buildReportData(records, mapNodes);
  const stuck = cards.find((c) => !c.passed);
  if (!stuck) return null;
  return { name: stuck.name, nodeId: stuck.nodeId };
}

// ─── 组件 ──────────────────────────────────────────────

interface ReportSummaryProps {
  records: RecordLike[];
  mapNodes: MapNodeLike[];
}

export function ReportSummary({ records, mapNodes }: ReportSummaryProps) {
  const cards = buildReportData(records, mapNodes);
  const signalText = generateSignalText(records, mapNodes);
  const firstStuck = findFirstStuckSuggestion(records, mapNodes);

  if (cards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-sm text-[#8C857B]">还没有做题记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ===== 📊 我们看了什么 ===== */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-[#403A33]">
          我们看了什么
        </h2>
        <div className="space-y-3">
          {cards.map((card) => (
            <ReportKnowledgeCard
              key={card.nodeId}
              name={card.name}
              judgeCriteria={card.judgeCriteria}
              passed={card.passed}
            />
          ))}
        </div>
      </section>

      {/* ===== 📝 做题时看到的信号 ===== */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-[#403A33]">
          做题时看到的信号
        </h2>
        <div className="rounded-2xl border border-[#EFE8DD] bg-[#FFFDF9] p-5 shadow-sm">
          <p className="text-base leading-relaxed text-[#403A33]">
            {signalText}
          </p>
        </div>
      </section>

      {/* ===== 🎯 先从这里补 ===== */}
      {firstStuck && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-[#403A33]">
            先从这里补
          </h2>
          <div className="rounded-2xl bg-[#EAF2EC] p-5 shadow-sm">
            <p className="text-base leading-relaxed text-[#403A33]">
              建议先搞定「{firstStuck.name}」——这是后面所有函数题的基础。
            </p>
          </div>
        </section>
      )}

      {/* ===== CTA 按钮 ===== */}
      <div className="space-y-3 pt-2">
        <a
          href="/nana/paper-pack"
          className="block w-full rounded-full bg-[#5E8868] px-6 py-3.5 text-center text-base font-medium text-white shadow-[0_8px_18px_rgba(94,136,104,0.28)] transition-all hover:shadow-[0_10px_22px_rgba(94,136,104,0.34)] active:scale-[0.98]"
        >
          生成纸质包 ↗
        </a>
        <a
          href="/nana/knowledge-map"
          className="block w-full rounded-full border border-[#7FA886] bg-transparent px-6 py-3.5 text-center text-base font-medium text-[#5E8868] transition-all hover:bg-[#EAF2EC] active:scale-[0.98]"
        >
          看看我的知识地图 ↗
        </a>
      </div>
    </div>
  );
}
