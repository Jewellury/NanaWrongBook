# 统一待办台账落地方案

> **性质**：`/plan` 阶段产出。来自 `doc/auditlog/audit-doc-backlog-governance-2026-07-05.md` 审计报告的推荐方案。
> **目标**：建立统一 backlog/技术债/残留代码台账，先不大规模重写旧文档。
> **交付**：本 plan 经用户确认后，由 execute-agent 执行。

---

## 1. 执行总览

### 1.1 改动清单

| # | 动作 | 文件 | 性质 | 风险 |
|---|------|------|------|:----:|
| 1 | **新建** | `doc/BACKLOG.md` | 新增 | 无（纯增量） |
| 2 | **更新** | `doc/INDEX.md` | 修改 | 低（+1 行索引） |
| 3 | **更新** | `doc/00_CURRENT.md` | 修改 | 低（+1 句链接） |
| 4 | 不动 | `doc/active_spec.md` | — | — |
| 5 | 不动 | `doc/DECISIONS.md` | — | — |
| 6 | 不动 | `doc/progress.md` | — | — |
| 7 | 不动 | `doc/product/` | — | — |

### 1.2 执行顺序

1. 新建 `doc/BACKLOG.md`（本标准 §2 内容）
2. 更新 `doc/INDEX.md`：在"入口与资产文件"表新增 BACKLOG.md 行（本标准 §3.1）
3. 更新 `doc/00_CURRENT.md`：在"设计债"小标题下加一句指向 BACKLOG.md（本标准 §3.2）

三步全部增量，零破坏，可独立提交。

---

## 2. BACKLOG.md 内容规格

### 2.1 文件结构

```
# 统一待办台账

> 维护者：plan-agent（新增/调整）、execute-agent（偏离记录）、audit-agent（确认关闭）
> 初始版本来源：doc/auditlog/audit-doc-backlog-governance-2026-07-05.md
> 完整待办/技术债以此文件为准。旧文档（00_CURRENT/active_spec/DECISIONS.md）中的重复条目正在逐步迁移。

---

## 活跃条目

（表格，按优先级倒排，P0 优先）

---

## 已完成/已关闭

（表格，按关闭日期倒排）
```

### 2.2 每条条目字段

| 字段 | 要求 |
|------|------|
| **ID** | 类型前缀-序号，如 `PB-001`、`TD-003`，无歧义 |
| **类型** | PB / TD / CR / OD / UX / RS / DP，七类之一 |
| **标题** | 一句话描述，动词开头（"实现…""迁移…""调研…"） |
| **背景/来源** | 为什么有这条，在哪个场景/哪个文档发现 |
| **状态** | `open` / `in-progress` / `blocked` / `closed` / `cancelled` |
| **优先级** | P0（阻塞/即将触发）/ P1（重要）/ P2（想做）/ P3（备选） |
| **阻塞/依赖** | 依赖哪些条目或外部条件（可空） |
| **触发条件** | TD/OD 类必填。如 "case > 100 或 dev.db > 50MB" |
| **关闭条件** | 什么样算做完。**必须可验证**（而非"做完再说"） |
| **关联文档/commit** | 计划/执行/审计/commit 引用（可空，逐步填充） |
| **首次记录时间** | YYYY-MM-DD |

### 2.3 七类前缀

| 前缀 | 全称 | 示例 |
|------|------|------|
| PB | Product Backlog | 后续产品功能 |
| TD | Tech Debt | 当前实现方案的技术代价 |
| CR | Code Remnant | 方案切换后的残留代码 |
| OD | Ops Debt | 部署/CI/环境/数据清理 |
| UX | UX Follow-up | 体验打磨项 |
| RS | Research/Spike | 先调研验证的事项 |
| DP | Decision Pending | 需用户拍板的开放决策 |

### 2.4 26 条初始条目来源映射

**Product Backlog (PB-001 ~ PB-011)**：
- PB-001 ~ PB-005、PB-010、PB-011：`product/nana-product-behavior-manual-v1.md` §10 "v1 不做的能力"
- PB-006：`product/nana-product-behavior-manual-v1.md` §13.8 推演结论表
- PB-007：`product/nana-user-manual-v1-draft.md` Q&A「未分类/暂未覆盖」
- PB-008、PB-009：`plan/capture-to-diagnosis-closed-loop-redesign.md` §暂缓的结论

**Tech Debt (TD-001 ~ TD-005)**：
- TD-001、TD-002：`doc/00_CURRENT.md` 设计债 #1、#2；`DECISIONS.md` TD-1、TD-2
- TD-003：`doc/00_CURRENT.md` 设计债 #3（base64 artifact）
- TD-004：`DECISIONS.md` TD-3（magic string）
- TD-005：`DECISIONS.md` TD-4（feedback 校验）

**Code Remnant (CR-001 ~ CR-003)**：
- CR-001：`DECISIONS.md` TD-5；`product/nana-product-behavior-manual-v1.md` §11（asr-transcribe/vlm-classify + 对应测试）
- CR-002：`executionlog/nana-phase1-execution-log.md` 偏离记录（vlm-handheld-test.ts 类型错误）
- CR-003：`executionlog/stage3-revised-round0-schema-log.md`（游离 DB 外部残留）

**Ops Debt (OD-001 ~ OD-006)**：
- OD-001：`doc/00_CURRENT.md` 设计债 #5；`doc/spec/ops-feedback-loop-backlog.md` §五
- OD-002：`doc/00_CURRENT.md` 设计债 #4（游离 DB）
- OD-003：`plan/mobile-automation-test-plan.md`（E2E 补路径）
- OD-004：`doc/progress.md` 容器分层；`DECISIONS.md` 开放项（上游测试隔离）
- OD-005：`plan/volcengine-vision-integration-plan.md`（生产 env 配置）
- OD-006：`plan/docker-test-gate-ci-migration-plan.md`（本地 Docker 不可用的记录义务）

**UX Follow-up (UX-001 ~ UX-003)**：
- UX-001：`product/nana-user-manual-v1-draft.md` Q&A
- UX-002：`product/nana-product-behavior-manual-v1.md` §13.8
- UX-003：`active_spec.md` 待选方向

**Research/Spike (RS-001 ~ RS-002)**：
- RS-001：`product/nana-product-behavior-manual-v1.md` §13.8 "OCR v2 候选"
- RS-002：`product/` "v1 不做清单" 重复题识别

**Decision Pending (DP-001 ~ DP-002)**：
- DP-001：`DECISIONS.md` 开放项 M3b vs M4
- DP-002：`plan/stage3-ai-integration-plan-v3-revised.md`（processingStatus timeout 语义）

### 2.5 已排除事项说明

以下 audit 报告草案中提及但**不登记**的条目：

| 条目 | 排除理由 |
|------|---------|
| `submit-answers/route.ts` pre-existing 类型错误修复 | 已在第 1 阶段执行中顺手修复，非开放问题 |
| `npx tsc --noEmit` 报测试文件类型错误 | 测试文件依赖 vitest globals，非生产代码问题 |
| CI 迁移后本地 Docker 不可用 | OD-006 已覆盖"记录义务"，具体不可用本身是环境问题而非债务 |

### 2.6 Stage 3 v2 残留的 CR 条目详细设计

**CR-001** 的登记内容：

| 字段 | 值 |
|------|-----|
| ID | CR-001 |
| 类型 | Code Remnant |
| 标题 | 清理 Stage 3 v2 废弃代码（asr-transcribe.ts / vlm-classify.ts / 对应测试） |
| 背景 | v2 双管线方案（独立 ASR + 独立 VLM）被 v3-revised 一体化 case-analyzer.ts 替代。asr-transcribe.ts 和 vlm-classify.ts 是 v2 半成品，当前加 `@deprecated` 保留，禁止新代码 import |
| 涉及文件 | `src/lib/nana/asr-transcribe.ts`、`src/lib/nana/vlm-classify.ts`、`src/__tests__/unit/nana/asr-transcribe.test.ts`、`scripts/stage3-asr-format-check.ts`（参考保留） |
| 状态 | open |
| 优先级 | P2 |
| 阻塞/依赖 | 依赖 v3 case-analyzer.ts + /process API 稳定运行 |
| 触发条件 | — |
| 关闭条件 | v3 case-analyzer + /process 稳定运行无回归后，一次性删除废弃 lib + 对应测试。不移动到 `_deprecated/` 目录 |
| 关联文档 | DECISIONS.md TD-5、product/nana-product-behavior-manual-v1.md §11 |
| 首次记录 | 2026-07-05 |

---

## 3. 旧文档更新范围

### 3.1 doc/INDEX.md

在"入口与资产文件"表（INDEX.md 约第 24-38 行）新增一行：

```
| 🔥 | [BACKLOG.md](BACKLOG.md) | **统一待办台账**：Product Backlog / Tech Debt / Code Remnant / Ops Debt / UX Follow-up / Research/Spike / Decision Pending |
```

放在 00_CURRENT.md 之后、DECISIONS.md 之前，按阅读优先级排序。

### 3.2 doc/00_CURRENT.md

两处修改（纯增量，不删旧内容）：

**位置 A**：开头"文档优先级"列表（第 3-5 行）后追加：

> 完整待办/技术债台账 → [BACKLOG.md](BACKLOG.md)

**位置 B**："设计债"小标题（第 129 行 `## 设计债（在册，待后续轮次处理）`）下第一句改为：

> **统一待办/技术债台账已迁移至 [BACKLOG.md](BACKLOG.md)。以下条目为迁移前旧记录，仍有效但以 BACKLOG.md 为准。**

### 3.3 不动文件列表

| 文件 | 不动理由 |
|------|---------|
| `doc/active_spec.md` | 当前轮任务详情，与 BACKLOG 职责不同。未来治理轮再移除其"设计债"段落 |
| `doc/DECISIONS.md` | 决策台账，TD-1~5 是"已裁决的决策"而非待办，保留。开放项中非决策部分（上游测试隔离）待迁移 |
| `doc/progress.md` | 纯历史叙事，无待办 |
| `doc/product/` | 用户手册需独立可读性，标注关联 ID 在未来轮做 |
| `doc/agents/` | 无关 |

### 3.4 未来减负路线（非本轮）

```
当前状态                                   目标状态
───────                                   ───────
00_CURRENT.md 超载（8 职责）              00_CURRENT.md 精简为纯状态 + 下一步
active_spec.md 含设计债                    active_spec.md 只含当前轮任务
DECISIONS.md 开放项混杂非决策               DECISIONS.md 仅含已裁决决策
                                            ← BACKLOG.md 统一承担待办职能
```

减负不在本轮范围，仅标注方向。

---

## 4. BACKLOG 维护规则

### 4.1 plan 阶段
- 开始 `/plan` 时：打开 BACKLOG.md 查看 open 条目，决定本轮处理哪些
- 选中条目 → 状态改为 `in-progress`，注明关联 plan 文件
- 新发现的产品功能/债务/残留 → 新增 open 条目
- 调整优先级或状态

### 4.2 execute 阶段
- 实际偏离计划时：在 executionlog 中记录偏离
- 如果发现新的残留代码或技术债：新增 CR/TD 条目
- 执行日志末尾注明"本轮新增 BACKLOG 条目：XXX-XXX"

### 4.3 audit 阶段
- 审计报告中增加检查项：`[ ] 所有新发现的 follow-up 是否已入 BACKLOG.md`
- 确认已完成的条目：验证关闭条件 → 标记 `closed` + 写关闭证据
- 发现遗漏 → 新增条目
- 检查旧文档中的重复条目是否可移除外链

### 4.4 条目生命周期

```
[发现] → open → in-progress → closed
                     ↓
                blocked（标记阻塞原因）
                     ↓
                unblocked → in-progress
             
open → cancelled（明确决定不做或已过时）
```

### 4.5 更新纪律

- **plan 阶段**：每轮必看 BACKLOG.md
- **audit 阶段**：每轮必检查是否需要更新
- **高频**：发现新 item 随时追加（不限阶段）
- **每 3-5 轮**：整体 review 所有 open 条目，标记过时或已自动解决的

---

## 5. 条目编号规则

- 每个类型独立序号池：PB-001、PB-002、…；TD-001、TD-002、…
- 序号仅递增，不重用（已关闭的编号永久保留，新条目用下一个序号）
- 初始分配：11 PB + 5 TD + 3 CR + 6 OD + 3 UX + 2 RS + 2 DP = 32 个序号（PB-001~011、TD-001~005、CR-001~003、OD-001~006、UX-001~003、RS-001~002、DP-001~002）
- 已关闭条目移到"已完成/已关闭"区，ID 不变

---

## 6. 验收标准

- [ ] `doc/BACKLOG.md` 已创建，包含 26 条初始条目，格式符合 §2 规格
- [ ] 七类前缀均有至少 1 条示例
- [ ] CR-001 明确列出涉及文件（asr-transcribe.ts / vlm-classify.ts / 对应测试）
- [ ] 已修复的 build blocker 未登记
- [ ] `doc/INDEX.md` 已加入 BACKLOG.md 行，状态为 🔥
- [ ] `doc/00_CURRENT.md` 已追加指向 BACKLOG.md 的链接（§设计债 + 文档优先级）
- [ ] 旧文档中的重复条目未删除，仅标注"以 BACKLOG.md 为准"
- [ ] `doc/BACKLOG.md` 末尾写明了 plan/execute/audit 的维护规则

---

> 本 plan 由 execute-agent 依据 `doc/auditlog/audit-doc-backlog-governance-2026-07-05.md` 审计报告产出。
> 建议经用户确认后，由 execute-agent 按 §1.2 三步顺序执行。
