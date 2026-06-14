# M3a 追踪骨架 · 开发计划

> 关联规格: doc/reference/TECH_PLAN_v2.md §4.1（KST-lite初诊）、§4.4（BKT追踪）、§3.5（Item schema）
> 计划日期: 2026-06-14
> 预计影响: prisma/schema.prisma（追加 Item 表 + KnowledgeNode 补 items 字段）、lib/kst-lite.ts、lib/bkt.ts、API 路由、测试

## 1. 大白话概述

M1 建了知识图谱，M2 搭了归因骨架。M3a 要做的是让系统第一次"能诊断"——给一个学生、一条主线，系统能选出最该测的节点、发题、根据她的答案推算出整条线上每个节点的掌握程度。

具体四件事：
1. **建题库表**（Item）：给知识节点挂上题目。本轮用种子数据里现成的 sampleItem 当占位 boundary 题——34 个 A 层/地基节点各有 1 道样题，够跑通全链。真配题 M3b 另做。
2. **写初诊算法**（KST-lite）：沿知识图谱选节点、发 boundary 题、答对向上传播 stable、答错向下标记 gap。这是整个诊断引擎的心脏。
3. **写追踪算法**（BKT）：用贝叶斯公式根据每次答题更新掌握概率——答对了概率涨、答错了概率跌。连续两次 slip 强制改判 gap。
4. **开知识地图 API**：前端能查到某个学生的知识地图状态——哪些绿了、哪些还是红的、当前学习前沿在哪。

本轮**不做**：不调 LLM、不写 UI、不做纸质包 PDF、不做探针下探自动化。纯算法 + 数据层 + API。

## 2. 任务分解

- [ ] 任务1: Item Prisma 表 + 占位种子（涉及文件: prisma/schema.prisma、prisma/seed_graph.ts）
- [ ] 任务2: KST-lite 初诊算法（涉及文件: lib/kst-lite.ts）【测试先行】
- [ ] 任务3: BKT 追踪算法（涉及文件: lib/bkt.ts）【测试先行】
- [ ] 任务4: 知识地图 API + 初诊 session API（涉及文件: src/app/api/diagnosis/）
- [ ] 任务5: 测试 + test:all 更新（涉及文件: 测试文件、package.json）

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| prisma/schema.prisma | 修改（追加 Item + KnowledgeNode 补 items 字段） | KnowledgeNode 是 M1 自建表，可以补字段 |
| prisma/seed_graph.ts | 修改 | 新增占位 Item 导入（从 sampleItem） |
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

- [ ] Item 表建在数据库里，与 KnowledgeNode 关联正确
- [ ] `npm run seed` 灌入占位 Item（34 个节点各 1 道 boundary 题）
- [ ] KST-lite 单元测试：答对所有 → 全部节点 stable；答错根节点 → 后代标 gap
- [ ] BKT 单元测试：连续答对 3 次 → masteryProb ≥ 0.85；连续答错 3 次 → masteryProb ≤ 0.30
- [ ] 连续两次 slipFlag → 强制改判 gap（防滥用粗心标签）
- [ ] GET /api/diagnosis/map?studentId=xxx 返回知识地图状态（含 learningFrontier）
- [ ] POST /api/diagnosis/initial 触发一条主线的初诊，返回 session + 各节点 status
- [ ] `test:m3:unit` + `test:m3:integration` 全部通过
- [ ] `test:all` 53+M3 ≥ 全部通过，测试容器退出码 0
- [ ] dev.db 未被测试触碰

## 5. 设计决策

### 决策①：Item 用 sampleItem 占位，不等真配题

M3b 的真配题（LLM 生成 + 人工过审）不阻塞 M3a。本轮给 34 个 A 层/地基节点各灌 1 道 boundary 题——直接用 seed_graph_batch1.ts 里已有的 `sampleItem` 字段。这够让 KST-lite 跑通全链验证。真配题后续替换/追加即可。

### 决策②：KnowledgeNode 补 `items Item[]` 字段

这是 M1 自己建的表，不是上游 wrong-notebook 表。补一个 relation 字段是安全的增量操作——不改任何已有字段，只加一行 `items Item[]`。Prisma migrate 会生成 ALTER TABLE（SQLite 实际上会重建表，但数据无损）。

### 决策③：KST-lite 算法简化版

完整 KST-lite 要"选最高信息量节点"+"4-6 个 uncertain 各补 1 题"。本轮先做简化版：
1. 指定一条主线 → 取该主线下所有 A 层节点
2. 每个节点发 1 道 boundary 题
3. 答对 → 祖先链全标 stable（沿 prereq 边向上传播到根）
4. 答错 → 该节点 + 后代标 gap 候选
5. 未被测试且不在传播范围内的 → untested
6. 输出 StudentNodeState 更新

复杂版（信息量排序、4-6 确认题）在后续轮次迭代。简化版足以验证"图谱→出题→判对错→传播状态"这条核心链路。

### 决策④：BKT 使用 TECH_PLAN_v2 专家组默认参数

```
P(L₀): 由 KST-lite 给定 (stable→0.85, uncertain→0.5, gap→0.15, untested→0.5)
T = 0.15 (遗忘概率)
G = 0.20 (猜测概率, 选择题 0.25)
S = 0.10 (失误概率)

答对: P(L|correct) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
答错: P(L|wrong)   = P(L)S / [P(L)S + (1-P(L))(1-G)]
P(L) ← posterior + (1-posterior) * T (遗忘衰减)
```

首版不学习参数，全部用默认值。连续两次 slipFlag 判定 → 强制 status=gap（防滥用粗心标签）。

### 决策⑤：知识地图 API 不限定主线

`GET /api/diagnosis/map?studentId=xxx` 返回该学生全部节点的状态 + 学习前沿（status 为 gap/untested 且其全部前置都是 stable 的节点）。`mainline` 作为可选 filter。

### 决策⑥：初诊 API 限定单主线

`POST /api/diagnosis/initial` 的 body 包含 `{studentId, mainlineId}`。每次只诊一条主线——对应 TECH_PLAN_v2 "每条主线解锁时一次"的定位。首次全线初诊由前端/编排层多次调用实现。

## 6. 风险与注意事项

| 风险 | 影响 | 对策 |
|------|------|------|
| KnowledgeNode 加 items 字段是改已有表 | Prisma migrate 在 SQLite 上可能重建表 | M1 数据只有 48 条，migrate 后跑 seed 即可恢复；确认迁移成功后再继续 |
| KST-lite 传播逻辑复杂 | 祖先/后代方向容易搞反 | 测试先行——先写 test case 固定预期，再写实现 |
| 34 道占位题不够多样化 | boundary/concept/drill 角色不全 | 本轮只有 boundary，concept/drill 后续补 |
| sampleItem 可能不合法 | 有些 sampleItem 是示意文字不是真题目 | 导入时过滤空值/null，只灌有实质内容的 |

## 7. 技术附录

### 7.1 Prisma Schema 追加

```prisma
// ============================================================
// M3 诊断引擎（个性化数学诊断辅导系统 · 增量）
// ============================================================

model Item {
  id       String @id @default(cuid())
  nodeId   String
  node     KnowledgeNode @relation(fields: [nodeId], references: [id])
  role     String        // boundary | concept | variant | drill
  stem     String        // 题干
  answer   String        // 正确答案
  analysis String?       // 解析
  source   String?       // 人工 | LLM生成-已审 | 教辅名
  reviewed Boolean @default(false) // LLM生成题必须人工过审
}
```

KnowledgeNode 末尾追加一行：
```prisma
model KnowledgeNode {
  // ...现有字段不变...
  items         Item[]        // 新增：挂接题目
}
```

### 7.2 KST-lite 算法（lib/kst-lite.ts）

```typescript
// 输入
interface KSTInput {
  mainlineId: string;
  studentId: string;
  answers: { nodeId: string; correct: boolean }[];
}

// 输出
interface KSTOutput {
  nodeStates: { nodeId: string; status: string; masteryProb: number }[];
  learningFrontier: string[]; // 1-2 个前沿节点 ID
}

/**
 * 简化 KST-lite:
 * 1. 答对的节点 → 沿 prereq 边向上：祖先链全标 stable（0.85）
 * 2. 答错的节点 → 标 gap（0.15），其 dependents 也标 gap
 * 3. 未被覆盖的 → untested
 */
function runKST(graph: KnowledgeGraph, input: KSTInput, answers: Map<string, boolean>): KSTOutput;
```

**测试先行**——标注在任务 2 里。

### 7.3 BKT 算法（lib/bkt.ts）

```typescript
interface BKTParams {
  pLearn0: number;   // 初始掌握概率
  T: number;         // 遗忘概率 (0.15)
  G: number;         // 猜测概率 (0.20)
  S: number;         // 失误概率 (0.10)
}

interface BKTResult {
  posteriorPLearn: number;   // 后验 P(L|evidence)
  updatedPLearn: number;     // P(L) ← posterior + 遗忘衰减
  slipFlag: boolean;         // 是否触发 slip 标记
}

function bktUpdate(params: BKTParams, correct: boolean, prevSlipFlag: boolean): BKTResult;

// 连续两次 slipFlag → 强制 status=gap
function checkSlipAbuse(slipHistory: boolean[]): boolean;
```

**测试先行**——标注在任务 3 里。

### 7.4 占位 Item 种子

在 `prisma/seed_graph.ts` 新增步骤 7：

```typescript
// 7. 导入占位 Item（从 sampleItem）
for (const raw of allRawNodes) {
  const sample = normalizeNode(raw).sampleItem;
  if (!sample || sample.trim() === '') continue;

  await prisma.item.upsert({
    where: { id: `placeholder-${raw.id}` }, // 占位 ID
    update: { stem: sample, role: 'boundary', answer: '(待填充)' },
    create: {
      id: `placeholder-${raw.id}`,
      nodeId: raw.id,
      role: 'boundary',
      stem: sample,
      answer: '(待填充)',
      source: 'seed_sampleItem_placeholder',
      reviewed: false,
    },
  });
}
```

### 7.5 知识地图 API

```
GET /api/diagnosis/map?studentId=xxx[&mainlineId=M1]
→ {
    nodes: [{ nodeId, name, tier, status, masteryProb }],
    learningFrontier: ["M1-07"],  // 1-2 个
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
| ① | `feat(m3): Item 表 + KnowledgeNode.items 字段 + 迁移` | schema + migration | 后置 |
| ② | `feat(m3): 占位 Item 种子导入` | seed_graph.ts 追加 | 后置 |
| ③ | `feat(m3): KST-lite 初诊算法` | lib/kst-lite.ts | **测试先行** |
| ④ | `feat(m3): BKT 追踪算法` | lib/bkt.ts | **测试先行** |
| ⑤ | `feat(m3): 知识地图 + 初诊 API` | API 路由 | 后置 |
| ⑥ | `test(m3): M3 单元测试 + 集成测试 + test:all 更新` | 测试 + scripts | — |
