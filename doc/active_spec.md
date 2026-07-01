# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-06-28

## ✅ 第 1 阶段已完成——采集基础壳（P0）

4 个 commit 全部完成并经审计通过 ✅。

**回顾**：用户可进入 `/nana`（鉴权守卫），看到双状态首页（有记录/空状态），通过"拍一下这道题"进入采集壳，完成"录音→逐字稿→轻反馈→再拍一道"完整流程。case 通过 API 存入数据库。

详见 `doc/auditlog/nana-phase1-execution-audit.md`。

---

## ⏳ 下一阶段待定

第 1 阶段后端（Case/Artifact API + 规则版反馈）+ 前端（首页 + 采集壳）已就绪。

下一阶段可选方向（由用户拍板）：

| 方向 | 优先级 | 前置条件 |
|------|:--:|----------|
| **知识地图 UI**（/nana/knowledge-map） | P1 | map API 已就绪 |
| **批次诊断报告 UI**（/nana/session） | P1 | session-items + submit-answers API 已就绪 |
| **采集壳接真实 ASR/VLM** | P2 | 第 5 阶段计划 |
| **轻反馈升级 LLM** | P2 | 当前规则版可用，LLM 可并行开发 |
| **Mockup 评审遗留项** | — | 评审 AI 可在当前阶段介入 |

---

## 📊 关联文档

- 项目总纲 → [plan/nana-master-plan.md](plan/nana-master-plan.md)
- 分阶段开发计划 → [plan/nana-development-phases.md](plan/nana-development-phases.md)
- 闭环重设计 → [plan/capture-to-diagnosis-closed-loop-redesign.md](plan/capture-to-diagnosis-closed-loop-redesign.md)
- 前端架构方案 → [plan/frontend-architecture-plan.md](plan/frontend-architecture-plan.md)
- 第 1 阶段执行日志 → [executionlog/nana-phase1-execution-log.md](executionlog/nana-phase1-execution-log.md)
- 第 1 阶段审计报告 → [auditlog/nana-phase1-execution-audit.md](auditlog/nana-phase1-execution-audit.md)

---

## ⚠️ 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 不调 LLM：无 AI 判分/Newman 追问/解析生成
- 单主线诊断（决策 D-9 延续）
- 采集壳当前用 mock 数据，不接真实 ASR/VLM（第 5 阶段接通）

## 🏗️ 设计债（在册）

1. **slipFlag** — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. **/initial 废弃** — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. **light-feedback magic string `__preliminary__`** — 第 5 阶段接通真实 API 时处理
4. **feedback API 未校验 case 存在性** — 第 5 阶段接通真实 API 时处理
5. **二进制 artifact 以 Base64 内联 SQLite（Phase 1.5 引入）** — `question_image`/`audio_note` 字节以 Base64 存进 `Artifact.content`（String），~33% 体积开销，case 多了拖慢 SQLite 查询/备份。**迁移阈值**：case > 100 条或 `dev.db` > 50 MB（先到先触发）；**迁移方向**：对象存储 + URL 存 content + 独立清理策略
