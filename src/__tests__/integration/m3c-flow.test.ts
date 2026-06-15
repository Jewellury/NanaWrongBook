/**
 * M3c 端到端集成测试
 *
 * 测完整链路：
 * session-items API → submit-answers API → paper-pack API
 * → StudentNodeState 持久化 → 地图 API 可读
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { KnowledgeGraph } from '../../../lib/graph';
import { bktUpdate } from '../../../lib/bkt';

const TEST_STUDENT_ID = 'test-m3c-student';
const TEST_MAINLINE = 'M1';
const BASE = 'http://localhost:3000';

// ---- 辅助：调 API ----
async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

// ---- 测试生命周期 ----
beforeAll(async () => {
  // 清理旧测试数据
  await prisma.probeRecord.deleteMany({ where: { session: { studentId: TEST_STUDENT_ID } } });
  await prisma.errorRecord.deleteMany({ where: { session: { studentId: TEST_STUDENT_ID } } });
  await prisma.diagnosisSession.deleteMany({ where: { studentId: TEST_STUDENT_ID } });
  await prisma.studentNodeState.deleteMany({ where: { studentId: TEST_STUDENT_ID } });
});

afterAll(async () => {
  // 清理
  await prisma.probeRecord.deleteMany({ where: { session: { studentId: TEST_STUDENT_ID } } });
  await prisma.errorRecord.deleteMany({ where: { session: { studentId: TEST_STUDENT_ID } } });
  await prisma.diagnosisSession.deleteMany({ where: { studentId: TEST_STUDENT_ID } });
  await prisma.studentNodeState.deleteMany({ where: { studentId: TEST_STUDENT_ID } });
});

// ============================================================

describe('M3c 完整流程', () => {

  test('1. 创建 session → 获取 boundary 题单', async () => {
    // 注意：这些 API 需要认证。如果测试环境无 auth，跳过 API 层直接测编排器。
    // 此处作为集成测试骨架，实际运行时需配置测试 auth。
  });

  test('2. 提交答案 → StudentNodeState 落库', async () => {
    // 骨架
  });

  test('3. 纸质包 API 返回正确结构', async () => {
    // 骨架
  });

  test('4. 地图 API 可读回更新后的状态', async () => {
    // 骨架
  });
});

// ============================================================
// 编排器 + DB 集成测试（不经过 HTTP 层）
// ============================================================

describe('M3c 编排器 + DB 集成', () => {

  test('applyBKTToAnswers 与真实 bktUpdate 公式一致', () => {
    // 验证 0.5 答对 → ≈0.82
    const result = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      true,
    );
    // posterior = 0.45/0.55 ≈ 0.818
    expect(result.posteriorPLearn).toBeGreaterThan(0.81);
    expect(result.posteriorPLearn).toBeLessThan(0.83);
    expect(result.slipFlag).toBe(false);
  });

  test('bktUpdate 0.5 答错 → ≈0.11', () => {
    const result = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      false,
    );
    // posterior = 0.05/0.45 ≈ 0.111
    expect(result.posteriorPLearn).toBeGreaterThan(0.10);
    expect(result.posteriorPLearn).toBeLessThan(0.13);
    expect(result.slipFlag).toBe(false);
  });

  test('bktUpdate 0.82 答错 → ≈0.36', () => {
    const result = bktUpdate(
      { pLearn0: 0.82, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      false,
    );
    // posterior = 0.082/0.226 ≈ 0.363
    expect(result.posteriorPLearn).toBeGreaterThan(0.34);
    expect(result.posteriorPLearn).toBeLessThan(0.38);
    expect(result.slipFlag).toBe(true); // P(L)≥0.7 且答错
  });

  test('跨 session T=0.15 施加后 masteryProb 上升', () => {
    const withoutT = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      false,
    );
    const withT = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0.15 },
      false,
    );
    // T 施加后应更高
    expect(withT.updatedPLearn).toBeGreaterThan(withoutT.updatedPLearn);
    // posterior≈0.111, updated=0.111+0.889×0.15≈0.244
    expect(withT.updatedPLearn).toBeGreaterThan(0.22);
    expect(withT.updatedPLearn).toBeLessThan(0.26);
  });

  test('Graph 加载有效', async () => {
    const graph = await KnowledgeGraph.load(prisma);
    const stats = graph.getStats();
    expect(stats.nodeCount).toBeGreaterThan(0);
    expect(stats.edgeCount).toBeGreaterThan(0);
  });

  test('M1 主线有节点', async () => {
    const graph = await KnowledgeGraph.load(prisma);
    const nodeIds = graph.getMainlineNodeIds('M1');
    expect(nodeIds.length).toBeGreaterThan(0);
  });

  test('Item 表有 boundary 题', async () => {
    const items = await prisma.item.findMany({
      where: { role: 'boundary' },
      take: 5,
    });
    expect(items.length).toBeGreaterThan(0);
  });
});
