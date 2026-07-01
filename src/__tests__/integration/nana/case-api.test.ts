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
import { GET as getTags, POST as postTag } from '../../../app/api/nana/cases/[id]/tags/route';
// 导入被 mock 的 getServerSession（用于跨用户场景切换身份）
import { getServerSession } from 'next-auth';

// ---- 辅助 ----
const TEST_STUDENT = 'test-nana-user';
const OTHER_STUDENT = 'test-nana-other-user';

// 48 节点种子里的一个真实 nodeId（tags API 用真实节点校验；在 beforeAll 里取）
let validNodeId: string;

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
    // Stage 2：显式清 tag（虽有 cascade，但显式清符合铁律 6 逐表报数习惯 + 顺序稳妥）
    await _testPrisma.caseKnowledgeTag.deleteMany({ where: { caseId: c.id } });
    await _testPrisma.artifact.deleteMany({ where: { caseId: c.id } });
  }
  await _testPrisma.case.deleteMany({
    where: { studentId: { in: [TEST_STUDENT, OTHER_STUDENT] } },
  });
}

beforeAll(async () => {
  await cleanupTestData();
  // 取一个真实 KnowledgeNode id（种子 48 节点），供 tags 测试用
  const node = await _testPrisma.knowledgeNode.findFirst({ select: { id: true } });
  if (!node) throw new Error('测试库无 KnowledgeNode 种子数据');
  validNodeId = node.id;
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

// ============================================================
// S2-5：CaseKnowledgeTag API（/cases/[id]/tags）集成测试
// 评审需求 #1（归属过滤）+ #2（source 白名单 + 不接受 body 的 source）
// ============================================================

describe('CaseKnowledgeTag API + 归属/source 校验（S2-3/S2-5）', () => {
  let ownedCaseId: string;

  // 前置：TEST_STUDENT 创建一条 case 用于后续 tags 测试

  test('前置：TEST_STUDENT 创建一条 case', async () => {
    const req = mockPost('/api/nana/cases', {
      artifacts: [
        { type: 'question_image', content: 'data:image/jpeg;base64,TAGTEST', seq: 0 },
      ],
    });
    const res = await createCase(req);
    expect(res.status).toBe(201);
    ownedCaseId = (await res.json()).id;
  });

  // ---- GET /api/nana/cases/:id/tags ----

  test('GET tags owner 200：空标签列表（未分类）', async () => {
    const res = await getTags(
      mockGet(`/api/nana/cases/${ownedCaseId}/tags`),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags).toEqual([]);
  });

  test('GET tags 跨用户 → 404（评审需求 #1：归属过滤，不裸查）', async () => {
    const mockGetSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
    mockGetSession.mockResolvedValueOnce({ user: { id: OTHER_STUDENT } });

    const res = await getTags(
      mockGet(`/api/nana/cases/${ownedCaseId}/tags`),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(404);
  });

  test('GET tags 未授权 → 401', async () => {
    const mockGetSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
    mockGetSession.mockResolvedValueOnce(null);

    const res = await getTags(
      mockGet(`/api/nana/cases/${ownedCaseId}/tags`),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(401);
  });

  // ---- POST /api/nana/cases/:id/tags ----

  test('POST tags owner 201：人工挂载（source 恒 manual、confidence 1.0）', async () => {
    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { nodeId: validNodeId }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.caseId).toBe(ownedCaseId);
    expect(body.nodeId).toBe(validNodeId);
    expect(body.source).toBe('manual');
    expect(body.confidence).toBe(1.0);
  });

  test('POST tags 缺失 nodeId → 400', async () => {
    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { note: '没传 nodeId' }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(400);
  });

  test('POST tags nodeId 为空字符串 → 400', async () => {
    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { nodeId: '  ' }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(400);
  });

  test('POST tags 不存在的 nodeId → 400（防脏挂）', async () => {
    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { nodeId: 'NONEXISTENT-NODE-XYZ' }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('知识点');
  });

  test('POST tags 重复挂同节点 → 409（[caseId,nodeId,source] 唯一约束）', async () => {
    // 已在前面挂过 validNodeId（source=manual），再挂一次应 409
    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { nodeId: validNodeId }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('已挂过');
  });

  test('POST tags body 传 source="vlm" 也被忽略，落库仍 manual（评审需求 #2）', async () => {
    // 先取一个新节点（避免和已挂的 validNodeId 冲突）
    const nodes = await _testPrisma.knowledgeNode.findMany({ select: { id: true }, take: 2 });
    const otherNode = nodes.find((n) => n.id !== validNodeId) ?? nodes[0];

    const res = await postTag(
      // 客户端企图伪造 source=vlm
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, {
        nodeId: otherNode.id,
        source: 'vlm',
      }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // 落库恒为 manual，source 未被客户端劫持
    expect(body.source).toBe('manual');
    expect(body.nodeId).toBe(otherNode.id);
  });

  test('POST tags 跨用户 → 404（评审需求 #1：归属过滤）', async () => {
    const mockGetSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
    mockGetSession.mockResolvedValueOnce({ user: { id: OTHER_STUDENT } });

    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { nodeId: validNodeId }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(404);
  });

  test('POST tags 未授权 → 401', async () => {
    const mockGetSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
    mockGetSession.mockResolvedValueOnce(null);

    const res = await postTag(
      mockPost(`/api/nana/cases/${ownedCaseId}/tags`, { nodeId: validNodeId }),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(401);
  });

  // ---- GET tags 反映已挂标签（回归确认）----

  test('GET tags 反映已挂的 manual 标签', async () => {
    const res = await getTags(
      mockGet(`/api/nana/cases/${ownedCaseId}/tags`),
      { params: Promise.resolve({ id: ownedCaseId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 至少挂过 validNodeId（manual）
    const nodeIds = body.tags.map((t: { nodeId: string }) => t.nodeId);
    expect(nodeIds).toContain(validNodeId);
    expect(body.tags.every((t: { source: string }) => t.source === 'manual')).toBe(true);
  });
});
