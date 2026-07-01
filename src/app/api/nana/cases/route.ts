/**
 * POST /api/nana/cases — 创建新 case（采集壳的起点）
 *
 * 请求: { artifacts: Array<{ type, content, seq? }> }
 * 响应: 201 + case + artifacts
 * 错误: 400 artifacts 为空 / 400 校验失败（类型白名单/体积超限） / 401 未授权
 *
 * 最小校验（Phase 1.5 评审修正 G2）：
 * - type 白名单：["question_image","audio_note","audio_meta","transcript"]
 * - 单条 content 长度上限 2MB（覆盖 ~1.5MB Base64 图 + 余量）
 * - 单 case artifacts 条数上限 8
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
