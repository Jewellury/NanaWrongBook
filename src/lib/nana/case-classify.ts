/**
 * Case 分类/挂载 lib（Stage 2 骨架）
 *
 * 对应计划 §12.6 分类 lib 契约、§7.1 CaseKnowledgeTag。
 * Stage 2：不接真 VLM/ASR（Stage 3 才接）。
 *
 * 设计决策（偏离记录 #1，见执行日志）：
 * - classifyCase 在 Stage 2 **不写 source="pending" 占位 tag**。
 *   理由：pending 表示"还不知道挂哪个节点"，没有 nodeId 可挂；
 *   "未分类"状态由「没有 tag」表达（列表 API 的 tagStatus="untagged"），
 *   比塞一行无意义的 pending 假数据干净。Stage 3 VLM 有候选时才写 source="vlm" 真标签。
 *
 * 安全（评审需求 #1 / #2）：
 * - 所有读/写 tag 的入口都先过 Case.studentId 归属校验（绝不裸查 CaseKnowledgeTag）。
 * - source 走白名单（assertValidSource）；tagCaseManually 恒用 "manual"，
 *   不接受外部传入的 source，防止客户端伪造 vlm/asr 来源。
 */
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger('lib:nana:case-classify');

// ─── source 白名单（评审需求 #2）──────────────────────
export const ALLOWED_SOURCES = new Set([
  "manual",
  "vlm",
  "asr",
  "rule",
  "pending",
] as const);

export type TagSource = "manual" | "vlm" | "asr" | "rule" | "pending";

/**
 * 校验 source 是否在白名单内；不在则抛错（评审需求 #2：代码层限制 + 测试覆盖）。
 */
export function assertValidSource(source: string): asserts source is TagSource {
  if (!ALLOWED_SOURCES.has(source as TagSource)) {
    throw new Error(`非法 tag source: ${source}`);
  }
}

// ─── 错误类型（供 API 层映射 HTTP 状态码）──────────────

/** Case 不存在或不属于当前用户 → API 映射 404（沿用 G1：不返回 403 避免 id 枚举） */
export class CaseOwnershipError extends Error {
  constructor(message = "case 不存在或不属于当前用户") {
    super(message);
    this.name = "CaseOwnershipError";
  }
}

/** 同 case 同节点同来源已挂过 → API 映射 409 Conflict */
export class CaseTagExistsError extends Error {
  constructor(message = "该知识点已挂过") {
    super(message);
    this.name = "CaseTagExistsError";
  }
}

// ─── 结果类型（§12.6）──────────────────────────────────

export interface ClassifyTag {
  nodeId: string;
  confidence: number;
  source: string;
  note?: string;
}

export interface ClassifyResult {
  tags: ClassifyTag[];
  status: "pending" | "done" | "failed";
  note?: string;
}

// ─── classifyCase（Stage 2：诚实返回 pending）──────────

/**
 * Stage 2 实现：不调 VLM，诚实返回 pending。
 * Stage 3b 会替换为真实 VLM 轻分类（DP6：只做"大致属于哪几个知识点"）。
 *
 * 不写占位 tag（见文件头设计决策）。
 */
export async function classifyCase(_caseId: string): Promise<ClassifyResult> {
  return {
    tags: [],
    status: "pending",
    note: "识别稍后接入",
  };
}

// ─── 归属校验内部辅助 ──────────────────────────────────

/**
 * 校验 case 归属：case 必须存在且 studentId === userId。
 * 不满足抛 CaseOwnershipError。绝不在无归属上下文时裸查/裸写 tag。
 */
async function assertCaseOwnership(caseId: string, userId: string): Promise<void> {
  const owned = await prisma.case.findFirst({
    where: { id: caseId, studentId: userId },
    select: { id: true },
  });
  if (!owned) {
    throw new CaseOwnershipError();
  }
}

// ─── tagCaseManually（人工挂知识点）────────────────────

/**
 * 人工把一道 case 挂到一个知识点。
 * - 恒用 source="manual"、confidence=1.0（不接受外部 source，防伪造）。
 * - 必先过归属校验（评审需求 #1）。
 * - 同 [caseId, nodeId, source] 唯一约束冲突 → 抛 CaseTagExistsError（API 映射 409）。
 *
 * 注意：nodeId 是否存在于 KnowledgeNode 由调用方（API 层）先行校验；
 * 本函数因 nodeId 为松挂接（无 FK），仅做归属 + 写入。
 */
export async function tagCaseManually(
  caseId: string,
  nodeId: string,
  userId: string,
  note?: string,
) {
  // source 恒为 manual（不接受外部传入）
  const source: TagSource = "manual";
  assertValidSource(source);

  await assertCaseOwnership(caseId, userId);

  try {
    const tag = await prisma.caseKnowledgeTag.create({
      data: {
        caseId,
        nodeId,
        source,
        confidence: 1.0,
        note: note ?? null,
      },
    });
    logger.info({ caseId, nodeId }, "人工挂载知识点成功");
    return tag;
  } catch (error) {
    // Prisma 唯一约束冲突（P2002）：同 case 同节点同来源已存在
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      throw new CaseTagExistsError();
    }
    throw error;
  }
}

// ─── listTagsForCase（读 tag，带归属校验）──────────────

/**
 * 读取一道 case 的所有 tag。必先过归属校验（评审需求 #1：绝不裸查）。
 */
export async function listTagsForCase(caseId: string, userId: string) {
  await assertCaseOwnership(caseId, userId);
  return prisma.caseKnowledgeTag.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
}
