/**
 * 诊断会话 API
 *
 * POST   /api/diagnosis/sessions  — 创建会话
 * GET    /api/diagnosis/sessions  — 列出会话（?studentId=xxx）
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:diagnosis:sessions');

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { studentId, kind } = body;

    if (!studentId || !kind) {
      return NextResponse.json(
        { error: "studentId 和 kind 为必填" },
        { status: 400 }
      );
    }

    if (!['initial', 'weekend'].includes(kind)) {
      return NextResponse.json(
        { error: 'kind 必须是 "initial" 或 "weekend"' },
        { status: 400 }
      );
    }

    const record = await prisma.diagnosisSession.create({
      data: { studentId, kind },
    });

    logger.info(`会话已创建: ${record.id} (kind=${kind})`);

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    logger.error('创建诊断会话失败', error);
    return internalError();
  }
}

export async function GET(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    const sessions = await prisma.diagnosisSession.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    logger.error('获取诊断会话列表失败', error);
    return internalError();
  }
}
