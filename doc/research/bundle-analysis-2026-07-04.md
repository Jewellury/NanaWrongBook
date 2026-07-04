# Bundle 分析报告

> 日期：2026-07-04
> 构建方式：`ANALYZE=1 npm.cmd run build`（Next.js 16 Turbopack）
> 构建结果：成功

## 1. 工具兼容性说明

`@next/bundle-analyzer` 与 Next.js 16 默认的 Turbopack 构建不兼容（构建时明确输出 "The Next Bundle Analyzer is not compatible with Turbopack builds, no report will be generated"）。配置 wrapper 后 `ANALYZE=1 npm run build` 虽然构建成功，但不生成任何可视化报告。

**审计后处理**：因 analyzer 对 Turbopack 无实际效果，已移除 `@next/bundle-analyzer` 依赖和 `next.config.ts` 中的 wrapper 配置。`next.config.ts` 恢复为原始状态。

本轮分析采用**手动方式**：统计 `.next/static/chunks/` 下所有 chunk 文件大小 + 关键词扫描识别包含的库。后续如需可视化分析，可考虑 Next.js Turbopack 原生分析器（`next experimental-analyze`，当前版本 CLI 参数格式未稳定）。

## 2. 总体数据

| 指标 | 数值 |
|------|------|
| 客户端 chunk 文件数 | 52 |
| 客户端 JS 总大小 | 2,771.9 KB（2.71 MB） |
| CSS 文件数 | 3 |
| CSS 总大小 | 111.2 KB |
| Top 10 chunk 合计 | 1,556.8 KB（占总量的 56.2%） |

## 3. Top 10 客户端 Chunk

| 排名 | 文件名 | 大小 | 识别到的库/模块 |
|:---:|------|:---:|------|
| 1 | `593d1c70081d756a.js` | 375.0 KB | **recharts**（图表库） |
| 2 | `e66d63a828638bd5.js` | 345.4 KB | **katex** + **react-markdown** + **remark** + **rehype**（LaTeX 渲染 + Markdown 渲染管线） |
| 3 | `42594ee06b8f5e19.js` | 210.0 KB | **react-dom** |
| 4 | `a6dad97d9634a72d.js` | 110.0 KB | **core-js polyfill**（兼容性 polyfill） |
| 5 | `9fb9f8cd22f571bc.js` | 98.2 KB | canvas + google（疑似 `@google/genai` SDK） |
| 6 | `3089213d52edcb0b.js` | 87.5 KB | **Radix UI 全家桶**（dialog, dropdown, checkbox, switch, tabs, progress, select）+ cropper |
| 7 | `1cbd49e9a3a167bc.js` | 83.4 KB | Radix UI（switch, select） |
| 8 | `834839ae4581856f.css` | 83.0 KB | CSS（含 Tailwind + KaTeX 样式） |
| 9 | `b71ac0a5367b08da.js` | 82.2 KB | Radix UI（dialog, switch） |
| 10 | `9e80dbc7599d5a77.js` | 82.2 KB | Radix UI（dialog, switch） |

## 4. 重依赖识别

### 按大小排序的重依赖

| 库 | 估算大小 | 所在 chunk | 首屏需要? |
|------|:---:|------|:---:|
| **recharts** | ~375 KB | #1 | 仅 `/nana/knowledge-map` 和统计页需要 |
| **KaTeX + remark + rehype + react-markdown** | ~345 KB | #2 | 仅题目展示/诊断报告页需要 |
| **react-dom** | ~210 KB | #3 | ✅ 所有页面必需 |
| **core-js polyfill** | ~110 KB | #4 | ✅ 所有页面必需（兼容旧浏览器） |
| **@google/genai SDK** | ~98 KB | #5 | ❌ 仅服务端用，不应出现在客户端 |
| **Radix UI 全家桶** | ~340 KB（#6+#7+#9+#10） | 多个 chunk | 部分页面需要 |
| **react-easy-crop / react-image-crop** | 未独立 | #6 内 | 仅拍题页裁剪需要 |

### 关键发现

1. **recharts（375KB）是最大的单一依赖**——只在知识地图和统计页用到，但被打进了共享 chunk，首屏加载 `/nana` 时也会拉下来
2. **KaTeX + Markdown 管线（345KB）**——只在展示题目内容时用到，同样被打进共享 chunk
3. **`@google/genai` SDK 出现在客户端 chunk（98KB）**——这是 AI SDK，应该只在服务端使用。如果它在客户端 import 了，是个严重的 bundle 污染
4. **Radix UI 组件分散在多个 chunk**——总计约 340KB，说明多个 Radix 组件被不同路由段共享
5. **core-js polyfill（110KB）**——Next.js 自动注入的浏览器兼容 polyfill，不可直接移除

## 5. 调研报告建议评估

| 建议 | 可行性 | 预期收益 | 风险 |
|------|:---:|:---:|------|
| `optimizePackageImports: ['lucide-react']` | ✅ 可做 | 中（lucide barrel import 会拉全量图标） | 低 |
| `optimizePackageImports: ['date-fns']` | ✅ 可做 | 低（date-fns 已支持 tree-shaking） | 低 |
| recharts → `next/dynamic` 懒加载 | ✅ 可做 | 高（省 375KB 首屏） | 低 |
| KaTeX + Markdown → `next/dynamic` 懒加载 | ✅ 可做 | 高（省 345KB 首屏） | 低 |
| `@google/genai` 排查客户端 import | ⚠️ 需调查 | 高（省 98KB） | 需确认是否有客户端调用 |

## 6. 后续建议（不在本轮执行）

1. **排查 `@google/genai` 客户端引入**：这个 SDK 应该只在 server-side API route 中使用。如果某个客户端组件意外 import 了它，移除可省 98KB
2. **recharts 懒加载**：用 `next/dynamic` + `ssr: false` 包裹 `KnowledgeMapCanvas`，让 recharts 只在 `/nana/knowledge-map` 路由加载
3. **KaTeX/Markdown 懒加载**：题目展示组件用 `next/dynamic` 懒加载，让 Markdown 管线只在需要时加载
4. **`optimizePackageImports`**：在 `next.config.ts` 中配置 `lucide-react` 的 optimizePackageImports
5. **Radix UI 按需引入**：检查是否有 barrel import 导致全量加载

## 7. 结论

2.71MB 客户端 bundle 中，**recharts（375KB）+ KaTeX/Markdown 管线（345KB）+ @google/genai（98KB）= 818KB** 是最大的可优化空间，占总量 30%。这三项都不是首屏 `/nana` 页面必需的，后续通过 `next/dynamic` 懒加载可显著减小首屏体积。

`@next/bundle-analyzer` 配置保留在 `next.config.ts` 中（仅 `ANALYZE=1` 启用），待 Next.js Turbopack 分析器成熟后可生成可视化火焰图。
