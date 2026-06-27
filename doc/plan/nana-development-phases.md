# NanaWrongBook 分步骤开发计划

> 性质：`/plan` 阶段产出。覆盖从 P0 到 P2 的全部 5 个阶段，标注依赖关系和验收标准。
> 产生日期：2026-06-27
> 姊妹文档：`nana-master-plan.md`（总纲——管"什么是什么"）
> 依赖数据源：`capture-to-diagnosis-closed-loop-redesign.md`（优先级表）、`project-architecture-map-and-priority-plan.md`（接口缺口）、`frontend-architecture-plan.md`（路由/组件方案）

---

## 阶段总览

```
第 1 阶段（P0）→ 第 2 阶段（P1）→ 第 3 阶段（P1）→ 第 4 阶段（P2）→ 第 5 阶段（P2）
   采集基础壳         知识地图          批次诊断+Session     视频+复诊          Newman+ASR
```

---

## 第 1 阶段：采集基础壳（P0）

> 目标：让用户能进入 `/nana`，拍一道题，口述思路，存成 case，并收到一条即时文字回应（单题轻反馈）。
> 这是产品的**主验证点**——验证"题图固定可见的陪伴式录音 + 3 秒即时回应"这个超越体验能否在 UI 上成立。

### 1.0 前置条件

- **无代码依赖**：后端 graph/bkt/kst/orchestrator 已全部就绪，但本阶段不碰诊断逻辑
- **路由方案已定**：`doc/plan/frontend-architecture-plan.md` §3 已确定 `/nana` 命名空间和组件目录
- **设计基底已定**：`doc/research/前端设计/01-design-foundation.html`（配色/字体/按钮/语气）
- **Mockup 已有**：首页 `02-home.html`、采集页 `03-capture.html`

### 1.1 任务分解

#### 任务 1A：case/artifact API（后端 + 数据）

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **数据** | 新增 `Case` 表（Prisma model）：id / studentId / createdAt。新增 `Artifact` 表：caseId / type（image/audio/transcript/aiSummary）/ url 或 content / createdAt。不改上游表。 | `prisma/schema.prisma` 末尾追加 |
| **API** | `POST /api/nana/cases`：创建 case（接收题图 URL + 录音 URL + 逐字稿文本 + AI 提要文本）。`GET /api/nana/cases/:id`：读取单条 case 及其 artifact 列表。 | `src/app/api/nana/cases/route.ts`<br>`src/app/api/nana/cases/[id]/route.ts` |
| **前端** | `src/lib/nana/nana-api-client.ts`：封装 case API 调用的前端客户端 | `src/lib/nana/` |

**依赖**：Prisma migration（⚠️ 破坏性操作，执行前须向用户确认）

**验收标准**：
- [ ] `Case` + `Artifact` 两张新表创建成功，migration 无错误
- [ ] `POST /api/nana/cases` 能创建 case 并写入 artifact（curl 测试）
- [ ] `GET /api/nana/cases/:id` 返回 case + 全部 artifact 列表
- [ ] API 通过鉴权（复用上游 `getServerSession`）

#### 任务 1B：场景入口首页（/nana）

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **前端** | `/nana` 首页：两个行动按钮（"拍一下这道题""补一段你当时怎么想的"），不出现诊断结论。有记录态显示"上次你点亮了：XX"（绿色 recap bar）+ "看看我的知识地图 →"链接。空状态显示"你的光点地图还空着，第一道题会点亮第一个光点"。 | `src/app/nana/page.tsx`<br>`src/components/nana/shared/nana-layout.tsx` |
| **前端** | `/nana/layout.tsx` 段级布局：鉴权检查（`getServerSession`），未登录 redirect `/login`。包裹 `nana-layout` div。 | `src/app/nana/layout.tsx` |
| **API** | 复用已有 `GET /api/diagnosis/map` 获取最新点亮节点名用于首页 recap bar | 不改 API |

**依赖**：任务 1A（case API 供首页读取最新 case 记录）

**验收标准**：
- [ ] `/nana` 页面可访问，通过鉴权后显示
- [ ] 有记录态：显示 recap bar + 两个行动卡 + 地图链接
- [ ] 空状态：显示两个行动卡 + 空提示
- [ ] 措辞守 P4："拍一下这道题""补一段你当时怎么想的"，不出现"诊断""评估""得分"
- [ ] 按钮点击可跳转到 `/nana/capture`

#### 任务 1C：采集壳（/nana/capture）

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **前端** | `/nana/capture` 采集页：上半屏题图固定可见，下半屏三 tab（讲讲思路 / 我的话 / 帮你整理）。录音控件：波形可视化 + 实时转写文字流（mock 数据）。逐字稿可编辑。 | `src/app/nana/capture/page.tsx` |
| **前端** | 组件：`CaseCard`（四层 artifact 容器）、`VoiceRecorder`（录音控件壳，含 `AsrProvider` 抽象接口）、`TranscriptionPanel`（逐字稿面板）、`QuestionImageViewer`（题图查看器） | `src/components/nana/capture/` |
| **API** | 连接任务 1A 的 case API：拍题 + 录音完成后调用 `POST /api/nana/cases` 存 case | 复用 |

**依赖**：任务 1A（case API）、任务 1B（从首页跳转过来）

**验收标准**：
- [ ] `/nana/capture` 页面可访问
- [ ] 题图区域展示静态图片（mock），不滚动不遮挡
- [ ] 录音按钮可点击，mock 转写文字出现在下半屏
- [ ] 逐字稿 tab 可编辑
- [ ] 帮你整理 tab 显示温和小结（mock）
- [ ] 布局在 390px 手机宽度不崩

#### 任务 1D（子任务）：单题轻反馈

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **API** | `POST /api/nana/cases/:id/feedback`：输入 case 的 voiceTranscript + aiSummary → 返回低置信度提示文本 + 关联知识点/方法族 hints。**本阶段用规则版 stub**（不调 LLM），匹配逐字稿关键词给出固定模板回应。 | `src/app/api/nana/cases/[id]/feedback/route.ts` |
| **前端** | 在采集壳"帮你整理"tab 底部，或拍完题 3 秒内弹出轻反馈区域。模板：①"收到这道题"②"你说的 XX 可能和 YY 有关"③"不是终诊，再拍几道后一起看"。措辞守 P4。 | `src/components/nana/capture/light-feedback.tsx` |

**依赖**：任务 1C（采集壳 UI 必须有显示反馈的位置）

**验收标准**：
- [ ] 拍题 + 说完语音后 3 秒内出现文字回应
- [ ] 回应文案含不确定性表达（"可能""初步线索""再拍几道后一起看"）
- [ ] 不出现掌握度/百分比/分数/终诊判断
- [ ] 不伪装成终诊

### 1.2 HTML Mockup 调整清单（第 1 阶段）

> 以下检查结果基于 `doc/research/前端设计/` 下 5 个 HTML 文件的逐页对比。

#### ✅ 02-home.html（首页）—— 可直接使用

- **与闭环一致性**：有记录态/空状态的行动卡设计已到位，recap bar 只报"点亮了 XX"，守 P4。
- **需要调整**：无需大改。可微调：空状态文案 "第一道题，会点亮第一个光点" 保留。
- **调整项**：无。

#### ⚠️ 03-capture.html（采集页）—— 需加单题轻反馈区域

**当前 mockup 的 4 帧**：
1. 录音前 —— ✅ 可用。题图在上、录音按钮在下的布局正确。
2. 录音中 —— ✅ 可用。波形 + 实时转写流 + "我听完了"按钮的布局正确。
3. 我的话（逐字稿可编辑）—— ✅ 可用。
4. 帮你整理（温和小结 + "一起点亮「配方法」"按钮）—— ❌ **与新闭环冲突**。

**问题**：帧 4 的"帮你整理"tab 里出现了"一起点亮「配方法」"按钮，措辞像诊断结论（"配方法"是知识点定位），且"下一个光点"标签暗示系统已做出知识节点判定。这与"单题轻反馈只给线索不伪装成终诊"冲突。

**需要调整为**：

| 位置 | 当前内容 | 需改为 |
|------|---------|--------|
| 帧 4 "帮你整理"tab | "下一个光点"tag + "一起点亮「配方法」"按钮 | 改为**单题轻反馈区**：① "收到这道关于配方法的题" ② "你说的'配到一半就乱了'可能和配方法步骤有关——但这只是初步线索" ③ "不是终诊，再拍几道后一起看"。底部按钮改为"再拍一道"和"看看我拍过的题"。 |
| 帧 4 小结文案 | "你已经想到先看定义域...它能写成 (x-1)²-4，最小值 -4 就藏在这儿" | 去掉教学讲解（我们不自己讲题，讲解交给视频）。改为："你想到先看定义域，也想到配完全平方——方向很对。这些我都帮你记下来了。" |
| 全局 | 缺少 3 秒即时出现的轻反馈动画 | 新增过渡动画：拍完题+口述完成后，下半屏从"录音"tab 自动切换到"帮你整理"tab，0.3s 内出现反馈文字（带 fade-in），让体感是"立刻被回应"。 |
| 全局 | 缺少"继续拍下一题？" 流程 | 在轻反馈区底部加上"再拍一道"按钮（P0 闭环要求：拍完一道→轻反馈→是否继续拍），以及"拍了 N 道了，开始诊断？"的累积提示（当 N ≥ 3 时出现） |

**调整项标记**：`03-capture.html 需新增「单题轻反馈区」替代当前「帮你整理」tab 的诊断结论式小结。这是第 1 阶段最关键的前端调整。`

#### ✅ 01-design-foundation.html（设计基底）—— 可直接使用

- 配色系统（无红无橙）、字体系统（正文 + 手写体）、按钮系统（pill 形、动作措辞）、卡片/节点/标签、语气对照表 —— 全部适用。
- **调整项**：无。但需补充一行 "单题轻反馈" 的语气规范到 §VOICE 表（"不是终诊，再拍几道后一起看" vs "你的薄弱点是 XX"）。

### 1.3 第 1 阶段整体验收

- [ ] `/nana` 首页可访问，"拍一下这道题" → 跳转 `/nana/capture`
- [ ] 采集壳完整流程：拍题（mock 图片）→ 口述录音（mock 转写）→ 逐字稿可编辑 → 轻反馈即时出现
- [ ] case 创建成功写入数据库（artifact 含 image/audio/transcript/aiSummary）
- [ ] 轻反馈文案守 P4（不评判、不终诊、含不确定性表达）
- [ ] 措辞全局检查：无"错""失败""得分""未掌握""正确率"等词
- [ ] 零上游文件修改（验证：`git diff --name-only` 只包含 `src/app/nana/`、`src/components/nana/`、`src/lib/nana/`、`prisma/schema.prisma` 末尾、`src/app/api/nana/`）

---

## 第 2 阶段：知识地图（P1）

> 目标：展示知识图谱，只亮已掌握的绿点 + 1-2 个下一个前沿（蓝色虚线邀请），不铺一片红。
> 产品灵魂界面——"看到进步"的可视化证据。

### 2.0 前置条件

- **第 1 阶段完成**：`/nana` 首页已有"看看我的知识地图 →"入口链接
- **后端 API 已就绪**：`GET /api/diagnosis/map` 返回 StudentNodeState 列表（含 masteryProb/status）
- **设计基底已有**：节点三态（绿发光 / 蓝虚线邀请 / 灰未探索）

### 2.1 任务分解

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **前端** | `/nana/knowledge-map` 页面：阶段 1 只做绿点 + 前沿 + 灰色底图。整张地图始终铺成淡灰底色；点亮过的节点染绿、连线变绿；下一个前沿用蓝色虚线邀请。点击节点弹出详情卡（名称/判定标准/点亮日期）。**不展示红色、不展示数字百分比。** | `src/app/nana/knowledge-map/page.tsx` |
| **前端** | 组件：`KnowledgeMapCanvas`（SVG 力导向图或 React Flow，待选型）、`KnowledgeNode`（节点组件）、`KnowledgeFrontier`（前沿指示） | `src/components/nana/knowledge-map/` |
| **API** | 复用 `GET /api/diagnosis/map`，前端据此渲染节点颜色和连线。**无需新 API。** | 复用 |
| **数据** | 无新表。依赖已有的 StudentNodeState 数据。 | — |

**依赖**：第 1 阶段（首页入口链接）

**验收标准**：
- [ ] `/nana/knowledge-map` 页面可访问
- [ ] 全图灰色底图展示（所有主线节点可见，未探索状态用淡灰）
- [ ] 已掌握节点用绿色发光 + 连线变绿
- [ ] 1-2 个下一个前沿用蓝色虚线标识
- [ ] 点击节点弹出详情卡（含名称、判定标准、点亮日期）
- [ ] 不出现红色节点、不出现数字百分比、不出现"未掌握"标签
- [ ] 空状态：只亮第一个节点，其余全灰，文案"旅程从这一步开始"

### 2.2 HTML Mockup 调整清单（第 2 阶段）

#### ✅ 04-knowledge-map.html（知识地图）—— 可直接使用

- **与闭环一致性**：双帧设计（常规态 + 空状态）正确。灰色底图全铺 + 绿点亮 + 蓝虚线前沿 = 完全守 P4（不铺一片红）。
- **节点详情卡**：底部弹出卡含名称/描述/判定标准/点亮日期，UI 正确。
- **需要调整**：方法族标签**不入图**——闭环重设计已定"方法族 = 内部标签层，不进前台知识地图"。当前 mockup 已满足此约束。
- **调整项**：无。可直接用。

---

## 第 3 阶段：批次诊断报告 + Session UI（P1）

> 目标：串 M3c 已有的全部后端 API，实现"答题 → 提交 → 批次诊断报告 → 纸质包"完整流程。
> Session UI 后端 100% 就绪（9 个 API），这是技术上风险最低的阶段。

### 3.0 前置条件

- **第 1 阶段完成**：`/nana` 首页有入口进入 session 流程
- **后端 API 全部就绪**：`POST /api/diagnosis/sessions`、`POST /api/diagnosis/session-items`、`POST /api/diagnosis/submit-answers`、`GET /api/diagnosis/paper-pack`
- **诊断编排器就绪**：`lib/diagnosis-orchestrator.ts`
- **已有纸质包页面**：`src/app/diagnosis/paper-pack/page.tsx`（242 行）

### 3.1 任务分解

#### 任务 3A：Session 流程 UI

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **前端** | `/nana/session` 列表页：显示历史 session 入口。`/nana/session/[id]` 流程页：逐题作答 UI（答题卡片 + 提交按钮 + 跳过按钮）。进度条：当前题号/总题数。探针下探组件（可选）。 | `src/app/nana/session/page.tsx`<br>`src/app/nana/session/[id]/page.tsx` |
| **前端** | 组件：`SessionFlow`（流程编排）、`QuestionCard`（答题卡片：选择题 + 填空/解答）、`ProbeInteraction`（探针交互） | `src/components/nana/session/` |
| **API** | 连接全部已有 API：创建 session → 获取题目 → 提交答案（触发 BKT+KST）→ 探针下探 → 生成纸质包 | 复用 `api/diagnosis/*` |

**依赖**：第 1 阶段（首页入口 + 无后端新依赖）

**验收标准**：
- [ ] 从 `/nana/session` 创建新 session → 获取题目列表 → 逐题作答 → 提交答案
- [ ] BKT+KST 更新写入 StudentNodeState（可验证 masteryProb 变化）
- [ ] 跳过按钮温和接住（"好，先帮你收起来了" + "等你把前面几步点亮，再回头看它"）
- [ ] 措辞守 P4："记一下这道"（非"提交答案"）、"还没学这个，先跳过"（非"放弃"）

#### 任务 3B：批次诊断报告页

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **前端** | session 完成后展示诊断报告页（聚合多 case 的综合诊断结论）。内容：① 哪些知识点需要关注 ② 主要错因模式（概念性/程序性/计算性...）③ 推荐从哪里开始补 ④ "看这个视频" 入口。不暴露后端算法细节（不讲"BKT""KST""probability"）。 | `src/app/nana/session/[id]/report/page.tsx` |
| **前端** | 组件：`DiagnosisReport`（结论卡片列表）、`RemedySuggestions`（补救建议区） | `src/components/nana/session/` |
| **API** | 复用已有 session 详情 API（含 probes + errors）→ 前端聚合展示 | 复用 |

**依赖**：任务 3A（session 完成后跳转报告页）

**验收标准**：
- [ ] session 完成后自动跳转报告页
- [ ] 报告显示知识点列表（用口语化名称，如"二次函数的配方法"，不显示 KnowledgeNode ID）
- [ ] 报告显示错因模式文字描述（如"你这几道题都在配完平方后算错了"）
- [ ] 报告包含"从这里开始补"建议
- [ ] 不出现后端术语（BKT/KST/masteryProb/tier）
- [ ] 不出现"薄弱点""缺陷""未掌握"等评判词

#### 任务 3C：纸质包预览（/nana/paper-pack）

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **前端** | 在已有 `src/app/diagnosis/paper-pack/page.tsx`（242 行）基础上包一层，统一 `/nana` 路由入口。复用已有打印逻辑和 `@media print` 规则。 | `src/app/nana/paper-pack/page.tsx` |
| **API** | 复用 `GET /api/diagnosis/paper-pack` | 复用 |

**依赖**：任务 3A（session 流程最后一步跳转纸质包）

**验收标准**：
- [ ] `/nana/paper-pack` 可访问，复用已有打印页布局
- [ ] "打印纸质包"按钮可用
- [ ] 纸质包内容不出现诊断结论（守 P4）

### 3.2 HTML Mockup 调整清单（第 3 阶段）

#### ✅ 05-quiz.html（周末小测）—— 可直接用于答题 UI

- **与闭环一致性**：第 2/3 题 + 跳过接纳态设计正确。进度条（圆点）、跳过温和接住文案、按钮措辞"记一下这道"——全部守 P4。
- **需要调整**：需在答题流程结束后新增 `DiagnosisReport` 报告页（当前 mockup 无此页），以及在页面上方或完成后触发纸质包入口。
- **调整项**：新增 `06-report.html` mockup 页（批次诊断报告），要素包括：知识点列表卡片 + 错因模式文字 + 推荐起始点 + "看看我的地图"链接。措辞守 P4，不出现后端术语。

#### ⚠️ /nana/session 列表页 —— 无现有 mockup

- **需新建**：session 列表页 mockup（历史 session 卡片，含日期/题目数/点亮节点数）。
- **调整项**：新增 mockup 页或直接在实现时参考首页 recap bar 风格。

---

## 第 4 阶段：视频推荐 + 复诊验证（P2）

> 目标：在诊断报告后推荐补救视频，看完后用题验证是否真掌握了（防止假性闭合）。
> "推荐视频"不是一个动作的结束，而是一个验证循环的开始。

### 4.0 前置条件

- **第 3 阶段完成**：批次诊断报告页已可用，有知识点列表可做视频映射
- **知识图谱可用**：视频推荐需要节点 `videoLinks` 字段（人工策展的数据）
- **ErrorRecord 字段就绪**：`followUpVerified` 字段已埋在表中（决策⑧）

### 4.1 任务分解

| 维度 | 做什么 | 文件 |
|------|--------|------|
| **数据** | 填充节点 `videoLinks` 字段（B 站视频人工策展，映射到 KnowledgeNode）。首期最小集：5-10 个核心节点的视频。 | 种子数据更新 |
| **API** | `GET /api/nana/remedies?nodeIds=`：根据诊断报告中的知识点列表，返回视频推荐 + 练习推荐 | `src/app/api/nana/remedies/route.ts` |
| **前端** | 诊断报告页新增"补救动作区"：视频卡片（标题/UP 主/时长）+ "看完后回来做一道确认题"提示 | `src/components/nana/session/remedy-card.tsx` |
| **前端** | 复诊验证组件：看完视频后，系统出同知识点确认题 1 道。答对 → `followUpVerified → verified`，知识节点变绿。答错 → 换视频/换讲法/下探前置知识 | `src/components/nana/session/recheck.tsx` |
| **API** | `POST /api/nana/recheck`：复诊题提交 → 更新 ErrorRecord.followUpVerified + 更新 StudentNodeState | `src/app/api/nana/recheck/route.ts` |

**依赖**：第 3 阶段（诊断报告页）、视频策展数据

**验收标准**：
- [ ] 诊断报告页显示推荐视频（含 B 站标题/UP 主/时长）
- [ ] 视频推荐旁有"看完后回来做一道确认题"提示
- [ ] 复诊题答对 → followUpVerified 写入 verified，对应节点 masteryProb 上升
- [ ] 复诊题答错 → 推荐换视频或下探前置知识，不标注"失败"
- [ ] 医生模式闭环完整：诊断 → 开方（视频）→ 复诊（验证题）→ 回流（更新状态）

### 4.2 HTML Mockup 调整清单（第 4 阶段）

- **无现有 mockup 覆盖**：视频推荐卡片 + 复诊验证组件需全新设计，参考诊断报告页的卡片风格。

---

## 第 5 阶段：Newman-lite 追问链 + 方法族标签 + ASR/VLM 接通（P2）

> 目标：接入真实 AI 管线，让采集壳不再是 mock，启用诊断后端的追问链。

### 5.0 前置条件

- **第 1 阶段采集壳已稳定**：AsrProvider 抽象接口已用 mock 实现，契约已定
- **LLM 调用启用**：决策 D-8 解除（需用户主动提升优先级）
- **ErrorRecord 字段就绪**：`newmanStage`/`errorType`/`crossTag`/`rootNodeId`/`evidenceRound`

### 5.1 任务分解

#### 任务 5A：ASR/VLM 后端接通

| 维度 | 做什么 | 先决条件 |
|------|--------|----------|
| **后端** | `/api/nana/asr/stream`：WebSocket 或 SSE 流式中转豆包 ASR → 前端实时转写文字流 | AsrProvider 接口契约已定 |
| **后端** | `/api/nana/asr/file`：HTTP 文件上传 → 豆包文件 ASR → 返回完整逐字稿（流式失败时的 fallback） | 同上 |
| **后端** | VLM 识图管道（产品内，非真题转写脚本）：题图 → 豆包 VLM → 题面文本 | 豆包 Seed2.0 API |

**验收标准**：
- [ ] VoiceRecorder 组件从 mock 切换到真实 ASR
- [ ] 录音后 2-3 秒内出现实时转写文字流
- [ ] 文件 ASR fallback 在流式失败时可用

#### 任务 5B：Newman-lite 追问链

| 维度 | 做什么 | 先决条件 |
|------|--------|----------|
| **后端** | Newman 追问逻辑：在批次诊断中"答案对但解释可疑"时触发。按阅读→理解→转换→过程→表达顺序找最早断点。Prompt 铁律：一次一问、总轮数≤6、绝不讲解给答案、连续两次"不知道"则停止。 | LLM 调用启用（D-8 解除） |
| **后端** | 追问结果写 ErrorRecord（newmanStage/errorType/crossTag/rootNodeId） | — |
| **前端** | 追问不暴露为前台独立步骤——发生在答题流程中，对她只是"再看这道题"。**不标"Newman 第 X 步"** | 闭环重设计 D |

**验收标准**：
- [ ] Newman 追问在"答案对但解释可疑"时自动触发
- [ ] 追问轮数≤6，一次只问一个问题
- [ ] 连续两次"不知道"则停止，不继续追问
- [ ] 追问结果写入 ErrorRecord 各字段
- [ ] 前端不出现"Newman""追问链"标签

#### 任务 5C：方法族内部标签

| 维度 | 做什么 | 先决条件 |
|------|--------|----------|
| **数据** | 填充方法族内部标签（分类讨论/数形结合/换元/定义域优先/等价变形守恒...）到节点或 session 维度 | 内部设计 |
| **后端** | 在批次诊断中作为辅助聚类维度——识别跨知识点的同方法模式（如"对数/根式/奇偶性上定义域'都'漏→识别为定义域优先系统性缺失"） | 批次诊断有足够 case 数据 |
| **前端** | **不前台化**——方法族只在诊断报告中作为文字描述出现（如"你在这几道题里都不太会分情况讨论"），不出现在知识地图中 | — |

**验收标准**：
- [ ] 跨知识节点的同方法偏差能被识别（如 3 道不同知识点的题都漏了定义域）
- [ ] 诊断报告中方法族以描述性文字出现，不独立成图或标签页
- [ ] 知识地图中不出现方法族节点

---

## 附录 A：HTML Mockup 完整审计表

> 逐页对比新闭环（四段式：采集→轻反馈→批次诊断→补救→复诊→回流），标记一致性、调整项和 P4 合规性。

| # | Mockup 文件 | 代表页面 | 与新闭环一致性 | 需加单题轻反馈区 | P4 违规项 | 调整建议 |
|---|-----------|---------|:--:|:--:|------|----------|
| 1 | `01-design-foundation.html` | 设计基底 | ✅ 完全一致 | N/A | 无 | 补充 §VOICE 表：单题轻反馈语气规范 |
| 2 | `02-home.html` | 场景入口首页 `/nana` | ✅ 一致 | N/A | 无 | 可微调：空状态文案保留，无需大改 |
| 3 | `03-capture.html` | 采集壳 `/nana/capture` | ⚠️ 部分冲突 | **需加** | 帧 4 "一起点亮「配方法」" 有诊断结论感；包含教学讲解（"它能写成(x-1)²-4"） | ① 帧 4 改为轻反馈区（3 秒即时回应）② 去除教学讲解 ③ 新增 "再拍一道" 流程按钮 ④ 累积累到 N≥3 时提示"开始诊断" |
| 4 | `04-knowledge-map.html` | 知识地图 `/nana/knowledge-map` | ✅ 一致 | N/A | 无（方法族不入图已满足） | 无 |
| 5 | `05-quiz.html` | 周末小测 `/nana/session/[id]` | ✅ 一致 | N/A | 无 | 需新增 `06-report.html`（批次诊断报告页）；新增 session 列表页 |
| 6 | *(不存在)* | 批次诊断报告 | — | N/A | — | **需新建 mockup** |
| 7 | *(不存在)* | 视频推荐 + 复诊验证 | — | N/A | — | **第 4 阶段再建，不急** |

### 最高优先级调整项（第 1 阶段必须处理）

1. **`03-capture.html` 帧 4 "帮你整理" tab** —— 必须从"教学小结 + 诊断结论"改为"单题轻反馈"。
   - 去掉："下一个光点"tag、"一起点亮「配方法」"按钮、教学讲解内容（"它能写成 (x-1)²-4..."）
   - 改为：低置信度提示 + 不确定性措辞 + "再拍一道"按钮 + 累积 N≥3 时的"开始诊断"提示
   - 新增：拍完题 3 秒内的过渡动画（从"录音"tab → "帮你整理"tab + fade-in 文字回应）

2. **新增 `06-report.html`**（批次诊断报告 mockup）—— 第 3 阶段开建前必须有。
   - 要素：知识点列表卡片（口语化名称）、错因模式文字描述、推荐起始点、"看看我的地图"链接
   - 约束：不出现后端术语、不出现百分比/分数、不出现"薄弱点""未掌握"

### P4 合规性全局检查

| 检查项 | 状态 | 备注 |
|--------|:--:|------|
| 不出现"错""失败""得分" | ⚠️ | 03-capture 帧 4 "一起点亮「配方法」"有诊断结论感，需改 |
| 不出现红色/橙色警告态 | ✅ | 配色系统无红无橙 |
| 按钮措辞不评判 | ✅ | "拍一下""记一下""说说看"——全部动作为主 |
| 知识地图不铺一片红 | ✅ | 灰底图 + 绿点 + 蓝虚线的三态设计正确 |
| 术语清零 | ⚠️ | 03-capture "配方法"是教学术语，轻反馈中不应用专有名词做终诊判断 |
| 只报增量不报缺陷 | ✅ | 首页 recap bar "你点亮了 XX"——正确方向 |

---

## 附录 B：依赖关系图

```
第 1 阶段
├── 1A case/artifact API ◀── 无依赖
├── 1B /nana 首页 ◀── 依赖 1A（读 case 记录）
├── 1C /nana/capture 采集壳 ◀── 依赖 1A, 1B
└── 1D 单题轻反馈 ◀── 依赖 1C（必须有 UI 位置）

第 2 阶段
└── 知识地图 ◀── 依赖 第 1 阶段（首页入口链接）、map API（已有）

第 3 阶段
├── 3A Session UI ◀── 依赖 第 1 阶段（首页入口）、diagnosis API（已有）
├── 3B 批次诊断报告 ◀── 依赖 3A（session 完成后跳转）
└── 3C 纸质包 ◀── 依赖 3A（session 最后一步）、paper-pack API + 打印页（已有）

第 4 阶段
├── 视频推荐 ◀── 依赖 第 3 阶段（诊断报告页）、第 2 阶段（知识图谱 videoLinks）
└── 复诊验证 ◀── 依赖 视频推荐（必须成对出现）、ErrorRecord.followUpVerified 字段（已有）

第 5 阶段
├── ASR/VLM 接通 ◀── 依赖 AsrProvider 接口契约（第 1 阶段已定）、豆包 API
├── Newman-lite ◀── 依赖 LLM 调用启用（D-8 解除）、ErrorRecord 字段（已有）
└── 方法族内部标签 ◀── 依赖 第 3 阶段（批次诊断有足够 case 数据）
```

---

> 本文档整合了 `capture-to-diagnosis-closed-loop-redesign.md` 优先级表、`project-architecture-map-and-priority-plan.md` 接口缺口、
> `frontend-architecture-plan.md` 路由/组件方案、`M2-attribution-flow-plan.md` Newman 定位。
> 与 `nana-master-plan.md` 互补——本文件管"什么顺序做"，姐妹篇管"什么是什么"。
