/**
 * 诊断会话 API · 集成测试
 *
 * 打真实路由 handler（决策⑨：禁止旁路直连 Prisma）。
 * 鉴权用 vitest mock getServerSession。
 *
 * 需要先运行 npm run seed 确保数据库可读写。
 */

import { describe, test, expect, beforeAll, vi } from 'vitest';

// ---- Mock getServerSession ----
vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-001' } }),
}));

// 导入路由 handler（必须 mock 之后）
import { POST as createSession, GET as listSessions } from '../../app/api/diagnosis/sessions/route';
import { GET as getSession } from '../../app/api/diagnosis/sessions/[id]/route';
import { POST as postProbe } from '../../app/api/diagnosis/sessions/[id]/probes/route';
import { POST as postError } from '../../app/api/diagnosis/sessions/[id]/errors/route';

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
    expect(body.confirmed).toBe('pending');
  });

  test('POST /api/diagnosis/sessions/[id]/errors 记录最简归因（只用默认值）', async () => {
    const req = mockRequest({});
    const res = await postError(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.followUpVerified).toBe('none'); // 默认值
    expect(body.confirmed).toBe('pending');     // 默认值
    expect(body.evidenceRound).toBeNull();
  });

  // ---- 验证会话详情含全部记录 ----

  test('GET /api/diagnosis/sessions/[id] 包含全部 probes + errors', async () => {
    const req = new Request(`http://localhost/api/diagnosis/sessions/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.records.length).toBe(2); // 2 条探针
    expect(body.errors.length).toBe(2);  // 2 条归因
  });
});
