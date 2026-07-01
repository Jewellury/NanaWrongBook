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
 * - G1 归属校验：跨用户读取返回 404
 * - G2 校验：类型白名单拒绝 / content 过大拒绝 / 条数超限拒绝
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
import { POST as createCase, GET as listCases } from '../../../app/api/nana/cases/route';
import { GET as getCase } from '../../../app/api/nana/cases/[id]/route';
// 导入被 mock 的 getServerSession（用于跨用户场景切换身份）
import { getServerSession } from 'next-auth';

// ---- 辅助 ----
const TEST_STUDENT = 'test-nana-user';
const OTHER_STUDENT = 'test-nana-other-user';

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
    await _testPrisma.artifact.deleteMany({ where: { caseId: c.id } });
  }
  await _testPrisma.case.deleteMany({
    where: { studentId: { in: [TEST_STUDENT, OTHER_STUDENT] } },
  });
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
        { type: 'question_image', content: 'data:image/jpeg;base64,AAAA', seq: 0 },
        { type: 'transcript', content: '嗯…这道题我先看了定义域', seq: 1 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.studentId).toBe(TEST_STUDENT);
    expect(body.artifacts).toHaveLength(2);
    expect(body.artifacts[0].type).toBe('question_image');
    expect(body.artifacts[0].content).toBe('data:image/jpeg;base64,AAAA');
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

  // ---- G2 校验：类型白名单 ----

  test('POST /api/nana/cases 拒绝非白名单 artifact type（G2）', async () => {
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'evil', content: '恶意载荷', seq: 0 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('evil');
  });

  test('POST /api/nana/cases 拒绝旧 type "image"（已收敛为 question_image，G2）', async () => {
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'image', content: 'https://example.com/x.jpg', seq: 0 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(400);
  });

  // ---- G2 校验：content 体积上限 ----

  test('POST /api/nana/cases 拒绝 content 超过 2MB（G2）', async () => {
    const oversized = 'A'.repeat(2 * 1024 * 1024 + 1);
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: oversized, seq: 0 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('过大');
  });

  test('POST /api/nana/cases 拒绝 content 非字符串（G2）', async () => {
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 12345, seq: 0 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(400);
  });

  // ---- G2 校验：artifacts 条数上限 ----

  test('POST /api/nana/cases 拒绝 artifacts 条数超过 8（G2）', async () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      type: 'transcript',
      content: `t${i}`,
      seq: i,
    }));
    const req = mockPost('/api/nana/cases', { artifacts: tooMany });
    const res = await createCase(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('条数');
  });

  test('POST /api/nana/cases 合规全量 artifacts（图+音+meta+transcript）仍 201（G2 不回归）', async () => {
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 'data:image/jpeg;base64,B', seq: 0 },
        { type: 'audio_note', content: 'data:audio/webm;base64,C', seq: 1 },
        { type: 'audio_meta', content: 'durationSec=30;mime=audio/webm;sizeBytes=100000', seq: 2 },
        { type: 'transcript', content: '尚未转写', seq: 3 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(4);
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
    expect(body.artifacts[0].type).toBe('question_image');
    expect(body.artifacts[0].seq).toBe(0);
    expect(body.artifacts[1].seq).toBe(1);
  });

  test('GET /api/nana/cases/:id 不存在的 case 返回 404', async () => {
    const req = mockGet('/api/nana/cases/nonexistent-id');
    const res = await getCase(req, { params: Promise.resolve({ id: 'nonexistent-id' }) });
    expect(res.status).toBe(404);
  });

  // ---- G1 归属校验：跨用户读取返回 404 ----

  test('GET /api/nana/cases/:id 跨用户读取返回 404（G1 归属校验）', async () => {
    // 模拟另一个用户读取 test-nana-user 的 case
    const mockGetSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
    mockGetSession.mockResolvedValueOnce({ user: { id: OTHER_STUDENT } });

    const req = mockGet(`/api/nana/cases/${createdCaseId}`);
    const res = await getCase(req, { params: Promise.resolve({ id: createdCaseId }) });
    expect(res.status).toBe(404);

    // 恢复默认 session（mockResolvedValueOnce 已用完，回退到默认 mockResolvedValue）
  });
});

// ============================================================
// S1-6：列表端点 + 用户隔离测试
// ============================================================

describe('Case 列表 API + 用户隔离（S1-3/S1-6）', () => {
  test('GET /api/nana/cases 返回当前用户的 case 列表（含必要字段）', async () => {
    // 先创建一条，确保列表非空
    const createReq = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 'data:image/jpeg;base64,LIST1', seq: 0 },
        { type: 'transcript', content: '尚未转写', seq: 1 },
      ],
    });
    await createCase(createReq);

    const res = await listCases();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.cases)).toBe(true);
    expect(body.cases.length).toBeGreaterThan(0);
    expect(body.total).toBe(body.cases.length);

    // 每条都带必要字段，且 Stage 1 恒定值正确
    const first = body.cases[0];
    expect(first.id).toBeDefined();
    expect(typeof first.createdAt).toBe('string');
    expect(typeof first.hasImage).toBe('boolean');
    expect(first.hasImage).toBe(true); // 刚创建的含 question_image
    expect(first.tagStatus).toBe('untagged');
    expect(first.tagCount).toBe(0);
    expect(first.transcriptReady).toBe(false);
  });

  test('GET /api/nana/cases 不包含其他用户的 case（用户隔离，沿用 G1 思路）', async () => {
    // 切到 OTHER_STUDENT 创建一条
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

    // 回到默认 TEST_STUDENT 查列表（mockResolvedValueOnce 已用完，回退到默认）
    const listRes = await listCases();
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const ids = listBody.cases.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(otherCaseId);
  });
});
