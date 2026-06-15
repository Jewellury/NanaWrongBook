# M3c 周末编排 + 纸质包 · 开发计划

> 关联工单: doc/reference/M3c_session_pdf_workorder.md
> 计划日期: 2026-06-15
> 预计影响: lib/diagnosis-orchestrator.ts（新增）、src/app/api/diagnosis/session-items/（新增）、src/app/api/diagnosis/submit-answers/（新增）、src/app/api/diagnosis/paper-pack/（新增）、src/app/diagnosis/paper-pack/（新增打印页）、测试文件

## 1. 大白话概述

**这轮要做什么**：把 M2（会话状态机）和 M3a（初诊算法/BKT/地图）的零件**串起来**，让系统第一次能端到端跑通一次周末诊断——从"拿到题单 → 人工判分录入 → 地图更新 → 打印纸质练习包"。

**为什么要做**：现在最大风险不是算法不够好，而是"她到底会不会用"。这轮目标是让舅舅能在**一个周末**真正给她跑一次初诊、周中给她一张练习纸。这是验证项目存活力的最小可用闭环。

**具体三件事**：
1. **初诊编排**：给定学生+主线，系统从题库里挑出该测的 boundary 题，组成"题单"；舅舅拿题单给她做、手动判分、把对错录回系统
2. **结果持久化**：系统收到答案后，**KST 只管未作答节点的结构传播，作答节点直接用既有 StudentNodeState 先验跑 BKT**（一道题 = 一份证据，不重复计数）。把每个知识点的掌握状态写进 `StudentNodeState` 表（跨会话可读），同时用 `DiagnosisSession` + `ProbeRecord` 记录这次诊断
3. **纸质包生成**：根据地图上的"学习前沿 + 少量最高优先 gap"，从题库选 variant（隔天复测）和 drill（练熟练）题，**总量封顶 ~6-10 题**，生成一张轻量、可打印的练习单（含封面、鼓励语、答案分页），复用基座现有的浏览器打印模式

本轮**不做**：LLM判分、花哨UI、探针下探自动化、跨主线诊断。

## 2. 关键发现（调研结论）

在写具体任务前，先把工单里的 6 个决策逐一回应：

### 决策 A：StudentNodeState 持久化 — ✅ 已就绪
M3a 的 `POST /api/diagnosis/initial` **已经实现** `prisma.studentNodeState.upsert()` 写入。
`GET /api/diagnosis/map` 也从 DB 读取持久化状态。**本轮不需要补持久化，直接用现有能力。**

### 决策 B：判分仍人工 — ✅ 延续
M3c 的题单 API 只返回题目，答案提交 API 的 `correct` 字段由调用方（舅舅）给定。与 M3a 决策⑦一致。

### 决策 C：纸质包选题逻辑
- boundary → 初诊用（题单 API）
- variant → 纸质包用（隔天复测，验证学习转移）
- drill → 纸质包用（熟练度练习）
- concept → 不进入任何自动流（决策⑧延续）

### 决策 D：P4 后台化（措辞铁律）
纸质包只呈现"这周练什么"和绿点进展。措辞正向：不说"你又错了"，说"这周咱们巩固一下这个"。可把周中三条极简规则印在单子上。

### 决策 E：PDF 选型 — 复用浏览器打印模式
经查，wrong-notebook 的"错题导出打印 PDF"功能就是 `src/app/print-preview/page.tsx`——一个 React 页面，用 `window.print()` + `@media print` CSS 实现。**项目中没有任何服务端 PDF 库**（无 jspdf/pdfkit/puppeteer）。

**本轮方案**：走同样路线——新建 `src/app/diagnosis/paper-pack/` 打印页，渲染 HTML → 浏览器打印对话框 → 另存为 PDF。零新依赖。

### 决策 F：是否新增表 — 本轮不建
`DiagnosisSession`（kind='weekend'）+ `ProbeRecord` 已经能追溯"哪天给谁发了哪些题"。如果需要记"本周发了哪份纸质包"，可以在 `DiagnosisSession` 上加一个 `paperPackGeneratedAt` 字段（nullable DateTime），比建新表更轻。本轮先不加，纸质包按需生成即可。

## 3. 任务分解

- [ ] **任务 1**：初诊编排器 `lib/diagnosis-orchestrator.ts`【测试先行】
  - 输入 `studentId + mainlineId` → 取该主线 A 层节点 → 从 Item 表查 boundary 题 → 返回题单
  - 不涉及 DB 写入，纯查询+组装逻辑

- [ ] **任务 2**：答案提交编排【测试先行，本轮最关键的逻辑】
  - 输入 `sessionId + answers[{nodeId, correct}]` → 分两条线处理：
    - **作答节点**：从 `StudentNodeState` 取既有 masteryProb 作为 BKT 的 `pLearn0`（首次诊断无记录则用中性 0.5），只吃本次答案一次 → 更新 masteryProb + status
    - **未作答节点**：KST 结构传播——答对时祖先链标 stable（仍用 KST 默认 0.85），答错时后代标 gap（仍用 KST 默认 0.15），前提是这些后代未被本次直接作答
  - → upsert StudentNodeState → 创建 ProbeRecord
  - **核心原则：一道题 = 一份证据。KST 不做作答节点的概率赋值，BKT 不吃同一份答案两次。地图随复诊如实涨跌，不出现 0.96 先验锁死。**
  - **测试断言铁律**：期望值用公式现算（import `bktUpdate` 调一次得到），或断言区间（如 `expect(p).toBeGreaterThan(0.3) && expect(p).toBeLessThan(0.7)`）。严禁硬编码 0.84/0.61 等手工小数→会钉成错误标准。

- [ ] **任务 3**：题单 API `POST /api/diagnosis/session-items`
  - 创建 session（kind='weekend'）+ 返回 boundary 题单
  - 响应包含：sessionId + 题目列表（id/stem/answer/analysis）

- [ ] **任务 4**：答案提交 API `POST /api/diagnosis/submit-answers`
  - 接收答案 → 调用编排器 → 返回更新后的地图状态 + 学习前沿

- [ ] **任务 5**：纸质包选题 API `GET /api/diagnosis/paper-pack?studentId=xxx[&maxItems=10][&maxNodes=4]`
  - 查 StudentNodeState → 取 frontier 节点（优先） + 少量最高优先 gap 节点（按 tier→高考权重排序截断）
  - 节点数封顶 3-4 个（frontier 优先占位，剩余名额给 gap），避免"一片红"吓人
  - 每节点选 1-2 道 variant/drill（variant 优先），总题量控制在 ~6-10 道
  - 返回分好组的题目数据（练习区 + 答案区），供打印页消费

- [ ] **任务 6**：纸质包打印页 `src/app/diagnosis/paper-pack/page.tsx`
  - 客户端页面，调用 paper-pack API → 渲染 HTML → `window.print()`
  - 布局：封面（名字+"本周练习"+鼓励语）→ 练习题（留手写空间）→ 答案页（分页）
  - `@media print` CSS：隐藏浏览器 UI、分页控制、A4 尺寸
  - 复用基座 `print:hidden` / `print:p-0` 等 Tailwind print 修饰符风格

- [ ] **任务 7**：测试 + test:all 更新
  - 单元测试：编排器逻辑、纸质包选题逻辑
  - 集成测试：session-items API → submit-answers API → paper-pack API 完整链路
  - 测试容器 dev.db 隔离
  - `package.json` 新增 `test:m3c:unit` / `test:m3c:integration`，并入 `test:all`

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/diagnosis-orchestrator.ts` | **新增** | 初诊编排：题单组装 + 答案提交处理 + 纸质包选题 |
| `src/app/api/diagnosis/session-items/route.ts` | **新增** | POST：创建 session + 返回 boundary 题单 |
| `src/app/api/diagnosis/submit-answers/route.ts` | **新增** | POST：提交答案 → KST+BKT → 持久化 |
| `src/app/api/diagnosis/paper-pack/route.ts` | **新增** | GET：返回纸质包选题数据 |
| `src/app/diagnosis/paper-pack/page.tsx` | **新增** | 打印页（React 客户端组件） |
| `src/__tests__/unit/diagnosis-orchestrator.test.ts` | **新增** | 编排器单元测试 |
| `src/__tests__/integration/m3c-flow.test.ts` | **新增** | 端到端集成测试 |
| `package.json` | 修改 | 新增 test:m3c:unit / test:m3c:integration；更新 test:all |

## 5. 验收标准

> 测试策略：编排器、BKT 集成、纸质包选题是逻辑重模块 → **测试先行**。
> API 路由（session-items / submit-answers / paper-pack）是样板 → 后置。
> 打印页是纯 UI → 后置，手动检查打印预览。

- [ ] `POST /api/diagnosis/session-items`：创建 weekend session，返回该主线 A 层节点的 boundary 题（每题含 id/stem/answer/analysis），答案字段不出现在"给学生做的题单"视图
- [ ] `POST /api/diagnosis/submit-answers`：作答节点 BKT 从既有先验出发（首诊 0.5），不取 KST 传播值；KST 只传播未作答祖先/后代；StudentNodeState 落库；ProbeRecord 写入；一道题 = 一份证据，不重复计数
- [ ] `GET /api/diagnosis/paper-pack`：返回 frontier（优先）+ 少量最高优先 gap 节点的 variant/drill 题，节点数 ≤ 4，总题量 ~6-10，按节点分组；标注每节点入选理由（frontier/gap）
- [ ] 打印页：封面可见学生名+日期+一句鼓励语；练习题区留手写空间；答案页与练习题分页；浏览器打印对话框可另存为 PDF
- [ ] 措辞正向：题单/打印页中无"错误""答错""gap"等负面词汇；练习单措辞为"这周咱们巩固一下……"
- [ ] `test:m3c:unit` + `test:m3c:integration` 全部通过
- [ ] `test:all` 全部通过，测试容器退出码 0
- [ ] 端到端：创建 session → 拿 boundary 题 → 提交答案 → 地图 API 读到更新 → 纸质包 API 返回练习题

## 6. 风险与注意事项

1. **⚠️ BKT 首次真实集成，防止双重计数（本轮命门）**：M3a 的 BKT 只是纯函数，从未在 API 里真正调用过。M3c 首次把它编入写入链路。**关键规则**：作答节点的 BKT 起点 `pLearn0` 取 `StudentNodeState` 既有先验（首诊无记录 = 0.5），不取 KST 的结构传播值。KST 只管未作答的祖先/后代。同一场 session 内 `crossSessionT = 0`。

2. **M3a `/initial` 一步式 API 与 M3c 两步式的关系**：`POST /api/diagnosis/initial` 是一步式（创建 session + KST + 持久化全部一次完成），且其 KST→BKT 链路存在与本轮相同的双重计数问题。**本轮 submit-answers 上线后，建议直接让两步式取代一步式**——在 `/initial` 路由上加 deprecation 标记，后续轮次移除。短期共存期间，编排器提取共用逻辑避免代码分叉。

3. **SlipFlag "连续两次"需要持久化 slip 历史**：当前 `StudentNodeState.slipFlag` 只有单个 boolean，无法记录"连续两次"的历史。初诊首轮不会触发此判定（每个人每个节点只有一次作答），但复诊时就需要 slip 历史追踪。**本轮记录设计债**，将来可通过给 `StudentNodeState` 追加 `slipCount`（Int）字段解决。

4. **打印页体验依赖浏览器**：不同浏览器的打印对话框行为不同。验收时至少验证 Chrome 打印预览 → 另存为 PDF 的路径。

5. **上游文件零冲突**：本轮所有新增文件都在自建路径（`lib/`、`src/app/api/diagnosis/`、`src/app/diagnosis/`），不碰 wrong-notebook 上游文件。Prisma schema 也不需修改（所有需要的表已存在）。

6. **纸质包题目不足时的 fallback**：如果 frontier + 少量 gap 节点的 variant/drill 题不够（M3a 种子每个节点至少 1 道 variant，但不是每个都有 drill），fallback 链：variant → drill → boundary 补位。但**绝不因题目不足而扩大节点选择范围**——宁可纸轻不铺一沓。

## 7. 技术附录

### 7.1 诊断编排器签名草稿

```typescript
// lib/diagnosis-orchestrator.ts

interface BuildItemSheetInput {
  studentId: string;
  mainlineId: string;
}

interface BuildItemSheetOutput {
  sessionId: string;
  items: ItemSheetEntry[];  // boundary 题，不含 answer（给学生的题单）
  itemCount: number;
}

interface ItemSheetEntry {
  itemId: string;
  nodeId: string;
  nodeName: string;
  stem: string;       // 题干
  // 注意: answer 不返回给"题单"视图，单独放答案页
}

interface SubmitAnswersInput {
  sessionId: string;
  studentId: string;
  mainlineId: string;
  answers: { nodeId: string; itemId: string; correct: boolean }[];
}

interface SubmitAnswersOutput {
  nodeStates: { nodeId: string; status: string; masteryProb: number }[];
  learningFrontier: string[];
  sessionStep: string;  // 当前 SessionMachine 步骤
}

interface PaperPackInput {
  studentId: string;
  maxItems?: number;   // 总题量上限，默认 10
  maxNodes?: number;   // 节点数上限，默认 4（frontier 优先，剩余给 gap）
}

interface PaperPackOutput {
  studentName: string;
  generatedAt: Date;
  totalItems: number;
  groups: {
    nodeId: string;
    nodeName: string;
    reason: 'frontier' | 'gap';  // 为什么选中这个节点
    practiceItems: { itemId: string; stem: string; role: string }[];
  }[];
  answerKey: {
    itemId: string;
    answer: string;
    analysis?: string;
  }[];
}
```

### 7.2 BKT 集成逻辑（修正：一道题 = 一份证据）

```
// === 作答节点的处理（BKT 直接更新） ===
对每个被答题的节点：
  // 起点：取 StudentNodeState 既有先验，不是 KST 的结构传播值
  查 DB: StudentNodeState.findUnique(studentId, nodeId)
  P(L₀) = 有记录 ? state.masteryProb : 0.5  // 首次诊断用中性起点

  crossSessionT = 0  // 同场初诊，无学习转移

  bktUpdate({ pLearn0: P(L₀), G:0.20, S:0.10, crossSessionT:0 }, correct)
  → posteriorPLearn, updatedPLearn, slipFlag

  status 判定：
    updatedPLearn ≥ 0.70  → stable
    updatedPLearn ≤ 0.30  → gap
    0.30 < updatedPLearn < 0.70 → uncertain
    // slipFlag 连续 2 次 → gap（首诊不触发，将来复诊用）

  → upsert StudentNodeState(nodeId, status, masteryProb=updatedPLearn)

// === 未作答节点的处理（KST 结构传播） ===
// KST 只做祖先/后代的批量定性，不去碰已被 BKT 定量更新过的作答节点
答对节点(nodeId) → 其未作答祖先链 → status=stable, masteryProb=0.85
答错节点(nodeId) → 其未作答后代   → status=gap,    masteryProb=0.15

// 约束：若后代/祖先恰好在 answers 里（被本次作答），跳过不覆盖
```

**为什么这样改**：
- 旧链路：KST 定 0.85/0.15 → BKT 再吃同一答案 → 冲到 0.96/0.02，一道边界题锁定地图
- 新链路：作答节点只看既有先验 + 本次答案（BKT），未作答节点只看结构关系（KST），**同一份证据只用一次**

**BKT 数值验证（用计划参数 G=0.20, S=0.10，供测试断言参考）**：

```
首诊 P(L₀)=0.5, 答对 (correct=true):
  num = P(L)(1-S) = 0.5 × 0.9 = 0.45
  denom = 0.45 + (1-0.5) × 0.2 = 0.45 + 0.10 = 0.55
  posterior = 0.45/0.55 ≈ 0.82   ← 不会冲到 0.96

复诊 P(L₀)=0.82（上次首诊后验）, 答错 (correct=false):
  num = P(L)S = 0.82 × 0.1 = 0.082
  denom = 0.082 + (1-0.82) × (1-0.2) = 0.082 + 0.18×0.8 = 0.082 + 0.144 = 0.226
  posterior = 0.082/0.226 ≈ 0.36
  若跨 session 施加 T=0.15: updated = 0.36 + 0.64×0.15 ≈ 0.46
  结论: 0.82→0.36(或 0.46)，从 stable 跌入 uncertain，地图随证据如实涨跌。✓

复诊 P(L₀)=0.50（中性，如跨主线复诊）, 答错:
  num = 0.5 × 0.1 = 0.05
  denom = 0.05 + 0.5 × 0.8 = 0.05 + 0.40 = 0.45
  posterior = 0.05/0.45 ≈ 0.11
  含 T=0.15: updated = 0.11 + 0.89×0.15 ≈ 0.24 → 仍为 gap。✓
```

**跨 session T 何时施加**：
- 同场 session 内逐题更新：`crossSessionT = 0`（连续答题无时间流逝，T 不施加）
- 跨 session（本次 sessionId ≠ 上次记录的 sessionId）：`crossSessionT = 0.15`
- T 施加在 BKT posterior 之后，**无论答对答错都加**——T 建模的是"两场之间她可能通过其他途径学会了"，不是"答对奖励"。这与标准 BKT 一致

**测试断言铁律**：
- 绝不硬编码 0.61 这类拍脑袋小数。测试期望值要么用公式现算（测试文件里 import `bktUpdate` 调一次得到），要么断言"状态落在合理区间"（如 `expect(masteryProb).toBeGreaterThan(0.3) && expect(masteryProb).toBeLessThan(0.7)`）。严禁测试作者"凑数字"让错误代码绿。

### 7.3 API 路由签名

```
POST /api/diagnosis/session-items
  body: { studentId, mainlineId }
  → 201 { sessionId, items: [...], itemCount }

POST /api/diagnosis/submit-answers
  body: { sessionId, studentId, mainlineId, answers: [{nodeId, itemId, correct}] }
  → 200 { nodeStates: [...], learningFrontier: [...], sessionStep }

GET /api/diagnosis/paper-pack?studentId=xxx[&maxItems=10][&maxNodes=4]
  → 200 { studentName, generatedAt, totalItems, groups: [{nodeId, nodeName, reason, practiceItems}], answerKey: [...] }
```

### 7.4 打印页路由

```
src/app/diagnosis/paper-pack/page.tsx
  → 客户端页面
  → 通过 searchParams 传 studentId
  → useEffect 调 GET /api/diagnosis/paper-pack
  → 渲染封面 + 练习区 + 答案区
  → 按钮触发 window.print()
```

### 7.5 纸质包措辞模板（P4 铁律）

- 封面标题："{名字}，这周的练习小纸条 ✨"
- 鼓励语：随机一句正向鼓励（"每天 10 分钟，慢慢变厉害" / "上次你已经跨过了第一关，这周继续"）
- 题目区标题："这周咱们练练这个 →"
- 答案区标题："给大人的答案页（做完再看哦）"
- 页脚三条规则：
  1. ✏️ 过程写在题目旁边，别擦
  2. 🏷️ 做不出来的贴个标签，不空着
  3. ➡️ 卡住了画个箭头，跳到下一题
