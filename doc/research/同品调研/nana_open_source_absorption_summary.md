# Nana 开源轮子吸收摘要（给项目 AI）

> 任务定位：请项目 AI 结合 Nana 当前项目实际，批判性评估两份开源轮子调研报告和本摘要的建议。
>
> 你不是照单全收，也不是重做一轮泛泛调研。你要判断：哪些结论能吸收进 `frontend-architecture-plan.md`，哪些只能进入 `DECISIONS.md` 开放项，哪些和 Nana 当前阶段不匹配。

## 你必须先看的项目上下文

请按下面顺序阅读。前 5 份是项目约束，后 4 份是本轮调研输入。

| 类型 | 路径 | 你要看什么 |
|---|---|---|
| 项目规则 | `AGENTS.md` | 三代理流程、铁律、不改上游、Git 收口规则 |
| 当前状态 | `doc/00_CURRENT.md` | 项目当前卡点、下一步、已有里程碑 |
| 当前任务 | `doc/active_spec.md` | 当前活跃任务与边界 |
| 技术方案 | `doc/reference/TECH_PLAN_v2.md` | Nana 的知识图谱、诊断、BKT、AI 管线主线 |
| 运营原则 | `doc/reference/OPS_handbook.md` | P1/P4/P5、共创者框架、医生模式、前台措辞原则 |
| 前端方案 | `doc/plan/frontend-architecture-plan.md` | 你要评估哪些开源结论应该并入这里 |
| 第一轮报告 A | `doc/research/同品调研/nana_open_source_research_report.md` | Joplin / Logseq / idiolect / OATutor / FSRS 等第一轮候选 |
| 第一轮报告 B | `doc/research/同品调研/开源轮子工单深度调研报告.md` | AFFiNE / SiYuan / Edu-ConvoKit / whisper.cpp / Vosk 等增补结论 |
| 第一轮架构图 | `doc/research/同品调研/nana_arch.png` | 看分层思路，不要照搬图里所有模块 |

## 这两份报告我认可的部分

### 1. “按层吸收”是对的

两份报告共同提醒了一件事：Nana 不该 fork 一个完整产品，也不该把所有开源仓库混成一个大方案。更合适的方式是按层吸收：

- 采集壳：负责 `case` 和多模态 artifact。
- 语音入口：负责录音、流式转写、可替换 ASR。
- 教育分析：负责 transcript / OCR 后的清洗、标注、分析。
- 诊断骨架：负责题目、步骤、依赖、结论、知识点价值。
- 复习排程：负责掌握度估计、复习时机、题目再出现。
- 搜索导出：负责检索、归档、纸质包、PDF。

### 2. 第二份报告比第一份更贴近可执行架构

第一份报告的价值是候选清单比较全，尤其补出了 `OATutor` 和 `FSRS`。

第二份报告的价值是分层更清楚，尤其把 `AFFiNE`、`SiYuan`、`Edu-ConvoKit`、`whisper.cpp`、`Vosk` 拉进来后，更接近 Nana 要做的“采集壳 + 诊断骨架 + 语音入口”。

### 3. `case / artifact / step / annotation` 四类 schema 值得吸收

建议项目 AI 把这四类实体作为后续方案评估的共同语言。

- `case`：一条错题记录，不等于一张照片。
- `artifact`：题图、音频、转写、摘要、附件等多模态材料。
- `step`：解法步骤、步骤依赖、步骤结论。
- `annotation`：知识点、错因、价值评估、复习标记。

这不是要求立刻改数据库 schema。当前阶段可以先进入前端方案和 API 契约讨论，避免页面先行导致后面数据结构返工。

## 我认为需要项目 AI 批判性复核的部分

### 1. `AFFiNE / BlockSuite` 不应直接变成首期依赖

它们适合启发 `case detail` 页面和 block 容器，但 Nana 当前已有 Next.js + wrong-notebook 基座。首期前端方案的铁律仍然是物理隔离、低冲突、少改上游。

请项目 AI 判断：

- 只借 `case detail` 信息架构是否足够。
- 是否需要引入真实 block editor。
- 如果引入，会不会让 MVP 切片 1 过重。
- 是否可以先用普通 React 组件模拟 block / step 结构，等后续再评估编辑器内核。

### 2. `SiYuan` 适合借结构，不适合借产品心智

`SiYuan` 的 block-level reference、custom attributes、SQL embed 很贴近“步骤可引用、可索引、可展开”的方向。

但 Nana 不是 PKM 产品，也不是给学生搭个人知识库。项目 AI 需要判断：

- 哪些结构可以变成 `step` / `annotation` 的字段。
- 哪些功能只适合老师端或后台，不应该出现在学生端首屏。
- 知识地图是否需要支持 step 级展开，还是先保留知识点节点，详情里再展示 step。

### 3. `Edu-ConvoKit` 应放后处理，不应塞进前端

它的 `preprocess / annotate / analyze` 三段式很适合 Nana 的 OCR / transcript 后处理。

但它是研究工具链，不是前端组件。项目 AI 需要判断：

- 是否把这套三段式写入采集后端计划。
- 是否在前端只保留处理状态和可回看结果。
- 是否需要新增“标注置信度 / 待人工复核”的 UI 状态。

### 4. `whisper.cpp / Vosk` 与当前豆包流式 ASR 路线要对齐

我们当前已经讨论过豆包 lite 流式 ASR 与 `/api/nana/asr/stream` 中转。`whisper.cpp` 和 `Vosk` 更像备选或离线能力，不应直接覆盖既定云端路线。

项目 AI 需要判断：

- 首期是否仍以豆包流式 ASR 为主。
- `whisper.cpp / Vosk` 是否进入 `DECISIONS.md` 开放项。
- 前端是否只抽象 `AsrProvider`，不绑定具体 ASR。
- 降级链路是否仍保留文件 ASR。

### 5. `OATutor / FSRS` 很有价值，但不要抢采集壳主线

`OATutor` 对掌握度诊断有启发，`FSRS` 对复习排程有价值。

但当前前端 MVP 的主线仍是“场景入口 + 采集壳”，不是复习系统完整上线。项目 AI 需要判断：

- 它们是否只进入 P2 开放项。
- 是否需要在方案里预留 `reviewSchedule` 或 `mastery` 字段。
- 是否等 Session / 周末小测稳定后再引入算法细节。

## 建议项目 AI 产出的结论

请项目 AI 不要只写“建议吸收”。请按下面格式输出：

| 结论项 | 要回答的问题 |
|---|---|
| 可直接并入 `frontend-architecture-plan.md` | 哪些章节要改，改成什么口径 |
| 只进入 `DECISIONS.md` 开放项 | 哪些仓库或方向暂不进实现 |
| 不吸收或暂缓 | 哪些调研结论与当前阶段不匹配 |
| 需要新增计划文档 | 是否需要 ASR、case schema、step schema、图谱选型的独立计划 |
| 对架构图的修正 | 现有 `nana_arch.png` 哪些层保留，哪些层要降级 |

## 我建议的 Nana 架构图草案

这张图是给项目 AI 批判性修改的草案，不是定稿。

```mermaid
flowchart TB
    U[学生 / 舅舅]
    Home[/nana 场景入口]
    Capture[/nana/capture 采集壳]
    Case[case 容器]
    Artifact[artifact 层\n题图 / 音频 / 转写 / 摘要 / 附件]
    Asr[语音层\n豆包流式 ASR 主线\nwhisper.cpp / Vosk 开放项]
    Analyze[后处理管线\npreprocess / annotate / analyze]
    Step[诊断骨架\n题目 / 步骤 / 依赖 / 结论 / 知识点]
    Map[/nana/knowledge-map\n知识地图]
    Session[/nana/session\n周末小测]
    Review[复习排程开放项\nBKT / FSRS / OATutor]
    Export[搜索 / 导出 / 纸质包]

    U --> Home
    Home --> Capture
    Capture --> Case
    Case --> Artifact
    Asr --> Artifact
    Artifact --> Analyze
    Analyze --> Step
    Step --> Map
    Step --> Session
    Session --> Review
    Case --> Export
    Step --> Export

    Affine[AFFiNE / BlockSuite\n借页面和 block 思路] -.-> Capture
    Joplin[Joplin / Memos\n借容器和快速采集] -.-> Artifact
    Siyuan[SiYuan / Logseq\n借步骤引用和图谱思路] -.-> Step
    Edu[Edu-ConvoKit\n借三段式后处理] -.-> Analyze
    Voice[whisper.cpp / Vosk / Idiolect\n借 ASR 和接口思路] -.-> Asr
    ReviewRef[OATutor / FSRS\n后置开放项] -.-> Review
```

## 推荐并入方案的最小动作

1. 在 `frontend-architecture-plan.md` 的采集壳章节补一句：核心对象是 `case`，不是单图或单音频。
2. 在采集壳章节补出 `artifact` 四层：题图、原音、转写、摘要 / 标签。
3. 在知识地图章节说明：当前先做知识点图，后续评估 step / block 级展开。
4. 在技术附录补 `AsrProvider` 抽象：豆包流式 ASR 为主，其他 ASR 是开放项。
5. 在 `DECISIONS.md` 增加开放项：block editor、step schema、ASR 引擎、FSRS / OATutor。

## 项目 AI 的验收标准

- 不能只复述调研报告，要结合 Nana 现有前端方案、P1/P4/P5、路由隔离和 MVP 切片判断。
- 不能把开源产品直接塞进实现计划，要分清借结构、借接口、借实现。
- 不能让采集壳 MVP 过重。
- 不能把学生端做成复杂 PKM 或知识库后台。
- 不能把 ASR 备选路线写成已决策路线。

