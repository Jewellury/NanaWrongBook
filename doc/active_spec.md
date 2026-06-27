# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-06-27

## 🎯 本轮：第 1 阶段开发——采集基础壳（P0）

总纲 (`nana-master-plan.md`)、5 阶段计划 (`nana-development-phases.md`)、第 1 阶段执行计划 (`nana-phase1-execution-plan.md`) 已全部产出并经审计通过 ✅。现进入第 1 阶段开发。

**目标**：让用户能进入 `/nana`，拍一道题，口述思路，存成 case，并收到即时文字回应（单题轻反馈）。

---

## 执行计划

详见 `doc/plan/nana-phase1-execution-plan.md`。

拆分 4 个 commit：

| # | 内容 | 状态 | 说明 |
|---|------|:--:|------|
| ① | Prisma schema + case API（数据层 + API） | ⬜ | Case + Artifact 表，POST/GET case API，前端客户端 |
| ② | 场景入口首页 + `/nana` layout | ⬜ | 鉴权 layout，双状态首页（有记录/空状态） |
| ③ | 采集壳 UI + 组件 | ⬜ | 题图查看器/录音控件/逐字稿面板/轻反馈 UI 骨架 |
| ④ | 单题轻反馈 API + 完善 UI | ⬜ | 规则版关键词匹配 API，完善反馈组件 |

**依赖**：①→②→③→④（严格顺序）

---

## 📊 关联文档

- 项目总纲 → [plan/nana-master-plan.md](plan/nana-master-plan.md)
- 分阶段开发计划 → [plan/nana-development-phases.md](plan/nana-development-phases.md)
- 第 1 阶段执行计划 → [plan/nana-phase1-execution-plan.md](plan/nana-phase1-execution-plan.md)
- 闭环重设计 → [plan/capture-to-diagnosis-closed-loop-redesign.md](plan/capture-to-diagnosis-closed-loop-redesign.md)
- 前端架构方案 → [plan/frontend-architecture-plan.md](plan/frontend-architecture-plan.md)

---

## ⚠️ 已知限制

- KST-lite gap 只传播一层 dependents，M4 补递归
- 不调 LLM：无 AI 判分/Newman 追问/解析生成
- 单主线诊断（决策 D-9 延续）
- 本阶段采集壳用 mock 数据，不接真实 ASR/VLM（第 5 阶段接通）

## 🏗️ 设计债（在册）

1. **slipFlag** — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. **/initial 废弃** — 与 submit-answers 两条初诊路径分叉，稳定后废弃
