# M3 初诊配题节点抽取 · 审阅与执行计划

> 关联工单: doc/reference/M3_node_extraction_workorder.md
> 关联文件: doc/reference/M3_content_prompts.md（提示词 B）
> 计划日期: 2026-06-14
> 预计影响: 只读 seed_graph_batch1.ts，新增 doc/reference/M3_peiti_nodes_batch1.md

## 1. 大白话概述

从种子知识图谱（`seed_graph_batch1.ts`）里，把初诊阶段需要配题的节点挑出来，
统一字段格式，按主线分组输出成一个清单文件。然后把这个清单 + `M3_content_prompts.md`
里的"提示词 B"一起发给调研 AI，让外部 AI 帮忙造首批初诊题。

**工单自己说了"不必走完整三代理"**——这是只读数据导出，不碰数据库、不改 schema、不动上游文件。
本计划只做审阅确认，执行用一次性 tsx 脚本即可。

## 2. 数据验证结果（已跑）

我实际解析了 `seed_graph_batch1.ts`，三个数组的统计数据如下：

| 数组 | 总数 | tier=A | layer=foundation | 筛选后 | 预期 |
|------|------|--------|-------------------|--------|------|
| foundationExtra | 5 | 0 | 5 | **5** | ~5 |
| M1nodes | 30 | 21 | - | **21** | ~21 |
| M2aNodes | 13 | 8 | - | **8** | ~8 |
| **合计** | 48 | - | - | **34** ✅ | ~34 |

**筛选条件（tier==='A' OR layer==='foundation'）命中 34 个节点，与工单预期完全吻合。**

额外检查：
- ✅ 所有 34 个节点的 `judgeCriteria`/`sampleItem`（或对应字段）**均非空**——无静默跳过
- ✅ M3_content_prompts.md 中「提示词 B：初诊弹药（配题）生成」已就绪
- ✅ 按 mainline 分组结果：BG（M0）5 个、M1 21 个、M2a 8 个

## 3. 字段归一化核对

| 输出字段 | foundationExtra 来源 | M1nodes/M2aNodes 来源 | 验证 |
|----------|---------------------|----------------------|------|
| id | `id` | `id` | ✅ 一致 |
| name | `name` | `name` | ✅ 一致 |
| tier | `tier` | `tier` | ✅ 一致 |
| stage | `stage` | `section` | ✅ foundationExtra 用 stage，M1/M2a 用 section |
| judgeCriteria | `judgeCriteria` | `judge` | ✅ 字段名不同但语义一致 |
| sampleItem | `sampleItem` | `sample` | ✅ 同上 |
| mainline | `mainlines[0]` | `mainlines[0]` | ✅ 取第一个元素即可确定主线归属 |

## 4. 执行任务（一条）

- [ ] **编写并运行一次性 tsx 脚本**：读取 `seed_graph_batch1.ts` 三个数组 → 筛选 → 归一化 → 按 mainline 分组输出到 `doc/reference/M3_peiti_nodes_batch1.md`

**脚本要点**：
- 纯文本输出（YAML 或 Markdown 表），不连数据库
- 按 mainline 分三组：BG（M0）、M1、M2a
- 每组内按 id 排序
- 文件头注明节点总数和分组统计
- 如任何字段为空，显式标注 `⚠️ 空`

## 5. 验收标准

- [ ] 输出文件 `doc/reference/M3_peiti_nodes_batch1.md` 存在
- [ ] 包含 34 个节点（BG 5 + M1 21 + M2a 8）
- [ ] 每个节点 7 个字段齐全（id, name, mainline, tier, stage, judgeCriteria, sampleItem）
- [ ] 无空字段静默跳过
- [ ] 文件可直接粘给调研 AI，配合提示词 B 使用

## 6. 风险与注意事项

- **风险极低**：纯只读脚本，不改任何现有文件
- 脚本跑完后建议 `git add` + `git commit` 产出文件留档
- 若脚本输出的节点数不是 34，停下来排查——不要强行提交
- foundationExtra 的 `tier` 为 null，输出时写成 `null`（或 `-`），标注属于地基节点

## 7. 技术附录

### 筛选伪代码
```ts
const normalized = [
  ...foundationExtra.filter(n => n.layer === 'foundation').map(n => normalizeFoundation(n)),
  ...M1nodes.filter(n => n.tier === 'A').map(n => normalizeMNode(n)),
  ...M2aNodes.filter(n => n.tier === 'A').map(n => normalizeMNode(n)),
];

function normalizeFoundation(n) { return {
  id: n.id, name: n.name, mainline: n.mainlines[0],
  tier: n.tier, stage: n.stage,
  judgeCriteria: n.judgeCriteria, sampleItem: n.sampleItem
};}

function normalizeMNode(n) { return {
  id: n.id, name: n.name, mainline: n.mainlines[0],
  tier: n.tier, stage: n.section,
  judgeCriteria: n.judge, sampleItem: n.sample
};}
```

### 输出格式建议
按 mainline 分三大节，每节内用 Markdown 表：

```markdown
## BG 地基节点（M0）— 5 个
| id | name | mainline | tier | stage | judgeCriteria | sampleItem |
|----|------|----------|------|-------|---------------|------------|
| BG100 | 韦达定理 | M0 | null | 九上/必修一 | ... | ... |
...
```
