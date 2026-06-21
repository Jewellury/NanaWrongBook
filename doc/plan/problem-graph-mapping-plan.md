# 错题 ↔ 知识图谱 关联模型 + 批次上图交互 · 设计方案

> 关联工单: doc/reference/（原始工单在本次对话 prompt 中）
> 计划日期: 2026-06-21
> 预计影响: prisma/schema.prisma（末尾新增 model），lib/nana/（新增模块），src/app/api/nana/（新增 API），src/components/nana/（批次上图组件）
> 产出后流程: 交 Codex 架构评审 + 参谋长产品/原则评审 → 用户拍板是否进建设
> **本方案是设计蓝图，不写实现代码**

---

## 1. 大白话概述

这轮要设计一套机制，让每道错题能**挂接到知识地图的节点上**，并且在知识地图上**高亮"这批新拍的题落在哪些知识点"**，让舅舅和她可以对着地图讨论——不是对着题号对答案，而是看到"这周错的题集中在函数单调性、定义域这两个点"。

核心思路是三步走：
1. **VLM 识图**已经能从照片里提取出知识点的自然语言关键词（比如"函数单调性的证明"），我们要把这些关键词**映射到我们已有的知识节点**（比如 M1-11、M2a-07）。
2. 映射结果作为**候选**推给人（舅舅或她），由人确认或修改——**不让 VLM 直接拍板**节点归属。
3. 确认后，在知识地图上**高亮本批次新题落在的节点**，实现"对着地图看知识分布"。

反过来的效果：当她说"那道复数题"，舅舅在知识地图上点复数节点，就能看到这个节点下挂的本批次错题，引用**天然锚在节点上，不靠题号**。

---

## 1.5 原则引用（P1-P5 + 安全铁律）

本方案涉及的核心原则，统一定义与出处：

| 原则 | 内容 | 出处 |
|------|------|------|
| P1 | 图为真相源：照片是唯一可信输入，VLM 转写只作索引 | `doc/reference/TECH_PLAN_v2.md` §2 |
| P2 | 结构先于模型：图谱/节点是显式数据，VLM 只在受约束位置工作，不承担底层判定 | 同上 |
| P3 | 多问少断：粗心 vs 概念的结论不来自单次答错 | 同上 |
| P4 | 前台只报增量不报缺陷：地图上呈现"这批点亮了哪些点"，不报"你又错了一堆" | 同上 + `doc/reference/OPS_handbook.md` §4 |
| P5 | 周末数字化、周中纸质化 | `doc/reference/TECH_PLAN_v2.md` §2 |
| 铁律 3 | 不改 wrong-notebook 上游表结构，所有新功能以新增 model 挂接 | `AGENTS.md` |

### 1.6 周末分诊环节（"停一下"——拍照后、深诊前的一个轻量 pass）

> 这是 handoff 原本周末流程的延伸：批量拍 → 题面确认 → 系统分诊挑 2-3 道深诊 → 重做+录音+Newman 追问。
> 在这个流程中嵌入一个**分诊环节**——对每道错题快速"问一句"，不含评判，不按头看。一个动作同时喂**节点映射确认 + 错因种子 + 深诊选择**。

**她要做的事**（周末上屏时，不是周中）：
- 先批量拍照（我们刚优化的"别为构图紧张"），拍完不用停
- 进入分诊 pass：每道题最多轻问一句——"这题在考什么？"+"你当时卡在哪一步？"
- 可选跳过、深聊只挑 2-3 道（她选 + 系统荐）

**四道护栏**（缺任何一道都会反噬）：

| 护栏 | 规则 | 为何 |
|------|------|------|
| **时机（守 P5）** | 只在周末上屏时，绝非周中。且"拍"和"诊"分两段——先低摩擦批量拍，再做分诊 pass。不把"停一下"耦合进拍照动作 | 否则毁低摩擦、增拍照阻力 |
| **措辞（守 P4 + 医生模式）** | 问"这题在考什么 / 你当时卡在哪一步"（过程、中性、好奇）。绝不问"你的问题是什么 / 你错哪了"（缺陷、审问） | 对数学已被打击过的孩子，"考什么"vs"错哪了"一字之差就是"号脉"vs"又一次证明我不行" |
| **分量** | 每题最多一句，可跳过。深聊只挑 2-3 道（她的选择 + 系统荐），不是十几道挨个全初诊 | 全初诊 = 过载 = #1 风险：她不想再用 |
| **陪同** | 独自对 AI 口述可能像考试，优先舅舅在线/异步介入，或措辞足够温暖、支持异步（文字输入替代口述） | 脆弱孩子独自对 AI 口述 ≈ 考试感 |

**分诊数据流（如何喂进本方案的数据模型）**：
- 她说"考什么"→ 候选节点确认/纠偏 → 写入 `MistakeNode`
- 她说"卡在哪"→ 归因种子 → 写入 `ErrorRecord.newmanStage / errorType`

**效果**：一个分诊动作同时做了三件事——确认节点归属、播种归因线索、决定哪几道深聊。但前提是四道护栏全守。

---

## 2. 数据模型设计

### 2.1 核心权衡：错题本体落在哪？

> 工单要求给出权衡并定。

**选择：复用上游 `ErrorItem` 作为错题本体，Nana 专属数据全在新表。**

| 方案 | 描述 | 优缺点 |
|------|------|--------|
| **A（采纳）**：复用 ErrorItem | VLM 识别的错题写入 ErrorItem，所有 Nana 专属字段（批次/VLM 原始/去重/多照片）存新表 | ✅ 白嫖上游录入/标签/导出 PDF；✅ MistakeNode 已指向 ErrorItem.id，无需迁移；⚠️ ErrorItem 字段不完全匹配（但够用） |
| B：新建 NanaCase 表 | 完全独立的 case 表，ErrorItem 仅作可选引用 | ✅ 完全控制字段设计；❌ MistakeNode 需迁移；❌ 失去上游 UI/导出 |

**采纳 A 的理由**：
- `MistakeNode` 表已存在且使用 `mistakeId` → `ErrorItem.id`，选 A 零迁移成本
- ErrorItem 的核心字段（`originalImageUrl`, `questionText`, `answerText`, `analysis`）与 VLM 输出天然对应
- 上游已有的错题录入/标签/导出 PDF 功能可以顺手复用——一个 case 在 Nana 侧挂节点、在上游侧也能正常查看和导出
- 将来如果真要切到自有表，ErrorItem → 自有表是一次性的数据迁移，不难。反过来（自有表 → ErrorItem）则几乎不可能

### 2.2 数据模型全景（ER 关系）

```
┌────────────────────────────────────────────────────────────────┐
│                     上游 wrong-notebook（只读不改）               │
│                                                                  │
│  ErrorItem ──────────── User ──────────── Subject               │
│  (错题本体，id=主轴)                                              │
└──────────────┬───────────────────────────────────────────────────┘
               │ mistakeId (字符串引用，非外键约束)
               │
┌──────────────┴───────────────────────────────────────────────────┐
│                   Nana 扩展层（全部新表，追加挂接）                   │
│                                                                   │
│  ┌──────────────┐    N:1    ┌─────────────────┐                 │
│  │ NanaCasePhoto │─────────▶│    ErrorItem     │                 │
│  │ (多照片附件)   │          │   (错题本体)      │                 │
│  └──────┬───────┘          └────────┬────────┘                 │
│         │ 1:N                       │                            │
│  ┌──────┴───────┐          ┌────────┴────────┐                  │
│  │ NanaVlmResult │          │  NanaBatchItem   │←── N:N ──▶ NanaBatch
│  │ (VLM原始输出)  │          │  (批次↔case关联)  │            (批次)
│  └──────────────┘          └─────────────────┘                  │
│                                                                   │
│  ErrorItem ── N:M ──▶ MistakeNode ◀── N:M ── KnowledgeNode      │
│  (已有，M1 建)           (已有，M1 建)         (已有，M1 建)       │
│                                                                   │
│  ┌─────────────────────┐     ┌──────────────────────┐            │
│  │ NanaNodeCandidate    │     │ NanaUncoveredConcept  │            │
│  │ (VLM候选→节点映射记录) │     │ (未覆盖概念→驱动建图)   │            │
│  └─────────────────────┘     └──────────────────────┘            │
└───────────────────────────────────────────────────────────────────┘
```

### 2.3 新增表详细设计

#### 表 1：`NanaBatch` — 批次

> 周末一次上传 = 一个 batch。用来在知识地图上按批次高亮。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String @id | cuid |
| `studentId` | String | → User.id |
| `label` | String | 人可读标签，如"第3周·6月21日" |
| `note` | String? | 舅舅的备注（如"这周三角函数集中"） |
| `createdAt` | DateTime | |

#### 表 2：`NanaBatchItem` — 批次↔错题关联

> 一个 batch 包含多道错题，一道错题可能属于多个 batch（如果跨周复现）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `batchId` | String | → NanaBatch.id |
| `caseId` | String | → ErrorItem.id（不管叫 caseId，实际对 ErrorItem.id） |
| `@@id([batchId, caseId])` | | 联合主键 |

#### 表 3：`NanaCasePhoto` — 错题照片附件

> 一个 case 可挂多张照片（重拍、题目页+答案页），选一张作主图。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String @id | cuid |
| `caseId` | String | → ErrorItem.id |
| `photoUrl` | String | 照片存储路径 |
| `isPrimary` | Boolean @default(false) | 是否为该 case 的主图（用于列表缩略图） |
| `order` | Int @default(0) | 排序 |
| `createdAt` | DateTime | |

**设计说明**：一张照片可能含目标题+邻题夹带（handheld 分析结论）。**只取有手写作答/批改痕迹的目标题入库**（一个 case = 一道目标题 = 一个 ErrorItem），边缘仅有印刷题干、无手写的邻题残片忽略，不产生 ErrorItem。如果一张照片里确实有多道题且每道都有手写作答，则各自入库（多个 case 共享同一张源图）。一个 case 也可以挂多张照片（重拍 / 补拍答案页）。

#### 表 4：`NanaVlmResult` — VLM 原始输出

> 每一次 VLM 识别，保留原始 XML 输出，不做二次加工。这是 P1 在数据层的体现。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String @id | cuid |
| `photoId` | String | → NanaCasePhoto.id |
| `rawXml` | String | VLM 原始 XML/JSON 响应全文 |
| `knowledgePointsRaw` | String | 从 rawXml 中提取的 knowledge_points 字段（自然语言，逗号分隔，如"抽象函数的性质,函数单调性的证明"） |
| `questionText` | String | VLM 提取的题面 |
| `answerText` | String? | VLM 提取的答案（可能为空——她没写/照片里没答案） |
| `subject` | String | 学科 |
| `tokensUsed` | Int? | 消耗 token 数 |
| `modelVersion` | String? | 所用模型版本（如"doubao-pro-2026-06"） |
| `createdAt` | DateTime | |

#### 表 5：`NanaNodeCandidate` — VLM 候选 → 节点映射记录

> VLM 提取关键词后，后端做相似匹配得到的候选节点。**这是映射流程的核心表——它记录"VLM 认为这题可能对应哪些节点"，供人工确认。**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String @id | cuid |
| `caseId` | String | → ErrorItem.id |
| `nodeId` | String | → KnowledgeNode.id（候选节点） |
| `keyword` | String | 触发此候选的 VLM 关键词（如"函数单调性"） |
| `similarity` | Float | 匹配相似度（0~1，仅供排序参考） |
| `source` | String | 来源："vlm"（自动匹配）或"manual"（人工指定） |
| `confirmed` | Boolean @default(false) | 是否已被人工确认（写入后同步更新 MistakeNode.confirmed） |
| `assignedBy` | String? | 确认人标识（uncle/niece） |
| `createdAt` | DateTime | |
| `confirmedAt` | DateTime? | 确认时间 |

**与 `MistakeNode` 的关系**：`NanaNodeCandidate` 是"候选记录"——存匹配过程和相似度，供人审核。一旦确认（`confirmed=true`），同步写入 `MistakeNode`（已有表，`mistakeId=caseId, nodeId=nodeId, confirmed=true`）。如果人改选了另一个节点，也会写入 `NanaNodeCandidate`（新候选 + `source=manual`）和 `MistakeNode`。未确认的候选**不写** `MistakeNode`。

#### 表 6：`NanaUncoveredConcept` — 未覆盖概念追踪

> 当 VLM 输出的关键词在我们的 KnowledgeNode 库里找不到匹配的节点时，记录在这里。**这驱动配题/建图长尾**——哪些节点该补，从这批未覆盖概念中排优先级。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String @id | cuid |
| `caseId` | String | → ErrorItem.id（触发此标记的错题） |
| `conceptKeywords` | String | VLM 输出的原始关键词（逗号分隔） |
| `note` | String? | 舅舅的备注（如"M4 数列，待建图"） |
| `status` | String @default("pending") | "pending"（待建图）\| "mapped"（已建图并回填）\| "ignored"（确认不需建——如非高中数学内容） |
| `mappedNodeId` | String? | 建图后回填的节点 ID → KnowledgeNode.id |
| `createdAt` | DateTime | |
| `resolvedAt` | DateTime? | 解决时间 |

---

## 3. 节点映射流程（VLM 候选 → 人工确认）

### 3.1 整体流程

```
拍照上传 → VLM 识图 → 提取 knowledge_points（NL 关键词）
                              │
                              ▼
              ┌───────────────────────────────┐
              │  关键词 → 节点匹配引擎            │
              │  (相似度匹配 KnowledgeNode.name) │
              │  输出：候选节点列表 + 未覆盖标记    │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │  写入 NanaNodeCandidate         │
              │  (候选记录，confirmed=false)     │
              │  写入 NanaUncoveredConcept      │
              │  (仅无匹配的关键词)              │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  人工确认（舅舅/她）              │
              │  · 逐 case 展示候选节点           │
              │  · 人可：确认 / 换节点 / 标记不会   │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │  确认后写入 MistakeNode          │
              │  (mistakeId, nodeId, confirmed) │
              │  更新 StudentNodeState（影响地图） │
              └───────────────────────────────┘
```

### 3.2 关键词 → 节点匹配规则（不依赖 LLM）

> **守 P2**：匹配引擎是确定性算法，不调 LLM。

**匹配逻辑**（伪设计，不展开实现）：

```
输入: knowledgePointsRaw (逗号分隔的 NL 关键词列表)
输出: [(nodeId, keyword, similarity), ...]

对每个关键词 keyword:
  1. 分词/去停用词（"的""性质""求解"等）
  2. 对 KnowledgeNode.name 全库做文本相似匹配
     - 优先精确子串匹配（keyword 包含在 node.name 中，或反之）
     - 其次用编辑距离/字符重叠率（如 Jaccard on 2-grams）
  3. 取 top-3 候选，similarity ≥ 阈值（如 0.4）的纳入候选
  4. 所有关键词都没匹配 → 写入 NanaUncoveredConcept
```

**为什么不调 LLM 做匹配？** P2 结构先于模型——KnowledgeNode 是我们自己建的编码本（M1-11、BG042 等），LLM 不懂我们的编码体系，让它直接输出 nodeId 会"瞎标"。关键词是 VLM 能稳定产出的（handheld 测试已验证），关键词→节点名文本匹配是确定性、可审计的。

### 3.3 未覆盖节点的标记与回路

> 这是方案中最有机的一环：当前节点库只有 batch1（M1/M2a A 层 + BG 地基），真实错题会落到 M3–M8 等还没建的节点。

机制：
1. VLM 关键词 → 匹配失败 → 写入 `NanaUncoveredConcept`（status=pending）
2. `NanaUncoveredConcept` 积累 → 形成"该补哪些节点"的优先队列（按出现频次排）
3. 舅舅按优先级配题/建图 → 新节点入库后 → 回填 `mappedNodeId` + 更新 status=mapped
4. 回填后 → 对应的 `NanaNodeCandidate`/`MistakeNode` 也补上

**这形成了一个自然的运营闭环**：拍照 → 发现图谱空白 → 驱动建图 → 回填关联 → 下次拍照就能匹配了。

### 3.4 综合题（多节点）处理

一道综合题（如同时考定义域和单调性）→ VLM 输出多个关键词 → 匹配出多个候选节点 → 人可以确认多个 → 写入多条 `MistakeNode` 记录（`MistakeNode` 本就是 N:M 的联合主键设计）。

---

## 4. 批次上图交互设计（核心概念）

### 4.1 核心交互故事

> 周末拍了一批题 → 每道题给了候选节点 → 在知识地图上，"这批新题落在的节点"高亮 → 舅舅和她对着地图讨论"这批集中在哪几个点"。

这与传统"对题号讨论"的本质区别：

| 传统模式 | 批次上图模式 |
|----------|-------------|
| "你第 3 题错了" | "你这周在单调性上卡了 3 次" |
| 按题号逐题对答案 | 按节点看分布、找集中区 |
| 讨论题 → 讨论知识点 | 讨论知识点 → 下钻到题 |

### 4.2 交互概念与线框级描述

以下为概念级交互要素，不展开 UI 实现细节。

#### 4.2.1 批次入口

- 在 `/nana/session/[id]`（周末 session 页面）中，session 完成后出现一个按钮：「看这批题在知识地图上落在哪」
- 点击 → 进入知识地图，自动选中当前 batch，高亮本批次节点

#### 4.2.2 地图上的「批次高亮」

**核心视觉规则（守 P4——只报增量，不报缺陷）**：
- 地图上各节点默认显示已有的掌握状态（绿=已掌握、蓝/虚线=下一个前沿）
- **本批次触达的节点**——用一种**正向、不刺眼的视觉**（如暖金色光晕、节点边缘加一道光圈、或底部加一个小标记点）——表示"这周你探索到了这些点"
- **不用红色**。这些节点可能是绿（你会做，但本周又遇到了≈巩固）或蓝（你正在攻克的前沿）——它们被"点亮/触达"，不是在报错
- 措辞用"这周到达了 X 个点"，不是"错了 X 个点"

#### 4.2.3 点击节点 → 看本批次 case 卡片

- 点击一个高亮的节点 → 展开该节点下**本批次**的错题卡片列表
- 每张卡片（简版）显示：
  - 题图缩略图（主图 / 第一张照片）
  - VLM 提取的题面（一两句话）
  - 候选节点标签（如"VLM: 函数单调性 → M2a-07（90%）"）
  - 「确认」/「改节点」两个小按钮
- **这就是人确认节点归属的界面**——在地图浏览的过程中随手确认，不单独开一个"审核台"

> **设计要点**：这里同时做了两件事——① 在地图上看到知识分布（主要价值）；② 顺手确认/修正节点（管理动作，融入浏览而非独立任务）。

#### 4.2.4 人-系统互指（"那道复数题" → 点复数节点看题）

交互：她说"那道复数题" → 舅舅在地图上点复数节点（M1-14 或类似）→ 展开该节点下所有历史 case（不仅本批次）→ 通过题图缩略图快速定位。

**引用天然锚在节点，不靠题号。** 这个交互不需要额外开发"题号搜索"——它依赖的是数据模型里 MistakeNode（case ↔ node）已经建立的关联。

### 4.3 批次 ↔ 地图状态的存储

在地图上展示"批次高亮"分两阶段查询（避免"没确认就看不到这批"的鸡生蛋问题）：

**阶段 1（确认前）**：取 `NanaBatchItem` → 本批次所有 caseId → 取这些 caseId 对应的 `NanaNodeCandidate` → 暂定高亮的 nodeId 列表。在地图上用**暂定样式**（如虚线边框、半透明暖金色）显示"待确认"节点。
**阶段 2（确认后）**：取同一批次的 `MistakeNode`（confirmed=true）→ 用**实心样式**（如实心暖金色光圈）替换暂定样式。

这样地图上同时显示本批次所有相关节点：暂定（未确认 candidate）和已确认（confirmed MistakeNode）用视觉区分，人不会漏掉未确认的。

不需要额外的"批次-地图状态"表。这组查询在毫秒级（当前图 < 400 节点）。

### 4.4 与前端架构方案的衔接

| 前端方案内容 | 本方案的衔接 |
|-------------|-------------|
| 路由命名空间 `/nana/` | 批次上图入口放在 `/nana/session/[id]`（已有占位），地图页在 `/nana/knowledge-map`（已有占位） |
| 组件目录 `src/components/nana/knowledge-map/` | 新增：`batch-highlight.tsx`（批次高亮层）、`node-case-panel.tsx`（节点下case卡片面板） |
| 复用上游不 import 不改 | 知识地图画布（`knowledge-map-canvas.tsx`）只需增加"批次高亮"功能层，不改其核心渲染逻辑 |
| 切片优先级 | 本方案设计的交互可在**切片 2（知识地图查看）**中嵌入批次高亮功能 |

---

## 5. 去重策略

### 5.1 去重判断

同一道题被重复拍（她重拍 / 真题在两本书都出现）时，不要让同一个 case 重复出现。

**去重依据（两层）**：

| 层级 | 方法 | 场景 |
|------|------|------|
| **层 1：题面归一化 hash** | 对 `questionText` 做数学符号归一化（去空格、统一全角半角、展开常见 latex 缩写）→ 算 hash | 同题不同人拍/不同书出现（题面文字基本一致） |
| **层 2：题面归一化 + 已挂节点** | 在层 1 基础上，加上"已挂的节点 ID 列表"一起 hash | 更严格——同一题+同一知识节点才算重复 |

### 5.2 去重触发流程

1. 新 case 入库 → 计算 `NanaVlmResult.dedupHash`（题面归一化后 hash）→ 查同 hash 的已有 case
2. 如果命中已有的 case → 前端提示「这题好像拍过（X月X日，在复数节点下），要合并吗？」
3. 人选择：「合并」（新照片追加到已有 case 的 `NanaCasePhoto`）或「保留为新 case」（可能是同一道题的不同情况，如"第一次做和第二次做的答案不同"）
4. 去重策略："题面归一化 + 节点候选 → 提示疑似重复 → 人工确认合并"；具体 hash 算法实现时再定，现在不定死。

---

## 6. 可行性约束与守则

### 6.1 与既有方案的衔接

| 既有资产 | 本方案如何处理 |
|----------|---------------|
| `MistakeNode`（M1 已建） | **直接复用**。人工确认后写入。`NanaNodeCandidate` 存匹配过程，`MistakeNode` 存最终结果 |
| `KnowledgeNode`（M1 已建） | 作为匹配目标池，不改 |
| `StudentNodeState`（M1 已建） | 拍照错题只做"触达/待诊"标记，**不自动改 StudentNodeState**。节点归属（挂哪个点）和掌握证据（她到底会不会）是两回事——掌握度只在诊断之后（分诊/重做/双证据）才变动。守 P3（单次答错不下结论）+ P4（不铺红）。 |
| `ErrorItem`（上游） | 作为错题本体复用 |
| `NanaBatch` / `NanaBatchItem`（本方案新增） | 批次概念，用于"批次上图" |
| ` DiagnosisSession`（M2 已建） | 可关联 batch → session（一次周末 session 对应一个 batch），但先不做显式关联——batch 是比 session 更轻的概念（她可能分两次拍，但看成一整批） |

### 6.2 不做

- 不实现代码——这是设计方案
- 不建完整 UI——只给交互概念和线框级描述
- 不引入重框架——匹配引擎用纯文本相似算法，不调 LLM/不引 NLP 库
- 不改 wrong-notebook 上游表结构（铁律 3）
- 不新建测试集的题号↔节点映射表（工单明确注明那是另一件小事）
- 不在本方案中展开 ASR/VLM 识别管线（属于采集层，见 capture-layer-design-backlog 和 frontend-architecture-plan 切片 4）

### 6.3 前端命名空间隔离

守 `frontend-architecture-plan.md` 的约定：
- 路由：`/nana/session/[id]` 中加批次上图入口，`/nana/knowledge-map` 增加批次高亮功能
- 组件：新增在 `src/components/nana/knowledge-map/batch-highlight.tsx` 等
- API：新增在 `src/app/api/nana/batches/` 等下
- 所有文件与上游物理隔离，不改上游源码

---

## 7. 开放项裁决（2026-06，用户已裁决）

| # | 开放项 | 裁决 | 理由 |
|---|--------|------|------|
| 1 | 去重 hash 用哪个算法？ | **不定死**。策略为"题面归一化 + 节点候选 → 提示疑似重复 → 人工确认合并"，具体 hash 算法实现时再定 | 方向够清楚，hash 选型属实现细节，不用现在锁死 |
| 2 | 节点匹配相似度阈值？ | **不卡阈值**。给候选 top-N 让人选；阈值是实现细节，等真实数据调 | 宁可给多候选让人筛，不要因为一个拍脑袋阈值漏掉正确匹配 |
| 3 | 批次高亮的视觉颜色？ | **暖金色**方向对（守 P4 非红），具体色值交前端/design 轮定 | 方向确认，色值属视觉细节 |
| 4 | 是否与前端切片 2 绑定？ | **不强绑**。题↔图谱的数据+映射层独立先行（无论有没有前端都能服务人肉回路）；批次上图交互作为前端切片后续接入 | 数据层是筋骨，交互层是皮肉——筋骨先立，皮肉不拘泥于某一轮 |

---

## 8. 技术附录

### 8.1 Prisma Schema 草稿（伪代码，新增 model 追加到 schema.prisma 末尾）

```prisma
// ============================================================
// 错题↔知识图谱 关联模型 + 批次上图（个性化数学诊断辅导系统 · 增量）
// 全部新增表，不改 wrong-notebook 已有模型
// 对应 doc/plan/problem-graph-mapping-plan.md
// ============================================================

model NanaBatch {
  id        String   @id @default(cuid())
  studentId String                       // → User.id
  label     String                       // 人可读标签："第3周·6月21日"
  note      String?                      // 舅舅备注
  createdAt DateTime @default(now())
  items     NanaBatchItem[]
}

model NanaBatchItem {
  batchId String
  caseId  String                        // → ErrorItem.id
  batch   NanaBatch @relation(fields: [batchId], references: [id])
  @@id([batchId, caseId])
}

model NanaCasePhoto {
  id        String   @id @default(cuid())
  caseId    String                       // → ErrorItem.id
  photoUrl  String                       // 照片存储路径
  isPrimary Boolean  @default(false)    // 是否为该 case 的主图
  order     Int      @default(0)
  createdAt DateTime @default(now())
  vlmResults NanaVlmResult[]
}

model NanaVlmResult {
  id                 String   @id @default(cuid())
  photoId            String
  photo              NanaCasePhoto @relation(fields: [photoId], references: [id])
  rawXml             String              // VLM 原始 XML/JSON 全文
  knowledgePointsRaw String              // 从 rawXml 提取的 knowledge_points 字段（逗号分隔）
  questionText       String              // VLM 提取的题面
  answerText         String?             // VLM 提取的答案（可能为空）
  subject            String              // 学科
  tokensUsed         Int?
  modelVersion       String?             // 模型版本
  dedupHash          String?             // 题面归一化 hash（用于去重）
  createdAt          DateTime @default(now())
}

model NanaNodeCandidate {
  id          String    @id @default(cuid())
  caseId      String                      // → ErrorItem.id
  nodeId      String                      // → KnowledgeNode.id（候选节点）
  keyword     String                      // 触发此候选的 VLM 关键词
  similarity  Float                       // 匹配相似度（0~1）
  source      String    @default("vlm")   // "vlm" | "manual"
  confirmed   Boolean   @default(false)
  assignedBy  String?                     // 确认人
  createdAt   DateTime  @default(now())
  confirmedAt DateTime?
}

model NanaUncoveredConcept {
  id               String   @id @default(cuid())
  caseId           String                    // → ErrorItem.id（触发此标记的错题）
  conceptKeywords  String                    // VLM 关键词（逗号分隔）
  note             String?                   // 舅舅备注
  status           String   @default("pending")  // "pending" | "mapped" | "ignored"
  mappedNodeId     String?                   // 建图后回填 → KnowledgeNode.id
  createdAt        DateTime @default(now())
  resolvedAt       DateTime?
}
```

### 8.2 关键词 → 节点匹配引擎（伪代码）

```ts
// lib/nana/node-matcher.ts
//
// 注意：这是设计表达（伪代码），不写实现

interface MatchCandidate {
  nodeId: string;
  nodeName: string;
  keyword: string;      // 触发此匹配的原始关键词
  similarity: number;   // 0~1
}

/**
 * 将 VLM 提取的 knowledge_points 关键词列表映射为候选 KnowledgeNode
 */
async function matchKeywordsToNodes(
  knowledgePointsRaw: string,    // 逗号分隔的 NL 关键词
  allNodes: KnowledgeNode[],     // 从内存图或 DB 加载的全量节点列表
  threshold: number = 0.4
): Promise<{
  candidates: MatchCandidate[];
  uncovered: string[];           // 未匹配到的关键词
}> {
  // 1. 拆关键词
  // 2. 对每个关键词，遍历 allNodes，计算字符重叠率（Jaccard on 2-grams）
  // 3. similarity ≥ threshold → 候选；< threshold → uncovered
  // 4. 返回
}
```

### 8.3 批次上图的 API 路由设计（概念级）

```
GET  /api/nana/batches
     → 返回学生的批次列表 [{id, label, caseCount, createdAt}]

POST /api/nana/batches
     → 创建新批次 {label?, caseIds[]}

GET  /api/nana/batches/[id]/map
     → 返回本批次在地图上触达的节点 [{nodeId, caseCount, cases[]}]

GET  /api/nana/cases/[id]/candidates
     → 返回某 case 的候选节点列表 [{nodeId, keyword, similarity, confirmed}]

POST /api/nana/cases/[id]/confirm-node
     → 确认/修改节点归属 {nodeId, action: "confirm"|"change"|"remove"}
     → 写入 MistakeNode + 更新 NanaNodeCandidate.confirmed

GET  /api/nana/nodes/[id]/cases
     → 返回某节点下所有 case（用于"点节点看题"）
     → 支持 ?batchId=xxx 过滤只看某批次
```

### 8.4 前端交互关键数据流

```
批次选择 → GET /api/nana/batches/[id]/map
         → 返回 { nodes: [{nodeId, batchCaseCount, cases}] }
         → 知识地图渲染时，对 nodes 中的 nodeId 叠加批次高亮视觉层

点击节点 → GET /api/nana/nodes/[id]/cases?batchId=xxx
         → 返回该节点下本批次的 case 卡片列表（缩略图+题面+候选状态）
         → 用户点确认/改节点 → POST /api/nana/cases/[id]/confirm-node
```

### 8.5 文件变更清单（本方案建设时的预估）

| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 末尾追加 | 新增 6 个 model（NanaBatch/NanaBatchItem/NanaCasePhoto/NanaVlmResult/NanaNodeCandidate/NanaUncoveredConcept） |
| `prisma/migrations/` | 新增目录 | 自动生成的迁移 SQL |
| `lib/nana/node-matcher.ts` | 新增 | 关键词→节点匹配引擎 |
| `lib/nana/batch-service.ts` | 新增 | 批次创建/查询/统计服务 |
| `src/app/api/nana/batches/route.ts` | 新增 | 批次 CRUD API |
| `src/app/api/nana/batches/[id]/map/route.ts` | 新增 | 批次地图数据 API |
| `src/app/api/nana/cases/[id]/candidates/route.ts` | 新增 | case 候选节点 API |
| `src/app/api/nana/cases/[id]/confirm-node/route.ts` | 新增 | 确认节点 API |
| `src/app/api/nana/nodes/[id]/cases/route.ts` | 新增 | 节点下 case 列表 API |
| `src/components/nana/knowledge-map/batch-highlight.tsx` | 新增 | 批次高亮图层组件 |
| `src/components/nana/knowledge-map/node-case-panel.tsx` | 新增 | 节点下 case 卡片面板 |

---

> **产出后流程**：本方案 → **Codex 架构评审**（重点看数据模型是否守铁律 3、节点匹配逻辑是否违背 P2、批次上图交互是否守 P4 正向原则、与 MistakeNode 和前端方案衔接是否正确）→ **参谋长产品/原则评审**（重点看交互"对着地图讨论"的用户体验是否成立、未覆盖回路是否有机、去重策略是否够用）→ 用户拍板是否进建设。
