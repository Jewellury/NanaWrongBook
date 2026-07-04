# 移动端丝滑度第二轮优化方案

> 日期：2026-07-03
> 触发：用户反馈"感觉还是不够丝滑"，希望孩子能顺畅地收集错题
> 前置：第一轮优化已完成（见 `doc/auditlog/mobile-perf-audit-2026-07-02.md`），修了 ActionCard 即时反馈、React.memo、blob URL 缓存

---

## 一、当前状态诊断（基于代码审查）

### 核心流程：登录 → 首页 → 拍题 → 录音 → 保存

| 环节 | 当前耗时（4G 估算） | 瓶颈 |
|------|:---:|------|
| 打开网址 → 登录页 | 1.5-2s | 2.67MB JS bundle 全量加载 |
| 登录提交 → 跳转首页 | 500-800ms | 跳到 `/`（上游首页）而非 `/nana`，多一次重定向 |
| 首页 → 点击"拍一道题" | 300-800ms | 已修 pressed 反馈，但路由切换仍需等 JS chunk |
| 拍照 → 图片压缩 | 200-800ms | Canvas 压缩在主线程同步执行，大图卡 UI |
| 录音权限请求 → 开始录音 | 0-500ms | 首次需弹窗授权，用户无预期 |
| 保存 → 成功反馈 | 500-2000ms | 1MB+ base64 POST，无进度指示 |
| 保存成功 → 底部按钮可见 | ❌ | 小屏溢出（上一轮审计已确认） |

### 已做（第一轮）
- ✅ ActionCard pressed 即时反馈
- ✅ KnowledgeMapCanvas React.memo
- ✅ 题图 blob URL 解码缓存
- ✅ 旧测试数据清理

### 未做（第一轮遗留）
- ❌ P0-3：首页+地图页 map API 数据缓存去重
- ❌ P1-1：bundle 拆包 + lazy load
- ❌ P1-2：缩略图端点
- ❌ P2-1：mobile 禁用 SVG feGaussianBlur
- ❌ P2-3：`animate-slide-up` CSS 仍缺失

---

## 二、按优先级排列的优化清单

### P0：立即能感知到提升（1-2 天）

#### P0-A：`100vh` → `100dvh` + `viewport-fit=cover`

**问题**：所有 nana 页面用 `min-h-screen`（= `100vh`），iOS Safari 比 4G 实际可视区高 ~70px，底部内容被推出视口。

**改法**：
1. `src/app/layout.tsx` viewport 加 `viewportFit: 'cover'`
2. 各页面 `min-h-screen` → `min-h-dvh`（Tailwind v4 支持）
3. 旧浏览器自动回退：先写 `min-h-screen` 再写 `min-h-dvh`

**影响文件**：`layout.tsx`、`capture/page.tsx`、`nana/page.tsx`、`knowledge-map/page.tsx`

**预计工时**：0.5h

---

#### P0-B：登录后直跳 `/nana`，跳过上游首页

**问题**：`login/page.tsx` 第 35 行 `router.push("/")`，登录后跳到上游首页（28KB 大页面），用户还要再点一次才到 `/nana`。

**改法**：`router.push("/nana")` 一行改

**注意**：这是上游文件修改，commit message 标注 `⚠️上游文件修改`

**预计工时**：0.1h

---

#### P0-C：保存成功后浮动卡（接续上一轮审计方案 A）

**问题**：小屏上保存后 3 个按钮溢出视口。

**改法**：`position: fixed` 底部浮动卡 + safe-area 适配。详见 `doc/auditlog/audit-redesign-tag-entry-2026-07-03.md`

**前置依赖**：先修 `animate-slide-up` CSS（P0-D）

**预计工时**：4.5h

---

#### P0-D：补全 `animate-slide-up` CSS 定义

**问题**：`recent-cases-list.tsx` 和 `knowledge-detail-card.tsx` 都用了 `animate-slide-up`，但该类从未定义，动画不生效。

**改法**：在 `globals.css` 的 `@theme` 中加：
```css
--animate-slide-up: slide-up 0.3s ease-out;
@keyframes slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

**注意**：globals.css 是上游文件，标注 `⚠️上游文件修改`

**预计工时**：0.2h

---

#### P0-E：拍照压缩移到 Web Worker

**问题**：`image-utils.ts` 的 `compressImage()` 在主线程做 Canvas drawImage + toDataURL，手机拍 4MB 照片时 UI 卡死 500-800ms。

**改法**：
1. 新建 `src/lib/nana/image-compress.worker.ts`
2. 用 `createImageBitmap` + `OffscreenCanvas`（Safari 16.4+ 支持）在 Worker 中压缩
3. 主线程 `postMessage(file)` → Worker 返回 base64
4. 不支持 OffscreenCanvas 的浏览器回退到主线程（功能不丢）

**预计工时**：2h

---

### P1：明显体感改善（2-3 天）

#### P1-A：路由级 `loading.tsx` 骨架屏

**问题**：从首页点"拍一道题"到 capture 页面加载完成，中间无任何视觉反馈（已有 pressed 态但页面切换仍白闪）。Next.js App Router 支持 `loading.tsx` 自动包裹 Suspense。

**改法**：
- `src/app/nana/capture/loading.tsx` — 拍题页骨架（题图区 + tab 栏 + 底部按钮的灰色轮廓）
- `src/app/nana/knowledge-map/loading.tsx` — 地图页骨架
- `src/app/nana/loading.tsx` — 首页骨架

**注意**：需要把对应 `page.tsx` 拆成 Server Component 外壳 + Client Component 内容，否则 loading.tsx 不生效（当前全是 "use client"）

**预计工时**：3h

---

#### P1-B：首页和地图页 map API 数据共享

**问题**：`/nana` 和 `/nana/knowledge-map` 各自独立 fetch `/api/diagnosis/map`（7 次 DB 查询、~20KB），重复请求。

**改法**：
1. 方案 A（简单）：用 `window.__nanaMapData` 全局缓存 + 时间戳（5 分钟过期）
2. 方案 B（更规范）：提到 React Context 或 SWR/TanStack Query

推荐方案 A，因为只有两个页面共享，引库太重。

**预计工时**：1.5h

---

#### P1-C：录音权限预检 + 预热

**问题**：用户点"说说看"才弹权限请求，用户不确定发生了什么。首次授权后 MediaRecorder 初始化也有 ~200ms 延迟。

**改法**：
1. 拍题成功后（照片已加载），后台预热：检查 `navigator.permissions.query({ name: 'microphone' })`
2. 如果已授权，预创建 `MediaRecorder` 实例
3. 如果未授权，在录音按钮旁显示温和提示"需要用到麦克风"

**预计工时**：1.5h

---

#### P1-D：保存上传进度反馈

**问题**：点"收好这道题"后只显示"正在收…"，1MB base64 在 4G 下上传 1-3s，用户不知道要等多久。

**改法**：
1. 用 `XMLHttpRequest` 替代 `fetch`（fetch 不支持 upload progress）
2. 显示百分比进度条
3. 超过 5s 显示"网络有点慢，再等一下…"

**预计工时**：1.5h

---

#### P1-E：触摸反馈增强

**问题**：部分按钮没有 `:active` 即时反馈，移动端 300ms 点击延迟感知。

**改法**：
1. 全局 CSS 加 `touch-action: manipulation`（移除双击缩放延迟）
2. 所有可点击元素加 `active:scale-95 transition-transform duration-100`
3. 录音按钮加 `navigator.vibrate?.(10)` 触觉反馈

**预计工时**：1h

---

### P2：锦上添花（后续迭代）

#### P2-A：bundle 拆包（`next/dynamic` 懒加载）

**问题**：73 个 `"use client"` 组件全量打入首屏，2.67MB 未压缩。知识地图画布、RecentCasesList 等组件不需要首屏加载。

**改法**：
1. `knowledge-map-canvas.tsx` → `dynamic(() => import(...), { ssr: false, loading: ... })`
2. `recent-cases-list.tsx` → 动态导入
3. `voice-recorder.tsx` → 动态导入（仅 voice tab 激活时加载）

**预计工时**：2h

---

#### P2-B：PWA 离线缓存（Service Worker）

**问题**：手机断网时完全不可用，地铁/电梯场景常见。

**改法**：
1. 用 `next-pwa`（需评估与 Next.js 16 兼容性）或手写 Service Worker
2. 缓存策略：
   - App Shell（HTML + CSS + JS）：stale-while-revalidate
   - API 数据：network-first，降级到缓存
   - 题图 base64：IndexedDB 缓存
3. 离线时显示"你现在离线了，已拍的题会在联网后自动上传"

**预计工时**：4h（需独立轮次）

---

#### P2-C：图片压缩用 `createImageBitmap` 替代 `FileReader + Image`

**问题**：当前 `compressImage` 用 `FileReader.readAsDataURL` → `new Image()` → `canvas.drawImage`，三步串行。

**改法**：用 `createImageBitmap(file)` 一步到位（Safari 16+ 支持），省去 base64 中间步骤。

**注意**：如果 P0-E 的 Web Worker 方案用了 OffscreenCanvas，这里自动包含。

**预计工时**：0.5h（如果 P0-E 已做）

---

#### P2-D：`-webkit-overflow-scrolling: touch` + `overscroll-behavior`

**问题**：iOS 滚动不丝滑，橡皮筋效果影响底部抽屉。

**改法**：
1. 全局 `body { -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; }`
2. 抽屉/浮层内 `overscroll-behavior: contain`（防止滚动穿透）

**预计工时**：0.3h

---

#### P2-E：manifest 优化

**问题**：`manifest.ts` 的 `start_url: '/'` 跳到上游首页，PWA 启动后还要手动导航。

**改法**：不改上游 manifest（铁律），但在 `/nana/layout.tsx` 中加 `<link rel="manifest" href="/nana/manifest.json">`，自定义 nana 专用 manifest

**预计工时**：0.5h

---

## 三、建议执行顺序

### 本轮（1-2 天）：P0 全部 + P1 选 2 项

| 序号 | 任务 | 工时 |
|:---:|------|:---:|
| 1 | P0-D 补全 animate-slide-up CSS | 0.2h |
| 2 | P0-A `100dvh` + `viewport-fit=cover` | 0.5h |
| 3 | P0-B 登录后直跳 `/nana` | 0.1h |
| 4 | P0-C 保存后浮动卡 | 4.5h |
| 5 | P0-E 拍照压缩移 Web Worker | 2h |
| 6 | P1-E 触摸反馈增强 | 1h |
| 7 | P1-D 上传进度反馈 | 1.5h |
| | **合计** | **~10h** |

### 下一轮（2-3 天）：P1 剩余 + P2 选做

| 序号 | 任务 | 工时 |
|:---:|------|:---:|
| 1 | P1-A loading.tsx 骨架屏 | 3h |
| 2 | P1-B map API 数据共享 | 1.5h |
| 3 | P1-C 录音权限预检 | 1.5h |
| 4 | P2-A bundle 拆包 | 2h |
| 5 | P2-D 滚动优化 | 0.3h |
| | **合计** | **~8.3h** |

---

## 四、调研提示词（供用户单独调研使用）

以下提示词可直接粘贴给外部 AI 或搜索引擎，用于深入调研特定方向：

```
我在开发一个面向高中生的移动端 Web App（Next.js 15 App Router + Tailwind v4 + PWA），
核心流程是：手机浏览器打开 → 登录 → 拍题（调起相机）→ 录音（getUserMedia + MediaRecorder）
→ 上传保存（POST base64 到 SQLite 后端）。

技术约束：
- 服务器在腾讯云香港（国内 4G 访问延迟 ~100-200ms）
- 所有页面都是 "use client"（73 个客户端组件）
- JS bundle 2.67MB 未压缩（gzip ~900KB）
- 图片以 base64 存 SQLite（单张 ~100KB-1MB）
- 目标用户：高中生用手机 Safari/Chrome 打开

请帮我调研以下方向的最佳实践，给出具体的代码级建议（不要泛泛而谈）：

1. 【首屏加载】Next.js App Router 移动端首屏优化：如何把 73 个 "use client" 组件做路由级 code splitting？next/dynamic 在 App Router 中的正确用法？loading.tsx + Suspense 如何配合？

2. 【拍照体验】移动端 <input capture="environment"> 在 iOS Safari 和 Android Chrome 上的已知坑？如何在 Web Worker 中用 OffscreenCanvas 压缩图片避免主线程卡顿？createImageBitmap 的浏览器兼容性和降级方案？

3. 【录音体验】MediaRecorder 在 iOS Safari 16+ 的已知问题？如何做权限预检（navigator.permissions API）？录音波形可视化用 AnalyserNode 还是装饰性动画？

4. 【上传体验】fetch 不支持 upload progress，用 XMLHttpRequest 做进度条的代码模式？base64 vs FormData 上传哪个更适合移动端？如何做断点续传或离线队列（Background Sync API）？

5. 【PWA 体验】Next.js 16 + Service Worker 的最佳实践（next-pwa 还是手写）？离线缓存策略（App Shell + API + 图片）？iOS Safari PWA 的已知限制（getUserMedia 在 standalone 模式下的坑）？

6. 【触感体验】移动端 Web 的 touch-action / -webkit-overflow-scrolling / overscroll-behavior 最佳组合？navigator.vibrate 的浏览器支持？如何消除 300ms 点击延迟？CSS active 状态在 iOS Safari 不生效的解决方案？

7. 【viewport 适配】100dvh 在 iOS 16.4+ 和 Android Chrome 的实际表现？viewport-fit=cover + env(safe-area-inset-*) 的完整适配方案？软键盘弹出时如何保持底部按钮可见（visualViewport API）？

请针对每个方向给出：最佳实践 + 具体代码示例 + 浏览器兼容性 + 降级方案。
特别关注中国移动互联网环境（微信内置浏览器、UC/QQ 浏览器、iOS Safari）的差异。
```

---

## 五、与本轮审计的关系

本方案涉及三个审计报告的遗留问题：
- `doc/auditlog/mobile-perf-audit-2026-07-02.md` — 第一轮性能排查（P0/P1/P2 清单）
- `doc/auditlog/audit-redesign-tag-entry-2026-07-03.md` — 保存后按钮溢出方案 A
- `doc/auditlog/audit-missing-tag-entry-2026-07-03.md` — 按钮不可见根因确认

本方案不重复上述审计的分析，只聚焦"怎么做到丝滑"的执行层面。
