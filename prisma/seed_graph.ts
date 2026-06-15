/**
 * 种子导入脚本 · 知识图谱数据层
 * 幂等导入，可重复执行不报错
 *
 * 处理：
 * - 三组节点字段归一化（决策⑦）：section→stage, judge→judgeCriteria, sample→sampleItem
 * - 悬空边过滤并报数（决策⑥）：目标节点不在本批则跳过
 * - foundationPrereq 文字描述本轮不建边（决策⑤）
 */

import { PrismaClient } from '@prisma/client';
import {
  mainlines,
  foundationExtra,
  M1nodes,
  M2aNodes,
  bridges,
  videoMapSample,
  mainlineWeight,
} from '../doc/research/seed_graph_batch1';

const prisma = new PrismaClient();

// ---- 字段归一化辅助（决策⑦） ----

interface RawNode {
  id: string;
  name: string;
  layer?: string;
  tier?: string | null;
  mainlines: string[];
  // foundationExtra 字段名
  judgeCriteria?: string;
  sampleItem?: string;
  stage?: string;
  prereq?: string[];
  // M1/M2a 字段名
  judge?: string;
  sample?: string;
  section?: string;
  samePrereq?: string[];
  foundationPrereq?: string[];
}

function normalizeNode(raw: RawNode) {
  return {
    id: raw.id,
    name: raw.name,
    layer: raw.layer ?? 'mainline',
    stage: raw.stage ?? raw.section ?? '',
    judgeCriteria: raw.judgeCriteria ?? raw.judge ?? '',
    sampleItem: raw.sampleItem ?? raw.sample ?? null,
    tier: raw.tier ?? null,
    mainlines: raw.mainlines,
  };
}

// ---- 主流程 ----

async function main() {
  // 0. 收集本轮已入库节点 ID 集合（用于悬空边过滤）
  const importedNodeIds = new Set<string>();

  // 1. 导入主线（Mainline）
  let mainlineCount = 0;
  for (const ml of mainlines) {
    await prisma.mainline.upsert({
      where: { id: ml.id },
      update: { name: ml.name, priority: ml.priority, weight: mainlineWeight[ml.id] ?? null },
      create: { id: ml.id, name: ml.name, priority: ml.priority, weight: mainlineWeight[ml.id] ?? null },
    });
    mainlineCount++;
  }

  // 2. 导入节点（KnowledgeNode）——含字段归一化
  //    foundationExtra: 5 个 (BG100-104)
  //    M1nodes: 30 个 (M1-04 ~ M1-33)
  //    M2aNodes: 13 个（已列出的关键节点）
  const allRawNodes: RawNode[] = [...foundationExtra, ...M1nodes, ...M2aNodes];
  let nodeCount = 0;

  for (const raw of allRawNodes) {
    const n = normalizeNode(raw);
    await prisma.knowledgeNode.upsert({
      where: { id: n.id },
      update: {
        name: n.name, layer: n.layer, stage: n.stage,
        judgeCriteria: n.judgeCriteria, sampleItem: n.sampleItem,
        tier: n.tier,
      },
      create: {
        id: n.id, name: n.name, layer: n.layer, stage: n.stage,
        judgeCriteria: n.judgeCriteria, sampleItem: n.sampleItem,
        tier: n.tier,
      },
    });
    importedNodeIds.add(n.id);
    nodeCount++;
  }

  // 3. 导入主线-节点关联（NodeMainline）
  for (const raw of allRawNodes) {
    for (const mlId of raw.mainlines) {
      await prisma.nodeMainline.upsert({
        where: { nodeId_mainlineId: { nodeId: raw.id, mainlineId: mlId } },
        update: {},
        create: { nodeId: raw.id, mainlineId: mlId },
      });
    }
  }

  // 4. 导入节点间依赖（KnowledgeEdge）——含悬空边过滤（决策⑥）
  //    来源：samePrereq（M1/M2a）或 prereq（foundationExtra）
  //    跳过 foundationPrereq（文字描述）
  let edgeCount = 0;
  let skippedDangling = 0;

  for (const raw of allRawNodes) {
    const prereqIds: string[] = (raw as any).samePrereq ?? (raw as any).prereq ?? [];
    for (const targetId of prereqIds) {
      if (!importedNodeIds.has(targetId)) {
        skippedDangling++;
        continue; // 悬空边跳过（目标节点本轮未导入）
      }
      // KnowledgeEdge 方向: source(前置) → target(当前节点)
      await prisma.knowledgeEdge.upsert({
        where: { sourceId_targetId: { sourceId: targetId, targetId: raw.id } },
        update: { type: 'prerequisite' },
        create: { sourceId: targetId, targetId: raw.id, type: 'prerequisite' },
      });
      edgeCount++;
    }
  }

  if (skippedDangling > 0) {
    console.log(`⚠️  跳过 ${skippedDangling} 条悬空边（目标节点未入库）`);
  }

  // 5. 导入主线间桥（MainlineBridge）
  let bridgeCount = 0;
  for (const b of bridges) {
    await prisma.mainlineBridge.upsert({
      where: { srcMainlineId_tgtMainlineId: { srcMainlineId: b.src, tgtMainlineId: b.tgt } },
      update: { type: b.type, note: b.note ?? null },
      create: { srcMainlineId: b.src, tgtMainlineId: b.tgt, type: b.type, note: b.note ?? null },
    });
    bridgeCount++;
  }

  // 6. 导入视频映射（更新对应节点的 videoLinks 字段）
  for (const [nodeId, videos] of Object.entries(videoMapSample)) {
    if (!importedNodeIds.has(nodeId)) continue;
    await prisma.knowledgeNode.update({
      where: { id: nodeId },
      data: { videoLinks: JSON.stringify(videos) },
    });
  }

  // 7. 导入真题 Item（从 seed_items_batch1）——含序号 ID 防撞车
  //    BG102 有 2 道 drill → BG102-drill-1 / BG102-drill-2
  //    M2a-38 有 2 道 drill → M2a-38-drill-1 / M2a-38-drill-2
  const { seedItems } = await import('../prisma/seed_items_batch1');
  let itemCount = 0;
  // 跟踪每个 (nodeId, role) 组合的序号
  const roleSeq = new Map<string, number>();

  for (const item of seedItems) {
    const key = `${item.nodeId}-${item.role}`;
    const seq = (roleSeq.get(key) ?? 0) + 1;
    roleSeq.set(key, seq);
    const id = `${item.nodeId}-${item.role}-${seq}`;

    await prisma.item.upsert({
      where: { id },
      update: {
        stem: item.stem,
        answer: item.answer,
        analysis: item.note ?? null,
        source: item.source,
        reviewed: item.reviewed,
      },
      create: {
        id,
        nodeId: item.nodeId,
        role: item.role,
        stem: item.stem,
        answer: item.answer,
        analysis: item.note ?? null,
        source: item.source,
        reviewed: item.reviewed,
      },
    });
    itemCount++;
  }

  // 核对 DB 实际入库条数
  const dbCount = await prisma.item.count();
  console.log('');
  console.log('✅ 种子数据导入完成');
  console.log(`   主线: ${mainlineCount} 条`);
  console.log(`   节点: ${nodeCount} 个`);
  console.log(`   边: ${edgeCount} 条（跳过悬空: ${skippedDangling} 条）`);
  console.log(`   主线桥: ${bridgeCount} 条`);
  console.log(`   真题 Item: ${itemCount} 道（DB 实际: ${dbCount} 道）`);
  if (dbCount !== 101) {
    console.error(`⚠️  Item 入库数量异常：期望 101，实际 ${dbCount}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
