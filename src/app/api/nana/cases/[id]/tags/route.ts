/**
 * GET  /api/nana/cases/:id/tags — 读取指定 case 的知识点标签
 * POST /api/nana/cases/:id/tags — 人工把 case 挂到一个知识点（source 恒 "manual"）
 *
 * 计划 §12.5 CaseKnowledgeTag API 契约。
 *
 * 安全（评审需求 #1 / #2）：
 * - GET/POST 都先过 Case.studentId 归属校验（findFirst {id, studentId}），
 *   命中不到一律 404（沿用 G1：不返回 403，避免 case id 枚举）。
 *   **绝不在无归属上下文时裸查 CaseKnowledgeTag**。
 * - POST 的 source 恒为 "manual"（服务端硬编码），**不接受 body 里的 source**，
 *   防止客户端伪造 vlm/asr 来源。VLM/ASR 来源由 Stage 3 服务端 /process 写入。
 * - nodeId 必须是 KnowledgeNode 表里真实存在的 id（防脏挂）。
 *
 * 错误：
 * - 401 未授权 / 400 nodeId 缺失或非法 / 404 case 不存在或不属于自己 / 409 已挂过
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import {
  tagCaseManually,
  listTagsForCase,
  CaseOwnershipError,
  CaseTagExistsError,
} from "@/lib/nana/case-classify";

const logger = createLogger('api:nana:cases:tags');

/**
 * GET /api/nana/cases/:id/tags
 * 响应 200: { tags: CaseKnowledgeTag[] }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;
    // 归属校验在 lib 内完成（评审需求 #1：绝不裸查）
    const tags = await listTagsForCase(id, session.user.id);
    return NextResponse.json({ tags });
  } catch (error) {
    if (error instanceof CaseOwnershipError) {
      return NextResponse.json({ error: "case 不存在" }, { status: 404 });
    }
    logger.error({ error }, '读取 case tags 失败');
    return internalError();
  }
}

/**
 * POST /api/nana/cases/:id/tags
 * 请求: { nodeId: string; note?: string }   // 注意：不接受 source（服务端恒 "manual"）
 * 响应 201: CaseKnowledgeTag
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;
    const body = await req.json();
    const { nodeId, note } = body ?? {};

    // ─── 入参校验 ───────────────────────────
    if (typeof nodeId !== "string" || nodeId.trim() === "") {
      return NextResponse.json(
        { error: "nodeId 缺失或非字符串" },
        { status: 400 },
      );
    }

    // nodeId 必须是真实存在的知识点（防脏挂；nodeId 为松挂接无 FK，故显式查）
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: nodeId },
      select: { id: true },
    });
    if (!node) {
      return NextResponse.json(
        { error: "知识点不存在" },
        { status: 400 },
      );
    }

    // ─── 挂载（归属校验 + 写入在 lib 内，source 恒 manual）─────────
    const tag = await tagCaseManually(id, nodeId, session.user.id, note);
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof CaseOwnershipError) {
      return NextResponse.json({ error: "case 不存在" }, { status: 404 });
    }
    if (error instanceof CaseTagExistsError) {
      return NextResponse.json(
        { error: "已挂过这个知识点" },
        { status: 409 },
      );
    }
    logger.error({ error }, '人工挂载知识点失败');
    return internalError();
  }
}
