# 统一待办台账

> 📌 **维护者**：plan-agent（新增/调整）、execute-agent（偏离记录）、audit-agent（确认关闭）
> 📌 **初始版本来源**：`doc/auditlog/audit-doc-backlog-governance-2026-07-05.md`
> 📌 **完整待办/技术债以此文件为准**。旧文档（00_CURRENT/active_spec/DECISIONS.md）中的重复条目正在逐步迁移。

---

## 活跃 backlog（已排入近 2-3 轮路线图）

| ID | 类型 | 标题 | 优先级 | 目标窗口 | 状态 | 关闭条件 |
|----|------|------|:------:|:--------:|:----:|----------|
| OD-001 | Ops Debt | 实现部署后 KnowledgeNode smoke check 自动化 | P1 | 近 2 轮 | open | `scripts/post-deploy-smoke-check.ts` 实现 + 集成部署流程；检查项：KnowledgeNode≥48、KnowledgeEdge≥36、Mainline≥10 |
| OD-005 | Ops Debt | 配置生产 Volcengine 环境变量 | P1 | Stage 5 前 | open | 生产 `.env` 配置 VOLCENGINE_API_KEY + VOLCENGINE_BASE_URL + curl 验证通过 |
| TD-003 | Tech Debt | base64 artifact 迁移到对象存储 | P1 | 触发时 | open | **触发**：case > 100 或 dev.db > 50MB。迁移方案实施完成 |
| DP-001 | Decision Pending | M3b vs M4 优先级：下一轮先做哪个 | P1 | 本轮 | open | 用户拍板 |
| CR-001 | Code Remnant | 清理 Stage 3 v2 废弃代码（asr-transcribe.ts / vlm-classify.ts / 对应测试） | P2 | v3 稳定后 | open | v3 case-analyzer + /process 稳定运行无回归后，一次性删除 `src/lib/nana/asr-transcribe.ts`、`src/lib/nana/vlm-classify.ts`、`src/__tests__/unit/nana/asr-transcribe.test.ts`。`scripts/stage3-asr-format-check.ts` 保留为参考 |
| OD-003 | Ops Debt | E2E 补"最近拍过入口按钮"路径 | P2 | 近 2 轮 | open | E2E 测试覆盖该路径 |
| OD-004 | Ops Debt | 上游 5 个测试在 `.env.test` 下失败隔离 | P2 | 近 2 轮 | open | 开独立计划 upstream-test-env-isolation 处理 |
| RS-001 | Research/Spike | OCR v2 可行性 Spike（替代 PB-001） | P2 | 近 2 轮 | open | Spike 完成 + 报告 + 决策是否进入路线图 |

---

## 停车场（候选，尚未排期，定期评估）

> 这些条目有明确价值但当前不阻塞开发，暂不进入活跃 backlog。**连续 5 轮无人触碰 → audit 标记 `stale`，下一轮 plan 做"保留 / cancel"二择一。**

| ID | 类型 | 标题 | 优先级 | 目标窗口 | 状态 | 阻塞/依赖 | 关闭条件 |
|----|------|------|:------:|:--------:|:----:|:----------:|----------|
| PB-002 | Product Backlog | 图片裁剪/旋转/涂抹 | P2 | 待定 | open | — | 用户确认是否在 v1 范围内 |
| PB-003 | Product Backlog | 疑似重复题识别 | P2 | 待定 | open | RS-002（先调研算法可行性） | 相似度算法验证 + UI 方案 |
| PB-004 | Product Backlog | 完整解题步骤/答案 | P2 | 待定 | open | D-8（LLM 调用启用） | LLM 启用 + 明确"不给答案"边界 |
| PB-005 | Product Backlog | 音频逐句时间轴 | P2 | Stage 5 | open | ASR 接通 + 数据结构扩展 | 数据结构支持逐句时间戳 |
| PB-007 | Product Backlog | 扩展 TextbookTopic 覆盖范围 | P2 | 待定 | open | 教研工单完成 | 覆盖扩展到用户常见章节 |
| PB-006 | Product Backlog | 打印页简洁版/带题图版切换 | P3 | 待定 | open | — | 用户确认是否需要 |
| PB-008 | Product Backlog | 方法族地图前台化 | P3 | 待定 | open | 内部标签积累 + 教师验证 | 验证通过后评估 |
| PB-009 | Product Backlog | FSRS 自适应复习排程 | P3 | 待定 | open | 诊断→补救→复诊闭环稳定 | 闭环稳定后评估 |
| PB-010 | Product Backlog | PDF 直接导出 | P3 | 待定 | open | — | 用户提需求 |
| PB-011 | Product Backlog | Problem/Attempt 模型 | P3 | 待定 | open | 1 Case = 1 题不够用时 | 模式不够用 + 用户确认 |
| TD-001 | Tech Debt | slipFlag → slipCount 字段迁移 | P2 | M4 | open | M4 一并处理 | 新字段 + 迁移已有 slipFlag 数据 |
| TD-002 | Tech Debt | /initial 一步式废弃 | P2 | submit-answers 稳定后 | open | submit-answers 路径稳定 | 确认稳定后废弃 |
| TD-004 | Tech Debt | light-feedback magic string `__preliminary__` | P3 | Stage 3 | open | 接通真实 API | 传入真实 caseId |
| TD-005 | Tech Debt | feedback API 未校验 case 存在性 | P3 | Stage 5 | open | — | case 不存在返回 404 |
| CR-002 | Code Remnant | 修复 scripts/vlm-handheld-test.ts 类型错误阻塞 build | P2 | 待定 | open | — | 修复类型错误或废弃该脚本 |
| OD-002 | Ops Debt | 统一 `.env` DATABASE_URL 游离 DB 配置 | P2 | 待定 | open | — | 本地开发显式设 DATABASE_URL 或统一配置方案 |
| OD-006 | Ops Debt | CI 迁移后本地 Docker 不可用的记录义务 | P3 | 持续 | open | — | 执行日志持续遵守该守则 |
| UX-001 | UX Follow-up | 定稿"未分类/暂未覆盖"题目的温和提示文案 | P2 | 待定 | open | — | 产品行为手册更新覆盖此文案 |
| UX-002 | UX Follow-up | 验证题图缩略图打印版尺寸规范 | P3 | 待定 | open | — | 打印页实际验证通过 |
| UX-003 | UX Follow-up | catch 块加 abortedRef 检查 | P3 | 待定 | open | — | 随手修，无硬性截止 |
| RS-002 | Research/Spike | 重复题相似度算法调研 | P3 | 待定 | open | — | 调研完成 + 是否纳入路线图 |
| DP-002 | Decision Pending | CaseAiResult processingStatus "pending" 状态语义 | P2 | 待定 | open | — | 确认 timeout 处理策略 |

---

## 已完成/已关闭

| ID | 类型 | 标题 | 关闭日期 | 关闭证据 |
|----|------|------|:--------:|----------|
| CR-003 | Code Remnant | 清理游离 DB 外部残留（E:\app\data\dev.db 含 4 张空表） | 2026-07-05 | 该文件路径无法影响项目运行，游离 DB 已由 stage3-revised 轮隔离处理，无实际操作价值。cancel |

*（注：PB-001 合并到 RS-001，不再独立存在。）*

---

## 维护规则

### 三阶段协作

**plan 阶段**
- 打开 BACKLOG.md，从"活跃 backlog"中选取本轮条目 → 标记 `in-progress` + 关联 plan 文件
- 新发现的产品功能/债务/残留 → 按类型新增 open 条目
- 如需将停车场条目拉回活跃区，同步更新目标窗口

**execute 阶段**
- 发现新残留代码或技术债 → 新增 CR/TD 条目
- 执行日志末尾注明"本轮新增 BACKLOG 条目：XXX-XXX"
- 不准在未登记的情况下悄悄修掉再关闭——必须先登记再处理

**audit 阶段**
- 检查项：`[ ] 所有新发现的 follow-up 是否已入 BACKLOG.md`
- 确认完成的条目：验证关闭条件 → 标记 `closed` + 写关闭证据
- 发现遗漏 → 新增条目
- 标记连续 5 轮无人触碰的 open 条目为 `stale`

### 条目生命周期

```
[发现] → open → in-progress → closed（写关闭证据）
                    ↓
               blocked → unblocked → in-progress

open → cancelled（明确不做或已过时）
open → stale（5 轮未触碰）→ 下一轮 plan 二择一：保留 / cancel
```

### 更新频率

- **每轮 plan**：必看
- **每轮 audit**：必检查
- **发现新 item**：随时追加
- **每 5 轮**：整体 review 停车场条目，批量 cancel 已过时的

---

> 最后更新：2026-07-05 | 初始版本来源：`doc/auditlog/audit-doc-backlog-governance-2026-07-05.md`
