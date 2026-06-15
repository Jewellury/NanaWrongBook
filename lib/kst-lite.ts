/**
 * KST-lite 初诊算法
 *
 * 对应 TECH_PLAN_v2 §4.1：每条主线解锁时一次。
 * 简化版：取 A 层节点 → 选 boundary 题 → 答对祖先链 stable / 答错后代 gap。
 *
 * 决策③：简化版（先 A 层、不做信息量排序）
 * 决策⑦：correct 由调用方给定，本轮不自动判分
 * 决策⑧：初诊只发 boundary 题
 */

import { KnowledgeGraph, GraphNode } from './graph';

// ---- 类型 ----

export interface KSTInput {
  mainlineNodeIds: string[];           // 该主线下要诊断的节点
  answers: { nodeId: string; correct: boolean }[];
  nodeTiers: Record<string, string | null>;  // nodeId → tier
  mainlineWeights: Record<string, number>;   // mainlineId → 高考权重
  nodeToMainlines: Record<string, string[]>; // nodeId → mainlineId[]
}

export interface KSTOutput {
  nodeStates: Map<string, { status: string; masteryProb: number }>;
  learningFrontier: string[];   // 最多 1-2 个
}

// ---- 主函数 ----

export function runKST(graph: KnowledgeGraph, input: KSTInput): KSTOutput {
  const nodeStates = new Map<string, { status: string; masteryProb: number }>();
  const allNodeIds = new Set(input.mainlineNodeIds);

  // 初始化全部相关节点为 untested
  for (const nodeId of allNodeIds) {
    nodeStates.set(nodeId, { status: 'untested', masteryProb: 0.5 });
  }
  // 也初始化答案中提到的节点（可能包括被传播影响到的节点）
  for (const a of input.answers) {
    if (!nodeStates.has(a.nodeId)) {
      nodeStates.set(a.nodeId, { status: 'untested', masteryProb: 0.5 });
    }
  }

  // 收集答对/答错的节点
  const correctNodes = new Set<string>();
  const wrongNodes = new Set<string>();

  for (const a of input.answers) {
    if (a.correct) {
      correctNodes.add(a.nodeId);
    } else {
      wrongNodes.add(a.nodeId);
    }
  }

  // 传播 stable：答对的节点 → 沿 prereq 边向上标记祖先为 stable
  for (const nodeId of correctNodes) {
    // 自己被排除在初诊外（tier B）则跳过
    const tier = input.nodeTiers[nodeId];
    if (tier && tier !== 'A') continue;

    nodeStates.set(nodeId, { status: 'stable', masteryProb: 0.85 });
    const ancestors = graph.allPrereqsOf(nodeId);
    for (const anc of ancestors) {
      nodeStates.set(anc.id, { status: 'stable', masteryProb: 0.85 });
      allNodeIds.add(anc.id); // 纳入图谱范围
    }
  }

  // 传播 gap：答错的节点 → 自身 + 后代标 gap
  for (const nodeId of wrongNodes) {
    const tier = input.nodeTiers[nodeId];
    if (tier && tier !== 'A') continue;

    nodeStates.set(nodeId, { status: 'gap', masteryProb: 0.15 });

    // 如果任何祖先已经是 gap，这个点不需要再往下标（已被覆盖）
    // 否则标 dependents
    const deps = graph.dependentsOf(nodeId);
    for (const dep of deps) {
      if (!correctNodes.has(dep.id)) {
        nodeStates.set(dep.id, { status: 'gap', masteryProb: 0.15 });
      }
      // 如果后代答对了但祖先 gap → 后代也标 gap（树状依赖）
      const ancestors = graph.allPrereqsOf(dep.id);
      const anyGapAncestor = ancestors.some(a => wrongNodes.has(a.id));
      if (anyGapAncestor && correctNodes.has(dep.id)) {
        nodeStates.set(dep.id, { status: 'gap', masteryProb: 0.15 });
      }
    }
  }

  // === 学习前沿 ===
  // 定义：status 为 gap 或 untested，且全部前置都是 stable 的节点
  // tier 必须是 A（本轮只做 A 层）
  const frontierCandidates: { nodeId: string; tier: string; weight: number }[] = [];

  for (const nodeId of allNodeIds) {
    const state = nodeStates.get(nodeId);
    if (!state) continue;
    if (state.status === 'stable') continue;

    // 检查是否所有前置都是 stable
    const prereqs = graph.prereqsOf(nodeId);
    const allPrereqsStable = prereqs.every(p => {
      const ps = nodeStates.get(p.id);
      return ps?.status === 'stable';
    });
    if (!allPrereqsStable) continue;

    // tier 过滤：只 A 层
    const tier = input.nodeTiers[nodeId];
    if (tier && tier !== 'A') continue;

    // 计算主线权重（取该节点关联主线的最大权重）
    const mlIds = input.nodeToMainlines[nodeId] ?? [];
    const maxWeight = mlIds.length > 0
      ? Math.max(...mlIds.map(m => input.mainlineWeights[m] ?? 0))
      : 0;

    frontierCandidates.push({ nodeId, tier: tier ?? 'C', weight: maxWeight });
  }

  // 排序：tier A > B > C，同 tier 内按权重降序
  const tierOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  frontierCandidates.sort((a, b) => {
    const ta = tierOrder[a.tier] ?? 4;
    const tb = tierOrder[b.tier] ?? 4;
    if (ta !== tb) return ta - tb;
    return b.weight - a.weight;
  });

  const learningFrontier = frontierCandidates.slice(0, 2).map(f => f.nodeId);

  return { nodeStates, learningFrontier };
}
