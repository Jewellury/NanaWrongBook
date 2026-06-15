/**
 * 诊断会话 API · 集成测试
 *
 * 打真实路由 handler（决策⑨：禁止旁路直连 Prisma）。
 * Mock Next.js 模块 + 鉴权，handler 逻辑不走形。
 *
 * 需要先运行 npm run seed 确保测试数据库可读写。
 */

import { describe, test, expect, vi } from 'vitest';

// ---- Mock next/server ----
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

// ---- Mock next-auth ----
vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-001' } }),
}));

// ---- Mock @/lib/logger ----
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---- Mock @/lib/auth ----
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ---- Mock @/lib/api-errors ----
vi.mock('@/lib/api-errors', () => ({
  unauthorized: () => new Response(JSON.stringify({ error: '未授权' }), { status: 401 }),
  internalError: () => new Response(JSON.stringify({ error: '内部错误' }), { status: 500 }),
}));

// ---- Mock @/lib/prisma — 使用真实 PrismaClient（连测试库）----
import { PrismaClient } from '@prisma/client';

// vi.mock 工厂提升——用 var 确保声明也被提升到工厂之前
var _testPrisma: PrismaClient;

vi.mock('@/lib/prisma', () => {
  _testPrisma = new PrismaClient();
  return { prisma: _testPrisma };
});

// 导入路由 handler（必须在所有 mock 之后）
import { POST as createSession, GET as listSessions } from '../../app/api/diagnosis/sessions/route';
import { GET as getSession } from '../../app/api/diagnosis/sessions/[id]/route';
import { POST as postProbe } from '../../app/api/diagnosis/sessions/[id]/probes/route';
import { POST as postError } from '../../app/api/diagnosis/sessions/[id]/errors/route';
import { GET as getMap } from '../../app/api/diagnosis/map/route';
import { POST as postInitial } from '../../app/api/diagnosis/initial/route';

// ---- 辅助函数 ----
function mockRequest(body?: object, url?: string): Request {
  return new Request(url ?? 'http://localhost/api/diagnosis/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ---- 测试 ----

describe('诊断会话 API（集成测试 · mock session）', () => {
  let sessionId: string;

  // ---- POST /api/diagnosis/sessions ----

  test('POST /api/diagnosis/sessions 创建 weekend 会话', async () => {
    const req = mockRequest({ studentId: 'test-user-001', kind: 'weekend' });
    const res = await createSession(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.studentId).toBe('test-user-001');
    expect(body.kind).toBe('weekend');
    sessionId = body.id;
  });

  test('POST /api/diagnosis/sessions 拒绝非法 kind', async () => {
    const req = mockRequest({ studentId: 'test-user-001', kind: 'invalid' });
    const res = await createSession(req);
    expect(res.status).toBe(400);
  });

  test('POST /api/diagnosis/sessions 拒绝缺字段请求', async () => {
    const req = mockRequest({ studentId: 'test-user-001' }); // 缺 kind
    const res = await createSession(req);
    expect(res.status).toBe(400);
  });

  // ---- GET /api/diagnosis/sessions/[id] ----

  test('GET /api/diagnosis/sessions/[id] 返回会话详情', async () => {
    const req = new Request(`http://localhost/api/diagnosis/sessions/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(sessionId);
    expect(body.records).toEqual([]);
    expect(body.errors).toEqual([]);
  });

  test('GET /api/diagnosis/sessions/[id] 不存在的会话返回 404', async () => {
    const req = new Request('http://localhost/api/diagnosis/sessions/nonexistent');
    const res = await getSession(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });

  // ---- GET /api/diagnosis/sessions ----

  test('GET /api/diagnosis/sessions 列出会话', async () => {
    const req = new Request('http://localhost/api/diagnosis/sessions?studentId=test-user-001');
    const res = await listSessions(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  // ---- POST /api/diagnosis/sessions/[id]/probes ----

  test('POST /api/diagnosis/sessions/[id]/probes 记录答对的探针', async () => {
    const req = mockRequest({
      nodeId: 'M1-04',
      correct: true,
      durationS: 45,
    });
    const res = await postProbe(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.nodeId).toBe('M1-04');
    expect(body.correct).toBe(true);
    expect(body.durationS).toBe(45);
  });

  test('POST /api/diagnosis/sessions/[id]/probes 记录答错的探针', async () => {
    const req = mockRequest({
      nodeId: 'M1-15',
      correct: false,
      durationS: 120,
    });
    const res = await postProbe(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.correct).toBe(false);
  });

  test('POST /api/diagnosis/sessions/[id]/probes 拒绝缺 correct 请求', async () => {
    const req = mockRequest({ nodeId: 'M1-04' }); // 缺 correct
    const res = await postProbe(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(400);
  });

  // ---- POST /api/diagnosis/sessions/[id]/errors ----

  test('POST /api/diagnosis/sessions/[id]/errors 记录完整归因结论', async () => {
    const req = mockRequest({
      nodeId: 'M1-11',
      newmanStage: 'transformation',
      errorType: '概念性',
      crossTag: '等价变形守恒',
      rootNodeId: 'M1-08',
      dialogueLog: JSON.stringify([{ q: '你能说出交集的定义吗？', a: '记不清了' }]),
      evidenceRound: 1,
      followUpVerified: 'pending',
      confirmed: 'pending',
    });
    const res = await postError(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.newmanStage).toBe('transformation');
    expect(body.errorType).toBe('概念性');
    expect(body.evidenceRound).toBe(1);
    expect(body.followUpVerified).toBe('pending');
  });

  test('POST /api/diagnosis/sessions/[id]/errors 默认值测试', async () => {
    const req = mockRequest({});
    const res = await postError(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.followUpVerified).toBe('none');
    expect(body.confirmed).toBe('pending');
    expect(body.evidenceRound).toBeNull();
  });

  // ---- 验证会话详情含全部记录 ----

  test('GET /api/diagnosis/sessions/[id] 应包含全部 probes + errors', async () => {
    const req = new Request(`http://localhost/api/diagnosis/sessions/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.records.length).toBe(2);
    expect(body.errors.length).toBe(2);
  });
});

// ====== M3 知识地图 + 初诊 API ======

describe('M3 诊断 API（集成测试 · mock session）', () => {

  test('GET /api/diagnosis/map 返回知识地图', async () => {
    const req = new Request('http://localhost/api/diagnosis/map?studentId=test-user-001');
    const res = await getMap(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(body.learningFrontier)).toBe(true);
    expect(body.learningFrontier.length).toBeLessThanOrEqual(2);
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.total).toBe('number');
  });

  test('GET /api/diagnosis/map 缺 studentId 返回 400', async () => {
    const req = new Request('http://localhost/api/diagnosis/map');
    const res = await getMap(req);
    expect(res.status).toBe(400);
  });

  test('POST /api/diagnosis/initial 运行初诊', async () => {
    const req = mockRequest({
      studentId: 'test-user-001',
      mainlineId: 'M1',
      answers: [
        { nodeId: 'M1-04', correct: true },
        { nodeId: 'M1-05', correct: false },
      ],
    }, 'http://localhost/api/diagnosis/initial');
    const res = await postInitial(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.kind).toBe('initial');
    expect(Array.isArray(body.nodeStates)).toBe(true);
    expect(body.nodeStates.length).toBeGreaterThan(0);
    expect(Array.isArray(body.learningFrontier)).toBe(true);
  });

  test('POST /api/diagnosis/initial 拒绝空 answers', async () => {
    const req = mockRequest({
      studentId: 'test-user-001',
      mainlineId: 'M1',
      answers: [],
    }, 'http://localhost/api/diagnosis/initial');
    const res = await postInitial(req);
    expect(res.status).toBe(400);
  });
});
