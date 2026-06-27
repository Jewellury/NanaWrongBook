# NanaWrongBook 总纲文档

> 性质：`/plan` 阶段产出。整合所有已有结论，供任何新 agent 冷启动时快速理解项目全貌和执行边界。
> 产生日期：2026-06-27
> 关联文档：`nana-development-phases.md`（分步骤开发计划）、`capture-to-diagnosis-closed-loop-redesign.md`（闭环重设计）
> 必读入口（优先级排序）：`AGENTS.md` → `doc/00_CURRENT.md` → `doc/DECISIONS.md` → `doc/reference/TECH_PLAN_v2.md` → `doc/reference/OPS_handbook.md` → **本文档**

---

## 一句话定位

基于 wrong-notebook 的个性化数学诊断辅导系统。面向高二理科生（当前 30-40 分 → 目标 85-95 分），
核心价值是**个人化知识状态地图 + 错因归因式追问**，不自建讲解内容（讲解交给 B 站视频，自己是医生不是药）。

---

## 1. 当前完成度

### 1.1 里程碑进度

| 里程碑 | 状态 | 核心产出 |
|--------|:--:|----------|
| M0 环境搭建 | ✅ | Docker + AI 切 DeepSeek + Git 三分支 |
| M1 知识图谱数据层 | ✅ | 8 张 Prisma 新表 + 48 节点/36 边/18 桥 + 内存图引擎 `lib/graph.ts`（M1 建 8 张，M2+M3a 追加 4 张，累计 12 张） |
| M2 归因流程骨架 | ✅ | 8 步状态机 `lib/session-machine.ts` + 4 个基础 API |
| M3a 追踪骨架 | ✅ | 101 题入库 + KST-lite + BKT + `map`/`initial` API |
| M3c 周末编排+纸质包 | ✅ | 编排器 `lib/diagnosis-orchestrator.ts` + `session-items`/`submit-answers`/`paper-pack` API + 打印页 |
| M3b 配题灌入 | ⬜ | 长尾配题（教研持续线，可并行） |
| M4 探针下探 | ⬜ | 深化诊断推理能力 |

### 1.2 数据层（12 张表）

| 表 | 用途 | 状态 |
|---|------|:--:|
| `KnowledgeNode` | 知识点节点（id/name/layer/stage/tier/videoLinks...） | ✅ |
| `KnowledgeEdge` | 节点间依赖边（prerequisite/tool） | ✅ |
| `Mainline` | 八条主线定义（M0-M7） | ✅ |
| `NodeMainline` | 节点↔主线多对多 | ✅ |
| `MainlineBridge` | 主线间桥接 | ✅ |
| `Item` | 题库（boundary/concept/variant/drill） | ✅ |
| `StudentNodeState` | 学生节点掌握状态（masteryProb/status/slipFlag） | ✅ |
| `DiagnosisSession` | 诊断会话（initial/weekend） | ✅ |
| `ProbeRecord` | 探针答题记录 | ✅ |
| `ErrorRecord` | 错因归因记录（含 evidenceRound/followUpVerified） | ✅ |
| `Misconception` | 误解库（四联体：表现→误解→根节点→追问） | ✅ 表已建 |
| `MistakeNode` | 错题↔节点关联 | ✅ |

种子数据：48 节点 / 36 边 / 18 桥 / 101 题 batch1 已灌入。Misconception 20+ 条四联体待灌入。

### 1.3 诊断逻辑层（5 个核心 lib）

| 模块 | 文件 | 功能 | 状态 |
|------|------|------|:--:|
| 内存图引擎 | `lib/graph.ts` | 邻接表，prereqsOf/allPrereqsOf/dependentsOf/frontier/环检测 | ✅ |
| KST-lite | `lib/kst-lite.ts` | 祖先传播 stable / 后代传播 gap（仅一层 dependents） | ✅ |
| BKT 追踪 | `lib/bkt.ts` | P(L) 贝叶斯更新，T=0.15 G=0.20 S=0.10 | ✅ |
| 会话状态机 | `lib/session-machine.ts` | 8 步状态机 idle→...→closed | ✅ |
| 诊断编排器 | `lib/diagnosis-orchestrator.ts` | boundary 选题 / BKT 作答 / KST 传播 / 纸质包节点选择 | ✅ |

### 1.4 API 层（9 个路由）

| 路由 | 方法 | 用途 | 状态 |
|------|------|------|:--:|
| `/api/diagnosis/sessions` | POST | 创建会话 | ✅ |
| `/api/diagnosis/sessions` | GET | 会话列表 | ✅ |
| `/api/diagnosis/sessions/[id]` | GET | 会话详情 | ✅ |
| `/api/diagnosis/sessions/[id]/probes` | POST | 探针下探 | ✅ |
| `/api/diagnosis/sessions/[id]/errors` | POST | 记录答题错误 | ✅ |
| `/api/diagnosis/map` | GET | 返回 StudentNodeState 地图 | ✅ |
| `/api/diagnosis/initial` | POST | 一步式初诊 | ✅（设计债 TD-2：后续废弃） |
| `/api/diagnosis/session-items` | POST | 编排器分发题目 | ✅ |
| `/api/diagnosis/submit-answers` | POST | 提交答案 → BKT+KST → StudentNodeState | ✅ |
| `/api/diagnosis/paper-pack` | GET | 生成纸质包 | ✅ |

### 1.5 前端层

**全部待建。** 路由命名空间 `/nana` 方案已确定（`doc/plan/frontend-architecture-plan.md`），
已有 HTML 高保真 mockup 5 页（`doc/research/前端设计/`）。前端方案待 Codex 评审后开建。

### 1.6 已有制品

| 制品 | 路径 | 状态 |
|------|------|:--:|
| 纸质包打印预览 | `src/app/diagnosis/paper-pack/page.tsx`（242 行） | ✅ |
| VLM 转写脚本 | `scripts/vlm-transcribe.ts`（384 行） | ✅ |
| 拍照指引 | `doc/guide/photo-guide-*.md` + HTML 打印版 | ✅ |
| 真题转写 | 2024 完整版 / 2025-2026 draft | 🟡 待复核入库 |

---

## 2. 最终目标：四段式闭环

```
采集（单题循环）→ 单题轻反馈（情绪闭环）→ 批量累积
→ 批次诊断（教学闭环）→ 补救动作（开方转诊）
→ 复诊验证（疗效确认）→ 结果回流（更新知识状态）
```

### 2.1 四段本质区别

| 步骤 | 角色 | 置信度 | 用户感知 |
|------|------|--------|----------|
| **单题轻反馈** | 情绪闭环——让她感到被回应 | 低，明确标注"只是线索" | "有人在听我说" |
| **批次诊断** | 教学闭环——真正可信的判断 | 中高，多题交叉验证 | "原来我卡在这几个点上" |
| **补救动作** | 开方转诊——不是终点 | — | "看这个视频/做这几道题" |
| **复诊验证** | 疗效确认——防止假性闭合 | 高，用题验证 | "做完确认一下是不是真懂了" |

**核心区分**："单题轻反馈"是情绪闭环、"批次诊断"才是教学闭环。前者不能替代后者。

### 2.2 总架构图

```
前端 /nana 路由命名空间（全部 🟡 待建）
├── /nana                 场景入口（两个行动按钮：拍题 / 口述）
├── /nana/capture         采集壳（题图固定 + 录音/转写/提要 tab + 单题轻反馈区）
├── /nana/knowledge-map   知识地图（阶段 1：绿点 + 前沿）
├── /nana/session         周末诊断（答题 → 提交 → 批次诊断报告 → 纸质包）
└── /nana/paper-pack      纸质包预览

API 层
├── ✅ /api/diagnosis/*  9 个路由（已实现）
└── ⬜ /api/nana/*        case/artifact API + ASR 中转（待建）

诊断逻辑层（全部 ✅ 已实现）
├── lib/graph.ts          内存图引擎
├── lib/kst-lite.ts       KST-lite 传播
├── lib/bkt.ts            BKT 贝叶斯追踪
├── lib/session-machine.ts 8 步状态机
└── lib/diagnosis-orchestrator.ts 诊断编排器

数据层（全部 ✅ 已实现）
└── 12 张 Prisma 新表 + 种子数据
```

---

## 3. 优先级分层

### 3.1 P0（第一阶段必须完成）

| 能力 | 说明 | 当前状态 |
|------|------|:--:|
| **case/artifact API** | 采集壳需要存 case，没有它采集壳只是截图工具 | ⬜ 待建 |
| **采集壳（/nana + /nana/capture）** | 产品主验证点——验证"题图固定可见的陪伴式录音"能否在 UI 上成立 | ⬜ 待建 |

### 3.2 P1（第二阶段优先）

| 能力 | 说明 | 当前状态 |
|------|------|:--:|
| **单题轻反馈** | 采集壳内嵌子任务——拍完题 3 秒内给文字回应（情绪闭环），不伪装成终诊 | ⬜ 待建 |
| **知识地图** | 产品灵魂界面。阶段 1 只做绿点 + 前沿，后端 map API 已就绪 | ⬜ 待建 |
| **批次诊断报告** | 真正的教学闭环。后端编排器和 session-items API 已就绪 | ⬜ 待建 |
| **Session UI** | 后端 API 100% 就绪，技术上可独立开建 | ⬜ 待建 |

### 3.3 P2（后续阶段）

| 能力 | 说明 | 先决条件 |
|------|------|----------|
| **视频推荐** | 诊断→补救动作。首期人工策展最小集 | 批次诊断和知识图谱可用后 |
| **复诊验证** | 必须与视频推荐成对出现 | 视频推荐完成后 |
| **Newman-lite 追问链** | 诊断后端受控扩展，非前台功能。仅在"答案对但解释可疑"时触发 | LLM 调用启用（D-8 解除） |
| **方法族内部标签** | 只做后端内部聚类维度，不前台化 | 批次诊断可用后 |
| **ASR/VLM 后端接通** | 豆包流式 ASR 中转 + VLM 识图 | 采集壳 UI 稳定后 |

### 3.4 暂缓 / 开放项

| 能力 | 原因 |
|------|------|
| **方法族地图前台化** | 没成熟先例，教师一致性未验证。首期只做内部标签 |
| **全自动 AI 变式题** | 数学题生成的干扰项教学对齐度不足。首期走已有题库推荐 |
| **FSRS 自适应复习排程** | 等诊断→补救→复诊闭环稳定后再接入 |
| **Block editor** | 采集壳用普通 React 组件 + 固定布局即可 |
| **本地 ASR**（whisper.cpp/Vosk） | 豆包为首选，等隐私或离线刚需再评估 |

---

## 4. 明确不做什么

| 不做什么 | 原因 | 出处 |
|----------|------|------|
| 不把"单题轻反馈"做成终诊 | 单题置信度不足。轻反馈只能给线索和情绪回应 | 闭环重设计 A.1 |
| 不把方法族地图前台化 | 没公开产品在首屏做这个，教师一致性未验证 | 闭环重设计 A.6 |
| 不做全自动变式题 | AI 干扰项教学对齐度不足。首期用已有题库推荐 | 闭环重设计 A.7 |
| 不做 Block editor | 采集壳用普通 React 组件 + 固定布局 | 架构图方案 §5 |
| 不做 FSRS 复习排程 | 等闭环稳定后接入，非当前瓶颈 | 闭环重设计 A.8 |
| 不按调研报告 6-10 周 Gantt 图排期 | 时间线和范围与当前切片节奏冲突 | 闭环重设计 A.9 |
| 不引入 AFFiNE/BlockSuite/SiYuan 运行时依赖 | 只作结构参考，不是 npm install 对象 | 架构图方案 §5 |
| 不把视频推荐做成自动推荐引擎 | 首期人工策展最小集 | 闭环重设计 D |
| 不改上游表结构 | 安全铁律 3 | DECISIONS.md D-1 |
| 不调 LLM（当前阶段） | 决策 D-8 | DECISIONS.md D-8 |
| 不暴露 Newman 追问链为前台独立步骤 | 追问应内嵌在答题流程中 | 闭环重设计 D |

---

## 5. 核心约束速查

### 5.1 五条设计原则（P1-P5）

| 原则 | 含义 | 出处 |
|------|------|------|
| **P1 图为真相源** | 题图是唯一可信输入，OCR/VLM 只作索引 | TECH_PLAN_v2 §2 |
| **P2 结构先于模型** | 图谱、边界题、错因规则是显式数据；LLM 只在受约束位置工作 | TECH_PLAN_v2 §2 |
| **P3 多问少断** | 粗心 vs 概念不来自单次答错，必须双证据 | TECH_PLAN_v2 §2 |
| **P4 诊断后台化** | 前台不评判，术语清零，只报增量不报缺陷 | OPS_handbook §4 |
| **P5 周末数字化、周中纸质化** | 周末唯一上屏时间，周中输出可打印 PDF | TECH_PLAN_v2 §2 |

### 5.2 前台措辞铁律（P4 细化）

- 不出现"错""失败""得分""未掌握""正确率"等负向词
- 已点亮 = 暖绿发光，下一个 = 蓝色虚线邀请，未探索 = 淡灰影子
- 没有红色、没有橙色警告
- 按钮文案永远是动作本身，不带评判："拍一下这道题""记一下这道""说说看""我听完了"

### 5.3 设计债（在册）

| ID | 内容 | 处理时机 |
|----|------|----------|
| TD-1 | slipFlag 仅单 boolean，复诊需 slipCount | M4 一并处理 |
| TD-2 | /initial 一步式与 submit-answers 路径分叉 | 稳定后废弃 |

### 5.4 已知限制

- KST-lite 只传播一层 dependents（M4 补递归）
- 当前不调 LLM（决策 D-8）
- 单主线诊断（决策 D-9 延续）
- 上游 5 个测试在 `.env.test` 下失败（根因：环境变量隐含默认值假设）

---

## 6. 关键文件路径速查

| 文件 | 用途 |
|------|------|
| `doc/reference/TECH_PLAN_v2.md` | 技术方案权威版（战略/图谱/诊断/BKT/AI管线/路线图） |
| `doc/reference/OPS_handbook.md` | 运营手册（共创者框架/医生模式/上线SOP/前台措辞铁律） |
| `doc/DECISIONS.md` | 技术决策台账（15 D + 4 Gate + 2 TD） |
| `doc/plan/frontend-architecture-plan.md` | 前端架构方案（570 行，路由/组件/复用台账/切片建议） |
| `doc/plan/project-architecture-map-and-priority-plan.md` | 项目全景架构图 + API 缺口清单 |
| `doc/plan/capture-to-diagnosis-closed-loop-redesign.md` | 采集→诊断闭环重设计（P0-P2 优先级表 + 方案边界） |
| `doc/plan/M2-attribution-flow-plan.md` | M2 归因流程计划（7.5 节技术附录含 Prisma 追加代码） |
| `doc/plan/nana-development-phases.md` | 分步骤开发计划（本文档的姐妹篇） |
| `doc/research/前端设计/01-design-foundation.html` | 设计基底（配色/字体/按钮/卡片/节点/语气） |
| `doc/research/前端设计/02-home.html` | 首页 mockup（有记录态 + 空状态） |
| `doc/research/前端设计/03-capture.html` | 采集页 mockup（4 帧：录音前/中/我的话/帮你整理） |
| `doc/research/前端设计/04-knowledge-map.html` | 知识地图 mockup（常规态 + 空状态） |
| `doc/research/前端设计/05-quiz.html` | 周末小测 mockup（3 帧：选择题/填空/跳过接纳） |

---

## 7. 新 agent 冷启动阅读路径

1. **本文档**（了解"什么是什么"）
2. `doc/reference/TECH_PLAN_v2.md` §0-2（战略定位 + 五原则 + 架构图）
3. `doc/reference/OPS_handbook.md` §4（前台措辞铁律，所有 UI 开发必须遵守）
4. `doc/plan/nana-development-phases.md`（知道当前阶段做什么、前后依赖是什么）
5. `doc/plan/frontend-architecture-plan.md` §3（路由/组件组织 + 碰不得清单）
6. `doc/DECISIONS.md` 末尾开放项速查（知道哪些还没定）

---

> 本文档覆盖 `capture-to-diagnosis-closed-loop-redesign.md` 的结论整合、`project-architecture-map-and-priority-plan.md` 的架构总览、
> `frontend-architecture-plan.md` 的路由方案、`M2-attribution-flow-plan.md` 的归因定位。
> 与 `nana-development-phases.md` 互补——本文件管"是什么"，姐妹篇管"什么顺序做"。
