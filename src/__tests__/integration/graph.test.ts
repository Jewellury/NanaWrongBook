/**
 * 知识图谱模块 · 集成测试
 *
 * 需要先运行 npm run seed 灌入种子数据。
 * 验证：种子数据入库后的节点数/边数/依赖一致性/主线子图/无环。
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { KnowledgeGraph } from '../../../lib/graph';

describe('KnowledgeGraph（集成测试 · 需数据库）', () => {
  let graph: KnowledgeGraph;

  beforeAll(async () => {
    // 从 Prisma 加载全量图谱（种子数据已在数据库中）
    graph = await KnowledgeGraph.load();
  });

  test('种子导入后节点数 ≥ 48（5 BG + 30 M1 + 13 M2a）', () => {
    const stats = graph.getStats();
    expect(stats.nodeCount).toBeGreaterThanOrEqual(48);
  });

  test('种子导入后边数 > 0', () => {
    const stats = graph.getStats();
    expect(stats.edgeCount).toBeGreaterThan(0);
  });

  test('allPrereqsOf("M2a-03") 应包含 M2a-01', () => {
    const ids = graph.allPrereqsOf('M2a-03').map((n) => n.id);
    expect(ids).toContain('M2a-01');
    // M2a-02 本轮未导入（悬空边已跳过），不应出现在结果中
    expect(ids).not.toContain('M2a-02');
  });

  test('图无环检测通过', () => {
    expect(graph.detectCycles()).toBe(false);
  });

  test('抽 3 个节点的 prereqsOf 与种子声明一致', () => {
    // M1-08: samePrereq = ["M1-06","M1-07"]
    expect(graph.prereqsOf('M1-08').map((n) => n.id).sort())
      .toEqual(['M1-06', 'M1-07']);

    // M1-14: samePrereq = ["M1-11","M1-12","M1-13"]
    expect(graph.prereqsOf('M1-14').map((n) => n.id).sort())
      .toEqual(['M1-11', 'M1-12', 'M1-13']);

    // M1-30: samePrereq = ["M1-26","M1-29"]
    expect(graph.prereqsOf('M1-30').map((n) => n.id).sort())
      .toEqual(['M1-26', 'M1-29']);
  });

  test('mainlineSubgraph("M1") 应返回 M1 主线节点及其全部前置', () => {
    const sub = graph.mainlineSubgraph('M1');
    const ids = sub.map((n) => n.id);
    // M1 的 30 个节点全部应在子图中
    expect(ids).toContain('M1-04');
    expect(ids).toContain('M1-20');
    expect(ids).toContain('M1-33');
    // 子图应至少有 M1 的 30 个节点
    expect(sub.length).toBeGreaterThanOrEqual(30);
  });

  test('mainlineSubgraph("M2a") 应返回 M2a 主线节点及其全部前置', () => {
    const sub = graph.mainlineSubgraph('M2a');
    const ids = sub.map((n) => n.id);
    // 13 个 M2a 节点应在子图中
    expect(ids).toContain('M2a-01');
    expect(ids).toContain('M2a-03');
    expect(ids).toContain('M2a-51');
    expect(sub.length).toBeGreaterThanOrEqual(13);
  });
});
