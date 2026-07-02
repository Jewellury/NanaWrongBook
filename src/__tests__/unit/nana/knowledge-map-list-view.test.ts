/**
 * 知识地图 · 列表视图 · 分组算法单元测试
 *
 * 验收点（plan §4）：
 * - 四组分组正确
 * - stable + caseEvidenceCount>0 → lit 组（stable 优先，非 collected）
 * - frontier + caseEvidenceCount>0 → next 组（frontier 优先）
 * - 互斥完备（并集 = 全部节点，无重复）
 * - 空组返回空数组
 */

import { describe, test, expect } from 'vitest';
import { groupNodesByStatus } from '@/components/nana/knowledge-map/knowledge-map-list-view';
import type { KnowledgeNodeData } from '@/components/nana/knowledge-map/knowledge-map-canvas';

// 辅助：构造节点
function makeNode(
  id: string,
  opts: Partial<Pick<KnowledgeNodeData, 'status' | 'caseEvidenceCount'>> = {}
): KnowledgeNodeData {
  return {
    nodeId: id,
    name: id,
    layer: 'A',
    tier: 'A',
    status: opts.status ?? 'untested',
    masteryProb: 0.5,
    judgeCriteria: null,
    sampleItem: null,
    teachingNotes: null,
    lastEvidence: null,
    caseEvidenceCount: opts.caseEvidenceCount ?? 0,
  };
}

describe('groupNodesByStatus', () => {
  test('四组分组正确', () => {
    const nodes = [
      makeNode('lit-1', { status: 'stable' }),
      makeNode('next-1', { status: 'untested' }),
      makeNode('collected-1', { status: 'untested', caseEvidenceCount: 3 }),
      makeNode('untested-1', { status: 'untested' }),
    ];
    const frontier = ['next-1'];

    const result = groupNodesByStatus(nodes, frontier);

    expect(result.lit.map((n) => n.nodeId)).toEqual(['lit-1']);
    expect(result.next.map((n) => n.nodeId)).toEqual(['next-1']);
    expect(result.collected.map((n) => n.nodeId)).toEqual(['collected-1']);
    expect(result.untested.map((n) => n.nodeId)).toEqual(['untested-1']);
  });

  test('stable + caseEvidenceCount>0 → lit 组（stable 优先，非 collected）', () => {
    const nodes = [makeNode('A', { status: 'stable', caseEvidenceCount: 5 })];
    const result = groupNodesByStatus(nodes, []);

    expect(result.lit.map((n) => n.nodeId)).toEqual(['A']);
    expect(result.collected).toHaveLength(0);
  });

  test('frontier + caseEvidenceCount>0 → next 组（frontier 优先）', () => {
    const nodes = [makeNode('A', { status: 'untested', caseEvidenceCount: 5 })];
    const frontier = ['A'];
    const result = groupNodesByStatus(nodes, frontier);

    expect(result.next.map((n) => n.nodeId)).toEqual(['A']);
    expect(result.collected).toHaveLength(0);
  });

  test('互斥完备：并集 = 全部节点，无重复', () => {
    const nodes = [
      makeNode('lit-1', { status: 'stable' }),
      makeNode('lit-2', { status: 'stable', caseEvidenceCount: 2 }),
      makeNode('next-1', { status: 'untested' }),
      makeNode('next-2', { status: 'uncertain', caseEvidenceCount: 1 }),
      makeNode('collected-1', { status: 'untested', caseEvidenceCount: 3 }),
      makeNode('collected-2', { status: 'gap', caseEvidenceCount: 1 }),
      makeNode('untested-1', { status: 'untested' }),
      makeNode('untested-2', { status: 'gap' }),
    ];
    const frontier = ['next-1', 'next-2'];

    const result = groupNodesByStatus(nodes, frontier);

    const allIds = [
      ...result.lit,
      ...result.next,
      ...result.collected,
      ...result.untested,
    ].map((n) => n.nodeId);

    // 并集 = 全部
    expect(allIds.sort()).toEqual(
      nodes.map((n) => n.nodeId).sort()
    );
    // 无重复（每个 id 出现一次）
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  test('空组返回空数组', () => {
    const nodes = [makeNode('only-lit', { status: 'stable' })];
    const result = groupNodesByStatus(nodes, []);

    expect(result.lit).toHaveLength(1);
    expect(result.next).toEqual([]);
    expect(result.collected).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  test('空节点列表 → 全部空组', () => {
    const result = groupNodesByStatus([], []);
    expect(result.lit).toEqual([]);
    expect(result.next).toEqual([]);
    expect(result.collected).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  test('caseEvidenceCount 缺省/为 0 → 未探索（非 stable/frontier 时）', () => {
    const nodes = [
      makeNode('zero', { status: 'untested', caseEvidenceCount: 0 }),
    ];
    const result = groupNodesByStatus(nodes, []);
    expect(result.untested.map((n) => n.nodeId)).toEqual(['zero']);
    expect(result.collected).toHaveLength(0);
  });

  test('frontier 节点无论 status 如何（除非 stable）都进 next 组', () => {
    // frontier 且 status=uncertain（非 stable）→ next
    const nodes = [makeNode('A', { status: 'uncertain' })];
    const result = groupNodesByStatus(nodes, ['A']);
    expect(result.next.map((n) => n.nodeId)).toEqual(['A']);
  });
});
