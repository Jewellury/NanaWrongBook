/**
 * 知识地图 API
 *
 * GET /api/diagnosis/map?studentId=xxx[&mainlineId=M1]
 * → 返回学生全部节点的状态 + 学习前沿（最多 1-2，tier→权重排序截断）
 * + 全量边（edges） + 主线定义（mainlines）+ 详情卡字段
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { KnowledgeGraph } from "@/../lib/graph";

const logger = createLogger('api:diagnosis:map');

// 主线高考权重（对应 TECH_PLAN_v2 §3.1）
const MAINLINE_WEIGHT: Record<string, number> = {
  M0: 0, M1: 10, M2a: 16, M3: 25.5, M5: 5, M8: 14.5,
  M4: 18.5, M2b: 10, M6: 20.5, M7: 29.5,
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const mainlineId = searchParams.get('mainlineId');

    if (!studentId) {
      return NextResponse.json({ error: "studentId 为必填" }, { status: 400 });
    }

    // 查询该学生的全部节点状态
    const states = await prisma.studentNodeState.findMany({
      where: { studentId },
      select: { nodeId: true, status: true, masteryProb: true, lastEvidence: true },
    });

    const stateMap = new Map(states.map(s => [s.nodeId, s]));

    // 查询所有节点（含详情卡字段）
    const nodes = await prisma.knowledgeNode.findMany({
      select: {
        id: true, name: true, layer: true, tier: true,
        judgeCriteria: true, sampleItem: true, teachingNotes: true,
      },
      where: mainlineId ? {
        mainlines: { some: { mainlineId } },
      } : undefined,
    });

    // 获取节点的主线归属
    const nodeMainlines = await prisma.nodeMainline.findMany({
      where: mainlineId ? { mainlineId } : undefined,
      select: { nodeId: true, mainlineId: true },
    });

    const nodeToML: Record<string, string[]> = {};
    const mlNodeMap: Record<string, string[]> = {};
    for (const nm of nodeMainlines) {
      if (!nodeToML[nm.nodeId]) nodeToML[nm.nodeId] = [];
      nodeToML[nm.nodeId].push(nm.mainlineId);
      if (!mlNodeMap[nm.mainlineId]) mlNodeMap[nm.mainlineId] = [];
      mlNodeMap[nm.mainlineId].push(nm.nodeId);
    }

    // ---- 查询全量边 ----
    const edgeRows = await prisma.knowledgeEdge.findMany({
      select: { sourceId: true, targetId: true, type: true },
    });

    let edges: Array<{ sourceId: string; targetId: string; type: "prerequisite" | "tool" }>
      = edgeRows.map(e => ({
        sourceId: e.sourceId,
        targetId: e.targetId,
        type: e.type as "prerequisite" | "tool",
      }));

    // mainlineId 筛选时只保留两端都在当前 nodes 内的边
    if (mainlineId) {
      const nodeIdSet = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId));
    }

    // ---- 查询主线定义 ----
    const mainlineRows = await prisma.mainline.findMany({
      select: { id: true, name: true, priority: true },
      ...(mainlineId ? { where: { id: mainlineId } } : {}),
    });

    const mainlines = mainlineRows.map(m => ({
      mainlineId: m.id,
      name: m.name,
      priority: m.priority,
      nodeIds: mlNodeMap[m.id] ?? [],
    }));

    // 构建学习前沿
    const graph = await KnowledgeGraph.load(prisma);

    const frontierCandidates: { nodeId: string; tier: string; weight: number }[] = [];

    for (const node of nodes) {
      const state = stateMap.get(node.id);
      const status = state?.status ?? 'untested';

      if (status === 'stable') continue;

      // 前置是否全 stable
      const prereqs = graph.prereqsOf(node.id);
      const allStable = prereqs.every(p => {
        const ps = stateMap.get(p.id);
        return ps?.status === 'stable';
      });
      if (!allStable) continue;

      // 只 A 层进前沿
      if (node.tier && node.tier !== 'A') continue;

      const mlIds = nodeToML[node.id] ?? [];
      const maxWeight = mlIds.length > 0
        ? Math.max(...mlIds.map(m => MAINLINE_WEIGHT[m] ?? 0))
        : 0;

      frontierCandidates.push({ nodeId: node.id, tier: node.tier ?? 'C', weight: maxWeight });
    }

    // 排序截断
    const tierOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    frontierCandidates.sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
      return b.weight - a.weight;
    });

    const learningFrontier = frontierCandidates.slice(0, 2).map(f => f.nodeId);

    // 统计
    let stable = 0, gap = 0, uncertain = 0, untested = 0;
    for (const node of nodes) {
      const s = stateMap.get(node.id)?.status ?? 'untested';
      if (s === 'stable') stable++;
      else if (s === 'gap') gap++;
      else if (s === 'uncertain') uncertain++;
      else untested++;
    }

    return NextResponse.json({
      nodes: nodes.map(n => ({
        nodeId: n.id,
        name: n.name,
        layer: n.layer,
        tier: n.tier,
        status: stateMap.get(n.id)?.status ?? 'untested',
        masteryProb: stateMap.get(n.id)?.masteryProb ?? 0.5,
        judgeCriteria: n.judgeCriteria,
        sampleItem: n.sampleItem,
        teachingNotes: n.teachingNotes,
        lastEvidence: stateMap.get(n.id)?.lastEvidence?.toISOString() ?? null,
      })),
      learningFrontier,
      stats: { total: nodes.length, stable, gap, uncertain, untested },
      edges,
      mainlines,
    });
  } catch (error) {
    logger.error({ error }, '获取知识地图失败');
    return internalError();
  }
}
