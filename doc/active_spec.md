# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-06-15

## 🎯 本轮目标

M3c 周末编排 + 纸质包 —— 已完成 ✅，审计通过。

## ✅ 任务清单

- [x] 诊断编排器 lib/diagnosis-orchestrator.ts（5 个纯逻辑函数，测试先行 24 用例）
- [x] 核心修正：一道题 = 一份证据（BKT 从既有先验，KST 只传未作答）
- [x] 题单 API POST /api/diagnosis/session-items
- [x] 答案提交 API POST /api/diagnosis/submit-answers
- [x] 纸质包 API GET /api/diagnosis/paper-pack
- [x] 纸质包打印页 src/app/diagnosis/paper-pack/page.tsx
- [x] 集成测试（11 用例，真实 handler + vi.mock）
- [x] test:all 110/110 退出码 0
- [x] 审计通过

## 🔗 关联文档

- 计划: doc/plan/M3c-session-pdf-plan.md
- 执行日志: doc/executionlog/M3c-session-pdf-log.md
- 审计: doc/auditlog/M3c-session-pdf-audit.md ✅ 通过

## ⚠️ 已知限制

- KST-lite gap 只传播一层 dependents，M4 补递归
- 不调 LLM：无 AI 判分/Newman 追问/解析生成
- 单主线诊断（决策⑥延续）

## 🏗️ 设计债（在册）

1. **slipFlag "连续两次"需持久化 slip 历史** —— 当前 `StudentNodeState.slipFlag` 仅单 boolean，复诊时需 `slipCount` 字段
2. **`/initial` 一步式建议废弃** —— 与 `submit-answers` 两条初诊路径分叉，建议稳定后废弃 `/initial`

## 📝 备注

M3c 完整闭环。周末初诊→周中纸质包的最小可用链路已成立。
下一轮：M4 探针下探 或 M3b 配题灌入。
