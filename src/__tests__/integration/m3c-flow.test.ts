/**
 * M3c 端到端集成测试
 *
 * 打真实路由 handler（决策⑨：禁止旁路直连 Prisma）。
 * Mock Next.js 模块 + 鉴权，验证完整链路：
 * session-items → submit-answers → paper-pack → map
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// ============================================================
// Mock 层（与 M2 集成测试同模式）
// ============================================================

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-m3c-user' } }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/api-errors', () => ({
  unauthorized: () => new Response(JSON.stringify({ error: '未授权' }), { status: 401 }),
  internalError: () => new Response(JSON.stringify({ error: '内部错误' }), { status: 500 }),
}));

// 使用真实 PrismaClient（连测试库）
import { PrismaClient } from '@prisma/client';

var _testPrisma: PrismaClient;

vi.mock('@/lib/prisma', () => {
  _testPrisma = new PrismaClient();
  return { prisma: _testPrisma };
});

// 导入路由 handler（必须在所有 mock 之后）
import { POST as createSessionItems } from '../../app/api/diagnosis/session-items/route';
import { POST as submitAnswers } from '../../app/api/diagnosis/submit-answers/route';
import { GET as getPaperPack } from '../../app/api/diagnosis/paper-pack/route';
import { GET as getMap } from '../../app/api/diagnosis/map/route';

// ---- 辅助 ----
const TEST_STUDENT = 'test-m3c-user';
const TEST_MAINLINE = 'M1';

function mockPost(path: string, body: object): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockGet(path: string): Request {
  return new Request(`http://localhost${path}`);
}

// ---- 生命周期 ----
async function cleanupTestData() {
  const sessions = await _testPrisma.diagnosisSession.findMany({
    where: { studentId: TEST_STUDENT },
    select: { id: true },
  });
  for (const s of sessions) {
    await _testPrisma.probeRecord.deleteMany({ where: { sessionId: s.id } });
    await _testPrisma.errorRecord.deleteMany({ where: { sessionId: s.id } });
  }
  await _testPrisma.diagnosisSession.deleteMany({ where: { studentId: TEST_STUDENT } });
  await _testPrisma.studentNodeState.deleteMany({ where: { studentId: TEST_STUDENT } });
}

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

// ============================================================
// 端到端流程
// ============================================================

describe('M3c 完整端到端流程', () => {
  let sessionId = '';
  let answerItems: Array<{ itemId: string; nodeId: string; correct: boolean }> = [];

  // ---- 1. 创建 session + 获取 boundary 题单 ----

  test('1. POST /api/diagnosis/session-items → 创建 weekend session + 返回 boundary 题单', async () => {
    const req = mockPost('/api/diagnosis/session-items', {
      studentId: TEST_STUDENT,
      mainlineId: TEST_MAINLINE,
    });
    const res = await createSessionItems(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.studentId).toBe(TEST_STUDENT);
    expect(body.mainlineId).toBe(TEST_MAINLINE);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.itemCount).toBe(body.items.length);
    expect(Array.isArray(body.answerKey)).toBe(true);
    expect(body.answerKey.length).toBe(body.items.length);

    sessionId = body.sessionId;

    // 题单给学生看的：不含 answer
    for (const item of body.items) {
      expect(item.itemId).toBeDefined();
      expect(item.nodeId).toBeDefined();
      expect(item.nodeName).toBeDefined();
      expect(item.stem).toBeDefined();
      // key assertion: 学生视图无答案
      expect(item.answer).toBeUndefined();
    }

    // 答案页给大人看：含 answer
    for (const key of body.answerKey) {
      expect(key.itemId).toBeDefined();
      expect(key.answer).toBeDefined();
    }

    // 记住前 3 道题用于后续提交（模拟真实答题）
    const slice = body.items.slice(0, 3);
    answerItems = [];
    for (let idx = 0; idx < slice.length; idx++) {
      const item = slice[idx];
      answerItems.push({
        itemId: item.itemId,
        nodeId: item.nodeId,
        correct: idx < 2, // 前 2 题答对，第 3 题答错
      });
    }
  });

  // ---- 2. 提交答案 → StudentNodeState 落库 ----

  test('2. POST /api/diagnosis/submit-answers → BKT+KST 分线处理 → 持久化', async () => {
    expect(sessionId).toBeTruthy();
    expect(answerItems.length).toBeGreaterThan(0);

    const req = mockPost('/api/diagnosis/submit-answers', {
      sessionId,
      studentId: TEST_STUDENT,
      mainlineId: TEST_MAINLINE,
      answers: answerItems,
    });
    const res = await submitAnswers(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(Array.isArray(body.nodeStates)).toBe(true);
    expect(body.nodeStates.length).toBeGreaterThan(0);
    expect(Array.isArray(body.learningFrontier)).toBe(true);
    expect(body.stats.updatedNodes).toBeGreaterThan(0);
    expect(body.stats.answersRecorded).toBe(answerItems.length);

    // 验证 StudentNodeState 真落库了
    const dbStates = await _testPrisma.studentNodeState.findMany({
      where: { studentId: TEST_STUDENT },
    });
    expect(dbStates.length).toBeGreaterThan(0);

    // 作答节点应该有记录
    for (const a of answerItems) {
      const found = dbStates.find(s => s.nodeId === a.nodeId);
      expect(found, `节点 ${a.nodeId} 应落库`).toBeDefined();
      if (!found) continue;
      if (a.correct) {
        // 答对：首诊 0.5 → BKT 应 ≥ 0.70 → stable
        expect(found.masteryProb).toBeGreaterThan(0.70);
        expect(found.status).toBe('stable');
      } else {
        // 答错：首诊 0.5 → BKT 应 ≤ 0.30 → gap
        expect(found.masteryProb).toBeLessThan(0.30);
        expect(found.status).toBe('gap');
      }
    }

    // 验证 ProbeRecord 也落库了
    const probes = await _testPrisma.probeRecord.findMany({
      where: { sessionId },
    });
    expect(probes.length).toBe(answerItems.length);
  });

  // ---- 3. 地图 API 读回更新后的状态 ----

  test('3. GET /api/diagnosis/map → 可读回更新后的 StudentNodeState', async () => {
    const req = mockGet(`/api/diagnosis/map?studentId=${TEST_STUDENT}&mainlineId=${TEST_MAINLINE}`);
    const res = await getMap(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(body.learningFrontier)).toBe(true);
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.stable).toBe('number');
    expect(typeof body.stats.gap).toBe('number');

    // 作答的节点应该反映在状态中
    const stateMap = new Map();
    for (const n of body.nodes) {
      stateMap.set(n.nodeId, n.status);
    }
    for (const a of answerItems) {
      const status = stateMap.get(a.nodeId);
      expect(status, `节点 ${a.nodeId} 应在地图中`).toBeDefined();
    }
  });

  // ---- 4. 纸质包 API 返回 variant/drill 题 + 答案分页 ----

  test('4. GET /api/diagnosis/paper-pack → 返回 variant/drill 题 + 按节点分组 + 答案分页', async () => {
    const req = mockGet(`/api/diagnosis/paper-pack?studentId=${TEST_STUDENT}&maxItems=10&maxNodes=4`);
    const res = await getPaperPack(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.studentId).toBe(TEST_STUDENT);
    expect(body.generatedAt).toBeDefined();
    expect(typeof body.totalItems).toBe('number');
    expect(body.encouragement).toBeDefined();
    expect(Array.isArray(body.groups)).toBe(true);
    expect(Array.isArray(body.answerKey)).toBe(true);

    // 节点数封顶
    expect(body.groups.length).toBeLessThanOrEqual(4);

    // 总题量封顶
    expect(body.totalItems).toBeLessThanOrEqual(10);

    // 每个分组有 reason（frontier 或 gap）
    for (const g of body.groups) {
      expect(['frontier', 'gap']).toContain(g.reason);
      expect(g.nodeId).toBeDefined();
      expect(g.nodeName).toBeDefined();
      expect(Array.isArray(g.practiceItems)).toBe(true);
      expect(g.practiceItems.length).toBeGreaterThan(0);
    }

    // 练习题不含 concept
    let hasConcept = false;
    for (const g of body.groups) {
      for (const item of g.practiceItems) {
        if (item.role === 'concept') hasConcept = true;
      }
    }
    expect(hasConcept).toBe(false);

    // 答案页与练习题对应
    const practiceItemIds = new Set();
    for (const g of body.groups) {
      for (const item of g.practiceItems) {
        practiceItemIds.add(item.itemId);
      }
    }
    const answerIds = new Set();
    for (const k of body.answerKey) {
      answerIds.add(k.itemId);
    }
    for (const pid of practiceItemIds) {
      expect(answerIds.has(pid), `题 ${pid} 应在答案页中`).toBe(true);
    }

    // 验证 totalItems 与实际题目数一致
    let actualCount = 0;
    for (const g of body.groups) {
      actualCount += g.practiceItems.length;
    }
    expect(body.totalItems).toBe(actualCount);
  });

  // ---- 5. session-items 拒绝缺字段 ----

  test('5. POST /api/diagnosis/session-items 拒绝缺 mainlineId', async () => {
    const req = mockPost('/api/diagnosis/session-items', { studentId: TEST_STUDENT });
    const res = await createSessionItems(req);
    expect(res.status).toBe(400);
  });

  // ---- 6. submit-answers 拒绝空答案 ----

  test('6. POST /api/diagnosis/submit-answers 拒绝空 answers', async () => {
    const req = mockPost('/api/diagnosis/submit-answers', {
      sessionId: 'nonexistent',
      studentId: TEST_STUDENT,
      mainlineId: TEST_MAINLINE,
      answers: [],
    });
    const res = await submitAnswers(req);
    expect(res.status).toBe(400);
  });

  // ---- 7. paper-pack 拒绝缺 studentId ----

  test('7. GET /api/diagnosis/paper-pack 拒绝缺 studentId', async () => {
    const req = mockGet('/api/diagnosis/paper-pack');
    const res = await getPaperPack(req);
    expect(res.status).toBe(400);
  });
});

// ============================================================
// BKT 公式数值验证（纯逻辑，但用真实 bktUpdate 确保公式对）
// ============================================================

import { bktUpdate } from '../../../lib/bkt';

describe('BKT 公式数值验证（真实 bktUpdate）', () => {

  test('0.5 答对 → posterior ≈ 0.82', () => {
    const r = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      true,
    );
    expect(r.posteriorPLearn).toBeGreaterThan(0.81);
    expect(r.posteriorPLearn).toBeLessThan(0.83);
    expect(r.updatedPLearn).toBe(r.posteriorPLearn); // crossSessionT=0
    expect(r.slipFlag).toBe(false);
  });

  test('0.5 答错 → posterior ≈ 0.11', () => {
    const r = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      false,
    );
    expect(r.posteriorPLearn).toBeGreaterThan(0.10);
    expect(r.posteriorPLearn).toBeLessThan(0.13);
  });

  test('0.82 答错 → posterior ≈ 0.36, slipFlag=true', () => {
    const r = bktUpdate(
      { pLearn0: 0.82, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      false,
    );
    expect(r.posteriorPLearn).toBeGreaterThan(0.34);
    expect(r.posteriorPLearn).toBeLessThan(0.38);
    expect(r.slipFlag).toBe(true); // P(L)≥0.7 且答错
  });

  test('跨 session T=0.15 施加后 updatedPLearn > posterior', () => {
    const noT = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0 },
      false,
    );
    const withT = bktUpdate(
      { pLearn0: 0.5, T: 0.15, G: 0.20, S: 0.10, crossSessionT: 0.15 },
      false,
    );
    expect(withT.updatedPLearn).toBeGreaterThan(noT.updatedPLearn);
    expect(withT.updatedPLearn).toBeGreaterThan(0.22);
    expect(withT.updatedPLearn).toBeLessThan(0.26);
  });
});
