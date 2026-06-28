/**
 * 纸质包选题 API
 *
 * GET /api/diagnosis/paper-pack?studentId=xxx[&maxItems=10][&maxNodes=4]
 * → 查 StudentNodeState → frontier 优先 + gap 补位 → 选 variant/drill 题
 *
 * 总量封顶 ~6-10 题，节点数封顶 3-4 个，避免"一片红"。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { KnowledgeGraph } from "@/../lib/graph";
import {
  selectPaperPackNodes,
  selectPracticeItems,
  ExistingState,
  ItemRecord,
} from "@/../lib/diagnosis-orchestrator";

const logger = createLogger('api:diagnosis:paper-pack');

const MAINLINE_WEIGHT: Record<string, number> = {
  M0: 0, M1: 10, M2a: 16, M3: 25.5, M5: 5, M8: 14.5,
  M4: 18.5, M2b: 10, M6: 20.5, M7: 29.5,
};

const ENCOURAGEMENTS = [
  "每天 10 分钟，慢慢变厉害 💪",
  "上次你已经跨过了第一关，这周继续 ✨",
  "不怕慢，就怕站。这周我们一起走一步 🌱",
];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const maxItems = parseInt(searchParams.get('maxItems') ?? '10', 10);
    const maxNodes = parseInt(searchParams.get('maxNodes') ?? '4', 10);

    if (!studentId) {
      return NextResponse.json({ error: "studentId 为必填" }, { status: 400 });
    }

    // ---- 1. 加载学生状态 ----
    const states = await prisma.studentNodeState.findMany({
      where: { studentId },
      select: { nodeId: true, status: true, masteryProb: true, lastEvidence: true },
    });
    const stateMap = new Map<string, ExistingState>();
    for (const s of states) {
      stateMap.set(s.nodeId, { status: s.status, masteryProb: s.masteryProb, lastEvidence: s.lastEvidence });
    }

    // ---- 2. 获取图谱和节点数据 ----
    const graph = await KnowledgeGraph.load(prisma);

    const allNodes = await prisma.knowledgeNode.findMany({
      select: { id: true, name: true, tier: true },
    });
    const allNodeIds = allNodes.map(n => n.id);

    const allNodeMainlines = await prisma.nodeMainline.findMany({
      select: { nodeId: true, mainlineId: true },
    });
    const nodeToML: Record<string, string[]> = {};
    for (const nm of allNodeMainlines) {
      if (!nodeToML[nm.nodeId]) nodeToML[nm.nodeId] = [];
      nodeToML[nm.nodeId].push(nm.mainlineId);
    }

    // ---- 3. 选节点：frontier 优先 + gap 补位 ----
    const selectedNodes = selectPaperPackNodes(
      graph, stateMap, allNodeIds, MAINLINE_WEIGHT, nodeToML, maxNodes,
    );

    if (selectedNodes.length === 0) {
      return NextResponse.json({
        studentId,
        studentName: '', // 由前端或后续查询填充
        generatedAt: new Date().toISOString(),
        totalItems: 0,
        encouragement: "这周已经练得很棒了，休息一下吧 🌟",
        groups: [],
        answerKey: [],
      });
    }

    const selectedNodeIds = selectedNodes.map(n => n.nodeId);

    // ---- 4. 选题目：variant 优先 → drill → boundary ----
    const itemRows = await prisma.item.findMany({
      where: { nodeId: { in: selectedNodeIds } },
      select: { id: true, nodeId: true, role: true, stem: true, answer: true, analysis: true },
    });

    const items: ItemRecord[] = itemRows.map(r => ({
      id: r.id,
      nodeId: r.nodeId,
      role: r.role,
      stem: r.stem,
      answer: r.answer,
      analysis: r.analysis,
    }));

    const practiceItems = selectPracticeItems(items, selectedNodeIds, maxItems);

    // ---- 5. 组装返回 ----
    const nodeNames = new Map(allNodes.map(n => [n.id, n.name]));
    const groups = selectedNodes.map(n => ({
      nodeId: n.nodeId,
      nodeName: nodeNames.get(n.nodeId) ?? n.nodeId,
      reason: n.reason,
      practiceItems: practiceItems
        .filter(pi => pi.nodeId === n.nodeId)
        .map(pi => ({ itemId: pi.itemId, stem: pi.stem, role: pi.role })),
    })).filter(g => g.practiceItems.length > 0);

    const answerKey = items
      .filter(i => practiceItems.some(pi => pi.itemId === i.id))
      .map(i => ({ itemId: i.id, answer: i.answer, analysis: i.analysis }));

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { name: true },
    });

    const encouragement = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

    logger.info(`纸质包已生成: student=${studentId}, ${groups.length} 节点, ${practiceItems.length} 题`);

    return NextResponse.json({
      studentId,
      studentName: student?.name ?? '',
      generatedAt: new Date().toISOString(),
      totalItems: practiceItems.length,
      encouragement,
      groups,
      answerKey,
    });
  } catch (error) {
    logger.error({ error }, '纸质包生成失败');
    return internalError();
  }
}
