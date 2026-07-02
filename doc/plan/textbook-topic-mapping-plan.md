# 课本目录标签层 · 开发计划（学生可见分类 ↔ 系统 KnowledgeNode 映射）

> 关联工单: doc/reference/2026-07-02_1051_workorder_textbook-topic-mapping.md（本轮驱动文档，7 问 + 8 节）
> 输入材料: doc/research/教材知识点.md（人教 A 版必修第一册 + 必修第二册 册-章-节 结构 + 别名 + 易混淆 + 映射注意）
> 父计划: doc/plan/capture-map-v1-plan.md（v1 闭环：Stage 1/2/3/4）
> 关联轮次: doc/plan/capture-map-v1-stage2.5-plan.md（Stage 2.5 接通轮，进行中；本轮与它的 CaseTagPanel 衔接）
> 关联参考: doc/reference/TECH_PLAN_v2.md（§知识图谱数据层）、doc/reference/OPS_handbook.md（§4 措辞铁律）
> 计划日期: 2026-07-02
> 计划代理: plan-agent
> 预计影响: `src/components/nana/knowledge-map/recent-cases-list.tsx`（Stage A 起）、新增 `src/lib/nana/textbook-topic.ts`、新增 `src/app/api/nana/cases/[id]/topic-tags/route.ts`、`prisma/schema.prisma`（**Stage B/C 涉及新增 model，须单独确认**）、`prisma/seed/`（新增 textbook seed）、`src/__tests__/`
> 关联安全铁律: 铁律 1（破坏性操作须确认 · schema 改动单独章节待确认）、铁律 3（不改上游表结构）、铁律 5/6（遇错停下、显式失败）、OPS §4（措辞不越界）

---

## ⚠️ 决策点（顶部待确认 · 评审拍板后 Stage A 才能开做）

| # | 决策 | 推荐 | 理由 |
|---|------|------|------|
| **DP1** | 孩子视角标签怎么存：新建 `CaseStudentTopicTag` vs 复用 `CaseKnowledgeTag`(source="student")？ | **新建 `CaseStudentTopicTag` 表**（Stage B） | 工单 §2 明确问"是否单独存"。复用一张表会把"孩子认为这题和什么有关"（证据）和"系统/VLM 判定属于哪个节点"（诊断候选）混在一起，极易把孩子标签误读为系统结论（违反工单原则 2）。新表干净隔离"孩子视角" vs "系统视角"，且是新增 model 不碰上游（铁律 3）。代价是多一张表 + Stage B 须确认 migration（铁律 1）。 |
| **DP2** | 映射粒度：章级 vs 节级？ | **孩子选章级（粗），系统映射走节级（细）** | 调研材料有册-章-节三层。孩子直觉停在"集合 / 函数 / 向量 / 立体几何"（章级），不会想"1.1 还是 1.2"。章级匹配孩子的认知颗粒度，也最接近课堂叫法。节级（1.1/1.2）留给系统侧映射精度（Stage C），孩子不直接看节编号。章级下拉项 ~9 个（必修一 4 章 + 必修二 3 章 + 未覆盖兜底），比 48 节点友好得多。 |
| **DP3** | 覆盖缺口：调研只覆盖必修一/二，选择性必修/选修（数列、导数、解析几何、概率统计）怎么办？ | **v1 标"暂未覆盖"+ 允许自由文本** | 调研材料已注明只覆盖必修第一册 + 必修第二册。硬塞未调研章节会污染映射质量。v1 只 seed 调研覆盖的章节；下拉末尾加"其他 / 暂未覆盖"分组，孩子选它后可输入自由文本（存为字符串，不做 node 映射）。作为已知限制写进风险节，不假装覆盖全。 |
| **DP4** | 与 Stage 2.5（进行中）的先后顺序？ | **Stage 2.5 先上线，本计划 Stage A 在其后** | Stage 2.5 正在修两个断点（点开看不到题图、地图全灰），它已经把 CaseTagPanel 的 48 节点下拉做出来了。若并行改 CaseTagPanel 会撞文件、撞语义。Stage 2.5 完成且合并后，本轮 Stage A 再"换下拉数据源"——把 48 节点换成课本目录，是纯替换不增功能，风险最低。 |
| **DP5** | TextbookTopic 数据从哪来：seed 脚本 vs 管理后台可编辑？ | **v1 用 seed 脚本（静态），管理后台编辑留后续** | 调研材料 `教材知识点.md` 已经是结构化表格，写个 seed 脚本（仿现有 `seed_graph`）一次性灌库最稳。管理后台编辑 UI（增删章节、改别名）属运营增强，v1 不做，避免范围蔓延。 |

> 五个 DP 都是"推荐 + 理由"，用户可推翻。若推翻 DP1（改复用 CaseKnowledgeTag），则 Stage B schema 改动消失但语义污染风险上升，需在计划里补"如何防止孩子标签被读成系统结论"的额外约束。

---

## 1. 大白话概述

现在孩子（或舅舅帮孩子）给一道错题手动挂知识点时，下拉里蹦出来的是系统内部的 **48 个 KnowledgeNode**——什么 `BG100 韦达定理`、`M1-11 函数概念边界`。这套名字是给诊断引擎和工程调试用的，孩子看不懂，也不知道该选哪个。

这一轮要做一件简单的事：**把那个下拉换成孩子熟悉的课本目录**。孩子看到的是"集合与常用逻辑用语""函数的概念与性质""平面向量""立体几何初步"这种课本章节名（人教 A 版必修一 + 必修二），还能用口语别名搜（打"二次"能命中"一元二次函数、方程和不等式"）。孩子挂上去的，是"**我认为这题跟函数有关**"——这是**证据**，不是诊断结论；它绝不能让地图变绿（绿色只能靠测评答对），但它**可以**让地图节点亮一圈琥珀色"收过题"环（这个琥珀层 Stage 2.5 已经接通）。

关键产品纪律（工单原则 2/3 + OPS §4，**不可违反**）：
- 孩子挂标签 = 孩子的视角，**不是**"系统确认属于某节点"，**不是**"孩子掌握"，**绝不能**写 `StudentNodeState`，**绝不能**让节点变绿。
- 系统和孩子标签不一致时，v1 **只做温和共存**（"你收在函数图像，可能还和代数式变形有关"），**不说**"你选错了"。多题模式提示留到后续阶段。
- 课本目录标签和系统 48 节点是**两层**，通过一张映射表关联（多对多），但孩子永远只看到课本那层。

---

## 2. 当前实现盘点（工单要求 #1）

### 2.1 孩子手工挂题的现状（Stage 2 + Stage 2.5 已落地）

| 维度 | 现状 | 问题 |
|------|------|------|
| 挂题入口 | `src/components/nana/knowledge-map/recent-cases-list.tsx` 的 `CaseTagPanel`（知识地图"最近拍过的题"里点开一道题） | 入口本身没问题，本轮不动 |
| 下拉数据源 | **48 个 KnowledgeNode**（由知识地图页 `/api/diagnosis/map` 加载后作为 `nodes` props 传入 CaseTagPanel，见 `recent-cases-list.tsx:165`） | **核心问题**：48 个系统节点名（BG100/M1-11…）直接暴露给孩子，看不懂 |
| 存储表 | `CaseKnowledgeTag`（Stage 2 已建，`source="manual"`） | 单表混存，没有"孩子视角" vs "系统视角"的隔离 |
| 搜索 | 无（纯 `<select>` 下拉 48 项） | 48 项没分组没搜索，找不着 |
| 多标签 | 支持（同 case 可挂多个 nodeId，`@@unique([caseId,nodeId,source])`） | OK，本轮保留 |
| 反馈到地图 | Stage 2.5 已接通琥珀"收过题"环（`caseEvidenceCount` 按 `CaseKnowledgeTag` groupBy） | **本轮必须保证**：换成课本目录后，琥珀环仍能亮（依赖 Stage C 的课本→node 映射，否则 Stage A/B 阶段琥珀环会断） |
| 措辞 | "知识点 / 选一个知识点 / 挂上 / 已挂上 / 这个已经挂过了" | 基本合规，本轮微调为"收到哪个章节" |

### 2.2 已有数据资产（可直接复用）

- **KnowledgeNode（48 节点）**：系统侧，不动。本轮给它配一张"课本目录→节点"映射表。
- **CaseKnowledgeTag**：Stage 2 已建。**本轮 DP1 推荐保留它做"系统视角标签"**（VLM/规则/管理员挂的），孩子视角走新表 `CaseStudentTopicTag`。
- **Stage 2.5 琥珀层**：`caseEvidenceCount`（map API）+ canvas 琥珀环 + RecapBar"收过题"措辞。**本轮 Stage A/B 必须保证琥珀环不灭**——见 §9（Stage A 的过渡方案）和 §11 风险。
- **调研材料** `教材知识点.md`：结构化表格（册/章/节 + student_display_name + aliases + typical_problem_types + common_confusions + prerequisite_topics + mapping_notes）+ 简化下拉目录（line 29-60）。**这是 TextbookTopic seed 的唯一数据源**。

### 2.3 调研材料的覆盖范围（**已知缺口，不假装全覆盖**）

调研只整理了**人教 A 版必修第一册 + 必修第二册**：
- 必修一 4 章：集合与常用逻辑用语、一元二次函数方程不等式、函数的概念与性质、基本初等函数(Ⅰ)
- 必修二 3 章：平面向量及其应用、复数、立体几何初步

**未覆盖**（选择性必修 / 选修）：数列、导数、解析几何（直线与圆 / 圆锥曲线）、概率统计、计数原理等。这些是高三复习大头，但本轮**不硬塞**——走 DP3 的"暂未覆盖 + 自由文本"兜底。

---

## 3. 推荐方案（工单要求 #2）

### 3.1 分层架构（核心）

```
┌─────────────────────────────────────────────────────────────┐
│  孩子看到的层（课本目录标签 TextbookTopic）                   │
│  册 > 章（"函数的概念与性质"），可按别名搜（"函数性质"）        │
│  孩子挂 → CaseStudentTopicTag（新表，DP1）                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ 多对多映射（TextbookTopicKnowledgeNode，Stage C）
                          │ 一个章可映射多个 node，一个 node 也可被多个章映射
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  系统内部的层（KnowledgeNode，48 节点）                       │
│  用于：诊断引擎、依赖图谱、知识地图、VLM 自动分类             │
│  系统挂 → CaseKnowledgeTag（Stage 2 已有，source=vlm/rule…） │
└─────────────────────────────────────────────────────────────┘
```

**两层为什么必须分开**（工单原则 2 的落地）：
- 孩子挂"函数图像" = "孩子认为这题跟函数图像有关" → 写 `CaseStudentTopicTag`。
- 系统 VLM 看图判定属于 `M1-11` = "系统候选诊断" → 写 `CaseKnowledgeTag(source="vlm")`。
- 两者**并存显示**，互不覆盖。孩子标签**绝不**自动升级成 CaseKnowledgeTag，**绝不**写 StudentNodeState。

### 3.2 两张标签表的职责切分

| 维度 | `CaseStudentTopicTag`（**新 · 孩子视角**） | `CaseKnowledgeTag`（**已有 · 系统视角**） |
|------|------------------------------------------|------------------------------------------|
| 谁写 | 孩子/舅舅 从 UI 选课本章节 | VLM 自动挂 / 规则挂 / 管理员调试挂 |
| 指向 | `textbookTopicId`（→ TextbookTopic） | `nodeId`（→ KnowledgeNode） |
| 语义 | "孩子认为这题跟 X 有关"（证据） | "系统判定这题可能属于节点 X"（诊断候选） |
| source | 固定 `"student"`（v1 只有孩子一种来源） | `"manual"` / `"vlm"` / `"asr"` / `"rule"` / `"pending"` |
| 能否让地图变绿 | **绝不能** | **也不能**（绿只来自 StudentNodeState 测评） |
| 能否让节点亮琥珀 | **能**（Stage 2.5 琥珀层，经映射后计入 caseEvidenceCount） | 能（已是现状） |
| 删除 case 级联 | Cascade（跟 case 一起删） | Cascade（已是现状） |

---

## 4. 信息架构与职责边界（工单要求 #1）

| 路径 / 组件 | 职责 | 孩子可见？ | 本轮做什么 |
|------------|------|:--:|----------|
| 知识地图 → "最近拍过的题" → 点开一道题 → `CaseTagPanel` | **孩子挂课本章节标签**的入口 | ✅ 孩子 | **Stage A**：把 48 节点下拉换成课本目录下拉（册>章，可搜别名）。**Stage B**：写入 `CaseStudentTopicTag`（不再写 CaseKnowledgeTag）。已挂标签区分"你收的"（课本章名）vs "系统看的"（节点名，若有） |
| 知识地图图谱区（48 节点 SVG） | 看系统知识点分布 + 琥珀"收过题"环 | ✅ 孩子（但孩子不需要懂节点 ID） | 不改图谱本身。琥珀环数据源在 Stage C 从"孩子标签经映射"也能贡献（DP 过渡：Stage A/B 期间琥珀环靠原有 CaseKnowledgeTag 维持，见 §9） |
| 首页 `RecapBar` | "收过题"轻提示 | ✅ 孩子 | 不动（Stage 2.5 已做"只 collected 时说收过题不说点亮"） |
| 管理员/调试视角 | 看系统 48 节点 + 内部标签 | ❌ 只给大人 | **v1 不做专门后台页面**。大人要看节点调试走现有 `/api/diagnosis/map` 原始 JSON 或数据库直查。工单 §1 问"大人是否还能看到 48 节点调试入口"——答：v1 不做 UI，靠 API/DB；后续若需要再做 admin 页 |
| 课本目录浏览入口 | 按课本章节翻看错题 | ✅ 孩子（未来） | **v1 不做独立页面**。工单 §1 问"是否需要独立课本浏览页"——答：v1 先把挂题下拉做好，浏览页（按章筛错题列表）留后续阶段（见 §10 Stage E 展望） |

**孩子可见 vs 大人可见的边界**（工单 §1 末尾要求明确）：
- **孩子可见**：课本章节名（册>章）、别名搜索、自己挂的标签 chip、系统挂的标签 chip（标注"系统看的"）、琥珀"收过题"环。
- **只给大人/内部**：KnowledgeNode ID（BG100…）、node tier、confidence 数值、source 字段、映射表内部。这些不渲染给孩子，只在 API/DB 层存在。

---

## 5. 数据模型草案（工单要求 #2 + #3 · **单独章节 · SCHEMA 改动须用户确认 · 铁律 1**）

> ⚠️ **本节涉及新增 3 个 Prisma model（TextbookTopic / TextbookTopicKnowledgeNode / CaseStudentTopicTag）。按铁律 1 + 工单 #4，execute-agent 必须先把 migration SQL 生成（`--create-only`）给你过目，你明确同意后才执行。Stage A 不碰 schema，可先做。**

### 5.1 新增 model 1：`TextbookTopic`（课本目录标签）

**用途**：孩子看到的课本章节。一行 = 一个"章级"可选标签（DP2：孩子选章级）。

```prisma
// 课本目录标签层（个性化数学诊断辅导系统 · 增量）
// 全部新增表，不改 wrong-notebook 已有模型，符合铁律 3
// 数据来源：doc/research/教材知识点.md（seed 脚本灌库，DP5）
model TextbookTopic {
  id                  String   @id @default(cuid())
  textbookVersion     String   // "人教A版"（v1 只此一种；留字段备后续多版本）
  book                String   // "必修第一册" | "必修第二册"
  chapter             String   // "第1章" | "第2章" ...（章级，DP2）
  studentDisplayName  String   // "集合与常用逻辑用语"（孩子看到的正式名）
  aliases             String?  // JSON 字符串数组：["集合与逻辑","集合论"]（SQLite 无数组类型，仿 videoLinks）
  sortOrder           Int      @default(0) // 排序：册内按 sortOrder 升序
  covered             Boolean  @default(true) // 调研是否覆盖；未覆盖章节 = false（DP3）
  createdAt           DateTime @default(now())

  // 关系
  nodeMappings        TextbookTopicKnowledgeNode[]
  studentTags         CaseStudentTopicTag[]

  @@unique([textbookVersion, book, chapter]) // 同版本同册同章唯一
  @@index([book, sortOrder])
}
```

**字段说明**：
- `chapter` 存"第1章"这种章级编号（DP2）。节级信息（1.1/1.2…）**不进这张表**——节级只用在映射表 `mappingNote` 或后续扩展，孩子不直接选节。
- `aliases` 用 JSON 字符串存（仿现有 `KnowledgeNode.videoLinks` 的 SQLite 惯例），seed 时从调研材料的 aliases 列灌。
- `covered=false` 的行用于 DP3 兜底（"其他/暂未覆盖"分组）。v1 seed 只灌 covered=true 的（必修一/二共 7 章），下拉里"其他"分组用硬编码或单独一个 covered=false 的占位行。

### 5.2 新增 model 2：`TextbookTopicKnowledgeNode`（课本章 ↔ 系统节点 多对多映射）

**用途**：把课本章翻译成系统节点，让琥珀层/诊断引擎能用上孩子的标签。**Stage C 才填数据**，Stage A/B 期间此表可为空（琥珀层靠 CaseKnowledgeTag 维持，见 §9）。

```prisma
// 课本目录 ↔ 系统 KnowledgeNode 多对多映射（Stage C 填数据）
model TextbookTopicKnowledgeNode {
  textbookTopicId String
  nodeId          String   // → KnowledgeNode.id（松挂接无 FK，与 MistakeNode/ErrorRecord 同款，守铁律 3）
  weight          Float    @default(1.0) // 0-1：该章对该节点的代表性强弱（如"函数的概念与性质"对 M1-11 是 1.0，对某个边缘节点可能是 0.3）
  mappingNote     String?  // 映射说明（来自调研材料 mapping_notes 列）
  createdAt       DateTime @default(now())

  textbookTopic   TextbookTopic @relation(fields: [textbookTopicId], references: [id], onDelete: Cascade)

  @@id([textbookTopicId, nodeId]) // 同章同节点唯一
  @@index([nodeId])
}
```

**为什么多对多**：调研材料明确指出"基本初等函数(Ⅰ)"涵盖指数/对数/幂三类函数，应分别映射到多个节点（一章 → 多节点）；反过来"函数概念"作为基础可能被"函数性质"和"二次函数"两章共用（多章 → 一节点）。多对多最贴合实际。

**为什么 `TextbookTopic` 有 `onDelete: Cascade` 而 `nodeId` 无 FK**：删课本章时映射跟着删（合理）；但 `KnowledgeNode` 是系统核心表（铁律 3 不改），用松挂接（nodeId 字符串无 FK），与 `MistakeNode`/`ErrorRecord`/`CaseKnowledgeTag` 同款处理。

### 5.3 新增 model 3：`CaseStudentTopicTag`（孩子视角标签 · DP1 推荐）

**用途**：孩子/舅舅从课本目录挂的标签。**与 CaseKnowledgeTag 物理隔离**，防止孩子标签被误读为系统结论。

```prisma
// 孩子视角标签（课本目录层）· 与 CaseKnowledgeTag 物理隔离
// 语义：孩子认为这题跟 X 课本章有关 = 证据，不是诊断结论
// 绝不写 StudentNodeState，绝不让节点变绿（铁律 + OPS §4）
model CaseStudentTopicTag {
  id              String   @id @default(cuid())
  caseId          String
  case            Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  textbookTopicId String?  // → TextbookTopic.id；NULL = 自由文本标签（DP3 未覆盖兜底）
  textbookTopic   TextbookTopic? @relation(fields: [textbookTopicId], references: [id], onDelete: SetNull)
  freeText        String?  // 当 textbookTopicId 为 NULL 时存孩子输入的自由文本（"导数中括号展开"之类）
  source          String   @default("student") // v1 只有 "student"；留字段备后续（如家长代挂）
  note            String?  // 可选备注
  createdAt       DateTime @default(now())

  @@unique([caseId, textbookTopicId]) // 同 case 同课本章不重复（自由文本不受此约束，靠应用层去重）
  @@index([caseId])
  @@index([textbookTopicId])
}
```

**字段说明**：
- `textbookTopicId` 可空：DP3 兜底，孩子选"其他/暂未覆盖"后输入自由文本，存 `freeText`，`textbookTopicId=NULL`。
- `source` 固定 `"student"`：v1 不区分孩子/家长（家长代挂也算 student 来源），留字段是为了以后若做"家长视角"区分。
- `@@unique([caseId, textbookTopicId])`：同一道题同一章不重复挂。自由文本（textbookTopicId=NULL）不受 unique 约束（SQLite 多个 NULL 不冲突），靠应用层去重或接受重复。

**Case model 需追加反向关系**（nana 自有 model，加字段不违反铁律 3，但仍属 schema 变更，一并确认）：
```prisma
model Case {
  // ...原有字段
  knowledgeTags   CaseKnowledgeTag[]     // Stage 2 已有
  studentTopicTags CaseStudentTopicTag[] // ← Stage B 新增
}
```

### 5.4 影响范围与 migration 风险

- **新增 3 张表 + Case 加 1 个反向关系字段**。**不改任何 wrong-notebook 上游 model**（User/ErrorItem/KnowledgeTag/KnowledgeNode… 全不动，铁律 3）。
- migration 是纯 `CREATE TABLE` × 3 + `ALTER TABLE Case ADD COLUMN`（反向关系在 SQLite 实际不产生列，只是 Prisma 客户端层面）。**无数据迁移、无删除**，可安全回退（drop 3 张新表）。
- **回退方案**：若上线后发现问题，`prisma migrate resolve --rolled-back` + drop 三张新表 + 移除 Case 反向字段。已存的 Case/Artifact/CaseKnowledgeTag 数据不受影响。

### 5.5 migration 确认流程（铁律 1）

1. execute-agent 先 `npx prisma migrate dev --create-only --name add_textbook_topic_layer`（只生成 SQL 不执行）。
2. 把生成的 migration SQL 贴给你过目（应只有 3 个 CREATE TABLE，零数据迁移）。
3. 你确认后 execute-agent 才 `npx prisma migrate dev` 真正执行。
4. 执行后跑 `npm run test:all` + `npm.cmd run build` 验证不回归。

---

## 6. 课本目录 → KnowledgeNode 的映射策略（工单要求 #3）

### 6.1 映射关系：多对多

调研材料 `mapping_notes` 列已多次点明：
- "基本初等函数(Ⅰ)"涵盖**指数/对数/幂**三类函数 → 一章映射**多节点**。
- "函数概念"作为基础被"函数性质""二次函数"多章共用 → **多章映射一节点**。
- "平面向量"含向量运算/坐标表示/几何应用 → 一章拆对应**多个**知识单元。

所以用 `TextbookTopicKnowledgeNode` 多对多表（§5.2），每对带 `weight`（0-1）表示代表性强弱。

### 6.2 第一版映射数据来源（Stage C 执行）

从 `教材知识点.md` 的两列人工提炼：
- `student_display_name` + `mapping_notes` → 决定该章映射到哪些 KnowledgeNode ID。
- 调研没给精确节点 ID（给的是"函数概念""向量运算"这种描述），Stage C 需要人工把这描述对到现有 48 节点（如"函数概念"→ 查 KnowledgeNode 里 name 含"函数概念"的，可能是 `M1-11` 之类）。
- **对不上的不硬塞**：若某章在 48 节点里找不到合理对应，该章的映射留空（`TextbookTopicKnowledgeNode` 无该章记录），孩子挂了这章时琥珀环不亮（诚实：没映射就不假装亮）。登记为已知缺口。

### 6.3 别名 / 口语化叫法的用途

调研材料 `aliases` 列（如"集合与逻辑""集合论""二次函数方程""向量运算"）：
- **v1 用途**：下拉搜索框匹配。孩子输入"二次"→ 命中"一元二次函数、方程和不等式"。实现见 §12.3（前端纯字符串 includes 匹配，无需搜索引擎）。
- **后续用途**：ASR 转写文本里出现"集合论"时，可用于 Stage D 的 AI 分类提示词。

### 6.4 典型错题 / 易混淆点的去向

调研材料的 `typical_problem_types` / `common_confusions` 两列：
- **v1 不进数据库**（避免 TextbookTopic 表膨胀且这些是教学注释不是结构数据）。
- **v1 用途**：作为 Stage D VLM 分类提示词的素材（"这道题孩子说是函数图像，但典型易混淆点是代数式变形，VLM 你也看看是不是变形"）。
- **后续**：若做"易混淆提示"产品功能（多题模式提示），再考虑结构化存。

### 6.5 未覆盖章节的处理（DP3 落地）

- TextbookTopic 表 v1 只 seed 调研覆盖的 7 章（covered=true）。
- 下拉末尾加"其他 / 暂未覆盖"分组（covered=false 的占位行，或前端硬编码）。
- 孩子选"其他"→ 展开自由文本输入框 → 存 `CaseStudentTopicTag(textbookTopicId=NULL, freeText=输入)`。
- **自由文本标签不参与映射**：不会让任何节点亮琥珀，只作为"孩子视角记录"显示在题详情里。诚实：没映射就不假装亮。

---

## 7. UI 和文案草案（工单要求 #4）

### 7.1 CaseTagPanel 改造（Stage A 起逐步）

**Stage A（只换下拉数据源，最低风险）**：
- 把 `<select>` 的 options 从 `nodes`（48 KnowledgeNode）换成 `textbookTopics`（课本章，按册分组 optgroup）。
- 数据来源：Stage A 期间 TextbookTopic 表还没建（Stage B 才建），**临时方案**——用一个静态/seed 的 JSON（从前端硬编码或 `textbook-topic.ts` lib 导出常量）供下拉，挂标签时仍写 `CaseKnowledgeTag`，note 字段记课本章名（如 `note: "课本:函数的概念与性质"`）。
- **琥珀环不断**：因为 Stage A 仍写 CaseKnowledgeTag，Stage 2.5 的 caseEvidenceCount 仍能工作。

**Stage B（新建 CaseStudentTopicTag 后）**：
- 挂标签改写 `CaseStudentTopicTag`（不再写 CaseKnowledgeTag）。
- **琥珀环过渡**：Stage B 期间若 Stage C 映射表还没数据，孩子标签暂时不贡献 caseEvidenceCount → 琥珀环可能灭。**过渡方案**（§9 详述）：Stage B 的 map API 同时统计 CaseKnowledgeTag（旧）和 CaseStudentTopicTag（新，经映射），取并集；映射表没数据时新表贡献 0，靠旧表维持。

**Stage C（映射表填好后）**：
- 孩子标签经 `TextbookTopicKnowledgeNode` 映射成 nodeId，贡献 caseEvidenceCount，琥珀环亮。

### 7.2 下拉 + 搜索交互

```
┌─────────────────────────────────────┐
│ [搜索课本章节或别名…] 🔍            │  ← Stage A 起加搜索框（输入"二次"过滤）
├─────────────────────────────────────┤
│ ▾ 必修第一册                        │  ← optgroup 按册分组
│    集合与常用逻辑用语                │
│    一元二次函数、方程和不等式        │
│    函数的概念与性质                  │
│    基本初等函数(Ⅰ)                   │
│ ▾ 必修第二册                        │
│    平面向量及其应用                  │
│    复数                              │
│    立体几何初步                      │
│ ▾ 其他                              │
│    其他 / 暂未覆盖（可输入文字）     │  ← DP3 兜底
└─────────────────────────────────────┘
[挂上]
```

- 搜索：前端纯字符串匹配 `studentDisplayName.includes(query) || aliases.some(a => a.includes(query))`（§12.3）。
- 多标签：挂一个后下拉不清空，可继续挂多个（保留 Stage 2 既有行为）。
- 已挂标签区：显示 chip + 删除按钮（Stage B 起加删除 API）。

### 7.3 已挂标签的并排展示（孩子标签 vs 系统标签）

```
这道题你收在：
[函数的概念与性质 ✕] [集合与常用逻辑用语 ✕]    ← 来自 CaseStudentTopicTag（孩子挂的）

系统看的（如果有）：
[M1-11 函数概念边界]                            ← 来自 CaseKnowledgeTag（VLM/系统挂的，标"系统"小字）
```

- **孩子标签**用主色 chip（绿系 `#EAF2EC`/`#5E8868`，复用现有样式）。
- **系统标签**用次色 chip + "系统"小字标注，视觉上弱于孩子标签（孩子是主角）。
- 两层并存，**不互相覆盖、不互相否定**。

### 7.4 文案边界（守 OPS §4 + 工单原则 3，**逐词过**）

**可以说**：
- "这道题你收在：[函数的概念与性质]"
- "收到哪个章节" / "挂上" / "已收在这里"
- "它可能还和 [代数式变形] 有关"（Stage D 起系统补充时）
- "最近你收在函数下面的几道题，好像都绕不开式子变形"（后续多题模式提示）
- "还没做小检查，做完就能点亮它们"（Stage 2.5 已有）

**绝不能说**：
- ❌ "你选错了" / "选得不准" / "应该选 X"
- ❌ "已诊断" / "诊断结果" / "系统确认属于"
- ❌ "掌握" / "未掌握" / "薄弱" / "得分"
- ❌ "已点亮"（绿色语义，琥珀层只能说"收过题"）

---

## 8. 修正和提示机制（工单要求 #5）

### 8.1 单题层面：孩子标签 vs 系统标签不一致

**v1 只做温和共存，不做纠错**（工单原则 3）：
- 孩子挂"函数图像"（CaseStudentTopicTag），系统 VLM 挂"M1-11 函数概念边界"（CaseKnowledgeTag）→ **两层并排显示**，各说各话。
- 不弹"你选错了" / 不强推系统标签 / 不覆盖孩子标签。
- **v1 不做"可能还和 X 有关"的主动补充提示**——因为 v1 还没接 VLM（Stage D 才接）。等 Stage D 系统有第二标签了，再加这句温和补充。

### 8.2 多题层面：多道题被孩子放进同章，系统集中指向另一节点

**v1 不做**（工单 §5 明确这是后续）：
- 这需要"同章 N 道题 + 系统标签集中度高"的统计判断，v1 数据量和复杂度都不够。
- 留作后续阶段（Stage F 展望）：如"最近你收在函数下面的 3 道题，好像都绕不开式子变形"。

### 8.3 地图层面：课本标签如何反馈琥珀 evidence layer

**Stage A/B 过渡**（§9 详述）：琥珀环靠原 CaseKnowledgeTag 维持（Stage A 仍写 CaseKnowledgeTag）。
**Stage C 后**：map API 的 `caseEvidenceCount` 改为**并集统计**：
- 原：`CaseKnowledgeTag` groupBy by nodeId。
- 新：`CaseKnowledgeTag` groupBy ∪ `CaseStudentTopicTag` 经 `TextbookTopicKnowledgeNode` 映射到 nodeId 后 groupBy。
- 一个节点只要任一来源有计数 → 亮琥珀环。
- **绝不动 `status` 字段 / 不写 StudentNodeState**（Stage 2.5 铁律延续）。

---

## 9. 分阶段实施计划（工单要求 #6）

> 每个 Stage 必须独立可上线。Stage A 不依赖 DP1 的 schema 改动（可先做）。Stage B/C 依赖 DP1 + DP2 确认。

### 🟢 Stage A：换下拉数据源（UI-only，零 schema 改动，最低风险）

**前置**：Stage 2.5 已合并上线（DP4）。

- [ ] **A-1 课本目录常量**：新增 `src/lib/nana/textbook-topic.ts`，导出静态常量 `TEXTBOOK_TOPICS`（从 `教材知识点.md` line 29-60 简化目录手工整理，~7 章 + 1 个"其他"兜底）。结构：`{ textbookVersion, book, chapter, studentDisplayName, aliases[], sortOrder, covered }[]`。**不查库、不建表**。（涉及: 新增 `src/lib/nana/textbook-topic.ts`）
- [ ] **A-2 CaseTagPanel 下拉换源**：`recent-cases-list.tsx` 的 `CaseTagPanel` 把 `nodes` props 换成 `TEXTBOOK_TOPICS`（或新增 props 并存）。`<select>` 用 optgroup 按册分组。加搜索框（纯字符串过滤）。（涉及: `src/components/nana/knowledge-map/recent-cases-list.tsx`）
- [ ] **A-3 挂标签仍写 CaseKnowledgeTag**：`handleAttach` 改为——孩子选的课本章通过**临时硬编码映射**（`TEXTBOOK_TOPIC_TO_NODE_MAP`，只覆盖调研明确对应的几对，如"函数的概念与性质"→ 查 KnowledgeNode name 含"函数概念"的）转成 nodeId，写 `CaseKnowledgeTag(source="manual", note="课本:函数的概念与性质")`。**对不上的章**（映射表没覆盖）→ 写 `CaseKnowledgeTag(source="manual", nodeId="UNMAPPED", note=课本章名)`（用一个占位 nodeId 或干脆不挂、UI 提示"这章还没接上系统节点，先记着"）。（涉及: `src/lib/nana/textbook-topic.ts` 加临时映射、`recent-cases-list.tsx`）
- [ ] **A-4 琥珀环不断验证**：因为仍写 CaseKnowledgeTag，Stage 2.5 的 caseEvidenceCount 不受影响。手动挂一道"函数的概念与性质"的题 → 地图对应节点琥珀环仍亮。
- [ ] **A-5 测试 + build**：扩 `case-api.test.ts` 验证临时映射逻辑；`npm run test:all` + `npm.cmd run build` 通过。（涉及: `src/__tests__/`）

**Stage A 验收**：孩子挂题下拉看到的是课本章名（册>章），能搜索别名，挂上后琥珀环仍亮。**底层仍是 CaseKnowledgeTag，可独立上线。**

### 🟡 Stage B：新建孩子视角标签层（**依赖 DP1 + DP2 用户确认 migration**）

**前置**：Stage A 已上线 + DP1/DP2 评审拍板 + migration SQL 用户过目。

- [ ] **B-1 Prisma 新增 3 个 model**（migration SQL 单独确认后做）：`TextbookTopic` + `TextbookTopicKnowledgeNode` + `CaseStudentTopicTag` + Case 加反向关系。（涉及: `prisma/schema.prisma`、`prisma/migrations/`）
- [ ] **B-2 seed 脚本**：新增 `prisma/seed/seed-textbook-topics.ts`，从 `教材知识点.md` 结构化数据灌 `TextbookTopic`（7 章 covered=true + 1 个 covered=false 占位）。**TextbookTopicKnowledgeNode 此阶段留空**（Stage C 填）。（涉及: 新增 `prisma/seed/seed-textbook-topics.ts`）
- [ ] **B-3 孩子标签 API**：新增 `POST/GET/DELETE /api/nana/cases/[id]/topic-tags`。写 `CaseStudentTopicTag`，带归属校验（沿用 G1 `findFirst({where:{id,studentId}})`）。（涉及: 新增 `src/app/api/nana/cases/[id]/topic-tags/route.ts`）
- [ ] **B-4 CaseTagPanel 改写新表**：`handleAttach` 从写 CaseKnowledgeTag 改为写 CaseStudentTopicTag。已挂标签区分"你收的"（CaseStudentTopicTag，课本章名）vs "系统看的"（CaseKnowledgeTag，节点名，若有）。（涉及: `recent-cases-list.tsx`、`nana-api-client.ts` 加 `listStudentTopicTags`/`tagCaseStudentTopic`/`deleteStudentTopicTag`）
- [ ] **B-5 琥珀环过渡**（关键，防断）：map API 的 `caseEvidenceCount` 改为 CaseKnowledgeTag ∪ CaseStudentTopicTag(经映射) 并集统计。**Stage B 映射表为空 → CaseStudentTopicTag 贡献 0**，靠 CaseKnowledgeTag 维持。若 Stage A 期间有题用了临时硬编码映射写了 CaseKnowledgeTag，那些琥珀环不灭。（涉及: `src/app/api/diagnosis/map/route.ts`）
- [ ] **B-6 测试**：新增 `topic-tags` API 集成测试（CRUD + 跨用户隔离 + 删除 case 级联不残留）；`npm run test:all` + `npm.cmd run build`。（涉及: `src/__tests__/integration/nana/`）

**Stage B 验收**：孩子挂的标签物理上存在 `CaseStudentTopicTag`（与系统标签隔离）；删除 case 后该表对应行级联清除；**绝不写 StudentNodeState**（测试断言）；琥珀环在 Stage A 已挂的题上仍亮（靠旧 CaseKnowledgeTag 维持）。

### 🔵 Stage C：课本→节点 映射表 + 琥珀环接通孩子标签

**前置**：Stage B 已上线。

- [ ] **C-1 人工整理映射数据**：对照 `教材知识点.md` 的 `mapping_notes` + 现有 48 KnowledgeNode，人工产出映射 JSON（textbookTopicId → [{nodeId, weight}]）。**对不上的不硬塞**，留空。（涉及: 新增 `prisma/seed/data/textbook-topic-node-mapping.json`）
- [ ] **C-2 seed 映射表**：扩 `seed-textbook-topics.ts` 或新增 `seed-textbook-mapping.ts` 灌 `TextbookTopicKnowledgeNode`。（涉及: `prisma/seed/`）
- [ ] **C-3 map API 并集统计落地**：`caseEvidenceCount` 真正纳入 CaseStudentTopicTag 经映射的 nodeId 计数（Stage B 的过渡 union 逻辑此时有了真实映射数据）。（涉及: `src/app/api/diagnosis/map/route.ts`）
- [ ] **C-4 孩子标签驱动琥珀环验证**：孩子挂"函数的概念与性质"（无 CaseKnowledgeTag）→ 经映射 → 对应节点琥珀环亮。
- [ ] **C-5 测试**：map API 测试——挂 CaseStudentTopicTag 后经映射节点 caseEvidenceCount +1；跨用户隔离；映射表为空的章贡献 0（不假装亮）。（涉及: `src/__tests__/`）

**Stage C 验收**：孩子挂课本章标签 → 经映射 → 地图对应节点亮琥珀环（无需系统/VLM 参与）。映射没覆盖的章不亮（诚实）。

### 🟣 Stage D：VLM/ASR 接入 + 系统标签与孩子标签并排温和共存（**对齐父计划 Stage 3**）

**前置**：父计划 v1 的 Stage 3（ASR + VLM）已接通。

- [ ] **D-1 系统标签并排显示**：CaseTagPanel 在"你收的"下方加"系统看的"区，显示 CaseKnowledgeTag(source="vlm")。（涉及: `recent-cases-list.tsx`）
- [ ] **D-2 温和共存文案**：当孩子标签与系统标签不一致，加一行轻提示"它可能还和 [系统标签对应的课本章名] 有关"（把 nodeId 反查 TextbookTopicKnowledgeNode 得到课本章名给孩子看，而不是裸节点 ID）。**绝不说"你选错了"**。（涉及: `recent-cases-list.tsx`、`src/lib/nana/textbook-topic.ts` 加 `nodeIdToTopicName` 辅助）
- [ ] **D-3 测试**：系统标签 + 孩子标签并排显示；措辞走查无"选错/诊断/掌握"。（涉及: `src/__tests__/` + 人工走查）

**Stage D 验收**：系统 VLM 挂的标签和孩子挂的标签并排，措辞温和不否定。

### 后续展望（不在本轮范围，仅记录）
- **Stage E**：独立"课本目录浏览页"（按章筛错题列表）。
- **Stage F**：多题模式提示（"最近你收在函数下的几道题都绕不开式子变形"）。
- **Stage G**：管理后台编辑 TextbookTopic / 映射表。

---

## 10. 验收标准（映射工单 §6 + §7 意图）

### 10.1 工单验收项映射

| 工单验收项 | 由哪个 Stage 满足 | 怎么验 |
|-----------|:--:|--------|
| 孩子手工挂题看到的是课本目录（非 48 节点） | A | CaseTagPanel 下拉显示册>章 + 可搜别名 |
| 课本章和 KnowledgeNode 有映射 | C | TextbookTopicKnowledgeNode 有数据；孩子挂章→节点琥珀环亮 |
| 挂错/不一致时温和提示（不纠错） | D | 并排显示 + "可能还和 X 有关"；无"选错了" |
| 同一 case 可挂多个课本标签 | A/B | 挂多个不报错 |
| 跨用户不能读写他人标签 | B | topic-tags API 跨用户 → 403/404 |
| 删除 case 后标签不残留 | B | 删 case → CaseStudentTopicTag 级联清除（测试断言 count=0） |
| 搜索别名能命中正确章节 | A | 输入"二次"→ 命中"一元二次函数、方程和不等式" |
| 课本标签不误写 StudentNodeState | B | 测试断言：挂标签前后 StudentNodeState 无变化 |
| 课本标签不让地图显示绿色已点亮 | B/C | 挂标签后节点 `status` 仍 untested，只有琥珀环 |
| map API evidenceCount 只按当前用户统计 | B/C | 跨用户隔离测试（A 的 tag 不计到 B） |

### 10.2 措辞走查（守 OPS §4，每 Stage 收尾逐词过）

- [ ] 全页扫描：**不出现** "诊断 / 已诊断 / 薄弱 / 得分 / 掌握 / 未掌握 / 选错了 / 失败"。
- [ ] 孩子标签区只用："收在 / 收过题 / 挂上 / 已收在这里"。
- [ ] 系统标签区只用："系统看的 / 可能还和 X 有关"。
- [ ] 绿色"已点亮"语义不变（仍只来自测评），琥珀层不偷绿色话术。

---

## 11. 风险与回退方案（工单要求 #8）

| 风险 | 影响 | 应对 | 归属 Stage |
|------|------|------|:--:|
| **Stage A→B 过渡期琥珀环断** | Stage B 改写 CaseStudentTopicTag 后，若 Stage C 映射还没数据，孩子标签不贡献 caseEvidenceCount → 琥珀环灭 | Stage B 的 map API 做**并集统计**（CaseKnowledgeTag ∪ CaseStudentTopicTag 经映射），映射表空时新表贡献 0，靠旧 CaseKnowledgeTag 维持。Stage A 期间用临时硬编码映射写 CaseKnowledgeTag，保证那些题的琥珀环在 Stage B 不灭 | A/B/C |
| **孩子标签被误读为系统结论** | 违反工单原则 2 | DP1 物理隔离（新表 CaseStudentTopicTag）；UI 严格区分"你收的"vs"系统看的"；**绝不写 StudentNodeState**（测试断言）；措辞走查 | B |
| **课本标签让节点误变绿** | 违反 OPS §4 | caseEvidenceCount 只驱动琥珀环，不动 status/StudentNodeState（Stage 2.5 铁律延续）；canvas 渲染 additive（琥珀环在绿芯外，不替换） | B/C |
| **映射表覆盖不全**（调研只必修一/二） | 选择性必修章节（数列/导数/解析几何/概率统计）孩子挂了不亮琥珀 | DP3："其他/暂未覆盖"分组 + 自由文本兜底；映射没覆盖的章不亮琥珀（诚实）；登记为已知限制，不假装覆盖全 | C |
| **映射歧义**（一章对多节点，权重难定） | 琥珀环亮在不该亮的节点，或该亮的不亮 | Stage C 人工整理映射时 `weight` 区分（>0.7 才贡献琥珀，弱的只记录不亮）；映射评审留痕 | C |
| **孩子误挂（手滑选错章）** | 错题归类乱 | Stage B 起标签可删除可改（DELETE API + UI 删除按钮）；v1 不做"纠错提示"（工单原则 3），只提供孩子自己改的能力 | B |
| **schema 回退** | Stage B migration 上线后发现问题 | drop 3 张新表 + Case 反向字段；已存 Case/Artifact/CaseKnowledgeTag 不受影响；Stage A 的临时硬编码映射可回退（下拉换回 48 节点） | B |
| **别名搜索漏匹配** | 孩子输入的口语词没在 aliases 里 | v1 aliases 从调研材料灌（已含常见口语）；未命中的孩子可滚动选；后续运营补充 aliases（Stage G） | A |
| **课本版本单一**（只人教 A 版） | 用北师大/苏教版的孩子对不上 | v1 只支持人教 A 版（调研覆盖范围）；留 `textbookVersion` 字段备后续多版本；作为已知限制告知用户 | 全程 |
| **铁律提醒** | — | Stage B schema 改动须 DP1 确认 migration 内容（铁律 1）；全程不改上游 model（铁律 3）；措辞不越界（OPS §4）；映射对不上显式留空不假装（铁律 6） | 全程 |

---

## 12. 技术附录

### 12.1 课本目录常量草案（Stage A · `src/lib/nana/textbook-topic.ts`）

```ts
// 从 doc/research/教材知识点.md line 29-60 简化目录整理
// Stage A 期间作为下拉数据源（不查库）；Stage B 后改由 seedTextbookTopics 灌库查询
export interface TextbookTopicDef {
  textbookVersion: string;
  book: string;          // "必修第一册" | "必修第二册"
  chapter: string;       // "第1章" ...
  studentDisplayName: string; // "集合与常用逻辑用语"
  aliases: string[];     // ["集合与逻辑","集合论"]
  sortOrder: number;     // 册内排序
  covered: boolean;      // 调研是否覆盖
}

export const TEXTBOOK_TOPICS: TextbookTopicDef[] = [
  { textbookVersion: "人教A版", book: "必修第一册", chapter: "第1章",
    studentDisplayName: "集合与常用逻辑用语",
    aliases: ["集合与逻辑","集合逻辑用语","集合论"], sortOrder: 1, covered: true },
  { textbookVersion: "人教A版", book: "必修第一册", chapter: "第2章",
    studentDisplayName: "一元二次函数、方程和不等式",
    aliases: ["二次函数方程","二次方程与不等式","一元二次"], sortOrder: 2, covered: true },
  { textbookVersion: "人教A版", book: "必修第一册", chapter: "第3章",
    studentDisplayName: "函数的概念与性质",
    aliases: ["函数概念","函数基本概念","函数性质"], sortOrder: 3, covered: true },
  { textbookVersion: "人教A版", book: "必修第一册", chapter: "第4章",
    studentDisplayName: "基本初等函数(Ⅰ)",
    aliases: ["指数函数","对数函数","幂函数"], sortOrder: 4, covered: true },
  { textbookVersion: "人教A版", book: "必修第二册", chapter: "第6章",
    studentDisplayName: "平面向量及其应用",
    aliases: ["平面向量","向量运算","向量"], sortOrder: 5, covered: true },
  { textbookVersion: "人教A版", book: "必修第二册", chapter: "第7章",
    studentDisplayName: "复数",
    aliases: ["复数运算","复平面","复数概念"], sortOrder: 6, covered: true },
  { textbookVersion: "人教A版", book: "必修第二册", chapter: "第8章",
    studentDisplayName: "立体几何初步",
    aliases: ["空间几何","几何体","三视图","立体几何"], sortOrder: 7, covered: true },
  // DP3 兜底
  { textbookVersion: "人教A版", book: "其他", chapter: "其他",
    studentDisplayName: "其他 / 暂未覆盖",
    aliases: [], sortOrder: 99, covered: false },
];

// Stage A 临时硬编码映射（课本章 → KnowledgeNode.id，仅覆盖调研明确的几对）
// 对不上的章：返回 null，handleAttach 决定写 note 还是不挂
export const TEMP_TOPIC_TO_NODE: Record<string, string | null> = {
  // key = chapter；value = nodeId 或 null
  // 具体 nodeId 在 Stage A 执行时由 execute-agent 查 KnowledgeNode 表填入
  // 例: "第3章" → 查 name 含"函数概念"的节点 id
  // 未填的章 = null（不挂 nodeId，只记 note）
};
```

### 12.2 孩子 topic-tags API 契约（Stage B）

```ts
// POST /api/nana/cases/[id]/topic-tags
// 请求: { textbookTopicId?: string; freeText?: string; note?: string }
//   - textbookTopicId 与 freeText 二选一（covered=false 章走 freeText）
// 响应 201: { id, caseId, textbookTopicId, freeText, source: "student", note, createdAt }
// 错误: 400 (两者都空或都填) / 404 (case 不存在或不属于自己) / 401

// GET /api/nana/cases/[id]/topic-tags
// 响应 200: { tags: CaseStudentTopicTagResponse[] }
//   每个 tag 含: { id, textbookTopicId, studentDisplayName?(经 join), freeText, source, note, createdAt }

// DELETE /api/nana/cases/[id]/topic-tags/[tagId]
// 响应 200: { ok: true } / 404 (tag 不存在或不属于自己)
```

### 12.3 别名搜索实现（Stage A · 纯前端）

```ts
// 输入 query，过滤 TEXTBOOK_TOPICS
export function filterTopics(query: string, topics: TextbookTopicDef[]): TextbookTopicDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  return topics.filter(t =>
    t.studentDisplayName.toLowerCase().includes(q) ||
    t.aliases.some(a => a.toLowerCase().includes(q)) ||
    t.chapter.toLowerCase().includes(q)
  );
}
// 不需要后端/搜索引擎：v1 量级（~8 项）前端过滤足够。
```

### 12.4 map API 并集统计（Stage B/C · `src/app/api/diagnosis/map/route.ts`）

```ts
// Stage 2.5 现状：只 groupBy CaseKnowledgeTag
// Stage B/C 改为：CaseKnowledgeTag ∪ CaseStudentTopicTag(经映射) 并集

// 1. 原有：系统标签计数
const systemEvidenceRows = await prisma.caseKnowledgeTag.groupBy({
  by: ['nodeId'],
  where: { case: { studentId } },
  _count: { nodeId: true },
});

// 2. 新增（Stage C 映射表有数据后生效）：孩子标签经映射计数
//    Stage B 映射表为空 → 此查询返回空数组，贡献 0
const studentEvidenceRows = await prisma.caseStudentTopicTag.findMany({
  where: { case: { studentId }, textbookTopicId: { not: null } },
  select: { textbookTopic: { select: { nodeMappings: { select: { nodeId: true, weight: true } } } } },
});
// 展平：每个学生标签 → 经映射的 nodeId 列表 → 按 nodeId 计数（weight > 阈值才计）
const studentNodeCounts = new Map<string, number>();
for (const tag of studentEvidenceRows) {
  for (const m of tag.textbookTopic?.nodeMappings ?? []) {
    if (m.weight > 0.7) {  // 阈值，防弱映射污染
      studentNodeCounts.set(m.nodeId, (studentNodeCounts.get(m.nodeId) ?? 0) + 1);
    }
  }
}

// 3. 并集（取较大值，避免同一题经两条路径双计）
const evidenceMap = new Map<string, number>();
for (const r of systemEvidenceRows) evidenceMap.set(r.nodeId, r._count.nodeId);
for (const [nodeId, cnt] of studentNodeCounts) {
  evidenceMap.set(nodeId, Math.max(evidenceMap.get(nodeId) ?? 0, cnt));
}
// → nodes[*].caseEvidenceCount = evidenceMap.get(nodeId) ?? 0
```

**性能**：Stage C 增加一次 `findMany` 孩子标签 + 内存展平。当前量级（个位数 case/tag）无虞。登记为观察项。

### 12.5 seed 脚本策略（Stage B · `prisma/seed/seed-textbook-topics.ts`）

```ts
// 仿现有 seed_graph 模式
// 1. 读 TEXTBOOK_TOPICS 常量（或直接从教材知识点.md 解析表格）
// 2. upsert TextbookTopic（按 textbookVersion+book+chapter 唯一键）
// 3. 不灌 TextbookTopicKnowledgeNode（Stage C 单独 seed）
// 4. 打印 [已写入] N 条 / [跳过] M 条（铁律 6 显式报数）
```

### 12.6 文件变更清单（按 Stage）

**Stage A（零 schema）**：
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/nana/textbook-topic.ts` | 新增 | 课本目录常量 + 临时映射 + 搜索过滤 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | CaseTagPanel 下拉换源 + 搜索框 |
| `src/__tests__/` | 修改 | 临时映射逻辑测试 |

**Stage B（schema 改动，须确认）**：
| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改（结构） | 新增 3 model + Case 反向关系 |
| `prisma/migrations/xxx` | 新增 | migration（SQL 先过目） |
| `prisma/seed/seed-textbook-topics.ts` | 新增 | 灌 TextbookTopic |
| `src/app/api/nana/cases/[id]/topic-tags/route.ts` | 新增 | 孩子 topic-tags CRUD API |
| `src/lib/nana/nana-api-client.ts` | 修改 | 加 listStudentTopicTags/tagCaseStudentTopic/deleteStudentTopicTag |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | 改写 CaseStudentTopicTag + 并排显示 |
| `src/app/api/diagnosis/map/route.ts` | 修改 | caseEvidenceCount 并集统计（过渡） |
| `src/__tests__/integration/nana/` | 新增/修改 | topic-tags API + 级联 + 隔离 + 不写 StudentNodeState 断言 |

**Stage C（映射数据）**：
| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/seed/data/textbook-topic-node-mapping.json` | 新增 | 人工映射数据 |
| `prisma/seed/seed-textbook-mapping.ts` | 新增 | 灌 TextbookTopicKnowledgeNode |
| `src/app/api/diagnosis/map/route.ts` | 修改 | caseEvidenceCount 真正纳入学生标签经映射 |
| `src/__tests__/` | 修改 | 映射→琥珀环测试 |

**Stage D（对齐父计划 Stage 3）**：
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | 系统标签并排 + 温和共存文案 |
| `src/lib/nana/textbook-topic.ts` | 修改 | 加 nodeIdToTopicName 反查辅助 |

---

## 13. 不做的事（明确边界，防范围蔓延）

- ❌ **不做独立"课本目录浏览页"**（Stage E 后续）。
- ❌ **不做多题模式提示**（"最近函数下的题都绕不开式子变形"，Stage F 后续）。
- ❌ **不做管理后台编辑 TextbookTopic/映射**（Stage G 后续；v1 靠 seed 脚本）。
- ❌ **不做多教材版本**（v1 只人教 A 版；留字段备后续）。
- ❌ **不改 StudentNodeState / 不让课本标签变绿**（铁律 + OPS §4）。
- ❌ **不假装覆盖全部高中数学**（选择性必修/选修走兜底，DP3）。
- ❌ **Stage A 不碰 schema**（零结构改动，可先做）。

---

> 本计划待用户确认 5 个决策点（DP1-DP5）+ Stage B migration SQL 后，由 execute-agent 分 Stage 接手实施。计划代理工作到此结束。
