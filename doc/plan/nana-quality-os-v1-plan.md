# Nana Quality OS v1 · 开发计划 (r3.3)

> **关联规格**：`doc/spec/nana-v1-minimum-loop-acceptance.md`（待 A-0 冻结的人类验收契约，CL-01～CL-16）
> **关联计划**：`doc/plan/nana-test-framework-plan.md`（r3.1，测试执行子系统，**不重写**）
> **关联研究**：`doc/research/系统化 AI Agent 开发闭环的核心结构与原则.md`、`doc/research/Nana Quality OS für langlaufende Goal-Agents.md`（仅作研究输入，正式方案以中文为准）
> **关联决策**：`doc/DECISIONS.md` D-12/D-13/D-15、Gate-1～Gate-4
> **计划日期**：2026-07-19（最终冻结版本）
> **预计影响**：试点期（Phase A+B+C）最小，只在 `e2e/`、`scripts/quality/`、现有 workflow 末尾加 step；治理体系建设（Phase D）后移到 Release-proven 之后
> **计划类型**：治理体系建设（非产品功能、非部署、非 schema 变更）
> **安全说明**：本计划不创建任何 Prisma schema 变更、不修改上游表结构、不引入新运行时依赖、不新增正式 Agent、不自动部署生产。
> **文档形态**：本计划只写 Phase A 可执行细节；Phase B/C/D/E 只写目标、进入条件、退出条件，到时各自单独 /plan。

---

## 1. 战略与初心

### 1.1 这轮要验证什么

**初心**：需求确认后，Goal 自动产出可信 RC；机器证据和独立审计兜底；人只做产品、安全和发布决策，真机只抽检。

**验证方式**：通过 R1a（测试基础设施）、CL-09（数据/API/UI 一致性）、CL-13（打印+移动端呈现）**三个不同类型的真实需求**，证明 Goal 自治能力可复制，且上线后没有严重漏网问题。

**当前真实状态**（诚实区分规划战线 vs 交付战线）：

| 目标 | 当前状态 |
|------|----------|
| 最小闭环验收契约 | 基本明确，待 A-0 冻结 |
| 自动化测试护栏 | 已有详细方案（r3.1），R1a 尚未实现 |
| Goal 自主交付 | 试验设计完成，尚未被真实 Goal 证明 |
| 减少人工测试 | 指标已定义，尚无 baseline |
| Quality OS | 正确推迟到实证之后 |
| 完整用户闭环含打印 | CL-13 已纳入，但尚未实现 |

> **规划战线已收拢；交付战线仍停在起跑线。继续打磨计划收益很低，应尽快进入 A-0/R1a。**

### 1.2 假设条件（7 条标尺，分三层）

| # | 层级 | 标尺 | 测量方式 |
|---|------|------|----------|
| **H1** | 硬门禁 | 一个已确认需求能由 Goal 从计划做到可信 RC（不自动部署） | CL-09 + CL-13 两个 Feature Goal 试点跑通 |
| **H2** | 硬门禁 | 实现和验证阶段无可避免之外的人工介入；**安全铁律要求的审批单独计数，不算自治失败** | 三次介入统计；DB 变更/大偏离/危险操作审批单独归类 |
| **H3** | 硬门禁 | 至少 4 个历史缺陷被自动测试成功拦截 | HD-2/HD-3/HD-4/HD-5 回放报告 |
| **H4** | 受控演练 | audit-agent 能发现一项实现或测试遗漏 | 隔离缺陷样本盲测；无样本时零发现合法 |
| **H5** | 体验目标 | 手机人工验收趋向固定 5 分钟左右 | 三次真机抽检耗时；建立 baseline 持续改善，**首次不达标不否定体系** |
| **H6** | 硬门禁 | 没有增加需要人工同步维护的重复状态文档 | 试点结束审查：active_spec / executionlog / auditlog / Summary 是否漂移 |
| **H7** | 受控演练 | 测试失败时 Goal 能自动定位并修复，无法推进时诚实 Blocked | 两类受控失败演练（可恢复→修复；不可恢复→Blocked） |

### 1.3 三阶段成熟度阶梯

> 评审核心要求："不要在一条产品需求成功后就宣布体系成立。"

| 阶梯 | 达成条件 | 允许做 | 不允许做 |
|------|----------|--------|-----------|
| **Pilot-ready** | Phase A 完成（R1a Goal 跑通 + HD-2/3/4/5 回放护栏有效 + audit 受控盲测 + 两类受控失败演练 + 结果指标 baseline） | 进 Phase B | 不沉淀 Quality OS；不升级 AGENTS.md |
| **First-release-validated** | Phase B 完成（CL-09 Feature Goal 做到可信 RC + H1/H2 硬门禁通过）**+ 独立 Release Goal 部署后 Smoke 通过** | 进 Phase C（CL-13） | 不沉淀 Quality OS；不固化 Manifest Schema |
| **Release-proven** | Phase C 完成（CL-13 Feature Goal 成功 + 第二次真实发布 + **使用量门槛 + 30 天无 P0/P1 漏出**） | **才触发 Phase D**（Quality OS 沉淀） | — |

**判定原则**：
- 三阶梯必须顺序达成，不能跳级
- 硬门禁 + 受控演练必须全部通过才晋阶；体验目标记录 baseline，首次不达标不否定
- First-release-validated 要求**已生产部署并完成 Smoke**（实际超过 RC 概念，故不叫 RC-trustworthy）
- Release-proven 的 30 天跟踪期是**结果指标**，不是流程指标——必须真实生产运行无 P0/P1 漏出

### 1.4 结果指标层

> 验证"自动门禁是否真的拦住了本会漏出的 Bug"。

| 指标 | 含义 | 采集方式 | 门槛 |
|------|------|----------|------|
| `escaped_p0_p1_count` | 生产发布后逃逸的 P0/P1 缺陷数 | Release-proven 候选期 ≥ 30 天 + 使用量门槛跟踪 | **0**（=0 才算 Release-proven） |
| `escaped_p2_count` | 生产发布后逃逸的 P2 缺陷数 | 同上 | 记录 baseline，持续改善 |
| `manual_checkup_p0_p1_p2` | 人工真机抽检发现的 P0/P1/P2 数 | 每次真机抽检记录 | 记录 baseline，持续改善 |
| `ci_false_positive_count` | CI 假阳性次数 | CI 日志统计 | 趋势下降 |
| `flaky_test_count` | flaky test 次数 | Playwright + vitest 报告 | 趋势下降 |
| `human_total_hours` | 人工总耗时（含维护证据/冻结/试验日志） | **每个 Goal 结束时按 15 分钟粒度估算一次**（不精确打卡，避免指标本身制造治理开销） | 趋势下降 |
| `governance_overhead_hours` | 维护证据/冻结/试验日志花费的时间（`human_total_hours` 子项） | 同上单独估算 | 占比下降 |

**使用量门槛**（Release-proven 必要条件）：
- 30 天内必须完成 **≥ 10 次真实拍题闭环** + **≥ 5 次打印使用**（CL-13 落地后）
- 若 30 天内无人使用，零缺陷没有证明力，Release-proven 不达成
- N 值后续根据实际使用调整

---

## 2. 历史缺陷回放候选（已核实真实存在）

| # | 缺陷 | 真实证据来源 | 回放后的失败用例 |
|---|------|-------------|----------------------------|
| **HD-1** | 登录跳转 `/`→`/nana` 后 3 个 E2E 断言未同步（2026-07-04） | `doc/agents/execute-agent.md` EP-2 | E2E：旧 commit 路径回放 + characterization test |
| **HD-2** | 2026-07-02 生产 `KnowledgeNode=0` 事故（seed_graph 未跑） | `doc/00_CURRENT.md` 设计债 #5 | 集成测试：部署后 `KnowledgeNode.count() >= 48` |
| **HD-3** | 连续拍题时旧 AI 结果晚返回覆盖新题（`currentCaseIdRef` 保护） | `src/app/nana/capture/page.tsx:117` | E2E：三题不同延迟（2000/500/50ms）断言显示 Q3 |
| **HD-4** | 列表/详情 API 误返回大体积 base64 | `doc/auditlog/stage3-revised-round3-summary-audit.md:88` | 集成测试：summary/list 响应不含 `'base64-'` + 体积 < 阈值 |
| **HD-5** | CaseKnowledgeTag 与 StudentNodeState 语义混用风险 | `doc/spec/nana-v1-minimum-loop-acceptance.md` CL-12 | 集成测试：拍题后 `StudentNodeState.count()` 不变 + status 合法值 |

**回放策略**：
- **必做**：HD-2 + HD-3 + HD-4 + HD-5（HD-5 验证最关键的领域语义边界）
- **HD-1 作对照组**（已被现有 E2E 捕获，验证"现有护栏已工作"）
- **允许方式**：旧 commit、故障 fixture、独立 mutation 分支、characterization test
- **禁止**：临时删除现有保护代码制造失败——这会改坏真实代码

---

## 3. 试点期最小协议

> 试点期（Phase A+B+C）不建第二套"项目运行真相"。用现有 AGENTS.md、Goal、active_spec.md、CL 契约、CI、auditlog 跑通三个真实 Goal。

| 协议项 | 怎么用 | 不做什么 |
|--------|--------|----------|
| **契约** | 用现有 `doc/spec/nana-v1-minimum-loop-acceptance.md`；A-0/B-0/C-0 三阶段冻结 | 不建 spec_freezes 目录；不做条款级 hash Schema；只在 plan 文档中引用条款 ID |
| **Goal** | 用 AI 运行时的 Goal；用 active_spec.md 记录当前 Goal 状态 | 不建 goal-state JSON 目录 |
| **Plan/Execute/Audit** | 用现有三代理框架（D-13） | 不新增正式 Agent |
| **执行证据** | 现有 executionlog + auditlog + CI artifact + git commit | 不建 CL 覆盖登记表 |
| **测试结果** | CI 已有 junit xml / playwright json report | 不建运行 Manifest JSON |
| **CI 门禁** | 现有 ci.yml / build-and-push.yml / smoke-test.yml | 不新增 workflow 文件 |
| **发布证据** | 现有 release.yml + GitHub Release + 部署日志 | 不建 release-index 目录 |
| **唯一新增** | **Evidence Summary artifact**（CI 末尾自动产出的轻量 JSON，**只含**：测试 pass/fail 计数、关键断言、性能 P90、commit sha、失败日志摘要；**不含 audit 字段**；**不入 Git**） | audit 结论由 audit-agent 独立产出，不进 Summary |

**诚实标注**：试点期不宣称"权限隔离""自动完成""质量门禁"，只宣称：
- **流程约束**：用新会话 + 最小输入包让 audit-agent 独立验证（逻辑隔离，非权限隔离）
- **证据摘要**：Evidence Summary 是证据索引，不是证据本身
- **人工审批**：用户会话明确确认 / PR approval 是真实事件引用（`attestation_type=process_constraint`）

---

## 4. Phase A：R1a 试点（Pilot-ready 成熟度）

> **核心目标**：让 R1a 真正能发现用户动线问题；让历史缺陷回放验证护栏有效；为 Phase B 的 CL-09 Goal 试点铺好路。

### 4.1 任务清单（8 项，全部为真实能力建设）

| 任务 ID | 任务 | 文件 / 产物 | 依赖 | 风险 |
|---------|------|------------|------|:--:|
| **A-0**（第一次冻结） | **冻结 R1a 主路径所需条款**（产品复核） | 用户做一次简短的 CL 条款审阅；冻结 CL-01~CL-08、**CL-10a**、CL-11~CL-12、CL-14~CL-16（共 14 条）；**排除 CL-09、CL-10b、CL-13**（Phase B 冻 CL-09 + CL-10b；Phase C 冻 CL-13）；产出 `doc/spec/nana-v1-minimum-loop-acceptance.md` 的"已冻结条款清单（第一次）"段（标 freeze_id + frozen_at + approver_event_ref）；**A-0 启动时同步替换 `active_spec.md` 为 Quality OS v1 Phase A 内容**（替换前确认上一轮尾巴已结清） | 无 | 中（需用户参与） |
| **A-1** | **实现 R1a 黄金闭环**（r3.1 任务 2.1~2.7 + 2.9 的实现部分；**不含任务 2.8（30 题数据规模，属 R1d）**） | 假 Provider、虚拟麦克风、golden-path spec、证据采集器、Playwright 配置升级（**全部按 r3.1 计划执行，本方案不重写**） | A-0 | 高 |
| **A-2** | **生成最小 Evidence Summary artifact** | `scripts/quality/build-evidence-summary.ts`（**只读** git commit + 测试 report + 性能采集 + 失败日志；**不读 audit**；产出 `evidence-summary.json` 作为 CI artifact，**不进 Git**）；给 `ci.yml` e2e-test job 末尾加 1 个 step | A-1 | 低 |
| **A-3** | **audit-agent 用新会话独立验证 R1a**（首次跑 verifier 模式） | `doc/auditlog/r1a-verifier-mode.md`（新会话独立读 Summary + diff + 契约条款，不读 execute-agent 执行日志叙事；产出 finding 报告；零发现合法） | A-2 | 中 |
| **A-4** | **回放 HD-2 + HD-3 + HD-4 + HD-5**（HD-1 作对照组） | 每条缺陷用**旧 commit / 故障 fixture / characterization test** 转红→绿；**不临时删现有保护代码**；永久加入测试集；产出 `doc/auditlog/historical-defect-replay.md` | A-1 | 中 |
| **A-5** | **准备隔离的缺陷样本**（H4 受控盲测前置） | **在 A-3 跑之前**准备 1 个隔离的缺陷样本（如基于 HD 样本构造一份"故意不完整的实现快照"或一份"故意遗漏 CL 断言的旧 commit"）；**不往 R1a 真实实现中故意遗漏验收项**；样本就位后交给 A-3 | A-1 | 中 |
| **A-6** | **两类受控失败演练**（H7 验证） | ① **可恢复的实现缺陷**（如故意漏一个边界判断）→ 观察 Goal 是否自动修复；② **不可恢复条件**（如故意缺失 `VOLCENGINE_API_KEY`）→ 观察 Goal 是否诚实 Blocked。**不通过改坏正式测试制造失败** | A-1, A-3 | 中 |
| **A-7** | **记录 R1a Goal 完整介入 + 结果指标 baseline** | `doc/quality-trial-log/r1a-goal-trial.md`：① 每次人工介入记录（时机、类型、是否本可避免、**安全铁律审批单独计数**）；② H1~H7 baseline；③ 结果指标 baseline（§1.4）；**按 15 分钟粒度估算耗时**，不精确打卡 | A-1~A-6 | 低 |

### 4.2 验收（达成 Pilot-ready 成熟度）

**硬门禁（必须通过）：**
- ✅ R1a golden-path 在 CI 中每次 push 自动跑通 → 支撑 H1
- ✅ HD-2/HD-3/HD-4/HD-5 都能被自动测试拦住（破坏红、当前绿）→ **H3**
- ✅ **H2**：实现和验证阶段无可避免之外的人工介入；安全铁律要求的审批单独计数，不算自治失败
- ✅ 试点结束审查未出现两套真相漂移 → **H6**

**受控演练（必须完成）：**
- ✅ A-5 隔离缺陷样本就位 + A-3 audit 受控盲测发现预埋缺口（或无样本时零发现合法）→ **H4**
- ✅ A-6 两类受控失败演练（可恢复→修复；不可恢复→Blocked）→ **H7**

**体验目标（记录 baseline，首次不达标不否定）：**
- ✅ Evidence Summary artifact 在 CI 中可下载
- ✅ 真机抽检耗时记录（对比 Stage 3 ASR Round 2）→ **H5 baseline**
- ✅ 结果指标 baseline 建立（`human_total_hours` / `governance_overhead_hours` / `ci_false_positive_count` / `flaky_test_count`）

**Phase A 不通过**：不进 Phase B；回到 r3.1 修订 R1a 设计或重新讨论 Quality OS 假设。

### 4.3 Phase A 不做的事

- ❌ 不建 `doc/quality/` 目录（除 `doc/quality-trial-log/` 临时记录）
- ❌ 不写 Evidence Manifest JSON Schema（只产 evidence-summary.json，结构简单）
- ❌ 不建 Goal 状态机 JSON 文件
- ❌ 不写 Goal 完成策略
- ❌ 不写 gates / audit-rules / safety-rules 三份规则文档
- ❌ 不新增正式 Agent
- ❌ 不新增 workflow 文件
- ❌ 不升级 AGENTS.md

---

## 5. Phase B：CL-09 试点（First-release-validated 成熟度）

> **进入条件**：Phase A 达成 Pilot-ready。
> **退出条件**：CL-09 Feature Goal 做到可信 RC + 独立 Release Goal 部署后 Smoke 通过 → 达成 First-release-validated。
> **计划形态**：本节只写概要；CL-09 详细任务在 Phase B 启动时单独 /plan。

### 5.1 概要任务（详细计划到时再写）

| 任务 ID | 任务 | 产物 |
|---------|------|------|
| **B-0** | **第二次冻结 CL-09 + CL-10b**（开发前必做——契约先于实现） | 更新 spec 文档"已冻结条款清单（第二次）"段 |
| **B-1** | **CL-09 plan**（用 Superpowers `brainstorming` + `writing-plans`） | `doc/plan/cl-09-manual-textbook-topic-plan.md` |
| **B-2** | **CL-09 实现**（用 `test-driven-development` + `systematic-debugging`） | PATCH API + UI + 双写口径统一 + 集成测试 + E2E |
| **B-3** | **CL-09 audit**（新会话，用 `requesting-code-review`） | `doc/auditlog/cl-09-audit.md` |
| **B-4** | **CL-09 RC 验证**（Feature Goal 终态，不部署生产） | Evidence Summary + audit PASS + 镜像构建 |
| **B-5** | **两类受控失败演练 + 结果指标第二次采集** | `doc/quality-trial-log/cl-09-goal-trial.md` |

### 5.2 独立 Release Goal（发布闸门，**不属于** Feature Goal 任务清单）

> Release Goal 是独立发布闸门，不在 Phase B 任务清单里。生产部署仍由独立 Release Goal、人工批准和现有备份门禁负责。

| Release 步骤 | 责任 | 产物 |
|--------------|------|------|
| 用户人工批准发布 | 用户 | PR approval / 会话确认事件 ref |
| 跑 `scripts/deploy.sh`（备份 SQLite + pull 镜像 + up -d + 健康检查） | 用户或人授权脚本 | 部署日志 |
| 部署后 Smoke（含 HD-2 / OD-001 的 `KnowledgeNode>=48` 不变量） | 自动脚本 | Smoke 报告 |
| 真机抽检（H5 baseline） | 用户 | 真机抽检清单 |
| 30 天跟踪 `escaped_p0_p1_count` + 使用量门槛（≥ 10 次真实闭环） | 用户使用 + 自动记录 | Release-proven 候选期证据 |

**关键**：CL-09 Goal 在 B-4 RC 验证通过后**就结束**。是否部署由独立 Release Goal 决定，部署成功才达成 First-release-validated。

---

## 6. Phase C：CL-13 试点（Release-proven 成熟度）

> **进入条件**：Phase B 达成 First-release-validated。
> **退出条件**：CL-13 Feature Goal 成功 + 第二次真实发布 + 30 天无 P0/P1 漏出 + 使用量门槛 → 达成 Release-proven → 触发 Phase D。
> **计划形态**：本节只写概要；CL-13 详细任务在 Phase C 启动时单独 /plan。
> **选 CL-13 的理由**：打印与移动端呈现需求类型明显不同于 CL-09（数据/API/UI 一致性），能真正验证 Goal 自治能力的**跨需求复制**。

### 6.1 概要任务（详细计划到时再写）

| 任务 ID | 任务 | 产物 |
|---------|------|------|
| **C-0** | **第三次冻结 CL-13** | 更新 spec 文档"已冻结条款清单（第三次）"段 |
| **C-1** | **CL-13 plan** | `doc/plan/cl-13-print-preview-plan.md`（实现 `/nana/print-preview` + 章节分组 + 打印友好样式） |
| **C-2** | **CL-13 实现** | 新路由 + 章节分组 + 集成测试 + E2E |
| **C-3** | **CL-13 audit** | `doc/auditlog/cl-13-audit.md` |
| **C-4** | **CL-13 RC 验证**（Feature Goal 终态） | Evidence Summary + audit PASS + 镜像 |
| **C-5** | **两类受控失败演练 + 结果指标第三次采集** | `doc/quality-trial-log/cl-13-goal-trial.md` |
| **C-6** | **跨需求复制判定** | `doc/quality-trial-log/cross-goal-comparison.md`：CL-09 vs CL-13 介入/修复/抽检对比 |

### 6.2 独立 Release Goal（发布闸门，同 §5.2）

CL-13 RC 通过后，独立 Release Goal 流程：
- 用户批准 → deploy.sh → 部署后 Smoke → 真机抽检（**含打印真机验证**）
- 30 天跟踪 `escaped_p0_p1_count` + **使用量门槛（≥ 5 次真实打印使用 + ≥ 10 次真实闭环）**

### 6.3 验收（达成 Release-proven）

**硬门禁：**
- ✅ **H1**：CL-13 Feature Goal 从计划做到可信 RC（**跨需求第二次成立**）
- ✅ **H2**：CL-13 实现和验证阶段无可避免之外的人工介入
- ✅ **结果指标**：CL-13 Release 后 ≥ 30 天 + 使用量门槛满足 + **`escaped_p0_p1_count = 0`**；`escaped_p2_count` 记录 baseline

**受控演练：**
- ✅ **H7**：C-5 两类受控失败演练

**体验目标：**
- ✅ **H5**：CL-13 真机抽检耗时（含手机浏览器打印 PDF 验证）

**判定**：以上全部通过 → **达成 Release-proven** → 才触发 Phase D（Quality OS 沉淀）。

---

## 7. Phase D：Quality OS 沉淀（Release-proven 后启动）

> **进入条件**：Phase C 达成 Release-proven。
> **退出条件**：Quality OS v1 文档体系基于试点数据成文，不出现"理论推导但未验证"的规则。
> **计划形态**：本节是候选清单，不是必做清单。Phase D 启动时**基于 R1a + CL-09 + CL-13 + Release 反馈四类数据重新 /plan**，只抽象**真实重复出现**的机制。

### 7.1 候选清单（落地哪些由试点数据决定）

| 任务 ID | 任务 | 候选依据 | 落地判定 |
|---------|------|----------|----------|
| **D-1** | 从试点做法抽象 Quality OS v1 骨架（Manifest Schema / Goal 状态机 / attestation 字段） | 三个 Goal + 两次 Release 中重复出现的机制才抽象 | 数据驱动 |
| **D-2** | 写 Evidence Manifest JSON Schema v1 | 仅当 evidence-summary.json 结构证明有用 | 数据驱动 |
| **D-3** | 写 Goal 完成策略（按真实遇到的类型） | 至少 Feature + Release 两种 | 数据驱动 |
| **D-4** | 写契约条款级冻结机制 | 基于 A-0/B-0/C-0 三次冻结的实际流程 | 数据驱动 |
| **D-5** | 写门禁/审计/安全规则 | 从试点期实际执行的规则提炼 | 数据驱动 |
| **D-6** | 写 CL 覆盖登记表 | 仅当试点中"CL 覆盖不可查"成为真实痛点 | 数据驱动 |
| **D-7** | audit-agent 两种模式成文（verifier + full audit） | 基于 A-3/B-3/C-3 的实际做法 | 数据驱动 |
| **D-8** | **AGENTS.md 追加 Quality OS 入口段** | Release-proven 后才升级 | 必做 |
| **D-9** | 失败治理规则成文 | 基于试点（含受控演练）实际遇到的失败分类 | 数据驱动 |
| **D-10** | 发布证据索引 | 仅当"找不到历史证据"成为真实痛点 | 数据驱动 |

### 7.2 验收

- Quality OS v1 文档体系基于试点期真实做法，不出现"理论推导但未验证"的规则；
- r2 P1 修正的 8 条工程矛盾在 Phase D 沉淀时全部落地（见 §9 索引）；
- 现有 active_spec / executionlog / auditlog 与 Quality OS 文档不漂移（H6 持续成立）；
- **候选清单中未抽象的项明确记录"为什么试点中没重复出现"，避免未来无理由建出来**；
- `governance_overhead_hours` 占 `human_total_hours` 比例趋势下降，否则说明 Quality OS 过重，应缩减。

---

## 8. Phase E：远期扩展

> **进入条件**：Phase D 完成，Quality OS v1 文档稳定。

| 任务 ID | 任务 |
|---------|------|
| **E-1** | LLM Eval v1（WER/CER + 分类 + 摘要 + 反馈） |
| **E-2** | Mutation / Property-based 测试（可选） |
| **E-3** | SBOM + 镜像 digest 入 Manifest |
| **E-4** | 部署后 Smoke 自动化（HD-2 / OD-001 永久闭环） |
| **E-5** | KPI 趋势看板（含结果指标） |
| **E-6** | 真机抽检清单数字化 |

---

## 9. r2 P1 修正成果保留清单（试点期精神遵守，Phase D 落地）

> 试点期不建设这些机制，但 Evidence Summary 和 Goal 操作必须**遵守这些原则的精神**。Phase D 沉淀时正式落地。

| r2 P1 修正 | 试点期怎么遵守精神 | Phase D 怎么落地 |
|------------|-------------------|------------------|
| **P1.1 Manifest 不入 Git** | Evidence Summary 是 CI artifact，不 commit | D-2: Manifest Schema 明确"运行 Manifest 是 artifact" |
| **P1.2 审批引用真实事件** | A-0 冻结时记录用户会话事件 ref；Release Goal 记录 PR approval ref | D-4: attestation_type=process_constraint 入 Schema |
| **P1.3 Goal 类型差异化终点** | R1a（test-infra 终态=Audit→Completed）；CL-09/CL-13（feature 终态=RC→Completed） | D-3: 完成策略按类型差异化 |
| **P1.4 Phase A 不谎称无依赖** | Phase A 明确依赖 R1a（A-1 就是 R1a 实现） | — |
| **P1.5 测试冻结分阶段** | 试点期测试在 Implementing/PartialVerify 自由改；FullVerify 候选形成才记录 hash | D-5: 测试冻结规则 |
| **P1.6 条款级 Hash** | A-0 冻结时手抄条款 ID + 内容到 plan；改其他条款不阻塞本 Goal | D-4: 条款 hash Schema |
| **P1.7 不新增正式 Agent** | 全程不新增；audit-agent 用新会话实现 verifier 模式 | D-7: audit-agent 加两种模式段 |
| **P1.8 真实回滚流程** | Release Goal 部署后 Smoke 失败时，按"人选旧 tag → 改 NANA_IMAGE → deploy.sh"流程 | D-5: 回滚规则成文 |

---

## 10. Superpowers Skill 衡量方式

> **衡量关键行为真实发生，不是"抓到问题"**——后者会诱导为漂亮指标制造问题。

| Skill | 试点期观察的关键行为 | 如何记录 |
|-------|---------------------|----------|
| `test-driven-development` | 实现前**真有失败测试**（红→绿→重构） | execute-agent 执行日志记录"先写测试，确认失败，再实现" |
| `systematic-debugging` | 调试**先记录根因假设**再修，不是猜测修 | 执行日志记录"根因：X；修复：Y"，而非直接"改成 Y" |
| `verification-before-completion` | 完成 claim **前**有证据，不是完成后补证据 | Evidence Summary 引用具体测试/commit，不接受"应该没问题" |
| `requesting-code-review` / audit | 审计**使用独立输入包**（新会话 + 过滤后数据） | auditlog 记录 audit 会话上下文来源 |
| `brainstorming` / `writing-plans` | plan 产出前**有意图澄清**记录 | plan 文档含"目标/非目标/约束"段 |

**记录方式**：试点 Goal 结束时，在 `doc/quality-trial-log/*.md` 中按 Skill 各记一条"关键行为是否发生"。**不记"抓到几个问题"**。

---

## 11. 明确不做清单（全期）

| 不做的事 | 理由 |
|----------|------|
| 不在试点期建 `doc/quality/` 治理目录 | 避免过早固化错误抽象 |
| 不在试点期写 Manifest JSON Schema | 同上 |
| 不新增正式 Agent（全程） | 复用现有三代理框架 |
| 不在 CI 中 commit Manifest（全程） | 避免 CI 自循环 |
| 不宣称权限隔离（全程） | 诚实标注为流程约束（process_constraint） |
| 不新增 workflow 文件（全程） | 给 ci.yml/build-and-push.yml/smoke-test.yml 加 step |
| 不引入 Temporal / LangGraph / 完整 SLSA / in-toto | 决策 5 |
| 不引入 Spec Kit 作为第二套真相 | 决策 3 |
| 不用 BLEU/ROUGE 作主指标 | 决策 10 |
| 不修改 Prisma schema / 上游表结构 | 安全铁律 3 |
| 不在每次 commit 跑 mutation | 性能成本 |
| 不允许 execute-agent 改契约或测试门禁 | 决策 8 |
| Agent 自述不能作为完成证据（修正） | Agent 可报告完成，但**自述不能作为完成证据**；只有门禁证据和独立审计才能确认完成 |
| 不要求每个 LLM-heavy Goal 人工抽检 N=10 | 模型/Prompt 变化时抽检，否则复用版本化金标集 |
| 不用"改坏正式测试"制造受控失败 | 用隔离缺陷样本 / 故障 fixture / 旧 commit |
| 不输出生产密钥 | 安全铁律 4 |

---

## 12. 已预采纳决策

| ID | 决策 | 落地位置 |
|----|------|----------|
| D-Q1 | 用户本人批准 | A-0、Release Goal |
| D-Q2 | 复用现有框架，仅称逻辑隔离 | audit-agent 新会话 + 最小输入包 |
| D-Q3 | R1a 做管道试点；CL-09 做首个产品试点；CL-13 做第二个产品试点 | Phase A、B、C |
| D-Q4 | 暂不绑定 Claude，先定义 adapter 和校准标准 | Phase E |
| D-Q5 | Mutation Phase E 可选 | E-2 |
| D-Q6 | 单独做一次 CL-01～16 产品复核后再冻结 | A-0 |
| D-Q7 | 每次运行 Manifest 只做 artifact；Schema 和最终发布索引入 Git | Evidence Summary（试点）→ D-2（Phase D Schema） |
| D-Q8 | v1 不新增正式 Agent | 全程 |

---

## 13. 剩余开放项（按评审 r3.3 推荐）

| # | 开放项 | 评审推荐 |
|---|--------|----------|
| **O-1** | 本 r3.3 战略方向是否确认 | **确认** |
| **O-2** | A-0 产品复核形式 | **做一次简短 CL 审阅** |
| **O-3** | CL 冻结方式 | **三阶段冻结**（Phase A 不冻 CL-09/CL-13；CL-10 已正式拆为 CL-10a/CL-10b——CL-10a 随 A-0 冻、CL-10b 随 B-0 冻） |
| **O-4** | 历史缺陷回放组合 | **HD-2 + HD-3 + HD-4 + HD-5** |
| **O-5** | r3.3 是否提交 | **完成一致性清理后提交** |
| **O-6** | 第二个产品 Goal 是否锁定 CL-13 | **确认 CL-13** |

---

## 计划状态

- [x] r3.3 一致性清理完成（5 件事：编号统一 / 删版本考古 / Release Goal 边界独立 / 使用量门槛 / 15 分钟粒度估算）
- [x] 三阶段成熟度阶梯重命名：Pilot-ready / First-release-validated / Release-proven
- [x] Phase 编号统一为 A/B/C/D/E（R1a / CL-09 / CL-13+Release-proven / Quality OS 沉淀 / 远期扩展）
- [x] Release Goal 独立画成发布闸门（§5.2、§6.2），不在 Feature Phase 任务清单里
- [x] 30 天门槛加使用量分母（≥ 10 次闭环 + ≥ 5 次打印）
- [x] 删除 r1/r2/r3/r3.1/r3.2 修订叙事（Git 已保存历史）
- [x] Phase A 写成可执行细节；Phase B/C/D/E 只写目标+进入条件+退出条件
- [ ] 等待用户对 O-1～O-6 确认
- [ ] 确认后立即启动 A-0（第一次冻结）+ A-1（R1a 实现）

**本计划未授权 execute。** 写完后停下来。

> **最后一个判断**（评审原话）：r3.2 已经足以结束战略讨论。现在最大的风险不再是方案想得不够，而是继续打磨计划产生"规划完成感"，却迟迟没有一条自动化黄金闭环在 CI 中真实运行。**建议把它作为最后一个方案版本：清理、提交、冻结，然后马上启动 A-0 和 R1a。**
