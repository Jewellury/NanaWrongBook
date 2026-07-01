/**
 * case-classify lib · 单元测试
 *
 * mock @/lib/prisma 验证分类/挂载 lib 的逻辑（评审需求 #2 source 白名单 + #1 归属）：
 * - classifyCase（Stage 2）诚实返回 pending 契约
 * - assertValidSource 拒绝非法 source
 * - tagCaseManually 归属校验（拒绝非 owner）
 * - tagCaseManually 恒用 source="manual"（不接受外部 source）
 * - tagCaseManually 唯一约束冲突 → CaseTagExistsError
 * - listTagsForCase 归属校验
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── mock prisma（用 vi.hoisted 确保 mock 函数在 hoisted 的 vi.mock 工厂里可用）──
const { mockCaseFindFirst, mockTagCreate, mockTagFindMany } = vi.hoisted(() => ({
  mockCaseFindFirst: vi.fn(),
  mockTagCreate: vi.fn(),
  mockTagFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    case: { findFirst: mockCaseFindFirst },
    caseKnowledgeTag: {
      create: mockTagCreate,
      findMany: mockTagFindMany,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  classifyCase,
  tagCaseManually,
  listTagsForCase,
  assertValidSource,
  ALLOWED_SOURCES,
  CaseOwnershipError,
  CaseTagExistsError,
} from '@/lib/nana/case-classify';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── classifyCase（Stage 2 诚实 pending 契约）──────────

describe('classifyCase (Stage 2)', () => {
  test('返回 pending 契约：tags 空、status=pending、note=识别稍后接入', async () => {
    const result = await classifyCase('case-1');
    expect(result.tags).toEqual([]);
    expect(result.status).toBe('pending');
    expect(result.note).toBe('识别稍后接入');
  });

  test('不调用任何 prisma（Stage 2 不接真 AI，不写占位 tag）', async () => {
    await classifyCase('case-1');
    expect(mockTagCreate).not.toHaveBeenCalled();
    expect(mockCaseFindFirst).not.toHaveBeenCalled();
  });
});

// ─── assertValidSource（评审需求 #2）───────────────────

describe('assertValidSource / ALLOWED_SOURCES', () => {
  test('白名单含 manual/vlm/asr/rule/pending', () => {
    expect(ALLOWED_SOURCES.has('manual')).toBe(true);
    expect(ALLOWED_SOURCES.has('vlm')).toBe(true);
    expect(ALLOWED_SOURCES.has('asr')).toBe(true);
    expect(ALLOWED_SOURCES.has('rule')).toBe(true);
    expect(ALLOWED_SOURCES.has('pending')).toBe(true);
  });

  test('合法 source 不抛错', () => {
    expect(() => assertValidSource('manual')).not.toThrow();
    expect(() => assertValidSource('vlm')).not.toThrow();
  });

  test('非法 source 抛错（评审需求 #2：代码层限制）', () => {
    expect(() => assertValidSource('evil')).toThrow('非法 tag source');
    expect(() => assertValidSource('')).toThrow('非法 tag source');
    expect(() => assertValidSource('MANUAL')).toThrow('非法 tag source'); // 大小写敏感
  });
});

// ─── tagCaseManually（归属 + 恒 manual source）────────

describe('tagCaseManually', () => {
  test('归属校验通过：以 source="manual"、confidence=1.0 写入', async () => {
    mockCaseFindFirst.mockResolvedValueOnce({ id: 'case-1' });
    mockTagCreate.mockResolvedValueOnce({
      id: 'tag-1', caseId: 'case-1', nodeId: 'M1-01',
      source: 'manual', confidence: 1.0, note: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    });

    const tag = await tagCaseManually('case-1', 'M1-01', 'user-1');

    // 归属校验带了 studentId
    expect(mockCaseFindFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', studentId: 'user-1' },
      select: { id: true },
    });
    // 写入恒为 manual + confidence 1.0（不接受外部 source）
    expect(mockTagCreate).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        nodeId: 'M1-01',
        source: 'manual',
        confidence: 1.0,
        note: null,
      },
    });
    expect(tag.source).toBe('manual');
    expect(tag.confidence).toBe(1.0);
  });

  test('归属校验失败（非 owner）→ 抛 CaseOwnershipError，不写', async () => {
    mockCaseFindFirst.mockResolvedValueOnce(null); // 不属于该用户

    await expect(
      tagCaseManually('case-1', 'M1-01', 'intruder'),
    ).rejects.toBeInstanceOf(CaseOwnershipError);

    expect(mockTagCreate).not.toHaveBeenCalled();
  });

  test('恒用 source="manual"，函数签名不暴露 source 入参（防伪造）', async () => {
    // tagCaseManually 只有 (caseId, nodeId, userId, note?) —— 无 source 参数
    mockCaseFindFirst.mockResolvedValueOnce({ id: 'case-1' });
    mockTagCreate.mockResolvedValueOnce({
      id: 'tag-2', caseId: 'case-1', nodeId: 'M1-02',
      source: 'manual', confidence: 1.0, note: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    });

    await tagCaseManually('case-1', 'M1-02', 'user-1');
    const callArg = mockTagCreate.mock.calls[0][0];
    expect(callArg.data.source).toBe('manual'); // 永远是 manual
  });

  test('唯一约束冲突（P2002）→ 抛 CaseTagExistsError', async () => {
    mockCaseFindFirst.mockResolvedValueOnce({ id: 'case-1' });
    const prismaErr = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    mockTagCreate.mockRejectedValueOnce(prismaErr);

    await expect(
      tagCaseManually('case-1', 'M1-01', 'user-1'),
    ).rejects.toBeInstanceOf(CaseTagExistsError);
  });

  test('note 可选传入', async () => {
    mockCaseFindFirst.mockResolvedValueOnce({ id: 'case-1' });
    mockTagCreate.mockResolvedValueOnce({
      id: 'tag-3', caseId: 'case-1', nodeId: 'M1-03',
      source: 'manual', confidence: 1.0, note: '自己挂的',
      createdAt: '2026-07-01T00:00:00.000Z',
    });

    await tagCaseManually('case-1', 'M1-03', 'user-1', '自己挂的');
    expect(mockTagCreate.mock.calls[0][0].data.note).toBe('自己挂的');
  });
});

// ─── listTagsForCase（归属校验）───────────────────────

describe('listTagsForCase', () => {
  test('归属校验通过 → 返回 tag 列表', async () => {
    mockCaseFindFirst.mockResolvedValueOnce({ id: 'case-1' });
    mockTagFindMany.mockResolvedValueOnce([
      { id: 'tag-1', caseId: 'case-1', nodeId: 'M1-01', source: 'manual', confidence: 1.0, note: null, createdAt: '2026-07-01T00:00:00.000Z' },
    ]);

    const tags = await listTagsForCase('case-1', 'user-1');
    expect(mockCaseFindFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', studentId: 'user-1' },
      select: { id: true },
    });
    expect(tags).toHaveLength(1);
    expect(tags[0].nodeId).toBe('M1-01');
  });

  test('归属校验失败 → 抛 CaseOwnershipError，不查 tag', async () => {
    mockCaseFindFirst.mockResolvedValueOnce(null);
    await expect(
      listTagsForCase('case-1', 'intruder'),
    ).rejects.toBeInstanceOf(CaseOwnershipError);
    expect(mockTagFindMany).not.toHaveBeenCalled();
  });
});
