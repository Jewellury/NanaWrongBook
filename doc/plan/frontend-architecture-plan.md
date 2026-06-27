# 独立前端架构方案 · 开发计划

> 关联工单: doc/reference/frontend-architecture-workorder.md
> 计划日期: 2026-06-19
> 预计影响: src/app/nana/, src/components/nana/, src/lib/nana/（全部新增，不改上游）
> 产出后流程: 交 Codex 架构评审 → 用户拍板是否开建、先建哪个切片

## 1. 大白话概述

我们要在 wrong-notebook 这个已有 App 里加一套"个性化数学诊断辅导"的前端界面，
但不能动人家原来的首页、导航、登录、错题本这些页面和逻辑。

方案的核心思路是：**所有新界面收进一个 `/nana` 路由命名空间，所有新组件放进独立的
`src/components/nana/` 目录**。能用的东西（鉴权、Prisma、PWA 外壳、UI 组件库、打印模式）
直接 import 复用，不改人家源码。只有 Get 笔记调研指出的、上游没有的交互（陪伴式录音、
知识地图可视化、周末 session 流程），才重新设计。

这样将来上游更新时，我们的文件不会参与冲突——因为物理上完全隔离。

## 1.5 原则引用（P1-P5）

本方案多处引用 P1-P5 五条原则，统一定义与出处如下：

| 原则 | 内容 | 出处 |
|------|------|------|
| P1 | 原音是真相/转写是索引 | `doc/spec/capture-layer-design-backlog.md`（+本方案在 5.2 节扩展为"题图固定可见"） |
| P2 | 结构先于模型 | ⚠️ 本方案内部约定（暂无 canonical 定义，待回填） |
| P3 | 多问少断 | ⚠️ 本方案内部约定（暂无 canonical 定义，待回填） |
| P4 | 前台不评判，术语清零，只报增量不报缺陷 | `doc/reference/OPS_handbook.md` §4 前台措辞铁律 + §3 日常运营 |
| P5 | 周中无手机、周末采集 | `doc/spec/capture-layer-design-backlog.md` |

> **待办**：P2/P3 尚无 canonical 定义。如后续在 `doc/DECISIONS.md` 或 `doc/spec/` 中确立，请回填本表出处列，并删除"本方案内部约定"标注。
>
> 建议在 `doc/DECISIONS.md` 设计债表开 TD-3 条目跟踪本回填事项，与 TD-1、TD-2 处理方式一致（本计划文档仅作建议，不直接修改 DECISIONS.md）。

## 2. 任务 0 勘察结果：上游现有前端清单

### 2.1 路由结构（src/app/）

| 路由 | 文件 | 说明 |
|------|------|------|
| `/` | `page.tsx` (28KB) | 首页/错题本主页，非常大，绝不修改 |
| `/login/` | `page.tsx` | 登录页 |
| `/register/` | `page.tsx` | 注册页 |
| `/admin/` | `page.tsx` (21KB) | 管理后台 |
| `/admin/user/[id]/` | `page.tsx` | 用户详情管理 |
| `/notebooks/` | `page.tsx` | 笔记本列表 |
| `/notebooks/[id]/` | 子目录 | 笔记本详情 |
| `/notebooks/[id]/add/` | `page.tsx` | 添加错题 |
| `/error-items/[id]/` | 子目录 | 错题详情 |
| `/practice/` | `page.tsx` (18KB) | 练习页 |
| `/stats/` | `page.tsx` | 统计页 |
| `/tags/` | `page.tsx` (23KB) | 标签管理 |
| `/print-preview/` | `page.tsx` (16KB) | 打印预览 |
| `/diagnosis/paper-pack/` | 子目录 | **我们的**：纸质包预览（已有雏形） |
| `/latex-test/` | `page.tsx` | LaTeX 测试页 |

**路由使用 Next.js App Router 文件系统路由，所有页面段均为普通文件夹（非 route group）。**

### 2.2 根布局与全局配置

| 文件 | 关键内容 | 策略 |
|------|----------|------|
| `src/app/layout.tsx` | Geist 字体、`<Providers>` 包裹、PWA meta（themeColor `#f97316` 橙色、appleWebApp） | **绝不修改** |
| `src/app/globals.css` | 全局样式（含 `@media print` 规则） | **绝不修改** |
| `src/app/manifest.ts` | PWA manifest（name: 智能错题本, display: standalone） | **绝不修改** |
| `next.config.ts` | `output: standalone`, serverExternalPackages | 如需改，最小增量+标注 |
| `package.json` | 依赖列表（见下文复用分析） | 如需加依赖，最小增量+标注 |

### 2.3 可复用件清单

#### UI 组件库（src/components/ui/）— 基于 Radix + shadcn 模式

| 组件 | 文件 | 复用判断 |
|------|------|----------|
| Button | `ui/button.tsx` | ✅ 直接复用 |
| Card | `ui/card.tsx` | ✅ 直接复用 |
| Dialog | `ui/dialog.tsx` | ✅ 直接复用 |
| Input | `ui/input.tsx` | ✅ 直接复用 |
| Textarea | `ui/textarea.tsx` | ✅ 直接复用 |
| Badge | `ui/badge.tsx` | ✅ 直接复用 |
| Select | `ui/select.tsx` | ✅ 直接复用 |
| Tabs | `ui/tabs.tsx` | ✅ 直接复用 |
| Slider | `ui/slider.tsx` | ✅ 直接复用（可能用于录音回放） |
| Switch | `ui/switch.tsx` | ✅ 直接复用 |
| Checkbox | `ui/checkbox.tsx` | ✅ 直接复用 |
| Label | `ui/label.tsx` | ✅ 直接复用 |
| Progress | `ui/progress.tsx` + `progress-feedback.tsx` | ✅ 直接复用 |
| DropdownMenu | `ui/dropdown-menu.tsx` | ✅ 直接复用 |
| Table | `ui/table.tsx` | ✅ 直接复用 |
| Pagination | `ui/pagination.tsx` | ✅ 直接复用 |
| BackButton | `ui/back-button.tsx` | ✅ 直接复用 |
| ModelSelector | `ui/model-selector.tsx` | ⚠️ 可选复用 |

#### 业务组件（src/components/）— 可能复用

| 组件 | 文件 | 复用判断 |
|------|------|----------|
| UploadZone | `upload-zone.tsx` | ✅ 复用（react-dropzone 封装，用于拍题） |
| ImageCropper | `image-cropper.tsx` | ✅ 复用（react-image-crop 封装） |
| MarkdownRenderer | `markdown-renderer.tsx` | ✅ 复用（react-markdown + KaTeX） |
| ErrorList | `error-list.tsx` | ✅ 复用（错题列表展示） |
| Providers | `providers.tsx` | ✅ 复用（SessionProvider + Theme 等） |
| KnowledgeFilter | `knowledge-filter.tsx` | ⚠️ 包一层适配我们的知识图谱 tag |
| TagInput | `tag-input.tsx` | ⚠️ 包一层 |

#### 核心基础设施（src/lib/）— 全部直接复用

| 模块 | 文件 | 用途 |
|------|------|------|
| Prisma client | `prisma.ts` | 数据库访问 |
| Auth 配置 | `auth.ts` | NextAuth v4 配置 |
| Auth 工具 | `auth-utils.ts` | `getServerSession` 等 |
| API 客户端 | `api-client.ts` | 前端 API 调用封装 |
| API 错误处理 | `api-errors.ts` | 统一错误格式 |
| 打印工具 | `print-preview.ts` | PDF/打印相关 |
| 图片工具 | `image-utils.ts` | 图片处理 |
| 翻译/i18n | `translations.ts` | 多语言 |
| Logger | `logger.ts` | 日志 |
| Markdown 工具 | `markdown-utils.ts` | Markdown 处理 |
| AI Provider | `lib/ai/` | OpenAI/Gemini/Azure 多 Provider |
| Tag 数据 | `lib/tag-data/` | 各学科知识点 tag 数据 |

#### PWA 外壳

- `src/app/manifest.ts` — 已配置，直接继承
- 根 `layout.tsx` 的 `viewport` + `metadata` — 已配置 appleWebApp + themeColor，直接继承
- 图标：`public/icons/icon.png`

#### 鉴权（NextAuth v4）

- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth v4 API 路由
- `src/lib/auth.ts` — Auth 配置
- `src/components/providers.tsx` — SessionProvider 包裹
- 鉴权机制：`getServerSession` + `useSession`，在 API 路由和页面中直接调用
- 结论：**完全不改，直接 import 复用**

#### 打印 PDF 模式

- `src/app/print-preview/page.tsx` (16KB) — 打印预览页面，已有 `@media print` 样式
- `src/lib/print-preview.ts` — 打印工具函数
- `src/app/globals.css` — 含 `@media print` 规则
- 我们已有 `src/app/diagnosis/paper-pack/` 雏形，可复用其打印逻辑
- 结论：复用打印基础，我们的纸质包在此基础上增强

#### 图片上传 / OCR

- `src/components/upload-zone.tsx` — react-dropzone 封装
- `src/components/image-cropper.tsx` — react-image-crop 封装
- `src/lib/image-utils.ts` — 图片工具
- `src/app/api/analyze/route.ts` — AI 分析（含 OCR）
- `src/app/notebooks/[id]/add/page.tsx` — 错题录入 UI（含图片上传完整流程）
- 结论：图片上传链完整可用；OCR/VLM 识图走我们的 AI 管线，不依赖上游

### 2.4 「碰不得」清单（绝不修改的文件）

| 文件 | 理由 |
|------|------|
| `src/app/layout.tsx` | 根布局，上游核心 |
| `src/app/page.tsx` | 首页/错题本主页（28KB） |
| `src/app/globals.css` | 全局样式，含上游 print 规则 |
| `src/app/manifest.ts` | PWA manifest |
| `next.config.ts` | 上游构建配置，如需改仅最小增量 |
| `package.json` | 上游依赖清单，如需加仅最小增量 |
| `tailwind.config.ts` | 不存在（Tailwind v4 用 CSS 配置），不新建 |
| `src/app/login/` | 登录页 |
| `src/app/register/` | 注册页 |
| `src/app/admin/` | 管理后台 |
| `src/app/notebooks/` | 错题本 CRUD |
| `src/app/error-items/` | 错题详情 |
| `src/app/practice/` | 练习 |
| `src/app/stats/` | 统计 |
| `src/app/tags/` | 标签 |
| `src/components/providers.tsx` | 根 Provider 包裹 |
| `src/lib/auth.ts` | Auth 配置 |
| `src/lib/prisma.ts` | Prisma client |
| 所有 `src/components/ui/` | UI 组件库 |
| 所有 `src/components/*.tsx` | 业务组件（不改，只 import） |
| 所有 `src/lib/` | 基础设施库 |
| `prisma/schema.prisma` 中上游已有的 model | 铁律 3 |

## 3. 任务 1：文件夹 / 路由组织方案

### 3.1 路由命名空间：`/nana`

**选定方案：普通文件夹 `src/app/nana/`**，不使用 route group。

选择理由：
- 普通文件夹产生 URL 段 `/nana`，用户一眼能看出这是诊断辅导板块
- route group `(nana)` 不产生 URL 段，会让我们的页面（如 `/capture`、`/session`）散落在根 URL 空间，与上游现有路由（`/practice`、`/stats`、`/tags`）容易误撞
- 物理上与上游隔离（自己的文件夹、自己的 layout），满足避冲突要求

目录树：

```
src/app/
├── nana/                           ← 我们的命名空间（唯一新建的顶层文件夹）
│   ├── layout.tsx                  ← 我们的段级 layout（不改根 layout）
│   ├── page.tsx                    ← /nana 场景入口首页
│   ├── capture/                    ← /nana/capture 采集（拍题+录音）
│   │   └── page.tsx
│   ├── session/                    ← /nana/session 周末诊断 session
│   │   ├── page.tsx                ← session 列表/入口
│   │   └── [id]/                   ← /nana/session/[id] 单次 session
│   │       └── page.tsx
│   ├── knowledge-map/              ← /nana/knowledge-map 知识地图
│   │   └── page.tsx
│   └── paper-pack/                 ← /nana/paper-pack 纸质包预览/打印
│       └── page.tsx
├── (上游路由，不改) ...
```

URL 对应：
- `/nana` → 场景入口首页
- `/nana/capture` → 采集（拍题+录音）
- `/nana/session` → 周末 session 列表
- `/nana/session/[id]` → 单次 session
- `/nana/knowledge-map` → 知识地图
- `/nana/paper-pack` → 纸质包预览

### 3.2 组件目录

```
src/components/
├── nana/                           ← 我们的组件（与上游物理隔离）
│   ├── capture/                    ← 采集相关组件
│   │   ├── question-image-viewer.tsx   ← 题图固定可见
│   │   ├── voice-recorder.tsx          ← 陪伴式录音（波形+实时转写）
│   │   ├── transcription-panel.tsx     ← 逐字稿面板
│   │   └── case-card.tsx              ← 错题卡片盒卡片
│   ├── session/                    ← Session 相关组件
│   │   ├── session-flow.tsx            ← session 流程编排
│   │   ├── question-card.tsx           ← 答题卡片
│   │   ├── probe-interaction.tsx       ← 探针下探交互
│   │   └── session-summary.tsx         ← Session 小结
│   ├── knowledge-map/              ← 知识地图组件
│   │   ├── knowledge-map-canvas.tsx    ← 地图画布（力导向/层级图）
│   │   ├── knowledge-node.tsx          ← 知识点节点
│   │   └── knowledge-frontier.tsx      ← 前沿点亮指示
│   ├── paper-pack/                 ← 纸质包组件
│   │   ├── paper-pack-preview.tsx      ← 纸质包预览
│   │   └── paper-pack-print.tsx        ← 打印触发
│   └── shared/                     ← 我们内部的共享组件
│       ├── nana-layout.tsx             ← /nana 段级布局（导航/顶栏）
│       └── no-judgment-button.tsx      ← 不评判按钮组件
```

```
src/lib/
├── nana/                           ← 我们的前端专用工具（非共享库）
│   ├── nana-api-client.ts              ← 调用我们后端 API 的客户端
│   └── nana-utils.ts                   ← 前端专用工具函数
```

### 3.3 入口策略

从上游首页（`/`）进入我们的板块，有以下选项：

**方案 A（推荐）：独立 URL 入口**
- 用户直接访问 `/nana`，不与上游首页耦合
- 如果需要在某处放入口链接：在 `/nana/layout.tsx` 中放"返回错题本"链接（回到 `/`）
- 上游不改一行代码

**方案 B：上游首页加最小入口**
- 在 `src/app/page.tsx` 的导航区加一个 `<Link href="/nana">` 
- 这是 `⚠️上游文件修改`，需标注 commit message
- 如果上游更新了 `page.tsx`，这里可能冲突

**推荐先用方案 A**。当用户反馈"从错题本找不到诊断入口"时，再考虑方案 B 的最小改动。

### 3.4 两张表

**表 1：「我们的文件都放哪」**

| 内容 | 路径 | 说明 |
|------|------|------|
| 路由页面 | `src/app/nana/` | `/nana/*` 所有页面 |
| 段级布局 | `src/app/nana/layout.tsx` | 不改根 layout |
| 业务组件 | `src/components/nana/` | 采集/session/地图/纸质包 |
| 前端工具 | `src/lib/nana/` | API 客户端 / 工具函数 |
| 测试 | `src/__tests__/unit/nana/` `src/__tests__/integration/nana/` | 组件测试 + 集成测试 |
| E2E | `e2e/nana/` | Playwright E2E |

**表 2：「碰不得清单」**

见 2.4 节完整清单。核心原则：`src/app/` 下除 `nana/` 和 `diagnosis/`（我们建的）外全不碰；
`src/components/` 下除 `nana/` 外全不改只 import；`src/lib/` 全不改只 import。

**验证标准**：将来 `git merge upstream/main` 时，冲突只可能出现在：
1. `package.json` — 如果我们加了依赖
2. `next.config.ts` — 如果我们改了配置
3. `src/app/page.tsx` — 如果我们加了入口链接（方案 B）
其余所有文件物理隔离，零冲突。

## 4. 任务 2：复用 vs 重建台账

### 4.1 直接复用（只 import 不改）

| 上游资产 | 我们的用法 | 理由 |
|----------|-----------|------|
| UI 组件库（button/card/dialog/input/tabs 等 19 个） | 直接 `import { Button } from "@/components/ui/button"` | 成熟稳定，shadcn 模式，风格统一 |
| Prisma client (`src/lib/prisma.ts`) | 直接 import，用我们自己的 model | 数据库连接单例，不改 |
| Auth (`src/lib/auth.ts`, `auth-utils.ts`) | `getServerSession` / `useSession` 保护路由和 API | NextAuth v4 成熟，不改 |
| Providers (`src/components/providers.tsx`) | 已被根 layout 包裹，我们的页面自动继承 session | 不改 |
| PWA 外壳 (`manifest.ts`, 根 layout meta) | 自动继承，我们的页面获得相同 PWA 能力 | 不改 |
| 主题/Tailwind（`globals.css` + Tailwind v4） | 用相同的 CSS 变量和 utility class | 不改 |
| Fonts (Geist Sans + Mono) | 自动继承 | 不改 |
| MarkdownRenderer | 渲染 AI 提要、逐字稿中的公式 | react-markdown + KaTeX，直接复用 |
| UploadZone + ImageCropper | 拍题入口 | react-dropzone + react-image-crop，直接复用 |
| API 客户端 (`api-client.ts`) | 前端调用后端 API | 统一错误处理，直接复用 |
| 打印工具 (`print-preview.ts`) | 纸质包打印 | 已有 `@media print` 规则，直接复用 |
| Logger (`logger.ts`) | 前端日志 | 直接复用 |
| Icons (`lucide-react`) | 图标 | 已在依赖中，直接 import |
| Recharts (`recharts`) | 统计图表 | 已在依赖中，可用于 session 小结图表 |

### 4.2 复用但包一层（需适配我们场景）

| 上游资产 | 我们的包装 | 理由 |
|----------|-----------|------|
| KnowledgeFilter | 包成 `KnowledgeFilterNana`，对接我们的 `KnowledgeNode`/`StudentNodeState` | 上游 filter 对的是 `KnowledgeTag`，我们对的是知识图谱节点 |
| ErrorList | 包成 `CaseCardList`，适配"错题卡片盒"四层结构 | 上游展示错题摘要，我们展示 case（题图/原音/逐字稿/AI 提要） |
| Progress | 包成 `BKTProgressBar`，显示掌握度概率 | P4 原则：前台只报增量，不报"你又错了" |
| TagInput | 包成 `MisconceptionTagInput`，对接我们的 `Misconception` 库 | 标签概念不同 |

### 4.3 重新设计（上游没有，我们的超越点）

详见任务 3。

## 5. 任务 3：我们要重新设计的界面（架构占位）

> 每项注明：对应哪个后端 API、守哪条原则（P1/P4/P5）。本方案只定架构占位，不展开实现。

### 5.1 场景入口首页（`/nana`）

**守则**：P4（不评判）、P5（周末数字化）

**定位**：任务导向的首页，不是"诊断仪表盘"。只出现行动按钮，不出现诊断结论。

**界面要素**：
- 两个主要行动按钮："拍一下这道题"（启动采集）、"补一段你当时怎么想的"（启动口述录音）
- 如果已有 session 记录：显示"继续上次 session"或"查看知识地图"
- **不出现**：错题数、掌握度百分比、诊断标签、红色/警告色

**对应后端 API**：`GET /api/diagnosis/sessions`（最近 session）、`GET /api/diagnosis/map`（知识地图摘要）

### 5.2 采集「错题卡片盒」（`/nana/capture`）

**守则**：P1（见 §1.5）、P4（不评判）

**定位**：一条 case 四层结构——题图 / 原音 / 逐字稿 / AI 提要。

**界面要素**：
- 上半屏：题图固定可见（核心超越点）
- 下半屏：切换 tab（口述录音 / 逐字稿 / AI 提要）
- 录音时：题图保持可见（P1），下半屏显示波形 + 实时转写文字流

**对应后端 API**：
- VLM 识图：已有 `POST /api/ai/...` 管线
- 语音转写：走飞书妙记 / 通义听悟（后端 API 待建，采集轮实现）
- Case 存储：待建 `POST /api/nana/cases`

### 5.3 陪伴式录音（`/nana/capture` 内组件）

**守则**：P1（见 §1.5）

**定位**：这是我们的核心超越点——Get 笔记调研指出，竞品都做不到"录音时题图始终在眼前"。

**界面要素**：
- 上半屏：题图（不可滚动、不可遮挡）
- 下半屏：录音控件（波形可视化 + 实时转写文字流）
- 录音按钮：按住说话 / 点击开始-点击结束（两种模式可选）
- 转写文字：实时流式展示，可事后编辑

**对应后端 API**：ASR 流式转写（后端待建，采集轮实现）

### 5.4 知识地图可视化（`/nana/knowledge-map`）

**守则**：P4（只报增量，不报缺陷）、P2（结构先于模型）

**定位**：产品灵魂界面。展示知识图谱结构，只点亮已掌握的绿点，不铺一片红。

**分阶段展开**（P4 渐进）：
- **阶段 1（MVP）**：只看已掌握的绿点 + 1-2 个"下一个前沿"（蓝色/虚线边框）
- **阶段 2**：主线路径高亮 + 学生位置标记
- **阶段 3**：完整图谱可探索（含未掌握区灰色显示）

**界面要素**：
- 力导向图 / 层级树图（用 D3.js 或 React Flow，待选型）
- 节点颜色：绿=已掌握、蓝=下一个前沿、灰=未探索（默认隐藏或极淡）
- 点击节点：显示该知识点详情（名称、描述、桥接关系）
- **不出现**：红色节点、错误标记、诊断标签

**对应后端 API**：`GET /api/diagnosis/map`（已有）

### 5.5 周末 Session 流程 UI（`/nana/session/[id]`）

**守则**：P5（周末数字化、周中纸质化）、P3（多问少断）

**定位**：串 M3c 已有的 session-items → submit-answers → paper-pack 流程。

**状态机对应**（引用 `doc/DECISIONS.md` D-4 权威定义）：
canonical 状态序列为
`idle → boundary_select → item_dispatch → answer_collect → bkt_update → kst_propagate → gap_detect → paper_pack → closed`，
其中 `probe_drill` 为可选跳转步骤。

Session UI 对应的状态流转：

> 以下仅列出 UI 层显式对应的状态；`boundary_select`/`bkt_update`/`kst_propagate`/`gap_detect` 为后端内嵌步骤，不对应独立 UI。

1. `item_dispatch` → 展示本次 session 的题目列表（对应 `POST /api/diagnosis/session-items`）
2. `answer_collect` → 逐题作答 UI（答题卡片 + 提交按钮，对应 `POST /api/diagnosis/submit-answers`，触发 BKT+KST 更新）
3. `probe_drill`（可选）→ 探针下探交互（追问确认理解，对应 `POST /api/diagnosis/sessions/[id]/probes`）
4. `paper_pack` → 生成/预览纸质包（对应 `POST /api/diagnosis/paper-pack`）

**界面要素**：
- 答题卡片：题图 + 作答区（选择/填空/解答），一行一个问题
- 提交按钮：不评判措辞（"记一下"而非"提交诊断"）
- 进度条：显示当前题号/总题数
- Session 完成后：自动跳转纸质包预览

**对应后端 API**（按 Session 流程顺序）：
- `POST /api/diagnosis/sessions`（已有）— 创建 session
- `GET /api/diagnosis/sessions/[id]`（已有）— 查询 session 详情
- `POST /api/diagnosis/session-items`（已有）— `item_dispatch`：编排器从题库分发题目
- `POST /api/diagnosis/submit-answers`（已有）— `answer_collect`：提交答案，BKT+KST 分线更新并写入 `StudentNodeState`（M3c 核心持久化入口）
- `POST /api/diagnosis/sessions/[id]/probes`（已有）— `probe_drill`（可选）：探针下探
- `POST /api/diagnosis/sessions/[id]/errors`（已有）— 记录答题错误
- `POST /api/diagnosis/paper-pack`（已有）— `paper_pack`：生成纸质包

### 5.6 纸质包预览（`/nana/paper-pack`）

**守则**：P5（周中纸质化，可打印 PDF）

**定位**：已有 `src/app/print-preview/` 和 `src/app/diagnosis/paper-pack/` 雏形，复用并增强。

**界面要素**：
- 打印预览（复用上游 `print-preview.ts` 和 `@media print` 规则）
- "打印纸质包"按钮
- 纸质包内容：本周题目 + 提示 + 参考答案（不出现诊断结论）

**对应后端 API**：`POST /api/diagnosis/paper-pack`（已有）、`GET /api/diagnosis/paper-pack`（已有）

## 6. 任务 4：建设顺序建议（MVP 切片）

> 实际开工待用户确认。第 0 阶段人肉回路（无 UI）才是当前真实验证主力。

### 切片 0（零成本，当前正在进行）：人肉回路

不用写一行代码。舅舅周末带她：批量拍 5-10 题→逐条口述→留原始录音→异步回听追问。
这是当前的真实验证主力，不与前端开发冲突。

### 切片 1（最小可上线，1-2 周）：场景入口 + 采集壳（错题卡片盒） ⭐ 推荐先建

**为什么先建这个**：
- 这是调研报告中反复强调的核心交互——"场景入口""题图始终可见的陪伴式录音""多模态聚合到同一条 artifact"——是我们产品超越竞品的最有辨识度的体验
- `/nana` 入口首页和采集壳是一个闭合的体验单元：用户进来 → 看到两个行动按钮 → 拍题 → 看到题图固定在上半屏 → 口述录音 → 逐字稿出现在下半屏
- 采集壳的"壳"可以先搭起来（题图查看器 + 录音按钮 + 转写面板布局），录音/转写后端链路（ASR/VLM）在切片 1 期间并行推进，壳先跑通静态流程
- 不依赖知识图谱数据（即使图谱为空也不影响采集体验）

**建什么**：
- `/nana` 场景入口首页（两个行动按钮："拍一下这道题""补一段你当时怎么想的"，不出现诊断结论）
- `/nana/capture` 采集页面（上半屏题图固定 + 下半屏录音/转写/提要 tab）
- `src/components/nana/capture/`（题图查看器 + 录音控件壳 + 转写面板壳 + 卡片盒卡片）
- `src/components/nana/shared/`（段级布局 + 不评判按钮）

**不建什么（本切片）**：
- 不接真实 ASR/VLM 后端（先用 mock/静态数据跑通 UI 流程）
- 不做知识地图

> **注意**：切片 1 是产品的**主验证点**——验证"题图固定可见的陪伴式录音"这个超越点能否在 UI 上成立。
> 它不是一个技术楔子，而是产品灵魂的第一次上屏。

### 切片 2（并行或紧随切片 1，1-2 周）：知识地图查看

**定位**：技术楔子 + P4 可视化。知识地图的后端 API 已就绪，实现风险低，可以和切片 1 并行（不同人）或紧随其后。
但它验证的是通用可视化能力，不是采集体验这个产品主验证点。

**建什么**：
- `/nana/knowledge-map` 知识地图页面（阶段 1：绿点 + 1-2 前沿）
- `src/components/nana/knowledge-map/`（地图画布 + 节点组件）

### 切片 3（2-3 周）：周末 Session 流程 UI

**为什么第三个建**：
- 后端 API 已 100% 就绪（状态机 + 所有 session API，含 `submit-answers`），技术上**可独立先建**
- session 中的题目由编排器（`lib/diagnosis-orchestrator.ts`）从题库分发，**不依赖采集流程**
- 能串起完整的"答题→提交→纸质包"流程

> **关于切片排序的说明（产品判断，非技术依赖）**：
> 当前排序"采集壳优先、Session UI 第三"是**产品取舍**而非技术依赖——
> - 采集壳优先：验证"题图固定可见的陪伴式录音"这个产品超越点
> - Session UI 优先：后端全就绪，可立即跑通"答题→提交→纸质包"的可用闭环
>
> 两者技术上互不依赖，先建哪个取决于本轮想验证什么。

**建什么**：
- `/nana/session` 列表页 + `/nana/session/[id]` 流程页
- `src/components/nana/session/`（流程编排 + 答题卡片 + 探针交互）
- `/nana/paper-pack` 纸质包预览（增强已有雏形）

### 切片 4（3-4 周）：采集后端接通 + 端到端闭环
- 依赖 ASR/VLM 后端管线（需先建后端）
- 这是真正的超越点（陪伴式录音），但后端更重

**建什么**：
- `/nana/capture` 采集页面
### 切片 5（后续迭代）：知识地图完整版 + 动画

- 知识地图阶段 2/3（主线高亮、完整图谱探索）
- 过渡动画、微交互
- 采集后端 ASR/VLM 全线接通，端到端闭环

### 不建

- 不上游已有的功能（错题本 CRUD、标签管理、统计、管理后台等）
- 不引重型新框架（D3/React Flow 等可视化库如需引入，在对应切片开始前评估）

## 7. 测试策略

| 测试类型 | 范围 | 工具 |
|----------|------|------|
| 组件单元测试 | `src/components/nana/` 下所有组件 | Vitest + React Testing Library |
| 集成测试 | `/nana` 页面关键流程（session 流程、地图渲染） | Vitest + jsdom |
| E2E | 关键用户路径（入口→拍题→session→纸质包） | Playwright（已有配置） |

## 8. 风险与注意事项

1. **Tailwind v4 无 tailwind.config.ts**：上游用 Tailwind v4（CSS-based config），我们继承即可，不需新建配置
2. **NextAuth v4 不是 v5**：上游用的是 `next-auth@^4.24.13`（非 beta v5），API 不同，注意 `getServerSession` 用法
3. **SQLite 不是 PostgreSQL**：Prisma SQLite 适配器限制了某些特性（枚举、并发写入），已在上游验证可行
4. **上游 `page.tsx` 28KB**：主页面非常大，如果未来需要从中拆分导航组件再考虑方案 B 入口
5. **知识地图可视化库选型**：切片 2 开始前需评估 D3.js vs React Flow vs vis-network，写进技术决策台账
6. **铁律 3 严守**：不新增上游 Prisma model 字段，我们的前端如需额外数据，走自己的 model

## 9. 技术附录

### 9.1 段级 layout 与鉴权前提

**前提明确**：`/nana` 当前定位为**登录后场景**。因为：
- 采集链（拍题/录音/逐字稿）需要归属到具体学生账号
- Session 流程和历史需要用户身份
- 当前阶段只有一个学生用户（外甥女），不存在"游客浏览"的使用场景

如果未来需要面向公众的落地页（不登录就能看到产品介绍），那是另一个独立页面（如 `/` 或 `/landing`），不属于 `/nana` 命名空间。

```tsx
// src/app/nana/layout.tsx
import { getServerSession } from "@/lib/auth-utils";
import { redirect } from "next/navigation";

export default async function NanaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <div className="nana-layout">
      {/* 可选：我们自己的导航顶栏 */}
      {children}
    </div>
  );
}
```

**场景入口的低压感（P4）体现在 `/nana` 页面内容上，不在鉴权层**：
- 首页只出现行动按钮（"拍一下这道题""补一段你当时怎么想的"），不出现诊断结论
- 按钮措辞不评判（P4 前台措辞铁律）
- 登录由上游已有的 `/login` 页面承载，我们不重复造登录 UI

### 9.2 待选型的可视化库（切片 1 前评估）

| 库 | 优点 | 缺点 |
|----|------|------|
| D3.js | 最灵活、社区最大 | 学习曲线陡、React 集成需额外封装 |
| React Flow | React 原生、节点/边组件化、内置交互 | 偏流程图，知识图谱需适配 |
| vis-network | 开箱即用、力导向布局好 | 维护不如前两者活跃 |
| Cytoscape.js | 图论专用、布局算法丰富 | React 封装社区维护 |

推荐先评估 React Flow（React 原生、组件化匹配我们的节点设计）和 Cytoscape.js（图论专用、布局算法丰富）。

### 9.3 依赖增量预估

| 切片 | 切片内容 | 可能新增的依赖 | 类型 |
|------|---------|---------------|------|
| 切片 1 | 采集壳（拍题 + 陪伴式录音） | `wavesurfer.js` 或 `recordrtc` | 录音波形 |
| 切片 2 | 知识地图可视化 | `reactflow` 或 `cytoscape` | 可视化 |
| 切片 3 | Session UI（答题 / 纸质包流程） | 无新依赖（复用上游组件） | - |
| 切片 4 / 切片 5 | 采集后端接通 / 知识地图完整版+动画 | 待评估（含 ASR/VLM 后端管线） | - |

所有新增依赖在对应切片开工前单独评估，写入 `doc/DECISIONS.md`。

### 9.4 与上游 API 关系

我们的前端页面主要调我们建的 API（`/api/diagnosis/*`），这些 API 已在 `src/app/api/diagnosis/` 下。
如需新建前端专用 API（如 case 存储），放在 `src/app/api/nana/` 下，与上游 API 物理隔离。

---

> **产出后流程**：本方案 → **Codex 架构评审**（重点看避冲突规约是否成立、复用边界是否"只 import 不改"、是否守 P1/P4/P5）→ 用户拍板是否进入建设、先建哪个切片。
