# 个性化数学诊断辅导系统 · 综合技术方案 v1.0

> 基座：wrong-notebook（Next.js 16 / React 19 / SQLite / Prisma / NextAuth / PWA）
> 目标用户：一名高二理科学生（安徽，新高考全国 I 卷），当前 30-40 分，目标 85-95 分
> 本文档为开发规格，确认后即可开工。待确认项见文末。

---

## 1. 总体架构

```
┌─────────────────────────────────────────────────────┐
│                wrong-notebook 基座（已有）             │
│  错题录入/AI解析/标签/筛选/相似题/统计/打印PDF/多用户/PWA │
└──────────────┬──────────────────────────────────────┘
               │ 增量开发（本方案范围）
┌──────────────┴──────────────────────────────────────┐
│ ① 知识图谱数据层    节点/边/主线/学生状态（Prisma 增量表）│
│ ② 诊断引擎         初诊KST-lite / Newman归因 / 探针下探  │
│ ③ 追踪引擎         BKT 掌握度更新 / 知识地图UI           │
│ ④ 周流程编排       周末session状态机 / 周中纸质包生成     │
└──────────────┬──────────────────────────────────────┘
┌──────────────┴──────────────────────────────────────┐
│ AI 管线（OpenAI 兼容接口，复用基座的 Provider 配置体系）   │
│  VLM 识图 · LLM 对话 · ASR 语音 · 黄金测试集回归          │
└─────────────────────────────────────────────────────┘
```

核心设计原则（全文档反复引用，编号 P1-P5）：

- **P1 图为真相源**：题目照片是唯一可信输入，OCR/VLM 转写只作索引；一切诊断对话同时携带原图。
- **P2 结构先于模型**：图谱、边界题、错因规则是显式数据，LLM 只在受约束的位置工作（追问、讲解、变式生成），不承担底层判定。
- **P3 多问少断**：粗心/概念的结论从不来自单次答错；必须有概念题+隔天变式的双重证据。
- **P4 诊断后台化**：测评过程对学生弱可见；前台只呈现增量（地图点亮、前沿任务），不呈现"你又错了"。
- **P5 周末数字化、周中纸质化**：应用的周中输出是一份可打印 PDF，周末是唯一上屏时间。

---

## 2. 知识图谱数据层

### 2.1 主线划分（三份调研的裁决结果）

采用 8 主线方案（以《新高考全国I卷研究》M1-M8 为准，该报告带真题核实状态，可信度最高）：

| ID | 主线 | 解锁顺序 priority（暂定） | 备注 |
|---|---|---|---|
| M0 | 地基层 | 0（贯穿始终） | 不是主线，是共享根层，BG001-104 |
| M1 | 数学语言与代数预备（集合/逻辑/不等式/复数） | 1 | 送分区，先给两周涨分体验 |
| M2a | 函数与指对幂（必修一 Ch3,4） | 2 | M2 拆为两段解锁 |
| M3 | 三角函数与解三角形 | 3 | |
| M5 | 平面向量 | 4 | 枢纽线，三座必需前置桥的源头 |
| M8 | 计数、概率与统计 | 5 | 模式固定、计算量小 |
| M4 | 数列 | 6 | |
| M2b | 导数基础（求导/切线/单调区间，只取解答题第一问深度） | 7 | |
| M6 | 立体几何与空间向量 | 8 | 大题只取第一问 |
| M7 | 解析几何 | 9 | 第二问属战略放弃区 |

裁决理由：向量独立成线（必需前置桥源头）；数列与导数分开（按 ROI 排序的需要）；与课标主题划分对应干净。安徽版报告"三角+向量""数列+导数"的合并方案降级为 UI 上的"学习包"展示概念，不进数据层。

> ⚠️ priority 为经验暂定值。提示词三（真题权重与保底路径统计）结果回来后，仅更新此字段，不动结构。

### 2.2 边类型规则

| 调研中的"依赖性质" | 入图方式 | 用途 |
|---|---|---|
| 必需前置 prerequisite | 图谱边，权重 1.0 | 探针下探主路径；学习前沿计算 |
| 常用工具 tool | 图谱边，权重 0.5 | 下探次级路径（主路径探完仍无解释时才走） |
| 思想方法迁移 transfer | **不入图**，写入节点 teachingNotes 字段 | 仅供讲解环节引用 |

### 2.3 主线级跨线桥（三份调研合并去重后的统一表）

节点级细化在图谱内容填充时完成；以下为主线级骨架，标注主要证据来源。

| # | 源 → 目标 | 类型 | 证据 |
|---|---|---|---|
| 1 | M1 → M2a（二次方程/不等式→定义域/零点/参数范围） | prerequisite | 2024 I卷 T6，已核实 |
| 2 | M1 → M4（量词/不等式→数列证明） | prerequisite | 三份报告一致 |
| 3 | M1 → M7（不等式→圆锥曲线范围最值） | prerequisite | 2024 I卷 T11，已核实 |
| 4 | M1 → M8（集合运算/逻辑表述→事件运算/条件概率） | prerequisite | 2024 I卷 T14，已核实；教材10.1.2 |
| 5 | M2a → M3（函数概念性质→三角函数图像性质） | prerequisite | 2024 I卷 T7，已核实 |
| 6 | M2a → M2b（函数→导数） | prerequisite | 内链 |
| 7 | M2a → M4（单调性工具→递推数列单调性） | tool | 2023 北京 T10 |
| 8 | M2a → M7（函数化求范围最值） | tool | 2024 I卷 T16，已核实 |
| 9 | M2a → M8（对数线性化回归/正态参数函数视角） | tool | 三份报告一致 |
| 10 | M2b → M7（导数求切线/最值） | tool | 2025 I卷 T18，部分核实 |
| 11 | M3 → M6（截面三角形正余弦定理求空间角） | tool | 解法层面稳定 |
| 12 | M3 → M7（斜率=tanα；三角换元） | tool | 三份报告一致 |
| 13 | M3 → M2b（导数压轴三角化简） | tool | 2025 I卷 T19，部分核实 |
| 14 | M5 → M3（向量导出余弦定理） | prerequisite | 教材 6.4.3，已核实 |
| 15 | M5 → M6（平面向量→空间向量法） | prerequisite | 教材结构，已核实 |
| 16 | M5 → M7（垂直/共线/面积的坐标化） | tool | 2024 I卷 T3/T16，已核实 |
| 17 | M4 → M8（数列求和→期望递推） | tool | 2023 I卷 T21，已核实 |
| 18 | M8内部（计数→概率分布） | prerequisite | 教材结构 |
| 19 | M7 → M6（建系/坐标法二维原型→三维） | tool | 部分核实 |
| 20 | M0 → 各主线 | prerequisite | 以节点级边表达，不存"M0→所有"的泛化边 |

### 2.4 地基层（BG001-099 采纳 + 补充修订）

《地基层微技能清单》99 节点直接采纳为种子数据。补充以下缺失节点：

| ID | 名称 | 学段 | 前置 | 判定题示例 | 强依赖专题 |
|---|---|---|---|---|---|
| BG100 | 韦达定理（根与系数关系） | 九上/必修一 | BG053 | x²-5x+3=0 两根之和与积 | 二次函数、解析几何联立、数列 |
| BG101 | 解一元二次不等式（图象法） | 必修一 2.3 | BG057, BG066, BG069 | 解 x²-x-6>0 | 集合、定义域、一切参数范围题 |
| BG102 | 区间表示法与集合互化 | 必修一 | BG049, BG080 | 把 {x\|1<x≤4} 写成区间 | 全卷通用 |
| BG103 | 整体换元意识 | 必修一 | BG017, BG029 | 解 (x²)²-5x²+4=0 | 指对方程、三角变换、复合函数 |
| BG104 | 二次函数闭区间最值（轴定区间定） | 必修一 | BG067, BG068 | 求 y=x²-2x 在 [0,3] 最值 | 函数最值、基本不等式、导数 |

修订规则：调研清单中"等价转化与化归思想"类元思维条目一律不建节点（无法 5 分钟判定），写入相关节点的 teachingNotes。

### 2.5 Prisma Schema（增量表，与 wrong-notebook 现有 schema 共存）

```prisma
// ===== 图谱静态层 =====
model KnowledgeNode {
  id            String   @id            // "BG001" / "M2a-03" 等
  name          String
  layer         String                  // foundation | mainline
  stage         String                  // "七上"…"选择性必修二"
  judgeCriteria String                  // 一句话判定标准
  teachingNotes String?                 // 迁移类比、易错点等讲解备注
  videoLinks    Json?                   // [{title, url, source}] B站映射，人工维护
  edgesOut      KnowledgeEdge[] @relation("src")
  edgesIn       KnowledgeEdge[] @relation("tgt")
  mainlines     NodeMainline[]
  items         Item[]
  states        StudentNodeState[]
}

model KnowledgeEdge {
  sourceId String                       // 前置节点
  targetId String                       // 依赖它的节点
  type     String                       // prerequisite | tool
  source   KnowledgeNode @relation("src", fields: [sourceId], references: [id])
  target   KnowledgeNode @relation("tgt", fields: [targetId], references: [id])
  @@id([sourceId, targetId])
}

model Mainline {
  id       String @id                   // "M1"…"M8"
  name     String
  priority Int                          // 解锁顺序（提示词三结果回来后更新）
  nodes    NodeMainline[]
}

model NodeMainline {                    // 多对多：地基节点被多条主线引用
  nodeId     String
  mainlineId String
  node       KnowledgeNode @relation(fields: [nodeId], references: [id])
  mainline   Mainline      @relation(fields: [mainlineId], references: [id])
  @@id([nodeId, mainlineId])
}

// ===== 题库层 =====
model Item {
  id        String @id @default(cuid())
  nodeId    String                      // 主考节点
  node      KnowledgeNode @relation(fields: [nodeId], references: [id])
  role      String                      // boundary(边界题) | concept(概念题) | variant(同构变式) | drill(微练)
  stem      String                      // 题干（LaTeX 允许）
  answer    String
  analysis  String?
  source    String?                     // "人工" | "LLM生成-已审" | 教辅名
  reviewed  Boolean @default(false)     // LLM 生成题必须人工过审才可用
}

// ===== 学生动态层 =====
model StudentNodeState {
  studentId    String
  nodeId       String
  node         KnowledgeNode @relation(fields: [nodeId], references: [id])
  masteryProb  Float    @default(0.0)   // BKT 后验
  status       String   @default("untested") // stable | uncertain | gap | untested
  slipFlag     Boolean  @default(false) // 疑似粗心待变式复测
  lastEvidence DateTime?
  @@id([studentId, nodeId])
}

model DiagnosisSession {                // 一次周末 session 或一次初诊
  id        String   @id @default(cuid())
  studentId String
  kind      String                      // initial | weekend
  startedAt DateTime @default(now())
  records   ProbeRecord[]
  errors    ErrorRecord[]
}

model ProbeRecord {                     // 探针题/边界题作答记录
  id        String  @id @default(cuid())
  sessionId String
  session   DiagnosisSession @relation(fields: [sessionId], references: [id])
  itemId    String
  nodeId    String
  correct   Boolean
  durationS Int?
  createdAt DateTime @default(now())
}

model ErrorRecord {                     // 错题归因记录（关联基座的 Mistake 表）
  id            String  @id @default(cuid())
  sessionId     String
  session       DiagnosisSession @relation(fields: [sessionId], references: [id])
  mistakeId     String                  // → wrong-notebook 已有 Mistake.id
  newmanStage   String?                 // reading|comprehension|transformation|process|encoding
  attribution   String?                 // knowledge|procedure|calculation|reading|strategy|slip
  rootNodeId    String?                 // 下探定位到的病根节点
  dialogueLog   Json?                   // 追问对话记录
  voiceNoteText String?                 // ASR 转写
  confirmed     String   @default("pending") // pending | slip_confirmed | gap_confirmed（隔天变式后回填）
}
```

与基座的衔接：wrong-notebook 已有 Mistake（错题）模型与标签系统。新增 `MistakeNode(mistakeId, nodeId)` 关联表，由 VLM 打标 + 人工确认维护，使错题与图谱节点互通。**不修改基座已有表结构**，全部以新表挂接，降低后续合并上游更新的冲突。

### 2.6 图的运行时形态

应用启动时整图加载为内存邻接表（约 250-350 节点 / 数百边，毫秒级）。所有遍历（下探、前沿计算、主线子图提取）在内存做，不写递归 SQL。提供 `graph.ts` 单例：`prereqsOf(node)`, `dependentsOf(node)`, `frontier(studentState)`, `descend(node, state)`。

---

## 3. 诊断引擎

### 3.1 初诊（KST-lite，每条主线解锁时做一次）

目标：12-18 题、25-35 分钟，输出该主线子图内每个节点的初始 status 与 BKT 先验。

```
算法 initialDiagnosis(mainline):
  candidates = mainline 子图节点（含其地基前置），全部标 untested
  asked = 0
  while asked < 18:
    node = pickMostInformative(candidates)
      # 启发式：在"未测且其前置已知"的边界带中，选 后代数×不确定度 最大的节点
    item = 该 node 的 boundary 题（随机一道）
    呈现并收集作答
    if 正确:
      node.status = stable（暂定）
      其 prerequisite 祖先链全部标 stable（KST 状态收缩，向下传播）
    else:
      node.status = gap（暂定）
      其 prerequisite 后代链全部标 gap 候选（向上传播）
    asked += 1
    if 边界带已收敛（无高信息量节点）: break
  对 4-6 个 uncertain 节点各补 1 道确认题
  输出: 每节点 status + masteryProb 先验（stable→0.85, uncertain→0.5, gap→0.15）
  前台只展示: 学习前沿（1-2 个"下一步正好能学会"的节点）
```

向下/向上传播是 KST 高效率的来源：答对一道"解一元二次不等式"，其下整条链（十字相乘、判别式、二次函数图象…）免测。

### 3.2 周末错题归因（Newman 流程）

每个周末 session，系统从本周错题中**分诊挑 2-3 道**（优先级：学习前沿附近的题 > 命中高权重节点的题 > 周中标记为"完全没思路"的题），其余错题只做轻量入库打标。

被选中的题走完整归因流程：

```
① 重做口述：她当场重做 + 录音（ASR 转写，热词表加持）
② VLM 读图：原图（题面+她的过程+箭头标记）+ 转写一并给 LLM
③ Newman 定位：LLM 按五阶段判定最早断点
④ 分流：
   断在 reading/comprehension/transformation → 概念/表征类，直接下探（3.3）
   断在 process/encoding 且该节点 masteryProb ≥ 0.7
     → 即时给 1 道概念题（concept 角色）
       通过 → 标 slipFlag，归因暂记 slip，安排隔天同构变式进周中纸质包
       不通过 → 改判 gap，下探
⑤ 写 ErrorRecord；变式题结果次周回填 confirmed 字段（P3：双证据才定论）
```

**Newman 追问 prompt 模板（system prompt 骨架）**：

```
你是一名数学诊断老师，正在帮助一名高中生定位她做错一道题的真正原因。
你将看到：题目原图、她的解题过程照片（含她标记的卡点箭头）、她重做时的口述转写。

严格遵守：
1. 一次只问一个问题，等她回答后再问下一个，总轮数不超过 6 轮。
2. 按以下顺序探查，找到最早的断点即停止，不要继续往后问：
   a.（阅读）"把题目里这句话用你自己的话说一遍"
   b.（理解）"这道题最终要你求的是什么"
   c.（转换）"你打算把这个条件变成什么式子/图"
   d.(过程）"这一步到下一步，你用的是什么规则"
   e.（表达）"你最后写的答案和你算出的结果一致吗"
3. 绝不讲解、绝不给答案、绝不评价对错；只问，让她自己说。
4. 她说"不知道"时降一级换更具体的问法，连续两次"不知道"则停止并定位断点。
5. 结束时输出 JSON：{newmanStage, attribution, rootNodeCandidates: [节点ID], confidence, evidence: 一句话引用她的原话}
6. 语气：平静、不催促，像在和她一起看题，而不是在考她。
```

### 3.3 探针下探（定位病根）

```
算法 descend(failedNode, state):
  layer = prereqsOf(failedNode) 中 status ≠ stable 的节点，按 prerequisite 边优先
  while layer 非空:
    node = layer 中后代数最多者          # 信息量最大
    出 1 道该 node 的 boundary 题（探针）
    if 答对且耗时正常:
      node 及其祖先标 stable → 病根 = 上一轮失败的节点，停止
    else:
      继续向 node 的前置下探
  地基层全 stable 仍无解 → 走 tool 边再探一层
  输出 rootNodeId，更新沿途节点 status
```

每次下探 ≤ 5-6 道探针，对她的体感是"做几道小题"，不是"被考试"（P4）。

### 3.4 BKT 更新（追踪层）

每次作答（探针、变式、微练对答案录入）后对应节点更新：

```
答对: post = P(L)(1-S) / [P(L)(1-S) + (1-P(L))·G]
答错: post = P(L)·S   / [P(L)·S   + (1-P(L))·(1-G)]
P(L) ← post + (1-post)·T
```

默认参数（专家设定，首版不做参数学习）：
P(L0) 来自初诊（0.85/0.5/0.15）；T=0.15；G=0.20（四选一选择题 0.25）；S=0.10。
阈值：masteryProb ≥ 0.95 → stable（地图变绿）；≤ 0.30 → gap（红）；中间 → uncertain（黄）。
同一节点连续两次 slip 判定 → 强制改走 gap 流程（防止"粗心"标签滥用）。

---

## 4. AI 管线

| 能力 | 首选 | 备选 | 接入方式 |
|---|---|---|---|
| VLM 识图 | 火山方舟 豆包视觉模型 | 阿里百炼 Qwen-VL-Max | OpenAI 兼容，复用基座 Provider 配置 |
| 对话/归因 LLM | DeepSeek-V3 | 火山方舟 豆包 | 同上 |
| ASR | 火山 豆包 ASR（热词表） | 自部署 SenseVoice/FunASR | 热词表预置数学术语 300+ 条 |
| 变式/微练生成 | 同对话 LLM | — | 生成题 reviewed=false，人工过审才入库 |

工程铁律：

1. **黄金测试集先行**：开发第一周用她真实教辅+真实手写拍 20 张照片建回归集；每次换模型/改 prompt 跑一遍，人工评分（题面识别准确率须 100%，过程理解抽查通过）。
2. **题面确认环节**：拍照提交后展示识别结果，她点确认/修正（30 秒换题面 100% 正确）；手写过程不设确认环节，依 P1 由 VLM 直接看图。
3. **拍照质量门禁**：取景引导框 + 模糊检测当场重拍 + 一题一拍。
4. ASR 热词表与图谱节点名联动维护（节点名即热词的主要来源）。

---

## 5. 周流程编排

### 5.1 周中（纸上，零屏幕）

她只需遵守三条规则：过程写在题旁不擦不涂改；做不出的题贴指示标签露出页边；卡住处画箭头 + 几个字写卡点。另每日完成纸质包中 10 分钟地基微练。

### 5.2 周末 session 状态机（目标 ≤ 90 分钟）

```
开始 → [批量拍照] 翻标签页逐题拍（选教辅下拉，可选页码）
     → [题面确认] 逐题确认/修正识别文本
     → [自动分诊] 系统挑 2-3 道深诊题，其余静默入库打标
     → [重做口述] 深诊题逐道：重做 + 录音
     → [归因对话] Newman 追问（每题 ≤ 6 轮）→ 必要时探针下探
     → [地图更新] 展示增量：本周点亮 X 个点 / 新前沿是什么（P4）
     → [生成纸质包] 下周 PDF：每日地基微练 + 针对性变式（含 slip 复测题）
                    + 1-2 个 B 站视频片名（周末看）→ 打印
结束
```

### 5.3 周中纸质包 PDF（复用基座导出打印能力）

版式：A4 × 2-3 页。第 1 页周一至周五每日一栏（10 分钟微练，每日 5-8 小题，全部来自 gap/uncertain 节点的 drill 题）；第 2 页本周变式题（含上周 slip 待复测的同构题，不标注来源，避免"复查"感）；页脚印视频清单与一句本周聚焦点。微练答案附末页（对折装订在内侧），周末 session 录入对错喂给 BKT。

---

## 6. 开发路线图

| 里程碑 | 周期 | 内容 | 验收标准 |
|---|---|---|---|
| **M0 环境** | 进行中 | Docker 跑通基座；AI Provider 切 DeepSeek/豆包；建 20 张黄金测试集并完成 VLM 选型 | 拍照→AI 解析全链路在国产模型上可用 |
| **M1 图谱层** | 第 1-2 周 | Prisma 增量迁移；导入种子数据（地基 BG001-104 + M1/M2a 主线节点与边）；内存图模块；MistakeNode 打标管线 | 错题入库自动挂节点标签，人工可改 |
| **M2 归因流程** | 第 2-3 周 | 周末 session 状态机（拍照确认/分诊/重做口述/Newman 对话）；知识地图页（红黄绿） | 一次完整周末 session 端到端走通 |
| **M3 初诊+追踪** | 第 3-4 周 | KST-lite 初诊模块；BKT 更新；纸质包 PDF 生成 | M1 主线初诊 ≤ 35 分钟出地图；周日能打印下周包 |
| **M4 深化** | 第 5 周起 | 探针下探自动化；变式生成+人工审题工作台；slip 回填闭环；同学多用户开放 | 粗心/概念双证据闭环跑通 |
| **并行** | 持续 | 第 0 阶段人肉回路不停（异步语音+照片）；其记录作为 prompt 调试测试集；主线节点内容由人工持续编写 | — |

内容生产计划（与代码并行的教研工作量，勿低估）：地基层题库（boundary/concept/drill 各 1-2 道 × 104 节点）优先；M1、M2a 主线节点微技能化与配题次之；B 站视频映射人工维护，每节点 1-2 个。LLM 可起草题目但必须人工过审（reviewed 字段把关）。

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 提示词三（真题权重）缺位 | priority 用暂定值开发不阻塞；调研回来只更新字段 |
| 主线节点尚未微技能化（目前仅地基层达到粒度） | 函数主线 1.0 作为下一个内容交付物；其 schema 即模板，其余主线照填 |
| LLM 归因幻觉 | P3 双证据 + prompt 强制"多问少断" + ErrorRecord 留对话日志供人工抽查 |
| 手写识别不准 | P1 图为真相源 + 题面人工确认 + 黄金测试集回归 |
| 她周末时间被挤占 | session 硬上限 90 分钟；分诊只深挖 2-3 题；其余自动入库 |
| 诊断挫败感（ALEKS 教训） | P4：测评弱可见、地图只报增量、变式复测不标注来源 |
| 基座上游更新冲突 | 增量全走新表，不改基座 schema；fork 上游定期 rebase |

---

## 8. 待确认项（回复确认后开工）

1. **主线裁决**：8 主线方案 + M2 拆 a/b 两段解锁，是否同意？
2. **解锁顺序**：M1 → M2a → M3 → M5 → M8 → M4 → M2b → M6 → M7（暂定），是否同意先按此开发？
3. **地基补充节点** BG100-104 是否确认加入？
4. **提示词三**是否继续跑？（建议跑，结果只影响 priority 字段）
5. **AI 选型**：是否同意"火山方舟全栈优先（视觉+ASR+LLM 一个账单），对话模型备选 DeepSeek"？
