/**
 * POST /api/nana/cases — 创建新 case（采集壳的起点）
 *
 * 请求: { artifacts: Array<{ type, content, seq? }> }
 * 响应: 201 + case + artifacts
 * 错误: 400 artifacts 为空 / 401 未授权
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:nana:cases');

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { artifacts } = body;

    if (!artifacts || !Array.isArray(artifacts) || artifacts.length === 0) {
      return NextResponse.json({ error: "artifacts 不能为空" }, { status: 400 });
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
