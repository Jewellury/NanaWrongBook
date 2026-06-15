/**
 * 诊断编排器 · 单元测试（测试先行）
 *
 * 测纯逻辑函数：
 * - boundary 选题
 * - BKT 应用于作答节点（从既有先验出发）
 * - KST 结构传播（只传播未作答节点）
 * - 纸质包节点选择（frontier 优先 + gap 封顶）
 * - 练习题选择（variant 优先 → drill → boundary fallback）
 */

import { describe, test, expect } from 'vitest';
import { KnowledgeGraph } from '../../../lib/graph';
import {
  selectBoundaryItems,
  applyBKTToAnswers,
  propagateKSTToUnanswered,
  selectPaperPackNodes,
  selectPracticeItems,
  ItemRecord,
  ExistingState,
  AnswerEntry,
  BKTConfig,
} from '../../../lib/diagnosis-orchestrator';

// ============================================================
// 假数据
// ============================================================

const testNodes = [
  { id: 'A', name: '地基A', layer: 'foundation', tier: null },
  { id: 'B', name: '主线B', layer: 'mainline', tier: 'A' },
  { id: 'C', name: '主线C', layer: 'mainline', tier: 'A' },
  { id: 'D', name: '地基D', layer: 'foundation', tier: null },
  { id: 'E', name: '主线E', layer: 'mainline', tier: 'A' },
  { id: 'F', name: '主线F', layer: 'mainline', tier: 'B' },
];

const testEdges = [
  { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
  { sourceId: 'B', targetId: 'C', type: 'prerequisite' },
  { sourceId: 'D', targetId: 'E', type: 'prerequisite' },
];

const graph = KnowledgeGraph.fromData(testNodes, testEdges);

const MAINLINE_WEIGHT: Record<string, number> = {
  M0: 0, M1: 10, M2a: 16, M3: 25.5, M5: 5, M8: 14.5,
  M4: 18.5, M2b: 10, M6: 20.5, M7: 29.5,
};

// ============================================================
// 辅助函数
// ============================================================

function makeItems(overrides: Partial<ItemRecord>[]): ItemRecord[] {
  return overrides.map((o, i) => ({
    id: o.id ?? `item-${i}`,
    nodeId: o.nodeId ?? 'B',
    role: o.role ?? 'boundary',
    stem: o.stem ?? `题目 ${i}`,
    answer: o.answer ?? '答案',
    analysis: o.analysis ?? null,
  }));
}

function makeAnswers(overrides: Partial<AnswerEntry>[]): AnswerEntry[] {
  return overrides.map((o, i) => ({
    nodeId: o.nodeId ?? 'B',
    itemId: o.itemId ?? `item-${i}`,
    correct: o.correct ?? true,
  }));
}

function makeStates(overrides: Partial<ExistingState>[]): Map<string, ExistingState> {
  const m = new Map<string, ExistingState>();
  for (const o of overrides) {
    m.set(o.nodeId!, {
      status: o.status ?? 'untested',
      masteryProb: o.masteryProb ?? 0.5,
      lastEvidence: o.lastEvidence ?? null,
    });
  }
  return m;
}

// ============================================================
// 1. selectBoundaryItems
// ============================================================

describe('selectBoundaryItems', () => {
  test('只返回 boundary 角色的题目', () => {
    const items = makeItems([
      { id: 'B-b-1', nodeId: 'B', role: 'boundary', stem: 'boundary题' },
      { id: 'B-v-1', nodeId: 'B', role: 'variant', stem: 'variant题' },
      { id: 'B-c-1', nodeId: 'B', role: 'concept', stem: 'concept题' },
      { id: 'C-b-1', nodeId: 'C', role: 'boundary', stem: 'C的boundary' },
    ]);

    const result = selectBoundaryItems(items);

    expect(result).toHaveLength(2);
    expect(result.every(i => i.role === 'boundary')).toBe(true);
    expect(result.map(i => i.id).sort()).toEqual(['B-b-1', 'C-b-1']);
  });

  test('每个节点只取一道 boundary 题', () => {
    const items = makeItems([
      { id: 'B-b-1', nodeId: 'B', role: 'boundary' },
      { id: 'B-b-2', nodeId: 'B', role: 'boundary' },
    ]);

    const result = selectBoundaryItems(items);

    // 同节点取第一个
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('B-b-1');
  });

  test('没有 boundary 题时返回空', () => {
    const items = makeItems([
      { id: 'B-v-1', nodeId: 'B', role: 'variant' },
      { id: 'B-d-1', nodeId: 'B', role: 'drill' },
    ]);

    const result = selectBoundaryItems(items);

    expect(result).toHaveLength(0);
  });

  test('空题库返回空', () => {
    expect(selectBoundaryItems([])).toHaveLength(0);
  });
});

// ============================================================
// 2. applyBKTToAnswers — 作答节点从既有先验出发跑 BKT
// ============================================================

describe('applyBKTToAnswers', () => {
  const bktConfig: BKTConfig = { G: 0.20, S: 0.10, crossSessionT: 0 };

  test('首诊中性起点 0.5 答对 → masteryProb 应约为 0.82', () => {
    const existing = makeStates([{ nodeId: 'B', masteryProb: 0.5, status: 'untested' }]);
    const answers = makeAnswers([{ nodeId: 'B', correct: true }]);

    const result = applyBKTToAnswers(existing, answers, bktConfig);

    const state = result.get('B')!;
    // 0.5 答对: num=0.45, denom=0.55 → 0.818
    expect(state.masteryProb).toBeGreaterThan(0.80);
    expect(state.masteryProb).toBeLessThan(0.85);
    expect(state.status).toBe('stable'); // ≥0.70
  });

  test('首诊中性起点 0.5 答错 → masteryProb 应约为 0.11', () => {
    const existing = makeStates([{ nodeId: 'B', masteryProb: 0.5, status: 'untested' }]);
    const answers = makeAnswers([{ nodeId: 'B', correct: false }]);

    const result = applyBKTToAnswers(existing, answers, bktConfig);

    const state = result.get('B')!;
    // 0.5 答错: num=0.05, denom=0.45 → 0.111
    expect(state.masteryProb).toBeGreaterThan(0.08);
    expect(state.masteryProb).toBeLessThan(0.15);
    expect(state.status).toBe('gap'); // ≤0.30
  });

  test('既有 stable 0.82 答错 → 跌入 uncertain', () => {
    const existing = makeStates([{ nodeId: 'C', masteryProb: 0.82, status: 'stable' }]);
    const answers = makeAnswers([{ nodeId: 'C', correct: false }]);

    const result = applyBKTToAnswers(existing, answers, bktConfig);

    const state = result.get('C')!;
    // 0.82 答错: num=0.082, denom=0.226 → ≈0.363
    expect(state.masteryProb).toBeGreaterThan(0.30);
    expect(state.masteryProb).toBeLessThan(0.50);
    expect(state.status).toBe('uncertain'); // 0.30~0.70
  });

  test('无既有记录 → 默认 P(L₀)=0.5', () => {
    const existing = new Map<string, ExistingState>(); // 空
    const answers = makeAnswers([{ nodeId: 'B', correct: true }]);

    const result = applyBKTToAnswers(existing, answers, bktConfig);

    const state = result.get('B')!;
    expect(state.masteryProb).toBeGreaterThan(0.80);
    expect(state.masteryProb).toBeLessThan(0.85);
  });

  test('跨 session 施加 T=0.15（答错后仍施加学习转移）', () => {
    const existing = makeStates([{ nodeId: 'B', masteryProb: 0.5, status: 'untested' }]);
    const answers = makeAnswers([{ nodeId: 'B', correct: false }]);
    const params: BKTParams = { G: 0.20, S: 0.10, crossSessionT: 0.15 };

    const result = applyBKTToAnswers(existing, answers, params);

    const state = result.get('B')!;
    // posterior≈0.111, updated=0.111+0.889×0.15≈0.244
    expect(state.masteryProb).toBeGreaterThan(0.20);
    expect(state.masteryProb).toBeLessThan(0.30);
    // 仍在 gap 范围（≤0.30）
    expect(state.status).toBe('gap');
  });

  test('多个答案各自独立更新', () => {
    const existing = makeStates([
      { nodeId: 'B', masteryProb: 0.5, status: 'untested' },
      { nodeId: 'E', masteryProb: 0.5, status: 'untested' },
    ]);
    const answers = makeAnswers([
      { nodeId: 'B', correct: true },
      { nodeId: 'E', correct: false },
    ]);

    const result = applyBKTToAnswers(existing, answers, bktConfig);

    expect(result.get('B')!.status).toBe('stable');
    expect(result.get('E')!.status).toBe('gap');
  });
});

// ============================================================
// 3. propagateKSTToUnanswered — KST 只传播未作答节点
// ============================================================

describe('propagateKSTToUnanswered', () => {
  test('答对节点 → 未作答祖先标 stable，作答节点本身不在 KST 结果中', () => {
    const bktResults = new Map([
      ['B', { status: 'stable', masteryProb: 0.82 }],
    ]);
    const answeredNodeIds = new Set(['B']);

    const result = propagateKSTToUnanswered(
      graph,
      ['A', 'B', 'C'],
      answeredNodeIds,
      [
        { nodeId: 'B', correct: true },
      ],
      Object.fromEntries(testNodes.map(n => [n.id, n.tier])),
    );

    // B 已作答 → 不在 KST 传播结果中（由 applyBKTToAnswers 处理）
    expect(result.has('B')).toBe(false);
    // A 是 B 的祖先 → KST 标 stable
    expect(result.get('A')!.status).toBe('stable');
    expect(result.get('A')!.masteryProb).toBe(0.85);
  });

  test('答错节点 → 未作答后代标 gap，作答节点本身不在 KST 结果中', () => {
    const bktResults = new Map([
      ['B', { status: 'gap', masteryProb: 0.11 }],
    ]);
    const answeredNodeIds = new Set(['B']);

    const result = propagateKSTToUnanswered(
      graph,
      ['A', 'B', 'C'],
      answeredNodeIds,
      [
        { nodeId: 'B', correct: false },
      ],
      Object.fromEntries(testNodes.map(n => [n.id, n.tier])),
    );

    // B 已作答 → 不在 KST 传播结果中（由 applyBKTToAnswers 处理）
    expect(result.has('B')).toBe(false);
    // C 是 B 的后代 → KST 标 gap
    expect(result.get('C')!.status).toBe('gap');
    expect(result.get('C')!.masteryProb).toBe(0.15);
  });

  test('后代也被作答 → 跳过不覆盖，两个作答节点均不在 KST 结果中', () => {
    const bktResults = new Map([
      ['B', { status: 'gap', masteryProb: 0.11 }],
      ['C', { status: 'stable', masteryProb: 0.82 }],
    ]);
    const answeredNodeIds = new Set(['B', 'C']);

    const result = propagateKSTToUnanswered(
      graph,
      ['A', 'B', 'C'],
      answeredNodeIds,
      [
        { nodeId: 'B', correct: false },
        { nodeId: 'C', correct: true },
      ],
      Object.fromEntries(testNodes.map(n => [n.id, n.tier])),
    );

    // B、C 都已作答 → 均不在 KST 传播结果中
    expect(result.has('B')).toBe(false);
    expect(result.has('C')).toBe(false);
  });

  test('无关节点不受 KST 传播影响 → 不在结果中，但图谱链上的节点仍被传播', () => {
    const bktResults = new Map([
      ['B', { status: 'stable', masteryProb: 0.82 }],
    ]);
    const answeredNodeIds = new Set(['B']);

    const result = propagateKSTToUnanswered(
      graph,
      ['D', 'E'],
      answeredNodeIds,
      [{ nodeId: 'B', correct: true }],
      Object.fromEntries(testNodes.map(n => [n.id, n.tier])),
    );

    // D、E 与 B 的图谱链无关 → 不在 KST 传播结果中
    expect(result.has('D')).toBe(false);
    expect(result.has('E')).toBe(false);
    // A 是 B 的祖先（图谱链上）→ 被标 stable
    expect(result.get('A')?.status).toBe('stable');
  });
});

// ============================================================
// 4. selectPaperPackNodes — frontier 优先 + gap 封顶
// ============================================================

describe('selectPaperPackNodes', () => {
  const nodeToML: Record<string, string[]> = {
    B: ['M1'], C: ['M1'], E: ['M2a'], F: ['M2a'],
  };

  test('frontier 节点优先（前置全 stable 的 gap/untested）', () => {
    const states = makeStates([
      { nodeId: 'A', status: 'stable', masteryProb: 0.85 },
      { nodeId: 'B', status: 'gap', masteryProb: 0.11 },      // frontier (A stable)
      { nodeId: 'C', status: 'gap', masteryProb: 0.15 },      // not frontier (B not stable)
      { nodeId: 'D', status: 'stable', masteryProb: 0.85 },
      { nodeId: 'E', status: 'untested', masteryProb: 0.5 }, // frontier (D stable)
    ]);

    const result = selectPaperPackNodes(
      graph, states, ['B', 'C', 'E'], MAINLINE_WEIGHT, nodeToML, 4,
    );

    // B（frontier gap）和 E（frontier untested）优先
    const frontierNodes = result.filter(n => n.reason === 'frontier');
    expect(frontierNodes).toHaveLength(2);
    expect(frontierNodes.map(n => n.nodeId).sort()).toEqual(['B', 'E']);
  });

  test('frontier 满了就截断，不留 gap 名额', () => {
    const states = makeStates([
      { nodeId: 'A', status: 'stable', masteryProb: 0.85 },
      { nodeId: 'B', status: 'gap', masteryProb: 0.11 },      // frontier
      { nodeId: 'D', status: 'stable', masteryProb: 0.85 },
      { nodeId: 'E', status: 'untested', masteryProb: 0.5 }, // frontier
    ]);

    const result = selectPaperPackNodes(
      graph, states, ['B', 'E'], MAINLINE_WEIGHT, nodeToML, 2,
    );

    expect(result).toHaveLength(2);
    expect(result.every(n => n.reason === 'frontier')).toBe(true);
  });

  test('frontier 不足时用 gap 补位（按 tier→权重排序）', () => {
    const states = makeStates([
      { nodeId: 'A', status: 'stable', masteryProb: 0.85 },
      { nodeId: 'B', status: 'gap', masteryProb: 0.11 },      // frontier
      { nodeId: 'C', status: 'gap', masteryProb: 0.11 },      // not frontier (B not stable)
    ]);

    const result = selectPaperPackNodes(
      graph, states, ['B', 'C'], MAINLINE_WEIGHT, nodeToML, 4,
    );

    expect(result).toHaveLength(2);
    expect(result[0].nodeId).toBe('B');
    expect(result[0].reason).toBe('frontier');
    expect(result[1].nodeId).toBe('C');
    expect(result[1].reason).toBe('gap');
  });

  test('stable 节点永不被选中', () => {
    const states = makeStates([
      { nodeId: 'A', status: 'stable', masteryProb: 0.85 },
      { nodeId: 'B', status: 'stable', masteryProb: 0.82 },
    ]);

    const result = selectPaperPackNodes(
      graph, states, ['B'], MAINLINE_WEIGHT, nodeToML, 4,
    );

    expect(result).toHaveLength(0);
  });

  test('maxNodes=0 时返回空', () => {
    const states = makeStates([{ nodeId: 'B', status: 'gap', masteryProb: 0.11 }]);
    const result = selectPaperPackNodes(
      graph, states, ['B'], MAINLINE_WEIGHT, nodeToML, 0,
    );
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// 5. selectPracticeItems — variant 优先 → drill → boundary fallback
// ============================================================

describe('selectPracticeItems', () => {
  test('variant 优先选取', () => {
    const items = makeItems([
      { id: 'B-v-1', nodeId: 'B', role: 'variant', stem: 'v题' },
      { id: 'B-v-2', nodeId: 'B', role: 'variant', stem: 'v题2' },
      { id: 'B-d-1', nodeId: 'B', role: 'drill', stem: 'd题' },
    ]);
    const nodeIds = ['B'];

    const result = selectPracticeItems(items, nodeIds, 10);

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('variant');
    expect(result[1].role).toBe('variant');
  });

  test('variant 不够用 drill 补', () => {
    const items = makeItems([
      { id: 'B-v-1', nodeId: 'B', role: 'variant', stem: 'v题' },
      { id: 'B-d-1', nodeId: 'B', role: 'drill', stem: 'd题' },
    ]);
    const nodeIds = ['B'];

    const result = selectPracticeItems(items, nodeIds, 10);

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('variant');
    expect(result[1].role).toBe('drill');
  });

  test('variant 和 drill 都不够用 boundary 补', () => {
    const items = makeItems([
      { id: 'B-v-1', nodeId: 'B', role: 'variant', stem: 'v题' },
      { id: 'B-b-1', nodeId: 'B', role: 'boundary', stem: 'b题' },
    ]);
    const nodeIds = ['B'];

    const result = selectPracticeItems(items, nodeIds, 10);

    expect(result).toHaveLength(2);
    expect(result.map(i => i.role).includes('boundary')).toBe(true);
  });

  test('maxItems 封顶，所有节点各至少 1 道题', () => {
    const items = makeItems([
      { id: 'B-v-1', nodeId: 'B', role: 'variant' },
      { id: 'B-v-2', nodeId: 'B', role: 'variant' },
      { id: 'C-v-1', nodeId: 'C', role: 'variant' },
      { id: 'C-d-1', nodeId: 'C', role: 'drill' },
    ]);
    const nodeIds = ['B', 'C'];

    const result = selectPracticeItems(items, nodeIds, 3);

    // 每个节点至少一道，共 3 题
    expect(result).toHaveLength(3);
    const bItems = result.filter(i => i.nodeId === 'B');
    const cItems = result.filter(i => i.nodeId === 'C');
    expect(bItems.length).toBeGreaterThanOrEqual(1);
    expect(cItems.length).toBeGreaterThanOrEqual(1);
  });

  test('题目不足不扩大节点范围（宁可少也不多选）', () => {
    const items = makeItems([
      { id: 'B-v-1', nodeId: 'B', role: 'variant' },
    ]);
    const nodeIds = ['B', 'C']; // C 没题，但不会因此扩大选其他节点

    const result = selectPracticeItems(items, nodeIds, 10);

    // B 有 1 题，C 没题 → 总共就 1 题
    expect(result).toHaveLength(1);
    expect(result[0].nodeId).toBe('B');
  });
});
