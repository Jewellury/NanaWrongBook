/**
 * 诊断编排器
 *
 * 对应 TECH_PLAN_v2 §6：周末 session 编排。
 * 把 M2（状态机）+ M3a（KST/BKT/地图）零件串成能跑的诊断流程。
 *
 * 核心原则（M3c 修正）：
 * - 作答节点：从 StudentNodeState 既有先验出发跑 BKT（首诊 P(L₀)=0.5）
 * - 未作答节点：KST 结构传播
 * - 一道题 = 一份证据，不重复计数
 */

import { KnowledgeGraph } from './graph';
import { bktUpdate } from './bkt';

// ---- 类型（复用 + 扩展）----

/** applyBKTToAnswers 的参数：仅需指定 G/S/crossSessionT，pLearn0 和 T 内部处理 */
export interface BKTConfig {
  G: number;
  S: number;
  crossSessionT: number;
}

export interface ItemRecord {
  id: string;
  nodeId: string;
  role: string;       // boundary | concept | variant | drill
  stem: string;
  answer: string;
  analysis: string | null;
}

export interface ExistingState {
  status: string;
  masteryProb: number;
  lastEvidence: Date | null;
}

export interface AnswerEntry {
  nodeId: string;
  itemId: string;
  correct: boolean;
}

export interface NodeStateOutput {
  status: string;
  masteryProb: number;
}

export interface PaperPackNode {
  nodeId: string;
  reason: 'frontier' | 'gap';
}

export interface PaperPackItem {
  itemId: string;
  nodeId: string;
  stem: string;
  role: string;
}

// ============================================================
// 纯逻辑函数（可单元测试）
// ============================================================

/**
 * 从题库中筛选 boundary 题，每个节点取第一道。
 * concept 不进自动流（决策⑧）。
 */
export function selectBoundaryItems(items: ItemRecord[]): ItemRecord[] {
  const boundaryItems = items.filter(i => i.role === 'boundary');
  const seen = new Set<string>();
  const result: ItemRecord[] = [];
  for (const item of boundaryItems) {
    if (!seen.has(item.nodeId)) {
      seen.add(item.nodeId);
      result.push(item);
    }
  }
  return result;
}

/**
 * 对作答节点应用 BKT：从既有先验出发，只吃本次答案一次。
 *
 * @param existingStates  从 StudentNodeState 查出的既有状态
 * @param answers         本次提交的答案
 * @param params          BKT 参数（G, S, crossSessionT）
 * @returns 更新后的节点状态 Map（只含被作答的节点）
 */
export function applyBKTToAnswers(
  existingStates: Map<string, ExistingState>,
  answers: AnswerEntry[],
  config: BKTConfig,
): Map<string, NodeStateOutput> {
  const result = new Map<string, NodeStateOutput>();

  for (const a of answers) {
    const existing = existingStates.get(a.nodeId);
    const pLearn0 = existing?.masteryProb ?? 0.5;

    const bktResult = bktUpdate(
      { pLearn0, T: 0.15, G: config.G, S: config.S, crossSessionT: config.crossSessionT },
      a.correct,
    );

    const masteryProb = bktResult.updatedPLearn;
    let status: string;
    if (masteryProb >= 0.70) {
      status = 'stable';
    } else if (masteryProb <= 0.30) {
      status = 'gap';
    } else {
      status = 'uncertain';
    }

    result.set(a.nodeId, { status, masteryProb });
  }

  return result;
}

/**
 * KST 结构传播：仅对未被本次作答的节点进行祖先/后代定性标记。
 *
 * @param graph             知识图谱
 * @param mainlineNodeIds   主线下的所有节点 ID
 * @param answeredNodeIds   本次被作答的节点 ID 集合（跳过不覆盖）
 * @param answers           本次答案（用于判断对错）
 * @param nodeTiers         nodeId → tier
 * @returns 未作答节点的状态 Map（不含已作答节点）
 */
export function propagateKSTToUnanswered(
  graph: KnowledgeGraph,
  mainlineNodeIds: string[],
  answeredNodeIds: Set<string>,
  answers: AnswerEntry[],
  nodeTiers: Record<string, string | null>,
): Map<string, NodeStateOutput> {
  const result = new Map<string, NodeStateOutput>();

  // 收集答对/答错的节点（只取 A 层）
  const correctNodes = new Set<string>();
  const wrongNodes = new Set<string>();

  for (const a of answers) {
    const tier = nodeTiers[a.nodeId];
    if (tier && tier !== 'A') continue;
    if (a.correct) correctNodes.add(a.nodeId);
    else wrongNodes.add(a.nodeId);
  }

  // 传播 stable：答对节点 → 未作答祖先
  for (const nodeId of correctNodes) {
    const ancestors = graph.allPrereqsOf(nodeId);
    for (const anc of ancestors) {
      if (!answeredNodeIds.has(anc.id) && !result.has(anc.id)) {
        result.set(anc.id, { status: 'stable', masteryProb: 0.85 });
      }
    }
  }

  // 传播 gap：答错节点 → 未作答后代
  for (const nodeId of wrongNodes) {
    const deps = graph.dependentsOf(nodeId);
    for (const dep of deps) {
      if (!answeredNodeIds.has(dep.id) && !result.has(dep.id)) {
        result.set(dep.id, { status: 'gap', masteryProb: 0.15 });
      }
    }
  }

  return result;
}

/**
 * 选择纸质包节点：frontier 优先，不足时用 gap 补位。
 *
 * @param graph            知识图谱
 * @param states           学生既有状态 Map<nodeId, ExistingState>
 * @param nodeIds          候选节点 ID 列表
 * @param mainlineWeights  主线高考权重
 * @param nodeToMainlines  nodeId → mainlineId[]
 * @param maxNodes         最大节点数（默认 4）
 * @returns 排序截断后的节点列表（reason = frontier | gap）
 */
export function selectPaperPackNodes(
  graph: KnowledgeGraph,
  states: Map<string, ExistingState>,
  nodeIds: string[],
  mainlineWeights: Record<string, number>,
  nodeToMainlines: Record<string, string[]>,
  maxNodes: number = 4,
): PaperPackNode[] {
  const frontier: { nodeId: string; tier: string; weight: number }[] = [];
  const gaps: { nodeId: string; tier: string; weight: number }[] = [];

  for (const nodeId of nodeIds) {
    const state = states.get(nodeId);
    if (!state || state.status === 'stable') continue;

    // 检查前置是否全 stable
    const prereqs = graph.prereqsOf(nodeId);
    const allStable = prereqs.every(p => {
      const ps = states.get(p.id);
      return ps?.status === 'stable';
    });

    const node = graph.getNode(nodeId);
    const tier = node?.tier ?? 'C';
    const mlIds = nodeToMainlines[nodeId] ?? [];
    const weight = mlIds.length > 0
      ? Math.max(...mlIds.map(m => mainlineWeights[m] ?? 0))
      : 0;

    if (allStable) {
      frontier.push({ nodeId, tier, weight });
    } else if (state.status === 'gap') {
      gaps.push({ nodeId, tier, weight });
    }
    // uncertain 且非 frontier → 不选
  }

  // 排序
  const tierOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  const sortFn = (a: { tier: string; weight: number }, b: { tier: string; weight: number }) => {
    const ta = tierOrder[a.tier] ?? 4;
    const tb = tierOrder[b.tier] ?? 4;
    if (ta !== tb) return ta - tb;
    return b.weight - a.weight;
  };

  frontier.sort(sortFn);
  gaps.sort(sortFn);

  // 组装：frontier 优先，gap 补位
  const result: PaperPackNode[] = [];
  for (const f of frontier) {
    if (result.length >= maxNodes) break;
    result.push({ nodeId: f.nodeId, reason: 'frontier' });
  }
  for (const g of gaps) {
    if (result.length >= maxNodes) break;
    result.push({ nodeId: g.nodeId, reason: 'gap' });
  }

  return result;
}

/**
 * 为指定节点从题库选练习题：variant 优先 → drill → boundary fallback。
 * 每节点至少 1 道，总题量不超过 maxItems。
 * 不因题目不足而扩大节点范围。
 *
 * @param items     全量题库（已按 nodeId 筛选过的子集）
 * @param nodeIds   目标节点 ID 列表
 * @param maxItems  总题量上限（默认 10）
 */
export function selectPracticeItems(
  items: ItemRecord[],
  nodeIds: string[],
  maxItems: number = 10,
): PaperPackItem[] {
  const result: PaperPackItem[] = [];
  const roleOrder: Record<string, number> = { variant: 0, drill: 1, boundary: 2 };

  // 按节点分组
  const byNode = new Map<string, ItemRecord[]>();
  for (const item of items) {
    if (!nodeIds.includes(item.nodeId)) continue;
    if (item.role === 'concept') continue; // concept 不进纸质包
    if (!byNode.has(item.nodeId)) byNode.set(item.nodeId, []);
    byNode.get(item.nodeId)!.push(item);
  }

  // 每组内排序：variant > drill > boundary
  for (const [, nodeItems] of byNode) {
    nodeItems.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));
  }

  // 轮询选取：每轮给每个节点各加一道，直到达到 maxItems
  const nodeList = nodeIds.filter(id => byNode.has(id));
  if (nodeList.length === 0) return result;

  const indices = new Map<string, number>();
  for (const id of nodeList) indices.set(id, 0);

  let done = false;
  while (!done && result.length < maxItems) {
    done = true;
    for (const nodeId of nodeList) {
      if (result.length >= maxItems) break;
      const pool = byNode.get(nodeId)!;
      const idx = indices.get(nodeId)!;
      if (idx < pool.length) {
        const item = pool[idx];
        result.push({ itemId: item.id, nodeId: item.nodeId, stem: item.stem, role: item.role });
        indices.set(nodeId, idx + 1);
        done = false;
      }
    }
  }

  return result;
}
