# 技术决策台账

> 📌 只写长期有效的技术裁决。当前状态 → [00_CURRENT.md](00_CURRENT.md)，历史叙事 → [progress.md](progress.md)
> **Status**：`proposed` 提出待定 ｜ `accepted` 已采纳有效 ｜ `done` 已执行闭环 ｜ `superseded` 被取代 ｜ `active` 长期约束生效中 ｜ `frozen` 冻结基线
> **维护规则**：新的架构决策产生时追加一行。旧决策被推翻时标 `superseded` 并标注取代者 ID。不删历史行。

---

## 架构决策（D-###）

| ID | DateTime | Type | Decision | Evidence | Status |
|---|---|---|---|---|---|
| D-1 | 2026-06-13 | architecture | **所有新表追加挂接，不修改上游 Prisma model**（安全铁律 3） | CLAUDE.md 铁律 3 | active |
| D-2 | 2026-06-14 | architecture | **知识图谱数据层用 8 张新表**：KnowledgeNode / KnowledgeEdge / Mainline / NodeMainline / MainlineBridge / StudentNodeState / Misconception / MistakeNode。全部 CREATE TABLE，不改既有模型 | [progress.md §M1](progress.md)；[plan/knowledge-graph-data-layer-plan.md](plan/knowledge-graph-data-layer-plan.md) | accepted |
| D-3 | 2026-06-14 | architecture | **内存图谱 fromData/load 双构造模式**：fromData(nodes, edges) 用于测试/手动构造，load(prisma) 从 DB 加载。导出 prereqsOf / allPrereqsOf / dependentsOf / mainlineSubgraph / 环检测 | [progress.md §M1](progress.md) | accepted |
| D-4 | 2026-06-14 | architecture | **诊断会话 8 步状态机**：idle → boundary_select → item_dispatch → answer_collect → bkt_update → kst_propagate → gap_detect → paper_pack → closed。probe_drill 步骤可选跳转 | [progress.md §M2](progress.md)；[plan/M2-attribution-flow-plan.md](plan/M2-attribution-flow-plan.md) | accepted |
| D-5 | 2026-06-15 | architecture | **一道题 = 一份证据**：作答节点 BKT 从 StudentNodeState 既有先验出发，KST 只传播未作答节点。两者分线执行，不在同一节点重复计算 | [progress.md §M3c](progress.md)；[auditlog/M3c-session-pdf-audit.md](auditlog/M3c-session-pdf-audit.md) | accepted |
| D-6 | 2026-06-15 | architecture | **纸质包 frontier 优先 + gap 补位**：封顶 4 节点 / ~10 题。先选 frontier（已掌握→未掌握边界节点），不足时 gap 补位 | [progress.md §M3c](progress.md) | accepted |
| D-7 | 2026-06-15 | architecture | **KST-lite 只传播一层 dependents**——M4 补递归。这是刻意简化，非缺陷 | [active_spec.md](active_spec.md) 已知限制；[progress.md §M3c](progress.md) | accepted |
| D-8 | 2026-06-15 | architecture | **当前不调 LLM**——无 AI 判分 / Newman 追问 / 解析生成。所有诊断走确定性规则（BKT + KST-lite + 选题逻辑） | [progress.md §M3c](progress.md) | accepted |
| D-9 | 2026-06-15 | architecture | **单主线诊断**——决策⑥延续，暂不支持多主线并行诊断 | [active_spec.md](active_spec.md) 已知限制 | accepted |
| D-10 | 2026-06-14 | infrastructure | **生产/测试容器分离**：docker-compose.yml（生产，DATABASE_URL=dev.db）+ docker-compose.test.yml（测试，DATABASE_URL=test.db）。测试容器独立，不碰生产库 | [progress.md §容器分层](progress.md)；[plan/container-split-prod-test-plan.md](plan/container-split-prod-test-plan.md) | accepted |
| D-11 | 2026-06-14 | process | **test:all 聚合脚本**：替代逐个清单，确保 CI 不会漏跑新增测试套件。新增测试脚本时同步更新 compose command | [progress.md §M2](progress.md)；[reference/M2-prod-contamination-postmortem.md](reference/M2-prod-contamination-postmortem.md) | accepted |
| D-12 | 2026-06-13 | process | **三分支模型**：dev（日常开发）→ main（稳定版本）← sync-upstream（临时同步上游）。origin = 用户仓库，upstream = 对方原始仓库 | CLAUDE.md Git 协作规范 | active |
| D-13 | 2026-06-13 | process | **三代理协作框架**：/plan（计划）→ /execute（执行）→ /audit（审计）。计划未经用户确认不得执行；审计只指出问题不直接改代码 | CLAUDE.md 三代理协作开发规范 | active |
| D-14 | 2026-06-13 | infrastructure | **AI 模型切 DeepSeek**：deepseek-chat，API Key + Base URL 配置完成。项目 AI（写代码方）用 DeepSeek，外部评审 AI（Claude/Codex）用各自模型 | [progress.md §基建轮](progress.md) | accepted |
| D-15 | 2026-06-19 | process | **双运行时 agent 架构**：`AGENTS.md` = 全局最高权威入口；`doc/agents/` = canonical 角色正文；`.claude/agents/` + `.opencode/agents/` = 运行时加载层（由 `scripts/sync-agents.js` 机械同步，`scripts/check-agent-sync.js` 验证一致性）；`.claude/commands/` 改为 agent 委托（向后兼容斜杠命令）。不引入 Controller agent | [plan/opencode-dual-runtime-plan.md](plan/opencode-dual-runtime-plan.md)；[AGENTS.md](../AGENTS.md) | accepted |

---

## 设计债（TD-###，待裁决）

| ID | DateTime | Type | Decision | Evidence | Status |
|---|---|---|---|---|---|---|
| TD-1 | 2026-06-15 | design_debt | slipFlag 当前仅单 boolean，复诊"连续两次"判定需持久化 slipCount 字段 | [active_spec.md](active_spec.md) 设计债 #1 | proposed |
| TD-2 | 2026-06-15 | design_debt | `/initial` 一步式初诊与 submit-answers 两条路径分叉，建议稳定后废弃 /initial | [active_spec.md](active_spec.md) 设计债 #2 | proposed |
| TD-3 | 2026-06-28 | design_debt | light-feedback.tsx 中 caseId 未定义时使用 magic string `__preliminary__` 调用反馈 API。当前不引起 bug，但引入不存在的 ID 进入日志。第 5 阶段接通真实 API 时须传递真实 caseId。 | [auditlog/nana-phase1-execution-audit.md](auditlog/nana-phase1-execution-audit.md) §问题清单 | accepted |
| TD-4 | 2026-06-28 | design_debt | feedback API handler 不校验 case 是否存在（不查 DB），接收任意 caseId 返回反馈。第 5 阶段应加入 `prisma.case.findUnique` 校验，case 不存在返回 404。 | [auditlog/nana-phase1-execution-audit.md](auditlog/nana-phase1-execution-audit.md) §问题清单 | accepted |

---

## 门禁（Gate-###）

| ID | DateTime | Type | Decision | Status |
|---|---|---|---|---|
| Gate-1 | 2026-06-13 | gate | **安全铁律**：修改 DB 结构/删除文件/破坏性操作前必须用户确认 | active |
| Gate-2 | 2026-06-13 | gate | **不改上游表结构**：所有新功能以新增 model 挂接 | active |
| Gate-3 | 2026-06-13 | gate | **密钥不入 git**：API Key 等敏感信息只在 .env，.env 已在 .gitignore | active |
| Gate-4 | 2026-06-14 | gate | **测试必须在测试容器跑**：禁止在 prod 容器跑集成测试（M2 污染事故教训） | active |

---

## 开放项速查（待人类拍板或后续裁决）

- **TD-1** slipFlag → slipCount 字段迁移时机（建议 M4 一并处理）
- **TD-2** /initial 废弃时机（建议 M4 稳定 submit-answers 路径后废弃）
- **TD-3** light-feedback magic string `__preliminary__`（第 5 阶段接通真实 API 时处理）
- **TD-4** feedback API 未校验 case 存在性（第 5 阶段接通真实 API 时处理）
- **M3b vs M4 优先级**：下一轮先做哪个（建议 M4，见 [00_CURRENT.md](00_CURRENT.md) 下一步）
- **上游测试环境隔离**：5 个上游测试在 `.env.test` 下失败，根因是上游对环境变量有隐含默认值假设。建议后续开独立计划处理

---

> 最后更新：2026-06-19 | 维护者：人类 + Claude + 审计代理
> 本文档从 progress.md / active_spec.md / plan / auditlog 中提取已知决策。可能不完整——后续每轮开发发现遗漏时补登。
