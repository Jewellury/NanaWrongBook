# 开源轮子调研报告
**项目：错题本 / 个性化诊断辅导（Nana）**
**调研日期：2026-06-27**

---

> **阅读说明**
> 本报告完整覆盖工单 A–D 四节。先看优先级总表（第一节），再按需展开每个仓库的四问（第二节），架构图在第五节。

---

## 一、候选轮子总表

### 1.1 工单原始六个仓库

| 仓库 | 核心能力 | 可借鉴点（借结构 / 借实现） | 风险点 |
|---|---|---|---|
| [laurent22/joplin](https://github.com/laurent22/joplin) | 离线优先笔记 + 附件 + 标签 + 同步 + 全文检索；已带 `transcribe` Docker 组件 | **借结构**：单条记录容纳文本/附件/标签/时间/地理的数据模型；**借实现**：离线优先 + 端到端加密同步 + FTS 检索这套成熟方案 | 体量极大（1.5 万+ commit），Electron/RN 全家桶，只适合抠模型与局部模块 |
| [logseq/logseq](https://github.com/logseq/logseq) | local-first block 化知识库，双向链接 + 图谱视图 + DB 版（SQLite） | **借结构**：block 级组织 + 反向链接 + 图谱；DB 版 block→SQLite 建模适合参考"步骤/依赖/结论"的过程树 | ClojureScript 技术栈，团队若是 JS/TS 迁移成本高；DB 版仍 beta，官方明示可能丢数据 |
| [Zettlr/Zettlr](https://github.com/Zettlr/Zettlr) | 写作/发表工作台，强全文检索 + 导出（Pandoc）+ 引用管理 + 模板 | **借结构**：service-provider 单例分层（search/tags/links/documents/fsal）；"结构化内容 + 多通道导出"管线 | 定位是写作发表而非错题，采集壳/语音用不上；只适合借架构分层与导出思路 |
| [EduNLP/edu-convokit](https://github.com/EduNLP/edu-convokit) | 教育对话数据框架，`preprocess / annotate / analyze` 三段管线，NAACL 2024 发表 | **借结构**：把教育内容拆成"先预处理→再标注→再分析"的管线范式，契合错题内容结构化处理 | 研究用 Python 库（72 commit，面向 transcript），不是产品组件，只能借管线思想 |
| [Mathics3/mathics-core](https://github.com/Mathics3/mathics-core) | 开源 Mathematica 内核：parser → Expression → evaluator 三层 | **借结构**：解析器/表达式/求值器的分层，可类比"题目→解法→步骤→结论"的过程表示与规则分层 | 这是 CAS 计算内核，不是笔记/题库；只取"表达式分层"这一抽象，不进主干 |
| [OpenASR/idiolect](https://github.com/OpenASR/idiolect) | IntelliJ 平台语音控制插件，AsrProvider / NlpProvider / IntentResolver / IntentHandler 四层可替换架构 | **借结构**：把语音拆成"识别→意图→处理→反馈"且各层可替换（扩展点），是"录音驱动动作"的最佳范式参照 | 绑定 JetBrains Platform SDK，代码不能直接搬；只借接口分层抽象 |

### 1.2 调研新发现（比原清单更贴题）

| 仓库 | 核心能力 | 可借鉴点 | 风险点 |
|---|---|---|---|
| [CAHLR/OATutor](https://github.com/CAHLR/OATutor) ⭐ | 开源智能辅导系统，贝叶斯知识追踪（BKT）估计技能掌握度，题目 + hint/scaffold JSON 内容模型 | **借结构 + 实现**：题目→hint→scaffold 的内容模型；BKT"知识点掌握度诊断"算法，是"个性化诊断"的核心缺口补丁 | 内容库偏英文 OpenStax，需本地化为国内高中数学知识点体系 |
| [st3v3nmw/obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) ⭐ | 在笔记上做 FSRS / SM-2 间隔重复，复习整篇笔记或卡片 | **借实现**：FSRS 排程算法，直接解决"什么时候再练这道错题"，不必自研 | Obsidian 插件，强绑定宿主；借算法不借宿主 |
| [TriliumNext/Notes](https://github.com/TriliumNext/Notes) | local-first，层级 + relation 的笔记结构（note + attribute + relation 模型） | **借结构**：比 Joplin 更适合"题目-依赖-知识点"带关系的过程知识组织 | 个人项目色彩重，需评估活跃度与长期维护 |

---

## 二、工单 A：最值得借的三个轮子

按"目标接近度 + 能直接借结构 + 匹配当前阶段 + 开源成熟度"排序，**不按名气**。

### 🥇 P0 — laurent22/joplin（采集壳阶段）

**入选理由：**
唯一同时满足"题图/音频/转写/附件/标签同处一条记录 + 离线优先 + 同步 + 全文检索"的成熟轮子，且官方 `Dockerfile.transcribe` 已经处理了语音转写基础设施。单从采集壳维度看，它比 logseq 更成熟、比 Zettlr 更贴业务。

### 🥇 P0 — OpenASR/idiolect（语音交互阶段）

**入选理由：**
四层可替换抽象（识别/意图/处理/反馈）是"录音驱动动作而非只是录音附件"的最佳参照架构。直接支撑"语音输入做成可替换模块"的前端组件边界判断。即便不用它的代码，其 `AsrControlLoop → NlpProvider → IntentHandler` 控制流也是语音模块的接口设计蓝本。

### 🥈 P1 — logseq/logseq（诊断骨架阶段）

**入选理由：**
block + 双向链接 + 图谱视图是"过程知识"组织的唯一一个有大规模用户验证的开源方案。DB 版把 block 存到 SQLite 并可 RTC 同步，技术路线与项目方向完全一致。降为 P1 是因为 ClojureScript 不能直接复用，建议借结构不借实现。

---

## 三、工单 B：每个仓库四问

### Joplin

| 问题 | 回答 |
|---|---|
| **借什么** | 单条记录数据模型（文本+附件+标签+元数据）、离线优先存储、端到端加密同步、SQLite FTS 全文检索、transcribe 转写基础设施 |
| **不借什么** | Electron/React Native 整套 UI 外壳、Joplin 的 Markdown 编辑器、Web Clipper |
| **借到哪一层** | 数据模型层 + 存储/检索/同步层 |
| **需要我们重新设计** | 把通用 note 收窄成"错题 case"：题图常驻区固定在记录顶部；录音字段从普通附件升格为结构化字段；增加转写/摘要/标签/诊断结果四个专属字段，而不是全部塞进一段 Markdown |

### logseq

| 问题 | 回答 |
|---|---|
| **借什么** | block 级组织、双向链接、图谱视图交互范式、DB 版 block→SQLite 建模方式 |
| **不借什么** | ClojureScript 实现、桌面应用壳、file-based graph 存储格式 |
| **借到哪一层** | 数据结构与图谱交互范式层 |
| **需要我们重新设计** | 把通用 block 语义收窄为"题目→步骤→依赖→结论→知识点"的过程树节点；图谱要在 block/step 级展开，而非只画知识点圆点；双向链接要能关联"哪些题共享同一步骤/依赖" |

### Zettlr

| 问题 | 回答 |
|---|---|
| **借什么** | service-provider 单例分层架构（search/tags/links/fsal 各自独立）、Pandoc 多格式导出管线 |
| **不借什么** | 写作/发表 UI、CSL 引用管理、LaTeX 集成 |
| **借到哪一层** | 架构分层 + 导出管线层 |
| **需要我们重新设计** | 导出目标改为错题集 PDF/打印件；service-provider 需要新增"错题诊断 provider"和"语音 provider" |

### edu-convokit

| 问题 | 回答 |
|---|---|
| **借什么** | `preprocess / annotate / analyze` 三段管线范式；annotation 层的标注器接口设计 |
| **不借什么** | 研究向 Python 实现本身、transcript 专用标注器、对话数据集格式 |
| **借到哪一层** | 流程/范式层（概念借鉴，不借代码） |
| **需要我们重新设计** | 把"教育对话标注"替换为"错题标注"（知识点、错因类型、解法步骤价值）；把分析从"对话分析"换成"错误模式识别 + 薄弱项统计" |

### Mathics3

| 问题 | 回答 |
|---|---|
| **借什么** | parser → expression → evaluator 三层抽象思路 |
| **不借什么** | CAS 求值引擎本身、Wolfram Language 语法解析器 |
| **借到哪一层** | 纯概念层 |
| **需要我们重新设计** | 用轻量的"解题步骤 schema"（JSON-LD / YAML）表达过程树，不引入完整求值器；只借"输入→中间表示→求值/检索"三层分离的思路 |

### idiolect

| 问题 | 回答 |
|---|---|
| **借什么** | `AsrProvider / NlpProvider / IntentResolver / IntentHandler` 四层抽象 + 扩展点设计 + 自定义触发词机制 |
| **不借什么** | JetBrains Platform SDK 全部绑定代码、IntelliJ Action 系统 |
| **借到哪一层** | 接口/抽象层（四层可替换接口） |
| **需要我们重新设计** | 把"语音→IDE 动作"的映射替换为"语音→错题录入/检索/标注/复习"动作；AsrProvider 支持云端（Whisper API）与本地（Vosk/whisper.cpp）两种实现可热切换；IntentHandler 中追加"错题场景专属意图"（开始录题、标记错因、跳到图谱…） |

---

## 四、工单 C：更贴近"错题本 / 学习记录"的仓库

经过关键词 `education notes / study log / learning knowledge graph / math tutor / voice notes / local-first notebook / graph notes / spaced repetition` 补充搜索，以下两个仓库**明显比工单原始清单更贴题**，单独列出：

### ⭐ CAHLR/OATutor（强烈推荐纳入下一轮评估）

- **GitHub**：https://github.com/CAHLR/OATutor
- **核心能力**：贝叶斯知识追踪（BKT）估计学生技能掌握度；题目 + hint + scaffold 的 JSON 内容模型；纯 React，可部署到 git-pages，无需后端
- **补什么空缺**：原始六仓库只解决"装得下、组织得好"，缺少"如何诊断掌握度"。OATutor 直接把"诊断骨架"里最核心的掌握度估计算法给出了开源实现
- **借法**：借 BKT 算法实现 + 题目 JSON 内容模型；知识点体系改写为国内高中数学

### ⭐ st3v3nmw/obsidian-spaced-repetition（复习排程直接可借）

- **GitHub**：https://github.com/st3v3nmw/obsidian-spaced-repetition
- **核心能力**：FSRS / SM-2 间隔重复算法；支持复习整篇笔记或单张卡片；开源算法实现成熟
- **补什么空缺**：错题本最核心的问题之一是"什么时候该再练这道题"，FSRS 直接给了答案
- **借法**：借 FSRS 算法实现（可从 [awesome-fsrs](https://github.com/open-spaced-repetition/awesome-fsrs) 生态中挑 JS/TS 实现）；不借 Obsidian 宿主绑定

---

## 五、工单 D：前端组件边界判断

基于各仓库的结构借鉴，对前端组件边界给出如下判断：

| 组件/模块 | 判断 | 依据 |
|---|---|---|
| case 列表 / case 详情 / 过程展开 / 图谱页 / 导出页 | **应拆成独立页面/路由** | Joplin 和 Zettlr 都用独立 SPA 窗口承载不同职责，维护更清晰；Zettlr 的 `win-main / win-stats / win-assets` 分离设计是直接参考 |
| 采集壳 | **需要独立的 artifact 结构**（题图常驻区 + 录音追加区 + 结构化字段区） | Joplin 的"note 容纳附件+元数据"模型告诉我们容器边界在哪；但错题 case 比通用 note 更结构化，三个区域需要固定布局而非自由 Markdown |
| 语音输入 | **应做成可替换模块** | idiolect 的 `AsrProvider` 扩展点设计是最强信号；云端 ASR / 本地 ASR 可热切换是移动端场景的硬需求 |
| 图谱 | **应支持 block/step 级展开，不只是节点圆点** | logseq DB 版的 block 模型证明了 step 级节点的可行性；错题图谱中"步骤节点"与"知识点节点"是两种不同类型，需要区分展示 |
| 诊断 / 复习排程 | **应拆出独立服务层，不耦合在 UI** | OATutor 的 BKT 和 FSRS 都是无状态算法服务，适合作为独立后端服务或 Worker 运行，不应嵌入 UI 组件 |

---

## 六、优先级对照表（可直接喂给方案修订）

| 优先级 | 仓库 | 服务阶段 | 借的层次 | 能省掉什么 |
|---|---|---|---|---|
| **P0** | Joplin | 采集壳 | 数据模型 + 存储/同步/检索 | 错题 case 容器基础设施、离线存储、全文检索、转写基础 |
| **P0** | idiolect | 语音交互 | 接口抽象（四层） | 语音模块的接口设计、可替换 ASR 架构 |
| **P1** | logseq | 诊断骨架 | 数据结构 + 图谱交互范式 | 过程树/知识图谱的数据结构设计、图谱交互模式 |
| **P1** | edu-convokit | 内容结构化 | 管线范式 | 错题标注流水线的三段设计 |
| **P1** | OATutor ⭐新 | 诊断骨架 | 算法 + 内容模型 | BKT 掌握度诊断算法、题目内容 JSON 模型 |
| **P1** | FSRS/obsidian-sr ⭐新 | 复习排程 | 算法实现 | 间隔重复排程算法（不必自研） |
| **P2** | Mathics3 | 诊断骨架（补充） | 纯概念 | 过程表示分层的抽象思路 |
| **P2** | Zettlr | 导出/架构 | 架构分层 + 导出管线 | 导出页 Pandoc 管线 |

---

## 七、总结：直接并入 vs 留作开放项

### ✅ 直接并入后续方案（三块）

**① 采集壳以 Joplin 数据模型为蓝本**
具体做法：把 Joplin 的 note-resource-tag-metadata 四件套收窄为 case-image-audio-transcript-tags-diagnosis 六件套，离线存储和同步基础设施直接参考其 SQLite + E2EE 同步方案。预计能省掉 3–4 周的基础设施编码。

**② 语音交互接口采用 idiolect 四层抽象**
具体做法：AsrProvider（可切换云/本地）→ NlpProvider（语音→意图）→ IntentResolver（匹配错题动作）→ IntentHandler（执行动作）。语音模块从第一天起就是可替换组件，不与 UI 耦合。

**③ 内容结构化管线套 edu-convokit 三段范式**
具体做法：preprocess（OCR标准化+去噪）→ annotate（知识点+错因+步骤标注）→ analyze（错误模式+薄弱项识别）。这个范式无论用哪种 AI 标注工具都适用，先定范式再选工具。

### 🔄 留作开放项（等阶段到了再引入）

- **logseq 图谱/block 模型**：方向确定（block 级图谱），但需先完成数据模型稳定，ClojureScript 不引入，借结构自己实现
- **OATutor BKT 算法**：在诊断模块启动时引入，需先完成知识点体系本地化
- **FSRS 排程**：在复习模块启动时引入，算法成熟，直接用 JS 实现即可
- **Zettlr 导出管线**：等导出页需求明确后引入 Pandoc

---

## 附：明显更强的开源轮子（补充工单原清单）

> 以下两个仓库工单原清单未提及，但对"诊断 + 复习"环节的补强价值明显高于部分原始候选。

| 仓库 | 补强的能力缺口 | 建议动作 |
|---|---|---|
| **CAHLR/OATutor** | 掌握度诊断算法（BKT）、题目+hint JSON 内容模型 | 纳入诊断骨架第二轮评估，评估 BKT→知识点体系本地化成本 |
| **st3v3nmw/obsidian-spaced-repetition** + **awesome-fsrs 生态** | 间隔重复排程（FSRS）、复习队列管理 | 直接取 FSRS JS 实现，不依赖 Obsidian，复习排程模块可快速落地 |

---

*报告生成：2026-06-27 | 调研范围：GitHub 公开开源仓库 | 方法：工单指定仓库直接核查 + 关键词补充搜索*
