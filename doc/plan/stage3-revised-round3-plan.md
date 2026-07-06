# Stage 3 v3-revised Round 3 — 题目汇总 API + 列表扩展 + 三 tab 外壳

> **轮次**: Round 3
> **日期**: 2026-07-06
> **计划者**: plan-agent (CatPaw)
> **前置**: Round 2 审计复审 ✅ 通过（commit `2f0f26c`）
> **计划**: 本文件

---

## 1. 范围

### 做：

1. **新增 `GET /api/nana/cases/summary`** — 按 TextbookTopic 分组的题目汇总
2. **修改 `GET /api/nana/cases`** — 列表扩展轻量 AI 字段
3. **知识地图页三 tab 外壳** — 默认 tab = 题目汇总，图谱/列表保留为第二、第三 tab

### 不做：

- 不做采集页 AI 结果卡
- 不做打印页
- 不做真实 provider smoke
- 不改 schema
- 不改 /process API
- 不返回 artifact.content（base64 原图）

---

## 2. GET /api/nana/cases/summary

### 2.1 路由

`src/app/api/nana/cases/summary/route.ts`（新文件）

### 2.2 请求

```
GET /api/nana/cases/summary
```

无查询参数。归属过滤走 session.user.id。

### 2.3 响应结构

```typescript
{
  groups: Array<{
    topic: {
      id: string;          // TextbookTopic.id，如 "TB-001"
      name: string;        // "集合的概念"
      chapter: string;     // "第一章 集合与常用逻辑用语"
      section: string;     // "1.1 集合的概念"
    } | null;              // null = 未分类/暂未覆盖
    cases: Array<{
      id: string;          // Case.id
      createdAt: string;   // ISO
      hasImage: boolean;   // 是否有题图
      processStatus: "pending" | "success" | "failed";
      aiSummary: string | null;        // CaseAiResult.questionSummary
      textbookChapter: string | null;  // TextbookTopic.chapter（冗余，方便卡片直接显示）
    }>;
  }>;
  total: number;           // 当前用户 case 总数
}
```

### 2.4 分组逻辑

1. 查当前用户所有 Case（`where: { studentId: session.user.id }`），按 createdAt 倒序
2. 每个 Case 关联查询：
   - `aiResult`：1:1，取 `processingStatus` + `questionSummary`
   - `textbookTopicTags`：取最高置信的 `textbookTopicId`（如有多个取 confidence 最高的）
   - `artifacts`：仅取 `type`，判断是否有 `question_image`
3. 按 TextbookTopic 分组：
   - 有 textbookTopicTag 的 case → 归入对应 topic 组
   - 无 textbookTopicTag 的 case → 归入 `topic: null` 组（"未分类/暂未覆盖"）
4. 每组内 case 按 createdAt 倒序

### 2.5 processStatus 映射

| 条件 | processStatus |
|------|---------------|
| CaseAiResult 不存在 | `"pending"` |
| CaseAiResult.processingStatus = "success" | `"success"` |
| CaseAiResult.processingStatus = "failed" | `"failed"` |
| CaseAiResult.processingStatus = "timeout" | `"failed"` |
| CaseAiResult.processingStatus = "pending" | `"pending"` |

### 2.6 安全约束

- **归属过滤**：`where: { studentId: session.user.id }`，不暴露其他用户数据
- **不返回 base64**：不 select `artifact.content`
- **轻量字段**：只返回卡片展示所需最小字段集

### 2.7 性能考虑

- Case 数量目前 < 100，不做分页，一次返回全部
- 关联查询用 Prisma `include`，避免 N+1
- 如果后续 case 量增大，可加分页参数

---

## 3. 修改 GET /api/nana/cases 列表

### 3.1 路由

`src/app/api/nana/cases/route.ts`（已有文件，仅扩展 GET handler）

### 3.2 扩展字段

现有 `CaseListItem` 返回：

```typescript
{
  id, createdAt, hasImage, hasAudio,
  tagCount: 0,           // Stage 1 恒 0（保留）
  tagStatus: 'untagged', // Stage 1 恒 untagged（保留）
  transcriptReady: false // Stage 1 恒 false（保留）
}
```

扩展为：

```typescript
{
  id, createdAt, hasImage, hasAudio,
  tagCount: 0,            // 保留（向后兼容）
  tagStatus: 'untagged',  // 保留
  transcriptReady: false, // 保留
  // ── Round 3 新增 ──
  aiSummary: string | null;          // CaseAiResult.questionSummary
  textbookChapter: string | null;    // TextbookTopic.chapter（从 textbookTopicTag 关联）
  processStatus: "pending" | "success" | "failed";
}
```

### 3.3 实现方式

在现有 `select` 中增加 `aiResult` 关联查询：

```typescript
select: {
  id: true,
  createdAt: true,
  artifacts: { select: { type: true } },
  aiResult: {
    select: {
      questionSummary: true,
      processingStatus: true,
    },
  },
  textbookTopicTags: {
    select: { textbookTopicId: true, confidence: true },
    orderBy: { confidence: 'desc' },
    take: 1,
  },
}
```

然后对 `textbookTopicTags[0]?.textbookTopicId` 再查 TextbookTopic 取 chapter。

### 3.4 不改 POST handler

POST /api/nana/cases 的逻辑不变。

### 3.5 向后兼容

原有字段（tagCount, tagStatus, transcriptReady）保留原值，前端不依赖这些字段做新功能。新增字段为 nullable，前端容错处理。

---

## 4. 前端：知识地图页三 tab 外壳

### 4.1 文件

`src/app/nana/knowledge-map/page.tsx`（已有文件，改造）

### 4.2 三 tab 结构

| Tab 序号 | 名称 | 默认 | 内容 |
|---------|------|:--:|------|
| 1 | 题目汇总 | ✅ | 调 summary API，展示分组卡片 |
| 2 | 图谱 | | 原有 KnowledgeMapCanvas / ListView |
| 3 | 列表 | | 原有 RecentCasesList |

### 4.3 题目汇总 tab 实现

- `useState` 管理 `activeTab: "summary" | "graph" | "list"`，默认 `"summary"`
- summary tab：
  - `useEffect` 调 `GET /api/nana/cases/summary`
  - 渲染分组列表：每组一个 section 标题（topic.name 或"未分类/暂未覆盖"）+ case 卡片列表
  - 每张卡片显示：aiSummary（或"暂无摘要"）、textbookChapter（或"未分类"）、processStatus 标签、createdAt
  - processStatus 三态视觉：
    - `pending` → 灰色 chip "待处理"
    - `success` → 绿色 chip "已完成"
    - `failed` → 琥珀色 chip "需重试"
  - 原图不默认展示（只显示 hasImage 图标）
  - 点击卡片 → 跳转到 case 详情页（后续 Round 做，本轮只留 href 链接或点击事件占位）

### 4.4 图谱/列表 tab

保留原有逻辑，作为 tab 2 和 tab 3。切换 tab 时不销毁已加载数据（用 `hidden` 而非条件渲染）。

### 4.5 顶栏调整

- 标题从"我的知识地图"保持不变
- 原有"图谱 | 列表" toggle 替换为三 tab segmented control："汇总 | 图谱 | 列表"
- 图例仅图谱 tab 显示

### 4.6 措辞合规

- "未分类/暂未覆盖" — 不说"AI 未识别"
- "待处理" — 不说"失败"
- "已完成" — 不说"正确"或"掌握"
- "需重试" — 不说"错误"

---

## 5. API 客户端扩展

`src/lib/nana/nana-api-client.ts` 新增：

```typescript
export interface CaseSummaryItem {
  id: string;
  createdAt: string;
  hasImage: boolean;
  processStatus: "pending" | "success" | "failed";
  aiSummary: string | null;
  textbookChapter: string | null;
}

export interface CaseSummaryGroup {
  topic: { id: string; name: string; chapter: string; section: string } | null;
  cases: CaseSummaryItem[];
}

export async function getCaseSummary(): Promise<{ groups: CaseSummaryGroup[]; total: number }>;
```

同时扩展 `CaseListItem` 接口增加 `aiSummary`、`textbookChapter`、`processStatus` 字段。

---

## 6. 集成测试

### 6.1 测试文件

`src/__tests__/integration/nana/summary-api.test.ts`（新文件）

### 6.2 测试覆盖

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 登录校验 | 未登录 → 401 |
| 2 | 跨用户隔离 | 用户 A 的 case 不出现在用户 B 的 summary 中 |
| 3 | 按 TextbookTopic 分组 | 有 textbookTopicTag 的 case 归入对应 topic 组 |
| 4 | 未分类分组 | 无 textbookTopicTag 的 case 归入 topic=null 组 |
| 5 | processStatus=pending | CaseAiResult 不存在 → pending |
| 6 | processStatus=success | CaseAiResult.processingStatus=success → success |
| 7 | processStatus=failed | CaseAiResult.processingStatus=failed → failed |
| 8 | 不返回 base64 | 响应中无 artifact.content |
| 9 | aiSummary 字段 | CaseAiResult.questionSummary 正确返回 |
| 10 | 空列表 | 新用户无 case → groups=[], total=0 |

### 6.3 列表 API 扩展测试

在现有 `process-api.test.ts` 中追加，或新建 `cases-list-api.test.ts`：

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 扩展字段存在 | aiSummary, textbookChapter, processStatus 字段存在 |
| 2 | pending case | 无 CaseAiResult → processStatus=pending |
| 3 | success case | 有 CaseAiResult(processingStatus=success) → processStatus=success |
| 4 | 不返回 base64 | 响应中无 artifact.content |

---

## 7. 执行顺序

1. 新建 `summary/route.ts` + 集成测试
2. 修改 `cases/route.ts` GET handler + 扩展测试
3. 扩展 `nana-api-client.ts`
4. 改造 `knowledge-map/page.tsx` 三 tab 外壳
5. `npm run build` + 集成测试全绿
6. Git 收口

---

## 8. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | summary API 跨用户隔离 | 集成测试 #2 |
| 2 | summary/list API 不返回 base64 | 集成测试 #8 + 列表测试 #4 |
| 3 | pending/failed/success 三态可见 | 集成测试 #5-7 |
| 4 | 未分类/暂未覆盖分组可见 | 集成测试 #4 |
| 5 | npm run build 通过 | 构建验证 |
| 6 | 相关集成测试通过 | 测试验证 |

---

## 9. 回滚方案

- summary API：新文件，`git revert` 即可
- cases 列表扩展：修改已有文件，`git revert` 回退
- 前端三 tab：修改已有文件，`git revert` 回退
- 无 schema 变更，无 migration，无数据迁移风险
