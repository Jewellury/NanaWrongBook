# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-06

## ✅ Stage 3 v3-revised Round 0-2 已完成并审计通过

### 本轮完成内容

Stage 3 AI 错题卡片集成 Round 0-2 全部完成，审计复审通过 ✅。

**回顾**：
- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib（case-analyzer.ts）+ 33 mock 单测
- Round 2：/process API（POST + GET）+ 18 集成测试
- Round 2 P1 修复：CaseKnowledgeTag 清理 + 事务包裹 + 测试数据修复
- 审计：初审 ❌ 3 P1 → 修复 → 复审 ✅ 通过

| Commit | 说明 |
|--------|------|
| `e5628ef` | feat stage3-r0: 4 new tables schema + migration + seed |
| `7c93cfd` | feat Stage3 v3-revised Round 1 case-analyzer.ts + 33 mock 单测 |
| `848ea22` | feat Stage3 v3-revised Round 2 /process API + 14 集成测试 |
| `81d8a4a` | fix Round 2 P1：POST 响应返回持久化数据，清理旧 vlm 标签 |
| `2f0f26c` | fix stage3-r2: 清理旧 vlm 标签并用事务保护 process 持久化 |
| `7dd6aff` | docs: 记录 Round 2 P1 修复结果和文件编辑经验教训 |

详见：
- 计划 → [plan/stage3-ai-integration-plan-v3-revised.md](plan/stage3-ai-integration-plan-v3-revised.md)
- 执行日志 → [executionlog/stage3-revised-round0-schema-log.md](executionlog/stage3-revised-round0-schema-log.md) / [round1](executionlog/stage3-revised-round1-case-analyzer-log.md) / [round2](executionlog/stage3-revised-round2-process-api-log.md)
- 审计报告 → [初审](auditlog/stage3-revised-round2-p1-fix-audit.md) / [复审](auditlog/stage3-revised-round2-p1-fix-reaudit.md)

### 当前状态

- **当前分支**: dev
- **dev 最新提交**: `659e0e7`
- **origin/dev**: 同步
- **main 最新提交**: 待合入

### 下一步

1. Stage 3 Round 3（待用户拍板是否启动）：题目汇总 API + 视图，或 ai-result 纠错端点
2. dev 合入 main + push origin main
3. CI 绿灯
4. 备份生产 SQLite
5. 部署到腾讯云

---

## ⏳ 待选方向（下一轮由用户拍板）

| 方向 | 优先级 | 前置条件 |
|------|:--:|----------|
| Stage 3 Round 3：题目汇总 API + 视图 | P1 | Round 2 审计通过 ✅ |
| Stage 3 Round 3：ai-result 纠错端点 | P1 | Round 2 审计通过 ✅ |
| Mobile automation 测试框架 | P2 | 计划已草拟 |
| Bundle 优化（recharts/KaTeX 懒加载） | P2 | 分析报告已出 |

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
