# 第一版聚焦错题采集、初步识别与知识地图挂载 · 开发计划（修订版）

> 关联工单: doc/reference/2026-07-01_1846_workorder_capture-map-v1.md
> 关联规格: doc/spec/capture-layer-design-backlog.md（采集壳四层 artifact 模型）
> 关联参考: doc/reference/TECH_PLAN_v2.md（§知识图谱数据层 / §5 AI 管线）、doc/reference/OPS_handbook.md（§4 前台措辞铁律、§6 主次铁律）
> 关联设计先例: doc/reference/problem-graph-mapping-workorder.md（错题↔图谱关联旧案，用 MistakeNode；本计划 CaseKnowledgeTag 是其演进，见 §7.3）
> 计划日期: 2026-07-01（**修订版 v2**）
> 计划代理: plan-agent
> 预计影响: `src/app/nana/`（首页/采集/知识地图）、`src/app/api/nana/cases/`（新增列表端点 + Stage 3 异步 AI 触发）、`prisma/schema.prisma`（**Stage 2 涉及新增 model，须单独确认**）、`src/lib/nana/`（新增 `asr-transcribe.ts` / `vlm-classify.ts` / `case-classify.ts`）、`scripts/`（清理脚本）、`src/__tests__/`、`e2e/`
> 关联安全铁律: 铁律 1（破坏性操作须确认）、铁律 3（不改上游表结构）、铁律 5/6（遇错停下、显式失败）

---

## 🔔 修订说明（v2 相对 v1 改了什么）

本版按评审反馈重写了**版本定义**：

- **v1（第一版闭环）= Stage 1 + Stage 2 + Stage 3 全部完成**，其中 Stage 3 必须接通**真实 AI**（ASR 语音转文字 + VLM 题图初步分类 + Case 挂到知识点 + 知识地图按知识点看历史错题）。
- **Stage 1 单独上线只能算"动线修正"**——首页三入口、采集后去向、知识地图历史题列表。这是有用的中间产物，但**不是第一版闭环**。
- **Stage 3 不再是 stretch，是 v1 必需项**。
- **ASR 进 v1**（原 DP4 改为"做"）——因为 `scripts/vlm-transcribe.ts` 已离线证明 `doubao-seed-2-0-lite-260215` 能转写音频（同款 OpenAI 兼容接口 + `VOLCENGINE_API_KEY`），Stage 3 是"抽薄封装"，不是从零造 ASR。
- 新增 DP5（ASR 模式：文件式 vs 流式）、DP6（VLM 提示词边界）。

---

## ⚠️ 决策点状态（评审 2026-07-01 拍板）

| # | 决策 | 裁定 |
|---|------|------|
| **DP1** | Case↔知识点连接方式 | ✅ **同意新建 `CaseKnowledgeTag` 表**（追加挂接，不改上游，符合铁律 3）。**进 Stage 2 前必须让 execute-agent 先 `--create-only` 生成 migration SQL，用户看过再允许执行**。 |
| **DP2** | VLM 进 v1 | ✅ 评审已裁定（v1 必需） |
| **DP4** | ASR 进 v1 | ✅ 评审已裁定（v1 必需） |
| **DP5** | ASR 文件式 vs 流式 | ✅ **文件式**（先把录音文件转文字跑通，流式以后再做。孩子补充思路不是实时对话，文件式够用） |
| **DP6** | VLM 提示词边界 | ✅ **只做轻分类**（识别题目大意、候选知识点、置信度、简短理由。不生成深度归因） |
| **DP7** *(新)* | **异步 AI 触发架构** | ✅ **显式 `/process` 端点 + 前端轮询**（详见 §7.4）。**否决"API route 返回后继续跑"**——生产/serverless 不稳。 |
| DP3 | Playwright e2e | 复用已装（非阻塞） |

> **Stage 1 不依赖任何决策点**，可立即开做。DP1 在进入 Stage 2 前就 migration SQL 单独确认。

---

## 1. 大白话概述

现在手机上打开 `/nana`，首页有两个按钮"拍一下这道题"和"补一段你当时怎么想的"，但**两个按钮都跳到同一个采集页**，第二个没有独立意义。采集页保存后只说"收好了"，**没有"去哪看整理结果"的去向**。知识地图页虽然能画出整张知识图谱，但**跟你实际拍过的题完全没关联**——你拍了 5 道题，地图上一个影子都看不到。录音也只是存下来，"我的话"恒显示"尚未转写"。

**第一版闭环（= v1 完整目标）**要做成这样一条主线：

> 首页三个干脆的入口 → 拍一道题（题图 + 可选口述录音）→ **真实 AI 接进来**：录音用 ASR 转成文字、题图用 VLM 看一眼大致属于哪几个知识点 → **把这道题挂到知识地图的知识点上** → 用户在知识地图里**看到按知识点整理的历史错题**。

这条路分四个 Stage：

- **Stage 1（动线修正，可先上线）**：首页三入口、采集后去向、知识地图历史题列表。界面诚实说"识别稍后接入"。**这只是动线修正，不算 v1 闭环完成。**
- **Stage 2（挂载骨架）**：新建 `CaseKnowledgeTag` 表 + 手动/占位挂载，让题能挂到知识点上。
- **Stage 3（真实 AI 接入，v1 闭环必需）**：接通**真实 ASR**（录音→文字）+ **真实 VLM 轻分类**（题图→候选知识点），结果回写数据库。**Stage 1+2+3 全完成才算 v1 闭环。**
- **Stage 4（测试数据清理 + e2e）**：可独立、可提前。

**关键澄清**：ASR 和 VLM 都不是从零造——`scripts/vlm-transcribe.ts` 这个离线脚本**已经证明**火山方舟豆包能识图（`--task=vision`，用 `doubao-seed-2-0-pro`）**也能转写音频**（`--task=audio`，用 `doubao-seed-2-0-lite`，全模态、19 语种转写），走的都是同一套 OpenAI 兼容接口 + 同一个 `VOLCENGINE_API_KEY`。Stage 3 = 把这两条能力从脚本里**抽成请求路径能调的薄封装**，不是重新研发。

**这一版明确不做、也不能让界面假装做了的事**（守 OPS §4 措辞铁律）：不做深度归因、不判断掌握程度、不生成完整学习方案、**不出现"诊断/已诊断/薄弱/得分/掌握/未掌握"**。ASR 转写不准时，UI 说"转写仅供参考，原音为准"（P1：图/音为真相源）；VLM 分类低置信时说"不太确定，先放未分类"，不硬塞。

---

## 2. 当前实现盘点（工单要求 #1）

> 逐文件读过源码后的真实状态。结论：采集壳是真的（Phase 1.5 已硬化），知识地图页也是真的（画的是 48 节点种子图谱），但**两者之间没有任何连接**，且 ASR/VLM 均未进请求路径（只在离线脚本里能用）。

### 2.1 页面

| 页面 | 状态 | 实际行为 | 备注 |
|------|:--:|----------|------|
| `src/app/nana/layout.tsx` | ✅ 真实 | `getServerSession` 鉴权，未登录跳 `/login` | 不动 |
| `src/app/nana/page.tsx`（首页） | 🟡 需重构 | 加载 `/api/diagnosis/map` 判定有/无记录态；**2 个 ActionCard 都 → `/nana/capture`**（"补一段你当时怎么想的"无独立语义）；session 入口在正文中（非一级卡片）；**无知识地图一级入口** | Stage 1 改成 3 个 ActionCard |
| `src/app/nana/capture/page.tsx`（采集页） | 🟡 真实但缺反馈 | 真拍照/真录音/真存库；保存后显示"这道题已经收好了"+1.4s 重置；`captureCount≥3` 才显示"回首页看看"链接；**无"去知识地图"按钮**；"我的话"恒显示"尚未转写"（ASR 未接） | Stage 1 加去向按钮；Stage 3 接 ASR 后"我的话"显示真实转写 + "仅供参考" |
| `src/app/nana/knowledge-map/page.tsx`（知识地图） | 🟡 半成品 | 真实加载 `/api/diagnosis/map`，用 SVG 画 48 节点种子图谱 + 边 + 主线 + 详情卡；**完全不知道用户拍过哪些 Case**，无"未分类题/错题列表"区域 | Stage 1 加错题列表区；Stage 2/3 起按知识点分组 |
| `src/app/nana/session/page.tsx`（周末小检查） | ✅ 真实 | `getSessionList` + `createSessionItems` 真实接通，空/有记录双态正常 | 不动（仅首页提升为一级入口） |

### 2.2 API

| API | 状态 | 实际行为 | 备注 |
|------|:--:|----------|------|
| `POST /api/nana/cases` | ✅ 真实（Phase 1.5 G2 硬化） | type 白名单 4 项 + content ≤2MB + artifacts ≤8，违规 400 | Stage 3 末尾追加异步 AI 触发（不阻塞 201） |
| `GET /api/nana/cases/[id]` | ✅ 真实（Phase 1.5 G1 硬化） | `findFirst({where:{id,studentId}})`，跨用户→404 | 不动 |
| `POST /api/nana/cases/[id]/feedback` | 🟡 真实但闲置 | 关键词规则版轻反馈，Phase 1.5 已停用 | 本版不复活（Stage 3 用 ASR 转写取代"我的话"占位） |
| `GET /api/diagnosis/map` | ✅ 真实 | 返回节点状态 + 学习前沿 + 全量边 + 主线 + 详情字段；**不返回 Case** | 不动，错题列表走新端点 |
| `GET /api/diagnosis/sessions` 等 session 系列 | ✅ 真实（M2/M3c） | session 流程已就绪 | 不动 |
| **`GET /api/nana/cases`（列表，按当前用户）** | ❌ **不存在** | 当前只有 POST 创建 + GET 单个；知识地图要显示"我的错题"必须新增 | Stage 1 新增（无 schema 改动） |
| **Case↔KnowledgeNode 挂载/分类 API** | ❌ **不存在** | 无任何端点把题挂到知识点 | Stage 2 新增（依赖 DP1） |
| **Artifact 内容更新（transcript 回写）** | ❌ **不存在** | 当前只有创建时写 Artifact；Stage 3 ASR 完成后要更新 transcript artifact 的 content | Stage 3 新增更新路径（见 §12.10） |

### 2.3 数据模型（`prisma/schema.prisma`）

| 模型 | 状态 | 关键发现 |
|------|:--:|----------|
| `Case`（id/studentId/createdAt/artifacts） | ✅ nana 自有 | **无任何 nodeId/知识点字段**——本版核心待解的设计题 |
| `Artifact`（type/content/seq） | ✅ nana 自有 | type 注释写"image/audio/transcript/aiSummary"已**过时**（Phase 1.5 实际白名单是 question_image/audio_note/audio_meta/transcript）；Stage 1 顺手订正注释。Stage 3 ASR 完成后会**更新 transcript artifact 的 content**（替换"尚未转写"） |
| `KnowledgeNode`（48 节点）/ `KnowledgeEdge` / `Mainline` / `NodeMainline` / `MainlineBridge` | ✅ | 种子图谱已就绪 |
| `StudentNodeState` / `Misconception` / `MistakeNode` | ✅ | `MistakeNode`（mistakeId↔nodeId，loose String）是 **Case↔node 连接的设计先例**；本版选新建 `CaseKnowledgeTag` 而非复用它，理由见 §7.3 |
| `DiagnosisSession` / `ProbeRecord` / `ErrorRecord` / `Item` | ✅ | session 测评线，与本版主线无直接耦合 |
| **`CaseKnowledgeTag`（Case↔node 连接表）** | ❌ **不存在** | **DP1 待确认 migration 内容后 Stage 2 新增** |

### 2.4 库与脚本

| 文件 | 状态 | 备注 |
|------|:--:|------|
| `src/lib/nana/nana-api-client.ts` | ✅ 真实 | `createCase`/`getCase`/session 系列封装齐全；**缺 `listMyCases`**（Stage 1 补） |
| `src/lib/nana/feedback-rules.ts` | ✅ 真实 | 关键词规则版，有单测；本版不用 |
| `scripts/vlm-transcribe.ts`（384 行） | ✅ **离线脚本已证明 ASR + VLM 双能力** | **vision 任务**用 `doubao-seed-2-0-pro-260215`（`PRO_ENDPOINT_ID`/`PRO_MODEL_NAME`）；**audio 任务用 `doubao-seed-2-0-lite-260215`**（`LITE_ENDPOINT_ID`/`LITE_MODEL_NAME`，全模态：文本+图片+语音+视频，19 语种转写）。两者走**同一套** OpenAI 兼容接口（`openai` npm）+ 同一个 `VOLCENGINE_API_KEY` + `VOLCENGINE_BASE_URL`。它是**读 JPG/音频文件转写整张试卷**的 CLI，**不能直接当请求路径里的库用**——Stage 3 把这两条能力各抽成一个薄 lib |
| `src/__tests__/integration/nana/case-api.test.ts` | ✅ | 已覆盖 G1/G2（Phase 1.5）；Stage 1 扩列表端点 + 隔离测试 |
| `e2e/`（auth-flow / upload-correction / admin-settings） | ✅ | **Playwright 已装且在用**，DP3 不是新依赖；Stage 4 加 nana spec |

---

## 3. 信息架构与职责边界（工单要求 #2）

四个页面各管一件事，不重叠、不互相抢入口：

| 路由 | 职责（一句话） | 这一版做什么 / 不做什么 |
|------|----------------|------------------------|
| `/nana`（首页） | **路口**：告诉用户"今天从哪开始" | **做**：3 个一级入口（拍题/知识地图/周末小检查）+ 有无记录的轻提示。**不做**：不放历史题列表（归知识地图）、不放"补语音"（归历史题详情，未来轮） |
| `/nana/capture`（采集页） | **收一道题**：拍照 + 可选录音 + 存库 | **做**：真拍照/真录音/真存库 + 保存后明确去向（去知识地图/再拍一道）。**Stage 1-2**：措辞"已收好·识别稍后接入"；**Stage 3 ASR 接通后**："我的话"显示真实转写 + "仅供参考，原音为准" + 原音可回放。**不做**：当场同步识图分类（Stage 3 是异步，不阻塞保存） |
| `/nana/knowledge-map`（知识地图） | **看整理结果**：知识点分布 + 历史题 | **做**：上层保留现有 48 节点图谱；下层新增"最近拍过的题"列表。Stage 2 起：题上显示知识点标签；Stage 3 起：VLM 自动挂标签、可按知识点分组查看。**不做**：不做深度归因可视化 |
| `/nana/session`（周末小检查） | **做一批题**：批次测评 | **做**：保持现状（已是真实流程）。仅被首页提升为一级入口 |

**"看所有拍过的题"不单独做成首页入口**——并入知识地图（工单 #2 明确要求）。

---

## 4. 任务分解（按 Stage，每 Stage 可独立上线 · 工单要求 #5）

> 测试策略：逻辑模块（分类 lib、ASR/VLM 薄封装、清理脚本的删前计数）"测试先行"；纯样板（首页卡片、列表端点直通 CRUD）测试后置。每 Stage 结束都跑 `npm run test:all` + `npm.cmd run build`。

### 🟢 Stage 1：首页三入口 + 采集后去向 + 知识地图错题列表（动线修正，可先上线）

**不碰 schema、不接真 AI、措辞全诚实。完成后 = 有用的中间产物（动线修正），但 ≠ v1 闭环。**

- [ ] **S1-1 首页重构**：删"补一段你当时怎么想的"ActionCard；新增"知识地图"ActionCard（→`/nana/knowledge-map`）；把 session 入口提升为"周末小检查"ActionCard（→`/nana/session`）。保留有无记录的轻提示（RecapBar/EmptyHint）但移到三卡片下方。（涉及: `src/app/nana/page.tsx`、可能新增 `src/components/nana/shared/` 的图标配置）
- [ ] **S1-2 采集页保存后去向**：保存成功态在"再拍一道"旁加"去知识地图看看"按钮（→`/nana/knowledge-map`）；措辞诚实——Stage 1 无真识别，**显示"已收好 · 识别稍后接入"**，不显示"正在识别/识别完成"。（涉及: `src/app/nana/capture/page.tsx`）
- [ ] **S1-3 新增"我的错题列表"API**：`GET /api/nana/cases`（无 [id]），返回当前登录用户最近的 Case（默认最近 50 条，`createdAt` 倒序），每条含 `id/createdAt/artifacts(仅 question_image 缩略或标志)/tagStatus`。**带 studentId 归属过滤**（只返回自己的，沿用 G1 思路）。（涉及: 新增 `src/app/api/nana/cases/list/route.ts` 或在 `cases/route.ts` 加 GET handler；`src/lib/nana/nana-api-client.ts` 加 `listMyCases`）
- [ ] **S1-4 知识地图加"最近拍过的题"区**：在现有图谱上方或下方加一个"最近拍过的题"列表区（调 S1-3 端点），空状态显示"还没拍过题，去拍一道 →"。每条显示题图缩略 + 拍摄日期 + 标签状态（Stage 1 恒为"未分类"）。（涉及: `src/app/nana/knowledge-map/page.tsx`、新增 `src/components/nana/knowledge-map/recent-cases-list.tsx`）
- [ ] **S1-5 顺手订正**：`Artifact` 模型 type 注释更新为实际白名单；采集页 `Artifact` 类型注释同步。（涉及: `prisma/schema.prisma` 注释、`cases/route.ts` 注释——**仅注释，零结构改动**）
- [ ] **S1-6 测试**：扩 `case-api.test.ts` 加列表端点 + 用户隔离（A 的 list 看不到 B 的 case）；`npm run test:all` 不回归。

### 🟡 Stage 2：Case↔知识点挂载骨架 + 手动分类（**依赖 DP1 用户确认 migration 内容**）

**新增 `CaseKnowledgeTag` 表（铁律 1 须确认）。仍不接真 AI，分类来源 = manual（人工从 UI 选）或 pending（待识别）。**

- [ ] **S2-1 Prisma 新增 model**（**migration 内容单独确认后做**）：`CaseKnowledgeTag { id, caseId, nodeId, source, confidence, note, createdAt }` + `Case` 加反向关系 `knowledgeTags CaseKnowledgeTag[]`。跑 migration。**execute-agent 必须把 migration SQL 先给你过目再执行**（铁律 1）。（涉及: `prisma/schema.prisma`、`prisma/migrations/`）
- [ ] **S2-2 挂载/分类 lib 骨架**：新增 `src/lib/nana/case-classify.ts`，导出 `classifyCase(caseId)` —— Stage 2 实现 = 诚实返回 `{ tags: [], source: "pending", note: "识别稍后接入" }`；导出 `tagCaseManually(caseId, nodeId, userId)`。（涉及: 新增 `src/lib/nana/case-classify.ts`）
- [ ] **S2-3 挂载 API**：`POST /api/nana/cases/[id]/tags`（人工挂知识点，带归属校验）+ `GET /api/nana/cases/[id]/tags`（读标签）。（涉及: 新增 `src/app/api/nana/cases/[id]/tags/route.ts`）
- [ ] **S2-4 知识地图显示标签**：错题列表每条显示知识点标签 chip（多数为"未分类"，人工挂过的显示节点名）；点 case 可展开"挂到哪个知识点"的小操作（从 48 节点里选）。（涉及: `recent-cases-list.tsx`、可能新增 case 详情弹层）
- [ ] **S2-5 测试先行**：`case-classify.test.ts`（pending 返回契约 + 手动挂载 + 隔离）；tags API 集成测试。

### 🔵 Stage 3：真实 ASR + VLM 初步分类（**v1 闭环必需项，非 stretch**）

**接通两条并行的真实 AI 管线，都从 `scripts/vlm-transcribe.ts` 抽薄封装。异步架构 = 显式 `/process` 端点（评审 DP7），不用"API route 返回后继续跑"。Stage 1+2+3 全完成 = v1 闭环。**

#### 3.0 异步架构（评审 DP7 · 关键）

> ⚠️ **否决"POST /cases 返回 201 后在 route handler 里继续跑 AI"**——Next.js API route 在生产容器/serverless 下，响应返回后 handler 可能被终止，fire-and-forget 不可靠。
>
> **v1 采用评审建议的显式两步式**：
> 1. `POST /api/nana/cases` 只负责保存题图/录音/artifacts，返回 caseId（Phase 1.5 已就绪，**不动**）
> 2. 前端保存成功后，**显式调用 `POST /api/nana/cases/:id/process`**
> 3. `/process` 端点同步执行 ASR + VLM（两条独立 try/catch），更新 transcript artifact + 写 CaseKnowledgeTag，返回处理结果
> 4. 前端显示"识别中…"，调用 `/process` 后**同请求等待结果**（v1 最简：同步等；若超时阈值如 60s 未完成，返回 `status: "processing"` 让前端轮询 `GET /api/nana/cases/:id` 看状态）
>
> **为什么 v1 用同步+轮询 fallback，不上队列/WebSocket**：v1 量级小（单用户错题采集），AI 调用 ~10-30s，同步等 + 超时轮询够用；队列（Redis/BullMQ）/WebSocket 是后续高并发增强，不进 v1。

#### 3a. ASR 管线（录音 → 文字）

- [ ] **S3a-1 ASR 薄封装 lib**：新增 `src/lib/nana/asr-transcribe.ts`，输入 audio_note 的 Base64（webm/mp4）+ mime → 调火山方舟豆包 `doubao-seed-2-0-lite-260215`（复用 `LITE_ENDPOINT_ID`/`VOLCENGINE_API_KEY`，OpenAI 兼容接口）→ 输出 `{ transcript, confidence?, rawResponse? }`。失败 throw（由调用方 catch + 显式日志，不静默，铁律 6）。契约见 §12.11。（涉及: 新增 `src/lib/nana/asr-transcribe.ts`）
- [ ] **S3a-2 transcript 回写**：`/process` 端点内，若 case 含 `audio_note`，调 `asrTranscribe` → 成功后**更新已存在 transcript artifact 的 content**（替换"尚未转写"）。失败显式记日志 + 返回 `asrStatus: "failed"`，UI 显示"转写没接上，原音为准"。（涉及: transcript 更新路径见 §12.10）
- [ ] **S3a-3 "我的话" UI 升级**：采集页/题详情的"我的话"区域——transcript 已更新则显示真实转写文本 + 标注"转写仅供参考，原音为准" + 提供原音回放按钮（守 P1：图/音为真相源）。（涉及: `capture/page.tsx` 及/或 case 详情）

#### 3b. VLM 分类管线（题图 → 候选知识点）

- [ ] **S3b-1 VLM 分类 lib**：新增 `src/lib/nana/vlm-classify.ts`，输入 question_image Base64 → 调火山方舟豆包 `doubao-seed-2-0-pro-260215`（复用 `PRO_ENDPOINT_ID`/`VOLCENGINE_API_KEY`）→ 输出 `{ candidateNodeIds, confidence, rawHint }`。**新提示词**：单题、**只做"大致属于哪几个知识点"的轻分类（DP6）**——识别题目大意、候选知识点、置信度、简短理由；**不做整卷转写、不做题面转写、不生成深度归因**（守 M3 转写分类分离纪律）。（涉及: 新增 `src/lib/nana/vlm-classify.ts`）
- [ ] **S3b-2 挂标签**：`/process` 端点内，若 case 含 `question_image`，调 `vlmClassify` → 成功回写 `CaseKnowledgeTag(source="vlm")`；confidence 低（如 <0.5）不自动挂、留 pending；失败显式记日志 + 返回 `vlmStatus: "failed"`、**不假装成功**（铁律 6）。（涉及: `case-classify.ts` 接真 VLM 分支）
- [ ] **S3b-3 措辞升级**：采集页保存后从"识别稍后接入"升级为"已收好 · 正在看看这题大致属于哪"（process 进行中）/ "可能属于：XXX"（已完成）。**confidence 低时仍说"不太确定，先放未分类"**，不硬塞。（涉及: `capture/page.tsx`）

#### 3c. `/process` 端点 + 前端轮询（DP7 落地）

- [ ] **S3c-1 `POST /api/nana/cases/[id]/process`**：新建端点。鉴权 + 归属校验（沿用 G1）。同步调 ASR + VLM（两条独立 try/catch，一条失败不影响另一条）。响应 `{ asrStatus, vlmStatus, transcript?, tags? }`。带超时保护（如 60s）——超时返回 `status: "processing"` 让前端轮询。（涉及: 新增 `src/app/api/nana/cases/[id]/process/route.ts`）
- [ ] **S3c-2 前端编排**：采集页保存成功（201）→ 显示"识别中…"→ 显式调 `POST /cases/:id/process` → 收到结果更新 UI。超时则轮询 `GET /cases/:id`（看 transcript/tags 是否已落库）。（涉及: `capture/page.tsx`、`nana-api-client.ts` 加 `processCase`/`getCaseStatus`）
- [ ] **S3c-3 测试先行**：`asr-transcribe.test.ts` + `vlm-classify.test.ts`（mock fetch，验证请求体/响应解析/失败处理）；`/process` 端点集成测试（mock ASR/VLM 返回 → transcript artifact 更新 + CaseKnowledgeTag 落库 + 两条管线独立性）。**ASR/VLM mock 测试属 v1 必需，非 stretch**。

### 🟣 Stage 4：测试数据清理脚本 + 自动化测试加固（独立，可提前到最前）

**清理脚本与 Stage 1-3 无代码依赖；若你想先清理测试账号数据，可把这 Stage 的清理脚本单独提前做。**

- [ ] **S4-1 清理脚本**（工单 #5/6）：新增 `scripts/cleanup-nana-test-data.ts`。契约见 §9。（涉及: 新增 `scripts/cleanup-nana-test-data.ts`）
- [ ] **S4-2 前端手机端 e2e**（工单 #6/7，DP3）：新增 `e2e/nana-capture-map.spec.ts`，手机视口（375×812），覆盖：首页三入口存在且指向正确 → 进采集页 → mock 相机/麦克风保存 → 跳知识地图 → 看到自己刚拍的题。复用现有 `e2e/` 的 auth fixture。（涉及: 新增 `e2e/nana-capture-map.spec.ts`、可能补 `e2e/fixtures/`）
- [ ] **S4-3 测试清单文档**：把"部署前自动跑什么 / 真机只留什么"写成 `doc/guide/nana-test-checklist.md`（对齐工单 #7 末尾"只把真机权限和兼容性留给人工"）。

---

## 5. 文件变更清单（按 Stage）

### Stage 1
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/app/nana/page.tsx` | 修改 | 2→3 ActionCard，移除"补一段"，session 升一级 |
| `src/app/nana/capture/page.tsx` | 修改 | 保存成功态加"去知识地图"按钮 + 诚实措辞 |
| `src/app/api/nana/cases/route.ts` | 修改 | 加 GET handler（列表，带 studentId 过滤）|
| `src/lib/nana/nana-api-client.ts` | 修改 | 加 `listMyCases()` |
| `src/app/nana/knowledge-map/page.tsx` | 修改 | 加"最近拍过的题"区 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 新增 | 错题列表组件 |
| `prisma/schema.prisma` | 修改（**仅注释**） | Artifact type 注释订正；**零结构改动** |
| `src/__tests__/integration/nana/case-api.test.ts` | 修改 | 加列表端点 + 隔离测试 |

### Stage 2（依赖 DP1 确认 migration 内容）
| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改（**结构改动，须确认**） | 新增 `CaseKnowledgeTag` model + Case 反向关系 |
| `prisma/migrations/xxx` | 新增 | migration（**SQL 先过目再执行**） |
| `src/lib/nana/case-classify.ts` | 新增 | 分类骨架（pending + manual） |
| `src/app/api/nana/cases/[id]/tags/route.ts` | 新增 | 挂载/读取标签 API |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | 显示标签 chip + 挂载操作 |
| `src/__tests__/unit/nana/case-classify.test.ts` | 新增 | 测试先行 |
| `src/__tests__/integration/nana/case-api.test.ts` | 修改 | 加 tags API 测试 |

### Stage 3（v1 闭环必需）
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/nana/asr-transcribe.ts` | 新增 | ASR 薄封装（audio Base64 → 文字，调 doubao-seed-2-0-lite） |
| `src/lib/nana/vlm-classify.ts` | 新增 | 单题 VLM 轻分类封装（调 doubao-seed-2-0-pro） |
| `src/lib/nana/case-classify.ts` | 修改 | 接真 VLM 分支 + ASR 编排（被 /process 调用） |
| `src/app/api/nana/cases/[id]/process/route.ts` | 新增 | **/process 端点（DP7）：同步跑 ASR+VLM，超时返回 processing 让前端轮询** |
| `src/app/api/nana/cases/[id]/artifacts/[seq]/route.ts` 或内联更新 | 新增/修改 | transcript artifact content 回写路径（见 §12.10） |
| `src/lib/nana/nana-api-client.ts` | 修改 | 加 `processCase(id)` / `getCaseStatus(id)` |
| `src/app/nana/capture/page.tsx` | 修改 | 保存后显式调 /process + "识别中…" + 轮询；"我的话"显示真实转写 + 仅供参考 |
| `src/__tests__/unit/nana/asr-transcribe.test.ts` | 新增 | mock ASR 测试 |
| `src/__tests__/unit/nana/vlm-classify.test.ts` | 新增 | mock VLM 测试 |
| `src/__tests__/integration/nana/process-api.test.ts` | 新增 | /process 端点集成测试（双管线独立 + 超时 fallback） |

### Stage 4
| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/cleanup-nana-test-data.ts` | 新增 | 按用户清理 + 备份前置 + 计数 |
| `e2e/nana-capture-map.spec.ts` | 新增 | 手机视口 e2e |
| `doc/guide/nana-test-checklist.md` | 新增 | 部署前测试清单 |

---

## 6. 数据流设计（工单要求 #3）

```
[Stage 3 · DP7 两步式异步架构]
①  POST /api/nana/cases  { artifacts: [question_image, audio_note?, audio_meta?, transcript] }
    （transcript artifact 在 Phase 1.5 已创建，content="尚未转写"）
    → 返回 201 + caseId（只保存，不跑 AI）

②  前端保存成功 → 显式调 POST /api/nana/cases/:id/process
    │
    ├─[ASR 管线] 若有 audio_note
    │    audio_note Base64 → asr-transcribe.ts（doubao-seed-2-0-lite）
    │    → transcript 文本 → 更新 transcript artifact content（替换"尚未转写"）
    │    失败：asrStatus="failed" + UI"转写没接上，原音为准"（不假装）
    │
    └─[VLM 管线] 若有 question_image
         question_image Base64 → vlm-classify.ts（doubao-seed-2-0-pro，轻分类提示词）
         → candidateNodeIds → CaseKnowledgeTag(source="vlm", confidence)
         confidence 低 → 留 pending 不自动挂；失败：vlmStatus="failed" + 不写假标签
    │
    两条独立 try/catch；超 60s → 返回 status="processing" 让前端轮询 GET /cases/:id
    ▼
CaseKnowledgeTag（caseId ↔ nodeId, source=manual|vlm|asr|rule|pending, confidence）  ← Stage 2 建表
    │ 人工挂载(Stage 2) 或 VLM 自动挂(Stage 3b)
    ▼
KnowledgeNode（已有 48 节点：M1-11 函数概念 / BG001… ）   ← M1 已就绪
    │
    ▼
知识地图 UI
    ├─ 上层：48 节点图谱（已有）+ Stage 2 起节点上叠加"挂了几道题"
    └─ 下层：最近拍过的题列表（Stage 1 新增）
             每条 = 题图缩略 + 日期 + 标签（Stage 1 全"未分类" → Stage 2 起有节点名 → Stage 3 起 VLM 自动挂）
             + "我的话"（Stage 1-2 占位 → Stage 3 真实转写 + 仅供参考 + 原音回放）
```

**关键衔接点**：当前 Case 与 KnowledgeNode 之间**完全断开**。Stage 2 的 `CaseKnowledgeTag` 是唯一的桥。Stage 3 的两条 AI 管线（ASR / VLM）**互相独立**——各自 try/catch，一条失败不影响另一条；都由显式 `/process` 端点触发（DP7），**不在 POST /cases 里 fire-and-forget**。Stage 1 先不建桥也不接 AI，靠"未分类题列表 + 识别稍后接入"做过渡（动线修正）。

---

## 7. 数据库变更说明（工单要求 #4 · **单独章节，须用户确认**）

> ⚠️ **按铁律 1（破坏性操作须确认）+ 工单 #4 + 评审反馈，本节变更必须你明确看过 migration 内容并同意后，execute-agent 才能执行。Stage 1 不涉及任何 schema 改动，可先做。**

### 7.1 唯一的结构变更：新增 `CaseKnowledgeTag` model（Stage 2）

**为什么需要**：一道错题要挂到一个或多个知识点。当前 schema 里 Case↔KnowledgeNode **没有任何关系字段**，无法表达"这道题属于一次函数图像"。

**为什么是新建表（Option A）而不是别的**：
- **Option B（复用 MasteryBridge/SessionItem）**——否决。那些是批次测评产物，语义是"测评证据"，混用会让两种数据互相污染。
- **Option C（Case 上加 JSON 字段存 nodeIds）**——否决。查询不便、无法存 source/confidence、无法做唯一约束。
- **Option D（复用既有 `MistakeNode`）**——见 §7.3，否决（缺 source/confidence，且改它属改 M1 表）。
- **Option A（新建连接表）**——✅ 推荐。干净、可查询、可扩展（source 字段区分人工/VLM/ASR/规则来源），且**是新增 model，不是改 wrong-notebook 上游表，符合铁律 3**。

**Prisma schema 草稿**（设计表达，非执行）：

```prisma
// 第 2 阶段：Case↔知识点挂载（个性化数学诊断辅导系统 · 增量）
// 全部新增表，不改 wrong-notebook 已有模型，符合铁律 3
model CaseKnowledgeTag {
  id         String   @id @default(cuid())
  caseId     String
  case       Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  nodeId     String   // → KnowledgeNode.id（松挂接，无 FK，与 MistakeNode/ErrorRecord 同款，守铁律 3）
  source     String   // "manual" | "vlm" | "asr" | "rule" | "pending"
  confidence Float    @default(0.0)  // 0-1；manual=1.0，vlm 给概率
  note       String?  // 可选，如 "VLM 候选：一次函数图像"
  createdAt  DateTime @default(now())

  @@unique([caseId, nodeId, source])  // 同 case 同节点同来源不重复
  @@index([caseId])
  @@index([nodeId])
}
```

`Case` model 需追加反向关系（nana 自有 model，加字段不违反铁律 3，但仍属 schema 变更，一并确认）：
```prisma
model Case {
  id        String     @id @default(cuid())
  studentId String
  createdAt DateTime   @default(now())
  artifacts Artifact[]
  knowledgeTags CaseKnowledgeTag[]   // ← Stage 2 新增
}
```

**影响范围**：
- 只新增 1 张表 + 1 个反向关系字段；**不改任何 wrong-notebook 上游 model**（User/ErrorItem/KnowledgeTag/… 全不动）。
- migration 是纯 `CREATE TABLE` + `ALTER TABLE ADD COLUMN`（反向关系），**无数据迁移、无删除**，可安全回退（drop 新表）。

**migration 内容确认流程（铁律 1）**：
1. execute-agent 先 `prisma migrate dev --create-only`（只生成 SQL 不执行）。
2. 把生成的 migration SQL 贴给你过目（应只有 CREATE TABLE + ALTER TABLE ADD COLUMN）。
3. 你确认后 execute-agent 才 `prisma migrate dev` 真正执行。

**回退方案**：若上线后发现问题，`prisma migrate resolve --rolled-back` + drop `CaseKnowledgeTag` 表 + 移除 Case 反向字段即可，不影响已存的 Case/Artifact 数据。

### 7.2 Stage 1 的"注释订正"不算结构变更

Stage 1 只改 `Artifact.type` 的注释文字（从过时的"image/audio/…"改成实际白名单），**零结构改动**，不需单独确认。

### 7.3 与旧案 `problem-graph-mapping-workorder.md` 的关系（演进说明）

旧案（`doc/reference/problem-graph-mapping-workorder.md`）建议**复用 M1 既有的 `MistakeNode`（mistakeId↔nodeId, confirmed）** 做"错题↔图谱"关联，走"VLM 给候选 → 人工确认"流程。本计划**没有照搬**，而是新建 `CaseKnowledgeTag`，理由：

| 维度 | MistakeNode（旧案） | CaseKnowledgeTag（本计划） |
|------|---------------------|-----------------------------|
| 挂接单位 | mistakeId（loose String，当时设想挂 ErrorItem） | caseId（FK → Case，采集层单位） |
| 来源语义 | 无 source 字段（只有 confirmed） | 有 source（manual/vlm/asr/rule/pending） |
| 置信度 | 无 | 有 confidence（VLM 给概率，决定是否自动挂） |
| 改动面 | 改 MistakeNode（属 M1 表，要加字段/改语义） | 全新表，M1 表零改动 |

**演进结论**：本计划的采集层以 `Case` 为单位（Phase 1.5 已落地），与旧案设想的"ErrorItem 为单位"已不同。`CaseKnowledgeTag` 是为采集层量身定的挂接表，承载 Stage 3 VLM/ASR 自动挂标签 + source/confidence 的需求。`MistakeNode` 保持原样不动（未来若做"错题本体↔图谱"的批次视图，再决定是否复用它）。**两者并存、不冲突**，都属 nana 自有表（非上游）。

---

## 8. 验收标准

### 8.1 v1 闭环定义（**评审反馈核心改动**）

**v1（第一版闭环）= Stage 1 + Stage 2 + Stage 3 全部完成**，必须包含：

1. ✅ 首页三入口、采集后去向、知识地图历史题列表（Stage 1 动线修正）
2. ✅ Case 能挂到知识点上（Stage 2 `CaseKnowledgeTag` 骨架 + 手动挂）
3. ✅ **真实 ASR**：录音 → 文字（Stage 3a）
4. ✅ **真实 VLM/LLM 初步分类**：题图 → 候选知识点自动挂（Stage 3b）
5. ✅ 用户能在知识地图里看到按知识点整理的历史错题（Stage 2/3 共同）

**Stage 1 单独完成 ≠ v1 闭环**，只算"动线修正"——一个可独立上线的中间产物。

### 8.2 对应工单"验收标准"

| 工单验收项 | 由哪个 Stage 满足 | 怎么验 |
|-----------|:--:|--------|
| 首页只保留 拍题/知识地图/周末小检查 三入口 | S1 | 打开 `/nana`，恰好 3 个一级 ActionCard |
| "补一段你当时怎么想的"不再是一级入口 | S1 | 首页无此卡片 |
| 采集页保存后有清晰去向 | S1 | 保存成功后可见"去知识地图看看"+"再拍一道" |
| 历史题能从知识地图路径进入查看 | S1 | `/nana/knowledge-map` 有"最近拍过的题"列表 |
| 未完成 ASR/OCR/VLM 时页面不假装 | S1-2 / S3 | Stage 1 显示"识别稍后接入"；Stage 3 接通后如实显示转写/分类，转写标注"仅供参考" |
| 有明确的测试账号数据清理办法 | S4-1 | `scripts/cleanup-nana-test-data.ts` 可跑 |
| 有一套部署前可自动跑的测试清单 | S4-3 + 现有 | `npm run test:all` + `npm.cmd run build` + CI 容器 + e2e |
| **真实 AI 接入（评审追加）** | **S3** | 创建含录音+题图的 Case 后，异步出现 transcript 更新 + `source="vlm"` 标签（mock 下可验） |

### 8.3 每 Stage 附加验收

**Stage 1**：
- [ ] `GET /api/nana/cases` 只返回当前用户自己的题（A 登录看不到 B 的）
- [ ] 知识地图"最近拍过的题"空态正确（新用户显示"还没拍过题"）
- [ ] 全页扫无"诊断/已诊断/薄弱/得分/掌握"（守 OPS §4）
- [ ] `npm run test:all` 不回归、`npm.cmd run build` 通过

**Stage 2**：
- [ ] `POST /api/nana/cases/[id]/tags` 跨用户挂载→403/404
- [ ] 知识地图列表能显示人工挂的节点名 chip
- [ ] `classifyCase` 在 Stage 2 返回 pending（不假装识别了）

**Stage 3**：
- [ ] 创建含 `audio_note` 的 Case 后，异步更新 transcript artifact content（mock ASR 下可验）
- [ ] 创建含 `question_image` 的 Case 后，异步出现 `source="vlm"` 标签（mock VLM 下可验）
- [ ] ASR 失败不影响 VLM 分类、反之亦然（两条管线独立）
- [ ] ASR/VLM 失败时不写假数据、有日志（铁律 6）
- [ ] confidence 低时 UI 说"不太确定"，不硬塞
- [ ] "我的话"显示转写 + "仅供参考，原音为准" + 可回放原音（守 P1）

**Stage 4**：
- [ ] 清理脚本 `--dry-run` 只打印不删；`--userId=x` 只删 x 的、不动别人
- [ ] 清理脚本删前要求备份存在（备份缺失→拒绝执行）
- [ ] e2e 在手机视口跑通首页→采集→保存→知识地图主线

---

## 9. 测试数据清理方案（工单要求 #6）

### 9.1 脚本契约：`scripts/cleanup-nana-test-data.ts`

**用法**：
```bash
# 干跑（只打印将删除什么，不真删）
npx tsx scripts/cleanup-nana-test-data.ts --userId=<测试账号userId> --dry-run

# 真删（必须先有备份）
npx tsx scripts/cleanup-nana-test-data.ts --userId=<测试账号userId>
```

**行为契约**（对齐工单 #5 全部要求）：
1. **按用户清理**：必填 `--userId`，只删该用户的 nana 相关数据，**绝不跨用户**（where 恒带 `studentId = userId`）。
2. **备份前置（硬门禁）**：执行前检查 `./data/dev.db.bak*`（或指定备份路径）是否存在且新于 N 分钟；**备份缺失或未先跑 `backup.sh` → 拒绝执行、退出非 0**（铁律：部署/破坏前必须备份）。
3. **删前/删后计数**：打印每张表（Case、Artifact、CaseKnowledgeTag(Stage2起)、DiagnosisSession、ProbeRecord、ErrorRecord、StudentNodeState）的"将删除 X 条 / 已删除 Y 条"，**逐表报数**（铁律 6：跳过几条失败几条必须报数）。
4. **删除范围**（仅 nana 诊断相关，**不动** wrong-notebook 的 ErrorItem/PracticeRecord 等）：
   - `Case` + 级联 `Artifact`（studentId = userId）
   - `CaseKnowledgeTag`（Stage 2 起，通过 caseId 级联）
   - 可选 `--include-sessions`：连 `DiagnosisSession`(+records) 一起清（默认不清 session，除非显式指定）
   - `StudentNodeState`（studentId = userId，可选，默认清——让测试账号图谱状态归零）
5. **不手工 SQL**：全部走 `prisma.*.deleteMany()`，不裸 SQL。
6. **事务**：删在同一事务内，失败回滚。
7. **dry-run 输出示例**：
   ```
   [DRY-RUN] 目标用户: <userId>
   [备份检查] ✅ 找到 ./data/dev.db.bak-2026-07-01T03-00.sql (2 小时前)
   [将删除]
     Case:               12 条
     Artifact:           38 条
     StudentNodeState:    5 条
   [不删] DiagnosisSession（未指定 --include-sessions）
   ```
8. **管理员脚本，不做 UI**（工单明确"可以先设计管理员脚本，不必第一轮做后台 UI"）。

### 9.2 生产执行流程（写进 `doc/guide/nana-test-checklist.md`）
1. 服务器 `bash backup.sh`（备份失败→停）
2. 本地或服务器 `npx tsx scripts/cleanup-nana-test-data.ts --userId=<测试账号> --dry-run` 看数
3. 确认无误 → 去掉 `--dry-run` 真删
4. 验证：`GET /api/nana/cases`（以该账号登录）返回空列表

---

## 10. 自动化测试方案 + 手机端验收清单（工单要求 #7）

### 10.1 自动化测试矩阵

| 层 | 工具（均已就绪） | 覆盖 | 归属 Stage |
|----|----------|------|:--:|
| API 单测/集成 | vitest（`src/__tests__/`） | case CRUD + 列表 + 用户隔离 + 非法 payload + tags 挂载 + 分类契约 | S1/S2/S3 扩 |
| ASR 薄封装 | vitest（mock fetch） | audio Base64 → transcript 解析/失败处理 | **S3（v1 必需）** |
| VLM 分类流程 | vitest（mock fetch） | question_image → CaseKnowledgeTag 落库 + transcript 回写 | **S3（v1 必需）** |
| 两条管线独立性 | vitest | ASR 失败不影响 VLM、反之亦然 | **S3（v1 必需）** |
| 前端手机端 e2e | **Playwright（已装）** | 手机视口 375×812：首页三入口→采集→保存→知识地图见题 | S4-2 |
| 生产前构建 | `npm.cmd run build` | 全量构建通过 | 每 Stage |
| CI 测试容器 | GitHub Actions `docker-compose.test.yml` | 退出码 0 才许部署 | 每 Stage 合 main 前 |

### 10.2 手机端人工验收清单（只留这些给真机，工单 #7 末尾）

- [ ] 拍照权限弹窗（iOS/Android）
- [ ] 麦克风权限弹窗（iOS/Android）
- [ ] 真机浏览器保存成功（Network 见 201）
- [ ] iOS Safari / Android Chrome 录音兼容（MediaRecorder mimeType 动态探测已有，Phase 1.5 验过）
- [ ] 生产网络（4G/5G）下首页+采集页响应速度
- [ ] 真机三入口点击都跳对地方
- [ ] 真机保存后"去知识地图"能跳到且看到刚拍的题
- [ ] 真机"我的话"能看到 ASR 转写（Stage 3 后）+ 能回放原音

---

## 11. 风险与注意事项（工单要求 #8）

| 风险 | 影响 | 应对 | 归属 |
|------|------|------|:--:|
| **ASR 转写不准（口语+数学术语）** | transcript 误导，但其实 transcript 只是索引非真相 | transcript 标注"仅供参考，原音为准"；原音无损保留可回放（P1：图/音为真相源）；豆包 Lite 自带 300+ 数学术语热词表（TECH_PLAN §5） | S3 |
| **VLM 识别不准（错题挂错知识点）** | 错题挂错，误导后续 | confidence 阈值（<0.5 不自动挂、留 pending）；UI 始终允许人工改；措辞用"可能属于"不说"是" | S3 |
| **ASR + VLM 级联失败** | 一个失败拖垮另一个 | **两条管线各自独立 try/catch**，互不影响；各自显式记日志（铁律 6） | S3 |
| **异步任务无进度反馈** | 用户不知道转写/分类进行到哪 | v1 用"转写稍后接入 / 转写完成"状态轮询或刷新页面，**不上 WebSocket**（流式/进度推送是后续增强） | S3 |
| **API 成本（每次 case 触发 2 次 AI 调用）** | 费用累积 | 监控用量（Pro ¥3.2/¥16、Lite ¥0.6/¥3.6 每百万 tokens）；必要时加节流/单日上限；Lite 转写便宜，主要成本在 VLM Pro | S3 |
| **分类不准（节点候选过多）** | 48 节点里 VLM 给一堆候选 | 提示词约束"最多 3 个 + 按置信降序"；低置信全留未分类 | S3 |
| **生产数据误删（清理脚本）** | 删错用户、删生产真数据 | 备份前置硬门禁 + `--dry-run` + where 恒带 userId + 事务回滚 + 默认不清 session | S4 |
| **Base64 体积膨胀** | case 多了拖慢 SQLite/备份 | 已登记设计债（Phase 1.5）：阈值 case>100 或库>50MB 迁对象存储；本版不触发 | 持续 |
| **移动端录音兼容** | iOS 用 audio/mp4、Android 用 webm | Phase 1.5 已做 mimeType 动态探测；ASR lib 接受 webm/mp4 两种 mime | 已解 |
| **transcript artifact 回写竞态** | 异步 ASR 与并发请求撞写 | Stage 3 用 caseId+seq 定向 update（transcript seq 固定），不放并发写同一条；失败不覆盖原占位 | S3 |
| **首页重构破坏现有 map 数据加载** | 有/无记录态判定乱 | Stage 1 保留 `/api/diagnosis/map` 调用逻辑，只改 ActionCard 区 | S1 |
| **铁律提醒** | — | Stage 2 schema 改动须 DP1 确认 migration 内容（铁律 1）；全程不改上游 model（铁律 3）；措辞不越界（OPS §4）；AI 失败显式报不静默（铁律 6） | 全程 |

---

## 12. 技术附录

### 12.1 首页三入口结构（Stage 1，`src/app/nana/page.tsx`）

```
<NanaPage>
  顶部问候（保留）
  <ActionCard 拍题       href=/nana/capture      icon=Camera>
  <ActionCard 知识地图    href=/nana/knowledge-map icon=Map>     ← 新增
  <ActionCard 周末小检查  href=/nana/session      icon=ClipboardCheck> ← 从正文提升
  {/* 删除"补一段你当时怎么想的" */}
  有/无记录轻提示（RecapBar/EmptyHint，保留但移到卡片下方）
</NanaPage>
```

### 12.2 列表 API 契约（Stage 1，`GET /api/nana/cases`）

```ts
// 响应 200
{
  cases: Array<{
    id: string;
    createdAt: string;
    hasImage: boolean;          // 是否有 question_image
    imageThumb?: string;        // 可选：小缩略 base64（控制在几 KB，避免列表爆体积）
    tagCount: number;           // Stage 1 恒 0
    tagStatus: "untagged" | "tagged" | "pending";  // Stage 1 恒 untagged
    hasAudio: boolean;          // Stage 3 起：是否有 audio_note
    transcriptReady: boolean;   // Stage 3 起：transcript 是否已转写（非"尚未转写"）
  }>;
  total: number;
}
// 错误: 401 未授权
// 仅返回 session.user.id 自己的；studentId 过滤必带
```

**体积注意**：列表**不**返回完整 Base64 题图（一条就 1MB+），只返回 `hasImage` 标志 + 可选极小缩略（如压缩到 8KB）。完整题图走 `GET /api/nana/cases/[id]`。

### 12.3 `listMyCases` 客户端封装（Stage 1）

```ts
export async function listMyCases(): Promise<{ cases: CaseListItem[]; total: number }> {
  const res = await fetch(`${NANA_BASE}/cases`);
  if (!res.ok) throw new Error(`listMyCases 失败: ${res.status}`);
  return res.json();
}
```

### 12.4 知识地图"最近拍过的题"区（Stage 1）

- 位置：图谱区上方（先看题再看图）或下方折叠。建议**上方**——用户最关心"我拍的题在哪"。
- 空态："还没拍过题，[去拍一道 →]（→/nana/capture）"
- 有题：横向或纵向列表，每条 = 缩略图 + 日期 + "未分类"chip + 点击 → case 详情（本版可先链到采集页或简单弹层，完整详情页未来轮）

### 12.5 CaseKnowledgeTag API（Stage 2）

```ts
// POST /api/nana/cases/[id]/tags
// 请求: { nodeId: string; note?: string }
// 响应 201: { id, caseId, nodeId, source: "manual", confidence: 1.0, note }
// 错误: 400 nodeId 缺失 / 404 case 不存在或不属于自己 / 401

// GET /api/nana/cases/[id]/tags
// 响应 200: { tags: CaseKnowledgeTag[] }
```

### 12.6 分类 lib 契约（Stage 2 骨架 / Stage 3 接真）

```ts
// src/lib/nana/case-classify.ts
export interface ClassifyResult {
  tags: Array<{ nodeId: string; confidence: number; source: string; note?: string }>;
  status: "pending" | "done" | "failed";
}

// Stage 2: 返回 { tags: [], status: "pending" }（诚实，不调 VLM）
// Stage 3b: 调 vlmClassify(imageBase64) → 写 CaseKnowledgeTag(source="vlm") → 返回 done
export async function classifyCase(caseId: string): Promise<ClassifyResult>;

// Stage 3a: 调 asrTranscribe(audioBase64, mime) → 更新 transcript artifact content
// 独立于 classifyCase，单独编排（见 §12.10）
export async function transcribeCase(caseId: string): Promise<{ status: "done" | "failed"; transcript?: string }>;

export async function tagCaseManually(
  caseId: string, nodeId: string, userId: string, note?: string
): Promise<CaseKnowledgeTag>;
```

### 12.7 VLM 分类薄封装（Stage 3b）

```ts
// src/lib/nana/vlm-classify.ts
// 复用 vlm-transcribe.ts 的 vision 路由（PRO_ENDPOINT_ID / PRO_MODEL_NAME / VOLCENGINE_API_KEY）
// 但用"单题轻分类"新提示词（不是整卷转写，守 DP6）
export async function vlmClassify(imageBase64: string, mime = "image/jpeg"): Promise<{
  candidateNodeIds: string[];   // 按置信降序，最多 3 个
  confidence: number;           // 最高候选的置信
  rawHint: string;              // 大白话线索，如 "一次函数图像、增减性"
}>;

// 提示词要点（对照 48 节点，DP6 只做轻分类）：
// "这是一道高中数学题的截图。请从下列知识点里挑最相关的 1-3 个（按相关度降序），
//  给每个一个 0-1 的把握。看不清或不确定就返回空，不要猜。
//  你只负责'大致属于哪几个知识点'，不要转写题面。"
// 节点名清单从 KnowledgeNode 表读（id+name）注入提示词。
```

### 12.8 ASR 薄封装（Stage 3a · **新增**）

```ts
// src/lib/nana/asr-transcribe.ts
// 复用 vlm-transcribe.ts 的 audio 路由（LITE_ENDPOINT_ID / LITE_MODEL_NAME / VOLCENGINE_API_KEY）
// doubao-seed-2-0-lite-260215 全模态，19 语种转写（含中文）

// 输入: audio_note 的 Base64（webm/mp4），mime
// 输出: { transcript: string; confidence?: number; rawResponse?: any }
// 调: doubao-seed-2-0-lite via LITE_ENDPOINT_ID（OpenAI 兼容 chat，audio 放 message input_audio）
// 失败: throw（由调用方 catch + 显式日志，不静默，铁律 6）
export async function asrTranscribe(
  audioBase64: string,
  mime: string  // "audio/webm" | "audio/mp4"
): Promise<{ transcript: string; confidence?: number }>;

// 提示词（极简，ASR 不需要复杂提示）：
// "请把这段录音转成文字。这是高中学生口述一道数学题的卡点。
//  数学术语尽量保留原词（如'定义域''单调递增''通分'）。听不清的地方标注[听不清]。"
// 注：豆包 Lite 自带 300+ 数学术语热词表（TECH_PLAN §5），提示词只做轻引导。
```

**为什么是文件式不是流式（DP5）**：`vlm-transcribe.ts` 的 audio 任务是"读完整音频文件→整段转写"，已验证可行。流式 ASR（边录边转、`/api/nana/asr/stream`）是架构工单提过的**未来增强**，v1 不做——文件式最简、风险最低。

### 12.9 清理脚本伪代码（Stage 4）

```ts
// scripts/cleanup-nana-test-data.ts
// 1. parseArgs: --userId (必填) --dry-run --include-sessions --backup-path
// 2. 校验 userId 非空 → 否则退出
// 3. 备份检查：读 backup-path 目录，找最新 .bak，校验 mtime < 阈值 → 缺失则退出非 0
// 4. prisma 事务内：
//      count Case(where studentId) / Artifact(via Case) / CaseKnowledgeTag(Stage2起) / StudentNodeState / 可选 Session
//      打印 [将删除] 逐表计数
//      if (!dryRun) deleteMany 各表（where 恒带 studentId/userId）
//      打印 [已删除] 逐表计数
// 5. 失败 → 事务回滚 + 非 0 退出 + 显式报错（铁律 6）
```

### 12.10 transcript artifact 回写路径（Stage 3a · **设计点**）

Phase 1.5 在创建 Case 时就写了一条 `transcript` artifact（content="尚未转写"）。Stage 3a ASR 完成后要**更新这条 artifact 的 content**（不新建）。两个备选实现路径，由 execute-agent 评估：

- **路径 A（内联更新）**：在 `cases/route.ts` 的异步 ASR handler 里直接 `prisma.artifact.update({ where: { caseId_seq }, data: { content: transcript } })`。最简，但把 DB 写散在路由里。
- **路径 B（PATCH 端点）**：新增 `PATCH /api/nana/cases/[id]/artifacts/[seq]`（body `{ content }`，带归属校验），异步 handler 调它。更规范、可复用、可测，但多一个端点。

**plan-agent 倾向 B**（规范、可测、归属校验集中），但留给 execute-agent 按实际复杂度定。**无论 A/B，更新用 caseId+seq 定向定位 transcript artifact，不放并发写同一条**。

### 12.11 ASR/VLM 模型路由对照（复用 `vlm-transcribe.ts` 既定路由）

| 管线 | 模型 | env 路由 | 用途 | 定价（¥/百万 tokens） |
|------|------|----------|------|------------------------|
| VLM 分类（Stage 3b） | `doubao-seed-2-0-pro-260215` | `PRO_ENDPOINT_ID`→`PRO_MODEL_NAME`→默认 | 题图→候选知识点（视觉精度 SOTA） | input 3.2 / output 16 |
| ASR 转写（Stage 3a） | `doubao-seed-2-0-lite-260215` | `LITE_ENDPOINT_ID`→`LITE_MODEL_NAME`→默认 | 录音→文字（全模态、19 语种） | input 0.6 / output 3.6 |

两者共用 `VOLCENGINE_API_KEY` + `VOLCENGINE_BASE_URL`（`https://ark.cn-beijing.volces.com/api/v3`），都用 `openai` npm 包的 OpenAI 兼容接口。

### 12.12 e2e spec 要点（Stage 4）

```ts
// e2e/nana-capture-map.spec.ts
// 复用 e2e/ 现有 auth fixture（参考 auth-flow.spec.ts）
// viewport: { width: 375, height: 812 }
// 1. 登录测试账号 → /nana
// 2. 断言 3 个 ActionCard 文案 + href
// 3. 点"拍题" → /nana/capture
// 4. mock <input file> 注入测试图（参考 upload-correction.spec.ts 的文件注入）
// 5. mock getUserMedia（Playwright 拦截）→ 跳过录音
// 6. 点"收好这道题" → 等 201
// 7. 点"去知识地图看看" → /nana/knowledge-map
// 8. 断言"最近拍过的题"列表含刚拍的题
```

---

## 13. 引用与对齐

- **OPS_handbook §4（前台措辞铁律）**——全程：不出现"诊断/已诊断/薄弱/得分/掌握/未掌握"；Stage 1-2 说"识别稍后接入"，Stage 3 接通后说"可能属于"，不说"是/已确诊"；transcript 标"仅供参考"。
- **OPS_handbook §6（主次铁律：她备考优先）**——本版不给她增加使用负担，首页从"俩按钮都一样"简化为"三个干脆入口"。
- **TECH_PLAN_v2 §5（AI 管线）**——Stage 3 的 ASR（豆包 ASR）+ VLM 识图（火山方舟豆包视觉）正是该章规划的生产能力，本版让它**第一次进请求路径**（之前只在离线脚本）。豆包 ASR 自带 300+ 数学术语热词表，与本计划"轻分类/轻转写"定位一致。
- **TECH_PLAN_v2 §知识图谱数据层**——复用已有 48 节点 + 8 表，CaseKnowledgeTag 是新增挂接（铁律 3）。
- **capture-preprocessing-research-workorder（P1 图/音为真相源）**——Stage 3 ASR 转写不准时，UI 必说"转写仅供参考，原音为准" + 原音无损保留可回放。transcript 是索引非真相。
- **problem-graph-mapping-workorder（旧案）**——CaseKnowledgeTag 是其"VLM 候选→人工确认"思路在采集层的演进，见 §7.3。
- **vlm-transcribe-workorder（模型路由）**——Pro 跑视觉、Lite 跑音频的分工源自此工单，本计划 Stage 3 严格沿用。
- **AGENTS 铁律 1（破坏性操作须确认）**——Stage 2 的 CaseKnowledgeTag 新表须 DP1 单独确认 **migration 内容**。
- **AGENTS 铁律 3（不改上游表结构）**——所有改动落在 nana 自有 model/目录，上游 wrong-notebook model（User/ErrorItem/KnowledgeTag…）零改动。
- **AGENTS 铁律 5/6（遇错停下、显式失败）**——ASR/VLM 失败、清理脚本失败均显式报错不静默。
- **doc/spec/capture-layer-design-backlog.md**（case 四层：题图/原音/逐字稿/AI 提要）——本版 Case 结构延续该模型，Stage 3 的 ASR 转写落实"逐字稿"层、VLM 分类是"AI 提要"层的轻量起点。

---

> **门禁状态**：6 个决策点已列出。DP2/DP4 已由评审裁定（Stage 3 真实 ASR+VLM 是 v1 必需）；DP3/DP5/DP6 不阻塞 Stage 1；DP1 在进入 Stage 2 前须就 **migration 内容**单独确认。**Stage 1 不依赖任何 schema 改动、可立即执行。** 等你一句"开始 Stage 1"或"确认本计划"放行（AGENTS 门禁 2：计划未经用户确认不得执行）。
>
> **v1 闭环收口**：Stage 1+2+3 全完成才算 v1 闭环（真实 AI 接入）。Stage 1 单独上线 = 动线修正中间产物。
