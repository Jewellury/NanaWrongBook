/**
 * 初诊 API
 *
 * POST /api/diagnosis/initial
 * body: { studentId, mainlineId, answers: [{ nodeId, correct }] }
 * → 触发 KST-lite → 更新 StudentNodeState → 创建 DiagnosisSession
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { KnowledgeGraph } from "@/../lib/graph";
import { runKST } from "@/../lib/kst-lite";

const logger = createLogger('api:diagnosis:initial');

const MAINLINE_WEIGHT: Record<string, number> = {
  M0: 0, M1: 10, M2a: 16, M3: 25.5, M5: 5, M8: 14.5,
  M4: 18.5, M2b: 10, M6: 20.5, M7: 29.5,
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { studentId, mainlineId, answers } = body;

    if (!studentId || !mainlineId || !answers) {
      return NextResponse.json(
        { error: "studentId, mainlineId, answers 为必填" },
        { status: 400 }
      );
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: "answers 不能为空" }, { status: 400 });
    }

    // 获取主线下所有 A 层节点
    const mainlineNodes = await prisma.nodeMainline.findMany({
      where: { mainlineId },
      select: { nodeId: true },
    });
    const mainlineNodeIds = mainlineNodes.map(n => n.nodeId);

    // 获取节点 tier 和主线映射
    const allNodes = await prisma.knowledgeNode.findMany({
      select: { id: true, tier: true },
    });
    const nodeTiers: Record<string, string | null> = {};
    for (const n of allNodes) nodeTiers[n.id] = n.tier;

    const allNodeMainlines = await prisma.nodeMainline.findMany({
      select: { nodeId: true, mainlineId: true },
    });
    const nodeToMainlines: Record<string, string[]> = {};
    for (const nm of allNodeMainlines) {
      if (!nodeToMainlines[nm.nodeId]) nodeToMainlines[nm.nodeId] = [];
      nodeToMainlines[nm.nodeId].push(nm.mainlineId);
    }

    // 加载图谱 + 运行 KST-lite
    const graph = await KnowledgeGraph.load(prisma);
    const result = runKST(graph, {
      mainlineNodeIds,
      answers,
      nodeTiers,
      mainlineWeights: MAINLINE_WEIGHT,
      nodeToMainlines,
    });

    // 创建 DiagnosisSession
    const diagSession = await prisma.diagnosisSession.create({
      data: { studentId, kind: 'initial' },
    });

    // 写入 StudentNodeState（upsert）
    let upsertCount = 0;
    for (const [nodeId, state] of result.nodeStates) {
      await prisma.studentNodeState.upsert({
        where: { studentId_nodeId: { studentId, nodeId } },
        update: { status: state.status, masteryProb: state.masteryProb, lastEvidence: new Date() },
        create: { studentId, nodeId, status: state.status, masteryProb: state.masteryProb },
      });
      upsertCount++;
    }

    // 为每个答案创建 ProbeRecord
    for (const a of answers) {
      await prisma.probeRecord.create({
        data: {
          sessionId: diagSession.id,
          nodeId: a.nodeId,
          correct: a.correct,
        },
      });
    }

    logger.info(`初诊完成: session=${diagSession.id}, 更新 ${upsertCount} 节点状态`);

    return NextResponse.json({
      session: diagSession,
      nodeStates: Array.from(result.nodeStates.entries()).map(([nodeId, state]) => ({
        nodeId,
        ...state,
      })),
      learningFrontier: result.learningFrontier,
    }, { status: 201 });
  } catch (error) {
    logger.error('初诊失败', error);
    return internalError();
  }
}
