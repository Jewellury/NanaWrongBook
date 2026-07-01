# 第一版聚焦错题采集、初步识别与知识地图挂载 · 开发计划

> 关联工单: doc/reference/2026-07-01_1846_workorder_capture-map-v1.md
> 关联规格: doc/spec/capture-layer-design-backlog.md（采集壳四层 artifact 模型）
> 关联参考: doc/reference/TECH_PLAN_v2.md（§知识图谱数据层 / §诊断引擎 / §采集与 AI 管线）、doc/reference/OPS_handbook.md（§4 前台措辞铁律、§6 主次铁律）
> 计划日期: 2026-07-01
> 计划代理: plan-agent
> 预计影响: `src/app/nana/`（首页/采集/知识地图）、`src/app/api/nana/cases/`（新增列表端点）、`prisma/schema.prisma`（**Stage 2 涉及新增 model，须单独确认**）、`scripts/`（清理脚本）、`src/__tests__/`、`e2e/`
> 关联安全铁律: 铁律 1（破坏性操作须确认）、铁律 3（不改上游表结构）、铁律 5/6（遇错停下、显式失败）

---

## ⚠️ 待用户确认的决策点（请先看这里）

本计划有 4 个决策点需要你拍板。**最关键的是 DP1（数据库新增表）——按铁律 1 + 工单 #4，必须你明确同意后 execute-agent 才能做 Stage 2。**

| # | 决策 | 选项 | plan-agent 推荐 | 是否阻塞 |
|---|------|------|----------------|------:|
| **DP1** | 一道错题（Case）怎么挂到知识点（KnowledgeNode）上？ | **A. 新建 `CaseKnowledgeTag` 连接表**（caseId + nodeId + source + confidence）／B. 复用 MasteryBridge 或 SessionItem（不合适，那些是批次测评用的）／C. 在 Case 上加个 JSON 字段存 nodeIds（查询不便） | **A**（最干净、可扩展，且是新增 model 不违反铁律 3） | **是**（Stage 2 必须等你点头） |
| **DP2** | 这一版到底接不接真 VLM 识图？ | **分期**：Stage 1-2 先搭骨架，页面诚实说"识别稍后接入"；Stage 3 再接真 VLM 自动分类 ／ 一次性在 Stage 1 就接通 VLM | **分期**（Stage 1 先把首页/采集反馈/错题列表做对、措辞诚实，VLM 是慢且不稳的外部依赖，不宜卡在最前面） | 否（Stage 1 可先做） |
| **DP3** | 前端手机端自动化测试用什么？ | **复用已装的 Playwright**（仓库已有 `e2e/` 目录 + `@playwright/test` 依赖 + `test:e2e` 脚本，不是新依赖）写 nana 手机视口 e2e ／ 推迟到下一轮 | **复用 Playwright**（依赖已就位，Stage 4 落地最小 e2e） | 否 |
| **DP4** | 语音转文字（ASR）这版做吗？ | **不做**（沿用 Phase 1.5 决定，transcript 恒为"尚未转写"，归 TECH_PLAN 第 5 阶段） ／ 这版做 | **不做**（工单也把 ASR 列为"未完成时页面不假装"，不阻塞验收） | 否 |

> **Stage 1 不依赖任何决策点**，你确认本计划后即可让 execute-agent 开做 Stage 1。DP1 在进入 Stage 2 前再单独确认。

---

## 1. 大白话概述

现在手机上打开 `/nana`，首页有两个按钮"拍一下这道题"和"补一段你当时怎么想的"，但**两个按钮都跳到同一个采集页**，第二个没有独立意义，容易让人懵。采集页保存后只说"收好了"，**没有"去哪看整理结果"的去向**。知识地图页虽然能画出整张知识图谱，但**跟你实际拍过的题完全没关联**——你拍了 5 道题，地图上一个影子都看不到。

这一版要做成一条清晰的主线：**首页三个干脆的入口**（拍题 / 知识地图 / 周末小检查）→ 拍完一道题**有明确去向**（去知识地图看看 / 再拍一道）→ **知识地图里能看到你拍过的所有题**（先是"未分类题"列表，后面再把题挂到具体知识点上）。

**这一版明确不做、也不能让界面假装做了的事**（守 OPS §4 措辞铁律）：不做深度归因、不判断掌握程度、不生成完整学习方案、**未接通 VLM/ASR 前绝不说"已识别/已诊断/已分析薄弱点"**。Stage 1-2 的界面会诚实显示"识别稍后接入"，Stage 3 才接真 VLM 做轻量分类。

---

## 2. 当前实现盘点（工单要求 #1）

> 逐文件读过源码后的真实状态。结论：采集壳是真的（Phase 1.5 已硬化），知识地图页也是真的（画的是 48 节点种子图谱），但**两者之间没有任何连接**，且首页信息架构需要重构。

### 2.1 页面

| 页面 | 状态 | 实际行为 | 备注 |
|------|:--:|----------|------|
| `src/app/nana/layout.tsx` | ✅ 真实 | `getServerSession` 鉴权，未登录跳 `/login` | 不动 |
| `src/app/nana/page.tsx`（首页） | 🟡 需重构 | 加载 `/api/diagnosis/map` 判定有/无记录态；**2 个 ActionCard 都 → `/nana/capture`**（"补一段你当时怎么想的"无独立语义）；session 入口在正文中（非一级卡片）；**无知识地图一级入口** | Stage 1 改成 3 个 ActionCard |
| `src/app/nana/capture/page.tsx`（采集页） | ✅ 真实（Phase 1.5） | 真拍照/真录音/真存库；保存后显示"这道题已经收好了"+1.4s 重置；`captureCount≥3` 才显示"回首页看看"链接；**无"去知识地图"按钮** | Stage 1 加去向按钮 |
| `src/app/nana/knowledge-map/page.tsx`（知识地图） | 🟡 半成品 | 真实加载 `/api/diagnosis/map`，用 SVG 画 48 节点种子图谱 + 边 + 主线 + 详情卡；**完全不知道用户拍过哪些 Case**，无"未分类题/错题列表"区域 | Stage 1 加错题列表区 |
| `src/app/nana/session/page.tsx`（周末小检查） | ✅ 真实 | `getSessionList` + `createSessionItems` 真实接通，空/有记录双态正常 | 不动（仅首页提升为一级入口） |

### 2.2 API

| API | 状态 | 实际行为 | 备注 |
|------|:--:|----------|------|
| `POST /api/nana/cases` | ✅ 真实（Phase 1.5 G2 硬化） | type 白名单 4 项 + content ≤2MB + artifacts ≤8，违规 400 | 不动 |
| `GET /api/nana/cases/[id]` | ✅ 真实（Phase 1.5 G1 硬化） | `findFirst({where:{id,studentId}})`，跨用户→404 | 不动 |
| `POST /api/nana/cases/[id]/feedback` | 🟡 真实但闲置 | 关键词规则版轻反馈（`getFeedback(transcript)`，不调 LLM）；**Phase 1.5 已停用**（transcript 恒空，调了无意义）；已知设计债：未校验 case 存在性/归属 | 本版按 DP2 决定是否复活 |
| `GET /api/diagnosis/map` | ✅ 真实 | 返回节点状态 + 学习前沿 + 全量边 + 主线 + 详情字段；**不返回 Case** | 不动，错题列表走新端点 |
| `GET /api/diagnosis/sessions` / `session-items` / `submit-answers` / `paper-pack` | ✅ 真实（M2/M3c） | session 流程已就绪 | 不动 |
| **`GET /api/nana/cases`（列表，按当前用户）** | ❌ **不存在** | 当前只有 POST 创建 + GET 单个；**知识地图要显示"我的错题"必须新增此端点** | Stage 1 新增（无 schema 改动） |
| **Case↔KnowledgeNode 挂载/分类 API** | ❌ **不存在** | 无任何端点把题挂到知识点 | Stage 2 新增（依赖 DP1） |

### 2.3 数据模型（`prisma/schema.prisma`）

| 模型 | 状态 | 关键发现 |
|------|:--:|----------|
| `Case`（id/studentId/createdAt/artifacts） | ✅ nana 自有 | **无任何 nodeId/知识点字段**——这是本版核心待解的设计题 |
| `Artifact`（type/content/seq） | ✅ nana 自有 | type 注释写"image/audio/transcript/aiSummary"已**过时**（Phase 1.5 实际白名单是 question_image/audio_note/audio_meta/transcript）；Stage 1 顺手订正注释 |
| `KnowledgeNode`（48 节点）/ `KnowledgeEdge` / `Mainline` / `NodeMainline` / `MainlineBridge` | ✅ | 种子图谱已就绪 |
| `StudentNodeState` / `Misconception` / `MistakeNode` | ✅ | `MistakeNode`（mistakeId↔nodeId，loose String）是 **Case↔node 连接的设计先例** |
| `DiagnosisSession` / `ProbeRecord` / `ErrorRecord` / `Item` | ✅ | session 测评线，与本版主线无直接耦合 |
| **`CaseKnowledgeTag`（Case↔node 连接表）** | ❌ **不存在** | **DP1 待确认后 Stage 2 新增** |

### 2.4 库与脚本

| 文件 | 状态 | 备注 |
|------|:--:|------|
| `src/lib/nana/nana-api-client.ts` | ✅ 真实 | `createCase`/`getCase`/session 系列封装齐全；**缺 `listMyCases`**（Stage 1 补） |
| `src/lib/nana/feedback-rules.ts` | ✅ 真实 | 关键词规则版，有单测；本版按 DP2 决定用不用 |
| `scripts/vlm-transcribe.ts`（384 行） | ✅ 离线脚本可用 | 证明火山方舟豆包 Seed 2.0（OpenAI 兼容接口）能识图/识音；但它是**读 JPG 文件转写整张试卷**的 CLI，**不能直接当请求路径里的库用**，Stage 3 要抽取出"单题识图分类"的薄封装 |
| `src/__tests__/integration/nana/case-api.test.ts` | ✅ | 已覆盖 G1/G2（Phase 1.5）；Stage 1 扩列表端点 + 隔离测试 |
| `e2e/`（auth-flow / upload-correction / admin-settings） | ✅ | **Playwright 已装且在用**，DP3 不是新依赖；Stage 4 加 nana spec |

---

## 3. 信息架构与职责边界（工单要求 #2）

四个页面各管一件事，不重叠、不互相抢入口：

| 路由 | 职责（一句话） | 这一版做什么 / 不做什么 |
|------|----------------|------------------------|
| `/nana`（首页） | **路口**：告诉用户"今天从哪开始" | **做**：3 个一级入口（拍题/知识地图/周末小检查）+ 有无记录的轻提示。**不做**：不放历史题列表（归知识地图）、不放"补语音"（归历史题详情，未来轮） |
| `/nana/capture`（采集页） | **收一道题**：拍照 + 可选录音 + 存库 | **做**：真拍照/真录音/真存库 + 保存后明确去向（去知识地图/再拍一道）。**不做**：当场识图分类（Stage 3 才做，且异步）、当场转写（ASR 不在本版） |
| `/nana/knowledge-map`（知识地图） | **看整理结果**：知识点分布 + 历史题 | **做**：上层保留现有 48 节点图谱；**下层新增"最近拍过的题"列表**（V1 过渡，工单明确允许）。Stage 2 起：题上显示知识点标签。**不做**：不做深度归因可视化 |
| `/nana/session`（周末小检查） | **做一批题**：批次测评 | **做**：保持现状（已是真实流程）。仅被首页提升为一级入口 |

**"看所有拍过的题"不单独做成首页入口**——并入知识地图（工单 #2 明确要求）。

---

## 4. 任务分解（按 Stage，每 Stage 可独立上线 · 工单要求 #5）

> 测试策略：逻辑模块（分类 lib、清理脚本的删前计数）"测试先行"；纯样板（首页卡片、列表端点直通 CRUD）测试后置。每 Stage 结束都跑 `npm run test:all` + `npm.cmd run build`。

### 🟢 Stage 1：首页三入口 + 采集后去向 + 知识地图错题列表（V1 地板，满足全部验收 MUST）

**不碰 schema、不接真 AI、措辞全诚实。** 完成后即满足工单"验收标准"全部硬性项。

- [ ] **S1-1 首页重构**：删"补一段你当时怎么想的"ActionCard；新增"知识地图"ActionCard（→`/nana/knowledge-map`）；把 session 入口提升为"周末小检查"ActionCard（→`/nana/session`）。保留有无记录的轻提示（RecapBar/EmptyHint）但移到三卡片下方。（涉及: `src/app/nana/page.tsx`、可能新增 `src/components/nana/shared/` 的图标配置）
- [ ] **S1-2 采集页保存后去向**：保存成功态在"再拍一道"旁加"去知识地图看看"按钮（→`/nana/knowledge-map`）；措辞诚实——因为 Stage 1 无真识别，**显示"已收好 · 识别稍后接入"**，不显示"正在识别/识别完成"。（涉及: `src/app/nana/capture/page.tsx`）
- [ ] **S1-3 新增"我的错题列表"API**：`GET /api/nana/cases`（无 [id]），返回当前登录用户最近的 Case（默认最近 50 条，`createdAt` 倒序），每条含 `id/createdAt/artifacts(仅 question_image 缩略或标志)/tagStatus`。**带 studentId 归属过滤**（只返回自己的，沿用 G1 思路）。（涉及: 新增 `src/app/api/nana/cases/list/route.ts` 或在 `cases/route.ts` 加 GET handler；`src/lib/nana/nana-api-client.ts` 加 `listMyCases`）
- [ ] **S1-4 知识地图加"最近拍过的题"区**：在现有图谱上方或下方加一个"最近拍过的题"列表区（调 S1-3 端点），空状态显示"还没拍过题，去拍一道 →"。每条显示题图缩略 + 拍摄日期 + 标签状态（Stage 1 恒为"未分类"）。（涉及: `src/app/nana/knowledge-map/page.tsx`、新增 `src/components/nana/knowledge-map/recent-cases-list.tsx`）
- [ ] **S1-5 顺手订正**：`Artifact` 模型 type 注释更新为实际白名单；采集页 `Artifact` 类型注释同步。（涉及: `prisma/schema.prisma` 注释、`cases/route.ts` 注释——**仅注释，零结构改动**）
- [ ] **S1-6 测试**：扩 `case-api.test.ts` 加列表端点 + 用户隔离（A 的 list 看不到 B 的 case）；`npm run test:all` 不回归。

### 🟡 Stage 2：Case↔知识点挂载骨架 + 手动分类（**依赖 DP1 用户确认**）

**新增 `CaseKnowledgeTag` 表（铁律 1 须确认）。仍不接真 VLM，分类来源 = manual（人工从 UI 选）或 pending（待识别）。**

- [ ] **S2-1 Prisma 新增 model**（**单独确认后做**）：`CaseKnowledgeTag { id, caseId, nodeId, source, confidence, note, createdAt }` + `Case` 加反向关系 `knowledgeTags CaseKnowledgeTag[]`。跑 migration。（涉及: `prisma/schema.prisma`、`prisma/migrations/`）
- [ ] **S2-2 挂载/分类 lib 骨架**：新增 `src/lib/nana/case-classify.ts`，导出 `classifyCase(caseId)` —— Stage 2 实现 = 诚实返回 `{ tags: [], source: "pending", note: "识别稍后接入" }`，并写一条 `source="pending"` 的占位记录（或不写，见 DP1 细节）；导出 `tagCaseManually(caseId, nodeId, userId)`。（涉及: 新增 `src/lib/nana/case-classify.ts`）
- [ ] **S2-3 挂载 API**：`POST /api/nana/cases/[id]/tags`（人工挂知识点，带归属校验）+ `GET /api/nana/cases/[id]/tags`（读标签）。（涉及: 新增 `src/app/api/nana/cases/[id]/tags/route.ts`）
- [ ] **S2-4 知识地图显示标签**：错题列表每条显示知识点标签 chip（多数为"未分类"，人工挂过的显示节点名）；点 case 可展开"挂到哪个知识点"的小操作（从 48 节点里选）。（涉及: `recent-cases-list.tsx`、可能新增 case 详情弹层）
- [ ] **S2-5 测试先行**：`case-classify.test.ts`（pending 返回契约 + 手动挂载 + 隔离）；tags API 集成测试。

### 🔵 Stage 3：接通真实 VLM 轻量分类（stretch，可延后；对应 TECH_PLAN §采集与 AI 管线 / 第 5 阶段）

**把 `vlm-transcribe.ts` 的能力抽成"单题识图分类"薄封装，异步触发，结果回写 `CaseKnowledgeTag(source="vlm")`。**

- [ ] **S3-1 VLM 分类 lib**：新增 `src/lib/nana/vlm-classify.ts`，输入 question_image Base64 → 调火山方舟豆包（OpenAI 兼容）→ 输出 `{ candidateNodeIds: string[], confidence: number, rawHint: string }`。**新提示词**：单题、只做"大致属于哪几个知识点"的轻分类（对照 48 节点名），不做整卷转写。（涉及: 新增 `src/lib/nana/vlm-classify.ts`，复用 `VOLCENGINE_API_KEY` 环境变量）
- [ ] **S3-2 异步触发**：Case 创建后异步触发分类（不阻塞 201 响应；用 Next.js 的 `after` 或 fire-and-forget + try/catch）。成功回写 `CaseKnowledgeTag(source="vlm")`，失败显式记日志、**不假装成功**（铁律 6）。（涉及: `cases/route.ts` POST 末尾追加触发；`case-classify.ts` 接真 VLM 分支）
- [ ] **S3-3 措辞升级**：采集页保存后从"识别稍后接入"升级为"已收好 · 正在看看这题大致属于哪"（异步未完成）/ "可能属于：XXX"（已完成）。**confidence 低时仍说"不太确定，先放未分类"**，不硬塞。（涉及: `capture/page.tsx`）
- [ ] **S3-4 测试**：`vlm-classify.test.ts`（mock fetch，验证请求体/候选解析/失败处理）；分类端到端集成（mock VLM 返回 → CaseKnowledgeTag 落库）。

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

### Stage 2（依赖 DP1 确认）
| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改（**结构改动，须确认**） | 新增 `CaseKnowledgeTag` model + Case 反向关系 |
| `prisma/migrations/xxx` | 新增 | migration |
| `src/lib/nana/case-classify.ts` | 新增 | 分类骨架（pending + manual） |
| `src/app/api/nana/cases/[id]/tags/route.ts` | 新增 | 挂载/读取标签 API |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | 显示标签 chip + 挂载操作 |
| `src/__tests__/unit/nana/case-classify.test.ts` | 新增 | 测试先行 |
| `src/__tests__/integration/nana/case-api.test.ts` | 修改 | 加 tags API 测试 |

### Stage 3
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/nana/vlm-classify.ts` | 新增 | 单题 VLM 轻分类封装 |
| `src/lib/nana/case-classify.ts` | 修改 | 接真 VLM 分支 |
| `src/app/api/nana/cases/route.ts` | 修改 | POST 后异步触发分类 |
| `src/app/nana/capture/page.tsx` | 修改 | 措辞升级（正在看/可能属于） |
| `src/__tests__/unit/nana/vlm-classify.test.ts` | 新增 | mock VLM 测试 |

### Stage 4
| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/cleanup-nana-test-data.ts` | 新增 | 按用户清理 + 备份前置 + 计数 |
| `e2e/nana-capture-map.spec.ts` | 新增 | 手机视口 e2e |
| `doc/guide/nana-test-checklist.md` | 新增 | 部署前测试清单 |

---

## 6. 数据流设计（工单要求 #3）

```
[拍题保存]
   │  POST /api/nana/cases  { artifacts: [question_image, audio_note?, audio_meta?, transcript] }
   ▼
Case ──< Artifact（题图/原音/meta/逐字稿）           ← Phase 1.5 已就绪
   │
   │  Stage 3：异步触发 classifyCase(caseId)
   ▼
[识图分类]  VLM 读 question_image → candidateNodeIds      ← Stage 3 才接通
   │  （Stage 1-2：跳过此步，Case 无标签 / source=pending）
   ▼
CaseKnowledgeTag（caseId ↔ nodeId, source=manual|vlm, confidence）  ← Stage 2 建表
   │ 人工挂载(Stage 2) 或 VLM 自动挂(Stage 3)
   ▼
KnowledgeNode（已有 48 节点：M1-11 函数概念 / BG001… ）   ← M1 已就绪
   │
   ▼
知识地图 UI
   ├─ 上层：48 节点图谱（已有）+ Stage 2 起节点上叠加"挂了几道题"
   └─ 下层：最近拍过的题列表（Stage 1 新增）
            每条 = 题图缩略 + 日期 + 标签（Stage 1 全"未分类" → Stage 2 起有节点名）
```

**关键衔接点**：当前 Case 与 KnowledgeNode 之间**完全断开**。Stage 2 的 `CaseKnowledgeTag` 是唯一的桥。Stage 1 先不建桥，靠"未分类题列表"做过渡（工单 #2 明确允许）。

---

## 7. 数据库变更说明（工单要求 #4 · **单独章节，须用户确认**）

> ⚠️ **按铁律 1（破坏性操作须确认）+ 工单 #4，本节变更必须你明确同意后 execute-agent 才能执行。Stage 1 不涉及任何 schema 改动，可先做。**

### 7.1 唯一的结构变更：新增 `CaseKnowledgeTag` model（Stage 2）

**为什么需要**：一道错题要挂到一个或多个知识点。当前 schema 里 Case↔KnowledgeNode **没有任何关系字段**，无法表达"这道题属于一次函数图像"。

**为什么是新建表（Option A）而不是别的**：
- **Option B（复用 MasteryBridge/SessionItem）**——否决。那些是批次测评产物（学生做题→节点状态），语义是"测评证据"，不是"错题归档"。混用会让两种数据互相污染。
- **Option C（Case 上加 JSON 字段存 nodeIds）**——否决。查询不便（"某节点下有哪些题"要全表扫 JSON）、无法存 source/confidence、无法做唯一约束。
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
  confidence Float    @default(0.0)  // 0-1；manual=1.0，vlm/规则给概率
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
- `nodeId` 用松 String（不建 FK 到 KnowledgeNode），与现有 `MistakeNode.nodeId`/`ErrorRecord.rootNodeId` 一致——避免改 KnowledgeNode model。

**回退方案**：若上线后发现问题，`prisma migrate resolve --rolled-back` + drop `CaseKnowledgeTag` 表 + 移除 Case 反向字段即可，不影响已存的 Case/Artifact 数据。

### 7.2 Stage 1 的"注释订正"不算结构变更

Stage 1 只改 `Artifact.type` 的注释文字（从过时的"image/audio/…"改成实际白名单），**零结构改动**，不需单独确认。

---

## 8. 验收标准

### 8.1 对应工单"验收标准"（全部硬性项）

| 工单验收项 | 由哪个 Stage 满足 | 怎么验 |
|-----------|:--:|--------|
| 首页只保留 拍题/知识地图/周末小检查 三入口 | S1 | 打开 `/nana`，恰好 3 个一级 ActionCard |
| "补一段你当时怎么想的"不再是一级入口 | S1 | 首页无此卡片 |
| 采集页保存后有清晰去向 | S1 | 保存成功后可见"去知识地图看看"+"再拍一道" |
| 历史题能从知识地图路径进入查看 | S1 | `/nana/knowledge-map` 有"最近拍过的题"列表 |
| 未完成 ASR/OCR/VLM 时页面不假装 | S1-2 | Stage 1 显示"识别稍后接入"，无"已识别/已诊断" |
| 有明确的测试账号数据清理办法 | S4-1 | `scripts/cleanup-nana-test-data.ts` 可跑 |
| 有一套部署前可自动跑的测试清单 | S4-3 + 现有 | `npm run test:all` + `npm.cmd run build` + CI 容器 + e2e |

> **结论：Stage 1 + Stage 4 = 满足工单全部 MUST 验收项。** Stage 2-3 是"初步识别/智能分类"的进阶目标，验收以"诚实"为地板。

### 8.2 每 Stage 附加验收

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
- [ ] 创建 Case 后异步出现 `source="vlm"` 标签（mock 下可验）
- [ ] VLM 失败时不写假标签、有日志（铁律 6）
- [ ] confidence 低时 UI 说"不太确定"，不硬塞

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
| 分类流程 | vitest（mock VLM） | question_image → CaseKnowledgeTag 落库 | S3 |
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

---

## 11. 风险与注意事项（工单要求 #8）

| 风险 | 影响 | 应对 | 归属 |
|------|------|------|:--:|
| **识别不准（Stage 3 VLM）** | 错题挂错知识点，误导后续 | confidence 阈值（如 <0.5 不自动挂、留 pending）；UI 始终允许人工改；措辞用"可能属于"不说"是" | S3 |
| **分类不准（节点候选过多）** | 48 节点里 VLM 给一堆候选 | 提示词约束"最多 3 个 + 按置信降序"；低置信全留未分类 | S3 |
| **生产数据误删（清理脚本）** | 删错用户、删生产真数据 | 备份前置硬门禁 + `--dry-run` + where 恒带 userId + 事务回滚 + 默认不清 session | S4 |
| **Base64 体积膨胀** | case 多了拖慢 SQLite/备份 | 已登记设计债（Phase 1.5）：阈值 case>100 或库>50MB 迁对象存储；本版不触发 | 持续 |
| **移动端录音兼容** | iOS 用 audio/mp4、Android 用 webm | Phase 1.5 已做 mimeType 动态探测；本版不动录音，沿用 | 已解 |
| **VLM 异步触发失败静默** | 用户以为识别了其实没成 | 失败显式记日志 + 不写假标签 + UI 允许"识别失败，稍后重试"（铁律 6） | S3 |
| **首页重构破坏现有 map 数据加载** | 有/无记录态判定乱 | Stage 1 保留 `/api/diagnosis/map` 调用逻辑，只改 ActionCard 区 | S1 |
| **铁律提醒** | — | Stage 2 schema 改动须 DP1 确认（铁律 1）；全程不改上游 model（铁律 3）；措辞不越界（OPS §4） | 全程 |

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
// Stage 3: 调 vlmClassify(imageBase64) → 写 CaseKnowledgeTag(source="vlm") → 返回 done
export async function classifyCase(caseId: string): Promise<ClassifyResult>;

export async function tagCaseManually(
  caseId: string, nodeId: string, userId: string, note?: string
): Promise<CaseKnowledgeTag>;
```

### 12.7 VLM 分类薄封装（Stage 3）

```ts
// src/lib/nana/vlm-classify.ts
// 复用 vlm-transcribe.ts 的模型路由思路（PRO_ENDPOINT_ID / PRO_MODEL_NAME / VOLCENGINE_API_KEY）
// 但用"单题轻分类"新提示词（不是整卷转写）
export async function vlmClassify(imageBase64: string): Promise<{
  candidateNodeIds: string[];   // 按置信降序，最多 3 个
  confidence: number;           // 最高候选的置信
  rawHint: string;              // 大白话线索，如 "一次函数图像、增减性"
}>;

// 提示词要点（对照 48 节点）：
// "这是一道高中数学题的截图。请从下列知识点里挑最相关的 1-3 个（按相关度降序），
//  给每个一个 0-1 的把握。看不清或不确定就返回空，不要猜。"
// 节点名清单从 KnowledgeNode 表读（id+name）注入提示词。
```

### 12.8 清理脚本伪代码（Stage 4）

```ts
// scripts/cleanup-nana-test-data.ts
// 1. parseArgs: --userId (必填) --dry-run --include-sessions --backup-path
// 2. 校验 userId 非空 → 否则退出
// 3. 备份检查：读 backup-path 目录，找最新 .bak，校验mtime < 阈值 → 缺失则退出非 0
// 4. prisma 事务内：
//      count Case(where studentId) / Artifact(via Case) / StudentNodeState / 可选 Session
//      打印 [将删除] 逐表计数
//      if (!dryRun) deleteMany 各表（where 恒带 studentId/userId）
//      打印 [已删除] 逐表计数
// 5. 失败 → 事务回滚 + 非 0 退出 + 显式报错（铁律 6）
```

### 12.9 e2e spec 要点（Stage 4）

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

- **OPS_handbook §4（前台措辞铁律）**——Stage 1-3 全程：不出现"诊断/已诊断/薄弱/得分/掌握"；未接 VLM 前说"识别稍后接入"，接通后说"可能属于"，不说"是/已确诊"。
- **OPS_handbook §6（主次铁律：她备考优先）**——本版不给她增加使用负担，首页从"俩按钮都一样"简化为"三个干脆入口"。
- **TECH_PLAN_v2 §采集与 AI 管线**——Stage 1-2 只做采集 + 骨架；Stage 3 接 VLM 属该章"分类"轻量版，深度归因/ASR 不在本版。
- **TECH_PLAN_v2 §知识图谱数据层**——复用已有 48 节点 + 8 表，CaseKnowledgeTag 是新增挂接（铁律 3）。
- **AGENTS 铁律 1（破坏性操作须确认）**——Stage 2 的 CaseKnowledgeTag 新表须 DP1 单独确认。
- **AGENTS 铁律 3（不改上游表结构）**——所有改动落在 nana 自有 model/目录，上游 wrong-notebook model（User/ErrorItem/KnowledgeTag…）零改动。
- **AGENTS 铁律 5/6（遇错停下、显式失败）**——VLM 失败、清理脚本失败均显式报错不静默。
- **doc/spec/capture-layer-design-backlog.md**（case 四层：题图/原音/逐字稿/AI 提要）——本版 Case 结构延续该模型，Stage 3 的 VLM 分类是"AI 提要"层的轻量起点。

---

> **门禁状态**：4 个决策点已列出（DP1 阻塞 Stage 2，DP2/3/4 不阻塞 Stage 1）。Stage 1 不依赖任何 schema 改动、可立即执行。**等你一句"开始 Stage 1"或"确认本计划"放行**（AGENTS 门禁 2：计划未经用户确认不得执行）。Stage 2 进入前再就 DP1 单独确认。
