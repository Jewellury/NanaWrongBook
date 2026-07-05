# 文档体系盘点报告：功能管理 / 技术债 / 残留代码 / 后续功能

> **性质**：文档治理审计（只调研和推荐，不改代码、不移动文档、不创建新文档）
> **调研日期**：2026-07-05
> **方法论**：通读 `doc/` 下所有核心入口 + 按关键词搜索 34+ 个 auditlog、21 个 executionlog、40 个 plan、41 个 reference 文件
> **建议放置**：`doc/auditlog/` — 这是对现有文档体系的审计评估，不是新计划。后续 `/plan` 轮可基于本报告产出具体实施方案。

---

## 1. 现状盘点

### 1.1 当前有哪些管理入口

| 管理类别 | 文件 | 内容类型 | 评分 |
|---------|------|---------|:--:|
| **当前状态** | `doc/00_CURRENT.md` | 全景六线 + 活跃任务 + 设计债(6条) + 已知限制(3条) + 后续阶段候选(5个) | ⚠️ 职责混合 |
| **当前轮任务** | `doc/active_spec.md` | 本轮完成内容 + 待选方向(4个) + 已知限制(5条) + 设计债(5条) | ⚠️ 与 00_CURRENT 重叠 |
| **历史进度** | `doc/progress.md` | 每轮叙事（只增不减，10 轮记录） | ✅ 清晰 |
| **技术决策** | `doc/DECISIONS.md` | D 系列(15条) + 门禁(4条) + TD 设计债(5条) + 开放项(7条) | ✅ 清晰但 TD 与 00_CURRENT 重叠 |
| **文档索引** | `doc/INDEX.md` | 全部文档清单 + 状态 emoji + 一句话说明 | ✅ 清晰 |
| **产品功能明确"不做"** | `doc/product/nana-product-behavior-manual-v1.md` §10 | "v1 不做的能力" 11 项 | ✅ 但分散 |
| **产品功能明确"不做"** | `doc/product/nana-user-manual-v1-draft.md` §"v1 不做的能力" | 8 项（面向用户版） | ✅ 但分散 |
| **运维反馈闭环** | `doc/spec/ops-feedback-loop-backlog.md` | 运营回路信号定义 + 自动化 smoke check | ✅ 独立 |
| **采集层设计** | `doc/spec/capture-layer-design-backlog.md` | 五条交互模式 + 未来轮设计输入 | ✅ 独立 |
| **v2 遗留文件标注** | `doc/product/nana-product-behavior-manual-v1.md` §11 | 6 个文件的废弃/复用标注 | ✅ 但只有一个文件覆盖 |
| **总纲"不做什么"** | `doc/plan/nana-master-plan.md` §5.1 | 核心约束五原则 + 暂缓项 | ⚠️ 概括性，缺细节 |
| **产品决策待确认** | `doc/product/nana-product-behavior-manual-v1.md` §13.8 | 19 项"推演结论与待确认项" | ✅ 最后一列的"待确认"已全部标 ✅ |

### 1.2 设计债的三处分散记录

同样的技术债在三份文件中重复记录：

| 条目 | 00_CURRENT 设计债 | active_spec 设计债 | DECISIONS TD |
|------|:---:|:---:|:---:|
| slipFlag → slipCount | #1 ✅ | #1 ✅ | TD-1 ✅ |
| /initial 废弃 | #2 ✅ | #2 ✅ | TD-2 ✅ |
| base64 artifact 迁移 | #3 ✅ | #5 ✅ | — |
| 游离 DB | #4 ✅ | — | — |
| 部署后 smoke check | #5 ✅ | — | — |
| Stage 3 v2 残留(TD-5) | #6 ✅ | — | TD-5 ✅ |
| light-feedback magic string | — | #3 ✅ | TD-3 ✅ |
| feedback API 未校验 case | — | #4 ✅ | TD-4 ✅ |

→ 6 条债，3 个入口，各有遗漏或重复。审计时需对照三个文件才能拿到完整清单。

### 1.3 散落在执行/审计日志里的 follow-up

按关键词搜索发现的散落条目（举例）：

| 来源文件 | 条目 | 目前归宿 |
|---------|------|---------|
| `executionlog/stage3-revised-round0-schema-log.md` | 游离 DB 外部残留 `E:\app\data\dev.db` 含 4 张空表 | 设计债 #4 登记但"外部残留"未跟进 |
| `executionlog/nana-phase1-execution-log.md` | build blocker: `scripts/vlm-handheld-test.ts` 类型错误 | 无登记，只是"已有问题"备注 |
| `auditlog/nana-phase1-execution-audit.md` | `submit-answers/route.ts` pre-existing 类型错误修复 | 无登记（已修复，但说明存在未追踪的 pre-existing 类型问题） |
| `plan/mobile-automation-test-plan.md` | E2E 补"最近拍过入口按钮"路径 | 无统一登记 |
| `executionlog/nana-phase3-execution-log.md` | `npx tsc --noEmit` 报测试文件类型错误 | 无登记 |
| `plan/stage3-ai-integration-plan-v3-revised.md` | `processingStatus` 的 `pending` 状态语义 — timeout 不写库 | 无登记 |
| `plan/textbook-topic-mapping-plan.md` | TextbookTopic 覆盖范围扩展（当前 16 章节非完整） | 无统一登记 |
| `product/nana-product-behavior-manual-v1.md` | 打印页简洁版/带题图版切换 | 无登记 |
| `plan/docker-test-gate-ci-migration-plan.md` | CI 迁移后本地 Docker 不可用的记录义务 | 无登记 |

---

## 2. 缺口判断

### 2.1 是否已有统一的技术债台账？
**❌ 没有。** 00_CURRENT.md 列了 6 条，active_spec.md 列了 5 条，DECISIONS.md 列了 5 条 TD。三者重叠但不一致。缺少：
- 优先级（P0/P1/P2/P3）
- 触发条件（什么时候该处理）
- 关闭条件（什么时候算做完）
- 关联文档索引

### 2.2 是否已有统一的功能 backlog？
**❌ 没有。** 5 阶段计划（nana-development-phases.md）描述了"下一轮做什么"，但缺少"当前不做但明确记录"的停车场。`product/` 下的"v1 不做"清单只是静态列表，不是可追踪的 backlog。

### 2.3 是否已有"本阶段不做 / 下一阶段做"的产品功能管理表？
**⚠️ 部分有。** `product/nana-product-behavior-manual-v1.md` §10 有 11 项"v1 不做"列表，`product/nana-user-manual-v1-draft.md` 有 8 项。但两者都是纯文本列表，没有：状态、优先级、重评估时机、依赖关系、关联记录。

### 2.4 是否已有残留代码管理入口？
**⚠️ 极微弱。** DECISIONS.md TD-5 和 `product/nana-product-behavior-manual-v1.md` §11 是仅有的两处。没有统一目录或搜索索引标记遗留文件。

### 2.5 doc/00_CURRENT.md、DECISIONS.md、progress.md、active_spec.md 之间职责是否清晰？

| 对比 | 结论 |
|------|------|
| progress.md vs 其他 | ✅ 清晰。纯历史叙事，不写当前状态 |
| 00_CURRENT vs active_spec | ⚠️ **重叠严重**。两者都写已知限制、都写设计债、都写"当前活跃任务"。`active_spec.md` 本质是 00_CURRENT 的子集+当前轮细节。 |
| 00_CURRENT vs DECISIONS | ⚠️ **设计债重复**。00_CURRENT 的 6 条设计债与 DECISIONS 的 5 条 TD 不完全重合。 |
| DECISIONS 末尾"开放项" vs 00_CURRENT "设计债" | ⚠️ 开放项中一半就是 TD，另一半是优先级决策（M3b vs M4）、上游测试隔离等，类型混杂。 |

**核心问题**：00_CURRENT.md 承载了太多职责（全景 + 活跃任务 + 修复记录 + 已知限制 + 设计债 + 文档治理 + 下一步 + Handoff + Do Not Reopen），变成了"什么都有"的大杂烩。

---

## 3. 分类建议

建议将"待管理事项"分为以下七类，用不同前缀区分：

| 类别 | 前缀 | 定义 | 举例 |
|------|------|------|------|
| **Product Backlog** | PB | 后续产品功能，有明确的用户价值 | OCR v2、重复题识别、完整解题 |
| **Tech Debt** | TD | 当前实现方案的技术代价，需改造 | base64 artifact 迁移、slipCount |
| **Code Remnant** | CR | 方案切换后遗留的半成品/废弃代码 | asr-transcribe.ts、vlm-classify.ts |
| **Ops Debt** | OD | 部署/CI/环境/数据清理类债务 | 游离 DB、smoke check 自动化 |
| **UX Follow-up** | UX | 体验打磨项，非功能缺失 | 按钮反馈、空状态文案、加载态 |
| **Research/Spike** | RS | 需要先调研验证才能决策的事项 | OCR v2 可行性、重复题相似度算法 |
| **Decision Pending** | DP | 需要用户拍板的开放决策 | 缩略图尺寸选项、打印版简洁程度 |

---

## 4. 台账方案

### 4.1 推荐：新建 `doc/BACKLOG.md`，不混入现有文件

**理由**：
1. 00_CURRENT.md 已超载（194 行，承载 8 种职责），再加统一台账会彻底膨胀
2. DECISIONS.md 是"决策台账"不是"待办台账"——决策是已裁决的，待办是未裁决的，职责不同
3. progress.md 是只增不减的历史，不是管理表
4. 独立文件使得 `/plan` 阶段可以直接引用 backlog，不依赖 00_CURRENT 的当前状态
5. 遵循已有 doc-governance-proposal.md 的"硬边界规则"——同一句话不出现两次

### 4.2 格式建议

```
# 统一待办台账

> 维护者：plan-agent（新增/调整）、execute-agent（偏离记录）、audit-agent（确认关闭）
> 跟新规则：见 doc/00_CURRENT.md §文档治理
> 初始版本来源：doc/auditlog/audit-doc-backlog-governance-2026-07-05.md

---

## 活跃条目（未关闭）

| ID | 类型 | 标题 | 优先级 | 状态 | 来源 | 首次记录 | 阻塞 | 关闭条件 |
|----|------|------|:------:|:----:|------|---------|:----:|---------|

---

## 已完成/已关闭

| ID | 类型 | 标题 | 关闭日期 | 关闭证据 |
|----|------|------|:-------:|---------|
```

### 4.3 每条记录字段规范

| 字段 | 必填 | 说明 |
|------|:----:|------|
| **ID** | ✅ | 类型前缀 + 序号，如 `PB-001`、`TD-003` |
| **类型** | ✅ | 七类之一：PB / TD / CR / OD / UX / RS / DP |
| **标题** | ✅ | 一句话描述 |
| **背景** | ✅ | 为什么有这条、在哪个场景发现 |
| **当前状态** | ✅ | open / in-progress / blocked / closed / cancelled |
| **优先级** | ✅ | P0(阻塞) / P1(重要) / P2(想做) / P3(备选) |
| **阻塞关系** | 按需 | 依赖哪些其他条目或外部条件 |
| **触发条件** | TD/OD 类必填 | 什么时候触发处理（如 "case > 100 或 dev.db > 50MB"） |
| **来源** | ✅ | 哪个文件/哪轮审计/哪次事故 |
| **首次记录时间** | ✅ | YYYY-MM-DD |
| **关联文档** | 按需 | 计划/执行/审计文档路径 |
| **关闭条件** | 推荐 | 什么样算做完、验收标准 |

### 4.4 与现有文件的关系

```
00_CURRENT.md     ← 当前状态 + 下一步（不留待办清单）
DECISIONS.md      ← 已裁决的决策（不留 open 状态待办）
BACKLOG.md        ← 所有待办的统一入口（新增）
  ↑
active_spec.md    ← 当前轮在做的事（引用 BACKLOG.md 中的条目 ID）
progress.md       ← 完成后的历史记录（引用 BACKLOG.md 中的条目 ID）
executionlog/     ← 执行过程中发现的偏离（记入 BACKLOG.md）
auditlog/         ← 审计发现的 follow-up（记入 BACKLOG.md）
```

---

## 5. 初始条目草案

以下从现有文档中提取的初始 backlog 条目，按类型分组。每条给出了 ID 草案、来源和关闭条件。

### 5.1 Product Backlog (PB)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 关闭条件 |
|----|------|------|:------:|:--------:|---------|
| PB-001 | OCR v2 Spike — AI 题面文本完整识别 | `product/nana-product-behavior-manual-v1.md` §10、"v1 不做清单" | P2 | open | Spike 完成 + 决策是否进入路线图 |
| PB-002 | 图片裁剪/旋转/涂抹 | `product/nana-product-behavior-manual-v1.md` §10、"v1 不做清单" | P2 | open | 用户确认是否在 v1 范围内 |
| PB-003 | 疑似重复题识别 | `product/nana-product-behavior-manual-v1.md` §10、"v1 不做清单" | P2 | open | 可用的相似度算法验证 + UI 方案 |
| PB-004 | 完整解题步骤/答案 | `product/nana-product-behavior-manual-v1.md` §10、"v1 不做清单" | P2（但前提需 D-8 解除） | open | LLM 调用启用 + 明确"不给答案"边界 |
| PB-005 | 音频逐句时间轴 | `product/nana-product-behavior-manual-v1.md` §10、§v2 待办 | P2 | open | 数据结构扩展 + 后端 ASR 接通（Stage 5 范围内） |
| PB-006 | 打印页简洁版/带题图版切换 | `product/nana-product-behavior-manual-v1.md` §13.8 | P3 | open | 用户确认是否需要 |
| PB-007 | TextbookTopic 覆盖范围扩展（当前仅 16 章节） | `product/nana-user-manual-v1-draft.md` Q&A、"未分类/暂未覆盖"提示 | P2 | open | 教研工单完成，覆盖扩展 |
| PB-008 | 方法族地图前台化 | `plan/capture-to-diagnosis-closed-loop-redesign.md` §暂缓的结论 | P3 | open | 内部标签积累 + 教师一致性验证通过 |
| PB-009 | FSRS 自适应复习排程 | `plan/capture-to-diagnosis-closed-loop-redesign.md` §暂缓的结论 | P3 | open | 诊断→补救→复诊闭环稳定后 |
| PB-010 | PDF 直接导出 | `product/nana-product-behavior-manual-v1.md` §10、"v1 不做清单" | P3 | open | 用户提需求 |
| PB-011 | Problem/Attempt 模型 | `product/nana-product-behavior-manual-v1.md` §10、"v1 不做清单" | P3 | open | 1 Case = 1 拍题模式不够用时再评估 |

### 5.2 Tech Debt (TD)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 触发条件/关闭条件 |
|----|------|------|:------:|:--------:|-------------------|
| TD-001 | slipFlag → slipCount 字段迁移 | 00_CURRENT 设计债 #1、DECISIONS TD-1 | P2 | open | M4 一并处理；需新字段 + 迁移已有 slipFlag 数据 |
| TD-002 | /initial 一步式废弃 | 00_CURRENT 设计债 #2、DECISIONS TD-2 | P2 | open | submit-answers 路径稳定后废弃 |
| TD-003 | base64 artifact 迁移到对象存储 | 00_CURRENT 设计债 #3 | P1 | open | **触发**：case > 100 或 dev.db > 50MB（先到先触发）；**关闭**：迁移方案实施完成 |
| TD-004 | light-feedback magic string `__preliminary__` | DECISIONS TD-3 | P3 | open | Stage 3 接通真实 API 时传入真实 caseId |
| TD-005 | feedback API 未校验 case 存在性 | DECISIONS TD-4 | P3 | open | Stage 5 加 prisma.case.findUnique，不存在返回 404 |

### 5.3 Code Remnant (CR)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 关闭条件 |
|----|------|------|:------:|:--------:|---------|
| CR-001 | Stage 3 v2 asr-transcribe.ts / vlm-classify.ts 残留 | DECISIONS TD-5、product manual §11 | P2 | open（已加 @deprecated） | v3 case-analyzer + /process 稳定后一次性删除废弃 lib + 对应测试 |
| CR-002 | scripts/vlm-handheld-test.ts 类型错误阻塞 build | nana-phase1-execution-log 偏离记录 | P2 | open（已知问题，非本轮变更引入） | 修复类型错误或废弃该脚本 |
| CR-003 | 游离 DB 外部残留 `E:\app\data\dev.db`（含 4 张空表） | stage3-revised-round0-schema-log.md | P3 | open（暂不删除，待用户确认） | 用户确认清理 + 执行清理 |

### 5.4 Ops Debt (OD)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 关闭条件 |
|----|------|------|:------:|:--------:|---------|
| OD-001 | 部署后 KnowledgeNode smoke check 自动化 | 00_CURRENT 设计债 #5、ops-feedback-loop-backlog §五 | P1 | open | 实现 scripts/post-deploy-smoke-check.ts + 集成到部署流程 |
| OD-002 | `.env` DATABASE_URL 游离 DB 问题 | 00_CURRENT 设计债 #4 | P2 | open | 配置治理统一（本地开发显式设 DATABASE_URL 或统一配置方案） |
| OD-003 | E2E 补"最近拍过入口按钮"路径 | mobile-automation-test-plan.md | P2 | open | E2E 测试覆盖该路径 |
| OD-004 | 上游 5 个测试在 `.env.test` 下失败 | progress.md、DECISIONS 开放项 | P2 | open | 开独立计划 upstream-test-env-isolation 处理 |
| OD-005 | 生产 Volcengine env 配置（VOLCENGINE_API_KEY + VOLCENGINE_BASE_URL） | volcengine-vision-integration-plan.md | P1 | open（Stage 5 前置条件） | 生产环境变量配置完成 + 验证 |
| OD-006 | CI 迁移后本地 Docker 不可用的记录义务 | docker-test-gate-ci-migration-plan.md | P3 | open | 执行日志守则已追加，持续执行 |

### 5.5 UX Follow-up (UX)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 关闭条件 |
|----|------|------|:------:|:--------:|---------|
| UX-001 | 未分类/暂未覆盖题目的温和提示文案定稿 | product/nana-user-manual-v1-draft.md Q&A | P2 | open | 产品行为手册更新覆盖此文案 |
| UX-002 | 题图缩略图打印版尺寸规范 | product/nana-product-behavior-manual-v1.md §13.8 | P3 | open（已有尺寸 `max-width:180px`） | 打印页实际验证 |
| UX-003 | P3 建议：catch 块加 abortedRef 检查 | active_spec.md 待选方向 | P3 | open | 非阻塞，随手修 |

### 5.6 Research/Spike (RS)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 关闭条件 |
|----|------|------|:------:|:--------:|---------|
| RS-001 | OCR v2 可行性 Spike | product/nana-product-behavior-manual-v1.md §13.8 | P2 | open | Spike 完成 + 报告 + 决策 |
| RS-002 | 重复题相似度算法调研 | product/ "v1 不做清单" | P3 | open | 调研完成 + 是否纳入路线图 |

### 5.7 Decision Pending (DP)

| ID | 标题 | 来源 | 优先级 | 当前状态 | 关闭条件 |
|----|------|------|:------:|:--------:|---------|
| DP-001 | M3b vs M4 优先级：下一轮先做哪个 | DECISIONS 开放项 | P1 | open | 用户拍板 |
| DP-002 | CaseAiResult processingStatus 中 "pending" 状态语义 — timeout 是否写库 | stage3-ai-integration-plan-v3-revised.md | P2 | open | 确认 timeout 处理策略（当前：前端判定不写库） |

---

## 6. 文档治理建议

### 6.1 现有文件调整建议（只改内容，不移动文件）

| 文件 | 建议调整 |
|------|---------|
| `doc/00_CURRENT.md` | 移除 §设计债（迁移到 BACKLOG.md）、移除 §已知限制（保留在 active_spec.md 即可）、简化"活跃任务"段为引用 active_spec.md |
| `doc/active_spec.md` | 移除 §设计债（迁移到 BACKLOG.md）、移除 §已知限制（如果 BACKLOG 建立后对已知限制有更好的归宿） |
| `doc/DECISIONS.md` | 保留 TD-1~5 不变（它们是"已裁决的决策"），开放项中非决策类（如上游测试隔离）迁移到 BACKLOG.md |
| `doc/product/nana-product-behavior-manual-v1.md` §10 "v1 不做" | 保留不变（用户手册需独立可读），但每条加注 BACKLOG.md 中的对应 ID |
| `doc/progress.md` | 不变——历史已经发生 |

### 6.2 每轮三代理如何更新 BACKLOG

#### plan 阶段
- 从 BACKLOG.md 中选取本轮处理的条目（标记 `in-progress`）
- 新增条目（发现新的 PB/TD/CR/OD/UX/RS/DP）
- 调整优先级或状态（如某条目从 P2 升为 P1）
- 设计债 → 转入 TD 类

#### execute 阶段
- 实际偏离计划时，在 executionlog 中记录偏离
- 如果发现新的残留代码或技术债，新增 CR/TD 条目
- 在执行日志末尾注明"本轮新增 BACKLOG 条目：XXX"

#### audit 阶段
- 审计报告中增加检查项："所有新发现的 follow-up 是否已入 BACKLOG.md"
- 确认已完成的条目：验证关闭条件 → 标记 `closed` + 写关闭证据
- 发现遗漏的债务/残留/待办 → 新增条目

#### 完成阶段
- 关闭的条目从"活跃"区移动到"已完成/已关闭"区
- 在 progress.md 中记录完成情况时引用 BACKLOG 条目 ID

### 6.3 更新频率

- **plan 阶段**：每轮必看 BACKLOG.md，决定本轮做什么
- **audit 阶段**：每轮必检查 BACKLOG.md 是否需要更新
- **execute 阶段**：发现偏离/新债务时立即追加
- **至少每 3 轮**：整体 review 所有 open 条目，标记过时或已自动解决的

### 6.4 与已有 doc-governance-proposal.md 的关系

`doc/reference/doc-governance-proposal.md`（2026-06-19，待用户确认）已提出入口层 + 硬边界规则。本报告是其自然延伸——在入口层体系稳定后，补上"待办管理"这一缺失职能。

---

## 7. 注意事项

1. **本报告未创建任何新文件**。BACKLOG.md 的创建需用户确认后由 `/plan` 执行。
2. **本报告未移动任何旧文件**。所有建议均基于增量修改。
3. **本报告未修改既有文档内容**。所有建议都标注了"建议"而非行动。
4. 00_CURRENT.md 中的 6 条设计债在 BACKLOG 创建后应迁移过去，但建议等用户确认 BACKLOG 方案后再操作。
5. 本报告的初始条目共 **26 条**（PB:11 / TD:5 / CR:3 / OD:6 / UX:3 / RS:2 / DP:2）。这不应一次性全部转为 open，建议由 plan-agent 在 `/plan` 中分批治理。

---

> 本报告由 execute-agent 调研产出，未经 audit-agent 审计。建议 `/audit` 确认后再开 `/plan` 落实。
