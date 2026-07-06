# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-06

## ✅ Stage 3 v3-revised Round 0-4 已完成

### v1 闭环已成型

Round 4 审计完成（⚠️ 有条件通过），v1 最小 AI 闭环已成型：
**拍题 → 保存 → AI 整理 → 卡片反馈 → 汇总页可见**

### 历史回顾

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib（case-analyzer.ts）+ 33 mock 单测
- Round 2：/process API（POST + GET）+ 18 集成测试
- Round 2 P1 修复：CaseKnowledgeTag 清理 + 事务包裹 + 测试数据修复
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
- Round 4：拍题触发整理 + 轮询状态 + AI 结果卡 + 10 集成测试

详见：
- 计划 → [Round 4](plan/stage3-revised-round4-process-trigger-plan.md)
- 审计报告 → [Round 4](auditlog/stage3-revised-round4-process-trigger-audit.md)

### 当前状态

- **当前分支**: dev
- **dev 最新提交**: `55bb7c4`（feat stage3-r4）
- **origin/dev**: 同步
- **main 最新提交**: 待合入

### Round 4 审计结论

**⚠️ 有条件通过**：1 个 P1 + 4 个 P2

- **P1（接真实 LLM 前必须修）**：竞态条件——快速连拍两道题时前一道 AI 结果可能覆盖后一道状态
- **P2-a**：POST 请求无 AbortController
- **P2-b**：测试缺"再拍一道重置"用例
- **P2-c**：API 返回 undefined 但类型声明 null
- **P2-d**：计划 §6.5 描述不准确

---

## ⏳ 下一步可选方向

1. **修复 P1 竞态条件**（接真实 LLM 前必做）
2. **真实生产 smoke**（配 VOLCENGINE_API_KEY 跑真实 AI）
3. **dev 合入 main + 部署**（v1 闭环已成型，可考虑部署）
4. **打印页**（错题打印 PDF）
5. **手动编辑课本分类**（需处理 TD-006）

---

## ⚠️ 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 当前 case-analyzer.ts 需 VOLCENGINE_API_KEY，无 mock 模式
- 单主线诊断（决策 D-9 延续）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）
- P1 竞态条件：快速连拍时前一道 AI 结果可能覆盖后一道状态（接真实 LLM 前必须修）

## 🏗️ 设计债（在册）

1. **slipFlag** — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. **/initial 废弃** — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. **light-feedback magic string `__preliminary__`** — Stage 3 接通真实 API 时处理
4. **feedback API 未校验 case 存在性** — Stage 3 接通真实 API 时处理
5. **二进制 artifact 以 Base64 内联 SQLite** — ~33% 体积开销，case 多了拖慢查询/备份
6. **TD-006 手动改课本分类写入口径统一** — 实现手动编辑课本分类时处理
7. **P1 竞态条件** — handleSave/handleRetryProcess 中 triggerCaseProcess 无 caseId 一致性检查（接真实 LLM 前修）
