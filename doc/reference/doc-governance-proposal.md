# NanaWrongBook 文档治理方案

> 起草日期：2026-06-19 | 起草者：Claude | 状态：待用户确认
>
> 目标：让人类、Claude、Codex 能快速复盘架构和技术决策，不再靠散落文档猜上下文。

---

## 1. 现状问题

### 1.1 `doc/reference/` 是平铺垃圾场（18 个文件，4 类内容混放）

| 类别 | 文件数 | 示例 |
|------|--------|------|
| 长期权威参考 | 3 | TECH_PLAN_v2, OPS_handbook, BOOTSTRAP |
| 临时工单 | 8 | M3_node_extraction_workorder, photo-guide-workorder… |
| 交接文档 | 2 | HANDOFF_project_handoff, HANDOFF_to_codex_tech_review |
| 事故复盘 | 1 | M2-prod-contamination-postmortem |
| 杂项参考 | 4 | competitor-shuzi-analysis, M3_content_prompts, M3_peiti_acceptance… |

**症状**：打开 `doc/reference/` 无法一眼知道哪些是"必读"哪些是"一次性的"。

### 1.2 没有决策追溯

- 架构决策散落在 plan → executionlog → auditlog 三份文件中
- 要回答"为什么 M1 用 8 张表而不是 6 张？"需要依次读三份文件
- 决策是否仍然有效、是否被后续决策取代——无法快速判断

### 1.3 没有统一入口

- CLAUDE.md 只索引了 TECH_PLAN_v2 和 OPS_handbook
- `progress.md` 是历史轨迹，但不是"现在该看什么"
- `active_spec.md` 只管当前轮，上一轮的内容已被替换
- 新加入的 AI（如 Codex）需要读 40 分钟的 handoff 文档才能进入状态

### 1.4 文件命名不一致

- reference/ 内：有的带 M2/M3 前缀，有的没有，有的用中文名
- research/ 内：有的带 `#` 前缀，有的没有
- 无法从文件名判断：这份文件是工单？是评审？是参考材料？

### 1.5 没有状态标记

- 无法从文件系统中知道 `get-notes-research-workorder.md` 是已完成还是已废弃
- `doc/spec/` 里的方案是当前采用的还是历史草案？没有标记

---

## 2. 可借鉴点（来自 `cross_project_alignment`）

该目录是 Claude + Codex 双评审 AI 为三项目做架构评审的共享工作区。以下做法可直接借鉴：

| 借鉴点 | cross_project_alignment 做法 | 对本项目的适用性 |
|--------|------------------------------|------------------|
| **入口层 5 文件** | README → 00_CURRENT → INDEX → DECISIONS → PRINCIPLES | ✅ 高。本项目比它简单，只需 3 个新文件 |
| **INDEX 是索引不是叙事** | 按时间倒排，每文件一行（状态 emoji + reviewer + 一句话） | ✅ 直接套用。比 progress.md 更结构化 |
| **00_CURRENT 冷启动** | freshness check + 当前主线 + 并行线 + handoff + Do Not Reopen | ✅ 直接套用，替代 active_spec 的交接功能 |
| **DECISIONS 决策台账** | WS-### + D/Q/O/FIX/Gate 命名空间，status 生命周期 | ✅ 核心价值。本项目也需要 D 系列决策 |
| **旧文件不重命名** | WS-002：新文件用日期前缀，旧文件不动 | ✅ 关键原则，降低迁移成本 |
| **sync check 纪律** | 每次产出后更新 00_CURRENT/INDEX/DECISIONS | ✅ 可执行，三代理框架天然支持 |
| **Freshness check** | 00_CURRENT 时间戳 vs 目录最新文件，防陈旧上下文 | ✅ 模型切换时自动触发 |
| **命名约定** | `YYYY-MM-DD_HHMM_<artifact>_<reviewer>_<topic>.md` | ⚠️ 需简化。本项目无 reviewer 维度，去掉 `_<reviewer>` |

### 不适合照搬的部分

| 不照搬 | 原因 |
|--------|------|
| GLOSSARY.md | 本项目术语量少（<30 个），暂不需要独立术语表。可在 DECISIONS 中附术语注释 |
| PRINCIPLES.md | 本项目评审方法论还不够成熟，强行写会变空话。等积累 5+ 条有真实出处的原则再建 |
| 按模型分 reviewer 列 | 本项目只有 Claude 和 Codex 两个外部 AI，且 Codex 出现频率低。INDEX 中可用 `claude`/`codex`/`human` 标注作者，但不作为文件名维度 |
| README.md 独立入口 | CLAUDE.md 已在项目根目录承担"门牌"职能，不必重复。在 INDEX.md 开头写阅读顺序即可 |

---

## 3. 推荐方案（主方案）

### 核心理念

**三层文档体系 + 入口层导航**

```
第 0 层：入口层（人类和 AI 的"第一站"）
   INDEX.md          文档索引看板（找文件）
   00_CURRENT.md      当前项目状态（知道在做什么）
   DECISIONS.md       技术决策台账（知道为什么这样做）

第 1 层：开发流水线（三代理闭环，已有，不改）
   plan/              实施计划（每轮一份）
   executionlog/      执行日志（每轮一份）
   auditlog/          审计报告（每轮一份）
   progress.md        项目历史轨迹（只增不减）
   active_spec.md     当前轮任务详情（每轮替换）

第 2 层：参考资料（按生命周期分层）
   reference/                     长期有效的权威参考
     TECH_PLAN_v2.md              ← 技术方案（不动）
     OPS_handbook.md              ← 运营手册（不动）
     BOOTSTRAP_new_project_handbook.md ← 新项目引导（不动）
     workorders/                  ← 已完成的工单归档
     handoffs/                    ← 交接文档
     postmortems/                 ← 事故复盘
   research/                      深度调研材料（已有，保持）
   spec/                          运维规范（已有，保持）
   guide/                         使用指南（已有，保持）
```

### 三个新入口文件的功能边界

| 文件 | 回答的问题 | 更新频率 | 替换谁的功能 |
|------|-----------|----------|-------------|
| `INDEX.md` | "有哪些文档？哪个是最新的？哪个做完了？" | 每轮开发后 | progress.md 的"总览"部分（progress.md 保留为叙事历史） |
| `00_CURRENT.md` | "现在项目整体是什么状态？卡在哪？下一步是什么？" | 状态变化时 | active_spec.md 的"交接/备注"功能（active_spec 保留为轮次任务清单） |
| `DECISIONS.md` | "为什么当初选了 A 而不是 B？这个决策还有效吗？" | 新决策产生时 | 散落在 plan/auditlog 中的决策片段 |

### 关系图

```
人类 / Codex / Claude 新会话启动
          │
          ▼
    00_CURRENT.md  ← 冷启动第一站："现在在哪"
          │
          ├─→ INDEX.md  ← "找具体文件"
          │
          ├─→ DECISIONS.md  ← "理解为什么"
          │
          └─→ active_spec.md  ← "这轮具体做什么"
                 │
                 └─→ plan/ → executionlog/ → auditlog/（三代理闭环）
```

### 🔴 硬边界规则：三份文件不互抄

```
00_CURRENT.md     ← 只写"当前状态 + 下一步"
progress.md       ← 只写"历史叙事"
DECISIONS.md      ← 只写"长期有效的裁决"
```

**同一句话不得同时出现在三份文件中。** 最多一份是正文，另外两份只放引用（文件路径 + 条目 ID）。

| 如果一句话说的是 | 正文放在 | 另外两份 |
|-----------------|---------|---------|
| "本轮做了什么、什么时候做的" | progress.md | DECISIONS 不写；00_CURRENT 只写"本轮状态见 progress.md §X" |
| "现在项目是什么状态、下一步" | 00_CURRENT.md | progress 不写（那是过去）；DECISIONS 不写（那是裁决） |
| "为什么选 A 不选 B、这个决策还有效吗" | DECISIONS.md | progress 引用决策 ID；00_CURRENT 引用决策 ID |

**为什么这条规则重要**：三份文件各自更新节奏不同（00_CURRENT 随时变、progress 每轮追加、DECISIONS 偶尔增改）。同一事实复制三处，必然出现 A 更新了 B 没更新 → 复盘时互相矛盾。正文只一处，另外两处引用——查到正文就查到唯一真相。

---

## 4. 目录结构草案

```
doc/
├── INDEX.md                        ★新增
├── 00_CURRENT.md                   ★新增
├── DECISIONS.md                    ★新增
│
├── progress.md                    保持：项目历史轨迹，只增不减
├── active_spec.md                 保持：当前轮任务详情，每轮替换
│
├── plan/                          保持：{feature}-plan.md
├── executionlog/                  保持：{feature}-log.md
├── auditlog/                      保持：{feature}-audit.md
│
├── reference/
│   ├── TECH_PLAN_v2.md            保持不动（长期权威）
│   ├── OPS_handbook.md            保持不动（长期权威）
│   ├── BOOTSTRAP_new_project_handbook.md  保持不动
│   ├── competitor-shuzi-analysis.md       保持不动（分析参考）
│   ├── M3_content_prompts.md              保持不动（提示词参考）
│   ├── M3_peiti_acceptance.md             保持不动（验收参考）
│   ├── M3_peiti_nodes_batch1.md           保持不动（数据参考）
│   │
│   ├── workorders/                ★新增子目录
│   │   ├── get-notes-interaction-research-workorder.md   移入
│   │   ├── get-notes-research-workorder.md               移入
│   │   ├── photo-guide-workorder.md                      移入
│   │   ├── vlm-transcribe-workorder.md                   移入
│   │   ├── M3_node_extraction_workorder.md               移入
│   │   ├── M3_peiti_workorder_M2a_BG.md                  移入
│   │   ├── M3a_plan_revision_workorder.md                移入
│   │   ├── M3c_session_pdf_workorder.md                  移入
│   │   └── 开发第一轮工单与提示词.md                       移入
│   │
│   ├── handoffs/                  ★新增子目录
│   │   ├── HANDOFF_project_handoff.md                    移入
│   │   └── HANDOFF_to_codex_tech_review.md               移入
│   │
│   └── postmortems/               ★新增子目录
│       └── M2-prod-contamination-postmortem.md           移入
│
├── research/                      保持不动（深度调研）
├── spec/                          保持不动（运维规范）
├── guide/                         保持不动（使用指南）
│
├── [根级运维文档]                  暂不动（Phase 3 再考虑归类）
│   ├── HTTPS_SETUP.md
│   ├── LOGGING_GUIDE.md
│   ├── MARKDOWN_GUIDE.md
│   ├── PROJECT_OVERVIEW.md
│   ├── operational_flow.md
│   ├── release-guide.md
│   ├── setup-wsl-network.md
│   └── TABLE_RECOGNITION.md
```

---

## 5. 命名规则

### 5.1 新文件的命名规范

```
格式：YYYY-MM-DD_HHMM_<artifact>_<topic>.md

artifact 类型：
  workorder    工单（派给 AI 或人类的明确任务）
  review       评审结论（对某产出的评审判断）
  handoff      交接文档（模型/人员切换时的上下文传递）
  postmortem   事故复盘
  research     调研报告
  decision     独立决策记录（一般直接写 DECISIONS.md，不单独建文件）
  plan         实施计划（放在 doc/plan/，沿用 {feature}-plan.md）
  log          执行日志（放在 doc/executionlog/，沿用 {feature}-log.md）
  audit        审计报告（放在 doc/auditlog/，沿用 {feature}-audit.md）

HHMM 为 24 小时制文件的创建时刻（非最后修改时刻）。
workorder / review / handoff / postmortem 四类必须带 HHMM；
research 类推荐带 HHMM；
plan / log / audit 在各自目录沿用既有 {feature}-{type}.md 命名，不带时间戳。

示例：
  2026-06-19_1430_workorder_bkt-revisit.md
  2026-06-19_0900_review_m4-probe-design.md
  2026-06-19_1715_handoff_claude-to-codex.md
  2026-06-19_1120_postmortem_api-timeout.md
  2026-06-19_research_community-survey.md        （research 可不带时分，但推荐带）
```

**为什么用 HHMM 而不是只用日期**：本项目已出现同一天多轮 review/workorder/handoff 的情况（见 `doc/reference/` 中同日期多个 M3 相关文件）。加时间戳后文件名天然按时间排序，且几乎不可能撞名。此约定直接对齐 cross_project_alignment WS-002。

### 5.2 既有文件：不重命名

遵循 cross_project_alignment 的 WS-002 原则——**旧文件保留原名**。重命名的成本（更新交叉引用、git 历史断裂、人类记忆混乱）远超收益。

INDEX.md 会建立从旧文件名到新位置的映射，所以不需要靠改名来组织。

### 5.3 日期前缀规则

- **日期取文件创建当天的日期**（不是最后修改日），**时分取创建时刻**（24 小时制）
- workorder / review / handoff / postmortem 四类：`YYYY-MM-DD_HHMM` 必填
- research 类：推荐带 HHMM，允许不带（纯调研文件时间精度要求低）
- 入口文件（INDEX / 00_CURRENT / DECISIONS）不加日期——它们是"活文件"，始终代表当前
- 同一分钟不可能有两份同 artifact 文件（HHMM 精度已足够防撞名）

### 5.4 计划/日志/审计的命名保持

`doc/plan/`、`doc/executionlog/`、`doc/auditlog/` 下的文件沿用既有约定：`{feature}-{type}.md`。这些文件已经通过目录隔离，不需要日期前缀。

---

## 6. 状态字段 / 生命周期

### 6.1 文档状态（用于 INDEX.md）

| 符号 | 含义 | 何时用 |
|------|------|--------|
| 🔥 | 当前焦点 | 正在施工的 active thread |
| 🟡 | 进行中 / 待处理 | 已派发但未完成的工单、待评审的产出 |
| ✅ | 已完成 / 已验收 | 工单执行完毕、评审通过、事故已闭环 |
| ⬜ | 待开始 | 已规划但未派发 |
| 📦 | 已归档 | 已完成且不再活跃引用的历史文件 |
| ⚠️ | 有条件通过 | 审计通过但有 findings 待修 |
| ❌ | 已废弃 | 决定不做了的工单/方案 |

### 6.2 决策状态（用于 DECISIONS.md）

| 状态 | 含义 |
|------|------|
| `proposed` | 提出待定，需人类拍板 |
| `accepted` | 已采纳，当前有效 |
| `active` | 长期约束，持续生效中（如门禁规则） |
| `done` | 已执行完毕，不再需要跟踪 |
| `superseded` | 被后续决策取代（保留历史，标注取代者） |
| `frozen` | 冻结基线，非特殊原因不得修改 |
| `released` | 门禁已通过，不再约束 |

### 6.3 文档生命周期

```
[创建] → 🟡 进行中 → ✅ 已完成 → 📦 归档（移入子目录）
                           ↓
                        ⚠️ 有问题 → 修复 → ✅
                           ↓
                        ❌ 废弃（保留文件，标记状态）
```

### 6.4 决策生命周期

```
[提出] → proposed → accepted → active（长期约束）
                      ↓              ↓
                  superseded      done / released
                  （被取代）
```

---

## 7. 落地步骤（分阶段）

### Phase 1：建立索引层（立即，零破坏，~30 分钟）

**只新增文件，不移动任何旧文件。**

1. **创建 `doc/INDEX.md`**
   - 列出全部现有文件（按目录分组，按时间倒排）
   - 标注状态 emoji（根据当前已知信息）
   - 每文件一行，含一句话说明
   - 开头写阅读顺序指引

2. **创建 `doc/00_CURRENT.md`**
   - 写当前项目整体状态（从 progress.md 和 active_spec.md 摘取）
   - 写 Freshness Check 区块
   - 写 Handoff 区块（给下一个接手 AI 的冷启动指令）
   - 写 Do Not Reopen 列表（已冻结的决策）

3. **创建 `doc/DECISIONS.md`**
   - 从 progress.md 提取已知的技术决策（M1 新表不嵌字段、KST→BKT 数据流方向等）
   - 从各 plan/auditlog 中提取关键裁决
   - 用 D-### 编号，标注 status
   - 不必一次性穷举——先写当前仍有效的 5-10 条
   - 末尾设"开放项速查"

4. **更新 CLAUDE.md**
   - 在"文档路径速查"表中新增 INDEX / 00_CURRENT / DECISIONS 三行
   - 在"权威技术文档"节增加"入口层"说明

**产出物**：3 个新文件 + 1 处修改。零破坏，旧文件全部在原位。

### Phase 2：轻量重组 reference/（下一轮开发前，~30 分钟）

**创建子目录 + 移动文件 + 链接保全检查。**

1. 在 `doc/reference/` 下创建三个子目录：`workorders/`、`handoffs/`、`postmortems/`
2. 将对应文件移入（见 §4 目录结构），用 `git mv` 保留 git 历史
3. 在 `doc/reference/` 下创建一个极简说明文件（1-2 段文字，说明子目录用途）
4. **链接保全检查（🔴 必做，否则出现"目录是新的、链接还是旧的"半迁移状态）**：
   - 更新 `INDEX.md` 中所有移动文件的路径
   - 用 `grep -rn "doc/reference/" doc/` 扫全仓引用，逐个修正指向已移动文件的旧路径（重点是 `HANDOFF_*.md`、`CLAUDE.md`、`00_CURRENT.md`、`progress.md` 中的引用）
   - 抽查 3-5 个高频入口文件，确认引用路径已指向新位置
   - 若发现外部文件（如 `.claude/commands/*.md`）引用了被移动的文件，一并修正

**产出物**：3 个新子目录 + 12 个文件移动 + INDEX 更新 + 全仓引用修正。移动后所有文档互链指向新路径。

### Phase 3：持续执行（每轮开发后，~5 分钟）

**养成更新习惯。**

每次 `/plan → /execute → /audit` 闭环后：
1. 三代理各自在产出文件后，检查是否需要更新入口文件
2. 审计代理在 audit 报告中增加"文档治理检查"项：
   - [ ] INDEX.md 是否已更新新文件
   - [ ] 00_CURRENT.md 状态是否仍准确
   - [ ] 本次是否有新决策需写入 DECISIONS.md
3. 人类定期抽查（每 3-5 轮看一次 INDEX.md 和 00_CURRENT.md 是否过时）

### 后续可选（不在本方案范围）

- `doc/` 根级运维文档归类（HTTPS_SETUP 等 8 个文件 → `doc/ops/`）
- GLOSSARY.md（等术语积累到 30+ 条再建）
- PRINCIPLES.md（等评审方法论积累 5+ 条有真实范例的原则再建）

---

## 8. AI 操作规范（Codex / Claude 写文档和更新状态的规则）

### 8.1 新增文件时

```
1. 判断文件类型 → 选择正确目录

   | 文件是… | 放哪里 | 命名 |
   |---------|--------|------|
   | 实施计划 | doc/plan/ | {feature}-plan.md |
   | 执行日志 | doc/executionlog/ | {feature}-log.md |
   | 审计报告 | doc/auditlog/ | {feature}-audit.md |
   | 工单（新） | doc/reference/workorders/ | YYYY-MM-DD_workorder_{topic}.md |
   | 评审结论（独立） | doc/reference/ | YYYY-MM-DD_review_{topic}.md |
   | 交接文档 | doc/reference/handoffs/ | YYYY-MM-DD_handoff_{from}-to-{to}.md |
   | 事故复盘 | doc/reference/postmortems/ | YYYY-MM-DD_postmortem_{topic}.md |
   | 调研报告 | doc/research/ | YYYY-MM-DD_research_{topic}.md |

2. 创建文件后立即更新 INDEX.md
   - 在对应日期段插入一行
   - 标注状态 emoji
   - 写一句话说明
```

### 8.2 产出评审/执行/审计后

```
必须回答三个问题（写在当前文件的末尾或提交信息中）：

[ ] 00_CURRENT 需要更新吗？
    是 → 更新当前主线状态、阻塞项、下一步
    否 → 说明为什么（如"本轮是纯修复，状态不变"）

[ ] DECISIONS 需要追加吗？
    是 → 分配 ID（D-###）、写 DateTime + Decision + Status
    否 → 说明为什么

[ ] INDEX 需要更新吗？
    是 → 新增/修改文件行、更新状态 emoji
    否 → 说明为什么
```

### 8.3 模型切换时（Claude → Codex，或反向）

```
冷启动流程（固定）：
1. 读 00_CURRENT.md → 了解当前状态
2. 做 Freshness Check → 00_CURRENT 时间戳 vs 目录最新文件
3. 读 DECISIONS.md → 了解有效约束和开放项
4. 读 INDEX.md → 按需找到具体文件
5. 如发现陈旧信息 → 先更新 00_CURRENT，再行动
```

### 8.4 状态更新速查

```
工单完成 → INDEX 中该行 🟡 → ✅
        → 00_CURRENT 中对应线程更新状态

新决策产生 → DECISIONS 追加一行
           → 如影响当前状态，更新 00_CURRENT

事故复盘完成 → INDEX 中该行 🟡 → ✅
             → DECISIONS 追加预防措施条目（如适用）

旧决策被推翻 → DECISIONS 中该行 accepted → superseded
             → 标注取代者 ID
```

---

## 9. 风险与例外

### 9.1 主要风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 入口文件过时（写了但没人更新） | 比没有更糟——信任崩塌 | 审计代理每轮检查文档治理项；人类每 3-5 轮抽查 |
| 过度治理（建太多文件） | 维护负担 > 收益 | 坚持 Phase 1 做最小集；不通过的入口文件坚决不建 |
| 旧文件链接断裂（Phase 2 移动后） | 旧 plan/auditlog 中的相对路径失效 | INDEX 提供新旧路径映射；HANDOFF 文档中的路径手动更新 |
| Codex 不遵守规范 | 回到散落状态 | 在 HANDOFF 和 00_CURRENT 中显式写操作规则；代码评审时纠正 |

### 9.2 例外情况

- **紧急修复**：可以跳过文档治理步骤，事后在 audit 中补登记
- **纯实验性分支**：不在 INDEX 中登记，分支合并后再登记
- **批量数据文件**（如 extracted/ 下的图片）：不在 INDEX 中逐文件登记，只在 INDEX 中登记目录级别的说明

### 9.3 回滚

- Phase 1 回滚：删除 3 个新文件 + 还原 CLAUDE.md 改动。零代价。
- Phase 2 回滚：`git revert` 移动提交。文件内容无损，只是路径变回去。
- 如果在 Phase 3 发现治理方案不适用：停止更新入口文件即可，它们变成历史快照，不影响既有工作流。

---

## 10. 建议执行顺序

| 顺序 | 动作 | 优先级 | 预计工作量 |
|------|------|--------|-----------|
| 1 | 创建 `doc/INDEX.md` | 🔴 最高 | 30 min |
| 2 | 创建 `doc/00_CURRENT.md` | 🔴 最高 | 20 min |
| 3 | 创建 `doc/DECISIONS.md` | 🔴 最高 | 30 min |
| 4 | 更新 `CLAUDE.md` 文档路径表 | 🟠 高 | 5 min |
| 5 | 创建子目录 + 移动 reference/ 文件 + 链接保全检查 | 🟡 中 | 30 min |
| 6 | 更新 `.claude/commands/audit.md` 加文档治理检查项 | 🟡 中 | 10 min |
| 7 | 后续每轮：执行 AI 操作规范（§8） | 🟢 持续 | 5 min/轮 |

**Phase 1（步骤 1-4）可立即执行，零破坏，无需移动任何旧文件。**

---

## 11. 备选方案（不推荐）及其代价

| 方案 | 描述 | 代价 |
|------|------|------|
| A. 不做任何改动 | 维持现状，继续用 progress.md + active_spec.md | 上下文碎片化持续恶化；Codex 每次接手需 40 分钟阅读；决策追溯靠人脑记忆 |
| B. 全部文件重命名 + 大重构 | 一次性把所有旧文件按新命名规范改名，重新组织所有目录 | 交叉引用全断；git 历史丢失；工作量大（2-3 小时）；出错了难回滚 |
| C. 只加 INDEX，不加 00_CURRENT/DECISIONS | 做一个文件清单就停 | 只解决了"找文件"，没解决"知道状态"和"理解决策"。聊胜于无 |
| D. 照搬 cross_project_alignment 全套 | 建 README + INDEX + 00_CURRENT + DECISIONS + GLOSSARY + PRINCIPLES | 过度治理。本项目文件量只有对方 1/3，术语量和评审方法论积累都不够撑起 6 个入口文件 |

---

## 12. 结论

### 推荐采用

**推荐理由**：

1. **现实痛点明确**：`doc/reference/` 已经混到人类也需要猜"这是干嘛的"，Codex 每次接手需要读 40 分钟，这不可持续。
2. **方案极轻量**：Phase 1 只新增 3 个文件 + 改 1 处 CLAUDE.md，零破坏，30 分钟可完成。
3. **有成熟参照**：cross_project_alignment 已经跑通了这套模式（150+ 文件、6 周密集评审），证明入口层 + 命名约定 + sync check 是可行的。
4. **不强求完美**：旧文件不重命名、不一次性大重构、可选文件（GLOSSARY/PRINCIPLES）等积累够了再建。方案本身就遵循"最小范围、纯增量先行"的原则。
5. **回滚成本极低**：Phase 1 如果觉得不好用，删 3 个文件就回到原点。
6. **与三代理框架天然契合**：审计代理的检查清单加一项"文档治理检查"，就能形成闭环。

### 不建议的替代方案

方案 B（一次性大重构）和方案 D（照搬全套）都不建议——原因见 §11。

如果连 Phase 1 都不想现在做，至少建议先执行**最小子集**：创建 `doc/INDEX.md`（步骤 1）。这是单文件、零破坏、收益最大的一个动作——让人类和 AI 都能一眼看到有哪些文档、各自是什么状态。
