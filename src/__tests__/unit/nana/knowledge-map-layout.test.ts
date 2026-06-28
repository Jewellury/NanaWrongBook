/**
 * 知识地图 · 主线列布局算法 · 单元测试
 */

import { describe, test, expect } from 'vitest';
import {
  computeLayout,
  COLUMN_MAP,
  COL_WIDTH,
  COL_TOTAL,
  START_Y,
  NODE_GAP,
} from '@/components/nana/knowledge-map/knowledge-map-layout';
import type { KnowledgeNodeData, MainlineData } from '@/components/nana/knowledge-map/knowledge-map-canvas';

// 辅助：构造节点数据
function makeNode(id: string, name?: string): KnowledgeNodeData {
  return {
    nodeId: id,
    name: name ?? id,
    layer: 'A',
    tier: 'A',
    status: 'untested',
    masteryProb: 0.5,
    judgeCriteria: null,
    sampleItem: null,
    teachingNotes: null,
    lastEvidence: null,
  };
}

function makeMainline(
  id: string,
  name: string,
  nodeIds: string[],
  priority = 1
): MainlineData {
  return { mainlineId: id, name, priority, nodeIds };
}

describe('computeLayout', () => {
  test('空数据返回合理结果', () => {
    const result = computeLayout([], []);
    expect(result.positions.size).toBe(0);
    expect(result.columnCount).toBeGreaterThanOrEqual(1);
    expect(result.columnMainlines.size).toBe(0);
    expect(result.nodeColumns.size).toBe(0);
  });

  test('单主线单节点布局', () => {
    const nodes = [makeNode('M1-01', '集合')];
    const mainlines = [makeMainline('M1', '集合', ['M1-01'])];

    const result = computeLayout(nodes, mainlines);

    expect(result.positions.size).toBe(1);
    expect(result.columnMainlines.size).toBe(1);

    const pos = result.positions.get('M1-01');
    expect(pos).toBeDefined();

    // M1 在列号 1
    const colIdx = COLUMN_MAP['M1'];
    const expectedX = colIdx * COL_TOTAL + COL_WIDTH / 2;
    expect(pos!.x).toBe(expectedX);
    expect(pos!.y).toBe(START_Y);
  });

  test('单主线多节点垂直排列', () => {
    const nodes = [
      makeNode('N1'),
      makeNode('N2'),
      makeNode('N3'),
    ];
    const mainlines = [makeMainline('M1', '集合', ['N1', 'N2', 'N3'])];

    const result = computeLayout(nodes, mainlines);

    expect(result.positions.size).toBe(3);
    const n1 = result.positions.get('N1')!;
    const n2 = result.positions.get('N2')!;
    const n3 = result.positions.get('N3')!;

    // 同列，垂直等距
    expect(n1.x).toBe(n2.x);
    expect(n2.x).toBe(n3.x);
    expect(n2.y - n1.y).toBe(NODE_GAP);
    expect(n3.y - n2.y).toBe(NODE_GAP);
  });

  test('多主线多列布局', () => {
    const nodes = [
      makeNode('M1-01'),
      makeNode('M2a-01'),
    ];
    const mainlines = [
      makeMainline('M1', '集合', ['M1-01']),
      makeMainline('M2a', '函数', ['M2a-01']),
    ];

    const result = computeLayout(nodes, mainlines);

    expect(result.positions.size).toBe(2);
    const m1 = result.positions.get('M1-01')!;
    const m2a = result.positions.get('M2a-01')!;

    // M1 → col 1, M2a → col 2
    const m1ColX = COLUMN_MAP['M1'] * COL_TOTAL + COL_WIDTH / 2;
    const m2aColX = COLUMN_MAP['M2a'] * COL_TOTAL + COL_WIDTH / 2;
    expect(m1.x).toBe(m1ColX);
    expect(m2a.x).toBe(m2aColX);
    expect(m2a.x).toBeGreaterThan(m1.x);
  });

  test('节点在正确的主线顺序中放置', () => {
    const nodes = [
      makeNode('N1'),
      makeNode('N2'),
      makeNode('N3'),
    ];
    // 倒序
    const mainlines = [makeMainline('M1', '集合', ['N3', 'N1', 'N2'])];

    const result = computeLayout(nodes, mainlines);

    const n3 = result.positions.get('N3')!;
    const n1 = result.positions.get('N1')!;
    const n2 = result.positions.get('N2')!;

    expect(n3.y).toBe(START_Y);
    expect(n1.y).toBe(START_Y + NODE_GAP);
    expect(n2.y).toBe(START_Y + 2 * NODE_GAP);
  });

  test('不属于任何主线的节点归入其他列', () => {
    const nodes = [
      makeNode('M1-01'),
      makeNode('Orphan-01'),
    ];
    const mainlines = [makeMainline('M1', '集合', ['M1-01'])];

    const result = computeLayout(nodes, mainlines);

    expect(result.positions.has('Orphan-01')).toBe(true);
    const orphan = result.positions.get('Orphan-01')!;

    // 其他列在最右侧
    const otherColIdx = Math.max(0, ...Object.values(COLUMN_MAP)) + 1;
    const expectedX = otherColIdx * COL_TOTAL + COL_WIDTH / 2;
    expect(orphan.x).toBe(expectedX);
  });

  test('多主线节点出现在最左侧主线列', () => {
    const nodes = [
      makeNode('Shared', '共享节点'),
      makeNode('M1-01', 'M1 独有'),
    ];
    // Shared 同时属于 M2a(列2) 和 M1(列1)
    // 应出现在 M1 列（最左侧）
    const mainlines = [
      makeMainline('M2a', '函数', ['Shared']),
      makeMainline('M1', '集合', ['M1-01', 'Shared']),
    ];

    const result = computeLayout(nodes, mainlines);

    const shared = result.positions.get('Shared')!;
    const m1ColX = COLUMN_MAP['M1'] * COL_TOTAL + COL_WIDTH / 2;
    expect(shared.x).toBe(m1ColX);
  });

  test('主线名称映射正确', () => {
    const nodes = [makeNode('N1')];
    const mainlines = [makeMainline('M2a', '函数', ['N1'])];

    const result = computeLayout(nodes, mainlines);

    const colIdx = COLUMN_MAP['M2a'];
    expect(result.columnMainlines.get(colIdx)).toBe('函数');
  });

  test('列号排序正确', () => {
    // 验证 COLUMN_MAP 映射连续（0-9）
    const values = Object.values(COLUMN_MAP).sort((a, b) => a - b);
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
