/**
 * 探针记录 API
 *
 * POST /api/diagnosis/sessions/[id]/probes — 记录一道探针题的作答
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:diagnosis:probes');

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id: sessionId } = await params;

    // 确认会话存在
    const diagSession = await prisma.diagnosisSession.findUnique({
      where: { id: sessionId },
    });
    if (!diagSession) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    const body = await req.json();
    const { itemId, nodeId, correct, durationS } = body;

    if (correct === undefined) {
      return NextResponse.json(
        { error: "correct 为必填（布尔值）" },
        { status: 400 }
      );
    }

    const record = await prisma.probeRecord.create({
      data: {
        sessionId,
        itemId: itemId ?? null,
        nodeId: nodeId ?? null,
        correct,
        durationS: durationS ?? null,
      },
    });

    logger.info(`探针记录已创建: ${record.id} (session=${sessionId}, correct=${correct})`);

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    logger.error('创建探针记录失败', error);
    return internalError();
  }
}
