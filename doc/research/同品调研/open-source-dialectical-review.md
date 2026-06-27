# 开源轮子调研的辩证评审

> 目的：把增量调研、项目 AI 反馈、Codex 前序建议放到同一张桌上看。
>
> 结论不是“扩大范围”，也不是“调研都先搁置”。更准确的判断是：当前不引入重依赖，但要用这些调研结果反过来校准 Nana 的边界、字段、接口和后续开放项。

## 一句话判断

项目 AI 对切片 1 的收敛是对的：不能把“场景入口 + 轻量采集壳”扩成编辑器基建、离线 ASR、本地协作、复习排程和教育分析全家桶。

但项目 AI 的结论也不能只理解成“这些调研都以后再说”。增量调研至少给了我们四个应该马上吸收的提醒：

- `case / artifact` 必须成为采集壳的明确语言。
- `AsrProvider` 必须成为前端录音组件的抽象边界。
- 许可证和数据锁定风险必须进入开放项评估标准。
- step / block 级结构暂不做，但要避免当前设计把未来路径堵死。

## 增量调研里值得保留的部分

### 1. 许可证风险说清楚了

增量调研补充了一个前面讨论不够硬的点：`SiYuan`、`AppFlowy`、`Joplin` 等仓库的许可证会直接影响是否能借实现。

这件事应该进入 `DECISIONS.md` 开放项的评估标准：

- `MIT / Apache / MPL` 可以优先做实现级评估。
- `AGPL / GPL` 默认只借结构和交互思路，除非项目明确接受开源传染风险。
- 任何涉及学生题图、录音、转写的外部组件，都要检查数据导出和自托管边界。

### 2. 本地 ASR 是备选能力，不是当前主线

增量调研把 `Vosk` 和 `whisper.cpp` 的差异说得更清楚：

- `Vosk` 更轻，适合离线、低资源、命令通道。
- `whisper.cpp` 精度潜力更高，但模型和推理成本更重。

这不改变当前豆包流式 ASR 主线，但能帮助我们设计 `AsrProvider` 时别写死云端实现。

### 3. `AFFiNE / BlockSuite / SiYuan` 的价值在“结构启发”

增量调研再次确认：它们在多模态 case、block、reference、属性化结构上确实有启发。

但吸收方式应改成：

- 不引入依赖。
- 不做 block editor。
- 不把学生端做成 PKM。
- 只把“case detail 是结构化容器”这个判断写进方案。

### 4. `FSRS / OATutor` 提醒我们不要忘了后半程

项目 AI 说它们不进切片 1 是对的。

但它们不应从视野里消失。它们提示我们后续至少要预留两个方向：

- `mastery`，掌握度估计。
- `reviewSchedule`，复习排程。

这两个字段可以先作为 API 契约开放项，而不是当前实现项。

## 增量调研里需要降级的部分

### 1. “P0 采用 AFFiNE/BlockSuite 构建错题详情页”需要降级

这句话过重。

当前更合适的口径是：

```text
P0 借鉴 AFFiNE/BlockSuite 的 case detail 与 block 容器思路，但切片 1 只用普通 React 组件实现轻量采集壳。
```

### 2. “P0 集成 Vosk 或 whisper.cpp”需要降级

这会和当前豆包流式 ASR 路线冲突。

当前更合适的口径是：

```text
豆包流式 ASR 是首期主线；Vosk / whisper.cpp 作为离线、低资源、隐私增强的开放项。
```

### 3. “FSRS 直接实现复习调度”需要降级

复习排程不是采集壳 MVP 的验收项。

当前更合适的口径是：

```text
FSRS 进入复习排程开放项；当前仅在 case / session 契约中避免阻塞未来 reviewSchedule 字段。
```

### 4. “以 AFFiNE/BlockSuite 和 SiYuan 为核心搭建页面与诊断结构”需要重写

这句话容易让项目走向重依赖。

当前更合适的口径是：

```text
Nana 自建轻量页面与业务 schema；AFFiNE/BlockSuite/SiYuan 只作为结构参考，不作为运行时依赖。
```

## 对项目 AI 反馈的辩证看法

项目 AI 的收敛判断很重要，它守住了当前建设节奏：

- 切片 1 仍是 1-2 周轻量壳。
- 不引入 block editor。
- 不把学生端做成 PKM。
- 不让开源调研绑架既有方案。

但项目 AI 的反馈里也有三处可以再补一点弹性：

### 1. “Edu-ConvoKit 只进 DECISIONS”可以再细一点

它确实不应进入前端实施计划。

但 `preprocess / annotate / analyze` 三段式可以成为后续采集后端计划的命名参考。也就是说，它不进前端方案主线，但可以进“采集后处理管线”的概念开放项。

### 2. “step schema 不需要独立计划”当前成立，但要保留字段余地

知识地图当前以知识点节点为粒度是对的。

但 case / artifact API 契约里不要把未来 step 结构堵死。可以不做 step schema 文档，但要避免把 AI 提要写成纯文本死字段。

### 3. “架构图移除后端层”对前端图成立，但系统图仍需要分层

如果图的目标是 `frontend-architecture-plan.md`，移除 ASR、Analyze、Review 顶层是对的。

如果图的目标是项目总架构，这些层不能消失，只应该标注为后端、开放项或后续阶段。

## 建议形成的最终口径

### 现在就改

- `frontend-architecture-plan.md`：补 `case` 和四层 `artifact` 的显式定义。
- `frontend-architecture-plan.md`：补 `AsrProvider` 抽象，豆包流式 ASR 是主线，Vosk / whisper.cpp 是开放项。
- `frontend-architecture-plan.md`：知识地图补“当前知识点粒度，后续评估 step / block 展开”。
- `DECISIONS.md`：新增开放项，包含 block editor、step/block 展开、ASR 备选、FSRS/OATutor、许可证风险。

### 暂不做

- 不引入 AFFiNE、BlockSuite、SiYuan、Joplin、AppFlowy 代码。
- 不引入 Vosk / whisper.cpp 作为当前 ASR 主线。
- 不做 FSRS 复习调度实现。
- 不做完整 block editor。
- 不按增量调研的 P0/P1/P2 直接改建设顺序。

### 后续再看

- 切片 4 或 5 再评估是否需要 step / block 级展开。
- 采集后端接通时再评估三段式后处理管线。
- 周末 Session 稳定后再评估 FSRS / OATutor。
- 如果出现隐私或离线刚需，再评估 Vosk / whisper.cpp。

## 结论

增量调研的价值，不是让 Nana 现在变成 AFFiNE + SiYuan + Vosk + FSRS 的组合体。

它真正带来的价值是让我们看清：当前轻量方案要把 `case`、`artifact`、`AsrProvider`、开放项和许可证边界写得更清楚。这样既不扩大切片 1，又不把未来路堵死。

