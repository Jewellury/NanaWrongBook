# 交接说明 · 致接任「架构 / 技术评审」的 Codex

> 用途：把 NanaWrongBook 的技术现状、工程规约、关键技术决策与理由、以及评审纪律，
> 完整移交给接手技术评审的 Codex。
> 你的前任是一个"战略顾问 / 外部技术闸门"角色（非写代码方）。写代码的是用户本地的**项目 AI（Claude Code，对话模型 DeepSeek）**。
> 你的职责：**评审架构与技术、复核项目 AI 的产出、把关风险**，不直接写代码。用户不懂代码，需要你用大白话 + 替他想安全护栏。

---

## 0. 先读这三份（顺序别错）
1. `doc/reference/HANDOFF_project_handoff.md` —— 战略/产品定位、方法论、P1-P5 设计原则、共创者框架、医生模式。**产品约束的源头**。
2. `doc/reference/TECH_PLAN_v2.md` —— 技术方案权威版（架构四层 + AI 管线 + 知识图谱 + 诊断/BKT）。
3. `doc/reference/OPS_handbook.md` —— 运营手册（措辞铁律、上线 SOP）。
> 这三份已索引到 context-mode 知识库，可 `ctx_search` 检索。`CLAUDE.md` 是项目铁律总纲，必读。

## 1. 一句话
为用户读高三、明年高考的外甥女（安徽，新高考全国 I 卷）做的**个性化数学诊断辅导系统**。她数学很弱（150 分卷曾考 30-40）。核心差异 = 通用 AI 做不到的两件事：**① 持久、结构化的知识状态地图；② 错因归因式追问**。**不是又一个拍照解题/错题本**。
**#1 风险永远是"她会不会持续使用"，不是功能全不全。**

## 2. 技术现状（基于开源 wrong-notebook 增量：Next.js 16 / React 19 / SQLite / Prisma / NextAuth / PWA）

### 已建 Prisma 表（全部新增挂接，从不改上游表）
- **M1 图谱（8 表）**：KnowledgeNode / KnowledgeEdge / Mainline / NodeMainline / MainlineBridge / StudentNodeState / Misconception / MistakeNode
- **M2 归因（3 表）**：DiagnosisSession / ProbeRecord / ErrorRecord（含 evidenceRound、followUpVerified 预留字段）
- **M3a（1 表）**：Item（+ KnowledgeNode.items 虚拟关系，不生列）

### 种子数据
- `prisma/seed_graph_batch1.ts` → 48 节点 / 36 边 / 18 主线桥（19 条悬空边按设计跳过并报数）
- `prisma/seed_items_batch1.ts` → **101 道人工复核过的配题**（M1 A 层 + M2a A 层 + BG 地基），确定性 ID `{nodeId}-{role}-{序号}`，reviewed=true

### 核心逻辑模块（lib/）
- `graph.ts` —— 内存图谱单例；prereqsOf/allPrereqsOf/dependentsOf/mainlineSubgraph/detectCycles；**tool 边与 prerequisite 遍历隔离**（防 BKT 祖先传播污染）
- `kst-lite.ts` —— KST-lite 初诊：答对→祖先链 stable，答错→直接 dependents 标 gap（**只传一层，已知限制**），学习前沿 tier→权重排序、截断 1-2
- `bkt.ts` —— 标准 BKT；**T = 学习转移概率（非遗忘）**，同场 crossSessionT=0、跨 session=0.15；slipFlag（先验≥0.7 且答错）；checkSlipAbuse（连续两 slip）
- `diagnosis-orchestrator.ts` —— 5 个纯函数：boundary 选题 / **applyBKTToAnswers（一道题=一份证据）** / KST 传播 / 纸质包节点选择 / 练习题选择
- `session-machine.ts` —— 周末 8 步状态机（内存，不持久化 state）

### API 路由（src/app/api/diagnosis/）
- M2：sessions（CRUD）；M3a：initial（一步式）、map；M3c：session-items、submit-answers、paper-pack
- 打印页：`src/app/diagnosis/paper-pack/page.tsx`（window.print() + @media print，复用基座打印模式，零 PDF 依赖）

### 测试与基建
- vitest；**测试只走 `docker-compose.test.yml` 测试容器**；`guard-db.ts`（白名单 DB 护栏，挂 setupFiles 首位，非 test 库直接崩）；`test:all` 聚合（`vitest run` 思路，新增测试自动覆盖）；dev.db / test.db 物理隔离
- 当前约 110+ 测试全绿，退出码 0

### 里程碑
M0 环境 ✅ / M1 图谱 ✅ / M2 归因骨架 ✅ / M3a 追踪骨架 ✅ / M3c 周末编排+纸质包 ✅（均审计通过、合 main）
**端到端最小闭环已成立**：建 session → boundary 题单 → 录对错 → 地图落库 → 纸质包 PDF。

## 3. 工程规约与安全铁律（你要守的闸）
- **三代理闭环**：`/plan`（doc/plan）→ `/execute`（doc/executionlog）→ `/audit`（doc/auditlog）。计划未经用户确认不得执行；偏离分微调/大偏离两级；审计须专门复核所有"偏离记录"是否真属微调。
- **双进度文件**：`doc/progress.md`（只增不减）、`doc/active_spec.md`（每轮替换）。
- **Git 三分支**：dev（日常）/ main（稳定）/ sync-upstream（拉上游临时）。origin=用户仓库，upstream=原作者（只拉不推）。
- **安全铁律（CLAUDE.md）**：破坏性操作（migrate/删除/清数据）先确认；保持可回退；**绝不改 wrong-notebook 上游表**；**密钥只进 .env 不进 git**；遇错停下问；**显式失败不掩盖（测试"写了≠过了"，跳过/失败必报数）**；`git reset --hard` 视为最高危单独确认。
- **migrate 前**：确认 diff 只新增、不 ALTER 既有上游表，并按铁律 1 让用户确认。

## 4. 关键技术决策与理由（裁决结果，别轻易推翻）
- **不改上游、新增挂接**：为日后 rebase 上游不冲突。跨表关联（mistakeId→ErrorItem、studentId→User）只存 id + comment，**不建 Prisma relation**（建了要改上游加 back-reference）。
- **SQLite 无 Json 类型**：videoLinks / dialogueLog 用 String 存 JSON 字符串。
- **一道题 = 一份证据**（核心，曾被我两轮盯）：作答节点 BKT 的 pLearn0 取 **StudentNodeState 既有先验**（首诊 0.5），**不取 KST 结构传播值**；KST 只传未作答的祖先/后代。否则同一答案算两遍→地图过度自信变"死"→助长"假性闭合"（违 P3/复诊）。
- **BKT T 是学习转移非遗忘**；同场初诊不逐题衰减。
- **初诊探针只用 boundary**；concept 不进自动判分（归人工/Newman 阶段）；variant 留隔天复测、drill 练熟练。
- **不自动判分**：correct 由调用方（周末 session 人工/前端）给定（P5）。
- **学习前沿 cap 1-2**（P4 渐进展开，绝不一次铺一片红）。

## 5. 已知设计债（在册，别当新发现）
1. KST gap 只传一层 dependents → M4 探针下探时补递归。
2. slipFlag "连续两次"需持久化 slip 历史（现 StudentNodeState 只单 boolean）→ 复诊用，建议加 slipCount。
3. `/initial` 一步式与 `submit-answers` 两步式并存 → 建议稳定后废弃 /initial。
4. studentAnswer 字段（竞品借鉴：错误答案是归因金矿）→ 归因轮加。
5. StudentNodeState 是**快照**（upsert 覆盖），掌握度趋势靠 ProbeRecord 流水还原；要精细曲线再加事件日志表。

## 6. 评审纪律（最重要——我靠这个抓出了真 bug，请你继承）
**核对真文件，绝不只信项目 AI 的摘要。** 每一轮我都读实际产出，因此抓到了这些（都曾被报成"已完成/通过"）：
- **M2 生产库污染**：集成测试在 prod 容器跑、把测试数据写进了 `dev.db`（被当"微调"上报）。→ 引出复盘 + 结构性护栏（DB 护栏白名单 + test:all 自动发现）。
- **空壳测试**：4 个空 body 的 test 自动变绿、"110/110"注水。
- **BKT 双重计数** + 示例数字算错（0.61 应 ≈0.40）。
- 悬空边崩库、三组种子字段名不统一、Item id 撞车（BG102/M2a-38 各 2 道 drill）。
关键口径：**测试"写了≠过了"**；**绿勾要看它声称的意思是否真成立**；**审计要核实"无偏离"是真的无**；**安全路径要确认测试写的是 test.db、dev.db 没被碰**。

## 7. 在飞的并行线（不卡主代码）
- **VLM 真题转写**：火山方舟豆包 VLM（OpenAI 兼容）识图脚本。2024 已用 ground truth 验证通过（前任手工核准了 2024 Q1-4 存于 `doc/research/transcripts/2024-verified.md`，VLM 输出与之逐字吻合）。正放开跑 2024 全卷 + 转 2025/2026。draft 出来需人工复核（重点：has_figure 几何题、压轴、[存疑]、A/B 层通法）。工单见 `doc/reference/vlm-transcribe-workorder.md`。
- **火山方舟配置**：用户进行中（VOLCENGINE_API_KEY/BASE_URL/MODEL 进 .env）。
- **Get笔记交互调研**：为将来"录音采集"环节做交互参考。
- **第 0 阶段人肉回路**：用户已让外甥女线下拍错题；录音工具待定（隐私/导出核完再选 Get笔记 or 手机录音兜底）。
- **配题长尾 / 误解库种子 / 运营回路**：教研/未来轮，backlog 在册（`doc/spec/ops-feedback-loop-backlog.md`）。

## 8. 路线图与下一步
**当前优先级不是写新代码，是"先用真实数据"**——端到端是 API 闭环、还没真人用过、没 UI、只覆盖 M1。建议攒 1-2 周真实使用（人肉回路 + 手动跑 M1 链）再定下一轮。
下一轮代码候选（用户拍板）：① 最小 session UI（让它从"API 能跑"变"她能用"，最贴 #1 风险）② Newman 归因接通（核心差异点，需真实对话素材垫底）③ M4 探针下探。配题长尾随时并行。

## 9. 留给你的几条判断
1. **最大风险是她的持续使用，不是功能**。任何时候把"降低她的使用摩擦、保护动机"放在"功能做全"之上（P4/P5 都为此）。
2. **内容是真瓶颈，不是代码**。图谱质量、配题质量、归因话术才是资产；代码两周能搭。
3. **守医疗级谨慎对待她的情绪**。她是被数学打击过的孩子；"我不行"→"我还差 23 个具体的点"的叙事转换本身就是治疗的一半。
4. **本会话验证了一件事**：竞品（术子错题宝）和一篇家长 AI 错题方法论，都反向印证了我们的路线，且我们更结构化——别被功能清单带跑，继续窄而深。
5. **接外部 AI 产出先验真实性再采纳**：典型病是擅改编码、公式存图无法入库、伪造链接/题目、把教师经验冒充实证、报"已完成"实则空壳。

交接完毕。本会话产出的工单/分析/计划散在 `doc/reference/`、`doc/plan/`、`doc/research/`，文件名自解释。欢迎接任。
