# 当前项目状态

> 📌 冷启动第一站。回答"现在在哪、卡在哪、下一步"。
> 当前轮任务详情 → [active_spec.md](active_spec.md)
> 历史叙事 → [progress.md](progress.md)
> 决策台账 → [DECISIONS.md](DECISIONS.md)

Last updated: 2026-06-19 | Updated by: claude

---

## Freshness Check（冷启动防陈旧）

- Latest completed milestone: **M3c 周末诊断编排 + 纸质包 PDF**（2026-06-15，审计 ✅ 通过）
- Latest commit: `f907e39` — `docs: 竞品速评——术子错题宝（借鉴点已按轮次归位）`
- Current branch: `dev`
- Is current fresh: ✅ fresh — 项目处于 M3c 完成后的间歇期，下一轮 M4/M3b 待启动

---

## 当前主线

**M3c 周末诊断编排 + 最小纸质包 PDF —— 已完成 ✅**

完整闭环：周末初诊 → 周中纸质包的最小可用链路已成立。

交付物：
- `lib/diagnosis-orchestrator.ts`（5 个纯逻辑函数，24 单元用例）
- POST `/api/diagnosis/session-items`（题单，学生视图无答案泄漏）
- POST `/api/diagnosis/submit-answers`（BKT+KST 分线 → StudentNodeState 持久化）
- GET `/api/diagnosis/paper-pack`（frontier 优先 + gap 补位，封顶 4 节点/~10 题）
- `src/app/diagnosis/paper-pack/page.tsx`（封面+练习区+答案分页+A4 @media print）
- test:all 110/110 退出码 0

关联文档：
- 计划: [plan/M3c-session-pdf-plan.md](plan/M3c-session-pdf-plan.md)
- 执行日志: [executionlog/M3c-session-pdf-log.md](executionlog/M3c-session-pdf-log.md)
- 审计: [auditlog/M3c-session-pdf-audit.md](auditlog/M3c-session-pdf-audit.md) ✅ 通过

---

## 里程碑总览

| 里程碑 | 状态 | 开始 | 完成 |
|--------|:--:|------|------|
| M0 环境搭建 | ✅ | 06-13 | 06-13 |
| M1 知识图谱数据层 | ✅ | 06-14 | 06-14 |
| M2 归因流程 | ✅ | 06-14 | 06-14 |
| M3a 追踪骨架 | ✅ | 06-15 | 06-15 |
| M3b 配题灌入 | ⬜ | — | — |
| M3c 周末编排+纸质包 | ✅ | 06-15 | 06-15 |
| M4 探针下探 | ⬜ | — | — |
| 其余配题长尾 | 🔄 | — | — |

---

## 已知限制（跨轮持续有效）

1. **KST-lite gap 只传播一层 dependents**——M4 补递归（延续 M3a 已知限制）
2. **不调 LLM**——无 AI 判分 / Newman 追问 / 解析生成（延续 M3c 已知限制）
3. **单主线诊断**——决策⑥延续，暂不支持多主线并行诊断

---

## 设计债（在册，待后续轮次处理）

| # | 设计债 | 说明 | 状态 |
|---|--------|------|:--:|
| 1 | slipFlag 持久化历史 | 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段 | ⬜ |
| 2 | `/initial` 一步式废弃 | 与 submit-answers 两条初诊路径分叉，建议稳定后废弃 | ⬜ |

---

## 下一步

**下一轮候选**：M4 探针下探 或 M3b 配题灌入。
建议优先 M4（深化诊断推理能力），M3b 可并行推进（配题是数据工作，不碰核心逻辑）。

---

## Handoff（模型切换冷启动）

- **先读**：本文件 → [DECISIONS.md](DECISIONS.md)（末尾开放项速查）→ [active_spec.md](active_spec.md)
- **必读权威参考**：[reference/TECH_PLAN_v2.md](reference/TECH_PLAN_v2.md) + [reference/OPS_handbook.md](reference/OPS_handbook.md)
- **运行规则**：见 CLAUDE.md（安全铁律 + 三代理框架 + Git 规范）
- **测试**：`npm run test:all`（需 Docker 测试容器）

---

## Do Not Reopen Unless Needed

- M1 图谱 8 表结构（已稳定，见 [DECISIONS.md](DECISIONS.md) D-2）
- M2 诊断会话 8 步状态机（已稳定，见 [DECISIONS.md](DECISIONS.md) D-4）
- 容器分层方案（生产/测试分离，已稳定）
- 三分支模型（main/dev/sync-upstream）
- 三代理协作框架（/plan → /execute → /audit）
- 所有新表追加挂接、不改上游 model（安全铁律 3）
