/**
 * POST /api/nana/cases/:id/feedback — 单题轻反馈（规则版，不调 LLM）
 *
 * 请求:
 *   { transcript: string; aiSummary?: string }
 *
 * 响应 (200):
 *   { hint: string; relatedTags: string[]; isPreliminary: true }
 *
 * 错误:
 *   400 — transcript 缺失
 *   401 — 未授权
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getFeedback } from "@/lib/nana/feedback-rules";

const logger = createLogger("api:nana:feedback");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { transcript } = body;

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "transcript 不能为空" },
        { status: 400 },
      );
    }

    const result = getFeedback(transcript);

    logger.info(
      { caseId: (await params).id, hintLength: result.hint.length },
      "轻反馈生成成功",
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error({ error }, "轻反馈生成失败");
    return internalError();
  }
}
