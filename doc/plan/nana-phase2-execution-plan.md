# 第 2 阶段执行计划：知识地图

> 性质：`/plan` 阶段产出。面向 execute-agent 的可执行规格。
> 依赖总纲：`nana-master-plan.md`、`nana-development-phases.md` §2
> 产生日期：2026-06-28

---

## 目标

展示知识图谱，只亮已掌握的绿点 + 1-2 个下一个前沿（蓝色虚线邀请），不铺一片红。

## 前置条件

- 第 1 阶段完成（`/nana` 首页已有"看看我的知识地图 →"链接）
- 后端 `GET /api/diagnosis/map` API 已就绪（需扩展：补充 edges + mainlines 返回）
- 设计基底已有（`01-design-foundation.html` 三态节点：绿发光 / 蓝虚线 / 灰未探索）
- Mockup `04-knowledge-map.html` ✅ 可直接参考

## 拆分策略（2 个 commit）

```
Commit ①: 扩展 map API 返回 edges + mainlines + 知识地图页面框架
Commit ②: 知识地图可视化渲染（节点/边/前沿/交互）
```

---

## Commit ①：扩展 map API + 页面框架

### 1.1 扩展 GET /api/diagnosis/map

**文件**：`src/app/api/diagnosis/map/route.ts`

在响应中追加两个字段：

```typescript
// 现有返回...
{
  nodes: [{ nodeId, name, layer, tier, status, masteryProb }],
  learningFrontier: string[],
  stats: { total, stable, gap, uncertain, untested },
  // 新增：
  edges: [{ sourceId, targetId, type: "prerequisite" | "tool" }],
  mainlines: [{ mainlineId, name, priority, nodeIds: string[] }],
}
```

**数据来源**：
- `edges`：从 `KnowledgeGraph.load(prisma)` 获取全量边
- `mainlines`：从 `prisma.mainline.findMany()` 获取主线定义，从 `prisma.nodeMainline.findMany()` 获取节点归属

**设计说明**：一次性返回 edges + mainlines 避免额外 API 请求。数据量小（<400 节点，<1000 边），在单个响应中返回无性能问题。

### 1.2 创建知识地图页面框架

**文件**：`src/app/nana/knowledge-map/page.tsx`（"use client"）

**布局**：
```
┌─────────────────────────────┐
│  ← 返回  我的知识地图        │  ← 顶栏（复用首页风格）
│  你已经点亮了 N 个光点 ✦     │
├─────────────────────────────┤
│  [图例: ●已点亮 ○未探索      │
│         ◎下一个]            │
├─────────────────────────────┤
│                             │
│       SVG 知识图谱画布        │
│    （滚动/缩放容器）          │
│                             │
│                             │
│  ┌──── 节点详情卡 ──────┐   │
│  │  ● 求函数定义域        │   │
│  │  x 能取哪些值不出问题   │   │
│  │  5月12日点亮 ✦        │   │
│  └──────────────────────┘   │
└─────────────────────────────┘
```

**数据加载**：调用 `GET /api/diagnosis/map?studentId=xxx` 获取全量数据

**状态管理**：
- `selectedNode: string | null`（当前选中的节点 ID）
- 拖拽/平移（可选，Phase 2 先不做）

### 1.3 组件

**文件**：`src/components/nana/knowledge-map/knowledge-map-canvas.tsx`

SVG 画布容器，接收 nodes/edges/mainlines/frontier 数据，渲染整个图谱。

**文件**：`src/components/nana/knowledge-map/knowledge-node.tsx`

单个节点组件（SVG circle + text label）。

**文件**：`src/components/nana/knowledge-map/knowledge-detail-card.tsx`

底部弹出详情卡（节点名称 + 描述 + 点亮日期）。

### 1.4 布局算法

不使用第三方可视化库（零新依赖）。采用**主线程列布局**：

```
每条主线占一列（M0 在最左，M7 在最右）
列内节点按依赖关系层级排列（上层节点是下层的前置知识）
依赖边用 SVG path 曲线连接
```

**简易布局规则**：
1. 根节点（无依赖）放在列最上方
2. 子节点放在列中依赖它的节点下方
3. 无依赖关系的节点均匀分布
4. 每列宽度 180px，列间距 40px

如果节点图不依赖严格的层级关系，可以用更简单的**网格布局**：
- 每行放 6 个节点
- 节点间距固定
- 边用自动贝塞尔曲线

**建议先用网格布局**（实现简单，效果可接受），后续再升级。

### 1.5 节点三态渲染

| 状态 | 颜色 | 边框 |
|------|------|------|
| `stable`（已掌握） | 绿发光 `#6BBF8A` | glow shadow |
| `learningFrontier`（下一个） | 蓝虚线 `#93B8D6` | dashed border |
| 其他（gap/uncertain/untested） | 灰 `#D9D1C3` | 无特殊 |

**空状态**（只有一个节点稳定）：全图灰色底图 + 一个绿点 + "旅程从这一步开始"文案

### 1.6 Commit ① 验收

- [ ] `GET /api/diagnosis/map` 返回 edges + mainlines 字段
- [ ] `/nana/knowledge-map` 页面可访问（通过鉴权）
- [ ] 页面框架显示顶栏 + 图例 + 画布容器
- [ ] 图例正确显示三态标识
- [ ] 后端测试通过
- [ ] `test:nana:unit` + `test:nana:integration` 通过

---

## Commit ②：知识地图可视化渲染

### 2.1 SVG 画布渲染

**KnowledgeMapCanvas** 组件渲染逻辑：
- 遍历 `nodes`，根据布局算法计算每个节点的 x/y 坐标
- 遍历 `edges`，绘制连接线（已掌握节点间的线用绿色 `#9CCBA6`，其余用灰色 `#E7DFD0`）
- 遍历 `learningFrontier`，对前沿节点用蓝色虚线边框
- 已掌握节点用绿色填充 + 发光效果（SVG filter + glow radius）
- SVG viewBox 自适应内容区域

### 2.2 节点交互

- 悬停节点：轻微放大 + tooltip 显示节点名称
- 点击稳定节点：弹出详情卡（名称 + 描述 + 点亮日期 + 判定标准）
- 点击前沿节点：弹出"下一个要攻克的知识点"提示
- 点击未探索节点：无弹出或显示"还没走到这里"

### 2.3 详情卡

底部弹出的卡片（复用 `04-knowledge-map.html` 的 kcard 样式）：
- 节点名称 + 绿色圆点
- 一句话描述
- 判定标准
- 示例题目（来自 KnowledgeNode.sampleItem）
- 点亮日期（有记录态才显示）

### 2.4 空状态

如果只有 0-1 个 stable 节点：
- 全图灰色底图
- 仅第一个 stable 节点显示绿色
- 中央文案："旅程从这一步开始"
- 副标题："点亮一道题，灰色地图就会染上一块绿 ✦"

### 2.5 P4 措辞铁律

| 位置 | 必须用 | 禁用 |
|------|--------|------|
| 图例 | "已点亮" / "下一个" / "未探索" | "已掌握" / "未掌握" / "gap" |
| 节点详情 | "你是在 5 月 12 日点亮的" | "掌握概率 85%" |
| 空状态 | "旅程从这一步开始" | "你还没有掌握任何知识点" |
| 前沿 | "下一个：求函数定义域" | "薄弱点：M2a-03" |
| 标题 | "你已经点亮了 N 个光点" | "你的正确率：62%" |

### 2.6 Commit ② 验收

- [ ] 灰色底图全铺（所有主线节点可见）
- [ ] 已掌握节点绿色发光
- [ ] 前沿节点蓝色虚线边框
- [ ] 节点间连线正确（绿色=已知路径，灰色=未走路径）
- [ ] 点击稳定节点弹出详情卡（名称/描述/判定标准/点亮日期）
- [ ] 点击前沿节点显示"下一个"提示
- [ ] 不出现红色 / 百分比 / "未掌握"标签
- [ ] 空状态显示"旅程从这一步开始" + 一个绿点
- [ ] 布局在移动端可滚动
- [ ] P4 措辞全部合规
- [ ] Docker 测试容器通过
- [ ] Build 通过

---

## 文件变更清单

### 新增文件

| 文件 | 所属 Commit | 说明 |
|------|:--:|------|
| `src/app/nana/knowledge-map/page.tsx` | ① | 知识地图页面 |
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | ①→② | SVG 画布 |
| `src/components/nana/knowledge-map/knowledge-node.tsx` | ② | 节点组件 |
| `src/components/nana/knowledge-map/knowledge-detail-card.tsx` | ② | 详情卡 |

### 修改文件

| 文件 | 所属 Commit | 修改内容 |
|------|:--:|----------|
| `src/app/api/diagnosis/map/route.ts` | ① | 响应追加 edges + mainlines 字段 |
| `package.json` | — | 如需新依赖（选型后决定） |

### 碰不得文件（同第 1 阶段）

`src/app/layout.tsx`、`src/app/globals.css`、`src/app/page.tsx`、所有 `src/components/ui/`、所有 `src/lib/` 只 import 不改。

---

## 可视化库选型

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|:--:|
| **纯 SVG（推荐）** | 零新依赖，Tailwind 风格，轻量可控 | 交互能力弱（拖动/缩放需手动） | ⭐ |
| React Flow | React 原生，内置拖动/缩放/布局 | ~50KB 依赖，偏流程图 | 第 3 阶段升级 |
| D3.js | 最灵活，力导向布局 | 学习曲线陡，React 集成需封装 | 不推荐 |
| Cytoscape.js | 图论专用，布局丰富 | 社区不活跃 | 不推荐 |

**选择纯 SVG**：Phase 2 只做"展示+点击详情"，不需要拖动/缩放。零新依赖，实现与 mockup 一致。后续阶段如果需要复杂交互再引入 React Flow。

---

## 整体验收

- [ ] **Commit ①** ✅ — map API 扩展 + 页面框架
- [ ] **Commit ②** ✅ — 可视化渲染 + 交互
- [ ] **P4 措辞全局检查** ✅ — 无"错""失败""得分""未掌握"
- [ ] **零新依赖** ✅ — 纯 SVG，不引入第三方可视化库
- [ ] **零上游表修改** ✅
- [ ] **Docker 测试容器** ✅ — test:all 通过
- [ ] **Build** ✅ — exit code 0
