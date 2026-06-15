/**
 * 答案提交 API
 *
 * POST /api/diagnosis/submit-answers
 * body: { sessionId, studentId, mainlineId, answers: [{ nodeId, itemId, correct }] }
 * → 作答节点 BKT（从既有先验出发） + 未作答节点 KST 传播 → 持久化
 *
 * 核心原则：一道题 = 一份证据。BKT 不吃 KST 的输出。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { KnowledgeGraph } from "@/../lib/graph";
import {
  applyBKTToAnswers,
  propagateKSTToUnanswered,
  ExistingState,
  AnswerEntry,
} from "@/../lib/diagnosis-orchestrator";

const logger = createLogger('api:diagnosis:submit-answers');

const MAINLINE_WEIGHT: Record<string, number> = {
  M0: 0, M1: 10, M2a: 16, M3: 25.5, M5: 5, M8: 14.5,
  M4: 18.5, M2b: 10, M6: 20.5, M7: 29.5,
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { sessionId, studentId, mainlineId, answers } = body;

    if (!sessionId || !studentId || !mainlineId || !answers) {
      return NextResponse.json(
        { error: "sessionId, studentId, mainlineId, answers 为必填" },
        { status: 400 }
      );
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: "answers 不能为空" }, { status: 400 });
    }

    // 验证 session 存在
    const diagSession = await prisma.diagnosisSession.findUnique({
      where: { id: sessionId },
    });
    if (!diagSession) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    // 判断跨 session T
    const previousSessions = await prisma.diagnosisSession.findMany({
      where: {
        studentId,
        id: { not: sessionId },
        kind: { in: ['initial', 'weekend'] },
      },
      orderBy: { startedAt: 'desc' },
      take: 1,
    });
    const crossSessionT = previousSessions.length > 0 ? 0.15 : 0;

    // ---- 1. 加载现有 StudentNodeState ----
    const existingRows = await prisma.studentNodeState.findMany({
      where: { studentId },
      select: { nodeId: true, status: true, masteryProb: true, lastEvidence: true },
    });
    const existingStates = new Map<string, ExistingState>();
    for (const row of existingRows) {
      existingStates.set(row.nodeId, {
        status: row.status,
        masteryProb: row.masteryProb,
        lastEvidence: row.lastEvidence,
      });
    }

    const answerEntries: AnswerEntry[] = answers.map(a => ({
      nodeId: a.nodeId,
      itemId: a.itemId,
      correct: a.correct,
    }));

    // ---- 2. BKT：作答节点从既有先验出发 ----
    const bktResults = applyBKTToAnswers(existingStates, answerEntries, {
      G: 0.20,
      S: 0.10,
      crossSessionT,
    });
    const answeredNodeIds = new Set(bktResults.keys());

    // ---- 3. KST：只传播未作答节点 ----
    const mainlineNodes = await prisma.nodeMainline.findMany({
      where: { mainlineId },
      select: { nodeId: true },
    });
    const mainlineNodeIds = mainlineNodes.map(n => n.nodeId);

    const allNodes = await prisma.knowledgeNode.findMany({
      select: { id: true, tier: true },
    });
    const nodeTiers: Record<string, string | null> = {};
    for (const n of allNodes) nodeTiers[n.id] = n.tier;

    const graph = await KnowledgeGraph.load(prisma);

    const kstResults = propagateKSTToUnanswered(
      graph,
      mainlineNodeIds,
      answeredNodeIds,
      answerEntries,
      nodeTiers,
    );

    // ---- 4. 合并：BKT > KST > untested 默认 ----
    const allAffectedNodeIds = new Set<string>();
    for (const id of bktResults.keys()) allAffectedNodeIds.add(id);
    for (const id of kstResults.keys()) allAffectedNodeIds.add(id);

    const finalStates = new Map<string, { status: string; masteryProb: number }>();

    for (const nodeId of allAffectedNodeIds) {
      // BKT 优先（作答节点）
      const bkt = bktResults.get(nodeId);
      if (bkt) {
        finalStates.set(nodeId, bkt);
        continue;
      }
      // KST 次之（未作答但被传播）
      const kst = kstResults.get(nodeId);
      if (kst) {
        finalStates.set(nodeId, kst);
        continue;
      }
    }

    // ---- 5. 写入 StudentNodeState（upsert）----
    let upsertCount = 0;
    for (const [nodeId, state] of finalStates) {
      await prisma.studentNodeState.upsert({
        where: { studentId_nodeId: { studentId, nodeId } },
        update: {
          status: state.status,
          masteryProb: state.masteryProb,
          lastEvidence: new Date(),
        },
        create: {
          studentId,
          nodeId,
          status: state.status,
          masteryProb: state.masteryProb,
        },
      });
      upsertCount++;
    }

    // ---- 6. 为每个答案创建 ProbeRecord ----
    for (const a of answerEntries) {
      await prisma.probeRecord.create({
        data: {
          sessionId,
          nodeId: a.nodeId,
          itemId: a.itemId,
          correct: a.correct,
        },
      });
    }

    // ---- 7. 计算学习前沿 ----
    const allMainlineNodeIds = new Set(mainlineNodeIds);
    for (const id of allAffectedNodeIds) allMainlineNodeIds.add(id);

    const allStates = new Map(existingStates);
    for (const [id, s] of finalStates) allStates.set(id, s);

    const allMainNodes = await prisma.knowledgeNode.findMany({
      where: { id: { in: Array.from(allMainlineNodeIds) } },
      select: { id: true, tier: true },
    });

    const allNodeMainlines = await prisma.nodeMainline.findMany({
      select: { nodeId: true, mainlineId: true },
    });
    const nodeToML: Record<string, string[]> = {};
    for (const nm of allNodeMainlines) {
      if (!nodeToML[nm.nodeId]) nodeToML[nm.nodeId] = [];
      nodeToML[nm.nodeId].push(nm.mainlineId);
    }

    const frontierCandidates: { nodeId: string; tier: string; weight: number }[] = [];
    for (const node of allMainNodes) {
      const state = allStates.get(node.id);
      const status = state?.status ?? 'untested';
      if (status === 'stable') continue;

      const prereqs = graph.prereqsOf(node.id);
      const allStable = prereqs.every(p => {
        const ps = allStates.get(p.id);
        return ps?.status === 'stable';
      });
      if (!allStable) continue;
      if (node.tier && node.tier !== 'A') continue;

      const mlIds = nodeToML[node.id] ?? [];
      const maxWeight = mlIds.length > 0
        ? Math.max(...mlIds.map(m => MAINLINE_WEIGHT[m] ?? 0))
        : 0;

      frontierCandidates.push({ nodeId: node.id, tier: node.tier ?? 'C', weight: maxWeight });
    }

    const tierOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    frontierCandidates.sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
      return b.weight - a.weight;
    });
    const learningFrontier = frontierCandidates.slice(0, 2).map(f => f.nodeId);

    logger.info(`答案已提交: session=${sessionId}, 更新 ${upsertCount} 节点，前沿 ${learningFrontier.length}`);

    return NextResponse.json({
      sessionId,
      nodeStates: Array.from(finalStates.entries()).map(([nodeId, state]) => ({
        nodeId,
        ...state,
      })),
      learningFrontier,
      stats: { updatedNodes: upsertCount, answersRecorded: answerEntries.length },
    });
  } catch (error) {
    logger.error('答案提交失败', error);
    return internalError();
  }
}
