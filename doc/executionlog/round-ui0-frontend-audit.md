# Round UI-0：前端修改点排查清单

> **产出时间**：2026-07-05
> **排查范围**：对照 `stage3-ai-integration-plan-v3-revised.md` §14.5 的 7 个维度
> **门禁**：本清单交用户确认后，方可进入 Round 1-5 前端开发。Round 0（Schema）可并行推进。
> **原则**：只排查不写代码。

---

## 总览

| # | 维度 | 现有文件 | 改动量 | 风险 |
|---|------|----------|--------|------|
| 1 | 首页入口 | `src/app/nana/page.tsx` | 小（文案+链接） | 低 |
| 2 | 拍题页 | `src/app/nana/capture/page.tsx` | 大（状态机重写） | 中 |
| 3 | AI 结果卡 | `src/components/nana/capture/light-feedback.tsx` | 大（字段重做） | 中 |
| 4 | 知识地图页 IA | `src/app/nana/knowledge-map/page.tsx` | 中（3 tab + 默认值） | 中 |
| 5 | 题目汇总 | `src/components/nana/knowledge-map/recent-cases-list.tsx` | 大（主卡重排） | 高 |
| 6 | 打印预览 | `src/app/print-preview/page.tsx` | 大（数据源不同） | 高 |
| 7 | API/数据依赖 | `src/app/api/nana/cases/` + `nana-api-client.ts` | 中（新增 4 端点） | 中 |

---

## 1. 首页入口

### 现有文件
- `src/app/nana/page.tsx`

### 现有结构
```
3 个 ActionCard（纵向排列）：
├─ "拍一道题"     → /nana/capture     (Camera icon, green)
├─ "看看知识地图"  → /nana/knowledge-map (Map icon, sky)
└─ "周末小检查"   → /nana/session     (ClipboardCheck icon, amber)

下方：有记录/空状态轻提示（RecapBar/EmptyHint）
数据来源：GET /api/diagnosis/map?studentId=xxx
```

### 需要修改

| 排查项 | 现状 | 计划要求 | 改动 |
|--------|------|----------|------|
| 三入口文案 | "拍一道题" / "看看知识地图" / "周末小检查" | "拍题" / "题目汇总" / "周末小检查" | 改前两个文案 |
| 优先级 | 拍题第一 ✓ / 知识地图第二 / 小检查第三 | 拍题第一 / 题目汇总第二 / 小检查第三 | 顺序不变，仅文案 |
| 重复入口 | 无重复 | — | 无需改 |
| "看看知识地图"描述 | "拍过的题和整张地图都在这儿" | 需拆分语义：题目汇总≠知识地图 | 改描述为"拍过的题都在这儿" |

### 可复用
- `ActionCard` 组件（`src/components/nana/shared/action-card.tsx`）完全可复用
- `EmptyHint` 组件可复用
- map API 数据加载逻辑可复用

### 风险：低
- 仅文案和链接微调，不涉及结构变更

---

## 2. 拍题页

### 现有文件
- `src/app/nana/capture/page.tsx`

### 现有结构
```
状态机（同步）：
- photoState = "empty" | "photoTaken"
- saveState  = "idle" | "saving" | "saved" | "error"
- 门禁：无照片禁保存 / 录音中禁保存

保存成功后：
→ saveState = "saved"
→ Toast 浮动卡弹出："已收好 · 识别稍后接入"
→ 两个去向：[去知识地图看看] [再拍一道]
→ 停留态，不自动重置

3 个 Tab：
├─ "讲讲思路"   → VoiceRecorder
├─ "我的话"    → TranscriptionPanel (恒"尚未转写")
└─ "帮你整理"  → 占位文本"先把材料收好，等多拍几道再一起看规律"
```

### 需要修改

| 排查项 | 现状 | 计划要求 | 改动 |
|--------|------|----------|------|
| 保存后状态展示 | "已收好 · 识别稍后接入" 停留态 | "正在整理这题…" + 同时显示 [再拍一道] [去题目汇总] | 改 Toast 内容和按钮 |
| 异步整理 | 无（同步停留） | 保存后立即允许拍下一道，AI 整理在后台进行 | **状态机新增 processing 状态** |
| 轮询机制 | 无 | 3 秒轮询 /process 状态，最多 60 秒；超时提示"稍后在题目汇总里看" | **新增轮询逻辑** |
| 题目汇总状态标记 | 无 | 每题卡显示整理状态：整理中/已整理/整理失败 | 由题目汇总页实现 |
| 成功后跳转 | → /nana/knowledge-map | → /nana/knowledge-map?tab=summary（或独立路由） | 改链接参数 |
| "帮你整理" tab | 占位文本 | 需展示 AI 结果卡（整理完成后） | **接入 LightFeedback 改造版** |
| createCase 返回 | 返回完整 record（含 id） | 需用 caseId 触发 /process | ✓ 返回值已含 id，可复用 |

### 状态机改动明细

**现有状态机**：
```
idle → saving → saved (停留) → [用户点去向]
                ↓ error
              (可重试)
```

**计划状态机（v1 异步整理）**：
```
idle → saving → saved (201，caseId 返回)
                  ├─ 显示"正在整理这题…"，同时显示 [再拍一道] [去题目汇总]
                  │  （不再停留等待，用户可立即拍下一道）
                  → processing (后台调 /process，前端轮询 3s/60s)
                     ├─ done → 刷新该题状态为"已整理"
                     ├─ failed → 刷新该题状态为"整理失败"
                     └─ timeout (>60s) → 提示"稍后在题目汇总里看"
```

### 可复用
- `QuestionImageCapture` 组件完全可复用
- `VoiceRecorder` 组件完全可复用
- `TranscriptionPanel` 组件可复用
- `buildArtifacts` 逻辑可复用
- `createCase` 调用可复用（返回值已含 caseId）
- `handleTakeAnother` 重置逻辑可复用

### 风险：中
- 状态机从"同步停留"改为"异步整理+继续拍"，改动较大
- 需新增轮询逻辑（前端新代码）
- Toast 浮动卡需重构（从停留态改为非阻塞提示）

---

## 3. AI 结果卡

### 现有文件
- `src/components/nana/capture/light-feedback.tsx`（**当前未被拍题页使用**）
- `src/app/api/nana/cases/[id]/feedback/route.ts`（规则版，不调 LLM）

### 现有结构
```
LightFeedback 组件：
- Props: { transcript: string; caseId?: string }
- 调用: POST /api/nana/cases/:id/feedback
- 返回: { hint: string; relatedTags: string[]; isPreliminary: true }
- 展示:
  ├─ "不是终诊 · 这只是初步线索" 标签
  ├─ hint 文案
  └─ relatedTags 标签
- 状态: loading / loaded / error
```

### 需要修改

| 排查项 | 现状 | 计划要求 | 改动 |
|--------|------|----------|------|
| 展示字段 | hint + relatedTags（2 字段） | aiSummary, textbookChapter, aiMessage, possibleMistakeReason, nextActionSuggestion（5 字段） | **字段重做** |
| 空值隐藏 | 无空值隐藏逻辑 | possibleMistakeReason/nextActionSuggestion/aiMessage 为空时隐藏区块 | 新增条件渲染 |
| 修改摘要入口 | 无 | 需新增"修改摘要"按钮 | 新增编辑入口 |
| 改分类入口 | 无 | 需新增"改分类"按钮 | 新增分类入口 |
| 语义清理 | "不是终诊 · 这只是初步线索" | 需改为轻反馈语义（去"终诊"） | 改文案 |
| 数据源 | POST /feedback（规则版） | GET /ai-result（AI 整理结果） | **改 API 调用** |
| 组件接入 | 未被拍题页使用 | 需在拍题页"帮你整理" tab 中接入 | 接入 |

### 计划要求的 5 字段展示

```
AI 结果卡：
├─ 课本分类（textbookChapter）—— 顶部 chip
├─ AI 摘要（aiSummary）—— 主文案
├─ AI 想对你说（aiMessage）—— 可选，空则隐藏
├─ 可能的方向（possibleMistakeReason）—— 可选，空则隐藏
├─ 下一步可以（nextActionSuggestion）—— 可选，空则隐藏
├─ [修改摘要] [改分类] 操作按钮
└─ 轻反馈标识（替代"不是终诊"）
```

### 可复用
- `LoadingSkeleton` 骨架屏可复用
- `ErrorFallback` 错误降级可复用
- `FeedbackContent` 组件结构可参考但需重做

### 风险：中
- 字段从 2 个扩展到 5 个，空值隐藏逻辑需仔细处理
- 数据源从规则版 feedback 改为 AI 整理结果
- 编辑入口（修改摘要/改分类）为全新功能

---

## 4. 知识地图页 IA

### 现有文件
- `src/app/nana/knowledge-map/page.tsx`

### 现有结构
```
segControl（2 tab）：
├─ "图谱" (graph) ← 默认
└─ "列表" (list)

浮层入口：
├─ "最近拍过" 按钮（左下角，graph 模式下显示）
└─ RecentCasesList drawer（bottom sheet）

数据来源：GET /api/diagnosis/map?studentId=xxx
```

### 需要修改

| 排查项 | 现状 | 计划要求 | 改动 |
|--------|------|----------|------|
| 默认 tab | graph（图谱） | summary（题目汇总） | **改默认值** |
| segControl tab 数 | 2 个（图谱/列表） | 3 个（题目汇总/图谱/列表） | **新增第三个 tab** |
| segControl 顺序 | 图谱第一 | 题目汇总第一 | 调整顺序 |
| 题目汇总展示方式 | 浮层抽屉（bottom sheet） | 常驻 tab（第一视图） | **从浮层改为常驻** |
| 浮层入口按钮 | "最近拍过"按钮 | 移除（改为 tab 入口） | 删除浮层入口 |
| URL 参数 | ?openCases=1 自动打开浮层 | ?tab=summary 指定 tab | 改 URL 参数 |

### 可复用
- `KnowledgeMapCanvas` 组件完全可复用
- `KnowledgeMapListView` 组件完全可复用
- `KnowledgeDetailCard` 组件完全可复用
- segControl 切换逻辑可复用（扩展为 3 tab）
- map API 数据加载逻辑可复用

### 风险：中
- 需新增第三个 tab 并调整默认值
- RecentCasesList 从浮层改为常驻，需调整组件的渲染模式
- 空状态逻辑需调整（题目汇总为空时和图谱为空时的提示不同）

---

## 5. 题目汇总

### 现有文件
- `src/components/nana/knowledge-map/recent-cases-list.tsx`

### 现有结构
```
RecentCasesList（横向列表）：
├─ 横向滚动小卡片（w-104px）：
│  ├─ 占位缩略图（ImageIcon，列表 API 不返回 base64）
│  ├─ 日期（"7月1日"）
│  └─ "未分类" chip
└─ CaseTagPanel（选中后展开）：
   ├─ 题图懒加载（loadCaseDetail → GET /api/nana/cases/:id，带缓存）
   ├─ 已挂标签列表
   └─ 人工挂载知识点（select + 挂上按钮）

缓存机制：
├─ caseDetailCache: Map<caseId, CaseResponse>（题图 ~1MB base64，避免重拉）
└─ blobUrlCache: Map<caseId, string>（base64 → blob: URL，避免重解码）
```

### 需要修改

| 排查项 | 现状 | 计划要求 | 改动 |
|--------|------|----------|------|
| 主卡默认展示 | 占位缩略图+日期+未分类 | 课本分类+AI摘要+AI想对你说+下一步可以+操作按钮 | **主卡完全重排** |
| 展开后展示 | 题图+标签列表+挂载 | 原题图懒加载+语音标记+转写+时间+修改摘要入口 | **展开内容重做** |
| 列表布局 | 横向滚动小卡片 | 纵向主卡列表 | **布局方向改变** |
| 整理状态标记 | 无 | 整理中/已整理/整理失败 | **新增状态标记** |
| 原图懒加载 | ✓ 已实现（列表 API 不返回 base64） | ✓ 同 | 无需改 |
| 手动改分类 | select + 挂上按钮 | 需更友好的交互 | 改进交互 |
| 列表 API 字段 | id, createdAt, hasImage, hasAudio, tagCount, tagStatus, transcriptReady | 需增加：aiSummary, textbookChapter, processStatus | **扩展 API 返回** |

### 主卡重排明细

**现有主卡（横向小卡）**：
```
┌──────────┐
│ [缩略图]  │
│ 7月1日    │
│ 未分类    │
└──────────┘
```

**计划主卡（纵向大卡）**：
```
┌─────────────────────────────────┐
│ [课本分类 chip]         [整理中] │
│ AI 摘要文本...                    │
│ AI 想对你说...（可选）            │
│ 下一步可以...（可选）             │
│ [展开▼] [改分类] [打印]          │
├─────────────────────────────────┤
│ 展开后：                          │
│  [原题图懒加载]                  │
│  语音标记 / 转写 / 时间           │
│  [修改摘要]                      │
└─────────────────────────────────┘
```

### 可复用
- `caseDetailCache` / `blobUrlCache` 缓存机制完全可复用
- `loadCaseDetail` 懒加载逻辑可复用
- `base64ToBlobUrl` 工具函数可复用
- `CaseTagPanel` 的标签展示和挂载逻辑可复用（作为展开内容的一部分）
- `listMyCases` API 调用可复用（需扩展返回字段）

### 风险：高
- 主卡结构完全重排：从横向小卡改为纵向大卡
- 需大量新建 UI 组件
- 展开内容需整合题图、标签、转写、时间等多个数据源
- 整理状态标记需与轮询/API 扩展配合

---

## 6. 打印预览

### 现有文件
- `src/app/print-preview/page.tsx`

### 现有结构
```
数据来源：GET /api/error-items/list（上游 wrong-notebook 错题系统）
展示字段：
├─ 题号、科目、年级学期、试卷级别
├─ 知识点标签（tags 或 knowledgePoints）
├─ 题图（originalImageUrl，imageScale 30-100% 滑块）
├─ 答案（answerText）
└─ 解析（analysis）

打印控制：
├─ 显示/隐藏答案
├─ 显示/隐藏解析
├─ 显示/隐藏标签
├─ 显示/隐藏题文
└─ 图片缩放滑块

CSS: print:hidden / print:break-inside-avoid
```

### 需要修改

| 排查项 | 现状 | 计划要求 | 改动 |
|--------|------|----------|------|
| 数据源 | `/api/error-items/list`（上游错题） | Nana cases 数据 | **数据源完全不同** |
| 默认打印字段 | 题号/科目/年级/试卷级别/标签/题图/答案/解析 | 课本章节/AI摘要/题图缩略图/AI想对你说/下一步可以 | **字段完全替换** |
| 隐藏字段 | 无隐藏（全部可 toggle） | 默认不打印：时间/置信度/source/转写/技术状态 | 新增隐藏逻辑 |
| 题图缩略图 | imageScale 30-100% 可调 | max-width: 180px; max-height: 120px; object-fit: contain | **改 CSS 固定尺寸** |
| 打印控制 | 4 个 toggle + 1 个滑块 | 简化（弱化技术元信息） | 简化控制 |

### 关键冲突

**数据源不兼容**：现有打印预览基于上游 `error-items` 系统（`ErrorItem` 类型，含 `questionText`、`answerText`、`analysis`、`originalImageUrl` 等字段），与 Nana cases 数据模型完全不同。Nana cases 的数据是 `Case` + `Artifact`（base64 题图）+ `CaseKnowledgeTag`，没有 `answerText`/`analysis` 等字段。

**建议**：新建 `/nana/print-preview` 页面，不复用现有 `print-preview/page.tsx`。现有打印预览服务于上游错题本功能，不应混用。

### 可复用
- `print:hidden` / `print:break-inside-avoid` CSS 模式可复用
- 打印按钮 + `window.print()` 逻辑可复用
- 打印控制 UI 框架（checkbox toggles）可参考
- `MarkdownRenderer` 组件可复用（AI 摘要可能含 markdown）

### 风险：高
- 数据源完全不同，无法直接复用
- 需新建 Nana 专用打印预览页面
- 题图从 URL 改为 base64 blob URL，打印时需确保图片加载完成

---

## 7. API/数据依赖

### 现有 API 端点

| 端点 | 方法 | 用途 | 返回 base64? |
|------|------|------|-------------|
| `/api/nana/cases` | GET | 列表 | ✗ 仅 hasImage 标志 |
| `/api/nana/cases` | POST | 创建 | 返回完整 record 含 id |
| `/api/nana/cases/:id` | GET | 详情 | ✓ 含 artifacts 含 base64 |
| `/api/nana/cases/:id/tags` | GET | 标签列表 | — |
| `/api/nana/cases/:id/tags` | POST | 人工挂载 | — |
| `/api/nana/cases/:id/feedback` | POST | 规则版轻反馈 | — |
| `/api/diagnosis/map` | GET | 知识地图 | — |

### 现有 API 客户端
- `src/lib/nana/nana-api-client.ts`
- 已封装: `createCase`, `getCase`, `listMyCases`, `listCaseTags`, `tagCaseManually`, `getKnowledgeMap`

### 可复用 API

| 端点 | 复用方式 |
|------|----------|
| `POST /api/nana/cases` | ✓ 直接复用，返回值已含 caseId |
| `GET /api/nana/cases/:id` | ✓ 直接复用（题图懒加载） |
| `GET /api/nana/cases/:id/tags` | ✓ 直接复用 |
| `GET /api/diagnosis/map` | ✓ 直接复用 |

### 需扩展 API

| 端点 | 扩展内容 |
|------|----------|
| `GET /api/nana/cases` | 列表返回需增加字段：`aiSummary`（AI 摘要文本）、`textbookChapter`（课本分类）、`processStatus`（整理状态: processing/done/failed/pending） |

**现有列表返回**：
```typescript
{ id, createdAt, hasImage, hasAudio, tagCount, tagStatus, transcriptReady }
```

**需扩展为**：
```typescript
{ id, createdAt, hasImage, hasAudio,
  tagCount, tagStatus, transcriptReady,
  aiSummary: string | null,          // 新增
  textbookChapter: string | null,    // 新增
  processStatus: "pending" | "processing" | "done" | "failed"  // 新增
}
```

### 需新增 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/nana/cases/:id/process` | POST | 触发 AI 整理（异步） |
| `/api/nana/cases/:id/process` | GET | 查询整理状态（轮询用） |
| `/api/nana/cases/:id/ai-result` | GET | 获取 AI 结果卡数据（5 字段） |
| `/api/nana/cases/summary` | GET | 汇总列表（按课本章节分组，不返回 base64） |

### API 客户端需新增

```typescript
// 触发 AI 整理
export async function processCase(caseId: string): Promise<{ status: string }>

// 查询整理状态（轮询）
export async function getProcessStatus(caseId: string): Promise<{ status: string }>

// 获取 AI 结果卡
export async function getAiResult(caseId: string): Promise<AiResultData>

// 汇总列表（按章节分组）
export async function getCasesSummary(): Promise<{ groups: SummaryGroup[] }>
```

### 列表 API 性能硬约束

> **列表 API 不得返回 base64 题图，原图必须详情懒加载**

✅ 现有已实现：`GET /api/nana/cases` 列表仅 select `{ id, createdAt, artifacts: { select: { type } } }`，不返回 content 字段。

### 风险：中
- 新增 4 个 API 端点，但均有现有代码模式可参考
- 列表 API 扩展需注意不破坏现有 `RecentCasesList` 的调用
- `/process` 端点需对接 AI 管线（DeepSeek），是核心新增逻辑

---

## 排查结论

### 可直接复用（无需改动）的组件/模块

| 组件/模块 | 文件 | 说明 |
|-----------|------|------|
| QuestionImageCapture | `src/components/nana/capture/question-image-capture.tsx` | 拍照/压缩/Base64 |
| VoiceRecorder | `src/components/nana/capture/voice-recorder.tsx` | 录音/MediaRecorder |
| TranscriptionPanel | `src/components/nana/capture/transcription-panel.tsx` | 转写面板 |
| ActionCard | `src/components/nana/shared/action-card.tsx` | 首页入口卡 |
| KnowledgeMapCanvas | `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | 知识图谱可视化 |
| KnowledgeMapListView | `src/components/nana/knowledge-map/knowledge-map-list-view.tsx` | 知识列表视图 |
| KnowledgeDetailCard | `src/components/nana/knowledge-map/knowledge-detail-card.tsx` | 节点详情卡 |
| caseDetailCache / blobUrlCache | `recent-cases-list.tsx` 内 | 题图缓存机制 |
| NanaLayout | `src/app/nana/layout.tsx` | 鉴权守卫 |

### 需修改的文件清单

| 文件 | 改动类型 | 改动量 |
|------|----------|--------|
| `src/app/nana/page.tsx` | 文案+链接 | 小 |
| `src/app/nana/capture/page.tsx` | 状态机重写 | 大 |
| `src/components/nana/capture/light-feedback.tsx` | 字段重做 | 大 |
| `src/app/nana/knowledge-map/page.tsx` | 3 tab + 默认值 | 中 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 主卡重排 | 大 |
| `src/app/api/nana/cases/route.ts` | 列表扩展 | 中 |
| `src/lib/nana/nana-api-client.ts` | 新增 4 函数 | 中 |

### 需新建的文件清单

| 文件 | 用途 |
|------|------|
| `src/app/api/nana/cases/[id]/process/route.ts` | POST 触发整理 + GET 查询状态 |
| `src/app/api/nana/cases/[id]/ai-result/route.ts` | GET AI 结果卡数据 |
| `src/app/api/nana/cases/summary/route.ts` | GET 汇总列表（按章节分组） |
| `src/app/nana/print-preview/page.tsx` | Nana 专用打印预览页 |
| 可能新建：`src/components/nana/capture/ai-result-card.tsx` | AI 结果卡组件（从 LightFeedback 改造） |
| 可能新建：`src/components/nana/knowledge-map/case-summary-card.tsx` | 题目汇总主卡组件 |

### 风险评估

| 风险等级 | 项 | 说明 |
|----------|-----|------|
| **高** | 题目汇总主卡重排 | 从横向小卡改为纵向大卡，UI 重做 |
| **高** | 打印预览数据源 | 现有打印页基于 error-items，Nana 需新建 |
| **中** | 拍题页状态机 | 从同步停留改为异步整理+轮询 |
| **中** | AI 结果卡字段 | 从 2 字段扩展到 5 字段 + 空值隐藏 |
| **中** | 知识地图 3 tab | 新增 tab + 默认值调整 |
| **中** | API 新增端点 | 4 个新端点 + 1 个扩展 |
| **低** | 首页入口文案 | 仅文案和链接微调 |

### 与计划的冲突点

1. **打印预览数据源不兼容**：现有 `print-preview/page.tsx` 基于上游 `error-items`，与 Nana cases 数据模型完全不同。建议新建 Nana 专用打印预览页，不复用现有页面。

2. **LightFeedback 组件未接入**：`light-feedback.tsx` 虽然存在但从未被拍题页实际使用（拍题页"帮你整理" tab 是占位文本）。改造时可视为全新组件。

3. **列表 API 返回字段不足**：现有 `GET /api/nana/cases` 仅返回 `id, createdAt, hasImage, hasAudio, tagCount, tagStatus, transcriptReady`，缺少 `aiSummary`、`textbookChapter`、`processStatus`。需在 Round 0 Schema 确定后扩展。

---

## 下一步

> **⏸️ 停下来：交用户确认。**

用户确认本排查清单后：
- Round 0（Schema）可启动——需新增 AI 结果卡相关表/字段
- Round 1-5 前端开发可启动——按本清单的修改/新建文件执行
- 如排查发现与计划冲突较大（如打印预览数据源），可回 plan-agent 重新评估

---

> 排查人：execute-agent（Round UI-0）
> 排查日期：2026-07-05
