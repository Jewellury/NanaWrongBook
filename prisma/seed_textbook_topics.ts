/**
 * 种子导入脚本 · Stage 3 课本章节 + 节点映射
 * 幂等导入，可重复执行不报错
 *
 * 数据来源：stage3-ai-integration-plan-v3-revised.md §3
 * - 16 个 TextbookTopic（覆盖当前 48 个系统节点，非完整教材目录）
 * - 48 条 TextbookNodeMapping（每个 KnowledgeNode 恰好映射到 1 个 TextbookTopic）
 *
 * 教材依据：人教 A 版（2019 新版）高中数学
 *   TB-001~TB-014 属必修第一册
 *   TB-015~TB-016 属必修第二册（复数在必修第二册第七章）
 *
 * ⚠️ 前置条件：migration stage3_revised_ai_card 已执行（表已建）
 * ⚠️ updatedAt 无 SQL DEFAULT，必须走 Prisma upsert（@updatedAt 自动填充）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---- TextbookTopic（16 个） ----

const textbookTopics = [
  { id: "TB-001", name: "集合的概念", chapter: "第一章 集合与常用逻辑用语",
    section: "1.1 集合的概念", stage: "必修一", order: 1 },
  { id: "TB-002", name: "集合间的基本关系", chapter: "第一章 集合与常用逻辑用语",
    section: "1.2 集合间的基本关系", stage: "必修一", order: 2 },
  { id: "TB-003", name: "集合的基本运算", chapter: "第一章 集合与常用逻辑用语",
    section: "1.3 集合的基本运算", stage: "必修一", order: 3 },
  { id: "TB-004", name: "充分条件与必要条件", chapter: "第一章 集合与常用逻辑用语",
    section: "1.4 充分条件与必要条件", stage: "必修一", order: 4 },
  { id: "TB-005", name: "全称量词与存在量词", chapter: "第一章 集合与常用逻辑用语",
    section: "1.5 全称量词与存在量词", stage: "必修一", order: 5 },
  { id: "TB-006", name: "等式性质与不等式性质", chapter: "第二章 一元二次函数、方程和不等式",
    section: "2.1 等式性质与不等式性质", stage: "必修一", order: 6 },
  { id: "TB-007", name: "基本不等式", chapter: "第二章 一元二次函数、方程和不等式",
    section: "2.2 基本不等式", stage: "必修一", order: 7 },
  { id: "TB-008", name: "一元二次不等式", chapter: "第二章 一元二次函数、方程和不等式",
    section: "2.3 一元二次不等式", stage: "必修一", order: 8 },
  { id: "TB-009", name: "函数的概念及其表示", chapter: "第三章 函数的概念与性质",
    section: "3.1 函数的概念及其表示", stage: "必修一", order: 9 },
  { id: "TB-010", name: "函数的基本性质", chapter: "第三章 函数的概念与性质",
    section: "3.2 函数的基本性质", stage: "必修一", order: 10 },
  { id: "TB-011", name: "指数函数", chapter: "第四章 指数函数与对数函数",
    section: "4.2 指数函数", stage: "必修一", order: 11 },
  { id: "TB-012", name: "对数", chapter: "第四章 指数函数与对数函数",
    section: "4.3 对数", stage: "必修一", order: 12 },
  { id: "TB-013", name: "对数函数", chapter: "第四章 指数函数与对数函数",
    section: "4.4 对数函数", stage: "必修一", order: 13 },
  { id: "TB-014", name: "函数的应用（零点）", chapter: "第四章 指数函数与对数函数",
    section: "4.5 函数的应用（零点）", stage: "必修一", order: 14 },
  { id: "TB-015", name: "复数的概念", chapter: "第七章 复数",
    section: "7.1 复数的概念", stage: "必修第二册", order: 15 },
  { id: "TB-016", name: "复数的四则运算", chapter: "第七章 复数",
    section: "7.2 复数的四则运算", stage: "必修第二册", order: 16 },
];

// ---- TextbookNodeMapping（48 条，每个 KnowledgeNode 恰好映射到 1 个 TextbookTopic） ----

const textbookNodeMappings = [
  // TB-001 集合的概念
  { textbookTopicId: "TB-001", nodeId: "M1-04" },
  { textbookTopicId: "TB-001", nodeId: "M1-05" },
  { textbookTopicId: "TB-001", nodeId: "M1-06" },
  { textbookTopicId: "TB-001", nodeId: "M1-07" },
  { textbookTopicId: "TB-001", nodeId: "M1-08" },
  // TB-002 集合间的基本关系
  { textbookTopicId: "TB-002", nodeId: "M1-09" },
  { textbookTopicId: "TB-002", nodeId: "M1-10" },
  { textbookTopicId: "TB-002", nodeId: "M1-31" },
  // TB-003 集合的基本运算
  { textbookTopicId: "TB-003", nodeId: "M1-11" },
  { textbookTopicId: "TB-003", nodeId: "M1-12" },
  { textbookTopicId: "TB-003", nodeId: "M1-13" },
  { textbookTopicId: "TB-003", nodeId: "M1-14" },
  { textbookTopicId: "TB-003", nodeId: "BG102" },
  // TB-004 充分条件与必要条件
  { textbookTopicId: "TB-004", nodeId: "M1-15" },
  // TB-005 全称量词与存在量词
  { textbookTopicId: "TB-005", nodeId: "M1-16" },
  { textbookTopicId: "TB-005", nodeId: "M1-17" },
  { textbookTopicId: "TB-005", nodeId: "M1-18" },
  { textbookTopicId: "TB-005", nodeId: "M1-19" },
  // TB-006 等式性质与不等式性质
  { textbookTopicId: "TB-006", nodeId: "M1-20" },
  { textbookTopicId: "TB-006", nodeId: "M1-21" },
  // TB-007 基本不等式
  { textbookTopicId: "TB-007", nodeId: "M1-22" },
  { textbookTopicId: "TB-007", nodeId: "M1-23" },
  { textbookTopicId: "TB-007", nodeId: "M1-33" },
  { textbookTopicId: "TB-007", nodeId: "BG104" },
  // TB-008 一元二次不等式
  { textbookTopicId: "TB-008", nodeId: "M1-24" },
  { textbookTopicId: "TB-008", nodeId: "M1-25" },
  { textbookTopicId: "TB-008", nodeId: "M1-32" },
  { textbookTopicId: "TB-008", nodeId: "BG100" },
  { textbookTopicId: "TB-008", nodeId: "BG101" },
  // TB-009 函数的概念及其表示
  { textbookTopicId: "TB-009", nodeId: "M2a-01" },
  { textbookTopicId: "TB-009", nodeId: "M2a-03" },
  { textbookTopicId: "TB-009", nodeId: "M2a-04" },
  { textbookTopicId: "TB-009", nodeId: "M2a-09" },
  { textbookTopicId: "TB-009", nodeId: "M2a-51" },
  { textbookTopicId: "TB-009", nodeId: "BG103" },
  // TB-010 函数的基本性质
  { textbookTopicId: "TB-010", nodeId: "M2a-13" },
  { textbookTopicId: "TB-010", nodeId: "M2a-17" },
  // TB-011 指数函数
  { textbookTopicId: "TB-011", nodeId: "M2a-32" },
  { textbookTopicId: "TB-011", nodeId: "M2a-33" },
  // TB-012 对数
  { textbookTopicId: "TB-012", nodeId: "M2a-38" },
  // TB-013 对数函数
  { textbookTopicId: "TB-013", nodeId: "M2a-42" },
  // TB-014 函数的应用（零点）
  { textbookTopicId: "TB-014", nodeId: "M2a-48" },
  { textbookTopicId: "TB-014", nodeId: "M2a-49" },
  // TB-015 复数的概念
  { textbookTopicId: "TB-015", nodeId: "M1-26" },
  { textbookTopicId: "TB-015", nodeId: "M1-27" },
  { textbookTopicId: "TB-015", nodeId: "M1-28" },
  // TB-016 复数的四则运算
  { textbookTopicId: "TB-016", nodeId: "M1-29" },
  { textbookTopicId: "TB-016", nodeId: "M1-30" },
];

// ---- 主流程 ----

async function main() {
  // 1. 导入 TextbookTopic（16 条）
  let topicCount = 0;
  for (const t of textbookTopics) {
    await prisma.textbookTopic.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        chapter: t.chapter,
        section: t.section,
        stage: t.stage,
        order: t.order,
      },
      create: {
        id: t.id,
        name: t.name,
        chapter: t.chapter,
        section: t.section,
        stage: t.stage,
        order: t.order,
      },
    });
    topicCount++;
  }

  // 2. 导入 TextbookNodeMapping（48 条）
  //    nodeId 松挂接 KnowledgeNode（无 FK），不校验节点是否存在
  let mappingCount = 0;
  for (const m of textbookNodeMappings) {
    await prisma.textbookNodeMapping.upsert({
      where: {
        textbookTopicId_nodeId: {
          textbookTopicId: m.textbookTopicId,
          nodeId: m.nodeId,
        },
      },
      update: {},
      create: {
        textbookTopicId: m.textbookTopicId,
        nodeId: m.nodeId,
      },
    });
    mappingCount++;
  }

  // 核对 DB 实际入库条数
  const dbTopicCount = await prisma.textbookTopic.count();
  const dbMappingCount = await prisma.textbookNodeMapping.count();

  console.log('');
  console.log('✅ TextbookTopic 种子数据导入完成');
  console.log(`   TextbookTopic: ${topicCount} 条（DB 实际: ${dbTopicCount} 条）`);
  console.log(`   TextbookNodeMapping: ${mappingCount} 条（DB 实际: ${dbMappingCount} 条）`);
  if (dbTopicCount !== 16) {
    throw new Error(`TextbookTopic 入库数量异常：期望 16，实际 ${dbTopicCount}`);
  }
  if (dbMappingCount !== 48) {
    throw new Error(`TextbookNodeMapping 入库数量异常：期望 48，实际 ${dbMappingCount}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
