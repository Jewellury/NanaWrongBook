/**
 * 诊断会话详情 API
 *
 * GET /api/diagnosis/sessions/[id] — 获取单个会话 + 全部探针记录 + 全部错误记录
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:diagnosis:session-detail');

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;

    const record = await prisma.diagnosisSession.findUnique({
      where: { id },
      include: {
        records: { orderBy: { createdAt: 'asc' } },
        errors:  { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    logger.error({ error }, '获取诊断会话详情失败');
    return internalError();
  }
}
