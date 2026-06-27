/**
 * Nana Case API · 集成测试
 *
 * 打真实路由 handler，Mock Next.js 模块 + 鉴权。
 * 使用真实 PrismaClient（连测试库）。
 *
 * 测试：
 * - POST /api/nana/cases — 创建 case
 * - GET /api/nana/cases/:id — 读取 case
 * - 400（缺少 artifacts）
 * - 404（不存在的 id）
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// ============================================================
// Mock 层
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
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-nana-user' } }),
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
import { POST as createCase } from '../../../app/api/nana/cases/route';
import { GET as getCase } from '../../../app/api/nana/cases/[id]/route';

// ---- 辅助 ----
const TEST_STUDENT = 'test-nana-user';

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
    where: { studentId: TEST_STUDENT },
    select: { id: true },
  });
  for (const c of cases) {
    await _testPrisma.artifact.deleteMany({ where: { caseId: c.id } });
  }
  await _testPrisma.case.deleteMany({ where: { studentId: TEST_STUDENT } });
}

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

// ---- 测试 ----

describe('Case API（集成测试 · mock session）', () => {
  let createdCaseId: string;

  // ---- POST /api/nana/cases ----

  test('POST /api/nana/cases 创建 case', async () => {
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'image', content: 'https://example.com/math-q.jpg', seq: 0 },
        { type: 'transcript', content: '嗯…这道题我先看了定义域', seq: 1 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.studentId).toBe(TEST_STUDENT);
    expect(body.artifacts).toHaveLength(2);
    expect(body.artifacts[0].type).toBe('image');
    expect(body.artifacts[0].content).toBe('https://example.com/math-q.jpg');
    expect(body.artifacts[1].type).toBe('transcript');
    expect(body.artifacts[1].content).toBe('嗯…这道题我先看了定义域');

    createdCaseId = body.id;
  });

  test('POST /api/nana/cases 拒绝空 artifacts', async () => {
    const req = mockPost('/api/nana/cases', { artifacts: [] });
    const res = await createCase(req);
    expect(res.status).toBe(400);
  });

  test('POST /api/nana/cases 拒绝缺少 artifacts 字段', async () => {
    const req = mockPost('/api/nana/cases', {});
    const res = await createCase(req);
    expect(res.status).toBe(400);
  });

  // ---- GET /api/nana/cases/:id ----

  test('GET /api/nana/cases/:id 返回创建好的 case', async () => {
    const req = mockGet(`/api/nana/cases/${createdCaseId}`);
    const res = await getCase(req, { params: Promise.resolve({ id: createdCaseId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(createdCaseId);
    expect(body.studentId).toBe(TEST_STUDENT);
    expect(body.artifacts).toHaveLength(2);
    expect(body.artifacts[0].type).toBe('image');
    expect(body.artifacts[0].seq).toBe(0);
    expect(body.artifacts[1].seq).toBe(1);
  });

  test('GET /api/nana/cases/:id 不存在的 case 返回 404', async () => {
    const req = mockGet('/api/nana/cases/nonexistent-id');
    const res = await getCase(req, { params: Promise.resolve({ id: 'nonexistent-id' }) });
    expect(res.status).toBe(404);
  });
});
