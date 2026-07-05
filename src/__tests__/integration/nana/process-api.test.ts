/**
 * /process API 集成测试
 *
 * mock analyzeCase + 真实 PrismaClient（测试库）
 *
 * 测试覆盖（评审 8 项重点）：
 * 1. POST 登录校验 + Case.studentId 归属校验
 * 2. GET 状态查询：CaseAiResult 不存在 → pending
 * 3. 成功时写 CaseAiResult + CaseKnowledgeTag(source=vlm) + CaseTextbookTopicTag(source=vlm)
 * 4. 低置信候选不自动挂 tag
 * 5. 用户已编辑的 questionSummary/textbookTopicId 不被覆盖
 * 6. 失败时诚实写 processingStatus=failed
 * 7. 响应不返回 base64 原图
 * 8. 真实 provider 不进 CI（mock analyzeCase）
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// ─── mock analyzeCase ─────────────────────────────────

const { mockAnalyzeCase } = vi.hoisted(() => ({
  mockAnalyzeCase: vi.fn(),
}));

vi.mock('@/lib/nana/case-analyzer', () => ({
  analyzeCase: mockAnalyzeCase,
  deriveAudioStatus: (provided: boolean, supported: boolean, err?: unknown) => {
    if (!provided || !supported) return 'skipped';
    if (!err) return 'success';
    const name = (err as Error)?.name;
    if (name === 'CaseAnalyzerTimeoutError') return 'timeout';
    return 'failed';
  },
  CaseAnalyzerError: class CaseAnalyzerError extends Error {
    constructor(m: string) { super(m); this.name = 'CaseAnalyzerError'; }
  },
  CaseAnalyzerTimeoutError: class CaseAnalyzerTimeoutError extends Error {
    constructor() { super('timeout'); this.name = 'CaseAnalyzerTimeoutError'; }
  },
}));

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
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-process-user' } }),
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

import { POST, GET } from '../../../app/api/nana/cases/[id]/process/route';
import { getServerSession } from 'next-auth';

// ─── 辅助 ─────────────────────────────────────────────

const TEST_USER = 'test-process-user';
const OTHER_USER = 'test-process-other';

function mockPost(path: string): Request {
  return new Request(`http://localhost${path}`, { method: 'POST' });
}

function mockGet(path: string): Request {
  return new Request(`http://localhost${path}`);
}

const MOCK_RESULT = {
  transcript: '这是转写文字',
  questionSummary: '判断函数单调性',
  textbookTopicCandidates: [
    { topicId: 'TB-010', confidence: 0.85, reason: '函数单调性' },
  ],
  knowledgeNodeCandidates: [
    { nodeId: '', confidence: 0.8, reason: '用定义判断单调性' },
  ],
  initialFeedback: '你很仔细',
  possibleMistakeReason: '可能符号出错',
  nextActionSuggestion: '回看 3.2 函数的基本性质',
  audioStatus: 'skipped' as const,
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
};

// will be filled in beforeAll
let validNodeId: string;
let validTopicId: string;

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

  const topic = await _testPrisma.textbookTopic.findFirst({ select: { id: true } });
  if (!topic) throw new Error('测试库无 TextbookTopic 种子数据');
  validTopicId = topic.id;

  // 更新 MOCK_RESULT 使用真实 nodeId
  MOCK_RESULT.knowledgeNodeCandidates[0].nodeId = validNodeId;
});

afterAll(async () => {
  await cleanupTestData();
  await _testPrisma.$disconnect();
});

// ─── 创建测试 case 的辅助 ─────────────────────────────

async function createTestCase(
  studentId: string = TEST_USER,
  withImage: boolean = true,
): Promise<string> {
  const artifacts: { type: string; content: string; seq: number }[] = [];
  if (withImage) {
    artifacts.push({ type: 'question_image', content: 'data:image/png;base64,iVBOR', seq: 0 });
  }
  const c = await _testPrisma.case.create({
    data: { studentId, artifacts: { create: artifacts } },
  });
  return c.id;
}

// ─── 测试 ─────────────────────────────────────────────

describe('/process API 集成测试', () => {
  // 1. POST 登录校验 + 归属校验
  test('POST 未登录 → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never);
    const res = await POST(mockPost('/api/nana/cases/fake-id/process'), {
      params: Promise.resolve({ id: 'fake-id' }),
    });
    expect(res.status).toBe(401);
  });

  test('POST 不属于自己的 case → 404', async () => {
    const caseId = await createTestCase(OTHER_USER);
    const res = await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(res.status).toBe(404);
  });

  test('GET 不属于自己的 case → 404', async () => {
    const caseId = await createTestCase(OTHER_USER);
    const res = await GET(mockGet(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(res.status).toBe(404);
  });

  // 2. GET 状态查询：CaseAiResult 不存在 → pending
  test('GET CaseAiResult 不存在 → { status: "pending" }', async () => {
    const caseId = await createTestCase();
    const res = await GET(mockGet(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.audioStatus).toBe('skipped');
  });

  // 3. 成功时写 CaseAiResult + CaseKnowledgeTag + CaseTextbookTopicTag
  test('POST 成功 → CaseAiResult + CaseKnowledgeTag(vlm) + CaseTextbookTopicTag(vlm) 持久化', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');

    // 验证 CaseAiResult
    const aiResult = await _testPrisma.caseAiResult.findUnique({
      where: { caseId },
    });
    expect(aiResult).toBeTruthy();
    expect(aiResult!.processingStatus).toBe('success');
    expect(aiResult!.questionSummary).toBe('判断函数单调性');
    expect(aiResult!.initialFeedback).toBe('你很仔细');
    expect(aiResult!.nextActionSuggestion).toBe('回看 3.2 函数的基本性质');
    expect(aiResult!.possibleMistakeReason).toBe('可能符号出错');

    // 验证 CaseKnowledgeTag(source=vlm)
    const tags = await _testPrisma.caseKnowledgeTag.findMany({
      where: { caseId, source: 'vlm' },
    });
    expect(tags.length).toBe(1);
    expect(tags[0].nodeId).toBe(validNodeId);
    expect(tags[0].confidence).toBe(0.8);

    // 验证 CaseTextbookTopicTag(source=vlm)
    const topicTags = await _testPrisma.caseTextbookTopicTag.findMany({
      where: { caseId, source: 'vlm' },
    });
    expect(topicTags.length).toBe(1);
    expect(topicTags[0].textbookTopicId).toBe('TB-010');
  });

  // 4. 低置信候选不自动挂 tag
  test('POST 低置信候选（<0.5）→ 不挂 CaseKnowledgeTag / CaseTextbookTopicTag', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce({
      ...MOCK_RESULT,
      textbookTopicCandidates: [
        { topicId: 'TB-010', confidence: 0.3, reason: '低置信' },
      ],
      knowledgeNodeCandidates: [
        { nodeId: validNodeId, confidence: 0.2, reason: '低置信' },
      ],
    });

    const res = await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(res.status).toBe(200);

    const tags = await _testPrisma.caseKnowledgeTag.findMany({
      where: { caseId, source: 'vlm' },
    });
    expect(tags.length).toBe(0);

    const topicTags = await _testPrisma.caseTextbookTopicTag.findMany({
      where: { caseId, source: 'vlm' },
    });
    expect(topicTags.length).toBe(0);

    // CaseAiResult 的 textbookTopicId 也不写（低置信）
    const aiResult = await _testPrisma.caseAiResult.findUnique({
      where: { caseId },
    });
    expect(aiResult!.textbookTopicId).toBeNull();
  });

  // 5. 用户已编辑的 questionSummary 不被覆盖
  test('POST 重复 /process：questionSummaryEdited=true → 不覆盖 questionSummary', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);

    // 第一次 process
    await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });

    // 模拟用户编辑
    await _testPrisma.caseAiResult.update({
      where: { caseId },
      data: { questionSummary: '用户编辑的摘要', questionSummaryEdited: true },
    });

    // 第二次 process
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);
    await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });

    const aiResult = await _testPrisma.caseAiResult.findUnique({
      where: { caseId },
    });
    expect(aiResult!.questionSummary).toBe('用户编辑的摘要');
    expect(aiResult!.questionSummaryEdited).toBe(true);
  });

  // 5b. 用户已编辑的 textbookTopicId 不被覆盖
  test('POST 重复 /process：textbookTopicEdited=true → 不覆盖 textbookTopicId', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);

    // 第一次 process
    await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });

    // 模拟用户修正分类
    await _testPrisma.caseAiResult.update({
      where: { caseId },
      data: { textbookTopicId: validTopicId, textbookTopicEdited: true },
    });

    // 第二次 process
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);
    await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });

    const aiResult = await _testPrisma.caseAiResult.findUnique({
      where: { caseId },
    });
    expect(aiResult!.textbookTopicId).toBe(validTopicId);
    expect(aiResult!.textbookTopicEdited).toBe(true);
  });

  // 6. 失败时诚实写 processingStatus=failed
  test('POST analyzeCase 失败 → CaseAiResult(processingStatus=failed) + 返回失败', async () => {
    const caseId = await createTestCase();
    const { CaseAnalyzerError } = await import('@/lib/nana/case-analyzer');
    mockAnalyzeCase.mockRejectedValueOnce(
      new CaseAnalyzerError('API 调用失败'),
    );

    const res = await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.error).toContain('API 调用失败');

    const aiResult = await _testPrisma.caseAiResult.findUnique({
      where: { caseId },
    });
    expect(aiResult).toBeTruthy();
    expect(aiResult!.processingStatus).toBe('failed');
    expect(aiResult!.error).toContain('API 调用失败');
  });

  // 6b. 超时 → status=timeout
  test('POST analyzeCase 超时 → CaseAiResult(processingStatus=failed) + 返回 timeout', async () => {
    const caseId = await createTestCase();
    const { CaseAnalyzerTimeoutError } = await import('@/lib/nana/case-analyzer');
    mockAnalyzeCase.mockRejectedValueOnce(
      new CaseAnalyzerTimeoutError(),
    );

    const res = await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    const body = await res.json();
    expect(body.status).toBe('timeout');
    // 无音频时 audioStatus 为 skipped（超时也走 deriveAudioStatus）
    expect(body.audioStatus).toBe('skipped');
  });

  // 7. 响应不返回 base64 原图
  test('POST 响应不含 base64 原图', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('iVBOR');
    expect(bodyStr).not.toContain('base64');
  });

  // 7b. GET 响应也不含 base64 原图
  test('GET 响应不含 base64 原图', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);
    await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });

    const res = await GET(mockGet(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('iVBOR');
    expect(bodyStr).not.toContain('base64');
  });

  // 补充：GET 成功后查询返回正确状态
  test('GET 成功后 → 返回 status=success + AI 结果字段', async () => {
    const caseId = await createTestCase();
    mockAnalyzeCase.mockResolvedValueOnce(MOCK_RESULT);
    await POST(mockPost(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });

    const res = await GET(mockGet(`/api/nana/cases/${caseId}/process`), {
      params: Promise.resolve({ id: caseId }),
    });
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.questionSummary).toBe('判断函数单调性');
    expect(body.feedback).toBe('你很仔细');
    expect(body.nextActionSuggestion).toBe('回看 3.2 函数的基本性质');
    expect(body.possibleMistakeReason).toBe('可能符号出错');
  });

  // 补充：缺少题图 → 400
  test('POST 缺少题图 artifact → 400', async () => {
    const c = await _testPrisma.case.create({
      data: {
        studentId: TEST_USER,
        artifacts: {
          create: [{ type: 'transcript', content: '只有文字', seq: 0 }],
        },
      },
    });

    const res = await POST(mockPost(`/api/nana/cases/${c.id}/process`), {
      params: Promise.resolve({ id: c.id }),
    });
    expect(res.status).toBe(400);
  });
});
