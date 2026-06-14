# 工单：抽取初诊配题用的节点清单（给项目 AI）

> 目的：从 `doc/research/seed_graph_batch1.ts` 抽出"初诊配题首批"要用的节点，
> 筛选 + 字段归一化，输出成可直接粘给调研 AI 的清单（配合 M3_content_prompts.md 的提示词 B）。
> 性质：**只读、不连数据库、不改 schema、不碰上游**——安全的一次性数据导出，不必走完整三代理，
> 但产出文件请 commit 留档。

## 要做什么
读 `seed_graph_batch1.ts` 里的 `foundationExtra` / `M1nodes` / `M2aNodes` 三个导出数组，
按下面规则筛选、归一化字段、写出清单。

## 筛选条件（满足任一即保留）
- `tier === 'A'`，**或**
- `layer === 'foundation'`（BG 地基节点——它们 tier 多为 null，但初诊"下探"必须有题可发，所以纳入）

> 不纳入 B/C/D 层；不纳入还没进种子库的 BG001-099（产了是孤儿题）。

## 字段归一化（三个数组字段名不一致，复用你 M1 seed 脚本里的 normalizeNode 思路）
| 输出字段 | foundationExtra 取自 | M1nodes / M2aNodes 取自 |
|---|---|---|
| id | `id` | `id` |
| name | `name` | `name` |
| tier | `tier` | `tier` |
| stage | `stage` | `section` |
| judgeCriteria | `judgeCriteria` | `judge` |
| sampleItem | `sampleItem` | `sample` |
| mainline | `mainlines[0]` | `mainlines[0]` |

## 输出
写到 `doc/reference/M3_peiti_nodes_batch1.md`，**按 mainline 分组**（M1 一组、M2a 一组、BG 一组），
每节点一条（YAML 或表均可）。字段顺序：`id, name, mainline, tier, stage, judgeCriteria, sampleItem`。

## 方法与纪律
- **用小脚本读取 + 归一化输出，不要手抄**（防转写错）。可临时 `tsx` 跑一个一次性脚本，
  或复用现有 seed 脚本的归一化逻辑。
- **跑完报数**：抽出多少节点，按 mainline/tier 拆分。
  预期 **约 34 个**（M1 A 层约 21 + M2a A 层 8 + BG 地基 5）——供你核对，对不上就停下来查。
- **空字段不准静默跳过**：若有节点的 `judgeCriteria` 或 `sampleItem` 为空，单独列出来标记（铁律 6）。
- **只读**：不连库、不迁移、不改 schema、不动上游文件。

## 完成后
把 `M3_peiti_nodes_batch1.md` 的内容，连同 `M3_content_prompts.md` 里的**提示词 B（初诊弹药生成）**
一起发给调研 AI，即可开始造首批初诊题。
