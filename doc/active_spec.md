# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-06-20

## 🎯 本轮：双线并行推进

M3c（周末编排+纸质包）已审计通过 ✅。当前进入双线并行期——真题转写复核 + 前端架构复核，互不依赖。

---

## 线 1：真题转写复核（D 线）

**目标**：2024/2025/2026 三年真题 VLM 转写 → 我方逐卷核对数字/符号/公式 → 入库作为 B 层通法/变式参考。

| # | 任务 | 状态 | 说明 |
|---|------|:--:|------|
| 1 | 提示词 A 就绪 | ✅ | `scripts/vlm-transcribe.ts`（385 行），豆包 Seed2.0 逐页识图 |
| 2 | 2024 转写完整版 | 🟡 | `doc/research/transcripts/2024-verified.md`（24 页全卷逐题转写，人工核实终版已产出） |
| 3 | 2025 转写 draft | 🟡 | `doc/research/transcripts/2025-vlm-draft.md`（VLM 草稿，待复核） |
| 4 | 2026 转写 draft | 🟡 | `doc/research/transcripts/2026-vlm-draft.md`（VLM 草稿，待复核） |
| 5 | 我方核对入库 | ⬜ | 核对数字/符号/公式正确性 → 入库 |

---

## 线 2：前端架构修改复核（A 线延伸）

**目标**：`doc/plan/frontend-architecture-plan.md`（570 行）已产出 → Codex 架构评审 → 用户拍板。

| # | 任务 | 状态 | 说明 |
|---|------|:--:|------|
| 1 | 上游前端勘察 | ✅ | 任务 0 已完成：路由结构、可复用件、碰不得清单 |
| 2 | 文件夹/路由组织方案 | ✅ | 任务 1 已完成：自己的路由命名空间 + 不改根 layout |
| 3 | 复用 vs 重建台账 | ✅ | 任务 2 已完成：三类分档 |
| 4 | 重建界面架构占位 | ✅ | 任务 3 已完成：采集卡片盒/场景入口/陪伴录音/知识地图/session UI |
| 5 | 建设顺序建议 | ✅ | 任务 4 已完成：5 个 MVP 切片 |
| 6 | **Codex 架构评审** | ⬜ | **当前卡点** |
| 7 | **用户拍板切片** | ⬜ | 评审后确认先建哪个切片 |

---

## 📊 关联文档

- 项目全景六线 → [00_CURRENT.md](00_CURRENT.md)
- 决策台账 → [DECISIONS.md](DECISIONS.md)
- 前端架构方案 → [plan/frontend-architecture-plan.md](plan/frontend-architecture-plan.md)
- 真题转写 draft → `doc/research/transcripts/`
- 前端架构工单 → [reference/frontend-architecture-workorder.md](reference/frontend-architecture-workorder.md)

---

## ⚠️ 已知限制

- KST-lite gap 只传播一层 dependents，M4 补递归
- 不调 LLM：无 AI 判分/Newman 追问/解析生成
- 单主线诊断（决策 D-9 延续）
- 前端全量开建待用户拍板（架构方案已完成，评审是瓶颈）

## 🏗️ 设计债（在册）

1. **slipFlag** — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. **/initial 废弃** — 与 submit-answers 两条初诊路径分叉，稳定后废弃

## 📝 备注

真题转写 = 外部 AI（豆包 VLM）逐页识图转写 → 我方逐卷核对数字/符号/公式 → 入库。用途：B 层通法/变式参考，不是初诊弹药。
