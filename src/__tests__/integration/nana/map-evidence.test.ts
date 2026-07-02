/**
 * map API caseEvidenceCount · 集成测试（Stage 2.5 任务 E）
 *
 * 验证修断点 2 的后端契约（doc/plan/capture-map-v1-stage2.5-plan.md §6.2）：
 * - nodes[*].caseEvidenceCount 字段存在且为非负整数
 * - 给 case 挂 tag 后，对应节点 caseEvidenceCount +1
 * - 跨用户隔离：A 的 tag 不计入 B 的 caseEvidenceCount（where.case.studentId 关系过滤）
 * - 不影响 status/stats（caseEvidenceCount 与 status 正交，不写 StudentNodeState）
 *
 * 打真实路由 handler，Mock Next.js 模块 + 鉴权，使用真实 PrismaClient（连测试库）。
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// ============================================================
// Mock 层（与 diagnosis-api.test.ts / case-api.test.ts 同款）
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
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-nana-map-user' } }),
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
import { GET as getMap } from '../../../app/api/diagnosis/map/route';
import { POST as createCase } from '../../../app/api/nana/cases/route';
import { POST as postTag } from '../../../app/api/nana/cases/[id]/tags/route';
import { getServerSession } from 'next-auth';

// ---- 辅助 ----
// 用独立测试用户，避免与同目录其它集成测试（case-api.test.ts 用 test-nana-user）
// 并行时互相 cleanup 删数据造成 404 串扰。
const TEST_STUDENT = 'test-nana-map-user';
const OTHER_STUDENT = 'test-nana-map-other';

// 真实种子节点 id（在 beforeAll 里取两个，供测试用）
let nodeA: string;
let nodeB: string;

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
  const cases = await _testPrisma.case.findMany({
    where: { studentId: { in: [TEST_STUDENT, OTHER_STUDENT] } },
    select: { id: true },
  });
  for (const c of cases) {
    await _testPrisma.caseKnowledgeTag.deleteMany({ where: { caseId: c.id } });
    await _testPrisma.artifact.deleteMany({ where: { caseId: c.id } });
  }
  await _testPrisma.case.deleteMany({
    where: { studentId: { in: [TEST_STUDENT, OTHER_STUDENT] } },
  });
}

beforeAll(async () => {
  await cleanupTestData();
  // 取两个真实 KnowledgeNode id（种子 48 节点）
  const nodes = await _testPrisma.knowledgeNode.findMany({ select: { id: true }, take: 2 });
  if (nodes.length < 2) throw new Error('测试库 KnowledgeNode 种子不足 2 个');
  nodeA = nodes[0].id;
  nodeB = nodes[1].id;
});

afterAll(async () => {
  await cleanupTestData();
});

// ---- 测试 ----

describe('map API caseEvidenceCount（Stage 2.5 任务 E）', () => {
  test('GET /api/diagnosis/map 响应 nodes[*].caseEvidenceCount 字段存在且为非负整数', async () => {
    const req = mockGet(`/api/diagnosis/map?studentId=${TEST_STUDENT}`);
    const res = await getMap(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.nodes.length).toBeGreaterThan(0);

    for (const n of body.nodes) {
      expect(n).toHaveProperty('caseEvidenceCount');
      expect(Number.isInteger(n.caseEvidenceCount)).toBe(true);
      expect(n.caseEvidenceCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('挂 tag 前：所有节点 caseEvidenceCount 为 0；stats 不受影响', async () => {
    const req = mockGet(`/api/diagnosis/map?studentId=${TEST_STUDENT}`);
    const res = await getMap(req);
    const body = await res.json();

    const sum = body.nodes.reduce(
      (acc: number, n: { caseEvidenceCount: number }) => acc + n.caseEvidenceCount,
      0,
    );
    expect(sum).toBe(0);

    // stats 仍只反映 StudentNodeState（测试用户无测评 → 全 untested）
    expect(body.stats.total).toBe(body.nodes.length);
    expect(body.stats.untested).toBe(body.nodes.length);
  });

  test('挂 tag 后：对应节点 caseEvidenceCount +1（status 不变）', async () => {
    // 1) TEST_STUDENT 创建一条 case
    const createReq = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 'data:image/jpeg;base64,EVIDENCE1', seq: 0 },
      ],
    });
    const createRes = await createCase(createReq);
    expect(createRes.status).toBe(201);
    const caseId = (await createRes.json()).id;

    // 2) 挂到 nodeA
    const tagRes = await postTag(
      mockPost(`/api/nana/cases/${caseId}/tags`, { nodeId: nodeA }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(tagRes.status).toBe(201);

    // 3) 查 map：nodeA 的 caseEvidenceCount 应为 1，其余 0
    const req = mockGet(`/api/diagnosis/map?studentId=${TEST_STUDENT}`);
    const res = await getMap(req);
    const body = await res.json();
    const target = body.nodes.find((n: { nodeId: string }) => n.nodeId === nodeA);
    expect(target.caseEvidenceCount).toBe(1);

    // status 仍为 untested（挂 tag 不写 StudentNodeState —— 铁律）
    expect(target.status).toBe('untested');
    // stats.untested 不变（不算点亮）
    expect(body.stats.untested).toBe(body.nodes.length);
    expect(body.stats.stable).toBe(0);
  });

  test('同节点挂第二道题：caseEvidenceCount = 2（按 tag 行计数）', async () => {
    // 再创建一条 case 挂到 nodeA
    const createReq = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 'data:image/jpeg;base64,EVIDENCE2', seq: 0 },
      ],
    });
    const createRes = await createCase(createReq);
    const caseId = (await createRes.json()).id;

    const tagRes = await postTag(
      mockPost(`/api/nana/cases/${caseId}/tags`, { nodeId: nodeA }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(tagRes.status).toBe(201);

    const req = mockGet(`/api/diagnosis/map?studentId=${TEST_STUDENT}`);
    const res = await getMap(req);
    const body = await res.json();
    const target = body.nodes.find((n: { nodeId: string }) => n.nodeId === nodeA);
    expect(target.caseEvidenceCount).toBe(2);
  });

  test('跨用户隔离：OTHER_STUDENT 的 tag 不计入 TEST_STUDENT 的 caseEvidenceCount', async () => {
    // 切到 OTHER_STUDENT 创建一条 case
    const mockGetSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
    mockGetSession.mockResolvedValueOnce({ user: { id: OTHER_STUDENT } });

    const createReq = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 'data:image/jpeg;base64,ISOLATION', seq: 0 },
      ],
    });
    const createRes = await createCase(createReq);
    expect(createRes.status).toBe(201);
    const otherCaseId = (await createRes.json()).id;

    // 仍以 OTHER_STUDENT 身份挂 tag 到 nodeB
    mockGetSession.mockResolvedValueOnce({ user: { id: OTHER_STUDENT } });
    const tagRes = await postTag(
      mockPost(`/api/nana/cases/${otherCaseId}/tags`, { nodeId: nodeB }),
      { params: Promise.resolve({ id: otherCaseId }) },
    );
    expect(tagRes.status).toBe(201);

    // 回到 TEST_STUDENT 查 map（mockResolvedValueOnce 已用完，回退到默认）
    const req = mockGet(`/api/diagnosis/map?studentId=${TEST_STUDENT}`);
    const res = await getMap(req);
    const body = await res.json();

    // nodeB 不应被 OTHER_STUDENT 的 tag 点亮（隔离生效）
    const nodeBRow = body.nodes.find((n: { nodeId: string }) => n.nodeId === nodeB);
    expect(nodeBRow.caseEvidenceCount).toBe(0);

    // nodeA 仍是 TEST_STUDENT 自己的 2（不被别人影响）
    const nodeARow = body.nodes.find((n: { nodeId: string }) => n.nodeId === nodeA);
    expect(nodeARow.caseEvidenceCount).toBe(2);
  });
});
