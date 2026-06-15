/**
 * 题单 API
 *
 * POST /api/diagnosis/session-items
 * body: { studentId, mainlineId }
 * → 创建 weekend DiagnosisSession → 取该主线 A 层 boundary 题 → 返回题单
 *
 * 题单分两层：
 * - items: 给学生做的题（无答案）
 * - answerKey: 给大人的答案页
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { selectBoundaryItems, ItemRecord } from "@/../lib/diagnosis-orchestrator";

const logger = createLogger('api:diagnosis:session-items');

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { studentId, mainlineId } = body;

    if (!studentId || !mainlineId) {
      return NextResponse.json(
        { error: "studentId, mainlineId 为必填" },
        { status: 400 }
      );
    }

    // 获取主线下所有 A 层节点
    const mainlineNodes = await prisma.nodeMainline.findMany({
      where: { mainlineId },
      select: { nodeId: true },
    });
    const mainlineNodeIds = mainlineNodes.map(n => n.nodeId);

    const allNodes = await prisma.knowledgeNode.findMany({
      where: { id: { in: mainlineNodeIds }, tier: 'A' },
      select: { id: true, name: true },
    });
    const aLayerNodeIds = new Set(allNodes.map(n => n.id));
    const nodeNames = new Map(allNodes.map(n => [n.id, n.name]));

    // 从 Item 表查 boundary 题
    const itemRows = await prisma.item.findMany({
      where: {
        nodeId: { in: Array.from(aLayerNodeIds) },
        role: 'boundary',
      },
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

    const selected = selectBoundaryItems(items);

    // 创建 DiagnosisSession
    const diagSession = await prisma.diagnosisSession.create({
      data: { studentId, kind: 'weekend' },
    });

    logger.info(`题单已生成: session=${diagSession.id}, ${selected.length} 题`);

    return NextResponse.json({
      sessionId: diagSession.id,
      studentId,
      mainlineId,
      // 给学生做的题单（无答案）
      items: selected.map(i => ({
        itemId: i.id,
        nodeId: i.nodeId,
        nodeName: nodeNames.get(i.nodeId) ?? i.nodeId,
        stem: i.stem,
      })),
      // 给大人的答案页
      answerKey: selected.map(i => ({
        itemId: i.id,
        nodeId: i.nodeId,
        answer: i.answer,
        analysis: i.analysis,
      })),
      itemCount: selected.length,
    }, { status: 201 });
  } catch (error) {
    logger.error('生成题单失败', error);
    return internalError();
  }
}
