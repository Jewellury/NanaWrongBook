/**
 * 数据库验证工具（r3.1 任务 2.3）
 *
 * 用 Prisma Client 直连测试 SQLite 数据库，验证 /process 路径落库结果。
 * 双层分类契约验证：
 *   - 孩子操作层（TextbookTopic）：CaseTextbookTopicTag
 *   - 系统验证层（KnowledgeNode）：CaseKnowledgeTag
 *
 * 关键修正（FREEZE-001 + r3.1）：
 *   1. processingStatus 在 CaseAiResult 上，不在 Case 上（Case 表无此字段）
 *   2. StudentNodeState.status 合法值：stable | uncertain | gap | untested（无 mastered）
 *   3. v1 不点亮节点：拍题过程不新增/更新 StudentNodeState（FREEZE-001 §9.1 CL-12）
 *   4. 用户历史已有的 StudentNodeState（可能来自小检查等其它路径）保留不动
 *
 * 使用方式：
 *   import { createDbVerifier } from './db-verifier';
 *   const verify = createDbVerifier(prisma);
 *   await verify.caseCreated(caseId, { studentId, ... });
 *   await verify.aiResultPersisted(caseId, { processingStatus: 'success', ... });
 *   await verify.noStudentNodeStateChange(studentId, beforeCount);
 */

import { PrismaClient } from '@prisma/client';

// ─── 类型：期望的 AI 结果字段（partial，测试用） ───────────────────────

export interface AiResultExpected {
    processingStatus?: 'success' | 'failed' | 'timeout' | 'pending';
    questionSummary?: string | null;
    transcript?: string | null;
    textbookTopicId?: string | null;
    initialFeedback?: string | null;
    possibleMistakeReason?: string | null;
    nextActionSuggestion?: string | null;
    audioStatus?: 'success' | 'skipped' | 'failed' | 'timeout';
}

// ─── 工厂 ─────────────────────────────────────────

export interface DbVerifier {
    /** Case + studentId + createdAt 落库（无 processingStatus——它在 CaseAiResult 上） */
    caseCreated(caseId: string, expected: { studentId: string }): Promise<void>;
    /** CaseAiResult 字段落库（关键字段：processingStatus 在此） */
    aiResultPersisted(caseId: string, expected: AiResultExpected): Promise<void>;
    /** 孩子操作层标签：CaseTextbookTopicTag 存在 */
    textbookTopicTagExists(
        caseId: string,
        source: string,
        textbookTopicId?: string,
    ): Promise<void>;
    /** 系统验证层标签：CaseKnowledgeTag 存在 */
    knowledgeTagExists(
        caseId: string,
        source: string,
        nodeId?: string,
    ): Promise<void>;
    /** Artifact 写入（type=question_image / audio_note / audio_meta / transcript） */
    artifactExists(caseId: string, type: string, minContentLength?: number): Promise<void>;
    /** v1 不点亮节点：拍题前后 StudentNodeState 数量不变（已有的保留） */
    noStudentNodeStateChange(studentId: string, beforeCount: number): Promise<void>;
    /** 工具：读取当前用户 StudentNodeState 数量（spec before 阶段调用） */
    countStudentNodeState(studentId: string): Promise<number>;
    /** 工具：断言用户全部 StudentNodeState.status 合法（无 mastered） */
    allStudentNodeStateStatusLegal(studentId: string): Promise<void>;
}

export function createDbVerifier(prisma: PrismaClient): DbVerifier {
    return {
        async caseCreated(caseId, expected) {
            const case_ = await prisma.case.findUnique({ where: { id: caseId } });
            if (!case_) {
                throw new Error(`db-verifier: Case ${caseId} 未找到`);
            }
            if (case_.studentId !== expected.studentId) {
                throw new Error(
                    `db-verifier: Case.studentId 不匹配（期望 ${expected.studentId}，实际 ${case_.studentId}）`,
                );
            }
            // Case 表无 processingStatus——在 CaseAiResult 上（铁律修正）
        },

        async aiResultPersisted(caseId, expected) {
            const aiResult = await prisma.caseAiResult.findUnique({
                where: { caseId },
            });
            if (!aiResult) {
                throw new Error(`db-verifier: CaseAiResult for case ${caseId} 未找到`);
            }
            if (expected.processingStatus && aiResult.processingStatus !== expected.processingStatus) {
                throw new Error(
                    `db-verifier: processingStatus 不匹配（期望 ${expected.processingStatus}，实际 ${aiResult.processingStatus}）`,
                );
            }
            if (expected.audioStatus && aiResult.audioStatus !== expected.audioStatus) {
                throw new Error(
                    `db-verifier: audioStatus 不匹配（期望 ${expected.audioStatus}，实际 ${aiResult.audioStatus}）`,
                );
            }
            if (expected.questionSummary !== undefined) {
                if (expected.questionSummary === null) {
                    if (aiResult.questionSummary !== null) {
                        throw new Error(
                            `db-verifier: questionSummary 期望为 null，实际 ${aiResult.questionSummary}`,
                        );
                    }
                } else if (!aiResult.questionSummary) {
                    throw new Error(`db-verifier: questionSummary 期望非空，实际为 null/空`);
                }
            }
            if (expected.transcript !== undefined) {
                if (expected.transcript === null) {
                    if (aiResult.transcript !== null) {
                        throw new Error(
                            `db-verifier: transcript 期望为 null，实际 ${aiResult.transcript}`,
                        );
                    }
                } else if (!aiResult.transcript) {
                    throw new Error(`db-verifier: transcript 期望非空，实际为 null/空`);
                }
            }
            if (expected.textbookTopicId !== undefined) {
                if (expected.textbookTopicId === null) {
                    if (aiResult.textbookTopicId !== null) {
                        throw new Error(
                            `db-verifier: textbookTopicId 期望 null（CL-08 低置信降级），实际 ${aiResult.textbookTopicId}`,
                        );
                    }
                } else if (aiResult.textbookTopicId !== expected.textbookTopicId) {
                    throw new Error(
                        `db-verifier: textbookTopicId 不匹配（期望 ${expected.textbookTopicId}，实际 ${aiResult.textbookTopicId}）`,
                    );
                }
            }
            if (expected.initialFeedback !== undefined && expected.initialFeedback !== null) {
                if (!aiResult.initialFeedback) {
                    throw new Error(`db-verifier: initialFeedback 期望非空，实际为 null/空`);
                }
            }
            if (expected.nextActionSuggestion !== undefined && expected.nextActionSuggestion !== null) {
                if (!aiResult.nextActionSuggestion) {
                    throw new Error(`db-verifier: nextActionSuggestion 期望非空，实际为 null/空`);
                }
            }
            // possibleMistakeReason 允许为空（CL-06），只在明确期望非空时检查
            if (expected.possibleMistakeReason !== undefined && expected.possibleMistakeReason !== null) {
                if (!aiResult.possibleMistakeReason) {
                    throw new Error(`db-verifier: possibleMistakeReason 期望非空，实际为 null/空`);
                }
            }
        },

        async textbookTopicTagExists(caseId, source, textbookTopicId) {
            const where: { caseId: string; source: string; textbookTopicId?: string } = {
                caseId,
                source,
            };
            if (textbookTopicId) where.textbookTopicId = textbookTopicId;
            const tag = await prisma.caseTextbookTopicTag.findFirst({ where });
            if (!tag) {
                throw new Error(
                    `db-verifier: CaseTextbookTopicTag 未找到（caseId=${caseId}, source=${source}${textbookTopicId ? `, textbookTopicId=${textbookTopicId}` : ''}）`,
                );
            }
        },

        async knowledgeTagExists(caseId, source, nodeId) {
            const where: { caseId: string; source: string; nodeId?: string } = {
                caseId,
                source,
            };
            if (nodeId) where.nodeId = nodeId;
            const tag = await prisma.caseKnowledgeTag.findFirst({ where });
            if (!tag) {
                throw new Error(
                    `db-verifier: CaseKnowledgeTag 未找到（caseId=${caseId}, source=${source}${nodeId ? `, nodeId=${nodeId}` : ''}）`,
                );
            }
        },

        async artifactExists(caseId, type, minContentLength) {
            const artifact = await prisma.artifact.findFirst({
                where: { caseId, type },
            });
            if (!artifact) {
                throw new Error(
                    `db-verifier: Artifact 未找到（caseId=${caseId}, type=${type}）`,
                );
            }
            if (minContentLength !== undefined && artifact.content.length < minContentLength) {
                throw new Error(
                    `db-verifier: Artifact content 过短（type=${type}, length=${artifact.content.length}, 最小期望 ${minContentLength}）`,
                );
            }
        },

        async noStudentNodeStateChange(studentId, beforeCount) {
            // FREEZE-001 §9.1 CL-12：v1 不点亮节点，本次拍题不新增/更新 StudentNodeState
            const afterCount = await prisma.studentNodeState.count({
                where: { studentId },
            });
            if (afterCount !== beforeCount) {
                throw new Error(
                    `db-verifier: StudentNodeState 数量变化（beforeCount=${beforeCount}, afterCount=${afterCount}）——违反 CL-12 不点亮节点约束`,
                );
            }
        },

        async countStudentNodeState(studentId) {
            return prisma.studentNodeState.count({ where: { studentId } });
        },

        async allStudentNodeStateStatusLegal(studentId) {
            // 合法值：stable | uncertain | gap | untested（无 mastered）
            const illegal = await prisma.studentNodeState.findMany({
                where: {
                    studentId,
                    status: { notIn: ['stable', 'uncertain', 'gap', 'untested'] },
                },
                select: { nodeId: true, status: true },
            });
            if (illegal.length > 0) {
                throw new Error(
                    `db-verifier: StudentNodeState.status 出现非法值（${JSON.stringify(illegal)}）——合法值 stable|uncertain|gap|untested`,
                );
            }
        },
    };
}
