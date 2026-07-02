# Stage 2.5 · 接通两个"看得见摸不着"的断点 · 开发计划

> 关联规格: doc/plan/capture-map-v1-plan.md（父计划 v1，本轮插在 Stage 2 与 Stage 3 之间）
> 关联根因分析: doc/auditlog/stage2-followup-rootcause-2026-07-02.md（本轮的驱动文档，两个断点的证据都在里面）
> 关联参考: doc/reference/OPS_handbook.md §4（前台措辞铁律）、doc/reference/TECH_PLAN_v2.md §4.1.2（渐进展开 / 不一片红）
> 计划日期: 2026-07-02
> 计划代理: plan-agent
> 预计影响: `src/app/api/diagnosis/map/route.ts`、`src/components/nana/knowledge-map/recent-cases-list.tsx`、`src/components/nana/knowledge-map/knowledge-map-canvas.tsx`、`src/app/nana/knowledge-map/page.tsx`、`src/app/nana/page.tsx`、`src/components/nana/shared/recap-bar.tsx`、`src/lib/nana/nana-api-client.ts`、`src/__tests__/integration/nana/`
> 关联安全铁律: 铁律 3（不改上游表结构）、铁律 6（显式失败、不静默）、OPS §4（措辞不越界）

---

## 🔔 本轮性质：小接通轮，不是大功能

这是一轮**接通轮**，不是新功能轮。Stage 2 把挂载骨架（CaseKnowledgeTag + 手动挂）做完了，但真机验收暴露两个"看得见摸不着"的断点：题挂上了但**点开看不到原图**、题挂上了但**地图照样全灰**。本轮只把这两个断点接通，**不碰 schema、不接真 AI**（那是 Stage 3 的事）。

**关键产品决策（评审已拍板，本轮照做不再讨论）**：
> **挂标签 ≠ 点亮掌握。**
> 挂了知识点 = "这个知识点下收过错题 / 有采集证据"，**不是**"已掌握"。绿色点亮（stable）**只能**来自测评分数写 StudentNodeState；挂标签只产生一层**琥珀色"收过题"弱标记**，跟绿色并存、不替代。

所以本轮引入一个**全新的视觉层**——"collected / has-evidence"（琥珀色），它跟既有的"stable / 已点亮"（绿色）是**两条独立图层**：
- 一个节点可以：只绿色（测过且会）、只琥珀（收过题没测过）、绿+琥珀（测过会、又收过题）、都没有（没测过没收过）。
- 措辞：琥珀层用"**收过题 / 有错题记录**"；**绝不**用"点亮 / 掌握 / 薄弱 / 会了"。

---

## 1. 大白话概述

舅舅让孩子拍了一道题、还手动给它挂了个知识点，结果在知识地图里**点开这道题只看到几个图标、看不到原图**，而且**地图上灰扑扑一片、跟没拍过题一模一样**。这两个"做了事但界面没反应"的断点，会让孩子和舅舅都困惑——"我挂了半天知识点，地图怎么一点动静没有？"

本轮要做两件事：**(1)** 点开一道题时，把这道题的原题图也拉出来显示（只点开那一条才拉，不爆列表）；**(2)** 挂了知识点的题，在地图对应节点上亮一个**琥珀色的"收过题"标记**（不是绿色的"已点亮"——绿色只能靠测评答对得到），同时首页"光点地图"提示也要认这个标记，别再对只挂过题的孩子显示空状态。

**为什么不直接把挂标签变成绿色点亮**：因为"挂了标签"只代表"这类题收过一道"，不代表"会做"——没测过就说掌握是撒谎，违反 OPS §4 措辞铁律。琥珀色是诚实的中间态：给你反馈（挂了题地图有反应），但不骗你（没说你会了）。

---

## 2. 任务分解

> 测试策略：本轮无新算法、无状态机，主要是直通 join + UI 渲染。测试后置即可（Task E 覆盖 map API 的 evidenceCount + 归属隔离）；UI 改动走真机验收。每 Task 收尾仍跑 `npm run test:all` + `npm.cmd run build`。

- [ ] **任务 A — CaseTagPanel 展开时懒加载题图（修断点 1）**
  - 在 `CaseTagPanel` 里，caseId 变化时**并行**发起两个请求：已有的 `listCaseTags(caseId)` + 新增的 `getCase(caseId)`（客户端封装已存在，见 `nana-api-client.ts:48`）。
  - 从 `getCase` 返回的 `artifacts[]` 里找 `type === "question_image"` 的那条，把 `content`（Base64）塞进面板顶部的 `<img>`。
  - 加载中显示"题图加载中…"骨架；失败显示"题图没拉到，标签仍可用"（铁律 6：不静默，但标签功能不因此中断）。
  - 涉及文件: `src/components/nana/knowledge-map/recent-cases-list.tsx`（仅 `CaseTagPanel` 内部）。**不改列表 API、不改 getCase、不改 schema。**

- [ ] **任务 B — map API 增加 `caseEvidenceCount`（修断点 2 · 后端）**
  - 在 `GET /api/diagnosis/map` 里新增**一次** groupBy 查询：按 `nodeId` 聚合 `CaseKnowledgeTag`，where 带 `case: { studentId }` 关系过滤（只用当前学生的 tag）。
  - 把结果拼成 `Map<nodeId, count>`，在响应 `nodes[]` 每个节点上加字段 `caseEvidenceCount: number`（0 = 没收过）。
  - **不碰** `status` 字段——它仍只来自 StudentNodeState。`caseEvidenceCount` 是与 `status` 并行的新字段。
  - 涉及文件: `src/app/api/diagnosis/map/route.ts`。**无新端点、无 schema 改动。**

- [ ] **任务 C — 知识地图 UI 加"收过题"琥珀层（修断点 2 · 地图前端）**
  - `KnowledgeNodeData` 类型 + map 页传参增加 `caseEvidenceCount`。
  - `knowledge-map-canvas.tsx` 渲染：`caseEvidenceCount > 0` 的节点在原有渲染（绿/蓝/灰）之上**叠加**一层琥珀色描边环（**additive，不替换**——所以 stable+collected = 绿芯+琥珀环）。未探索节点收过题时也点亮琥珀环（灰芯+琥珀环 = "收过题，还没测"）。
  - 图例加一个琥珀色样块 + "收过题"文字，跟"已点亮/下一个/未探索"并列。
  - **修正空状态判定**：当前 `isEmpty = litNodeCount < 2`（只看 stable/gap/uncertain）。若用户只挂过题没测过，会误判成空状态、把画布藏掉。改为：`isEmpty` 同时考虑"有没有节点 caseEvidenceCount>0"——有 collected 节点就不算空，画布照常显示。
  - 涉及文件: `src/components/nana/knowledge-map/knowledge-map-canvas.tsx`、`src/app/nana/knowledge-map/page.tsx`。

- [ ] **任务 D — 首页 hasRecords 判定纳入 collected（修断点 2 · 首页）**
  - `src/app/nana/page.tsx` 的 `hasRecords`：从"`status !== untested` 的节点存在"放宽为"`status !== untested` **或** `caseEvidenceCount > 0` 的节点存在"。这样只挂过题、没测过的孩子也能看到 RecapBar 而不是 EmptyHint。
  - `RecapBar` 增加"只有 collected、没点亮"的分支：措辞用"收过题"**不**用"点亮了"（DP2，详见 §6）。
  - 涉及文件: `src/app/nana/page.tsx`、`src/components/nana/shared/recap-bar.tsx`。

- [ ] **任务 E — 测试 + build**
  - 扩 `case-api.test.ts` 或新增 `map-evidence.test.ts`：map API 响应里 `caseEvidenceCount` 字段存在、挂过 tag 后计数正确、**跨用户隔离**（A 的 tag 不计到 B 的节点上）。
  - 全量 `npm run test:all` 不回归；`npm.cmd run build` 通过。
  - 涉及文件: `src/__tests__/integration/nana/`。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | `CaseTagPanel` 并行拉 `getCase` 显示题图（任务 A）|
| `src/app/api/diagnosis/map/route.ts` | 修改 | 加 groupBy 查询 + 响应节点加 `caseEvidenceCount`（任务 B）|
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | 修改 | `KnowledgeNodeData` 加字段 + 琥珀环叠加渲染（任务 C）|
| `src/app/nana/knowledge-map/page.tsx` | 修改 | 图例加琥珀样块 + 空状态判定纳入 collected + 传参（任务 C）|
| `src/app/nana/page.tsx` | 修改 | `hasRecords` 放宽 + `MapNode` 加 `caseEvidenceCount`（任务 D）|
| `src/components/nana/shared/recap-bar.tsx` | 修改 | 增加"只有 collected"措辞分支（任务 D，DP2）|
| `src/lib/nana/nana-api-client.ts` | 修改（注释/类型）| `getCase` 已存在，仅按需补题图提取辅助说明；无新端点封装 |
| `src/__tests__/integration/nana/` | 新增/修改 | map API evidenceCount + 跨用户隔离测试（任务 E）|

**不动的文件**（明确边界）：`prisma/schema.prisma`、`src/app/api/nana/cases/route.ts`（列表 API 仍不返回 base64）、`src/app/api/nana/cases/[id]/route.ts`（getCase 已就绪）、`src/lib/nana/case-classify.ts`、所有 Stage 3 文件。

---

## 4. 验收标准

### 4.1 真机清单（核心，逐条人工验）

**断点 1 —— 点开题能看到原图**
- [ ] 知识地图"最近拍过的题"里点一道拍过题图的题 → 展开面板，**顶部出现原题图**（不是图标占位符）。
- [ ] 题图加载中显示"题图加载中…"；加载完成显示图。
- [ ] 一道只有录音没题图的题 → 面板不强行显示破图，标签区正常（题图区显示"这道题没拍照"或留空，不报错）。
- [ ] 关掉再点另一道题 → 题图正确切换成新题的图（不残留上一道）。

**断点 2 —— 挂了知识点地图有琥珀反馈**
- [ ] 给一道题手动挂知识点 X → 回知识地图 → **节点 X 上出现琥珀色描边环**（不是绿色）。
- [ ] 同一个节点若已被测评点亮（绿色）→ 显示为**绿芯 + 琥珀环**（两层并存，不互相覆盖）。
- [ ] 图例里出现"收过题"琥珀色样块，跟"已点亮/下一个/未探索"并列。
- [ ] 只挂过题、从没测过的孩子：知识地图**不再显示全灰空状态**，画布照常出，挂过的节点亮琥珀环。
- [ ] 首页：只挂过题没测过的孩子 → **显示 RecapBar**（不是 EmptyHint），且措辞是"收过题"类、**不是**"点亮了"。

### 4.2 措辞走查（守 OPS §4，逐词过）

- [ ] 全页扫描新增/改动文案：**不出现** "诊断 / 已诊断 / 薄弱 / 得分 / 掌握 / 未掌握 / 失败"。
- [ ] 琥珀层相关措辞只用：**"收过题" / "有错题记录"**。
- [ ] 绿色"已点亮"语义**不变**（仍只代表测评 stable），琥珀层不偷绿色的话术。

### 4.3 自动化测试
- [ ] map API 响应 `nodes[*].caseEvidenceCount` 字段存在且为非负整数。
- [ ] TEST_STUDENT 给自己的 case 挂 tag → 该节点 `caseEvidenceCount` +1。
- [ ] **跨用户隔离**：OTHER_STUDENT 的 tag 不计入 TEST_STUDENT 的 `caseEvidenceCount`（where 关系过滤生效）。
- [ ] `npm run test:all` 不回归、`npm.cmd run build` 通过。

---

## 5. 风险与注意事项

| 风险 | 影响 | 应对 |
|------|------|------|
| **map API N+1** | 若按节点逐个 count CaseKnowledgeTag，48 节点 = 48 次查询 | **用单次 groupBy**（`by:['nodeId']` + `where:{case:{studentId}}`），1 次查询出全部计数。明确写进技术附录 §6.2 |
| **case 量增长后 groupBy 变慢** | 学生挂了几百道题后 groupBy 扫全表 | 当前量级（个位数 case）无虞；登记为观察项，将来 case>100 或 tag>500 时给 CaseKnowledgeTag 加 `(nodeId, caseId)` 复合查询或缓存。**本轮不做** |
| **琥珀层视觉与绿色冲突** | stable+collected 节点画太多环显得乱 | 琥珀环画在原节点**外圈**（半径略大于绿芯），不覆盖芯色；颜色用低饱和琥珀（#E8A33D 系），不抢绿色主角。详见 §6.3 |
| **首页 hasRecords 放宽后语义** | 只挂过题的孩子也看到 RecapBar，可能以为"已经点亮了" | RecapBar 措辞严格区分（DP2）：只 collected 时说"收过 N 道题/知识点"，**不说**"点亮了"。详见 §6.4 |
| **getCase 拉整条 base64（~1MB）** | 每点开一道题多一次 ~1MB 请求 | 可接受：只对**被点开的那一条**拉，不预拉、不在列表里拉。列表 API 仍不返回 base64（§12.2 体积纪律不变）|
| **getCase 失败连累标签** | 题图拉不到时，标签也用不了 | 两条请求**独立** try/catch：题图失败只显示"题图没拉到"，标签区照常工作（铁律 6：不静默，但局部失败不拖全局）|
| **不污染 StudentNodeState** | 万一有人图省事直接写 StudentNodeState=stable 凑绿色 | 本轮**严禁**写 StudentNodeState。挂 tag 只写 CaseKnowledgeTag（Stage 2 已有），绿色点亮仍只走 session 测评。代码 review 重点查这个 |
| **措辞越界** | 琥珀层不小心用了"已掌握/已学会" | 措辞走查清单（§4.2）逐词过；execute-agent 提交前自检 |

---

## 6. 技术附录

### 6.1 任务 A — CaseTagPanel 题图懒加载契约

**触发时机**：`CaseTagPanel` 的 `useEffect([caseId])` 里，与现有 `listCaseTags(caseId)` **并行**发起 `getCase(caseId)`。`getCase` 封装已存在于 `nana-api-client.ts:48`，返回 `CaseResponse`（含 `artifacts[].content` 完整 base64），**且已有 G1 归属校验**（`cases/[id]/route.ts:30` 的 `findFirst({where:{id,studentId}})`），安全。

**题图提取**：
```ts
// 从 getCase 返回的 artifacts 里找 question_image（seq 最小那条，防万一有多张）
const img = data.artifacts
  .filter(a => a.type === 'question_image')
  .sort((a, b) => a.seq - b.seq)[0];
// img.content 形如 "data:image/jpeg;base64,..."，直接 <img src={img.content}>
```

**状态机**（三条独立状态，互不阻塞）：
```
tagsState:  null(加载中) → CaseKnowledgeTagResponse[] | 'failed'
imageState: null(加载中) → {content:string} | 'none'(无题图) | 'failed'
```
- 题图加载中 → 面板顶部 `<div>题图加载中…</div>`（骨架）。
- 题图就绪 → `<img src={content} className="...">`（限制 max-h，防止超大图撑爆面板）。
- 无题图（artifacts 里没 question_image）→ 不显示图区，**不算错误**（有的题只录音）。
- 题图失败 → `<p>题图没拉到，标签仍可用</p>`（铁律 6：显式失败；但标签区不受影响）。

**体积纪律不变**：列表 API（`cases/route.ts:42`）仍 `select: { type: true }` 不返回 content。只有**被点开的那一条**才走 `getCase` 拉完整 base64。这是设计如此，本轮不改。

---

### 6.2 任务 B — map API caseEvidenceCount 契约

**新增查询**（插在 `map/route.ts` 现有 `states` 查询之后，`nodes` 查询之前/之后均可，互不依赖）：
```ts
// 单次 groupBy：按 nodeId 聚合当前学生的 CaseKnowledgeTag
// where.case.studentId 做关系过滤 → 只算自己的 tag（跨用户隔离）
const evidenceRows = await prisma.caseKnowledgeTag.groupBy({
  by: ['nodeId'],
  where: { case: { studentId } },
  _count: { nodeId: true },
});
const evidenceMap = new Map<string, number>(
  evidenceRows.map(r => [r.nodeId, r._count.nodeId])
);
```

**响应 shape 改动**（仅 `nodes[]` 每个元素**新增**一个字段，其余不变）：
```jsonc
// GET /api/diagnosis/map?studentId=xxx
{
  "nodes": [
    {
      "nodeId": "BG100",
      "name": "韦达定理（根与系数关系）",
      "status": "untested",          // ← 仍只来自 StudentNodeState，本轮不改
      "caseEvidenceCount": 1,        // ← 新增：该节点下收过的题数（CaseKnowledgeTag 计数）
      "masteryProb": 0.5,
      // ...其余字段不变
    }
  ],
  "learningFrontier": [...],
  "stats": { ... }                   // ← stats 不变（stable/gap/uncertain/untested 仍只数 StudentNodeState）
}
```

**铁律提醒**：
- `status` 字段**语义不变**——仍只读 `StudentNodeState`。挂 tag **不**改 `status`、**不**写 `StudentNodeState`。
- `stats` **不变**——不让 collected 影响 stable/gap/uncertain/untested 的计数（那是测评语义）。
- `caseEvidenceCount` 是与 `status` **正交**的新维度，前端按需读取。

**性能**：1 次额外 groupBy 查询。48 节点 + 个位数 case 时可忽略。观察项见 §5。

---

### 6.3 任务 C — 琥珀层视觉规格（canvas）

**渲染原则：additive（叠加），不是 replace（替换）。** 一个节点的最终外观 = 原三态渲染（绿/蓝/灰）+ 可选琥珀外环。

**琥珀环规格**（建议值，execute-agent 可微调以协调视觉）：
```
颜色：#E8A33D（低饱和琥珀，不抢绿色 #6BBF8A 主角）
位置：在节点最外圈，半径 = 原最大半径 + 4~5px
样式：描边环（stroke，非 fill），strokeWidth ≈ 2，可选极淡光晕
触发条件：node.caseEvidenceCount > 0
```

**三种节点的叠加结果**（验证用）：
| 节点原态 | + collected | 外观 |
|----------|:----------:|------|
| stable（绿芯+光晕） | 是 | 绿芯 + 琥珀外环（已点亮 + 收过题）|
| frontier（蓝虚线） | 是 | 蓝虚线 + 琥珀外环（下一个 + 收过题）|
| other/灰 | 是 | 灰芯 + 琥珀外环（**收过题但还没测**——这是断点 2 的核心反馈）|
| 任意态 | 否 | 原样不变 |

**实现位置**：`knowledge-map-canvas.tsx` 的 `renderedNodes` useMemo 里，在 stable/frontier/other 三个分支各自返回的 `<g>` 内，**条件追加**一个琥珀 `<circle>`（最底层，画在芯色之下，半径最大）。或抽一个 `<CollectedRing>` 子组件统一画。execute-agent 选实现方式，但**必须保证 additive 语义**。

**类型改动**：
```ts
// knowledge-map-canvas.tsx
export interface KnowledgeNodeData {
  // ...原有字段
  caseEvidenceCount: number;   // ← 新增
}
```
对应 `knowledge-map/page.tsx` 的 `MapNode` interface + 传给 canvas 的 props 同步加字段。

**图例改动**（`knowledge-map/page.tsx:153` 图例区）：
```
已点亮(绿) | 下一个(蓝虚线) | 未探索(灰) | 收过题(琥珀)   ← 新增第四个样块
```
样块用 `<span className="...rounded-full bg-[#E8A33D]/30 ring-2 ring-[#E8A33D]" />` 或同款 SVG 小圆。

**空状态判定修正**（`knowledge-map/page.tsx:62`）：
```ts
// 旧：只看 stable/gap/uncertain
const litNodeCount = mapData ? stats.stable + stats.gap + stats.uncertain : 0;
const isEmpty = !loading && mapData && litNodeCount < 2;

// 新：collected 节点也算"有内容"，不算空
const collectedNodeCount = mapData
  ? mapData.nodes.filter(n => (n.caseEvidenceCount ?? 0) > 0).length
  : 0;
const isEmpty = !loading && mapData && (litNodeCount < 2) && (collectedNodeCount === 0);
```
> 这样只挂过题的孩子也能看到画布 + 琥珀环，而不是"旅程从这一步开始"全灰空状态。

---

### 6.4 任务 D — 首页 hasRecords + RecapBar 措辞

**hasRecords 放宽**（`src/app/nana/page.tsx:73`）：
```ts
// 旧：const litNodes = nodes.filter(n => n.status !== 'untested');
// 新：
const litNodes = mapData?.nodes?.filter(n => n.status !== 'untested') ?? [];
const collectedNodes = mapData?.nodes?.filter(n => (n.caseEvidenceCount ?? 0) > 0) ?? [];
const hasRecords = litNodes.length > 0 || collectedNodes.length > 0;
```

**RecapBar 三态**（DP2 落地，见 §7）：
- 有点亮（litNodes>0）：维持现状——"上次你点亮了：X" / "你的地图上已经有 N 个光点了"。
- **只收过题、没点亮**（litNodes==0 && collectedNodes>0）：换措辞——"你最近收过题的知识点有 N 个" / "还没做小检查，做完就能点亮它们 ✦"。**绝不说"点亮了"**。
- 都没有：不显示 RecapBar（hasRecords=false → EmptyHint，不变）。

---

## 7. 决策点（少量，本轮小）

| # | 决策 | 推荐 | 理由 |
|---|------|------|------|
| **DP1** | 琥珀层视觉：外环 / 角标 / 描边？ | **外环（ring）** | 与现有 canvas 的圆形节点最协调；角标（badge）在密集图里易重叠；纯描边跟 frontier 的蓝虚线易混。外环 additive 最不破坏现有渲染 |
| **DP2** | 首页只 collected（没点亮）时 RecapBar 怎么写？ | **说"收过题"不说"点亮了"，按"知识点数"计数** | ① 诚实（没测过不说点亮）。② map API 的 `caseEvidenceCount` 是**按节点**计的，一道题挂多个节点会让"题数"重复计数；按"收过题的知识点数（collectedNodes.length）"计数更干净、无歧义。替代方案"收过 X 道题"需额外查 distinct case 数，本轮不值得 |

> 两个 DP 都是"推荐 + 理由"，用户可推翻。若用户对 DP2 坚持要"收过 X 道题"，需在 map API 额外返回 distinct case 计数（多一次查询或改 groupBy 维度），届时再评估。

---

## 8. 不做的事（明确边界，防范围蔓延）

- ❌ **不接真 ASR / VLM**（Stage 3）。
- ❌ **不改 schema**（CaseKnowledgeTag 在 Stage 2 已建，本轮只读它）。
- ❌ **不写 StudentNodeState**（绿色点亮只走测评，铁律）。
- ❌ **不改列表 API 返回 base64**（体积纪律不变，题图只走 getCase 点对点拉）。
- ❌ **不做独立 case 详情页**（根因分析里的方案 B，本轮不做，CaseTagPanel 内嵌题图够用）。
- ❌ **不做服务端缩略图**（根因分析里的方案 C，需图片处理管线，本轮不做）。

---

> 本计划待用户确认后，由 execute-agent 接手实施。计划代理工作到此结束。
