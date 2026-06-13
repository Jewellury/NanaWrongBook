# 个性化数学诊断辅导系统 · 技术方案 v2.0（权威版）

> 本文档合并 v1.0 正文与 v1.1 补丁的全部裁决，是项目唯一权威技术蓝图。读此一份即可，无需再翻 v1.0/补丁。
> 基座：wrong-notebook（Next.js 16 / React 19 / SQLite / Prisma / NextAuth / PWA）
> 目标用户：高二理科生（安徽，新高考全国 I 卷），当前 30-40 分，目标 85-95 分
> 配套文件：seed_graph_batch1.ts（M1 里程碑种子数据）、开发第一轮工单（M1 spec）

---

## 0. 战略定位（先读这段，它约束一切设计）

她的 30 分不是"高中知识点有洞"，是**从初中代数运算开始的系统性断层**。所以目标不是"补全高中数学"，
是**抓基础保底**——高考数学约 80-90 分是基础题，从 30 爬到 85-95 是可达的。产品不做全，
能借现成的就借（解题用大模型API、视频用B站），自建的只有两样通用AI做不到的核心：
**①个人化、跨会话持久的知识状态地图；②错因归因式追问**。

成败变量按重要性排序：**她的持续使用意愿 > 诊断准确性 > 产品体验 > 技术实现**。
（依据：Khan Academy 承认 Khanmigo 真实使用率仅约15%，学生大量只回"idk"。技术能做出，孩子用不用是另一回事。）

---

## 1. 总体架构

```
┌─────────────────────────────────────────────────────┐
│                wrong-notebook 基座（已有）             │
│  错题录入/AI解析/标签/筛选/相似题/统计/打印PDF/多用户/PWA │
└──────────────┬──────────────────────────────────────┘
               │ 增量开发（本方案范围，全部新增表，绝不改上游表）
┌──────────────┴──────────────────────────────────────┐
│ ① 知识图谱数据层    节点/边/主线/tier/学生状态/误解库     │
│ ② 诊断引擎         初诊KST-lite / Newman归因 / 探针下探  │
│ ③ 追踪引擎         BKT 掌握度更新 / 知识地图UI           │
│ ④ 周流程编排       周末session状态机 / 周中纸质包PDF     │
└──────────────┬──────────────────────────────────────┘
┌──────────────┴──────────────────────────────────────┐
│ AI 管线（OpenAI 兼容接口，复用基座 Provider 配置）        │
│  VLM识图 · 对话LLM · ASR语音 · 黄金测试集回归            │
│  首选火山方舟(豆包)全栈，对话备选 DeepSeek               │
└─────────────────────────────────────────────────────┘
```

---

## 2. 五条贯穿全局的设计原则（P1-P5）

- **P1 图为真相源**：题目照片是唯一可信输入，OCR/VLM 转写只作索引；诊断对话永远同时携带原图。
  化解"手写数学识别不准"这一最大风险。
- **P2 结构先于模型**：图谱、边界题、错因规则是显式数据；LLM 只在受约束位置（追问、讲解、变式生成）工作，
  不承担底层判定。开发顺序必须"先结构层规则层、后接LLM"，反过来会得到"会说话但不稳定"的AI老师。
- **P3 多问少断**：粗心 vs 概念的结论绝不来自单次答错，必须有"概念题 + 隔天同构变式"双重证据。
- **P4 诊断后台化**：测评对学生弱可见，前台只报增量（地图点亮、新前沿），不报"你又错了"。
  依据：ALEKS 周期性 knowledge check 让弱基础生体验成"不断被要求证明自己不行"，挫败感极强。
  对考30分的孩子，默认形态的诊断系统本身就是心理打击。
- **P5 周末数字化、周中纸质化**：应用周中输出是可打印 PDF（复用基座导出），周末是唯一上屏时间。
  对一个要戒断刷题焦虑、沉下心的孩子，这反而是更健康的形态。

---

## 3. 知识图谱数据层

### 3.1 八条主线（最终编码，钉死）

| ID | 主线 | priority(次级排序键) | 高考严格年均权重 |
|---|---|---|---|
| M0 | 地基层（共享根，非主线，BG001-104） | 0 | — |
| M1 | 数学语言与代数预备（集合/逻辑/不等式/复数） | 1 | 10.0 |
| M2a | 函数与指对幂 | 2 | ~16 |
| M3 | 三角函数与解三角形 | 3 | 25.5 |
| M5 | 平面向量 | 4 | 5.0 |
| M8 | 计数、概率与统计 | 5 | 14.5 |
| M4 | 数列 | 6 | 18.5 |
| M2b | 导数及其应用 | 7 | ~10 |
| M6 | 立体几何与空间向量 | 8 | 20.5 |
| M7 | 解析几何 | 9 | 29.5（最高） |

裁决理由：向量独立成线（是三座必需前置桥的源头）；数列与导数分开（按ROI排序需要）；与课标主题划分对应干净。

### 3.2 难度带 tier（比主线更重要的调度维度）★

依据：全国I卷大题模块**动态轮换**（2024 Q15-17=三角/解几/立体，2025=统计/数列/立体，2026=立体/三角/概率），
死记"第几题考什么"命中率低，**真正稳的是难度带**。

| tier | 含义 | 对应题位 | 累计分 | 调度规则 |
|---|---|---|---|---|
| A 托底 | 基础定义/公式/1-2步运算 | Q1-6、Q12-13 | 40 | 学习前沿最高优先，跨所有主线先建设 |
| B 第一问 | 各主线大题第一问通法 | Q15.1、Q16.1、Q17.1 | +16~18 | A站稳后主增量，60→78分 |
| C 中档补位 | 中档层，不碰最深 | Q9、Q10、Q14、Q18.1 | +27~37 | 按主线ROI排（M7>M3>M6>M4…） |
| D 放弃区 | 压轴/创新/证明链 | Q7-8、Q11、Q14压轴、Q18后问、Q19 | — | 不进她的学习前沿；放弃后理论上限仍95分 |

**学习前沿排序算法 = 先按 tier（A>B>C，排除D），同 tier 内按主线权重 ROI**，取前1-2个推给她。
这让她的提分路径自动贴合"先吃掉所有主线的A/B层"这条最优保底路线，而非被单一主线卡住。
priority 字段降为同tier同前提下的次级排序键。

### 3.3 边的三种类型

| 依赖性质 | 入图方式 | 用途 |
|---|---|---|
| prerequisite 必需前置 | 图谱边，权重1.0 | 探针下探主路径、学习前沿计算 |
| tool 常用工具 | 图谱边，权重0.5 | 下探次级路径（主路径无解释时才走） |
| transfer 思想方法迁移 | **不入图**，写入节点 teachingNotes | 仅供讲解环节引用（如"等差数列类比一次函数"） |

为什么区分：transfer 不是依赖关系，学生不会因"没掌握类比"而做错题。若当边遍历，下探会跑到莫名其妙的地方。

### 3.4 误解库与两层错因标签 ★

错因标签设计为**两层**（取自错题库调研）：
- **一级（错误性质）**：概念性 / 程序性 / 计算性 / 符号表示 / 条件前提缺口 / 完备性缺口
- **二级（知识缺口）**：定位到具体节点ID

为什么必须两层：否则系统极易把"概念没懂"误判成"算错了"——这正是 P3 双证据要防的。

**跨章复用标签 crossTag**（横切关注点）：定义域优先 / 等价变形守恒 / 完备分类讨论 / 取等可达性 / 对象类型意识。
威力在横切识别：她在对数/根式/奇偶性定义域上"都"漏 → 系统识别为"一个'定义域优先'系统性缺失"，
而非三个孤立的洞。这比树状图谱更能抓真问题。

误解库种子 = 错题库调研的20多条四联体（错误表现→误解→底层缺口→诊断追问），是 Newman 归因引擎的弹药。
schema 模板借鉴 MaE 数据集（MIT许可）。

### 3.5 完整 Prisma Schema（全部新增表，不改 wrong-notebook 已有表）

```prisma
model KnowledgeNode {
  id            String   @id            // "BG001" / "M1-11" / "M2a-03"
  name          String
  layer         String                  // foundation | mainline
  stage         String                  // 学段
  judgeCriteria String                  // 一句话判定标准
  sampleItem    String?
  teachingNotes String?                 // 迁移类比/通法步骤/易错点
  tier          String?                 // A | B | C | D（调度主键）
  videoLinks    Json?                   // [{title,searchKey,uper,duration,role,note}]
  edgesOut      KnowledgeEdge[] @relation("src")
  edgesIn       KnowledgeEdge[] @relation("tgt")
  mainlines     NodeMainline[]
  items         Item[]
  states        StudentNodeState[]
}
model KnowledgeEdge {
  sourceId String
  targetId String
  type     String                       // prerequisite | tool（transfer不入图）
  source   KnowledgeNode @relation("src", fields:[sourceId], references:[id])
  target   KnowledgeNode @relation("tgt", fields:[targetId], references:[id])
  @@id([sourceId, targetId])
}
model Mainline {
  id String @id  name String  priority Int  weight Float?
  nodes NodeMainline[]
}
model NodeMainline {
  nodeId String  mainlineId String
  node KnowledgeNode @relation(fields:[nodeId], references:[id])
  mainline Mainline @relation(fields:[mainlineId], references:[id])
  @@id([nodeId, mainlineId])
}
model Item {
  id String @id @default(cuid())
  nodeId String  node KnowledgeNode @relation(fields:[nodeId], references:[id])
  role String                            // boundary | concept | variant | drill
  stem String  answer String  analysis String?
  source String?                         // 人工 | LLM生成-已审 | 教辅名
  reviewed Boolean @default(false)       // LLM生成题必须人工过审才可用
}
model StudentNodeState {
  studentId String  nodeId String
  node KnowledgeNode @relation(fields:[nodeId], references:[id])
  masteryProb Float @default(0.0)
  status String @default("untested")     // stable|uncertain|gap|untested
  slipFlag Boolean @default(false)
  lastEvidence DateTime?
  @@id([studentId, nodeId])
}
model DiagnosisSession {
  id String @id @default(cuid())
  studentId String  kind String          // initial | weekend
  startedAt DateTime @default(now())
  records ProbeRecord[]  errors ErrorRecord[]
}
model ProbeRecord {
  id String @id @default(cuid())
  sessionId String  session DiagnosisSession @relation(fields:[sessionId], references:[id])
  itemId String  nodeId String  correct Boolean  durationS Int?
  createdAt DateTime @default(now())
}
model ErrorRecord {
  id String @id @default(cuid())
  sessionId String  session DiagnosisSession @relation(fields:[sessionId], references:[id])
  mistakeId String                        // → wrong-notebook 既有 Mistake.id
  newmanStage String?                     // reading|comprehension|transformation|process|encoding
  errorType String?                       // 一级标签:概念性|程序性|计算性|符号|条件前提缺口|完备性缺口
  crossTag String?                        // 跨章复用标签
  rootNodeId String?                      // 二级:定位到的病根节点
  dialogueLog Json?  voiceNoteText String?
  confirmed String @default("pending")    // pending|slip_confirmed|gap_confirmed（隔天变式后回填）
}
model Misconception {
  id String @id @default(cuid())
  board String  errorType String  crossTag String?
  manifestation String                    // 错误的具体表现
  misbelief String                        // 背后的概念误解
  rootNodeId String?                      // 暴露的真正知识缺口 → KnowledgeNode.id
  probeCue String                         // 教师追问/反例
  evidence String                         // 证据等级 A|B|C
}
model MistakeNode {                        // 错题↔节点关联（挂接既有 Mistake 表，不改它）
  mistakeId String  nodeId String
  confirmed Boolean @default(false)
  @@id([mistakeId, nodeId])
}
```

### 3.6 图的运行时形态

启动时整图加载为内存邻接表（<400节点，<1000边，毫秒级），单例 `lib/graph.ts`，提供
`prereqsOf / allPrereqsOf / dependentsOf / mainlineSubgraph / frontier`。所有遍历在内存做，不写递归SQL。
加载时检测环并报警（DAG数据错误早发现）。

---

## 4. 诊断引擎

### 4.1 初诊 KST-lite（每条主线解锁时一次）
12-18题、25-35分钟。选最高信息量节点出边界题；答对→祖先链全标stable（向下传播），答错→后代链标gap候选。
4-6个uncertain节点各补1道确认题。输出每节点status+BKT先验（stable→0.85/uncertain→0.5/gap→0.15）。
**前台只展示学习前沿（1-2个），其余对她隐藏（P4）**。

### 4.2 周末错因归因（Newman流程）
系统从本周错题分诊挑2-3道（优先级：学习前沿附近 > 命中高权重节点 > 周中标"完全没思路"），其余轻量入库打标。
被选中的题：①她当场重做+录音（ASR热词表）②VLM读原图（题面+过程+箭头标记）+转写一并给LLM
③Newman五阶段定位最早断点 ④分流：断在reading/comprehension/transformation→直接下探；
断在process/encoding且masteryProb≥0.7→即时给概念题，过→标slipFlag安排隔天变式，不过→改判gap下探
⑤写ErrorRecord，变式结果次周回填confirmed（P3双证据）。

**Newman追问 prompt 铁律**：一次一问、总轮数≤6、按阅读→理解→转换→过程→表达顺序找最早断点即停、
绝不讲解给答案、连续两次"不知道"则停止定位、结束输出JSON(newmanStage/errorType/crossTag/rootNodeCandidates)。
语气平静不催促，像一起看题而非考她。

### 4.3 探针下探（二分定位病根）
她某节点错→不在该层反复测，沿prerequisite边向下出探针题，直到探到她做得对且做得快的那一层=地基真实位置，
病根=上一轮失败节点。每次≤5-6道探针，体感是"做几道小题"不是"被考试"（P4）。地基全过仍无解→走tool边再探一层。

### 4.4 BKT 追踪
```
答对: post = P(L)(1-S) / [P(L)(1-S)+(1-P(L))G]
答错: post = P(L)S / [P(L)S+(1-P(L))(1-G)]
P(L) ← post+(1-post)T
```
默认参数（专家设定，首版不学习）：P(L0)由初诊给定；T=0.15；G=0.20（选择题0.25）；S=0.10。
阈值：≥0.95→stable(绿)；≤0.30→gap(红)；中间→uncertain(黄)。连续两次slip判定→强制改走gap流程（防滥用粗心标签）。

---

## 5. AI 管线

| 能力 | 首选 | 备选 |
|---|---|---|
| VLM识图 | 火山方舟豆包视觉 | 阿里Qwen-VL-Max |
| 对话/归因 | DeepSeek-V3 | 豆包 |
| ASR | 豆包ASR（热词表300+数学术语，与节点名联动） | 自部署SenseVoice/FunASR |
| 变式/微练生成 | 同对话LLM | — |

工程铁律：①**黄金测试集先行**（开发第一周用她真实教辅/手写/灯光拍20张建回归集，换模型改prompt都跑一遍，
题面识别须100%；模型选型看她字迹上的真实表现不看榜单）②题面人工确认30秒（手写过程不确认，靠VLM看图，P1）
③拍照质量门禁（取景框+模糊检测+一题一拍）④生成题reviewed=false人工过审才入库。

---

## 6. 周流程编排

### 6.1 周中（纸上零屏幕）
三条极简规则：过程写题旁不擦不涂改；做不出的题贴指示标签露页边；卡住处画箭头+几个字写卡点。
另每日完成纸质包10分钟地基微练。**不重新编号题目（照片即身份证，VLM读题面去重）。**

### 6.2 周末 session 状态机（≤90分钟）
批量拍照（题目+过程+标记整页拍）→题面确认（逐题确认/修正）→自动分诊（挑2-3道深诊，其余静默入库打标）
→重做口述（深诊题逐道重做+录音）→Newman追问→必要时探针下探→地图更新（只报增量，P4）
→生成下周纸质包PDF并打印。

### 6.3 周中纸质包 PDF（复用基座导出能力）
A4×2-3页：每日10分钟微练（来自gap/uncertain节点的drill题）+ 本周变式题（含上周slip待复测的同构题，
不标注来源避免"复查"感）+ 视频清单 + 一句本周聚焦点。微练答案对折装订内侧，周末录入对错喂BKT。

---

## 7. 开发路线图

| 里程碑 | 周期 | 内容 | 验收 |
|---|---|---|---|
| M0 环境 | 完成 | Docker、AI切国产、基建 | 全链路可用 |
| **M1 图谱层** | 第1-2周 | Prisma增量表、种子导入、内存图、单测 | npm run seed入库，图遍历测试过 |
| M2 归因流程 | 第2-3周 | 周末session状态机、Newman对话、知识地图页 | 一次完整周末session端到端走通 |
| M3 初诊+追踪 | 第3-4周 | KST-lite初诊、BKT、纸质包PDF | M1主线初诊≤35min出地图，周日能打印 |
| M4 深化 | 第5周起 | 探针下探自动化、变式审题台、slip回填闭环、多用户开放 | 粗心/概念双证据闭环跑通 |
| 并行 | 持续 | 第0阶段人肉异步回路；主线节点内容生产 | — |

内容生产计划（教研主战场，勿低估，按"地基层+A层优先"）：地基层题库 → M1/M2a配题 → 其余主线节点（M3/M4优先）。
LLM起草+人工过审（reviewed字段把关）。B站视频映射人工核实存在性后入库。

---

## 8. 内容资产现状

✅就绪可入库（在seed_graph_batch1.ts）：地基层BG001-104、M1节点(30+4)、M2a节点(50+1)、tier标注、
20座主线级桥、视频映射示例、误解库20多条四联体。
⬜待生产：M3/M4/M5/M6/M7/M2b主线节点（提示词四模板照填）、各节点配题、真题基础题种子库（待复核外部AI转写）。

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 她不持续使用（头号死因） | P4诊断后台化 + P5纸质化降摩擦 + 地图即治疗的动机设计 |
| LLM归因幻觉 | P3双证据 + Newman prompt"多问少断" + ErrorRecord留日志供抽查 |
| 手写识别不准 | P1图为真相源 + 题面人工确认 + 黄金测试集回归 + 输入双通道 |
| 诊断挫败感(ALEKS教训) | P4测评弱可见、只报增量、变式复测不标来源 |
| 教研工作量被低估 | 内容是真瓶颈非代码；MVP敢砍（先函数主线+A层托底即有价值） |
| 上游更新冲突 | 全走新增表/新文件，必改上游文件则小而集中并标注 |
| 时间紧(明年6月高考) | 第0阶段人肉回路现在并行启动，不等系统做完 |
