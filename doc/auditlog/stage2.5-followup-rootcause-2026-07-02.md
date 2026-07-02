# Stage 2.5 真机验收体验问题 · 根因分析与修复方案

> 触发：2026-07-02 生产真机验收，用户反馈两个体验问题。
> 方法：systematic-debugging skill（Phase 1 根因 → Phase 2 模式 → Phase 3 修复方案）。
> 性质：**问题 1 是性能优化 + bug；问题 2 是移动端适配架构问题（非 bug，是当前 SVG 方案在手机上根本不可用）**。

---

## 问题 1：题图加载明显慢

### 症状
点"看看地图"→ 点一道题展开详情面板，题图加载明显慢，用户以为卡死。

### 根因（Phase 1 已确认，证据确凿）

**根因 A：图片压缩阈值 bug，导致 1.2MB base64 原图直接入库、直接传输。**

`src/lib/image-utils.ts:82-99` 的 `processImageFile`：
```ts
const fileSizeMB = file.size / 1024 / 1024;
if (fileSizeMB > threshold) {  // threshold = 1MB
  return await compressImage(file, threshold);
} else {
  // 直接返回 Base64，不压缩
}
```

**bug**：阈值判断用 `file.size`（原始文件字节大小）。手机拍照的原始 JPEG 往往已经 < 1MB（现代手机 HEIC/高压缩 JPEG），所以走"不压缩"分支。但：
- base64 编码膨胀 33%（1MB → 1.33MB）
- 手机照片分辨率高（3024×4032），即使文件小，base64 字符串仍很大
- **实测生产库**：4 张 question_image 全是 ~1.2MB base64（`length(content)` 1228319~1280427 字节）

**根因 B：每次展开面板都重新拉完整 base64，无前端缓存。**

`recent-cases-list.tsx` 的 `CaseTagPanel`：`useEffect([caseId])` 每次都调 `getCase(caseId)`，拉完整 artifacts（含 1.2MB base64）。关掉再点同一道题 → 重新拉一遍 1.2MB。无缓存。

**根因 C：有加载态提示但 1.2MB 在 4G 下要几秒，体感"卡死"。**

面板有"题图加载中…"文字，但 1.2MB base64 在生产网络（手机 4G + 香港服务器）下传输需 2-5 秒，期间用户只看到"加载中"，无进度反馈，以为卡死。

### 修复方案

**最小修复（立竿见影）**：
| # | 改动 | 文件 | 效果 |
|---|------|------|------|
| 1 | **压缩阈值改用 base64 后大小判断，且所有图都过一遍压缩**（maxWidth 降到 1280，quality 0.7） | `src/lib/image-utils.ts` | 新题图入库前压到 ~200-400KB（比现在 1.2MB 小 3-6 倍） |
| 2 | **CaseTagPanel 加 case 详情缓存**（Map<caseId, CaseResponse>，面板内或组件级） | `recent-cases-list.tsx` | 同一道题再点不重新拉 |
| 3 | **加载态加骨架 + 计时提示**（"题图加载中…大约几秒"或骨架动画） | `recent-cases-list.tsx` | 用户知道在加载，不以为卡死 |

**注意**：改动 1 只影响**新拍的题图**。已入库的 4 张 1.2MB 老图仍大——要么接受（量小），要么加一个后台压缩迁移脚本（后续优化，不在本轮）。

**后续优化（本轮不做）**：
- 列表 API 返回服务端生成的极小缩略图（~8KB，需图片处理管线）
- 独立图片 CDN / 对象存储（设计债 #3 已登记，case>100 时迁）
- Service Worker 缓存 getCase 响应

---

## 问题 2：知识地图字体在手机上看不清，不能放大

### 症状
知识地图下面的节点名、主线名、图例字体非常小（用户反馈"看不清"），且不能 pinch zoom 放大。

### 根因（Phase 1 已确认，数学计算 + 代码追踪）

**根因：整张 48 节点 SVG（~2420px 宽）硬缩进 375px 手机视口，字号被压到 ~1.3px。**

证据链：
- 布局算法 `knowledge-map-layout.ts`：10 列主线 + 1 列"其他"，每列 `COL_TOTAL = 220px`（`COL_WIDTH=180 + COL_GAP=40`）
- `knowledge-map-canvas.tsx:91`：`svgWidth = max(columnCount * COL_TOTAL + COL_GAP, 368)` → 11 列 × 220 + 40 ≈ **2460px**
- 容器 `knowledge-map/page.tsx:218`：`<div className="flex-1 overflow-auto px-2 pb-6">`，`max-w-md`（375px 视口）
- SVG `className="w-full"` + `viewBox="0 0 2460 ..."` → 2460px 内容**整体缩放**进 ~343px（375 - padding）
- **缩放比 ≈ 0.14**
- `FONT_SIZE = 9.5px`（SVG 内）→ 屏幕实际渲染 **9.5 × 0.14 ≈ 1.3px**（肉眼不可见）
- 主线标签 `fontSize=11` → 实际 ~1.5px
- 节点圆 `NODE_R=8.5 / OTHER_R=6` → 实际 0.8-1.2px（点都看不见）

**这不是字号调大一点能解决的**——48 节点 + 10 列的主线布局，在 375px 宽度下任何字号都不可读。这是**架构问题**：桌面级 SVG 全景图直接塞手机，根本不适配。

### 修复方案（用户倾向已确认：地图概览 + 下方分组列表）

**用户明确倾向**：
> 地图问题优先做移动端可读方案，短期可以改成"地图概览 + 下方按状态/收过题分组的知识点列表"，比强行缩小 SVG 更适合手机。

**推荐方案：双模式（概览缩略图 + 分组列表），手机默认列表**

| 模式 | 内容 | 适用场景 |
|------|------|----------|
| **列表模式（手机默认）** | 按状态分组的卡片列表："已点亮 N"/"下一个"/"收过题"/"未探索"，每项显示节点全名 + chip，点击展开详情 | 手机（375px），字号正常 14-16px，完全可读 |
| **图谱模式（切换/桌面）** | 现有 SVG 全景图（保留，加 pinch-zoom/pan 或桌面看） | 桌面/平板，或用户主动切换 |

**列表模式分组**（复用 map API 数据，零新接口）：
```
已点亮 ✦ (N)        ← status=stable 的节点，绿色 chip
下一个 (N)           ← learningFrontier，蓝色 chip
收过题 (N)           ← caseEvidenceCount>0 且非 stable/frontier，琥珀 chip
未探索 (其余)        ← 折叠/灰chip
```
每项：节点全名（14px 正常字号）+ 状态色点 + caseEvidenceCount 角标。点击 → 现有 KnowledgeDetailCard 弹出（已有组件，不重写）。

**图谱模式**：保留现有 `KnowledgeMapCanvas`，但加一个"看全景图"切换按钮。桌面/平板自动显示图谱（`md:` 断点）。手机可选切入图谱模式（带双指缩放）。

**不破坏三层语义**：列表模式的色点/chip 与图谱的绿/蓝/琥珀完全对应；只是展示形态从"小圆点 + 缩进文字"换成"全名 + chip 列表"。

**Phase 4 实施建议**：这是一个**小型架构重构**（新增列表视图组件 + 切换），不是 bug fix。应走 plan-agent → execute-agent 正式流程，不在审计里硬改。本轮先出方案。

---

## 优先级与执行建议

| 问题 | 紧急度 | 建议归属 |
|------|:------:|----------|
| 1 题图加载慢 | **高**（每次点开都卡几秒，体验差） | **立即修**（最小修复 3 改动：压缩阈值 + 缓存 + 加载态） |
| 2 地图不可读 | **高**（核心功能在手机不可用） | **走 plan-agent**（双模式架构，需设计切换 + 列表组件） |

**建议顺序**：
1. **先修问题 1**（3 个最小改动，快速见效，不动架构）—— execute-agent 直接做
2. **问题 2 走 plan-agent** 出"知识地图移动端双模式"方案 —— 涉及新组件 + 切换 + 断点

两个可以并行规划，但问题 1 先落地。

---

## 附录：证据采集

### 问题 1 证据
```bash
# 生产库题图大小
sqlite3 /opt/nana/data/dev.db "SELECT length(content) FROM Artifact WHERE type='question_image';"
# → 1280427, 1280427, 1270971, 1228319（均 ~1.2MB base64）
```

### 问题 2 证据
```
布局常量：COL_WIDTH=180, COL_GAP=40, COL_TOTAL=220, 11 列
svgWidth ≈ 11 * 220 + 40 = 2460px
手机视口（max-w-md）≈ 343px 内容区
缩放比 = 343 / 2460 ≈ 0.14
FONT_SIZE = 9.5px → 屏幕实际 9.5 * 0.14 ≈ 1.3px（不可读）
NODE_R = 8.5px → 屏幕实际 1.2px（看不见）
主线标签 fontSize=11 → 屏幕实际 1.5px（不可读）
```

## 附录：代码追踪路径

**问题 1**：
- 压缩阈值 bug：`src/lib/image-utils.ts:82-89`（`file.size > 1MB` 判断，绕过了 base64 膨胀）
- 每次重拉：`src/components/nana/knowledge-map/recent-cases-list.tsx` CaseTagPanel `useEffect([caseId])` 调 `getCase`，无缓存
- 加载态：有"题图加载中…"文字，但无进度/骨架动画

**问题 2**：
- 布局：`src/components/nana/knowledge-map/knowledge-map-layout.ts`（10 列 + 其他列，COL_TOTAL=220）
- 字号：`knowledge-map-canvas.tsx:66` `FONT_SIZE=9.5`
- 容器缩进：`knowledge-map/page.tsx:218` `w-full` + viewBox → 整体缩放
- 无 pinch-zoom / pan 交互
