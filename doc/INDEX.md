# 文档索引看板

> 📌 只做索引——找文件、看状态。当前状态叙事 → [00_CURRENT.md](00_CURRENT.md)，决策台账 → [DECISIONS.md](DECISIONS.md)，历史轨迹 → [progress.md](progress.md)
> **状态**：✅ 已完成 ｜ 🟡 进行中 ｜ 🔥 当前焦点 ｜ ⬜ 待开始 ｜ 📦 已归档 ｜ ⚠️ 有条件通过 ｜ ❌ 已废弃
> **维护规则**：新增/移动文件时更新本表。旧文件不重命名，本表建立旧名→新位置的映射。

## 进来先读什么

1. **[AGENTS.md](../AGENTS.md)** — **全局最高权威入口**：项目约束、安全铁律、Git 规范、三代理框架
2. **[00_CURRENT.md](00_CURRENT.md)** — 现在在做什么、卡在哪、下一步。模型切换冷启动第一站。
3. **[DECISIONS.md](DECISIONS.md)** — 技术决策台账。为什么选了 A 不选 B。
4. 按需查：
   - [CLAUDE.md](../CLAUDE.md) — Claude Code 专属说明（context-mode 路由）
   - [OPENCODE.md](../OPENCODE.md) — OpenCode 专属说明
   - [progress.md](progress.md) — 项目历史轨迹（叙事，只增不减）
   - [active_spec.md](active_spec.md) — 当前轮任务清单
   - [reference/TECH_PLAN_v2.md](reference/TECH_PLAN_v2.md) — 技术方案权威版
   - [reference/OPS_handbook.md](reference/OPS_handbook.md) — 运营手册

---

## 入口与资产文件

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| 🔥 | [AGENTS.md](../AGENTS.md) | **全局最高权威入口**：项目约束、安全铁律、Git 规范、三代理框架 |
| ✅ | [CLAUDE.md](../CLAUDE.md) | Claude Code 运行时说明（context-mode 路由等） |
| ✅ | [OPENCODE.md](../OPENCODE.md) | OpenCode 运行时说明（与 Claude 的差异） |
| 🔥 | [00_CURRENT.md](00_CURRENT.md) | 当前项目整体状态 + 下一步 + 交接 |
| ✅ | [DECISIONS.md](DECISIONS.md) | 技术决策台账（D 系列 + 门禁 + 开放项速查） |
| ✅ | [progress.md](progress.md) | 项目历史轨迹，每轮追加 |
| 🔥 | [active_spec.md](active_spec.md) | 当前轮任务详情（第 1 阶段开发中），每轮替换 |
| ✅ | [reference/TECH_PLAN_v2.md](reference/TECH_PLAN_v2.md) | 技术方案权威版：战略定位/知识图谱/诊断引擎/BKT/AI 管线 |
| ✅ | [reference/OPS_handbook.md](reference/OPS_handbook.md) | 运营手册：共创者框架/医生模式/上线 SOP/措辞铁律 |
| ✅ | [reference/BOOTSTRAP_new_project_handbook.md](reference/BOOTSTRAP_new_project_handbook.md) | 新项目引导手册 |
| ✅ | [reference/installed-skills-catalog.md](reference/installed-skills-catalog.md) | 已安装 Skill 清单（2026-06-19） |
| ✅ | [reference/codex_long_term_memory.md](reference/codex_long_term_memory.md) | Codex 长期记忆入口：长期协作约定与 Git 收口规则 |
| ✅ | [reference/fof-semantic-mvp-dual-runtime-audit-notes.md](reference/fof-semantic-mvp-dual-runtime-audit-notes.md) | fof-semantic 双运行时审计笔记（发现的问题与建议） |

---

## Agent 规则（双运行时支持）

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| 🔥 | [agents/plan-agent.md](agents/plan-agent.md) | Canonical 计划代理正文 |
| 🔥 | [agents/execute-agent.md](agents/execute-agent.md) | Canonical 执行代理正文 |
| 🔥 | [agents/audit-agent.md](agents/audit-agent.md) | Canonical 审计代理正文 |
| ✅ | [../.claude/agents/](../.claude/agents/) | Claude Code 运行时加载层（由 sync-agents.js 同步） |
| ✅ | [../.opencode/agents/](../.opencode/agents/) | OpenCode 运行时加载层（由 sync-agents.js 同步） |
| ✅ | [../scripts/sync-agents.js](../scripts/sync-agents.js) | 同步 canonical → 运行时加载层 |
| ✅ | [../scripts/check-agent-sync.js](../scripts/check-agent-sync.js) | 检查运行时文件与 canonical 一致 |

---

## 开发流水线（三代理闭环）

### doc/plan/ — 实施计划

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [plan/M3c-session-pdf-plan.md](plan/M3c-session-pdf-plan.md) | M3c 周末诊断编排 + 纸质包 PDF |
| ✅ | [plan/M3a-tracking-skeleton-plan.md](plan/M3a-tracking-skeleton-plan.md) | M3a 追踪骨架（Item 表/KST-lite/BKT/API） |
| ✅ | [plan/M3-node-extraction-plan.md](plan/M3-node-extraction-plan.md) | M3 节点提取 |
| ✅ | [plan/M2-attribution-flow-plan.md](plan/M2-attribution-flow-plan.md) | M2 归因流程骨架 |
| ✅ | [plan/knowledge-graph-data-layer-plan.md](plan/knowledge-graph-data-layer-plan.md) | M1 知识图谱数据层 |
| ✅ | [plan/container-split-prod-test-plan.md](plan/container-split-prod-test-plan.md) | 生产/测试容器分离 |
| ✅ | [plan/prompt-revision-plan.md](plan/prompt-revision-plan.md) | 提示词修订 |
| ✅ | [plan/three-agent-prompt-revision-plan.md](plan/three-agent-prompt-revision-plan.md) | 三代理提示词修订 |
| 🟡 | [plan/opencode-dual-runtime-plan.md](plan/opencode-dual-runtime-plan.md) | OpenCode 双运行时支持方案 |
| 🟡 | [plan/frontend-architecture-plan.md](plan/frontend-architecture-plan.md) | 独立前端架构方案（待 Codex 评审） |
| 🟡 | [plan/project-progress-review-2026-06-20.md](plan/project-progress-review-2026-06-20.md) | 项目进展审查 2026-06-20（已审计修正） |
| ✅ | [plan/project-architecture-map-and-priority-plan.md](plan/project-architecture-map-and-priority-plan.md) | 项目全景架构图 + API 缺口 + 优先级建议 |
| ✅ | [plan/capture-to-diagnosis-closed-loop-redesign.md](plan/capture-to-diagnosis-closed-loop-redesign.md) | 采集→诊断闭环重设计：四段闭环 + 优先级表 + 方案边界 |
| 🔥 | [plan/nana-master-plan.md](plan/nana-master-plan.md) | 项目总纲：完成度/四段闭环/优先级/不做什么/核心约束 |
| 🔥 | [plan/nana-development-phases.md](plan/nana-development-phases.md) | 5 阶段开发计划 + 依赖关系 + HTML mockup 逐页审计 |
| 🔥 | [plan/nana-phase1-execution-plan.md](plan/nana-phase1-execution-plan.md) | 第 1 阶段执行计划：case API + 首页 + 采集壳 + 轻反馈（4 commits） |
| 🔥 | [plan/nana-phase2-execution-plan.md](plan/nana-phase2-execution-plan.md) | 第 2 阶段执行计划：知识地图（2 commits） |
| 🔥 | [plan/nana-phase3-execution-plan.md](plan/nana-phase3-execution-plan.md) | 第 3 阶段执行计划：Session UI + 诊断报告 + 纸质包（3 commits） |
| 🟡 | [plan/tencent-cloud-hk-deployment-plan.md](plan/tencent-cloud-hk-deployment-plan.md) | 腾讯云香港部署方案（旧方案——服务器现场 build，建议改为 CI 方案） |
| 🔥 | [plan/ci-image-deployment-plan.md](plan/ci-image-deployment-plan.md) | CI 镜像部署方案（推荐——GitHub Actions + GHCR，服务器只 pull 运行） |
| 📦 | [plan/photo-guide-plan.md](plan/photo-guide-plan.md) | 拍照指南计划 |

### doc/executionlog/ — 执行日志

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [executionlog/M3c-session-pdf-log.md](executionlog/M3c-session-pdf-log.md) | M3c 执行日志 |
| ✅ | [executionlog/M2-attribution-flow-log.md](executionlog/M2-attribution-flow-log.md) | M2 执行日志 |
| ✅ | [executionlog/knowledge-graph-data-layer-log.md](executionlog/knowledge-graph-data-layer-log.md) | M1 执行日志 |
| ✅ | [executionlog/container-split-prod-test-log.md](executionlog/container-split-prod-test-log.md) | 容器分层执行日志 |
| ✅ | [executionlog/photo-guide-log.md](executionlog/photo-guide-log.md) | 拍照指南执行日志 |
| ✅ | [executionlog/nana-phase1-execution-log.md](executionlog/nana-phase1-execution-log.md) | 第 1 阶段执行日志 |
| ✅ | [executionlog/nana-phase2-execution-log.md](executionlog/nana-phase2-execution-log.md) | 第 2 阶段执行日志 |
| 🟡 | [executionlog/nana-phase3-execution-log.md](executionlog/nana-phase3-execution-log.md) | 第 3 阶段执行日志（进行中） |
| ✅ | [executionlog/tencent-cloud-deployment-log.md](executionlog/tencent-cloud-deployment-log.md) | 腾讯云部署执行日志（CI 镜像路线 + bcryptjs 修复） |

### doc/auditlog/ — 审计报告

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [auditlog/M3c-session-pdf-audit.md](auditlog/M3c-session-pdf-audit.md) | M3c 审计报告 ✅ 通过 |
| ✅ | [auditlog/M3a-tracking-skeleton-audit.md](auditlog/M3a-tracking-skeleton-audit.md) | M3a 审计报告 ✅ 通过 |
| ✅ | [auditlog/M2-attribution-flow-audit.md](auditlog/M2-attribution-flow-audit.md) | M2 审计报告 ✅ 通过 |
| ✅ | [auditlog/knowledge-graph-data-layer-audit.md](auditlog/knowledge-graph-data-layer-audit.md) | M1 审计报告 ✅ 通过 |
| ✅ | [auditlog/container-split-prod-test-audit.md](auditlog/container-split-prod-test-audit.md) | 容器分层审计报告 ✅ 通过 |
| ⚠️ | [auditlog/prompt-revision-audit.md](auditlog/prompt-revision-audit.md) | 提示词修订审计 ⚠️ 有条件通过 |
| ✅ | [auditlog/project-progress-review-2026-06-20-audit.md](auditlog/project-progress-review-2026-06-20-audit.md) | 项目进展审查报告审计 ⚠️ 有条件通过 |
| ✅ | [auditlog/nana-phase1-execution-audit.md](auditlog/nana-phase1-execution-audit.md) | 第 1 阶段执行审计 ✅ 通过 |
| ✅ | [auditlog/nana-phase2-execution-audit.md](auditlog/nana-phase2-execution-audit.md) | 第 2 阶段执行审计 ✅ 通过 |
| ⚠️ | [auditlog/nana-master-plan-audit.md](auditlog/nana-master-plan-audit.md) | 总纲 + 开发计划审计 ⚠️ 有条件通过（已修复） |
| 📦 | [auditlog/photo-guide-audit.md](auditlog/photo-guide-audit.md) | 拍照指南审计 |

---

## doc/reference/ — 参考资料

### 长期权威参考

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [reference/TECH_PLAN_v2.md](reference/TECH_PLAN_v2.md) | 技术方案权威版 |
| ✅ | [reference/OPS_handbook.md](reference/OPS_handbook.md) | 运营手册 |
| ✅ | [reference/BOOTSTRAP_new_project_handbook.md](reference/BOOTSTRAP_new_project_handbook.md) | 新项目引导手册 |
| ✅ | [reference/codex_long_term_memory.md](reference/codex_long_term_memory.md) | Codex 长期记忆入口 |
| ✅ | [reference/codex_memory_decisions/](reference/codex_memory_decisions/) | Codex 记忆决策记录目录 |
| ✅ | [reference/codex_memory_decisions/2026-07-01_ci-image-deployment-and-real-capture-gates.md](reference/codex_memory_decisions/2026-07-01_ci-image-deployment-and-real-capture-gates.md) | Codex 记忆决策：CI 镜像部署 + Phase 1.5 真实采集门禁 |
| ✅ | [reference/installed-skills-catalog.md](reference/installed-skills-catalog.md) | 已安装 Skill 清单（2026-06-19） |
| ✅ | [reference/fof-semantic-mvp-dual-runtime-audit-notes.md](reference/fof-semantic-mvp-dual-runtime-audit-notes.md) | fof-semantic 双运行时审计笔记 |
| ✅ | [reference/docker-troubleshooting-guide.md](reference/docker-troubleshooting-guide.md) | Docker Desktop 故障排查指南（Fast Startup + 修复流程 + CI 策略更新） |

### 治理方案

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| 🟡 | [reference/doc-governance-proposal.md](reference/doc-governance-proposal.md) | 文档治理方案（待用户确认） |

### 分析参考

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [reference/competitor-shuzi-analysis.md](reference/competitor-shuzi-analysis.md) | 竞品速评——术子错题宝 |
| 📦 | [reference/M3_content_prompts.md](reference/M3_content_prompts.md) | M3 配题提示词参考 |
| 📦 | [reference/M3_peiti_acceptance.md](reference/M3_peiti_acceptance.md) | M3 配题验收 |
| 📦 | [reference/M3_peiti_nodes_batch1.md](reference/M3_peiti_nodes_batch1.md) | M3 配题节点批次 1 |

### 工单（临时，后续移入 reference/workorders/）

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| 🟡 | [reference/2026-07-02_1051_workorder_textbook-topic-mapping.md](reference/2026-07-02_1051_workorder_textbook-topic-mapping.md) | 学生可见课本目录标签与系统知识点映射方案工单 |
| 🟡 | [reference/2026-07-01_1846_workorder_capture-map-v1.md](reference/2026-07-01_1846_workorder_capture-map-v1.md) | 第一版聚焦错题采集、初步识别与知识地图挂载工单 |
| 🟡 | [reference/get-notes-interaction-research-workorder.md](reference/get-notes-interaction-research-workorder.md) | Get Notes 交互调研工单 |
| 🟡 | [reference/get-notes-research-workorder.md](reference/get-notes-research-workorder.md) | Get Notes 调研工单 |
| 🟡 | [reference/frontend-architecture-workorder.md](reference/frontend-architecture-workorder.md) | 前端架构工单（在跑） |
| 🟡 | [reference/2026-06-27_capture-shell-diagnosis-skeleton-workorder.md](reference/2026-06-27_capture-shell-diagnosis-skeleton-workorder.md) | 采集壳 + 诊断骨架优化工单 |
| 🟡 | [reference/2026-06-27_open-source-reuse-research-workorder.md](reference/2026-06-27_open-source-reuse-research-workorder.md) | 开源轮子补充调研工单（增量版） |
| 🟡 | [reference/2026-06-27_open-source-absorption-plan-revision-workorder.md](reference/2026-06-27_open-source-absorption-plan-revision-workorder.md) | 开源轮子吸收后的前端方案收敛修订工单 |
| 🟡 | [reference/2026-06-27_project-architecture-map-workorder.md](reference/2026-06-27_project-architecture-map-workorder.md) | 项目全景架构图 + 下一步优先级盘点工单 |
| 🟡 | [reference/2026-06-27_external-research-capture-to-diagnosis-loop-workorder.md](reference/2026-06-27_external-research-capture-to-diagnosis-loop-workorder.md) | 外部调研：采集到诊断闭环案例工单 |
| 🟡 | [reference/2026-06-27_video-resource-supplemental-research-workorder.md](reference/2026-06-27_video-resource-supplemental-research-workorder.md) | 外部调研：高中数学讲解视频资源补充工单 |
| 🟡 | [reference/2026-06-27_video-resource-supplemental-research-workorder-v2.md](reference/2026-06-27_video-resource-supplemental-research-workorder-v2.md) | 外部调研：高中数学讲解视频资源补充工单（修订版） |
| 🟡 | [reference/2026-06-27_project-ai-capture-to-diagnosis-loop-revision-workorder.md](reference/2026-06-27_project-ai-capture-to-diagnosis-loop-revision-workorder.md) | 项目 AI：采集到诊断闭环重设计工单 |
| 📦 | [reference/photo-guide-workorder.md](reference/photo-guide-workorder.md) | 拍照指南工单 |
| 📦 | [reference/vlm-transcribe-workorder.md](reference/vlm-transcribe-workorder.md) | VLM 转写工单 |
| 📦 | [reference/M3_node_extraction_workorder.md](reference/M3_node_extraction_workorder.md) | M3 节点提取工单 |
| 📦 | [reference/M3_peiti_workorder_M2a_BG.md](reference/M3_peiti_workorder_M2a_BG.md) | M3 配题工单 M2a BG |
| 📦 | [reference/M3a_plan_revision_workorder.md](reference/M3a_plan_revision_workorder.md) | M3a 计划修订工单 |
| 📦 | [reference/M3c_session_pdf_workorder.md](reference/M3c_session_pdf_workorder.md) | M3c 会话 PDF 工单 |
| 📦 | [reference/开发第一轮工单与提示词.md](reference/开发第一轮工单与提示词.md) | 开发第一轮工单与提示词 |

### 交接文档（临时，后续移入 reference/handoffs/）

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [reference/HANDOFF_project_handoff.md](reference/HANDOFF_project_handoff.md) | 项目战略/产品定位/方法论交接 |
| ✅ | [reference/HANDOFF_to_codex_tech_review.md](reference/HANDOFF_to_codex_tech_review.md) | 致 Codex 技术评审交接 |

### 事故复盘（临时，后续移入 reference/postmortems/）

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [reference/M2-prod-contamination-postmortem.md](reference/M2-prod-contamination-postmortem.md) | M2 生产库污染事故复盘 |

---

## doc/research/ — 深度调研

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [research/面向数学基础薄弱高中生的个性化诊断辅导系统深度调研报告.md](research/面向数学基础薄弱高中生的个性化诊断辅导系统深度调研报告.md) | 核心调研报告 |
| ✅ | [research/AI辅导系统综合技术方案.md](research/AI辅导系统综合技术方案.md) | AI 辅导系统技术方案 |
| ✅ | [research/#3新高考全国I卷数学知识图谱主线与跨线桥研究.md](research/#3新高考全国I卷数学知识图谱主线与跨线桥研究.md) | 知识图谱主线研究 |
| ✅ | [research/#3-2新高考全国I卷数学逐题统计与低分保底路径研究.md](research/#3-2新高考全国I卷数学逐题统计与低分保底路径研究.md) | 逐题统计与保底路径 |
| ✅ | [research/#3-2安徽新高考数学知识图谱主线与跨线桥.md](research/#3-2安徽新高考数学知识图谱主线与跨线桥.md) | 安徽知识图谱主线 |
| ✅ | [research/#4-2M1与M2a微技能级知识图谱.md](research/#4-2M1与M2a微技能级知识图谱.md) | M1/M2a 微技能级图谱 |
| ✅ | [research/#5-2B站高中数学基础打底视频调研.md](research/#5-2B站高中数学基础打底视频调研.md) | B 站视频调研 |
| ✅ | [research/2高考补救型知识图谱地基层微技能清单.md](research/2高考补救型知识图谱地基层微技能清单.md) | 地基微技能清单 |
| ✅ | [research/技术方案v1.1补丁.md](research/技术方案v1.1补丁.md) | 技术方案 v1.1 补丁 |
| ✅ | [research/初诊题产出.md](research/初诊题产出.md) | 初诊题产出 |
| ✅ | [research/M1 初诊题首批.md](research/M1 初诊题首批.md) | M1 初诊题首批 |
| 🟡 | [research/同品调研/nana_open_source_absorption_summary.md](research/同品调研/nana_open_source_absorption_summary.md) | 开源轮子吸收摘要（给项目 AI） |
| 🟡 | [research/同品调研/open-source-dialectical-review.md](research/同品调研/open-source-dialectical-review.md) | 开源轮子调研辩证评审 |
| 📦 | [research/transcripts/](research/transcripts/) | 真题转写（2024 三版 + 2025/2026） |
| 📦 | [research/extracted/](research/extracted/) | 真题提取 OCR 图片（2024-2026） |
| 📦 | [research/comp_pages/](research/comp_pages/) | 竞品截图 |
| 🟡 | [research/Claude Code 的机制.md](research/Claude Code 的机制.md) | Claude Code 机制分析（2026-06） |

---

## doc/spec/ — 运维规范

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [spec/三代理协作开发框架方案.md](spec/三代理协作开发框架方案.md) | 三代理协作框架方案 |
| ✅ | [spec/三代理协作开发框架方案-v2.md](spec/三代理协作开发框架方案-v2.md) | 三代理协作框架 v2 |
| ✅ | [spec/Git协作方案.md](spec/Git协作方案.md) | Git 协作方案 |
| ✅ | [spec/Git协作方案-v2.md](spec/Git协作方案-v2.md) | Git 协作方案 v2 |
| ✅ | [spec/AI执行摩擦评估报告.md](spec/AI执行摩擦评估报告.md) | AI 执行摩擦评估 |
| ✅ | [spec/AI摩擦修复方案.md](spec/AI摩擦修复方案.md) | AI 摩擦修复方案 |
| 🟡 | [spec/ops-feedback-loop-backlog.md](spec/ops-feedback-loop-backlog.md) | 运维反馈闭环 backlog |

---

## doc/guide/ — 使用指南

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [guide/photo-guide-niece.md](guide/photo-guide-niece.md) | 拍照指南——外甥女版 |
| ✅ | [guide/photo-guide-uncle.md](guide/photo-guide-uncle.md) | 拍照指南——舅舅版 |
| ✅ | [guide/deployment-guide.md](guide/deployment-guide.md) | 部署指南——CI 镜像路线、发布流程、回滚、备份、故障排查 |

---

## doc/ 根级运维文档

| 状态 | 文件 | 一句话 |
|:--:|------|--------|
| ✅ | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | 项目总览 |
| ✅ | [operational_flow.md](operational_flow.md) | 操作流程图 |
| ✅ | [HTTPS_SETUP.md](HTTPS_SETUP.md) | HTTPS 配置指南 |
| ✅ | [LOGGING_GUIDE.md](LOGGING_GUIDE.md) | 日志指南 |
| ✅ | [MARKDOWN_GUIDE.md](MARKDOWN_GUIDE.md) | Markdown 指南 |
| ✅ | [TABLE_RECOGNITION.md](TABLE_RECOGNITION.md) | 表格识别指南 |
| ✅ | [release-guide.md](release-guide.md) | 发布指南 |
| ✅ | [setup-wsl-network.md](setup-wsl-network.md) | WSL 网络配置 |

---

> 最后更新：2026-07-01 | 维护者：人类 + Claude + Codex + 三代理
> 本次更新：Codex 记忆决策（CI 镜像部署 + Phase 1.5 真实采集门禁）
