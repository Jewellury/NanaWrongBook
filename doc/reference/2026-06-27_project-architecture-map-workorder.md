# 工单 · Nana 项目全景架构图 + 下一步优先级盘点

> 对象：项目 AI。
>
> 性质：`/plan` 阶段工单。只产出架构盘点和下一步建议，不写实现代码，不改业务代码，不新增依赖。
>
> 目标：把 Nana 现在“已经做了什么、还缺什么、前后端怎么接、下一步先做什么”画清楚。请同时覆盖前端、后端、数据、AI 管线、题库、运营回路，不要只看前端。

## 背景

最近我们做了几轮前端交互、采集壳、开源轮子和 ASR 路线调研。调研的价值不是让项目范围膨胀，而是帮助我们反思当前设计是否留足边界。

当前用户希望先看到一张清楚的项目架构图：

- 已经完成哪些后端能力。
- 前端目前只是方案，哪些页面还没建。
- 采集壳、ASR、case API、知识地图、Session UI、纸质包之间怎么连。
- 哪些是现在该做，哪些只是开放项。
- 下一步优先级怎么排。

## 必读输入

请按顺序阅读。不要跳过 `00_CURRENT.md` 和 `DECISIONS.md`，它们比调研报告更权威。

| 类型 | 路径 | 用途 |
|---|---|---|
| 全局规则 | `AGENTS.md` | 三代理流程、安全铁律、不改上游、Git 收口 |
| 当前状态 | `doc/00_CURRENT.md` | 项目全景六线、当前卡点、下一步候选 |
| 当前任务 | `doc/active_spec.md` | 当前双线并行状态：真题复核 + 前端架构复核 |
| 决策台账 | `doc/DECISIONS.md` | 已采纳架构决策和开放项 |
| 历史进展 | `doc/progress.md` | M1 / M2 / M3a / M3c 已完成内容 |
| 技术方案 | `doc/reference/TECH_PLAN_v2.md` | Nana 技术主线、知识图谱、诊断、BKT、AI 管线 |
| 运营手册 | `doc/reference/OPS_handbook.md` | P1/P4/P5、医生模式、低压前台原则 |
| 前端方案 | `doc/plan/frontend-architecture-plan.md` | `/nana` 前端路由、组件隔离、MVP 切片 |
| 收敛修订工单 | `doc/reference/2026-06-27_open-source-absorption-plan-revision-workorder.md` | 开源轮子调研之后，对前端方案的小修订边界 |
| 辩证评审 | `doc/research/同品调研/open-source-dialectical-review.md` | 哪些调研结论现在吸收，哪些后置 |

## 你要先核对的事实

请不要凭记忆写架构图，先从代码和文档核对。

### 已完成的后端 / 数据能力

至少核对这些：

- M1 知识图谱数据层：8 张新表、48 节点、36 边、18 桥、内存图引擎。
- M2 归因流程骨架：8 步状态机、sessions / probes / errors API。
- M3a 追踪骨架：101 题入库、KST-lite、BKT、`GET /api/diagnosis/map`、`POST /api/diagnosis/initial`。
- M3c 周末编排：session-items、submit-answers、paper-pack API、打印页。
- VLM 转写脚本：`scripts/vlm-transcribe.ts`，用于真题转写，不等于产品内识图链路。
- Misconception 表已建，但种子未灌。
- 题库 batch1 已入库，长尾配题未完成。

### 未完成或只在方案里的能力

至少核对这些：

- `/nana` 前端页面尚未实现，当前是架构方案。
- `/nana/capture` 采集壳未实现。
- `case / artifact` API 尚未实现。
- 豆包流式 ASR 中转接口尚未实现。
- 知识地图 UI 尚未实现。
- Session UI 尚未实现。
- 纸质包已有上游式打印页雏形，但 `/nana/paper-pack` 方案页未实现。
- Newman 归因 / AI 判分 / AI 追问尚未启用。
- FSRS / OATutor / block editor / Vosk / whisper.cpp 都是开放项，不是当前依赖。

## 产出要求

请产出一份新的计划文档，建议路径：

```text
doc/plan/project-architecture-map-and-priority-plan.md
```

这份文档必须包含下面 6 个部分。

### 1. 当前全景架构图

请用 Mermaid 画一张“当前已完成 + 方案中待建”的系统图。

要求：

- 图里要区分 `已完成`、`待建`、`开放项`。
- 前端路由、后端 API、数据表 / 逻辑模块、AI 管线要分层。
- 不要把外部开源轮子画成运行时依赖。
- ASR 要画成 capture 壳下的前后端链路：前端 `VoiceRecorder` / `AsrProvider` → 后端 `/api/nana/asr/stream` → 豆包流式 ASR。
- Vosk / whisper.cpp 只能画成开放项。

建议至少包含这些节点：

- `/nana`
- `/nana/capture`
- `/nana/knowledge-map`
- `/nana/session`
- `/nana/paper-pack`
- `case / artifact API`
- `diagnosis map API`
- `session-items API`
- `submit-answers API`
- `paper-pack API`
- `KnowledgeNode / StudentNodeState / MistakeNode`
- `BKT / KST-lite / diagnosis-orchestrator`
- `VLM 转写脚本`
- `ASR 中转`
- `开放项：FSRS / OATutor / block editor / local ASR`

### 2. 已完成 / 待完成矩阵

请按层输出表格：

| 层 | 已完成 | 待完成 | 风险 / 备注 |
|---|---|---|---|

层级至少包括：

- 数据层。
- 诊断逻辑层。
- API 层。
- 前端页面层。
- 采集 / ASR 层。
- 题库 / 内容层。
- 真题 / VLM 管线。
- 运营 / 人肉回路。

### 3. 前后端接口缺口清单

请列出“前端要建，但后端还没有或契约不清”的接口。

至少判断这些：

- `POST /api/nana/cases`
- `GET /api/nana/cases/:id`
- `POST /api/nana/asr/stream` 或等价 WebSocket 中转
- 文件 ASR fallback
- capture 完成后如何进入诊断流程
- `/nana/knowledge-map` 复用现有 `GET /api/diagnosis/map` 是否够用
- `/nana/session` 如何串 `session-items` 和 `submit-answers`
- `/nana/paper-pack` 如何复用现有 `paper-pack` API 和打印页

注意：这只是 API 契约盘点，不要改 Prisma schema。

### 4. 下一步优先级建议

请给出 3 个候选下一步，并排序。

每个候选必须写：

- 做什么。
- 为什么现在做。
- 依赖哪些已完成能力。
- 不做什么。
- 验收标准。
- 风险。

候选建议至少包含：

- 方案 A：架构图 + case / ASR API 契约先定稿。
- 方案 B：切片 1，场景入口 + 采集壳轻量 UI。
- 方案 C：Session UI，把 M3c API 串成真实交互。

请明确推荐一个，不要只给并列选项。

### 5. 当前不建议做的事

请明确列出当前不建议做的范围。

至少包含：

- 不引入 block editor。
- 不接入 AFFiNE / BlockSuite / SiYuan 运行时依赖。
- 不把 Vosk / whisper.cpp 替代豆包流式 ASR 主线。
- 不做 FSRS 复习排程实现。
- 不做 OATutor 集成。
- 不做 Newman 归因，除非用户改优先级。
- 不做上游结构重组。

### 6. 需要用户拍板的问题

请把真正需要用户判断的问题单独列出来，不要混在技术细节里。

建议包括：

- 下一步先做“架构图 + API 契约定稿”，还是直接做“采集壳 UI”。
- 采集壳首期是否必须接真实 ASR，还是 mock 转写先跑通 UI。
- 是否把 Session UI 放到采集壳之前。
- 是否允许新增 `doc/plan/asr-and-case-api-boundary-note.md` 作为接口短文档。

## 推荐倾向

我的建议是：下一步先让项目 AI 做“项目全景架构图 + 已完成 / 待做矩阵 + 接口缺口清单”，然后再决定是否开建切片 1。

理由：

- 后端 M1-M3c 已经做了不少，但前端方案和采集壳还没有落到运行时。
- 当前新增了 ASR、case / artifact、开源轮子开放项，容易让架构认知变散。
- 先画清楚全景图，可以避免项目 AI 直接开工时误以为某些后端能力已经有了，或者误把开放项写成依赖。

## 验收标准

- 产出文档能让人一眼看懂 Nana 现在前后端分别完成到哪里。
- Mermaid 架构图区分已完成、待建、开放项。
- 优先级建议明确推荐一个下一步。
- 不扩大切片 1 范围。
- 不把开源轮子变成当前依赖。
- 不改代码、不改数据库、不动上游文件。

