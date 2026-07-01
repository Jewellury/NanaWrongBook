/**
 * GET /api/nana/cases/:id — 读取指定 case 及其 artifacts
 *
 * 响应: 200 + case + artifacts
 * 错误: 404 case 不存在或不属于当前用户 / 401 未授权
 *
 * 归属校验（Phase 1.5 评审修正 G1）：
 * - findUnique({where:{id}}) → findFirst({where:{id, studentId}})
 * - 不存在或归属不匹配一律返回 404（不返回 403，避免 case id 枚举）
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
    // 归属校验（G1）：只允许读取属于自己的 case，命中不到一律 404
    const record = await prisma.case.findFirst({
      where: { id, studentId: session.user.id },
      include: { artifacts: { orderBy: { seq: 'asc' } } },
    });

    if (!record) {
      return NextResponse.json({ error: "case 不存在" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    logger.error({ error }, '读取 case 失败');
    return internalError();
  }
}
