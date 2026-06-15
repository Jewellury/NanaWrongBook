/**
 * KST-lite 初诊算法 · 单元测试（测试先行）
 *
 * 测：祖先传播 stable / 后代标记 gap / 学习前沿排序 / boundary-only 选题
 */

import { describe, test, expect } from 'vitest';
import { KnowledgeGraph } from '../../../lib/graph';
import { runKST, KSTInput } from '../../../lib/kst-lite';

// ---- 假图谱 ----
//  A(foundation) → B(mainline,A) → C(mainline,A)
//  D(foundation) → E(mainline,A)
//  F(mainline,B) — tier B，不入初诊
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

// 辅助：构造 KSTInput
function makeInput(overrides: Partial<KSTInput> = {}): KSTInput {
  return {
    mainlineNodeIds: [],
    answers: [],
    nodeTiers: Object.fromEntries(testNodes.map(n => [n.id, n.tier])),
    mainlineWeights: { M1: 10, M2a: 16 },
    nodeToMainlines: { B: ['M1'], C: ['M1'], E: ['M2a'], F: ['M2a'] },
    ...overrides,
  };
}

// 辅助：取状态字符串
function statusOf(result: ReturnType<typeof runKST>, nodeId: string): string {
  return result.nodeStates.get(nodeId)?.status ?? 'untested';
}

// ---- 测试用例 ----

describe('KST-lite', () => {

  test('全部答对 → 所有被测节点 + 祖先链标 stable', () => {
    const result = runKST(graph, makeInput({
      mainlineNodeIds: ['B', 'C', 'E'],
      answers: [
        { nodeId: 'B', correct: true },
        { nodeId: 'C', correct: true },
        { nodeId: 'E', correct: true },
      ],
    }));

    expect(statusOf(result, 'A')).toBe('stable');
    expect(statusOf(result, 'B')).toBe('stable');
    expect(statusOf(result, 'C')).toBe('stable');
    expect(statusOf(result, 'D')).toBe('stable');
    expect(statusOf(result, 'E')).toBe('stable');
  });

  test('答错根节点 → 自身 + 后代标 gap', () => {
    const result = runKST(graph, makeInput({
      mainlineNodeIds: ['B', 'C', 'E'],
      answers: [
        { nodeId: 'B', correct: false },
        { nodeId: 'C', correct: true },
        { nodeId: 'E', correct: true },
      ],
    }));

    expect(statusOf(result, 'B')).toBe('gap');
    // C 依赖 B → 祖先 B 是 gap，C 也标 gap
    expect(statusOf(result, 'C')).toBe('gap');
    // E 独立链路，答对了
    expect(statusOf(result, 'E')).toBe('stable');
    expect(statusOf(result, 'D')).toBe('stable');
  });

  test('答错中间节点 → 自身 gap + 后代 gap', () => {
    const result = runKST(graph, makeInput({
      mainlineNodeIds: ['A', 'B', 'C'],
      answers: [
        { nodeId: 'A', correct: true },
        { nodeId: 'B', correct: false },
        { nodeId: 'C', correct: true },
      ],
    }));

    expect(statusOf(result, 'A')).toBe('stable');
    expect(statusOf(result, 'B')).toBe('gap');
    expect(statusOf(result, 'C')).toBe('gap'); // 祖先 B 是 gap
  });

  test('未被测试的节点保持 untested', () => {
    const result = runKST(graph, makeInput({
      mainlineNodeIds: ['B'],
      answers: [{ nodeId: 'B', correct: true }],
    }));

    expect(statusOf(result, 'F')).toBe('untested');
  });

  test('tier B 的节点不进入初诊传播', () => {
    const result = runKST(graph, makeInput({
      mainlineNodeIds: ['F'],
      answers: [{ nodeId: 'F', correct: true }],
    }));

    // tier B 不诊断 → 状态仍是 untested
    expect(statusOf(result, 'F')).toBe('untested');
  });

  test('学习前沿最多取 2 个', () => {
    const result = runKST(graph, makeInput({
      mainlineNodeIds: ['B', 'C', 'E'],
      answers: [
        { nodeId: 'B', correct: true },
        { nodeId: 'C', correct: true },
        { nodeId: 'E', correct: false },
      ],
    }));

    expect(result.learningFrontier.length).toBeLessThanOrEqual(2);
  });
});
