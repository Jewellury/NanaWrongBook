# M3a 计划修订工单（给项目 AI）

> 针对 `doc/plan/M3a-tracking-skeleton-plan.md`。该计划在配题完成前写就，前提已变（现有 101 道审过的真题）。
> 改完下面 6 条，重发外部参谋长确认，再 `/execute`。迁移步骤照旧铁律 1 先确认。

---

## 改动 1 🔴 用真配题替换占位题（贯穿全计划）
现状：决策①/任务1-2/§3/§4/§6/§7.4 都按"用 sampleItem 占位、answer=(待填充)"。
现已有 **101 道审过的真题**，分布在：
- `doc/research/M1 初诊题首批.md`（M1 A 层 21 节点 / 60 题）
- `doc/research/初诊题产出.md`（BG 地基 5 + M2a A 层 8 / 41 题）

**改成**：
- **新增前置子任务**：把这两个 md 里的 101 题解析成**结构化 Item 种子文件**（如 `prisma/seed_items_batch1.ts`）。
  字段：`nodeId, role, stem, answer, pairWith?, conceptCue?, note?`。
  用**确定性 ID**：`{nodeId}-{role}-{序号}`（如 `M1-04-boundary-1`），便于幂等 reseed。
  答案已人工复核通过，直接采用，不要改写。
- 任务1 改为「建 Item 表 + 从种子文件导入 101 道真题（boundary/variant/concept/drill 全导）」。
- **删除 §7.4 占位逻辑**，改为从 `seed_items_batch1` upsert。
- §4 验收：把"34 道占位"改成「导入 101 道真题；每个节点至少有 1 道 boundary + 1 道 variant」。
- §6 风险表删除"sampleItem 可能不合法""34 道占位不够多样"两条（已不适用）。

## 改动 2 🔴 新增决策⑦：本轮不自动判分
KST-lite 入参 `answers:{nodeId,correct}[]` 的 `correct` **由调用方给定**——初诊对错由周末 session 人工/前端判定，系统本轮**不自动判分**。这对齐 P5（周末数字化、人工对答案），也了结此前挂的"判分策略待定"。在 §5 写成显式决策。

## 改动 3 🔴 新增决策⑧：初诊探针只用 boundary，排除 concept
真题里现在有 concept 了，而 concept 不可自动对错判定。
- KST-lite 选题按 `role` 过滤：**初诊只发 boundary**；`variant` 入库留作隔天复测（本轮可不发）；**concept 不进自动判分流**，归后续人工/Newman 阶段。
- 在 §7.2 KST-lite 选题逻辑里加这条 role 过滤。

## 改动 4 🟡 修正 BKT 的 T 语义（决策④ + §7.3）
现状把 `P(L)←posterior+(1-posterior)*T` 注成"遗忘概率"——但该公式是**向掌握方向移动**，是标准 BKT 的**学习转移概率 P(T)**，不是遗忘。照"遗忘"直觉实现必出 bug。
**改成**：
- 明确 `T = 学习转移概率 P(T)`（标准 BKT），删掉"遗忘"措辞。
- 注明：**同一场初诊内逐题更新不施加跨时间衰减**（同场连续答题没有时间流逝）；真正的"跨天遗忘"本轮不做，留待后续。
- §4 验收里"连续答对 3 次→≥0.85 / 连续答错 3 次→≤0.30 / 连续两 slip→强制 gap"保留，这些是对的。

## 改动 5 🟡 修正决策②与风险表第 1 条（migration 误解）
`items Item[]` 是 Prisma 的**虚拟关系字段**，不产生数据库列、不 ALTER KnowledgeNode。本次 migration 应是**纯增量（只 `CREATE TABLE Item`）**，M1/M2 数据**不受影响、无需 reseed**。
**改成**：
- 决策② 去掉"会重建 KnowledgeNode 表/数据无损靠 reseed 恢复"的说法。
- 风险表第 1 条改为：要求执行时**确认生成的 migration diff 只有 `CREATE TABLE Item`、没有对既有表的 ALTER/重建**，确认后再 apply。

## 改动 6 🟡 learningFrontier 排序 + 截断（决策⑤ + §7.5）
现状没定前沿怎么排。
**改成**：学习前沿排序 = **tier(A>B>C) → 主线高考权重**，且**最多取 1-2 个**（对齐 handoff 渐进展开 / P4：绝不一次铺开一片红）。map API 的 `learningFrontier` 按此排序截断。

---

## 复核口径（改完后参谋长会重点看）
- 占位逻辑是否彻底清除、101 题种子是否用确定性 ID；
- 决策⑦⑧ 是否写清"不自动判分 + 探针只 boundary"；
- BKT 的 T 是否改成"学习转移"且不在同场逐题衰减；
- migration 是否声明为纯增量（只 CREATE Item）。

改完重发计划，确认后再 `/execute`。
