# 移动端性能修复 · 执行计划

> 基于 `doc/auditlog/mobile-perf-audit-2026-07-02.md` 的 12 项修复清单。
> 评审反馈：旧的测试账号数据可直接清理，无需迁移。本轮先挑 3 项。

---

## 一、12 项修复清单（P0 → P1 → P2）

### P0-1：旧 base64 题图数据清理（待确认项）

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 展开题图详情从 2-4s → 200-500ms（与新图对齐） |
| 改动范围 | 仅数据库：删除 `Artifact` 表中 `type='question_image'` 的所有记录（测试账号 `lujingpingly2006@126.com` 的 case 及关联 artifact） |
| 风险 | **中高**。直接删生产数据。须先备份 SQLite、列出受影响的记录数及关联的 case id，等用户确认后再执行。 |
| 是否需要数据迁移 | **是**，但评审意见认为可直接删（测试账号），不是迁移是清理 |
| 是否可独立上线 | 是（一次 SQL 操作即完成） |
| 验证方式 | ① 操作前 `SELECT count(*), sum(length(content)) FROM Artifact WHERE type='question_image'` 报数；② 操作后同查询返回 0；③ 真机展开任意题图详情，加载应 < 1s |
| 备注 | **不混入其他修复**。单独列为确认项，需用户明确说"删"后再动。 |

### P0-2：路由点击即时反馈（ActionCard pressed/loading 状态）

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 首页点击入口 → 即时看到 pressed 反馈 + loading 过渡，感知延迟 300-800ms → 即时（最高体感收益项） |
| 改动范围 | `src/components/nana/shared/action-card.tsx`（约 20 行改动），可能涉及 `/nana` layout 加顶栏 loading bar |
| 风险 | **低**。不碰数据层，不改路由逻辑，纯 CSS + state 级别反馈。 |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 是 |
| 验证方式 | ① 真机 375px 点击三个入口卡片，确认即时出现 active 视觉反馈（缩放/变色/loading bar）；② 网络 throttle 到 Slow 3G，确认反馈出现 → 页面切换之间有过渡不白屏；③ 三次点击后均正常跳转 |
| 当前现状 | `ActionCard` 是纯 `<Link>`，仅 CSS `active:scale-[0.98]`。点击 → 等 Next.js SPA 导航 → 目标页首帧：300-800ms 空白期。 |
| 方向 | ① `ActionCard` 内部加 `onClick` → `useState` 管理 `loading` 态（显示 spinner 或骨架 overlay）；② 或用 `useRouter` + `router.prefetch` 预取 + `startTransition`；③ `/nana` layout 顶部加 `nprogress` 式细 loading bar（全局过渡感） |

### P0-3：首页和知识地图页共享地图数据

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 从首页点"看看知识地图" → 地图页 0ms 等待（数据已在客户端）|
| 改动范围 | 新增一个小型 module-level cache（或轻量 context），影响 `src/app/nana/page.tsx` + `src/app/nana/knowledge-map/page.tsx` |
| 风险 | **低**。纯前端缓存，5 分钟 stale，不影响服务端。 |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 是 |
| 验证方式 | 首页加载完 → 点"知识地图" → 浏览器 Network 面板确认无 `/api/diagnosis/map` 新请求 |
| 当前现状 | 两个页面各自 `useEffect` → `fetch('/api/diagnosis/map')`，从首页跳知识地图重复跑 7 次 DB 查询 |
| 方向 | module-level `Map<string, {data, ts}>` 缓存，或引入 SWR 但本轮尽量不加新依赖；过期 5 分钟 |

### P0-4：KnowledgeMapCanvas 包裹 React.memo

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 弹层打/关、切视图时图谱不重新 diff，滑动/操作更顺 |
| 改动范围 | `src/components/nana/knowledge-map/knowledge-map-canvas.tsx`：最终 export 改 `React.memo(KnowledgeMapCanvas)`，约 1 行改动 |
| 风险 | **极低**。纯性能优化，行为不变。内部 `useMemo` 已正确缓存计算，memo 只是阻止不必要的组件函数执行 + reconciliation |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 是 |
| 验证方式 | ① React DevTools Profiler 录制：打开/关闭题详情浮层，确认 `KnowledgeMapCanvas` 不 re-render；② 真机在知识地图页频繁开关"最近拍过"抽屉 + 切列表/图谱，体感无卡顿 |
| 当前现状 | 组件函数每次父 re-render 都执行，虽 `useMemo` 防重算但 ~150 SVG 元素仍需 diff（移动端 5-15ms） |

### P1-1：拆分 "use client" 边界 + lazy load 重型组件

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 首次 JS 下载 ~2.67MB → ~1.6MB，4G 首屏快 ~1s |
| 改动范围 | 多文件：`EmptyHint`、图例行改为 Server Component；`KnowledgeMapCanvas`/`KnowledgeMapListView` 加 `next/dynamic` 懒加载 |
| 风险 | **中**。改变组件边界可能影响 hydration 行为。须逐组件测试。 |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 建议分多次上线，每次 1-2 个组件 |
| 验证方式 | `npm run build` 后对比 chunk 体积；真机首屏加载时间 |

### P1-2：新增缩略图端点

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 列表/浮层中的题图预览体积从 ~1.2MB → ~20KB |
| 改动范围 | 新增 `GET /api/nana/cases/:id/image?size=thumb`，服务端用 sharp 压缩 |
| 风险 | **中**。新增 API 端点 + 新依赖（sharp）。需处理 sharp 在 Windows/CI 上的兼容。 |
| 是否需要数据迁移 | 否（实时压缩，不写库） |
| 是否可独立上线 | 是 |
| 验证方式 | 新端点返回 < 30KB 的 JPEG；真机题图预览即时显示 |

### P1-3：KnowledgeGraph.load() 服务端单例缓存

| 维度 | 说明 |
|------|------|
| 用户体感收益 | `/api/diagnosis/map` 响应 500ms → 200ms（避免每次请求重建图结构） |
| 改动范围 | `src/app/api/diagnosis/map/route.ts` 或 `lib/graph.ts` |
| 风险 | **低**。DB 数据不变则图结构不变，module-level 缓存无失效风险 |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 是 |
| 验证方式 | 多次请求 `/api/diagnosis/map`，确认第二次起 `KnowledgeGraph.load` 被跳过 |

### P1-4：题图 base64 解码结果缓存（blob URL）

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 关闭 CaseTagPanel 再打开同一题图，~100ms 解码 → 0ms |
| 改动范围 | `src/components/nana/knowledge-map/recent-cases-list.tsx` 的 `caseDetailCache` |
| 风险 | **低**。在已有缓存基础上加 blob URL 转换 |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 是 |
| 验证方式 | React DevTools Profiler：展开题图 → 关闭 → 再展开同一题，确认 `<img>` 不触发 decode |

### P2-1：mobile 模式禁用 SVG feGaussianBlur

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 图谱滑动更流畅（减少 GPU 合成层） |
| 改动范围 | `knowledge-map-canvas.tsx`，variant= mobile 时条件跳过 `<filter>` |
| 风险 | 极低 |
| 是否需要数据迁移 | 否 |
| 是否可独立上线 | 是 |

### P2-2：题图显示端尺寸限制

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 题图解码时间从 ~200ms → ~50ms |
| 改动范围 | `recent-cases-list.tsx`，显示前用 Canvas 降采样 |
| 风险 | 低 |
| 是否需要数据迁移 | 否 |

### P2-3：补全 slide-up CSS 动画

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 浮层和详情卡有滑入动画（视觉 polish，非性能） |
| 改动范围 | `globals.css` 加 `@keyframes slide-up` |
| 风险 | 极低 |
| 是否需要数据迁移 | 否 |

### P2-4：知识地图首次加载渐进渲染（骨架优先）

| 维度 | 说明 |
|------|------|
| 用户体感收益 | 地图页打开立即看到骨架 SVG，不白等 |
| 改动范围 | `knowledge-map/page.tsx` 加 Suspense 边界或 loading.tsx |
| 风险 | 低 |
| 是否需要数据迁移 | 否 |

---

## 二、第一轮执行（评审偏好对齐）

> 按评审建议，第一轮只做 **3 项**：路由反馈 / Canvas memo / 题图加载复核。低风险、高体感收益、不动数据。

### 第 1 项：路由点击即时反馈（P0-2）

**为什么放第一轮**：用户体感收益最高——这是"滑不滑"的第一印象。

**方案**（最小改动，不动路由逻辑）：

1. `ActionCard` 从 `<Link>` 改为 `useRouter` + 受控 `useState`：
   - 点击 → `setPressed(true)` → 卡片立即缩放/变色 → `setTimeout` 50ms 后 `router.push(href)`
   - 视觉反馈：`pressed` 态加 `scale-[0.97]` + `bg-[#F2EDE3]`，比纯 CSS `active` 更可控
   - 如果目标页加载慢，卡片保持 pressed 态直到页面切换完成

2. `/nana/layout.tsx`（Server Component）→ 包裹 `/nana/*` 页面可考虑加顶栏 loading bar：
   - 最简单方案：在 `nana/page.tsx` 和子页面各自 `useEffect` 中不额外加全局 bar
   - 备选：用 `next/navigation` 的 `usePathname` + `startTransition` 在路由变化时显示顶栏细线动画
   - **倾向**：ActionCard 自身反馈已足够，不加全局 bar 以避免过度设计

**改动范围**：仅 `src/components/nana/shared/action-card.tsx`（~30 行增改）

**验证**：
- 真机 375px slow 3G throttle → 点卡片立即看到反馈 → 不白屏
- 三个入口卡片行为一致
- `git status` 干净提交

---

### 第 2 项：KnowledgeMapCanvas React.memo（P0-4）

**为什么放第一轮**：1 行改动，零风险，消除图谱页所有状态的无效 diff。

**方案**：

```tsx
export default React.memo(KnowledgeMapCanvas);
```

仅此一行。因为：
- 内部 `useMemo`（layout / edges / nodes / baseMap）已正确缓存
- props 中的 `nodes`/`edges`/`mainlines`/`frontier` 是 `mapData` 派生的子引用，`mapData` 不变则引用不变 → 浅比较直接跳过
- `onNodeClick` 是父组件的 `useCallback([mapData])`，`mapData` 不变则回调引用不变
- `nextLabel` 是字符串 primative，值不变

**改动范围**：仅 `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` 最后一行

**验证**：
- React DevTools → Profiler → 录制：打开/关闭题图详情浮层 → 打开/关闭"最近拍过"抽屉 → 切列表/图谱
- 确认 `KnowledgeMapCanvas` 在以上操作中不出现 re-render 火焰图
- 真机在知识地图页滑动、点节点、开关浮层，体感无卡顿

---

### 第 3 项：题图详情缓存和加载优化复核（P0-1 + P1-4）

**为什么放第一轮**：Stage 2.5 hotfix 做了压缩和缓存，但需复核是否有漏。同时如果旧数据直接清，等于 P0-1 完成。

**复核清单**（逐项核对 hotfix 已做 / 漏做）：

| hotfix 改动 | 状态 | 复核结论 |
|-------------|:----:|----------|
| `processImageFile` 强制压缩新图（1280px/0.7q） | ✅ 已做 | `src/lib/image-utils.ts:92-95`：所有图都走压缩，不判断 `file.size` |
| `caseDetailCache` Map 缓存 | ✅ 已做 | `src/components/nana/knowledge-map/recent-cases-list.tsx:44`：`caseDetailCache` 按 caseId 驻留 |
| 加载态骨架 + 文本 | ✅ 已做 | 骨架 `animate-pulse` + "题图加载中…"文字 |
| **旧图清理/压缩** | ❌ **未做** | hotfix 明确说"已入库的 4 张 1.2MB 老图仍大——要么接受，要么加迁移脚本"。评审意见：旧图可直接删。 |
| **blob URL 解码缓存** | ❌ **未做** | `caseDetailCache` 存的是 `CaseResponse` 对象，每次 `<img>` mount 仍用 `data:image/jpeg;base64,...` 作为 src，浏览器每次重解码。应转为 `URL.createObjectURL(blob)` 存入缓存。 |

**本轮追加修复（P1-4 blob URL 缓存）**：

`caseDetailCache` 中除存原始 `CaseResponse` 外，额外缓存 blob URL：

```ts
// 伪代码示意
const imageBlobCache = new Map<string, string>(); // caseId → blob URL

// 在 CaseTagPanel 加载题图时：
if (cached) {
  setImageBlobUrl(imageBlobCache.get(caseId) ?? null);
} else {
  loadCaseDetail(caseId).then(data => {
    const base64 = extractImage(data);
    const blob = base64ToBlob(base64);  // data:image/jpeg;base64,... → Blob
    const url = URL.createObjectURL(blob);
    imageBlobCache.set(caseId, url);
    setImageBlobUrl(url);
  });
}
```

`<img>` 改用 `src={blobUrl}` → 浏览器将 blob URL 视为普通 HTTP 资源，在内存中缓存解码结果；重新 mount 同 URL 无需重解码。

**改动范围**：仅 `src/components/nana/knowledge-map/recent-cases-list.tsx`（~20 行增改）

**验证**：
- 展开题图 → 关闭 → 再展开同一题 → Chrome Performance 录制确认第二次无 `Decode Image` 事件
- 新拍一张题图（经 processImageFile 压缩）→ 在详情中展开 → 加载 < 1s

**旧数据清理（P0-1，单独确认后再动手）**：

> 此项不混入本轮代码修复。等用户确认后再单独执行。

待确认信息（执行前会报）：
- `SELECT count(*), sum(length(content)) FROM Artifact WHERE type='question_image'` → 实际数量 + 总大小
- 受影响 case 的 ID 列表
- 备份 SQLite 的路径和大小
- 确认无误后，DELETE 关联记录，验证

---

## 三、第一轮改动总览

| # | 项 | 优先级 | 文件 | 改动量 | 风险 |
|---|-----|:------:|------|:------:|:----:|
| 1 | ActionCard 即时反馈 | P0-2 | `action-card.tsx` | ~30 行 | 低 |
| 2 | Canvas React.memo | P0-4 | `knowledge-map-canvas.tsx` | ~1 行 | 极低 |
| 3a | 题图 blob URL 缓存 | P1-4 | `recent-cases-list.tsx` | ~20 行 | 低 |
| 3b | 旧图数据清理 | P0-1 | DB 直操 | 1 SQL | 中（单独确认） |

**合计**：3 个文件改动，~50 行新增，零 API 变更，零 schema 变更，零新依赖。

---

## 四、第二轮预告（先不拆，等第一轮验证后再启动）

| # | 项 | 优先级 |
|---|-----|:------:|
| 4 | 首页+地图页数据缓存去重 | P0-3 |
| 5 | bundle 拆包 + lazy load | P1-1 |
| 6 | 缩略图端点 | P1-2 |

---

## 五、验证标准总表

| 场景 | 当前（修复前） | 目标（修复后） |
|------|---------------|---------------|
| 首页点入口卡 | 0 反馈 → 300-800ms 白等 → 下一页 | 即时 pressed → 下一页 |
| 知识地图弹层打/关 | 图谱微卡 5-15ms | 0ms re-render |
| 展开题图（新图） | ~500ms | < 1s（含网络），重开 < 100ms |
| 展开题图（旧图） | 2-4s | 新图对齐后（或旧图清理后）< 1s |
| 首页→知识地图 | 跑 7 次 DB ≈ 0.5-1.5s 等 | （第二轮做）0ms |

---

> 请确认第一轮 3 项（ActionCard / Canvas memo / 题图 blob 缓存），以及是否现在就清理旧图数据。
