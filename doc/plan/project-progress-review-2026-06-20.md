# NanaWrongBook 项目进展审查 · 2026-06-20

> 审查日期: 2026-06-20
> 审查范围: 全项目（AGENTS.md → 技术方案 → 里程碑 → 计划文件 → 前端架构 → 代理系统）
> 当前分支: dev
> 最近提交: 1b1370a (fix: 补 YAML frontmatter——.claude/agents/ 注册为 agent type)

---

## 一、项目整体状态：M3c 完成后间歇期，等待下一轮启动

项目当前处于 **M3c 里程碑完成后的间歇期**——周末初诊→周中纸质包的最小可用链路已经走通，
测试 110/110 全绿，审计通过。开发引擎（三代理 + 同步脚本）处于就绪状态，但业务功能开
发暂停，正在进行"文档治理 + 前端架构规划 + 双运行时支持"的非编码基础工作。

**一句话判断**：后端诊断链路（M1-M3c）基本成立，前端 UI 完全未建，下一轮应按
frontend-architecture-plan 切片 1 启动前端建设。

---

## 二、各模块进展

### 2.1 知识图谱数据层（M1）—— ✅ 完成

- 8 张新表：KnowledgeNode / KnowledgeEdge / Mainline / NodeMainline / MainlineBridge / StudentNodeState / Misconception / MistakeNode
- 种子数据：34 节点 / 确定性 ID（节点结构在 M1 阶段完成）
- 内存图引擎：fromData/load 双构造模式，导出 prereqsOf / allPrereqsOf / dependentsOf / mainlineSubgraph / 环检测
- 配题（M3a 阶段导入）：地基层 BG001-104、M1 节点 30+4、M2a 节点 50+1，20 座主线级桥，误解库 20+ 条
- 注：101 道种子题实际来自 M3a 的 Item 表填充，M1 阶段仅完成 KnowledgeNode/Edge 的图谱结构

### 2.2 诊断归因流程（M2）—— ✅ 完成

- 8 步状态机：idle → boundary_select → item_dispatch → answer_collect → bkt_update → kst_propagate → gap_detect → paper_pack → closed
- 决策 D-4 已落地，状态机在 `lib/session-machine.ts`（SessionMachine 类，126 行）中实现
- 诊断编排器在 `lib/diagnosis-orchestrator.ts`（M3c 产出，5 个纯逻辑函数，24 用例）

### 2.3 初诊 + 追踪（M3a/M3c）—— ✅ 完成

- M3a：KST-lite（祖先/后代传播，6 用例）+ BKT（T=学习转移，12 用例）+ map GET + initial POST 双 API
- M3c：诊断编排器 + 题单 API + 答案提交 API + 纸质包 API + 预览页（`src/app/diagnosis/paper-pack/page.tsx`）
- 测试：110/110，退出码 0
- **已知限制**：KST-lite gap 只传播一层 dependents（M4 补递归）；单主线诊断（暂不支持多主线并行）

### 2.4 配题灌入（M3b）—— ⬜ 未启动

- 定位：数据工作，不改核心逻辑，可与 M4 并行推进
- 待生产内容：M3/M4/M5/M6/M7/M2b 主线节点、各节点配题、真题基础题种子库

### 2.5 探针下探深化（M4）—— ⬜ 未启动

- 范围：探针下探自动化、变式审题台、slip 回填闭环、多用户开放
- KST-lite 递归传播补全
- 优先级：高于 M3b（核心诊断推理能力深化）

### 2.6 前端 UI —— ⬜ 完全未建

- `src/app/diagnosis/paper-pack/page.tsx` 是唯一的前端页面（极小雏形）
- 完整前端架构方案已产出（`doc/plan/frontend-architecture-plan.md`，569 行，2026-06-19）
- 方案定义了 5 个 MVP 切片：采集壳（推荐先建）→ 知识地图 → Session 流程 → 后端接通 → 完整版
- **待 Codex 架构评审 + 用户拍板**

### 2.7 基础设施 / 工程规约 —— ✅ 就绪

- Docker 双容器（生产 dev.db + 测试 test.db）已落地
- OpenCode 双运行时支持：AGENTS.md + canonical agents + sync/check 同步脚本
- 文档治理三件套：INDEX 看板 + 00_CURRENT 冷启动 + DECISIONS 决策台账
- doc/reference/ 近期新增文件：
  - `codex_long_term_memory.md`（2026-06-19，Codex 交接长期记忆记录）
  - `codex_memory_decisions/`（目录，Codex 记忆决策归档）
  - `fof-semantic-mvp-dual-runtime-audit-notes.md`（2026-06-19，双运行时审计笔记）
  - `installed-skills-catalog.md`（2026-06-19，已安装 Skills 清单）
- 两个 CLI 运行时（Claude Code + OpenCode）均已配置子代理

### 2.8 研究与调研 —— 活跃

- VLM 识图转写：豆包 Seed2.0 逐页识图，2024/2025/2026 真题转写材料齐全
- 竞品调研：术子错题宝速评（借鉴点已按轮次归位）、得到大脑捕获交互调研
- 错题拍照用户指南（双版：外甥女极简版 + 舅舅说明版）
- Codex 技术评审交接文档

---

## 三、技术决策台账（15 项已裁决 + 2 项设计债）

| 决策 | 内容 | 状态 |
|------|------|:--:|
| D-1 | 新表追加挂接，不改上游 Prisma model | active |
| D-2 | 知识图谱 8 张新表 | accepted |
| D-3 | 内存图谱 fromData/load 双构造模式 | accepted |
| D-4 | 诊断会话 8 步状态机 | accepted |
| D-5 | 一道题 = 一份证据（BKT/KST 分线执行） | accepted |
| D-6 | 纸质包 frontier 优先 + gap 补位（封顶 4 节点/~10 题） | accepted |
| D-7 | KST-lite 只传播一层 dependents（M4 补递归） | accepted |
| D-8 | 当前不调 LLM（所有诊断走确定性规则） | accepted |
| D-9 | 单主线诊断 | accepted |
| D-10 | 生产/测试容器分离 | accepted |
| D-11 | test:all 聚合脚本（新增测试脚本时同步更新 compose command） | accepted |
| D-12 | 三分支模型（main/dev/sync-upstream） | active |
| D-13 | 三代理协作框架（/plan → /execute → /audit） | active |
| D-14 | AI 模型切 DeepSeek（deepseek-chat，写代码方） | accepted |
| D-15 | 双运行时 agent 架构（AGENTS.md + canonical + sync/check） | accepted |

| 设计债 | 内容 | 状态 |
|--------|------|:--:|
| TD-1 | slipFlag 仅单 boolean，复诊需持久化 slipCount | proposed |
| TD-2 | /initial 一步式初诊与 submit-answers 两条路径分叉，建议稳定后废弃 /initial | proposed |

---

## 四、计划文件清单（doc/plan/）

| 计划文件 | 日期 | 大小 | 状态 |
|----------|------|------|:--:|
| knowledge-graph-data-layer-plan.md | 06-14 | 27KB | ✅ 已执行（M1） |
| container-split-prod-test-plan.md | 06-14 | 12KB | ✅ 已执行 |
| M2-attribution-flow-plan.md | 06-14 | 13KB | ✅ 已执行（M2） |
| prompt-revision-plan.md | 06-14 | 8KB | ✅ 已执行 |
| three-agent-prompt-revision-plan.md | 06-14 | 6KB | ✅ 已执行 |
| M3-node-extraction-plan.md | 06-15 | 5KB | ✅ 已执行（M3） |
| M3a-tracking-skeleton-plan.md | 06-15 | 14KB | ✅ 已执行（M3a） |
| M3c-session-pdf-plan.md | 06-15 | 17KB | ✅ 已执行（M3c） |
| photo-guide-plan.md | 06-19 | 6KB | ✅ 已执行 |
| **frontend-architecture-plan.md** | **06-19** | **28KB** | **待评审/待确认** |
| opencode-dual-runtime-plan.md | 06-19 | 20KB | ✅ 已执行 |

> **执行日志说明**：以上 11 个计划中，有对应执行日志（`doc/executionlog/`）的为：
> `knowledge-graph-data-layer-log.md`、`container-split-prod-test-log.md`、
> `M2-attribution-flow-log.md`、`M3c-session-pdf-log.md`、`photo-guide-log.md`（共 5 份）。
> 其余 6 个计划（`prompt-revision-plan.md`、`three-agent-prompt-revision-plan.md`、
> `M3-node-extraction-plan.md`、`M3a-tracking-skeleton-plan.md`、`opencode-dual-runtime-plan.md`、
> `frontend-architecture-plan.md` 除外的前端预研）缺少独立执行日志，原因是这些任务多为
> "轻量执行"或嵌入其他轮次一体完成，日志未单独产出。建议后续补写，至少补一句话摘要说明落地产出。

---

## 五、阻塞点和风险

### 阻塞点

1. **前端架构方案未评审**：`frontend-architecture-plan.md`（569 行）产出后尚未经 Codex 架构评审，
   也未获用户拍板。这是下一轮前端开发的前置条件。
2. **M3b 配题 vs M4 探针选择未决策**：`00_CURRENT.md` 列出两个候选方向，建议 M4 优先但未最终确定。

### 风险

1. **上游文件冲突风险**：前端方案已识别 146+ 个上游文件和「碰不得」清单，规划了完整的物理隔离策略
   （`/nana` 命名空间 + `src/components/nana/`），但上游 large page.tsx（28KB）的导航入口策略
   需要实际开发时验证。
2. **知识地图可视化库未选型**：前端方案推荐先评估 React Flow 和 Cytoscape.js，选型结果未写入 DECISIONS.md。
3. **VLM/ASR 后端管线未建**：采集壳（切片 1）可以先跑通静态 mock 流程，但切片 4 的端到端闭环依赖
   真正的 VLM 图片理解和 ASR 语音识别后端。
4. **多用户开放未准备**：M4 目标包含多用户开放，但当前只有单用户数据流。Prisma SQLite 的并发写入限制
   在真正多用户场景需要验证。
5. **教研内容产能不足**：M3/M4/M5/M6/M7/M2b 主线节点的配题和内容生产尚未开始，这是教研主战场，
   不是纯工程问题，需要人工生产 + LLM 起草再过审的双通道。

---

## 六、代理系统状态

| 代理 | Canonical | .claude/agents/ | .opencode/agents/ | 同步 |
|------|-----------|-----------------|--------------------|:--:|
| plan-agent | doc/agents/plan-agent.md | 已同步 | 已同步 | ✅ |
| execute-agent | doc/agents/execute-agent.md | 已同步 | 已同步 | ✅ |
| audit-agent | doc/agents/audit-agent.md | 已同步 | 已同步 | ✅ |

同步脚本：`scripts/sync-agents.js` + `scripts/check-agent-sync.js` 均可用。

---

## 七、建议下一步行动

按优先级排序：

### 立即（本周）

1. **将 `frontend-architecture-plan.md` 提交 Codex 架构评审**
   ——评审重点：避冲突规约是否成立、复用边界是否"只 import 不改"、P1/P4/P5 设计原则是否守住了。
2. **用户拍板**：评审通过后，确认是否进入前端建设、先建哪个切片（推荐切片 1：场景入口 + 采集壳）。
3. **可视化库选型**：正式评估 React Flow vs Cytoscape.js，写入 `doc/DECISIONS.md`。

### 短期（下一轮 milestone）

4. **启动前端切片 1 开发**（如果用户确认）：先走 plan-agent 细化切片 1 为可执行计划，再走 execute-agent 实施。
5. **推进 M4 探针下探或 M3b 配题**（与前端并行，可不同人/不同轮）：
   - M4 优先（KST 递归传播 + 探针自动化），是核心诊断能力深化
   - M3b 是数据工作，不冲突，可在 M4 过程中穿插

### 中期（M4 完成后）

6. **VLM/ASR 后端管线建立**：采集壳的真正价值依赖后端图片理解和语音识别能力
7. **教研内容持续生产**：主线节点配题、节点文本内容、误解库扩展

---

## 八、附录：关键文件路径

| 用途 | 路径 |
|------|------|
| 全局入口 | `AGENTS.md` |
| 当前状态 | `doc/00_CURRENT.md` |
| 活跃任务 | `doc/active_spec.md` |
| 技术蓝图 | `doc/reference/TECH_PLAN_v2.md` |
| 运营手册 | `doc/reference/OPS_handbook.md` |
| 决策台账 | `doc/DECISIONS.md` |
| 进度轨迹 | `doc/progress.md` |
| 前端架构方案 | `doc/plan/frontend-architecture-plan.md` |
| 代理定义 | `doc/agents/{plan,execute,audit}-agent.md` |
| 诊断编排器 | `lib/diagnosis-orchestrator.ts` |
| 诊断状态机 | `lib/session-machine.ts` |
| 知识图谱引擎 | `lib/graph.ts` |
| KST-lite 算法 | `lib/kst-lite.ts` |
| BKT 算法 | `lib/bkt.ts` |
| Prisma Schema | `prisma/schema.prisma` |

---

## 修订记录

> 根据 `doc/auditlog/project-progress-review-2026-06-20-audit.md` 审计报告修正，2026-06-20。

| # | 严重度 | 修正项 | 修正前 | 修正后 |
|---|--------|--------|--------|--------|
| 1 | P1 | M2 实现文件指错 | 状态机在 `lib/diagnosis-orchestrator.ts` | 状态机在 `lib/session-machine.ts`；编排器在 `lib/diagnosis-orchestrator.ts`（M3c 产出） |
| 2 | P1 | 附录路径错误 | `lib/knowledge-graph.ts` | `lib/graph.ts`（文件实际名称） |
| 3 | P2 | 决策数量少报 | "10 项已裁决" | "15 项已裁决"，补全 D-11~D-15，修正 D-6/D-7/D-8 内容对齐 DECISIONS.md 原文 |
| 4 | P2 | 执行日志缺失未标注 | 无说明 | 补充执行日志覆盖说明，标注 5 份已有日志、6 个计划缺少独立日志 |
| 5 | P3 | M1 配题归属模糊 | 101 道种子题归在 M1 下 | 标注配题实际来自 M3a 阶段 Item 表填充 |
| 6 | P3 | doc/reference/ 新增文件未盘点 | 未提及 | 补充 4 个新增文件/目录的简要说明 |
