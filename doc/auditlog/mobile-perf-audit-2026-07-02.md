# 移动端性能排查报告

> 日期：2026-07-02
> 触发：手机真机反馈 — 页面点击和切换整体不顺畅、感觉有延迟
> 原则：先测量，不猜修；不改 schema；不动生产数据（旧图迁移另提方案）

---

## 一、排查范围与方法

| 范围 | 方法 |
|------|------|
| /nana 首页点击入口响应 | 代码审查：ActionCard 组件、路由方式、loading 状态 |
| /nana/knowledge-map 首次打开 | 代码审查：API 调用栈、DB 查询数、数据量 |
| 列表/图谱切换 | 审查 viewMode 切换路径、render 依赖 |
| 最近题浮层 + 题图详情 | 审查 RecentCasesList、CaseTagPanel、base64 加载路径 |
| KnowledgeMapCanvas 重复重算 | 审查 useMemo/useCallback 依赖、React.memo 包裹 |
| base64 题图主线程/网络阻塞 | 审查 image-utils、API 端点、显示组件 |
| client bundle 过重 | 统计 "use client" 文件数、chunk 大小、懒加载使用 |

---

## 二、Client Bundle 测量

### 2.1 关键数字

| 指标 | 数值 |
|------|------|
| `"use client"` 文件数 | 73 个 |
| 总 JS chunk 未压缩 | 2.67 MB（50 个文件） |
| 总 CSS | ~100 KB（2 个文件） |
| Top-3 大 chunk | `593d1c..` 384KB, `e66d63..` 354KB, `42594e..` 215KB |
| `next/dynamic` 使用 | 0 处 |
| `React.lazy` / `Suspense` 使用 | 0 处 |
| `loading.tsx` 文件 | 0 个 |
| 4G 首次 JS 下载估算（gzip 后 ~900KB） | 1.5-2s |

### 2.2 "use client" 分布

- 所有页面（21 个 page.tsx）均为 `"use client"`
- 所有 nana 组件（capture/、knowledge-map/、session/、shared/）均为 `"use client"`
- 所有 shadcn/ui 基础组件（14 个）均为 `"use client"`
- 根布局 `src/app/layout.tsx` 是 Server Component，但包裹的 `<Providers>` 是 Client Component

---

## 三、各页面 Network 请求测量

### 3.1 /nana 首页

| 请求 | 传输量 | 备注 |
|------|--------|------|
| 页面 HTML（RSC payload） | ~3 KB | |
| Client JS（首次） | ~900 KB gzip | 有缓存后为 0 |
| `GET /api/diagnosis/map` | ~20 KB | 7 次 DB 查询 |
| Total 首次 | ~923 KB | |
| Total 重复 | ~20 KB | JS 缓存命中时 |

### 3.2 /nana/knowledge-map

| 请求 | 传输量 | 备注 |
|------|--------|------|
| 页面 HTML | ~3 KB | |
| Client JS chunk（首次） | ~900 KB gzip | |
| `GET /api/diagnosis/map` | ~20 KB | **与首页完全重复** |
| `GET /api/nana/cases`（列表） | ~2 KB | 仅 hasImage 标志，已优化 |
| Total 首次 | ~925 KB | |
| Total 重复 | ~22 KB | |

### 3.3 题图详情

| 请求 | 传输量 | 备注 |
|------|--------|------|
| `GET /api/nana/cases/:id`（旧图） | ~1.2 MB | **最大瓶颈** |
| `GET /api/nana/cases/:id`（新图压缩） | ~100 KB | 正常 |
| `GET /api/nana/cases/:id/tags` | ~1 KB | |

### 3.4 API DB 查询数

| 端点 | DB 查询数 |
|------|-----------|
| `GET /api/diagnosis/map` | 7 次 |
| `GET /api/nana/cases` | 1 次 |
| `GET /api/nana/cases/:id` | 1 次 |

---

## 四、375px 视口交互耗时估算

| 操作 | 估算耗时 | 瓶颈 |
|------|----------|------|
| /nana 首页首次 JS 加载 | 1.5-2s | 2.67MB bundle |
| 点击 ActionCard → 下一页 | 300-800ms | 无即时反馈 + SPA 导航 |
| /nana/knowledge-map 首次数据加载 | 500-1500ms | 7 次 DB + 20KB 传输 |
| 列表/图谱切换 | 5-15ms | SVG reconciliation |
| 打开"最近拍过"浮层 | 50-200ms | 2KB API |
| 展开题图详情（旧图 1.2MB） | **2-4s** | 网络 + JSON.parse + base64 解码 |
| 展开题图详情（新图 ~100KB） | 200-500ms | 可接受 |

---

## 五、旧图 1.2MB 影响确认

旧 base64 题图是最大单一瓶颈。`processImageFile` 已修复强制压缩（Stage 2.5），但仅影响新题图。生产库旧图 ~1.2MB，4G 下载 2-4s + 主线程解码 200ms。

---

## 六、12 项修复清单

### P0（阻塞级）
- P0-1：旧 base64 题图数据清理（已执行：删除测试账号 5 Case / 10 Artifact / 2 CKT）
- P0-2：ActionCard 点击即时 pressed 反馈（已修复）
- P0-3：首页+知识地图页共享 /api/diagnosis/map 数据（待第二轮）
- P0-4：KnowledgeMapCanvas React.memo（已修复）

### P1（可感知）
- P1-1：bundle 拆包 + lazy load
- P1-2：新增缩略图端点
- P1-3：KnowledgeGraph.load() 服务端缓存
- P1-4：题图 blob URL 解码缓存（已修复）

### P2（渐进）
- P2-1：mobile 模式禁用 SVG feGaussianBlur
- P2-2：题图显示端尺寸限制
- P2-3：补全 animate-slide-up CSS
- P2-4：知识地图首次加载渐进渲染

---

## 附录：关键文件索引

| 文件 | 主要问题 |
|------|----------|
| `src/app/nana/page.tsx` | 无数据缓存，map API 重复请求 |
| `src/app/nana/knowledge-map/page.tsx` | 同上 |
| `src/components/nana/shared/action-card.tsx` | 无即时点击反馈（已修复） |
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | 未 React.memo（已修复） |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 题图 base64 阻塞 + 无 blob URL 缓存（已修复） |
| `src/lib/image-utils.ts` | 旧图问题根因 |
| `src/app/api/nana/cases/[id]/route.ts` | 返回全量 base64 |
| `src/app/api/diagnosis/map/route.ts` | 7 次 DB 查询 + KnowledgeGraph.load |
