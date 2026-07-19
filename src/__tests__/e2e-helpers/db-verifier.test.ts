/**
 * db-verifier · 单元测试（r3.1 任务 2.3）
 *
 * TDD 流程：用 Prisma Client 直接造测试数据 → 跑 verifier → 断言通过/失败。
 *
 * 覆盖 FREEZE-001 §9.1 关键约束：
 *   - CL-02: Case + Artifact(question_image) 落库
 *   - CL-06: CaseAiResult 字段（含 processingStatus 在 CaseAiResult 上，不在 Case 上）
 *   - CL-07: CaseTextbookTopicTag + CaseKnowledgeTag 双层独立挂载
 *   - CL-08: textbookTopicId=null 低置信降级
 *   - CL-12: StudentNodeState 不新增（无 mastered 非法值）
 *   - CL-14: processingStatus=success + audioStatus=failed（音频子失败）
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createDbVerifier, type DbVerifier } from '@/../e2e/helpers/db-verifier';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error('db-verifier.test.ts 需要设置 DATABASE_URL 环境变量');
}

const prisma = new PrismaClient();

// 测试用的常量（来自 test.db 种子）
const TEST_TB_ID = 'TB-010';
const TEST_NODE_ID_PREFIX = 'TEST-NODE-';

let verifier: DbVerifier;
let testStudentId: string;

beforeAll(async () => {
    verifier = createDbVerifier(prisma);
    // 创建一个测试学生（用上游 User 表，最小必填字段）
    testStudentId = `test-student-${Date.now()}`;
    await prisma.user.create({
        data: {
            id: testStudentId,
            email: `${testStudentId}@test.local`,
            password: 'test-password-hash',
            name: 'Test Student',
        },
    });
});

afterAll(async () => {
    // 清理本次测试创建的数据（不删种子）
    if (testStudentId) {
        await prisma.caseKnowledgeTag.deleteMany({
            where: { case: { studentId: testStudentId } },
        }).catch(() => {});
        await prisma.caseTextbookTopicTag.deleteMany({
            where: { case: { studentId: testStudentId } },
        }).catch(() => {});
        await prisma.caseAiResult.deleteMany({
            where: { case: { studentId: testStudentId } },
        }).catch(() => {});
        await prisma.artifact.deleteMany({
            where: { case: { studentId: testStudentId } },
        }).catch(() => {});
        await prisma.case.deleteMany({
            where: { studentId: testStudentId },
        }).catch(() => {});
        await prisma.studentNodeState.deleteMany({
            where: { studentId: testStudentId },
        }).catch(() => {});
        await prisma.user.deleteMany({
            where: { id: testStudentId },
        }).catch(() => {});
    }
    await prisma.$disconnect();
});

// ─── 辅助：创建测试 Case + AiResult + Tags 的完整路径 ─────────

async function setupCompleteCase(opts: {
    textbookTopicId?: string | null;
    audioStatus?: string;
    processingStatus?: string;
    withTextbookTag?: boolean;
    withKnowledgeTag?: boolean;
}): Promise<{ caseId: string; nodeId: string }> {
    const caseId = `case-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nodeId = `${TEST_NODE_ID_PREFIX}${Math.random().toString(36).slice(2, 8)}`;

    // 确保 KnowledgeNode 存在（如果不在种子数据中）
    // schema: id / name / layer / stage / judgeCriteria 必填
    await prisma.knowledgeNode.upsert({
        where: { id: nodeId },
        update: {},
        create: {
            id: nodeId,
            name: `测试节点 ${nodeId}`,
            layer: 'foundation',
            stage: 'test',
            judgeCriteria: 'test-criteria',
        },
    });

    // 模拟真实压缩后题图 base64（长度需 ≥200 字符，接近真实场景；
    // 之前用 41 字符占位导致 minContentLength=50 断言失败——测试数据 bug，非实现 bug）
    const fakeJpegBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(256);

    await prisma.case.create({
        data: {
            id: caseId,
            studentId: testStudentId,
            artifacts: {
                create: [
                    {
                        type: 'question_image',
                        content: fakeJpegBase64,
                        seq: 0,
                    },
                ],
            },
        },
    });

    await prisma.caseAiResult.create({
        data: {
            caseId,
            questionSummary: '测试题目摘要',
            transcript: opts.audioStatus === 'success' ? '我说了点东西' : null,
            textbookTopicId: opts.textbookTopicId ?? null,
            textbookTopicConfidence: opts.textbookTopicId ? 0.85 : 0,
            initialFeedback: '你把题目理清楚了',
            possibleMistakeReason: null,
            nextActionSuggestion: '回看 3.2 节相关内容',
            audioStatus: opts.audioStatus ?? 'skipped',
            processingStatus: opts.processingStatus ?? 'success',
        },
    });

    if (opts.withTextbookTag && opts.textbookTopicId) {
        await prisma.caseTextbookTopicTag.create({
            data: {
                caseId,
                textbookTopicId: opts.textbookTopicId,
                source: 'vlm',
                confidence: 0.85,
            },
        });
    }
    if (opts.withKnowledgeTag) {
        await prisma.caseKnowledgeTag.create({
            data: {
                caseId,
                nodeId,
                source: 'vlm',
                confidence: 0.85,
            },
        });
    }

    return { caseId, nodeId };
}

// ============================================================
// Case + Artifact 基础落库
// ============================================================

describe('db-verifier: Case + Artifact 落库', () => {
    test('caseCreated 验证 Case.id 和 studentId 落库正确', async () => {
        const { caseId } = await setupCompleteCase({});
        await verifier.caseCreated(caseId, { studentId: testStudentId });
    });

    test('caseCreated 在 Case 不存在时抛错', async () => {
        await expect(
            verifier.caseCreated('nonexistent-case-id', { studentId: testStudentId }),
        ).rejects.toThrow(/未找到/);
    });

    test('caseCreated 在 studentId 不匹配时抛错', async () => {
        const { caseId } = await setupCompleteCase({});
        await expect(
            verifier.caseCreated(caseId, { studentId: 'wrong-student' }),
        ).rejects.toThrow(/studentId 不匹配/);
    });

    test('artifactExists 验证 question_image Artifact 落库', async () => {
        const { caseId } = await setupCompleteCase({});
        await verifier.artifactExists(caseId, 'question_image', 50);
    });

    test('artifactExists 在 Artifact 不存在时抛错', async () => {
        const { caseId } = await setupCompleteCase({});
        await expect(verifier.artifactExists(caseId, 'audio_note')).rejects.toThrow(/未找到/);
    });
});

// ============================================================
// CaseAiResult 字段验证（CL-06/CL-14 关键）
// ============================================================

describe('db-verifier: CaseAiResult 字段（CL-06/CL-14）', () => {
    test('aiResultPersisted 验证完整成功路径（CL-06 7 字段）', async () => {
        const { caseId } = await setupCompleteCase({
            textbookTopicId: TEST_TB_ID,
            audioStatus: 'skipped',
            processingStatus: 'success',
        });
        await verifier.aiResultPersisted(caseId, {
            processingStatus: 'success',
            questionSummary: '测试题目摘要',
            textbookTopicId: TEST_TB_ID,
            initialFeedback: '你把题目理清楚了',
            nextActionSuggestion: '回看 3.2 节相关内容',
        });
    });

    test('aiResultPersisted 验证音频子失败路径（CL-14: success + audioStatus=failed）', async () => {
        const { caseId } = await setupCompleteCase({
            textbookTopicId: TEST_TB_ID,
            audioStatus: 'failed',
            processingStatus: 'success',
        });
        await verifier.aiResultPersisted(caseId, {
            processingStatus: 'success',
            audioStatus: 'failed',
        });
    });

    test('aiResultPersisted 验证整体失败路径（CL-14: processingStatus=failed）', async () => {
        const caseId = `case-fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await prisma.case.create({
            data: {
                id: caseId,
                studentId: testStudentId,
                aiResult: {
                    create: {
                        processingStatus: 'failed',
                        audioStatus: 'skipped',
                        error: 'AI 整理失败',
                    },
                },
            },
        });
        await verifier.aiResultPersisted(caseId, { processingStatus: 'failed' });
    });

    test('aiResultPersisted 验证低置信降级（CL-08: textbookTopicId=null）', async () => {
        const { caseId } = await setupCompleteCase({
            textbookTopicId: null,
        });
        await verifier.aiResultPersisted(caseId, { textbookTopicId: null });
    });

    test('aiResultPersisted 在 processingStatus 不匹配时抛错', async () => {
        const { caseId } = await setupCompleteCase({ processingStatus: 'success' });
        await expect(
            verifier.aiResultPersisted(caseId, { processingStatus: 'failed' }),
        ).rejects.toThrow(/processingStatus 不匹配/);
    });

    test('aiResultPersisted 在 textbookTopicId 期望 null 但实际非空时抛错（CL-08 违反）', async () => {
        const { caseId } = await setupCompleteCase({ textbookTopicId: TEST_TB_ID });
        await expect(
            verifier.aiResultPersisted(caseId, { textbookTopicId: null }),
        ).rejects.toThrow(/textbookTopicId 期望 null/);
    });
});

// ============================================================
// 双层分类标签（CL-07 + CL-08）
// ============================================================

describe('db-verifier: 双层分类标签（CL-07/CL-08）', () => {
    test('textbookTopicTagExists 验证 vlm 课本标签（CL-07）', async () => {
        const { caseId } = await setupCompleteCase({
            textbookTopicId: TEST_TB_ID,
            withTextbookTag: true,
        });
        await verifier.textbookTopicTagExists(caseId, 'vlm', TEST_TB_ID);
    });

    test('knowledgeTagExists 验证 vlm 系统节点标签（CL-07）', async () => {
        const { caseId, nodeId } = await setupCompleteCase({
            withKnowledgeTag: true,
        });
        await verifier.knowledgeTagExists(caseId, 'vlm', nodeId);
    });

    test('textbookTopicTagExists 在标签不存在时抛错', async () => {
        const { caseId } = await setupCompleteCase({}); // 无 tag
        await expect(
            verifier.textbookTopicTagExists(caseId, 'vlm'),
        ).rejects.toThrow(/未找到/);
    });

    test('knowledgeTagExists 在标签不存在时抛错', async () => {
        const { caseId } = await setupCompleteCase({}); // 无 tag
        await expect(
            verifier.knowledgeTagExists(caseId, 'vlm'),
        ).rejects.toThrow(/未找到/);
    });
});

// ============================================================
// StudentNodeState 不点亮（CL-12 关键）
// ============================================================

describe('db-verifier: StudentNodeState 不点亮（CL-12）', () => {
    test('countStudentNodeState 返回当前用户节点状态数量', async () => {
        const count = await verifier.countStudentNodeState(testStudentId);
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('noStudentNodeStateChange 在数量未变时通过', async () => {
        const beforeCount = await verifier.countStudentNodeState(testStudentId);
        // 不做任何会改变 StudentNodeState 的操作
        await verifier.noStudentNodeStateChange(testStudentId, beforeCount);
    });

    test('noStudentNodeStateChange 在数量增加时抛错（违反 CL-12）', async () => {
        const beforeCount = await verifier.countStudentNodeState(testStudentId);
        // 模拟违反：手动插入一条 StudentNodeState
        const nodeId = `${TEST_NODE_ID_PREFIX}violate-${Math.random().toString(36).slice(2, 8)}`;
        await prisma.knowledgeNode.upsert({
            where: { id: nodeId },
            update: {},
            create: {
                id: nodeId,
                name: `违反节点 ${nodeId}`,
                layer: 'foundation',
                stage: 'test',
                judgeCriteria: 'test-criteria',
            },
        });
        await prisma.studentNodeState.create({
            data: {
                studentId: testStudentId,
                nodeId,
                status: 'untested',
                masteryProb: 0,
            },
        });

        await expect(
            verifier.noStudentNodeStateChange(testStudentId, beforeCount),
        ).rejects.toThrow(/数量变化/);
    });

    test('allStudentNodeStateStatusLegal 在所有 status 合法时通过', async () => {
        // 上一条测试可能插入了 untested（合法），这条应该通过
        await verifier.allStudentNodeStateStatusLegal(testStudentId);
    });

    test('allStudentNodeStateStatusLegal 在出现 mastered 时抛错（CL-12 禁止）', async () => {
        const nodeId = `${TEST_NODE_ID_PREFIX}mastered-${Math.random().toString(36).slice(2, 8)}`;
        await prisma.knowledgeNode.upsert({
            where: { id: nodeId },
            update: {},
            create: {
                id: nodeId,
                name: `mastered 节点 ${nodeId}`,
                layer: 'foundation',
                stage: 'test',
                judgeCriteria: 'test-criteria',
            },
        });
        await prisma.studentNodeState.create({
            data: {
                studentId: testStudentId,
                nodeId,
                status: 'mastered', // 非法值
                masteryProb: 0.95,
            },
        });

        await expect(
            verifier.allStudentNodeStateStatusLegal(testStudentId),
        ).rejects.toThrow(/非法值/);
    });
});
