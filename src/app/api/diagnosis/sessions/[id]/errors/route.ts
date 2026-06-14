/**
 * 错误归因记录 API
 *
 * POST /api/diagnosis/sessions/[id]/errors — 记录一条 Newman 归因结论
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:diagnosis:errors');

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
    const {
      mistakeId,
      nodeId,
      newmanStage,
      errorType,
      crossTag,
      rootNodeId,
      dialogueLog,
      evidenceRound,
      followUpVerified,
      confirmed,
    } = body;

    const record = await prisma.errorRecord.create({
      data: {
        sessionId,
        mistakeId: mistakeId ?? null,
        nodeId: nodeId ?? null,
        newmanStage: newmanStage ?? null,
        errorType: errorType ?? null,
        crossTag: crossTag ?? null,
        rootNodeId: rootNodeId ?? null,
        dialogueLog: dialogueLog ?? null,
        evidenceRound: evidenceRound ?? null,
        followUpVerified: followUpVerified ?? 'none',
        confirmed: confirmed ?? 'pending',
      },
    });

    logger.info(`归因记录已创建: ${record.id} (session=${sessionId}, stage=${newmanStage})`);

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    logger.error('创建归因记录失败', error);
    return internalError();
  }
}
