/**
 * 知识图谱模块 · 纯单元测试
 *
 * 使用 KnowledgeGraph.fromData() 构造假数据，不连接数据库。
 * 验证：图遍历逻辑、环检测、统计信息。
 */

import { describe, test, expect } from 'vitest';
import { KnowledgeGraph, GraphNode, GraphEdge } from '../../../lib/graph';

// ---- 测试用假数据 ----

const testNodes: GraphNode[] = [
  { id: 'A', name: '节点A', layer: 'mainline', tier: 'A' },
  { id: 'B', name: '节点B', layer: 'mainline', tier: 'A' },
  { id: 'C', name: '节点C', layer: 'mainline', tier: 'B' },
  { id: 'D', name: '节点D', layer: 'foundation', tier: null },
];

// 图结构：A→B, B→C, A→C, D→B
//   A ──→ B ──→ C
//    ↘────────↗
//   D ──→ B
const testEdges: GraphEdge[] = [
  { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
  { sourceId: 'B', targetId: 'C', type: 'prerequisite' },
  { sourceId: 'A', targetId: 'C', type: 'prerequisite' },
  { sourceId: 'D', targetId: 'B', type: 'prerequisite' },
];

// ---- 测试用例 ----

describe('KnowledgeGraph（纯单元 · fromData 构造）', () => {
  const graph = KnowledgeGraph.fromData(testNodes, testEdges);

  test('getStats 返回正确的节点数和边数', () => {
    expect(graph.getStats()).toEqual({ nodeCount: 4, edgeCount: 4 });
  });

  test('prereqsOf("C") 应返回直接前置 A 和 B', () => {
    const ids = graph.prereqsOf('C').map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  test('prereqsOf("B") 应返回直接前置 A 和 D', () => {
    const ids = graph.prereqsOf('B').map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'D']);
  });

  test('prereqsOf("A") 应为空（无前置）', () => {
    expect(graph.prereqsOf('A')).toHaveLength(0);
  });

  test('allPrereqsOf("C") 递归应包含 A、B、D', () => {
    const ids = graph.allPrereqsOf('C').map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'B', 'D']);
  });

  test('dependentsOf("A") 应返回 B 和 C', () => {
    const ids = graph.dependentsOf('A').map((n) => n.id).sort();
    expect(ids).toEqual(['B', 'C']);
  });

  test('dependentsOf("D") 应返回 B', () => {
    const ids = graph.dependentsOf('D').map((n) => n.id).sort();
    expect(ids).toEqual(['B']);
  });

  test('detectCycles 在无环图上返回 false', () => {
    expect(graph.detectCycles()).toBe(false);
  });
});

describe('KnowledgeGraph（环检测）', () => {
  test('detectCycles 检测到环时返回 true', () => {
    // 构造有环图：A→B→C→A
    const cycleEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
      { sourceId: 'B', targetId: 'C', type: 'prerequisite' },
      { sourceId: 'C', targetId: 'A', type: 'prerequisite' },
    ];
    const cycleGraph = KnowledgeGraph.fromData(testNodes.slice(0, 3), cycleEdges);
    expect(cycleGraph.detectCycles()).toBe(true);
  });

  test('悬空边应被忽略（源或目标节点不存在）', () => {
    const danglingEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
      { sourceId: 'X', targetId: 'A', type: 'prerequisite' }, // X 不存在
      { sourceId: 'B', targetId: 'Y', type: 'prerequisite' }, // Y 不存在
    ];
    const graph = KnowledgeGraph.fromData(testNodes.slice(0, 2), danglingEdges);
    // 只应有一条有效边 (A→B)
    expect(graph.getStats()).toEqual({ nodeCount: 2, edgeCount: 1 });
  });

  test('tool 类型的边也加载（供讲解引用）', () => {
    const toolEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
      { sourceId: 'A', targetId: 'C', type: 'tool' },
    ];
    const graph = KnowledgeGraph.fromData(testNodes.slice(0, 3), toolEdges);
    expect(graph.getStats().edgeCount).toBe(2);
  });

  test('单节点无边图', () => {
    const graph = KnowledgeGraph.fromData(
      [{ id: 'X', name: '单节点', layer: 'mainline', tier: 'A' }],
      []
    );
    expect(graph.getStats()).toEqual({ nodeCount: 1, edgeCount: 0 });
    expect(graph.detectCycles()).toBe(false);
    expect(graph.prereqsOf('X')).toHaveLength(0);
    expect(graph.allPrereqsOf('X')).toHaveLength(0);
    expect(graph.dependentsOf('X')).toHaveLength(0);
  });
});
