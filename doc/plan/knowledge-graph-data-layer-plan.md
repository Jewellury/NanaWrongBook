# 知识图谱数据层 · 开发计划

> 关联规格: doc/reference/TECH_PLAN_v2.md §3 知识图谱数据层
> 计划日期: 2026-06-14
> 预计影响: prisma/schema.prisma（追加）、prisma/seed_graph.ts（新增）、lib/graph.ts（新增）、src/__tests__/unit/graph.test.ts（新增）、package.json（新增 seed 脚本）

## 1. 大白话概述

这轮要做的事：在 wrong-notebook 数据库里建 8 张新表，把知识图谱的骨架搭起来。

具体来说：
- **建表**：在现有数据库里追加知识节点、节点之间的依赖边、主线分类、学生掌握状态、常见误解库、错题与节点的关联，一共 8 张新表。不动原有任何一张表。
- **灌种子数据**：写一个导入脚本，把已经准备好的 100+ 个地基节点、30+ 个集合/逻辑/复数节点、10+ 个函数节点、18 条主线间依赖桥，一次性灌进数据库。脚本支持重复跑不报错。
- **写内存图谱**：做一个工具模块，应用启动时把整张图（预计不到 400 个节点、不到 1000 条边）加载到内存里，提供快速查询"这个知识点依赖哪些前置""这个知识点被哪些后续依赖""某条主线覆盖哪些节点"的能力。
- **写测试**：确保数据灌进去是对的、图的依赖关系查出来是对的、图里没有死循环。

为什么要做：这是整个诊断系统的地基。后续的诊断引擎（初诊、归因、下探）全部要在这张图上跑——图上没有数据，诊断就是空中楼阁。

本轮**不做**的事：不写任何界面、不写诊断算法、不调 AI。纯数据层。

## 2. 任务分解

- [ ] 任务1: Prisma schema 追加 8 张新表 + 生成迁移（涉及文件: prisma/schema.prisma）
- [ ] 任务2: 种子导入脚本 prisma/seed_graph.ts + package.json 加 seed 命令（涉及文件: prisma/seed_graph.ts、package.json）
- [ ] 任务3: 内存图谱模块 lib/graph.ts（涉及文件: lib/graph.ts）
- [ ] 任务4: 单元测试（涉及文件: src/__tests__/unit/graph.test.ts）

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| prisma/schema.prisma | 修改（末尾追加） | 新增 7 个 model，不改已有部分 |
| prisma/migrations/* | 自动生成 | Prisma migrate 自动产出的迁移文件 |
| prisma/seed_graph.ts | 新增 | 种子导入脚本，含字段归一化 + 悬空边过滤 + 幂等 upsert |
| package.json | 修改 | 新增 `"seed": "tsx prisma/seed_graph.ts"`（只加这一行）；`test:unit` / `test:integration` 已存在，无需改动 |
| lib/graph.ts | 新增 | 内存图谱单例，提供 fromData() + load() + 图遍历 API + 环检测 |
| src/__tests__/unit/graph.test.ts | 新增 | 纯单元测试（fromData 构造假数据，7 个用例） |
| src/__tests__/integration/graph.test.ts | 新增 | 集成测试（需数据库 + seed，4 个用例） |

## 4. 验收标准

- [ ] `npx prisma migrate dev --name add_knowledge_graph` 执行成功，8 张新表建在数据库里（含 MainlineBridge）
- [ ] `npm run seed` 执行成功，无报错；再跑一次 `npm run seed` 依然成功（幂等）
- [ ] `npm run seed` 控制台输出 `跳过 N 条悬空边`（N>0），证明悬空边过滤器生效
- [ ] 数据库里 BG100-104 节点的 `judgeCriteria/sampleItem/stage` 非空，M1/M2a 节点的对应字段也非空（字段归一化验证）
- [ ] `npm run test:unit` 全部通过（纯单元测试：图遍历 + 环检测，不连数据库）
- [ ] `npm run test:integration` 全部通过（集成测试：种子数据入库后的节点数/边数/依赖一致性/无环）
- [ ] `allPrereqsOf("M2a-03")` 返回结果包含 M2a-01（其声明的前置链中 M2a-01 已入库、M2a-02 悬空被跳过）
- [ ] 随机抽 3 个节点的 prereqsOf 与种子文件声明一致（所有前置均已入库的才验）

## 5. 需要你在意的设计决策（共 7 项，含外部审计补入的⑥⑦）

### 决策①：MistakeNode 的 mistakeId 指向哪张表？

现有 wrong-notebook 的错题表叫 `ErrorItem`（不是 `Mistake`）。`MistakeNode.mistakeId` 实际上映射 `ErrorItem.id`。字段名叫 `mistakeId` 保持不变（与 TECH_PLAN_v2 的 schema 一致），但 comment 里标注清楚指向 ErrorItem。这在本轮只是建表，不写关联查询，不影响功能。但名字不一致是个未来的坑，我先标在这里。

### 决策②：种子脚本用什么跑？

种子数据文件 `seed_graph_batch1.ts` 用了 ESM export。现有 devDependencies 里有 `ts-node` 但没有 `tsx`。`tsx` 对 ESM/TypeScript 混用的兼容性更好。建议加 `tsx` 到 devDependencies，然后 `package.json` 的 seed 脚本写成 `"seed": "tsx prisma/seed_graph.ts"`。

（替代方案：用 `npx tsx` 不装包，但每次下载慢；或用 `ts-node` 加一堆编译参数。建议直接加 tsx。）

### 决策③：跨线桥（bridges）怎么存？

种子数据里的 bridges 是主线对主线的（如 `{src:"M1", tgt:"M2a", type:"prerequisite"}`），`KnowledgeEdge` 表存的却是节点对节点。主线 ID（"M1"）不是节点 ID（"M1-04"），直接往 KnowledgeEdge 里塞会破坏数据一致性。

推荐方案：新增一张 `MainlineBridge` 表，三个字段 src/tgt/type，专门存主线间的依赖桥。以后各主线节点生产完毕后，可以把这些桥细化为节点级边，届时再决定是否废弃这张表。这比硬塞进 KnowledgeEdge 干净得多，也符合"不改既有表"的原则——因为我们对 bridges 的需求是独立的数据实体。

### 决策④：M2a 节点的补全问题

种子文件 `M2aNodes` 数组里只列了 13 个关键节点（M2a-01/03/04/09/13/17/32/33/38/42/48/49/51），注释说"其余按相同结构补全"。本轮先用这 13 个节点跑通流程——13 个节点足够验证图遍历和依赖关系的正确性。等流程跑通后，下一轮再批量补全剩余的 37 个节点。

### 决策⑤：foundationPrereq 本轮不建边

种子数据里 `foundationPrereq` 字段是文字描述（如 `"BG101解不等式"`），不是结构化的节点 ID 数组。本轮忽略这些文字描述，不从中建边。等以后地基节点的 ID 映射全部确认后，再统一补。本轮只从 `samePrereq`（同主线前置，已经是节点 ID）建边。

### 决策⑥ · 悬空边一律跳过并报数（🔴 阻断项，外部审计补入）

M2a 的 13 个节点声明的 `samePrereq` 里，点名了 8 个本轮没导入的节点：M2a-02/06/07/16/31/35/36/41。此外 `foundationExtra.prereq`（注意字段名叫 `prereq` 不是 `foundationPrereq`）指向 BG001-099，那些也是本轮不导入的。**Prisma 在 SQLite 上默认开启外键检查**（计划初版风险表里"SQLite 不强制外键"是错的），灌到这些悬空引用会直接报错中断。

必须做：建边前先查目标节点是否已入库，不在就跳过，并按铁律 6 明确打印 `跳过 N 条悬空边（目标节点未入库）`。这条覆盖 foundationExtra.prereq、M1nodes.samePrereq、M2aNodes.samePrereq 三处的悬空边。

### 决策⑦ · 三组节点字段名归一化（🔴 阻断项，外部审计补入）

`foundationExtra`（BG 节点）用 `judgeCriteria` / `sampleItem` / `stage`。
`M1nodes` / `M2aNodes` 用 `judge` / `sample` / `section`（没有 stage 字段）。

同一张 KnowledgeNode 表，三个数据来源字段名不一样。导入脚本必须做归一化映射：

| 统一字段 | foundationExtra 来源 | M1/M2a 来源 |
|----------|---------------------|-------------|
| `judgeCriteria` | `judgeCriteria` | `judge` |
| `sampleItem` | `sampleItem` | `sample` |
| `stage` | `stage` | `section` |

**注意**：`section` 的值是教材小节号（如 `"1.1"`），不是学段（如 `"必修一"`）。导入时直接写到 `stage` 字段，语义上小节号也可作为 stage 的一个子类使用。后续如需补学段信息，再统一回填。

## 6. 风险与注意事项

| 风险 | 影响 | 对策 |
|------|------|------|
| KnowledgeNode 与既有 KnowledgeTag 表名相似 | 开发者混淆两张表 | 注释中明确区分：KnowledgeNode 是新图谱节点，KnowledgeTag 是既有错题标签（不改它） |
| Prisma SQLite 默认开启外键检查 | 灌入悬空边（目标节点不在库）会直接报错中断 | 建边前先查目标节点是否存在，不在就跳过并报数（决策⑥） |
| seed_graph_batch1.ts 路径在 doc/research/ | seed 脚本需跨多层目录引用 | 用相对路径 `../doc/research/seed_graph_batch1` 或 tsx 的 paths 支持 |
| vitest 配置只 include src/__tests__/ | lib/graph.ts 的测试可能跑不到 | KnowledgeGraph 提供 `fromData()` 静态方法（纯内存构造），测试不依赖数据库和路径；测试文件放 src/__tests__/unit/graph.test.ts |
| 新表与既有 ErrorItem 的关联未建外键 | MistakeNode 的 mistakeId 没有 @relation 指向 ErrorItem | Prisma 支持跨模型 @relation，但需改动既有 ErrorItem 模型（违反铁律 3）。本轮只用 comment 标注映射关系，外键关联留到后续评估 |
| 13 个 M2a 节点的 samePrereq 指向未导入节点 | 8 条边变悬空（M2a-02/06/07/16/31/35/36/41） | 建边前过滤，跳过并报数（决策⑥） |
| foundationExtra 字段名与 M1/M2a 不同 | judge/sample/section vs judgeCriteria/sampleItem/stage | 导入时做字段归一化映射（决策⑦） |

## 7. 技术附录

### 7.1 Prisma Schema 追加内容

在 `prisma/schema.prisma` 文件**末尾**追加以下内容（不改动任何已有 model）：

```prisma
// ============================================================
// 知识图谱数据层（个性化数学诊断辅导系统 · 增量）
// 全部新增表，不改 wrong-notebook 已有模型
// 对应 TECH_PLAN_v2 §3.5
// ============================================================

model KnowledgeNode {
  id            String   @id            // "BG001" / "M1-11" / "M2a-03"
  name          String
  layer         String                  // foundation | mainline
  stage         String                  // 学段，如 "七上" "必修一3.1"
  judgeCriteria String                  // 一句话判定标准
  sampleItem    String?                 // 示例题
  teachingNotes String?                 // 迁移类比/通法步骤/易错点
  tier          String?                 // A | B | C | D | null（保底层级，调度主键）
  videoLinks    Json?                   // [{title,searchKey,uper,duration,role,note}]
  edgesOut      KnowledgeEdge[] @relation("src")
  edgesIn       KnowledgeEdge[] @relation("tgt")
  mainlines     NodeMainline[]
  states        StudentNodeState[]
}

model KnowledgeEdge {
  sourceId String
  targetId String
  type     String                       // prerequisite | tool（transfer 不入图）
  source   KnowledgeNode @relation("src", fields:[sourceId], references:[id])
  target   KnowledgeNode @relation("tgt", fields:[targetId], references:[id])
  @@id([sourceId, targetId])
}

model Mainline {
  id       String @id                   // "M0".."M8" / "M2a" / "M2b"
  name     String
  priority Int
  weight   Float?                        // 高考严格年均分值，供 ROI 排序
  nodes    NodeMainline[]
}

model NodeMainline {
  nodeId     String
  mainlineId String
  node       KnowledgeNode @relation(fields:[nodeId], references:[id])
  mainline   Mainline      @relation(fields:[mainlineId], references:[id])
  @@id([nodeId, mainlineId])
}

model MainlineBridge {
  srcMainlineId String
  tgtMainlineId String
  type          String                  // prerequisite | tool
  note          String?                 // 桥接说明（如 "二次方程→定义域"）
  @@id([srcMainlineId, tgtMainlineId])
}

model StudentNodeState {
  studentId    String
  nodeId       String
  node         KnowledgeNode @relation(fields:[nodeId], references:[id])
  masteryProb  Float         @default(0.0)
  status       String        @default("untested") // stable|uncertain|gap|untested
  slipFlag     Boolean       @default(false)
  lastEvidence DateTime?
  @@id([studentId, nodeId])
}

model Misconception {
  id            String   @id @default(cuid())
  board         String                    // 板块
  errorType     String                    // 一级标签:概念性|程序性|计算性|符号表示|条件前提缺口|完备性缺口
  crossTag      String?                   // 跨章复用标签
  manifestation String                    // 错误的具体表现（最小示例）
  misbelief     String                    // 背后的概念误解
  rootNodeId    String?                   // 暴露的真正知识缺口 → KnowledgeNode.id
  probeCue      String                    // 教师追问/反例
  evidence      String                    // 证据等级 A|B|C
}

model MistakeNode {
  mistakeId String  // → 既有 ErrorItem.id（不改其表）
  nodeId    String
  confirmed Boolean @default(false)       // 是否人工确认
  @@id([mistakeId, nodeId])
}
```

注意：本轮**不加** `Item`、`DiagnosisSession`、`ProbeRecord`、`ErrorRecord` 这 4 张表——它们是后续 M2/M3 轮次的交付物。

### 7.2 mainlineWeight 存储方案

种子数据里的 `mainlineWeight`（各主线高考权重，如 M7: 29.5）直接写入 `Mainline.weight` 字段，不额外建表。

### 7.3 种子脚本结构（prisma/seed_graph.ts）

```typescript
// prisma/seed_graph.ts
// 幂等导入知识图谱种子数据
// 处理三组节点字段归一化 + 悬空边过滤

import { PrismaClient } from '@prisma/client';
import { mainlines, foundationExtra, M1nodes, M2aNodes,
         bridges, videoMapSample, mergeMap, mainlineWeight }
  from '../doc/research/seed_graph_batch1';

const prisma = new PrismaClient();

// 字段归一化辅助（决策⑦）
interface RawNode {
  id: string; name: string; layer?: string; tier?: string | null;
  mainlines: string[];
  // foundationExtra 用这些字段名
  judgeCriteria?: string; sampleItem?: string; stage?: string; prereq?: string[];
  // M1/M2a 用这些字段名
  judge?: string; sample?: string; section?: string; samePrereq?: string[];
  foundationPrereq?: string[];
}
function normalizeNode(raw: RawNode) {
  return {
    id: raw.id,
    name: raw.name,
    layer: raw.layer ?? "mainline",
    stage: raw.stage ?? raw.section ?? "",
    judgeCriteria: raw.judgeCriteria ?? raw.judge ?? "",
    sampleItem: raw.sampleItem ?? raw.sample ?? null,
    tier: raw.tier ?? null,
    mainlines: raw.mainlines,
  };
}

async function main() {
  // 0. 收集本轮已入库节点 ID 集合（用于悬空边过滤）
  const importedNodeIds = new Set<string>();

  // 1. 导入主线（Mainline）
  //    upsert: id 冲突则更新 name/priority/weight
  //    weight 从 mainlineWeight 映射读取
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
  //    - foundationExtra: 5 个 (BG100-104)
  //    - M1nodes: 30 个 (M1-04 ~ M1-33)
  //    - M2aNodes: 13 个（已列出的关键节点）
  //    - 注：BG001-099 由后续批次导入，本轮不含
  const allRawNodes = [...foundationExtra, ...M1nodes, ...M2aNodes];
  let nodeCount = 0;

  for (const raw of allRawNodes) {
    const n = normalizeNode(raw);
    await prisma.knowledgeNode.upsert({
      where: { id: n.id },
      update: { name: n.name, layer: n.layer, stage: n.stage,
                judgeCriteria: n.judgeCriteria, sampleItem: n.sampleItem,
                tier: n.tier },
      create: { id: n.id, name: n.name, layer: n.layer, stage: n.stage,
                judgeCriteria: n.judgeCriteria, sampleItem: n.sampleItem,
                tier: n.tier },
    });
    importedNodeIds.add(n.id);
    nodeCount++;
  }

  // 3. 导入主线-节点关联（NodeMainline）
  //    每个节点的 mainlines 数组展开建关联
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
  //    来源：每个节点的 samePrereq 数组（M1/M2a）或 prereq 数组（foundationExtra）
  //    跳过 foundationPrereq（文字描述，未结构化）
  let edgeCount = 0;
  let skippedDangling = 0;

  for (const raw of allRawNodes) {
    const prereqIds: string[] = (raw as any).samePrereq ?? (raw as any).prereq ?? [];
    for (const targetId of prereqIds) {
      if (!importedNodeIds.has(targetId)) {
        skippedDangling++;
        continue; // 悬空边跳过（目标节点本轮未导入）
      }
      await prisma.knowledgeEdge.upsert({
        where: { sourceId_targetId: { sourceId: targetId, targetId: raw.id } },
        update: { type: "prerequisite" },
        create: { sourceId: targetId, targetId: raw.id, type: "prerequisite" },
      });
      edgeCount++;
    }
  }

  if (skippedDangling > 0) {
    console.log(`⚠️  跳过 ${skippedDangling} 条悬空边（目标节点未入库）`);
  }

  // 5. 导入主线间桥（MainlineBridge）
  //    来源：bridges 数组，18 条主线→主线依赖
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
  //    来源：videoMapSample
  for (const [nodeId, videos] of Object.entries(videoMapSample)) {
    if (!importedNodeIds.has(nodeId)) continue; // 节点不在本批则跳过
    await prisma.knowledgeNode.update({
      where: { id: nodeId },
      data: { videoLinks: videos },
    });
  }

  console.log('✅ 种子数据导入完成');
  console.log(`   主线: ${mainlineCount} 条`);
  console.log(`   节点: ${nodeCount} 个`);
  console.log(`   边: ${edgeCount} 条（跳过悬空: ${skippedDangling} 条）`);
  console.log(`   主线桥: ${bridgeCount} 条`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

**悬空边输出示例**（npm run seed 控制台应该看到类似这样的行）：
```
⚠️  跳过 ~19 条悬空边（目标节点未入库）
```
来自：foundationExtra.prereq 指向 BG001-099（~10条，BG053/057/066/069/049/080/017/029/067/068）+ M2a 的 samePrereq 指向本轮未导入节点（~9条，M2a-02/06/07/16/31/35/36/41等）。验收只卡 N>0，不卡精确数字。

### 7.4 内存图谱模块接口（lib/graph.ts）

```typescript
// lib/graph.ts
// 知识图谱内存单例，应用启动时加载全部节点和边
// 所有遍历在内存完成，不写递归 SQL

export interface GraphNode {
  id: string;
  name: string;
  layer: string;
  tier: string | null;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: string;  // "prerequisite" | "tool"
}

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode>;
  private outEdges: Map<string, string[]>;   // nodeId → 直接后继
  private inEdges: Map<string, string[]>;    // nodeId → 直接前驱

  // 从原始数据直接构造（测试友好，不依赖数据库）
  static fromData(nodes: GraphNode[], edges: GraphEdge[]): KnowledgeGraph;

  // 从 Prisma 加载全量数据（生产环境用）
  static async load(): Promise<KnowledgeGraph>;

  // 直接前置节点（沿 prerequisite 边反向一步）
  prereqsOf(nodeId: string): GraphNode[];

  // 递归全部前置（沿 prerequisite 边反向闭包，BFS）
  allPrereqsOf(nodeId: string): GraphNode[];

  // 直接依赖它的节点（沿 prerequisite 边正向一步）
  dependentsOf(nodeId: string): GraphNode[];

  // 某主线及其全部前置涉及的节点子图
  mainlineSubgraph(mainlineId: string): GraphNode[];

  // 检测图中是否有环（DFS 三色标记），有环则 console.warn 并返回 true
  detectCycles(): boolean;

  // 统计信息
  getStats(): { nodeCount: number; edgeCount: number };
}
```

关键变化：新增 `static fromData(nodes, edges)` 方法，允许直接用内存数组构造 KnowledgeGraph。这使得测试不需要连接数据库——构造假数据喂进去即可验证图遍历逻辑。`load()` 内部也调用 `fromData()`：先从 Prisma 查全量数据，转成 `GraphNode[]` 和 `GraphEdge[]`，再调 `fromData()` 构造实例。

**环检测算法**：DFS 三色标记法（WHITE=未访问, GRAY=正在栈中, BLACK=已出栈）。遍历过程中遇到 GRAY 节点即发现环。

**加载时机**：首次调用 `KnowledgeGraph.load()` 时从 Prisma 拉全量数据，结果缓存在单例中。Next.js 开发模式下热重载会重建模块，单例会重置，符合预期。

### 7.5 测试设计（src/__tests__/unit/graph.test.ts）

测试分两层：

**A. 纯单元测试（不连数据库）**：用 `KnowledgeGraph.fromData(nodes, edges)` 构造假图，验证图遍历逻辑。

```typescript
import { describe, test, expect } from 'vitest';
import { KnowledgeGraph } from '../../../lib/graph';

// 手工构造一个小图：A→B→C, A→C
const testNodes = [
  { id: "A", name: "节点A", layer: "mainline", tier: "A" },
  { id: "B", name: "节点B", layer: "mainline", tier: "A" },
  { id: "C", name: "节点C", layer: "mainline", tier: "B" },
];
const testEdges = [
  { sourceId: "A", targetId: "B", type: "prerequisite" },
  { sourceId: "B", targetId: "C", type: "prerequisite" },
  { sourceId: "A", targetId: "C", type: "prerequisite" },
];

describe('KnowledgeGraph（纯单元）', () => {
  const graph = KnowledgeGraph.fromData(testNodes, testEdges);

  test('getStats 返回正确的节点数和边数', () => {
    expect(graph.getStats()).toEqual({ nodeCount: 3, edgeCount: 3 });
  });

  test('prereqsOf("C") 应返回 A 和 B', () => {
    expect(graph.prereqsOf("C").map(n => n.id).sort()).toEqual(["A", "B"]);
  });

  test('prereqsOf("A") 应为空（无前置）', () => {
    expect(graph.prereqsOf("A")).toHaveLength(0);
  });

  test('allPrereqsOf("C") 递归应包含 A 和 B', () => {
    const ids = graph.allPrereqsOf("C").map(n => n.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });

  test('dependentsOf("A") 应返回 B 和 C', () => {
    expect(graph.dependentsOf("A").map(n => n.id).sort()).toEqual(["B", "C"]);
  });

  test('detectCycles 在无环图上返回 false', () => {
    expect(graph.detectCycles()).toBe(false);
  });

  test('detectCycles 检测到环时返回 true', () => {
    const cycleEdges = [
      ...testEdges,
      { sourceId: "C", targetId: "A", type: "prerequisite" }, // 回边
    ];
    const cycleGraph = KnowledgeGraph.fromData(testNodes, cycleEdges);
    expect(cycleGraph.detectCycles()).toBe(true);
  });
});
```

**B. 集成测试（需数据库）**：验证种子数据入库后的图状态。用 vitest 的 `test:integration` 脚本跑。

```typescript
describe('知识图谱集成测试', () => {
  test('种子导入后节点数和边数大于预期下限', async () => {
    const graph = await KnowledgeGraph.load();
    const stats = graph.getStats();
    expect(stats.nodeCount).toBeGreaterThanOrEqual(48); // 5(BG)+30(M1)+13(M2a)
    expect(stats.edgeCount).toBeGreaterThan(0);
  });

  test('allPrereqsOf("M2a-03") 应包含 M2a-01', async () => {
    const graph = await KnowledgeGraph.load();
    const ids = graph.allPrereqsOf("M2a-03").map(n => n.id);
    expect(ids).toContain("M2a-01");
    // M2a-02 本轮未导入，悬空边已跳过，不出现在结果中
  });

  test('图无环检测通过', async () => {
    const graph = await KnowledgeGraph.load();
    expect(graph.detectCycles()).toBe(false);
  });

  test('抽 3 个节点的 prereqsOf 与种子声明一致', async () => {
    const graph = await KnowledgeGraph.load();
    // M1-08: samePrereq=["M1-06","M1-07"]
    expect(graph.prereqsOf("M1-08").map(n=>n.id).sort()).toEqual(["M1-06","M1-07"]);
    // M1-14: samePrereq=["M1-11","M1-12","M1-13"]
    expect(graph.prereqsOf("M1-14").map(n=>n.id).sort()).toEqual(["M1-11","M1-12","M1-13"]);
    // M1-30: samePrereq=["M1-26","M1-29"]
    expect(graph.prereqsOf("M1-30").map(n=>n.id).sort()).toEqual(["M1-26","M1-29"]);
  });
});
```

**测试运行方式**：
- `npm run test:unit` → 跑纯单元测试（100% 不连库，毫秒级）
- `npm run test:integration` → 跑集成测试（需先 `npm run seed`）

### 7.6 vitest 配置说明

**无需改动 vitest.config.ts。** 当前配置已满足全部需求：

- `include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx']` → 同时覆盖 `src/__tests__/unit/` 和 `src/__tests__/integration/`
- `test:unit` / `test:integration` 脚本已存在于 package.json，按目录区分：
  ```json
  "test:unit": "vitest run src/__tests__/unit",
  "test:integration": "vitest run src/__tests__/integration"
  ```
- 纯单元测试（`unit/graph.test.ts`）通过 `KnowledgeGraph.fromData()` 构造假数据，不连库，不 import 任何 src/ 外的文件
- 集成测试（`integration/graph.test.ts`）通过 `KnowledgeGraph.load()` 读 Prisma，需先 `npm run seed`
- graph 模块在 `lib/graph.ts`，测试用相对路径 `../../../lib/graph` import 即可，无需加 alias

### 7.7 commit 拆分计划

| # | commit 消息 | 内容 | 可独立验证 |
|---|------------|------|:--:|
| ① | `feat: 新增知识图谱 Prisma schema + 迁移` | schema.prisma 追加 8 个 model + migration 文件 | `npx prisma migrate dev` 成功，SQLite 里可见新表 |
| ② | `feat: 新增种子导入脚本` | prisma/seed_graph.ts + package.json seed 命令 + tsx devDep | `npm run seed` 成功且幂等，控制台可见 "跳过 N 条悬空边" |
| ③ | `feat: 新增内存图谱模块` | lib/graph.ts（fromData/load/prereqsOf/allPrereqsOf/dependentsOf/detectCycles） | `tsx -e "import {KnowledgeGraph} from './lib/graph'"` 无报错 |
| ④ | `test: 新增图谱模块单元测试` | src/__tests__/unit/graph.test.ts（7 个纯单元用例） | `npm run test:unit` 全部通过 |
| ⑤ | `test: 新增图谱模块集成测试` | src/__tests__/integration/graph.test.ts（4 个用例，需 seed 后跑） | `npm run test:integration` 全部通过 |
