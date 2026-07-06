/**
 * /summary API + /cases 列表扩展 集成测试
 *
 * 真实 PrismaClient（测试库）
 *
 * 测试覆盖：
 * 1. summary 登录校验 → 401
 * 2. summary 跨用户隔离
 * 3. summary 按 TextbookTopic 分组
 * 4. summary 未分类分组（topic=null）
 * 5. summary processStatus=pending（无 CaseAiResult）
 * 6. summary processStatus=success
 * 7. summary processStatus=failed
 * 8. summary 不返回 base64
 * 9. summary aiSummary 字段
 * 10. summary 空列表
 * 11. cases 列表扩展字段存在
 * 12. cases 列表 processStatus=pending
 * 13. cases 列表 processStatus=success
 * 14. cases 列表不返回 base64
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// ─── mock Next.js / auth / logger / api-errors ────────

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
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-summary-user' } }),
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
  notFound: (m?: string) => new Response(JSON.stringify({ error: m || 'not found' }), { status: 404 }),
}));

// ─── 真实 PrismaClient ────────────────────────────────

import { PrismaClient } from '@prisma/client';

var _testPrisma: PrismaClient;

vi.mock('@/lib/prisma', () => {
  _testPrisma = new PrismaClient();
  return { prisma: _testPrisma };
});

// ─── 导入 handler ─────────────────────────────────────

import { GET as summaryGET } from '../../../app/api/nana/cases/summary/route';
import { GET as casesGET } from '../../../app/api/nana/cases/route';
import { getServerSession } from 'next-auth';

// ─── 辅助 ─────────────────────────────────────────────

const TEST_USER = 'test-summary-user';
const OTHER_USER = 'test-summary-other';

function mockGet(path: string): Request {
  return new Request(`http://localhost${path}`);
}

// will be filled in beforeAll
let validTopicId: string;
let validTopicId2: string;
let validNodeId: string;

// ─── 生命周期 ─────────────────────────────────────────

async function cleanupTestData() {
  const cases = await _testPrisma.case.findMany({
    where: { studentId: { in: [TEST_USER, OTHER_USER] } },
    select: { id: true },
  });
  for (const c of cases) {
    await _testPrisma.caseTextbookTopicTag.deleteMany({ where: { caseId: c.id } });
    await _testPrisma.caseKnowledgeTag.deleteMany({ where: { caseId: c.id } });
    await _testPrisma.caseAiResult.deleteMany({ where: { caseId: c.id } });
    await _testPrisma.artifact.deleteMany({ where: { caseId: c.id } });
  }
  await _testPrisma.case.deleteMany({
    where: { studentId: { in: [TEST_USER, OTHER_USER] } },
  });
}

beforeAll(async () => {
  await cleanupTestData();

  // 取真实种子数据
  const node = await _testPrisma.knowledgeNode.findFirst({ select: { id: true } });
  if (!node) throw new Error('测试库无 KnowledgeNode 种子数据');
  validNodeId = node.id;

  const topics = await _testPrisma.textbookTopic.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 2,
  });
  if (topics.length < 2) throw new Error('测试库 TextbookTopic 种子数据不足');
  validTopicId = topics[0].id;
  validTopicId2 = topics[1].id;
});

afterAll(async () => {
  await cleanupTestData();
  await _testPrisma.$disconnect();
});

// ─── 辅助：创建 case + artifact + aiResult ─────────────

async function createCaseWithImage(studentId: string, hasImage = true) {
  const artifacts = hasImage
    ? [{ type: 'question_image', content: 'data:image/png;base64,iVBORw0KGgo=', seq: 0 }]
    : [];
  const record = await _testPrisma.case.create({
    data: {
      studentId,
      artifacts: { create: artifacts },
    },
  });
  return record.id;
}

async function addAiResult(caseId: string, status: string, summary?: string) {
  await _testPrisma.caseAiResult.create({
    data: {
      caseId,
      processingStatus: status,
      questionSummary: summary ?? '测试摘要',
      audioStatus: 'skipped',
    },
  });
}

async function addTextbookTag(caseId: string, topicId: string) {
  await _testPrisma.caseTextbookTopicTag.create({
    data: {
      caseId,
      textbookTopicId: topicId,
      source: 'vlm',
      confidence: 0.85,
    },
  });
}

// ─── 解析响应 ──────────────────────────────────────────

async function parseJson(res: Response) {
  return JSON.parse(await res.text());
}

// ============================================================
// summary API 测试
// ============================================================

describe('GET /api/nana/cases/summary', () => {

  test('1. 未登录 → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await summaryGET();
    expect(res.status).toBe(401);
  });

  test('2. 跨用户隔离', async () => {
    // 创建 OTHER_USER 的 case
    const otherCaseId = await createCaseWithImage(OTHER_USER);
    await addAiResult(otherCaseId, 'success', '其他用户的题');

    // 创建 TEST_USER 的 case
    const myCaseId = await createCaseWithImage(TEST_USER);
    await addAiResult(myCaseId, 'success', '我的题');

    const res = await summaryGET();
    const body = await parseJson(res);

    // 不应包含其他用户的数据
    const allCaseIds = body.groups.flatMap((g: { cases: Array<{ id: string }> }) => g.cases.map((c) => c.id));
    expect(allCaseIds).toContain(myCaseId);
    expect(allCaseIds).not.toContain(otherCaseId);

    // cleanup
    await cleanupTestData();
  });

  test('3. 按 TextbookTopic 分组', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'success', '函数题');
    await addTextbookTag(caseId, validTopicId);

    const res = await summaryGET();
    const body = await parseJson(res);

    expect(body.groups.length).toBeGreaterThanOrEqual(1);
    // 找到有 topic 的组
    const groupWithTopic = body.groups.find((g: { topic: { id: string } | null }) => g.topic !== null);
    expect(groupWithTopic).toBeDefined();
    expect(groupWithTopic.topic.id).toBe(validTopicId);

    await cleanupTestData();
  });

  test('4. 未分类分组（topic=null）', async () => {
    // 有 case 但没有 textbookTopicTag
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'success', '未分类题');

    const res = await summaryGET();
    const body = await parseJson(res);

    // 应有 topic=null 组
    const nullGroup = body.groups.find((g: { topic: null }) => g.topic === null);
    expect(nullGroup).toBeDefined();
    expect(nullGroup.cases.length).toBe(1);
    expect(nullGroup.cases[0].id).toBe(caseId);

    await cleanupTestData();
  });

  test('5. processStatus=pending（无 CaseAiResult）', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    // 不加 CaseAiResult

    const res = await summaryGET();
    const body = await parseJson(res);

    const nullGroup = body.groups.find((g: { topic: null }) => g.topic === null);
    expect(nullGroup).toBeDefined();
    const item = nullGroup.cases.find((c: { id: string }) => c.id === caseId);
    expect(item).toBeDefined();
    expect(item.processStatus).toBe('pending');

    await cleanupTestData();
  });

  test('6. processStatus=success', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'success', '成功题');

    const res = await summaryGET();
    const body = await parseJson(res);

    const nullGroup = body.groups.find((g: { topic: null }) => g.topic === null);
    const item = nullGroup.cases.find((c: { id: string }) => c.id === caseId);
    expect(item.processStatus).toBe('success');

    await cleanupTestData();
  });

  test('7. processStatus=failed', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'failed');

    const res = await summaryGET();
    const body = await parseJson(res);

    const nullGroup = body.groups.find((g: { topic: null }) => g.topic === null);
    const item = nullGroup.cases.find((c: { id: string }) => c.id === caseId);
    expect(item.processStatus).toBe('failed');

    await cleanupTestData();
  });

  test('8. 不返回 base64', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'success', '摘要');

    const res = await summaryGET();
    const bodyText = await res.text();

    // 不应包含 base64 前缀
    expect(bodyText).not.toContain('data:image');
    expect(bodyText).not.toContain('base64');

    await cleanupTestData();
  });

  test('9. aiSummary 字段正确返回', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'success', '这是一道函数单调性的题');

    const res = await summaryGET();
    const body = await parseJson(res);

    const nullGroup = body.groups.find((g: { topic: null }) => g.topic === null);
    const item = nullGroup.cases.find((c: { id: string }) => c.id === caseId);
    expect(item.aiSummary).toBe('这是一道函数单调性的题');

    await cleanupTestData();
  });

  test('10. 空列表', async () => {
    // 确保没有数据
    await cleanupTestData();

    const res = await summaryGET();
    const body = await parseJson(res);

    expect(body.total).toBe(0);
    expect(body.groups).toEqual([]);
  });
});

// ============================================================
// cases 列表扩展测试
// ============================================================

describe('GET /api/nana/cases 列表扩展', () => {

  test('11. 扩展字段存在', async () => {
    const caseId = await createCaseWithImage(TEST_USER);

    const res = await casesGET();
    const body = await parseJson(res);

    const item = body.cases.find((c: { id: string }) => c.id === caseId);
    expect(item).toBeDefined();
    expect(item).toHaveProperty('aiSummary');
    expect(item).toHaveProperty('textbookChapter');
    expect(item).toHaveProperty('processStatus');

    await cleanupTestData();
  });

  test('12. 列表 processStatus=pending', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    // 无 CaseAiResult

    const res = await casesGET();
    const body = await parseJson(res);

    const item = body.cases.find((c: { id: string }) => c.id === caseId);
    expect(item.processStatus).toBe('pending');

    await cleanupTestData();
  });

  test('13. 列表 processStatus=success', async () => {
    const caseId = await createCaseWithImage(TEST_USER);
    await addAiResult(caseId, 'success', '成功');

    const res = await casesGET();
    const body = await parseJson(res);

    const item = body.cases.find((c: { id: string }) => c.id === caseId);
    expect(item.processStatus).toBe('success');
    expect(item.aiSummary).toBe('成功');

    await cleanupTestData();
  });

  test('14. 列表不返回 base64', async () => {
    const caseId = await createCaseWithImage(TEST_USER);

    const res = await casesGET();
    const bodyText = await res.text();

    expect(bodyText).not.toContain('data:image');
    expect(bodyText).not.toContain('base64');

    await cleanupTestData();
  });
});
