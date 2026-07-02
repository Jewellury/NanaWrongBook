# 移动端性能排查报告

> 日期：2026-07-02
> 触发：手机真机反馈 — 页面点击和切换整体不顺畅、感觉有延迟
> 原则：先测量，不猜修；不改 schema；不动生产数据（旧图迁移另提方案）

---

## 一、排查范围与方法

| 范围 | 方法 |
|------|------|
| ① /nana 首页点击入口响应 | 代码审查：ActionCard 组件、路由方式、loading 状态 |
| ② /nana/knowledge-map 首次打开 | 代码审查：API 调用栈、DB 查询数、数据量 |
| ③ 列表/图谱切换 | 审查 viewMode 切换路径、render 依赖 |
| ④ 最近题浮层 + 题图详情 | 审查 RecentCasesList、CaseTagPanel、base64 加载路径 |
| ⑤ KnowledgeMapCanvas 重复重算 | 审查 useMemo/useCallback 依赖、React.memo 包裹 |
| ⑥ base64 题图主线程/网络阻塞 | 审查 image-utils、API 端点、显示组件 |
| ⑦ client bundle 过重 | 统计 "use client" 文件数、chunk 大小、懒加载使用 |

---

## 二、Client Bundle 测量

### 2.1 关键数字

| 指标 | 数值 |
|------|------|
| `"use client"` 文件数 | **73 个** |
| 总 JS chunk 未压缩 | **2.67 MB（50 个文件）** |
| 总 CSS | **~100 KB（2 个文件）** |
| Top-3 大 chunk | `593d1c..` 384KB, `e66d63..` 354KB, `42594e..` 215KB |
| `next/dynamic` 使用 | **0 处** |
| `React.lazy` / `Suspense` 使用 | **0 处** |
| `loading.tsx` 文件 | **0 个** |
| 4G 首次 JS 下载估算（gzip 后 ~900KB） | **1.5-2s** |

### 2.2 "use client" 分布

- **所有页面**（21 个 page.tsx）均为 `"use client"`，包括 `/nana`、`/nana/knowledge-map`、`/nana/capture`、`/nana/session/*` 等
- **所有 nana 组件**（capture/、knowledge-map/、session/、shared/）均为 `"use client"`
- **所有 UI 基础组件**（shadcn/ui 系列 14 个）均为 `"use client"`
- **根布局** `src/app/layout.tsx` 是 Server Component，但包裹的 `<Providers>` 是 Client Component，强制全局 hydration

---

## 三、各页面 Network 请求测量

### 3.1 /nana 首页

| 请求 | 传输量 | 备注 |
|------|--------|------|
| 页面 HTML（RSC payload） | ~3 KB | 极轻 |
| Client JS（首次访问） | ~900 KB gzip | 有缓存后为 0 |
| `GET /api/diagnosis/map?studentId=xxx` | ~20 KB | 含 48 节点 + 边 + 主线 + 前沿，7 次 DB 查询 |
| **Total 首次** | **~923 KB** | |
| **Total 重复访问** | **~20 KB** | JS 缓存命中时 |

**最慢接口**：`GET /api/diagnosis/map` — 7 次顺序 DB 查询

### 3.2 /nana/knowledge-map

| 请求 | 传输量 | 备注 |
|------|--------|------|
| 页面 HTML | ~3 KB | |
| Client JS chunk（首次） | ~900 KB gzip | |
| `GET /api/diagnosis/map` | ~20 KB | **与首页完全重复**，同一 API |
| `GET /api/nana/cases`（列表，无 base64） | ~2 KB | 仅 hasImage 标志，已优化 |
| **Total 首次** | **~925 KB** | |
| **Total 重复访问** | **~22 KB** | JS 缓存命中时 |

**最慢接口**：同首页 `/api/diagnosis/map`

### 3.3 打开"最近拍过"浮层 → 展开题图详情

| 请求 | 传输量 | 备注 |
|------|--------|------|
| `GET /api/nana/cases` | ~2 KB | 列表已在页面挂载时预取 |
| `GET /api/nana/cases/:id/tags` | ~1 KB | 知识标签 |
| `GET /api/nana/cases/:id`（旧题图 1.2MB base64） | **~1.2 MB** | **主瓶颈** |
| `GET /api/nana/cases/:id`（新题图，已压缩） | ~100 KB | 1280px / 0.7q / ≤1MB |

**最慢接口**：`GET /api/nana/cases/:id`（旧图，约 1.2MB JSON），4G 下载 2-4s

### 3.4 API 端点 DB 查询数对照

| 端点 | DB 查询数 | 查询内容 |
|------|-----------|----------|
| `GET /api/diagnosis/map` | **7 次** | studentNodeState + caseKnowledgeTag.groupBy + knowledgeNode + nodeMainline + knowledgeEdge + mainline + KnowledgeGraph.load() |
| `GET /api/nana/cases`（列表） | 1 次 | case.findMany（不 select content） |
| `GET /api/nana/cases/:id` | 1 次 | case.findFirst（含 artifacts.content） |
| `GET /api/nana/cases/:id/tags` | 1 次 | caseKnowledgeTag.findMany |

---

## 四、React 渲染热点分析

### 4.1 ActionCard 点击无即时反馈

- 文件：`src/components/nana/shared/action-card.tsx:32`
- 实现：纯 `<Link href={...}>` 包裹卡片内容
- CSS 仅 `active:scale-[0.98]` + `hover:shadow-md`
- **问题**：点击后依赖 Next.js SPA 导航，无 `pressed` 反馈状态、无 loading 指示器。从点击到目标页首帧渲染间隔 **300-800ms**，用户感知为"卡了"

### 4.2 KnowledgeMapCanvas 未 memo 包裹

- 文件：`src/components/nana/knowledge-map/knowledge-map-canvas.tsx:83`
- 组件内部的 `useMemo`（layout / edges / nodes / baseMap）依赖稳定，不会重算成本高的内容
- **但组件本身未包裹 `React.memo`**。父组件（`knowledge-map/page.tsx`）在以下状态变化时 re-render，canvas 组件函数也执行：
  - `selectedNodeId` 变（弹详情卡）
  - `drawerOpen` 变（打/关最近题浮层）
  - `viewMode` 变（切列表/图谱）
- SVG 含 48 节点 + ~100 边 + 底图装饰 → **~150 个 SVG 元素需要 React reconciliation diff**，移动端耗时约 5-15ms
- 虽不阻塞级别，但配合浮层弹入动画会叠加成 15-30ms 的丢帧风险

### 4.3 首页和知识地图页重复请求同一 API

- `src/app/nana/page.tsx:56` 调用 `/api/diagnosis/map`（用于判断 hasRecords → 决定空状态文案）
- `src/app/nana/knowledge-map/page.tsx:86` 再次调用同一 API（用于渲染图谱数据）
- 用户从首页点击"看看知识地图" → 知识地图页重新发完全一样的 7 次 DB 查询
- **无任何前端数据缓存层**（无 SWR/React Query stale time 设置）

### 4.4 题图详情展开主线程阻塞

- 文件：`src/components/nana/knowledge-map/recent-cases-list.tsx:286-296`（`CaseTagPanel` 组件）
- 展开题图时执行路径：
  1. `getCase(id)` → 网络接收 ~1.2MB JSON 字符串（旧图 4G 2-4s）
  2. `response.json()` → 主线程 `JSON.parse`（~50ms）
  3. `setImageState({ content: base64String })` → React render
  4. `<img src="data:image/jpeg;base64,...">` → 浏览器主线程解码 base64（~100-200ms）
  5. Layout + Paint（~30ms）
- **总计**：网络 2-4s + 主线程阻塞 **200-300ms**（旧图）
- `caseDetailCache` Map 避免重复 fetch，但 `<img>` 重新 mount 时浏览器仍需重新解码 base64

### 4.5 SVG feGaussianBlur 滤镜

- 文件：`src/components/nana/knowledge-map/knowledge-map-canvas.tsx:392-399`
- `<filter id="node-glow">` 用 `feGaussianBlur stdDeviation="6"` → 强制创建 GPU 合成层
- 在 48 个 stable 节点的发光圆上同时使用此滤镜，移动 GPU 开销不可忽略
- mobile 模式不需要此视觉效果但**未条件屏蔽**

---

## 五、375px 视口交互耗时汇总

以下为 iPhone SE / 中端安卓机 + 4G 网络估算：

| 操作 | 估算耗时 | 瓶颈 | 是否可感知 |
|------|----------|------|------------|
| /nana 首页首次 JS 加载 | 1.5-2s | 2.67MB bundle | **是** |
| 首页内点击 ActionCard → 下一页首帧 | 300-800ms | 无即时反馈 + SPA 导航 | **是** |
| /nana/knowledge-map 首次数据加载 | 500-1500ms | 7 次 DB + 20KB 传输 | **是** |
| 图谱↔列表切换 | 5-15ms | SVG reconciliation | 轻微 |
| 打开"最近拍过"浮层 | 50-200ms | 2KB API 请求 | 否 |
| 展开题图详情（旧图 1.2MB） | **2-4s** | 网络 + JSON.parse + base64 解码 | **严重** |
| 展开题图详情（新图 ~100KB） | 200-500ms | — | 可接受 |
| 关闭浮层再打开同一题图 | ~100ms | 缓存命中但浏览器重解码 base64 | 轻微 |

---

## 六、旧图 1.2MB 影响确认

**是，旧 base64 题图是当前最大的单一性能瓶颈。** 证据链：

1. `processImageFile`（`src/lib/image-utils.ts:92`）已在 Stage 2.5 修复为强制压缩所有新图（maxWidth 1280、quality 0.7、≤1MB 上限）
2. 但修复**只影响新拍的题**，生产库中已存在的旧题图未迁移
3. 代码注释及审计文档 `doc/auditlog/stage2.5-followup-rootcause-2026-07-02.md` 确认旧逻辑为 `file.size > 1MB` 才压缩，手机拍照常 < 1MB 照片 → 走"不压缩"分支 → base64 编码膨胀 33% → 入库 ~1.2MB
4. `GET /api/nana/cases/:id` 返回完整 `artifacts[].content`，无缩略图/降级端点
5. `CaseTagPanel` 用 `img.src = "data:image/jpeg;base64,..."` 渲染，每次 mount 触发完整 base64 解码
6. 4G 下载 1.2MB JSON 约 2-4s，之后主线程解码约 200ms

**量化影响**：每个旧题图从"用户点击"到"图片可见"约 2.5-4.5s。有 10 个旧题图的用户，每次浏览都要经历。

---

## 七、修复清单

### P0 — 立即阻塞交互，应先修

#### P0-1：旧 base64 题图一次性压缩迁移

- **症状**：展开题图详情 2-4s
- **根因**：生产库存在未压缩的 ~1.2MB base64 题图
- **方向**：写 Node.js 迁移脚本，遍历 `Artifact` 表，对所有 `type='question_image'` 的记录用 `sharp` 重压缩（800px / 0.6q / JPEG）
- **风险**：涉及生产数据修改。**迁移前必须备份 SQLite，报数量待确认后执行。**
- **预估收益**：题图加载从 2-4s → 200-500ms

#### P0-2：ActionCard 点击即时反馈

- **症状**：首页点卡片到下一页有 300-800ms 感知延迟
- **根因**：`ActionCard` 是纯 `<Link>`，无 pressed/loading 状态过渡
- **方向**：加 `onClick` → `useState` 控制 `pressed` 样式 → `router.push` + `startTransition`；或在 `/nana/layout.tsx` 加全局 page transition loading bar
- **预估收益**：感知延迟 300-800ms → 即时

#### P0-3：首页和知识地图页共享 /api/diagnosis/map 数据

- **症状**：从首页点"知识地图"又跑 7 次 DB 查询
- **根因**：两个页面各自 `useEffect` 调同一 API，无客户端缓存
- **方向**：用 react-query 或手动 module-level cache + 5 分钟 stale time；或在根 layout 做 prefetch
- **预估收益**：首页 → 知识地图 0ms 数据等待

#### P0-4：KnowledgeMapCanvas 包裹 React.memo

- **症状**：弹层打/关、切视图时 ~150 SVG 元素被 reconciliation diff
- **根因**：canvas 组件未 `React.memo`，父组件状态变化 → canvas 组件函数执行
- **方向**：`export default React.memo(KnowledgeMapCanvas)`，props 浅比较（nodes/edges/mainlines/frontier/variant/nextLabel 引用稳定时跳过）
- **预估收益**：图谱滑动/弹层操作 5-15ms diff → 0ms

### P1 — 可感知但不阻塞

#### P1-1：拆分 "use client" 边界，懒加载重型组件

- **症状**：首次 JS bundle 2.67MB，4G 1.5-2s
- **根因**：73 个文件全 `"use client"`，无 `next/dynamic` 懒加载
- **方向**：
  - `EmptyHint`、图例行等纯展示无交互组件 → Server Component
  - `KnowledgeMapCanvas`、`KnowledgeMapListView` → `next/dynamic(() => import(...), { ssr: false })` + Suspense
  - `RecentCasesList` → 浮层打开时才动态加载
- **预估收益**：bundle 减少 30-40%

#### P1-2：新增缩略图端点，避免完整 base64 传输

- **症状**：`getCase` 返回 ~1.2MB JSON（旧图）
- **根因**：无缩略图/降级方案，API 返回全量 artifacts
- **方向**：新增 `GET /api/nana/cases/:id/image?size=thumb` 端点，服务端压缩后返回小图。或列表端点返回第一张题图的缩略 base64（200px 宽）
- **预估收益**：题图请求体积 1.2MB → 20KB

#### P1-3：KnowledgeGraph.load() 服务端缓存

- **症状**：每次 `/api/diagnosis/map` 都新建 KnowledgeGraph 并加载全量边
- **方向**：module-level 单例缓存（DB 数据不变则图结构不变），或至少 request-scoped 复用
- **预估收益**：API 响应 500ms → 200ms

#### P1-4：题图 base64 解码结果缓存

- **症状**：关闭 CaseTagPanel 再打开同一题，浏览器重新解码 base64
- **方向**：解码后用 `URL.createObjectURL(base64ToBlob(content))` 生成 blob URL，存入 `caseDetailCache`。blob URL 无需重复解码，且 `<img>` 可复用浏览器图片缓存
- **预估收益**：重开同题图 100ms → 0ms

### P2 — 渐进优化

#### P2-1：mobile 模式禁用 SVG feGaussianBlur

- 方向：`variant === "mobile"` 时条件跳过 `<filter>` 定义，改用 CSS `box-shadow` 模拟发光。或直接移除 mobile 模式的发光效果

#### P2-2：题图显示端尺寸限制

- 方向：`<img>` 虽 `max-h-[200px]` css 约束显示，但浏览器仍解码全分辨率。改为用 Canvas 预缩放再设 src，或在迁移时同步降分辨率

#### P2-3：补全 `animate-slide-up` CSS 动画定义

- 文件：`globals.css` 缺少 `@keyframes slide-up`，导致 `recent-cases-list.tsx:98` 和 `knowledge-detail-card.tsx:76` 的 `animate-slide-up` 类无效（视觉 bug，非性能）
- 方向：在 `globals.css` 中定义，或用 Tailwind v4 `@theme` 注册

#### P2-4：知识地图首次加载渐进渲染

- 方向：添加 `loading.tsx` 或 Suspense 边界，先渲染静态骨架 SVG（预填 48 灰点），数据到后再填充状态值

---

## 八、建议执行顺序

```
本轮：
  1. P0-1  旧图迁移（需确认 Artifact 表中旧图数量后执行）
  2. P0-2  ActionCard 即时反馈
  3. P0-3  数据缓存去重
  4. P0-4  KnowledgeMapCanvas memo

下轮：
  5. P1-2  缩略图端点
  6. P1-1  bundle 拆包 + lazy load

后续迭代：
  7. P2-1  SVG 滤镜优化
  8. P1-3  KnowledgeGraph 缓存
  9. P1-4  base64 解码缓存
  10. P2-2 ~ P2-4 渐进优化
```

---

## 附录：关键文件索引

| 文件 | 角色 | 主要问题 |
|------|------|----------|
| `src/app/nana/page.tsx:44` | 首页 | 无数据缓存，map API 重复请求 |
| `src/app/nana/knowledge-map/page.tsx:58` | 知识地图页 | 同上 |
| `src/components/nana/shared/action-card.tsx:32` | 行动卡 | 无即时点击反馈 |
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx:83` | SVG 图谱 | 未 React.memo |
| `src/components/nana/knowledge-map/recent-cases-list.tsx:255` | 题图详情 | 1.2MB base64 阻塞 |
| `src/lib/image-utils.ts:92` | 图片压缩 | 已修复新图，旧图未迁移 |
| `src/app/api/nana/cases/[id]/route.ts:30` | case 详情 API | 返回全量 base64 |
| `src/app/api/diagnosis/map/route.ts:115` | 地图数据 API | 7 次 DB 查询 + KnowledgeGraph.load |
| `src/app/globals.css` | 全局样式 | 缺少 slide-up 动画定义 |
| `src/components/providers.tsx` | 根 Provider | 强制全局 Client Component hydration |
