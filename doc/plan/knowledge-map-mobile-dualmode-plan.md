# 知识地图 · 移动端双模式 · 开发计划

> 关联规格: `doc/auditlog/stage2.5-followup-rootcause-2026-07-02.md` §问题2（根因权威）
> 计划日期: 2026-07-02
> 预计影响: `src/app/nana/knowledge-map/page.tsx`、`src/components/nana/knowledge-map/`（新增 1 组件）
> 性质：**单页面 UX 重构**（新增列表视图组件 + 顶部切换），非新功能、非数据变更

---

## 1. 大白话概述

现在手机上知识地图是一张 2460px 宽的大图（48 个节点铺 11 列），硬塞进 375px 的手机屏幕，整体被压缩到 0.14 倍——结果节点名变成 1.3px、节点圆变成 1.2px，肉眼完全看不见，也不能双指放大。这**不是把字号调大一点能解决的**，是"桌面级全景图塞手机"的架构问题。

这轮改成：**手机默认显示「按状态分组的知识点列表」**（用正常 14px 字号，像普通卡片一样可读），每项是"色点 + 节点名 + 状态标签"，点一下还是弹出原来的详情卡。原来的 SVG 全景图保留为「图谱模式」，用户可以在顶部用「列表 | 图谱」开关切过去看一眼全景；桌面/平板想看也可以切。数据接口完全不动，只换展示形态。

---

## 2. 任务分解

- [ ] **任务 A：新增 `KnowledgeMapListView` 组件**
  - 涉及文件：`src/components/nana/knowledge-map/knowledge-map-list-view.tsx`（新增）
  - 内容：按 4 组（已点亮 / 下一个 / 收过题 / 未探索）渲染卡片列表，每项 14px 字号、色点 + 全名 + chip + caseEvidenceCount 角标
  - 复用：直接吃 `KnowledgeNodeData[]` + `frontier[]` + `onNodeClick`，与现有 canvas 同一套数据契约

- [ ] **任务 B：`page.tsx` 加响应式切换 + 默认列表**
  - 涉及文件：`src/app/nana/knowledge-map/page.tsx`（修改）
  - 内容：
    - 顶部加 segmented control（「列表 | 图谱」），状态 `mode: 'list' | 'graph'`，默认 `'list'`
    - `mode==='list'` → 渲染 `<KnowledgeMapListView>`
    - `mode==='graph'` → 渲染现有 `<KnowledgeMapCanvas>`（不动）
    - 图例、顶栏、RecentCasesList、空状态、详情卡逻辑全部保留不动
  - 注：见 DP1/DP4 关于"桌面是否自动默认图谱"的取舍

- [ ] **任务 C：保留 `KnowledgeMapCanvas` 不动**
  - 涉及文件：无改动
  - 图谱模式直接复用现有 canvas（含琥珀环、三态、主线列布局）
  - 可选 stretch（v1 **不做**）：列表顶部加一个 SVG 缩略图概览（mini map）。延后理由见 DP1

- [ ] **任务 D：pinch-zoom/pan 评估**
  - 涉及文件：无
  - 结论：**v1 不做**（理由见 §5 风险 + DP2）。列表模式已从根本解决可读性，pinch 需新手势代码或引依赖，范围扩大且收益有限

- [ ] **任务 E：测试 + 375px 视口验证 + build**
  - 涉及文件：浏览器 DevTools 375px 视口截图
  - 内容：
    - `npm.cmd run build` 通过
    - 375px 视口下列表模式字号实测 ≥ 14px（DevTools 量像素）
    - 四组分组逻辑正确（已点亮/下一个/收过题/未探索互斥且并集 = 全部节点）
    - 三层语义色在列表 chip 上与图例一致
    - 点 stable/frontier 节点仍弹 `KnowledgeDetailCard`
    - 切换 toggle 双向工作
    - 空状态（isEmpty）在两种模式下都正确显示

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/nana/knowledge-map/knowledge-map-list-view.tsx` | 新增 | 列表视图组件，4 组分组卡片 |
| `src/app/nana/knowledge-map/page.tsx` | 修改 | 加 `mode` state + segmented control，条件渲染 list/graph |
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | **不动** | 图谱模式直接复用 |
| `src/components/nana/knowledge-map/knowledge-detail-card.tsx` | **不动** | 详情卡复用，不改 |
| `src/components/nana/knowledge-map/knowledge-map-layout.ts` | **不动** | 布局算法不动 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | **不动** | 顶部最近题目列表不动 |
| API / Prisma / 数据层 | **不动** | 零新接口，零 schema 变更 |

---

## 4. 验收标准

> 测试策略：本任务是纯展示层重构（分组 + 渲染），分组算法是唯一带逻辑的部分，建议提取为纯函数 + 单测；其余靠人工视口验收。

- [ ] **375px 视口可读**：列表模式节点名字号 ≥ 14px（DevTools 实测量像素，非 CSS 声明值）
- [ ] **三层语义色保留**（与现有图例 hex 一致）：
  - 已点亮 → 绿 `#6BBF8A`（可带发光）
  - 下一个 → 蓝 `#93B8D6`/`#5E86A8`
  - 未探索 → 灰 `#D9D1C3`
  - 收过题 → 琥珀 `#E8A33D`（列表里用 chip，不画环）
- [ ] **点节点仍弹详情卡**：点 stable / frontier 节点 → 弹现有 `KnowledgeDetailCard`（复用，行为与图谱模式一致）
- [ ] **切换 toggle 工作**：手机点"图谱"能看到 SVG 全景；桌面点"列表"能看列表；双向切换无残留状态
- [ ] **空状态正确**：`isEmpty`（litNodeCount<2 且 collectedNodeCount===0）时两种模式都显示"旅程从这一步开始"，不显示空的列表/图谱
- [ ] **分组互斥完备**：四组并集 = 全部 nodes，无节点遗漏或重复归类
- [ ] **措辞合规**（OPS §4）：用"已点亮/下一个/收过题/未探索"，禁用"已掌握/薄弱点/未掌握/错/失败"
- [ ] **build 通过**：`npm.cmd run build` 退出码 0
- [ ] **单测（建议）**：`groupNodesByStatus` 纯函数单测，覆盖 stable/frontier/collected/untested 四类边界

---

## 5. 风险与注意事项

1. **不改 `caseEvidenceCount`/琥珀环语义**：列表里收过题的节点用琥珀 chip 标记（替代 SVG 里的琥珀外环），但语义完全一致——`caseEvidenceCount > 0` 即"收过题"，与 `status` 正交。已点亮又收过题的节点 = 绿 chip + 琥珀小角标（additive，对应 SVG 里绿芯 + 琥珀环）。

2. **不改 map API / 数据源**：列表组件吃的数据和 canvas 一模一样（`nodes[]` + `learningFrontier[]`），只换展示。零新接口、零 schema 变更、零迁移。

3. **收过题节点点击行为**（需明确）：当前 `handleNodeClick` 对"非 stable 非 frontier"节点直接 return（不弹卡）。收过题组里的节点大多属于此类。v1 保持一致：收过题节点**仅展示，不可点开**（与图谱模式行为一致——SVG 里琥珀环节点点了也没反应）。如后续想让收过题节点也能看详情，是小改 `handleNodeClick`，不在本轮。

4. **`max-w-md` 容器真相**：`page.tsx:131` 用 `max-w-md`（448px 上限），意味着**即便在桌面浏览器，页面也是手机宽度居中**。所以"桌面用 SVG"在当前容器下其实也不可读（448px 仍 < 2460px）。v1 不动容器宽度（动它会影响 RecentCasesList、详情卡等所有子组件）。真正的"桌面宽屏 SVG"是 stretch 目标，不在本轮（见 DP4）。

5. **pinch-zoom 评估结论（v1 不做）**：列表模式已从根本上解决可读性——手机用户在列表里就能读到全名、看到状态，不需要放大图谱。若做 pinch-zoom/pan 需要引入手势库（如 `@use-gesture/react`）或手写 touch 事件 + 变换矩阵，范围扩大、测试面增加，而收益只对"非要看图谱模式"的少数场景有用。**结论：延后，等真有用户反馈"我想在手机上看图谱细节"再做。**

6. **图谱模式在手机仍不可读**：切到图谱模式后，SVG 仍是 `w-full` 整体缩放进 343px，字号还是 1.3px。这是**已知且可接受的**——图谱模式定位为"看一眼整体形状的概览"，不是手机上精读用的。精读走列表。（若以后要让图谱模式在手机可读，最低成本是去掉 `w-full`、让 SVG 按自然宽 2460px 渲染在 `overflow-auto` 容器里横向滚动——这是小改，可作为 v1.1，不在本轮。）

7. **空状态判定（isEmpty）两种模式都要正确**：`isEmpty` 逻辑（`litNodeCount<2 && collectedNodeCount===0`）在 page 层，与 mode 无关，天然对两种模式都生效。但实现时要确保 `mode==='list'` 时也走 `!isEmpty` 分支，不要因为加了 mode 判断漏掉空状态分支。

8. **上游冲突风险**：本计划只改 nana 自有文件（`src/app/nana/`、`src/components/nana/`），不碰 wrong-notebook 上游文件，无上游同步冲突。

---

## 6. 技术附录

### 6.1 `KnowledgeMapListView` 组件契约

```ts
// src/components/nana/knowledge-map/knowledge-map-list-view.tsx
import type { KnowledgeNodeData } from "./knowledge-map-canvas";

interface Props {
  nodes: KnowledgeNodeData[];
  frontier: string[];          // learningFrontier，nodeId 列表
  onNodeClick: (nodeId: string) => void;  // 复用 page 层 handleNodeClick
}

// 分组结果类型
type GroupKey = "lit" | "next" | "collected" | "untested";
interface Group {
  key: GroupKey;
  title: string;       // "已点亮" / "下一个" / "收过题" / "未探索"
  color: string;       // 主色 hex
  nodes: KnowledgeNodeData[];
}
```

**渲染规则**：
- 每组一个 section：组标题（"已点亮 (3)"）+ 节点卡片纵向列表
- 每个节点卡片一行：`[色点] [节点全名 14px] [状态 chip] [caseEvidenceCount 角标（>0 时）]`
- 色点 / chip 颜色严格对应图例 hex（见 §4）
- 点击行为：调用 `onNodeClick(nodeId)`，由 page 层 `handleNodeClick` 决定是否弹卡（与图谱模式同一入口，行为一致）
- "未探索"组默认折叠（可展开），避免长列表刷屏；其余三组默认展开

### 6.2 分组算法（纯函数，建议单测）

```ts
// 提取为独立纯函数，便于测试
export function groupNodesByStatus(
  nodes: KnowledgeNodeData[],
  frontier: string[]
): { lit: KnowledgeNodeData[]; next: KnowledgeNodeData[]; collected: KnowledgeNodeData[]; untested: KnowledgeNodeData[] } {
  const frontierSet = new Set(frontier);
  const lit: KnowledgeNodeData[] = [];
  const next: KnowledgeNodeData[] = [];
  const collected: KnowledgeNodeData[] = [];
  const untested: KnowledgeNodeData[] = [];

  for (const n of nodes) {
    const isStable = n.status === "stable";
    const isFrontier = frontierSet.has(n.nodeId);
    const hasEvidence = (n.caseEvidenceCount ?? 0) > 0;

    if (isStable) {
      lit.push(n);                    // 已点亮（含又收过题的，加琥珀角标）
    } else if (isFrontier) {
      next.push(n);                   // 下一个（含又收过题的，加琥珀角标）
    } else if (hasEvidence) {
      collected.push(n);             // 收过题但未点亮、非前沿
    } else {
      untested.push(n);              // 未探索
    }
  }
  return { lit, next, collected, untested };
}
```

**互斥完备性**：每个节点恰好落入一组（stable 优先 > frontier > collected > untested）。并集 = 全部 nodes。

**与 SVG 三态 + 琥珀环的对应**：
- SVG `stable + caseEvidenceCount>0`（绿芯+琥珀环）→ 列表 `lit` 组 + 琥珀角标 ✓
- SVG `frontier + caseEvidenceCount>0`（蓝虚线+琥珀环）→ 列表 `next` 组 + 琥珀角标 ✓
- SVG `unexplored + caseEvidenceCount>0`（灰芯+琥珀环）→ 列表 `collected` 组（琥珀 chip）✓
- SVG `unexplored + caseEvidenceCount===0`（灰芯）→ 列表 `untested` 组 ✓

### 6.3 响应式切换实现

```tsx
// page.tsx 内
const [mode, setMode] = useState<"list" | "graph">("list");  // 默认 list

// 顶部 segmented control（非空态、非加载时显示）
<div className="flex justify-center px-4 py-1">
  <div className="inline-flex rounded-full bg-[#EFE8DD] p-1 text-xs">
    <button
      onClick={() => setMode("list")}
      className={mode === "list" ? "rounded-full bg-white px-4 py-1 text-[#403A33]" : "px-4 py-1 text-[#8C857B]"}
    >列表</button>
    <button
      onClick={() => setMode("graph")}
      className={mode === "graph" ? "rounded-full bg-white px-4 py-1 text-[#403A33]" : "px-4 py-1 text-[#8C857B]"}
    >图谱</button>
  </div>
</div>

// 画布区条件渲染
{mode === "list" ? (
  <KnowledgeMapListView nodes={...} frontier={...} onNodeClick={handleNodeClick} />
) : (
  <div className="flex-1 overflow-auto px-2 pb-6">
    <KnowledgeMapCanvas ... />
  </div>
)}
```

**关于 `useMediaQuery`**：v1 不用。理由：页面容器是 `max-w-md`，所有视口下都是手机宽度，`md:` 断点检测无意义（检测到桌面宽屏，但页面还是 448px，SVG 还是不可读）。统一默认 list、靠 toggle 切换更简单、行为可预测。若将来放开容器宽度（DP4），再引入 `useMediaQuery` 做"桌面默认图谱"。

### 6.4 复用点（零重写）

| 复用对象 | 来源 | 说明 |
|----------|------|------|
| `KnowledgeNodeData` 类型 | `knowledge-map-canvas.tsx` | 列表组件直接 import，不重复定义 |
| `handleNodeClick` | `page.tsx:94` | 列表点击走同一入口，详情卡弹出逻辑零改动 |
| `KnowledgeDetailCard` | `knowledge-detail-card.tsx` | 详情卡完全复用，已支持 stable/frontier/unexplored 三态 |
| `isEmpty` 判定 | `page.tsx:65-71` | mode 无关，天然对两种模式生效 |
| 三色 hex 值 | canvas + 图例 | 列表 chip 严格沿用 `#6BBF8A`/`#93B8D6`/`#D9D1C3`/`#E8A33D` |

---

## 7. 决策点（需用户确认）

### DP1：手机默认模式 = 纯列表 vs 列表+顶部小缩略图概览？
- **选项 A**：纯列表（v1）
- **选项 B**：列表顶部加一个 SVG 缩略 mini-map 概览
- **推荐 A**：mini-map 又是一套缩放渲染逻辑，且小缩略图在 343px 宽下依然信息密度过高（48 节点挤一起），概览价值有限。列表本身的分组标题（"已点亮 3 / 下一个 1 / 收过题 5"）已经给了整体进度感。mini-map 作为 stretch 留 v1.1。

### DP2：pinch-zoom/pan 做 v1 还是延后？
- **推荐延后**：列表模式已从根本上解决可读性。pinch 需引依赖或手写手势，范围扩大、收益只针对"非要在手机看图谱细节"的少数场景。等真有用户反馈再做。

### DP3：切换 toggle 用什么形态？
- **推荐 segmented control**（「列表 | 图谱」胶囊二选一）：放在图例下方、画布上方，符合移动端常见模式，单手可点。不用下拉菜单（多一次点击）、不用底部 tab bar（页面已有顶栏返回，加 tab 过重）。

### DP4（追加）：是否放开 `max-w-md` 让桌面真正宽屏显示 SVG？
- **推荐 v1 不动**：放开容器宽度会连带影响 RecentCasesList、详情卡等所有子组件的布局，是更大的 UX 变更。且当前唯一真实用户（一位高中生）用手机。当前 app 就是手机壳形态。真要做"桌面宽屏体验"单独立项。v1 保持 max-w-md + 列表默认 + 图谱 opt-in。

---

## 范围确认（收口声明）

- ✅ **无 schema 变更**（不动 Prisma，不违反铁律 3）
- ✅ **无新 API**（复用 `GET /api/diagnosis/map`，数据契约不变）
- ✅ **复用 map API 数据 + 现有 `KnowledgeDetailCard`**（零重写详情卡）
- ✅ **只改 1 个页面 + 新增 1 个组件**（单页面 UX 重构）
- ✅ **三层语义色保留**（绿/蓝/琥珀/灰 hex 严格沿用）
- ✅ **措辞合规**（OPS §4：已点亮/下一个/收过题/未探索）
