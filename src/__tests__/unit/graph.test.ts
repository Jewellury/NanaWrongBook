/**
 * 知识图谱模块 · 纯单元测试
 *
 * 使用 KnowledgeGraph.fromData() 构造假数据，不连接数据库。
 * 验证：图遍历逻辑（仅 prerequisite 边）、环检测、tool 边隔离、主线子图。
 */

import { describe, test, expect } from 'vitest';
import { KnowledgeGraph, GraphNode, GraphEdge } from '../../../lib/graph';

// ---- 测试用假数据 ----

const testNodes: GraphNode[] = [
  { id: 'A', name: '节点A', layer: 'mainline', tier: 'A' },
  { id: 'B', name: '节点B', layer: 'mainline', tier: 'A' },
  { id: 'C', name: '节点C', layer: 'mainline', tier: 'B' },
  { id: 'D', name: '节点D', layer: 'foundation', tier: null },
  { id: 'E', name: '节点E', layer: 'mainline', tier: 'A' },
];

// prerequisite 图：A→B, B→C, A→C, D→B, E→B
const testEdges: GraphEdge[] = [
  { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
  { sourceId: 'B', targetId: 'C', type: 'prerequisite' },
  { sourceId: 'A', targetId: 'C', type: 'prerequisite' },
  { sourceId: 'D', targetId: 'B', type: 'prerequisite' },
  { sourceId: 'E', targetId: 'B', type: 'prerequisite' },
];

// ---- 图遍历（仅 prerequisite 边） ----

describe('KnowledgeGraph（图遍历 · 仅 prerequisite 边）', () => {
  const graph = KnowledgeGraph.fromData(testNodes, testEdges);

  test('getStats 返回正确的节点数和边数', () => {
    expect(graph.getStats()).toEqual({ nodeCount: 5, edgeCount: 5 });
  });

  test('prereqsOf("C") 应返回直接前置 A 和 B', () => {
    const ids = graph.prereqsOf('C').map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  test('prereqsOf("B") 应返回直接前置 A、D、E', () => {
    const ids = graph.prereqsOf('B').map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'D', 'E']);
  });

  test('prereqsOf("A") 应为空（无前置）', () => {
    expect(graph.prereqsOf('A')).toHaveLength(0);
  });

  test('allPrereqsOf("C") 递归应包含 A、B、D、E', () => {
    const ids = graph.allPrereqsOf('C').map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'B', 'D', 'E']);
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

// ---- tool 边隔离 ----

describe('KnowledgeGraph（tool 边不参与图遍历）', () => {
  const toolEdges: GraphEdge[] = [
    { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
    { sourceId: 'A', targetId: 'C', type: 'tool' },        // tool 边
    { sourceId: 'D', targetId: 'B', type: 'prerequisite' },
  ];
  const graph = KnowledgeGraph.fromData(testNodes, toolEdges);

  test('getStats 计入 tool 边（供讲解引用）', () => {
    expect(graph.getStats().edgeCount).toBe(3);  // 2 prereq + 1 tool
  });

  test('prereqsOf("C") 不应被 tool 边暴露为前置', () => {
    // A→C 是 tool，不应出现在 C 的 prereqsOf 中
    expect(graph.prereqsOf('C')).toHaveLength(0);
  });

  test('dependentsOf("A") 不应通过 tool 边到达 C', () => {
    const ids = graph.dependentsOf('A').map((n) => n.id).sort();
    expect(ids).toEqual(['B']);  // C 不走 tool 边
  });
});

// ---- 环检测 ----

describe('KnowledgeGraph（环检测）', () => {
  test('detectCycles 检测到 prerequisite 环时返回 true', () => {
    const cycleEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
      { sourceId: 'B', targetId: 'C', type: 'prerequisite' },
      { sourceId: 'C', targetId: 'A', type: 'prerequisite' },
    ];
    const cycleGraph = KnowledgeGraph.fromData(testNodes.slice(0, 3), cycleEdges);
    expect(cycleGraph.detectCycles()).toBe(true);
  });

  test('tool 边形成的环不触发环检测', () => {
    // A→B(tool), B→C(tool), C→A(tool) — 全 tool 不构成诊断环
    const toolCycleEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'tool' },
      { sourceId: 'B', targetId: 'C', type: 'tool' },
      { sourceId: 'C', targetId: 'A', type: 'tool' },
    ];
    const graph = KnowledgeGraph.fromData(testNodes.slice(0, 3), toolCycleEdges);
    expect(graph.detectCycles()).toBe(false);
  });
});

// ---- 主线子图 ----

describe('KnowledgeGraph（mainlineSubgraph）', () => {
  const mainlineNodes = {
    ML1: ['A', 'C'],   // 主线1 含 A 和 C
    ML2: ['D'],         // 主线2 只含 D
  };

  const graph = KnowledgeGraph.fromData(testNodes, testEdges, mainlineNodes);

  test('ML1 子图应包含 A、C 及它们的全部前置', () => {
    const sub = graph.mainlineSubgraph('ML1').map((n) => n.id).sort();
    // A(无前置) + C(前置: A,B + B的前置: A,D,E) = {A,B,C,D,E}
    expect(sub).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  test('ML2 子图应包含 D 及其前置', () => {
    const sub = graph.mainlineSubgraph('ML2').map((n) => n.id).sort();
    // D(无前置) = {D}
    expect(sub).toEqual(['D']);
  });

  test('不存在的主线返回空数组', () => {
    expect(graph.mainlineSubgraph('NONEXISTENT')).toHaveLength(0);
  });

  test('getMainlineNodeIds 返回正确的节点', () => {
    expect(graph.getMainlineNodeIds('ML1').sort()).toEqual(['A', 'C']);
  });
});

// ---- 边缘用例 ----

describe('KnowledgeGraph（边缘用例）', () => {
  test('悬空边应被忽略', () => {
    const danglingEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'prerequisite' },
      { sourceId: 'X', targetId: 'A', type: 'prerequisite' }, // X 不存在
      { sourceId: 'B', targetId: 'Y', type: 'prerequisite' }, // Y 不存在
    ];
    const graph = KnowledgeGraph.fromData(testNodes.slice(0, 2), danglingEdges);
    expect(graph.getStats()).toEqual({ nodeCount: 2, edgeCount: 1 });
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
