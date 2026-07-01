/**
 * POST /api/nana/cases — 创建新 case（采集壳的起点）
 * GET  /api/nana/cases — 列出当前用户的最近 case（Stage 1 新增）
 *
 * POST 请求: { artifacts: Array<{ type, content, seq? }> }
 * POST 响应: 201 + case + artifacts
 * GET  响应: 200 + { cases: CaseListItem[], total }
 * 错误: 400 artifacts 为空 / 400 校验失败（类型白名单/体积超限） / 401 未授权
 *
 * 最小校验（Phase 1.5 评审修正 G2）：
 * - type 白名单：["question_image","audio_note","audio_meta","transcript"]
 * - 单条 content 长度上限 2MB（覆盖 ~1.5MB Base64 图 + 余量）
 * - 单 case artifacts 条数上限 8
 *
 * GET 列表（S1-3）：
 * - 归属过滤：只返回 session.user.id 自己的 case（沿用 G1 思路）
 * - 体积注意（§12.2）：不返回完整 base64 题图，仅返回 hasImage 标志；
 *   完整题图走 GET /api/nana/cases/[id]
 * - 默认最近 50 条，createdAt 倒序
 * - Stage 1：tagCount 恒 0，tagStatus 恒 "untagged"，transcriptReady 恒 false
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:nana:cases');

// ─── 校验常量（G2）─────────────────────────────
const ALLOWED_TYPES = new Set([
  "question_image",
  "audio_note",
  "audio_meta",
  "transcript",
]);
const MAX_CONTENT_LEN = 2 * 1024 * 1024; // 单条 content 2MB
const MAX_ARTIFACTS = 8; // 单 case artifact 条数上限
const LIST_LIMIT = 50; // 列表默认返回条数

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    // 归属过滤（G1）：只查自己的 case；不 select content，避免列表爆体积
    const cases = await prisma.case.findMany({
      where: { studentId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        createdAt: true,
        artifacts: { select: { type: true } },
      },
    });

    const result = cases.map((c) => {
      const types = new Set(c.artifacts.map((a) => a.type));
      const hasImage = types.has('question_image');
      const hasAudio = types.has('audio_note');
      return {
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        hasImage,
        hasAudio,
        // Stage 1：无 CaseKnowledgeTag 表、无 ASR/VLM，恒为这些值
        tagCount: 0,
        tagStatus: 'untagged' as const,
        transcriptReady: false,
      };
    });

    return NextResponse.json({ cases: result, total: result.length });
  } catch (error) {
    logger.error({ error }, '列出 case 失败');
    return internalError();
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { artifacts } = body;

    if (!artifacts || !Array.isArray(artifacts) || artifacts.length === 0) {
      return NextResponse.json({ error: "artifacts 不能为空" }, { status: 400 });
    }

    // ─── G2 最小校验 ───────────────────────────
    if (artifacts.length > MAX_ARTIFACTS) {
      return NextResponse.json(
        { error: `artifacts 条数超过 ${MAX_ARTIFACTS}` },
        { status: 400 },
      );
    }
    for (const a of artifacts) {
      const artifact = a as { type?: string; content?: unknown };
      if (!artifact.type || !ALLOWED_TYPES.has(artifact.type)) {
        return NextResponse.json(
          { error: `非法 artifact type: ${String(artifact.type)}` },
          { status: 400 },
        );
      }
      if (typeof artifact.content !== "string" || artifact.content.length > MAX_CONTENT_LEN) {
        return NextResponse.json(
          { error: "artifact content 过大或非字符串" },
          { status: 400 },
        );
      }
    }

    const record = await prisma.case.create({
      data: {
        studentId: session.user.id,
        artifacts: {
          create: artifacts.map((a: { type: string; content: string; seq?: number }) => ({
            type: a.type,
            content: a.content,
            seq: a.seq ?? 0,
          })),
        },
      },
      include: { artifacts: true },
    });

    logger.info(`case 创建成功: ${record.id}`);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    logger.error({ error }, '创建 case 失败');
    return internalError();
  }
}
