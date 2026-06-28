/**
 * 轻反馈 API · 集成测试
 *
 * 打真实路由 handler，Mock Next.js 模块 + 鉴权。
 * 使用真实 PrismaClient（连测试库）。
 *
 * 测试：
 * - POST /api/nana/cases/:id/feedback — 返回 hint（含匹配规则）
 * - POST — 返回默认 hint（无匹配）
 * - 400（transcript 缺失）
 */

import { describe, test, expect, vi } from 'vitest';

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
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-feedback-user' } }),
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

// 导入路由 handler（必须在所有 mock 之后）
import { POST as createFeedback } from '../../../app/api/nana/cases/[id]/feedback/route';

// ---- 辅助 ----

function mockPost(path: string, body: object): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---- 测试 ----

describe('Feedback API（集成测试 · mock session）', () => {
  const CASE_ID = 'test-case-id-for-feedback';

  test('POST 输入包含"配方"关键词 → 返回配方法 hint', async () => {
    const req = mockPost(`/api/nana/cases/${CASE_ID}/feedback`, {
      transcript: '我配方配到一半就乱了',
    });
    const res = await createFeedback(req, { params: Promise.resolve({ id: CASE_ID }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.hint).toContain('配方法');
    expect(body.relatedTags).toContain('配方法');
    expect(body.isPreliminary).toBe(true);
  });

  test('POST 输入包含"定义域"关键词 → 返回定义域 hint', async () => {
    const req = mockPost(`/api/nana/cases/${CASE_ID}/feedback`, {
      transcript: '我先看了定义域，然后求值域',
    });
    const res = await createFeedback(req, { params: Promise.resolve({ id: CASE_ID }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.hint).toContain('定义域/值域');
    expect(body.relatedTags).toContain('定义域与值域');
    expect(body.isPreliminary).toBe(true);
  });

  test('POST 输入包含"算不出来"关键词 → 返回计算 hint', async () => {
    const req = mockPost(`/api/nana/cases/${CASE_ID}/feedback`, {
      transcript: '这个题我算不出来',
    });
    const res = await createFeedback(req, { params: Promise.resolve({ id: CASE_ID }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.hint).toContain('没关系');
    expect(body.isPreliminary).toBe(true);
  });

  test('POST 无关键词匹配 → 返回默认 hint', async () => {
    const req = mockPost(`/api/nana/cases/${CASE_ID}/feedback`, {
      transcript: '这个题不太会做，我先想想',
    });
    const res = await createFeedback(req, { params: Promise.resolve({ id: CASE_ID }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.hint).toContain('再拍几道后我们一起看看有没有规律');
    expect(body.relatedTags).toEqual([]);
    expect(body.isPreliminary).toBe(true);
  });

  test('POST 空 transcript → 返回 400', async () => {
    const req = mockPost(`/api/nana/cases/${CASE_ID}/feedback`, {});
    const res = await createFeedback(req, { params: Promise.resolve({ id: CASE_ID }) });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST transcript 为空字符串 → 返回 400', async () => {
    const req = mockPost(`/api/nana/cases/${CASE_ID}/feedback`, {
      transcript: '',
    });
    const res = await createFeedback(req, { params: Promise.resolve({ id: CASE_ID }) });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
