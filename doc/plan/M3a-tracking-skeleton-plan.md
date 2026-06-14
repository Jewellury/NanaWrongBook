# M3a 追踪骨架 · 开发计划

> 关联规格: doc/reference/TECH_PLAN_v2.md §4.1（KST-lite初诊）、§4.4（BKT追踪）、§3.5（Item schema）
> 修订基础: doc/reference/M3a_plan_revision_workorder.md（6 条修改）
> 计划日期: 2026-06-14 / 修订: 2026-06-15
> 预计影响: prisma/schema.prisma（追加 Item 表 + KnowledgeNode 补 items 虚字段）、prisma/seed_items_batch1.ts（新增）、lib/kst-lite.ts、lib/bkt.ts、API 路由、测试

## 1. 大白话概述

M1 建了知识图谱，M2 搭了归因骨架。M3a 要让系统第一次"能诊断"——给一个学生、一条主线，系统能选出最该测的节点、发题、根据她的答案推算出整条线上每个节点的掌握程度。

现在有 **101 道审过的真题** 分布在两份产出文件里（`doc/research/M1 初诊题首批.md` 60 题 + `doc/research/初诊题产出.md` 41 题），覆盖 BG 地基 5 节点 + M1 A 层 21 节点 + M2a A 层 8 节点。不再用占位题，直接用这批真内容。

具体五件事：
1. **建题库表**（Item）+ **从真题文件解析结构化种子**——101 道题全部导入，每个节点至少有 1 道 boundary + 1 道 variant
2. **写初诊算法**（KST-lite）——沿图谱选 boundary 题、答对向上传播 stable、答错向下标记 gap
3. **写追踪算法**（BKT）——标准贝叶斯更新，连续两次 slip 强制改判 gap
4. **开知识地图 API**——查学生地图状态 + 学习前沿（1-2 个，tier→权重排序）
5. **开初诊 API**——触发单主线初诊 session

本轮**不做**：不调 LLM、不写 UI、不做纸质包 PDF、不做探针下探自动化、不自动判分。纯算法 + 数据层 + API。

## 2. 任务分解

- [ ] 任务0: 从真题 md 文件解析结构化 Item 种子文件 `prisma/seed_items_batch1.ts`（101 题，确定性 ID）
- [ ] 任务1: Item Prisma 表 + 迁移（纯增量，只 CREATE TABLE Item）
- [ ] 任务2: 种子脚本导入 101 道真题（boundary/variant/concept/drill 全导）
- [ ] 任务3: KST-lite 初诊算法（涉及文件: lib/kst-lite.ts）【测试先行】
- [ ] 任务4: BKT 追踪算法（涉及文件: lib/bkt.ts）【测试先行】
- [ ] 任务5: 知识地图 API + 初诊 session API（涉及文件: src/app/api/diagnosis/）
- [ ] 任务6: 测试 + test:all 更新（涉及文件: 测试文件、package.json）

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| prisma/schema.prisma | 修改（末尾追加 Item + KnowledgeNode 补 `items Item[]` 虚字段） | items 是 Prisma 虚拟关系，不生列、不 ALTER |
| prisma/migrations/* | 自动生成 | 纯增量：只有 CREATE TABLE Item |
| prisma/seed_items_batch1.ts | 新增 | 从两份真题 md 解析的 101 道结构化种子 |
| prisma/seed_graph.ts | 修改 | 新增 Item 导入步骤（从 seed_items_batch1） |
| lib/kst-lite.ts | 新增 | KST-lite 初诊算法 |
| lib/bkt.ts | 新增 | BKT 贝叶斯追踪计算 |
| src/app/api/diagnosis/map/route.ts | 新增 | GET 知识地图状态 |
| src/app/api/diagnosis/initial/route.ts | 新增 | POST 初诊 session（触发 KST-lite） |
| src/__tests__/unit/kst-lite.test.ts | 新增 | 初诊算法单元测试 |
| src/__tests__/unit/bkt.test.ts | 新增 | BKT 单元测试 |
| src/__tests__/integration/diagnosis-api.test.ts | 修改 | 追加初诊 API 测试 |
| package.json | 修改 | 新增 test:m3:unit / test:m3:integration；更新 test:all |

## 4. 验收标准

> 测试策略：KST-lite 和 BKT 是逻辑重模块，**测试先行**——先写会失败的测试，再写实现。
> Item 表和 API 路由是样板，测试后置即可。

- [ ] Item 表建在数据库里，migration 只有 CREATE TABLE Item（无 ALTER 既有表）
- [ ] `npm run seed` 导入 101 道真题（确定性 ID: `{nodeId}-{role}-{序号}`），幂等可重复跑
- [ ] 每个节点至少有 1 道 boundary + 1 道 variant
- [ ] KST-lite 选节点时只取 role=boundary 题（concept 不进自动判分）
- [ ] KST-lite 单元测试：答对所有 → 全部节点 stable；答错根节点 → 后代标 gap
- [ ] BKT 单元测试：连续答对 3 次 → masteryProb ≥ 0.85；连续答错 3 次 → masteryProb ≤ 0.30
- [ ] 连续两次 slipFlag → 强制改判 gap（防滥用粗心标签）
- [ ] 学习前沿排序 = tier(A>B>C) → 主线高考权重，最多取 1-2 个
- [ ] GET /api/diagnosis/map?studentId=xxx 返回知识地图状态（含排序截断后的 learningFrontier）
- [ ] POST /api/diagnosis/initial 的 `correct` 由调用方给定，本轮不自动判分
- [ ] `test:m3:unit` + `test:m3:integration` 全部通过
- [ ] `test:all` 53+M3 ≥ 全部通过，测试容器退出码 0
- [ ] dev.db 未被测试触碰

## 5. 设计决策

### 决策①：用 101 道审过的真题，不用占位题

现有两份真题产出文件：`doc/research/M1 初诊题首批.md`（60 题）+ `doc/research/初诊题产出.md`（41 题）。覆盖 BG 地基 5 + M1 A 层 21 + M2a A 层 8 节点，答案已人工复核通过。

新增前置子任务：把两份 md 解析成结构化种子文件 `prisma/seed_items_batch1.ts`，字段 `nodeId / role / stem / answer / pairWith? / conceptCue? / note?`。使用确定性 ID（`M1-04-boundary-1`），便于幂等 reseed。答案直接采用，不重写。

### 决策②：KnowledgeNode 补 `items Item[]` 是虚拟关系，不产生列

`items Item[]` 是 Prisma 的关系字段（relation field），只存在于 Prisma Client 的 TypeScript 类型中，**不产生数据库列、不 ALTER KnowledgeNode 表**。本次 migration 是纯增量——只有 `CREATE TABLE Item`。执行前确认 migration diff 无对既有表的 ALTER/重建。

### 决策③：KST-lite 算法简化版，选题只取 boundary

完整 KST-lite 要"选最高信息量节点"+"4-6 个 uncertain 各补 1 题"。本轮先做简化版：
1. 指定一条主线 → 取该主线下所有 A 层节点
2. 过滤 `role=boundary` 的 Item（concept 不进自动判分，variant 留复测）
3. 每个节点发 1 道 boundary 题
4. 答对 → 祖先链全标 stable（沿 prereq 边向上传播到根）
5. 答错 → 该节点 + 后代标 gap 候选
6. 未被测试且不在传播范围内的 → untested
7. 输出 StudentNodeState 更新 + 学习前沿（按决策⑤排序截断）

复杂版（信息量排序、4-6 确认题）在后续轮次迭代。

### 决策④：BKT 标准参数，T 是学习转移 P(T) 非遗忘

```
P(L₀): 由 KST-lite 给定 (stable→0.85, uncertain→0.5, gap→0.15, untested→0.5)
T = 0.15 (学习转移概率 P(T)，标准 BKT)
G = 0.20 (猜测概率, 选择题 0.25)
S = 0.10 (失误概率)

答对: P(L|correct) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
答错: P(L|wrong)   = P(L)S / [P(L)S + (1-P(L))(1-G)]
P(L) ← posterior + (1-posterior) * T  (学习转移)
```

**同一场初诊内逐题更新不施加跨时间衰减**——同场连续答题没有时间流逝，T 只用于跨 session 更新。真正的"跨天遗忘"本轮不做，留待后续。

首版不学习参数，全部用默认值。连续两次 slipFlag 判定 → 强制 status=gap（防滥用粗心标签）。

### 决策⑤：学习前沿排序 + 截断

学习前沿 = status 为 gap/untested 且**其全部前置都是 stable** 的节点（即"前置依赖已满足、可以开始学了"）。

排序：**tier（A > B > C）→ 同 tier 内按主线高考权重（M7 29.5 > M3 25.5 > …）**。

截断：**最多取 1-2 个**（对齐 TECH_PLAN_v2 §4.1 "前台只展示学习前沿 1-2 个"和 P4 渐进展开原则——绝不一次铺开一片红）。

### 决策⑥：初诊 API 限定单主线

`POST /api/diagnosis/initial` 的 body 包含 `{studentId, mainlineId, answers: [{nodeId, correct}]}`。每次只诊一条主线——对应 TECH_PLAN_v2 "每条主线解锁时一次"的定位。首次全线初诊由前端/编排层多次调用实现。

### 决策⑦：本轮不自动判分

KST-lite 入参 `answers: {nodeId, correct}[]` 的 `correct` **由调用方给定**。初诊对错由周末 session 人工/前端判定，系统本轮不自动判分。这对齐 P5（周末数字化、人工对答案）。

### 决策⑧：初诊探针只用 boundary，排除 concept

真题里有 concept 题——concept 不可自动对错判定，归后续人工/Newman 阶段。
- KST-lite 选题按 `role` 过滤：**初诊只发 boundary**。
- `variant` 入库留作隔天复测（本轮可不发）。
- **concept 不进自动判分流**。

## 6. 风险与注意事项

| 风险 | 影响 | 对策 |
|------|------|------|
| migration 可能生成意外的 ALTER | Item 表外还有对既有表的修改 | 执行前确认 migration diff 只有 CREATE TABLE Item，确认后再 apply |
| KST-lite 传播逻辑复杂 | 祖先/后代方向容易搞反 | 测试先行——先写 test case 固定预期，再写实现 |
| 101 题 md 格式不统一 | 解析脚本可能漏题/读错字段 | 解析后打印统计：每个节点各 role 的题目数，验收时对照 |
| BKT "同场不衰减"实现遗漏 | 逐题更新错误地施加了 T | 测试先行：同 session 连续 3 次答对 → 不需要 T 也能 ≥0.85 |

## 7. 技术附录

### 7.1 Prisma Schema 追加

```prisma
// ============================================================
// M3 诊断引擎（个性化数学诊断辅导系统 · 增量）
// ============================================================

model Item {
  id       String        @id      // 确定性 ID: {nodeId}-{role}-{序号}
  nodeId   String
  node     KnowledgeNode @relation(fields: [nodeId], references: [id])
  role     String                  // boundary | concept | variant | drill
  stem     String                  // 题干
  answer   String                  // 正确答案
  analysis String?                 // 解析
  source   String?                 // 真题来源标注
  reviewed Boolean  @default(false) // LLM生成题须过审；已人工复核的真题=true
}
```

KnowledgeNode 末尾追加一行（虚拟关系，不生列）：
```prisma
model KnowledgeNode {
  // ...现有字段不变...
  items         Item[]        // 虚拟关系字段，不产生数据库列
}
```

### 7.2 seed_items_batch1.ts 结构

```typescript
// 从 doc/research/M1 初诊题首批.md + doc/research/初诊题产出.md 解析
// 101 道审过的真题，确定性 ID = {nodeId}-{role}-{序号}

export interface SeedItem {
  nodeId: string;       // "M1-04"
  role: string;         // "boundary" | "variant" | "concept" | "drill"
  stem: string;         // 题干
  answer: string;       // 正确答案
  pairWith?: string;    // concept 配对到哪道 boundary 题
  conceptCue?: string;  // concept 题的追问提示
  note?: string;        // 人工备注
}

export const seedItems: SeedItem[] = [
  { nodeId: "M1-04", role: "boundary", stem: "...", answer: "..." },
  // ... 101 条
];
```

### 7.3 KST-lite 算法（lib/kst-lite.ts）

```typescript
interface KSTInput {
  mainlineId: string;
  studentId: string;
  answers: { nodeId: string; correct: boolean }[];
  // correct 由调用方给定——本轮不自动判分（决策⑦）
}

interface KSTOutput {
  nodeStates: { nodeId: string; status: string; masteryProb: number }[];
  learningFrontier: string[]; // 最多 1-2 个（决策⑤）
}

/**
 * KST-lite 简化版
 * 1. 取该主线下所有 A 层节点
 * 2. 选 role=boundary 的 Item（决策⑧：concept 不进自动判分）
 * 3. 每个节点发 1 道 boundary 题
 * 4. 答对 → 沿 prereq 边向上：祖先链全标 stable（0.85）
 * 5. 答错 → 该节点 + dependents 标 gap（0.15）
 * 6. 未被覆盖 → untested
 * 7. 计算学习前沿：tier(ABC)排序 → 主线权重 → 截断 1-2
 */
```

### 7.4 BKT 算法（lib/bkt.ts）

```typescript
interface BKTParams {
  pLearn0: number;   // 初始 P(L)
  T: number;         // 学习转移概率 P(T) = 0.15
  G: number;         // 猜测概率 = 0.20
  S: number;         // 失误概率 = 0.10
}

interface BKTResult {
  posteriorPLearn: number;
  updatedPLearn: number;  // posterior + (1-posterior)*T
  slipFlag: boolean;      // P(L)≥0.7 且答错 → slip
}

/**
 * 同场初诊逐题更新不施加跨时间衰减——T 只在跨 session 时生效。
 * 本轮所有 BKT 调用在同一 session 内，T 赋值但实际为 0。
 */
```

### 7.5 知识地图 API

```
GET /api/diagnosis/map?studentId=xxx[&mainlineId=M1]
→ {
    nodes: [{ nodeId, name, tier, status, masteryProb }],
    learningFrontier: ["M1-07"],  // 最多 1-2，tier→权重排序截断
    stats: { total, stable, gap, uncertain, untested }
  }
```

### 7.6 初诊 API

```
POST /api/diagnosis/initial
body: { studentId, mainlineId, answers: [{ nodeId, correct }] }
→ {
    session: { id, kind: "initial", ... },
    nodeStates: [...],
    learningFrontier: [...]
  }
```

### 7.7 新增 test:all 条目

```json
"test:m3:unit": "vitest run src/__tests__/unit/kst-lite.test.ts src/__tests__/unit/bkt.test.ts",
"test:m3:integration": "vitest run src/__tests__/integration/diagnosis-api.test.ts",
```

`test:all` 追加 `&& npm run test:m3:unit && npm run test:m3:integration`。

### 7.8 commit 拆分

| # | commit | 内容 | 测试策略 |
|---|--------|------|----------|
| ① | `feat(m3): 结构化真题种子文件（101 题）` | prisma/seed_items_batch1.ts | 后置 |
| ② | `feat(m3): Item 表 + KnowledgeNode.items 虚字段 + 迁移` | schema + migration（纯 CREATE） | 后置 |
| ③ | `feat(m3): 种子脚本导入 101 道真题` | seed_graph.ts 追加 | 后置 |
| ④ | `feat(m3): KST-lite 初诊算法` | lib/kst-lite.ts | **测试先行** |
| ⑤ | `feat(m3): BKT 追踪算法` | lib/bkt.ts | **测试先行** |
| ⑥ | `feat(m3): 知识地图 + 初诊 API` | API 路由 | 后置 |
| ⑦ | `test(m3): M3 测试 + test:all 更新` | 测试文件 + scripts | — |
