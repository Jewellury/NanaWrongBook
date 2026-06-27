# 工单 · 开源轮子吸收后的前端方案收敛修订

> 对象：项目 AI。
>
> 目的：根据两份开源轮子调研、Codex 吸收摘要、以及项目 AI 的批判性评估，对 `doc/plan/frontend-architecture-plan.md` 做最小修订。
>
> 这不是新一轮架构重写。当前裁决是：切片 1 仍然保持“场景入口 + 轻量采集壳”，不引入 block editor，不扩成全链路后端整合。

## 必读输入

| 类型 | 路径 | 用途 |
|---|---|---|
| 当前前端方案 | `doc/plan/frontend-architecture-plan.md` | 本次只做最小修订 |
| 技术决策台账 | `doc/DECISIONS.md` | 新增开放项，不写成已采纳决策 |
| 开源调研报告 A | `doc/research/同品调研/nana_open_source_research_report.md` | 第一轮候选清单 |
| 开源调研报告 B | `doc/research/同品调研/开源轮子工单深度调研报告.md` | 第二轮深度调研 |
| Codex 吸收摘要 | `doc/research/同品调研/nana_open_source_absorption_summary.md` | 参考，但不要照单全收 |
| 架构图草案 | `doc/research/同品调研/nana_arch.png` | 只看分层启发，不照搬 |

## 本轮裁决

项目 AI 的评估结论成立：开源轮子调研只给当前前端方案带来“小修订 + 开放项”，不触发大改。

### 认可的点

- 四层 artifact 结构应显式写入采集壳。
- `case` 应作为采集壳核心对象显式命名。
- 前端录音组件应该依赖 `AsrProvider` 抽象，不绑定具体 ASR。
- 知识地图当前仍以知识点节点为粒度，step / block 级展开只作为后续评估方向。
- `AFFiNE / BlockSuite / SiYuan / Joplin / Edu-ConvoKit / OATutor / FSRS / whisper.cpp / Vosk` 都不应成为切片 1 的直接实现依赖。

### 需要注意的细节

- “ASR 降为 capture 壳内 VoiceRecorder 组件”只适用于前端图。实际系统仍需要 `/api/nana/asr/stream` 或等价后端中转，前端不能直连 ASR 服务。
- `case / artifact API 契约草图` 是前后端边界，不是 Prisma schema 迁移。不要把它写成数据库修改。
- `reviewSchedule / mastery` 只能作为后续字段预留或开放项，不要写进切片 1 验收条件。

## 需要修改 `frontend-architecture-plan.md` 的地方

### 1. 修改 5.2 采集「错题卡片盒」

在定位处补一句：

```md
核心对象是 case：一条 case = 题图 + 原音 + 逐字稿 + AI 提要的四层 artifact 容器，不是单图或单音频。
```

要求：

- 不改建设顺序。
- 不引入 Joplin 数据模型。
- 不写 block editor。
- 保持“题图固定可见 + 录音追加”的产品主验证点。

### 2. 修改 5.4 知识地图可视化

在阶段 1 描述里补一句：

```md
当前阶段以知识点节点为粒度；后续可评估 step / block 级展开，参考 SiYuan 的 block reference 与属性化结构思路，但不作为切片 2 的实现要求。
```

要求：

- 不把知识地图改成 PKM。
- 不把 step schema 写进当前实现。
- 不改变“阶段 1：绿点 + 1-2 前沿”的范围。

### 3. 修改 9 技术附录

新增一个小节，建议标题：

```md
### 9.5 ASR 边界与开放项
```

建议内容：

- 首期主线仍是豆包流式 ASR，经后端中转，前端不暴露密钥。
- 前端录音组件只依赖 `AsrProvider` 抽象。
- `whisper.cpp` / `Vosk` 作为离线、本地、降级路线开放项进入 `DECISIONS.md`。
- 流式失败时保留文件 ASR fallback。

## 需要修改 `DECISIONS.md` 的地方

在“开放项速查”或“设计债”区追加开放项，保持 `proposed`，不要写成 `accepted`。

建议新增这些开放项：

- block editor / case detail 编辑器内核选型：AFFiNE / BlockSuite / SiYuan 只作参考，切片 1 不引入。
- step / block 级知识地图展开：切片 5 或后续再评估。
- ASR 备选引擎：whisper.cpp / Vosk 作为离线或降级路线，首期不替代豆包流式 ASR。
- 复习排程：FSRS / OATutor 进入后续复习与掌握度算法评估。

## 暂不做

- 不引入 `AFFiNE`、`BlockSuite`、`SiYuan`、`Joplin`、`Edu-ConvoKit` 的代码或依赖。
- 不新增真实 block editor。
- 不新增 step schema 独立计划。
- 不重画完整全链路后端架构图。
- 不把第二份调研报告的 6-10 周 Gantt 写入当前建设顺序。

## 可选新增短文档

如果需要给后续执行留边界，可以新增一份短文：

```text
doc/plan/asr-and-case-api-boundary-note.md
```

范围只写：

- `AsrProvider` 前端接口边界。
- `POST /api/nana/cases` / `GET /api/nana/cases/:id` 的 case / artifact 字段草图。
- 文件 ASR fallback 的状态流转。

不要在这份短文里讨论 whisper.cpp / Vosk 的实现。

## 验收标准

- `frontend-architecture-plan.md` 只发生小修订，没有建设顺序大改。
- `case` 和四层 artifact 被明确写入采集壳。
- `AsrProvider` 抽象被写入技术附录。
- 开源轮子全部以参考或开放项形式进入，不成为切片 1 依赖。
- `DECISIONS.md` 新增内容全部是 `proposed` / 开放项，不误写为已采纳决策。

