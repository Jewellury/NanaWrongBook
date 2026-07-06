# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-06

## ✅ Stage 3 v3-revised Round 0-3 已完成并审计通过

### 历史回顾

Stage 3 AI 错题卡片集成 Round 0-3 全部完成，审计通过 ✅。

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib（case-analyzer.ts）+ 33 mock 单测
- Round 2：/process API（POST + GET）+ 18 集成测试
- Round 2 P1 修复：CaseKnowledgeTag 清理 + 事务包裹 + 测试数据修复
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试

详见：
- 计划 → [plan/stage3-ai-integration-plan-v3-revised.md](plan/stage3-ai-integration-plan-v3-revised.md) / [plan/stage3-revised-round3-plan.md](plan/stage3-revised-round3-plan.md)
- 审计报告 → [Round 2 复审](auditlog/stage3-revised-round2-p1-fix-reaudit.md) / [Round 3](auditlog/stage3-revised-round3-summary-audit.md)

### 当前状态

- **当前分支**: dev
- **dev 最新提交**: `ebd056a`（feat stage3-r3）
- **origin/dev**: 同步
- **main 最新提交**: 待合入

---

## ⏳ 待启动：Stage 3 Round 4 — 拍题保存后触发整理 + AI 结果卡

### 用户拍板的范围（窄范围）

**做**：
1. 拍题保存后触发 AI 整理（采集页 → /process 自动触发或手动触发）
2. 查询整理状态（轮询 /process GET）
3. 展示 AI 结果卡（采集页或汇总页展示 AI 摘要 + 课本分类 + 轻反馈）

**不做**（暂不混入）：
- 打印页
- 完整编辑课本分类
- 真实生产 smoke
- 重复题识别

### Round 4 前置约束（必须显式带入 plan）

> **TD-006（P2 架构隐患）**：手动改课本分类时，必须以 `CaseTextbookTopicTag` 为汇总页权威来源；如同步维护 `CaseAiResult.textbookTopicId`，二者必须在同一事务中更新，并设置 `textbookTopicEdited=true`，避免汇总页和 AI 卡片显示不一致。
>
> 审计来源：[Round 3 审计报告 §2.2](auditlog/stage3-revised-round3-summary-audit.md)
> BACKLOG 条目：[TD-006](BACKLOG.md)

### 启动条件

1. 用户确认启动 Round 4 → 进入 /plan
2. dev 合入 main + push origin main
3. CI 绿灯
4. 备份生产 SQLite
5. 部署到腾讯云（可选，看用户是否要先部署 Round 0-3 成果）

---

## ⚠️ 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 不调 LLM：无 AI 判分/Newman 追问/解析生成（Stage 3 进行中）
- 单主线诊断（决策 D-9 延续）
- 采集壳当前用 mock 数据，不接真实 ASR/VLM（Stage 3 接通中）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）

## 🏗️ 设计债（在册）

1. **slipFlag** — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. **/initial 废弃** — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. **light-feedback magic string `__preliminary__`** — Stage 3 接通真实 API 时处理
4. **feedback API 未校验 case 存在性** — Stage 3 接通真实 API 时处理
5. **二进制 artifact 以 Base64 内联 SQLite** — ~33% 体积开销，case 多了拖慢查询/备份
6. **TD-006 手动改课本分类写入口径统一** — Round 4 实现手动编辑课本分类时处理
