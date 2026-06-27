/**
 * GET /api/nana/cases/:id — 读取指定 case 及其 artifacts
 *
 * 响应: 200 + case + artifacts
 * 错误: 404 case 不存在 / 401 未授权
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:nana:cases:read');

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;
    const record = await prisma.case.findUnique({
      where: { id },
      include: { artifacts: { orderBy: { seq: 'asc' } } },
    });

    if (!record) {
      return NextResponse.json({ error: "case 不存在" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    logger.error('读取 case 失败', error);
    return internalError();
  }
}
