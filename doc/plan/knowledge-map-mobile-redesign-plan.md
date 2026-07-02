# 知识地图 · 移动端重设计（对齐设计稿）· 开发计划

> 关联规格: `doc/research/前端设计/04-knowledge-map.html`（设计稿权威）、`doc/plan/knowledge-map-mobile-dualmode-plan.md`（上一轮，本轮修正其方向）
> 计划日期: 2026-07-02（**修订 v2：纳入 DP5 页面布局重构**）
> 预计影响: `src/components/nana/knowledge-map/`（新增 1 配置 + 改 4 组件含浮层化）、`src/app/nana/knowledge-map/page.tsx`（**重写布局**）、`src/components/nana/shared/recap-bar.tsx`
> 性质：**纯前端布局 + 措辞重构 + 浮层交互**。无 schema 变更、无 API 变更、无数据迁移。

---

## 1. 大白话概述

现在知识地图的图谱模式是一张 2460px 宽的大图（10 列 × 220px），硬塞进 375px 手机屏幕后被压到 0.15 倍，节点名变成 1.3px 的蚂蚁字、完全看不见；手机上只能用列表模式凑合。这轮要把它改回设计稿（`04-knowledge-map.html`）里的样子：**画布本身就是手机宽度（368px），48 个节点用手工排好的坐标铺满一屏，1:1 真实大小渲染**——灰色底图节点名永远淡淡可见，走过的染绿、邀请你的画蓝圈、收过题的套琥珀环，字都是 9.5~11px 真实像素、看得清。

同时修三个小问题：①还没测过的孩子看到"下一个"语义不对（你啥都没点亮，哪来的"下一个"），改成"可以先看"；②首页底部提示条和行动卡片重复跳知识地图，提示条改成跳去做小检查；③图谱模式做成手机默认（列表降级成无障碍备选）。

**为什么做**：列表模式（上一轮的方案）解决了可读性，但丢了"地图感"——设计稿的核心卖点是"整张地图一直在，你走过的地方亮起来"，列表给不了这个情绪。对齐设计稿 = 把图谱本身做成手机可读，让那个"点亮地图"的体验真正成立。

---

## 2. 当前问题盘点

| # | 问题 | 现状证据 |
|---|------|----------|
| P1 | 图谱画布 2460px → 375px 缩成蚂蚁字 | `knowledge-map-layout.ts`: COL_TOTAL=220 × 10 列 = 2200px+；canvas `viewBox` 按列宽动态算，`w-full` 整体缩进 343px → 字号 9.5px × 0.15 ≈ 1.4px |
| P2 | 灰色底图节点名不可读 | canvas 对 unexplored 节点**有**画灰名（`#BDB3A3` 9.5px），但缩到 1.4px 等于没有；设计稿里灰名是 10px 真实像素、淡淡可读 |
| P3 | "下一个"在零数据时语义错 | `route.ts`: 无 StudentNodeState 时，根节点 prereqs 为空 → `every()` 返回 true → 进 frontier；page 显示"下一个"，但孩子一个都没点亮，叫"下一个"暗示已有进度 |
| P4 | 首页 RecapBar 与 ActionCard 重复跳知识地图 | `recap-bar.tsx`: 两个分支都 `href="/nana/knowledge-map"`；`page.tsx` ActionCard 第二张也是 `/nana/knowledge-map` → 同一页两个入口 |
| P5 | 图谱模式在手机被降级为 opt-in | `page.tsx:64`: `viewMode` 默认 `"list"`；图谱成了"切过去看一眼"的次要模式，与设计稿"图谱即体验"的定位相反 |

---

## 3. 目标效果对照（设计稿 vs 当前实现 vs 目标）

| 设计稿特征 (`04-knowledge-map.html`) | 当前实现 | 本轮目标 |
|---------------------------------------|----------|----------|
| SVG `viewBox="0 0 368 684"`，画布=手机宽，1:1 渲染 | viewBox 动态算≈2460×N，`w-full` 缩放 | ✅ viewBox 固定 `0 0 368 ~700`，1:1 |
| 节点手工坐标，主线路径居中流下、远期主线聚在边缘 | 自动列布局，10 列等宽 | ✅ 手工坐标配置文件，河道+边缘簇 |
| 灰底图：48 节点全画，灰名 10px `#BDB3A3` 淡淡可读 | 灰名 9.5px 但缩到 1.4px | ✅ 1:1 下 10px 原生可读 |
| 绿点亮：外光晕 + 实心圆 + 白高光环 | ✅ 已有（`#6BBF8A` + glow filter） | ✅ 保留，1:1 比例 |
| 蓝虚线"下一个"圈 + 标签 | ✅ 已有（`#93B8D6` dashed） | ✅ 保留 + 措辞动态切换 |
| 琥珀"收过题"外环 | ✅ 已有（additive 环 `#E8A33D`） | ✅ 保留（设计稿里没有，本轮补上） |
| 底部弹出卡 `kcard`：grip + 名 + 描述 + 判定标准 + 例题 + 点亮日期 | ✅ 结构已有（`knowledge-detail-card.tsx`） | ✅ 措辞微调 + 去掉底部"关闭"按钮（点遮罩关） |
| 空状态：首节点绿 + "旅程从这一步开始" | ✅ 已有 | ✅ 保留，蓝色标签改"可以先看" |
| **无 pinch-zoom**（靠画布本身手机尺寸） | 不可读所以曾考虑 pinch | ✅ 不做 pinch，靠 1:1 画布 |

---

## 4. 任务分解

> **任务 H（DP5）是本轮最关键的结构性改动**——当前页面 `RecentCasesList` 常驻图谱上方占掉半屏，与设计稿"整屏地图"预期严重不符。H 必须先于其他任务落地（否则图谱再好看也只有半屏空间）。

- [ ] **任务 H：页面布局重构——地图优先、整屏画布（DP5 · 评审追加 · 最关键）**
  - 涉及文件：`src/app/nana/knowledge-map/page.tsx`（**重写布局结构**）、`src/components/nana/knowledge-map/recent-cases-list.tsx`（**改为浮层入口**）
  - 当前问题：`page.tsx:155` 的 `<RecentCasesList>` 常驻图谱**上方**，列表本身 ~100px + 点开 CaseTagPanel 后展开到 ~400px，把图谱挤到下半屏甚至折叠。与设计稿 `04-knowledge-map.html` 的整屏图谱（canvas 占 684px / 798px 屏高 = 86%）完全不符。
  - 改动：
    1. **图谱区域独占主屏**：`flex-1` 给图谱画布，顶栏（返回 + 标题 + 光点数）保持精简（~50px），图例可叠在图谱底部或合并进图谱区。图谱在 375px 手机上应有 ≥ 600px 可用高度。
    2. **RecentCasesList 不再常驻上方**：改成**浮层入口**——图谱角落放一个小入口（如左下角"最近拍过"圆形按钮 / 底部 pill"收过 N 道"），点击后以**底部抽屉（bottom sheet）**或**全屏浮层**展开列表 + CaseTagPanel。关闭回到图谱。
    3. **CaseTagPanel（含题图预览）只能从浮层打开**，不挤压地图画布。题图懒加载逻辑（Stage 2.5 hotfix）不变。
    4. **节点详情卡（KnowledgeDetailCard）继续用底部卡片**，以 overlay 浮在图谱上方（设计稿的 `kcard` 就是 absolute 定位底部），不挤压画布。点遮罩关闭。
  - 验收硬标准：**375px 视口下图谱可见高度 ≥ 600px**（当前被压缩到 < 300px）

- [ ] **任务 A：手机专用图谱布局配置（Challenge A）**
  - 涉及文件：`src/components/nana/knowledge-map/mobile-layout-coords.ts`（**新增**）
  - 内容：定义 48 节点的手工 `{x, y}` 坐标，画布尺寸常量 `MOBILE_W=368` / `MOBILE_H≈700`。坐标按设计稿"河道+边缘簇"哲学排布（见 §8.1 区域分配）
  - 决策：选 **Option A 手工坐标**（DP1）。48 节点是稳定种子数据，极少变动；自动布局无法复现设计稿的有机形态

- [ ] **任务 B：canvas 支持手机布局分支（Challenge A/B/C）**
  - 涉及文件：`src/components/nana/knowledge-map/knowledge-map-canvas.tsx`（**修改**）
  - 内容：
    - 新增 `variant: "desktop" | "mobile"` prop（默认 mobile）
    - `variant==="mobile"` → 用 `mobile-layout-coords.ts` 的固定坐标 + 固定 viewBox `0 0 368 700`；不再调 `computeLayout`
    - 节点渲染逻辑（绿/蓝/灰三态 + 琥珀 additive 环）**全部保留不动**，只是位置源换了 → Challenge C 自然继承
    - 灰底图节点名在 1:1 下天然 10px 可读 → Challenge B 自然解决
    - 边渲染：mobile 下用坐标配置里的边或沿用 edges 数据按新坐标重画连线

- [ ] **任务 C："下一个"→"可以先看"动态措辞（Challenge D）**
  - 涉及文件：`knowledge-map-canvas.tsx`、`knowledge-map-list-view.tsx`、`knowledge-detail-card.tsx`、`page.tsx`（**均小改**）
  - 内容：page 层算出 `nextLabel = stats.stable === 0 ? "可以先看" : "下一个"`，下传给 canvas / list / detail card / legend 四处。同一份 frontier 数据，只换标签词
  - 不改 API（`learningFrontier` 算法不变，只换前台措辞）

- [ ] **任务 D：底部详情卡 restyle（Challenge E）**
  - 涉及文件：`src/components/nana/knowledge-map/knowledge-detail-card.tsx`（**小改**）
  - 内容：对齐 `kcard` 样式——①去掉底部"关闭"按钮（点遮罩关闭，设计稿无此按钮）；②前沿提示文案接收动态 `nextLabel`；③日期文案对齐设计稿"✦ 你是在 X 月 X 日点亮的"（已是琥珀色，措辞微调）。结构骨架（grip/名/描述/判定标准/例题/日期）已基本到位，只做轻量收口

- [ ] **任务 E：首页去重（Goal 5）**
  - 涉及文件：`src/components/nana/shared/recap-bar.tsx`（**修改**）
  - 内容：两个分支的 `href` 从 `/nana/knowledge-map` 改为 `/nana/session`，文案改"去做小检查，点亮它们 →"。ActionCard "看看知识地图"保留为唯一知识地图入口

- [ ] **任务 F：列表/图谱模式定位（Goal 6）**
  - 涉及文件：`src/app/nana/knowledge-map/page.tsx`（**修改**）
  - 内容：`viewMode` 默认从 `"list"` 改为 `"graph"`；segmented control 保留（图谱 \| 列表），列表降级为无障碍/屏幕阅读器备选。列表组件本身不动。**注意：任务 H 的布局重构后，toggle 也在图谱主屏内（如顶栏角落），不额外占高**

- [ ] **任务 G：375px 视口验证 + build（Goal 7）**
  - 涉及文件：无（浏览器 DevTools 验证）
  - 内容：375px 下截图，量节点名真实像素 ≥ 9.5px；灰底图名可读；四色语义在；"可以先看"在零数据态出现；**图谱可见高度 ≥ 600px（DP5 验收）**；`npm.cmd run build` 退出码 0

---

## 5. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/nana/knowledge-map/mobile-layout-coords.ts` | **新增** | 48 节点手工坐标 + 画布尺寸常量 |
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | 修改 | 加 `variant` prop，mobile 分支用固定坐标 + viewBox + 动态 nextLabel |
| `src/components/nana/knowledge-map/knowledge-map-list-view.tsx` | 修改 | "下一个"组标题接收动态 `nextLabel` prop |
| `src/components/nana/knowledge-map/knowledge-detail-card.tsx` | 修改 | 去关闭按钮 + 动态 nextLabel + 日期措辞 |
| `src/app/nana/knowledge-map/page.tsx` | **重写布局** | **DP5：图谱独占主屏(flex-1)；RecentCasesList 改浮层入口；viewMode 默认 graph；nextLabel 下传；legend 动态标签** |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | **DP5：不再常驻上方；改为浮层/抽屉形态（接收 open/onClose 控制）；内部 CaseTagPanel 逻辑不变** |
| `src/components/nana/shared/recap-bar.tsx` | 修改 | href 改 `/nana/session`，文案改"去做小检查" |
| `src/components/nana/knowledge-map/knowledge-map-layout.ts` | **不动** | desktop 分支仍用，保留 |
| `src/app/api/diagnosis/map/route.ts` | **不动** | 零 API 变更 |
| Prisma schema / 数据层 | **不动** | 零 schema 变更（铁律 3） |

---

## 6. 验收标准

> 测试策略：纯展示层 + 配置数据，无状态机/图遍历逻辑。靠人工 375px 视口验收 + build。坐标配置可加一个"全部 48 节点都有坐标、无遗漏"的完整性校验（可选单测）。

- [ ] **图谱独占主屏（DP5 核心验收）**：375px 视口下图谱可见高度 ≥ 600px；RecentCasesList 不常驻上方，改成浮层入口（角落小按钮或 pill），点击才展开
- [ ] **375px 图谱节点名 1:1 可读**：DevTools 量像素，绿/蓝节点名 ≥ 9.5px 真实像素（非 CSS 声明值）
- [ ] **灰底图 48 节点名可见**：未探索节点灰名 10px `#BDB3A3`，淡淡但肉眼可读
- [ ] **四色语义保留**：绿 `#6BBF8A`（点亮）/ 蓝 `#93B8D6`（下一个或可以先看）/ 琥珀 `#E8A33D`（收过题外环）/ 灰 `#D9D1C3`（底图）
- [ ] **"可以先看"在零数据态生效**：无 stable 节点时，canvas 蓝标签、list 组标题、detail card 提示、legend 四处都显示"可以先看"；有 stable 后恢复"下一个"
- [ ] **琥珀环 additive 正确**：收过题的节点无论绿芯/蓝圈/灰芯都套琥珀外环（1:1 下清晰）
- [ ] **题图预览只在浮层里**：点错题打开浮层才拉题图，不挤压地图画布（Stage 2.5 hotfix 的懒加载 + 缓存逻辑不变）
- [ ] **节点详情底部卡片不挤压画布**：KnowledgeDetailCard 以 overlay 浮在图谱上方（absolute 底部），点遮罩关闭
- [ ] **首页无重复入口**：RecapBar 跳 `/nana/session`，ActionCard 是唯一 `/nana/knowledge-map` 入口
- [ ] **图谱是手机默认**：进 `/nana/knowledge-map` 默认看到图谱（不是列表）
- [ ] **列表 toggle 仍可用**：切到列表，四组分组 + 点亮详情卡行为不变
- [ ] **措辞合规**（OPS §4）：用"已点亮/下一个/可以先看/收过题/未探索"，禁用"掌握/薄弱/诊断/得分/失败"
- [ ] **build 通过**：`npm.cmd run build` 退出码 0

---

## 7. 风险与注意事项

1. **手工坐标维护成本**（首要风险）：48 节点坐标是手工写的，以后新增节点必须手动加坐标，否则该节点在 mobile 画布上不显示。**缓解**：mobile-layout-coords.ts 顶部加注释提醒；坐标缺失时 fallback 到一个默认位置（如画布中心）并 console.warn，而不是静默消失。

2. **48 节点在 368×700 密集度**：设计稿里远期主线（平面向量/三角函数/导数等）是 3 个一簇的小圆点挤在边缘，密集但可接受。48 个全铺开，中间河道区可能挤。**缓解**：河道区只放当前活跃主线（M1/M2a），其余主线缩成边缘簇（每簇 2-3 点 + 一个簇标签），不逐个展开。

3. **底图文字重叠**：密集簇里灰名可能叠。**缓解**：远期簇只标簇名（如"平面向量"），不标每个节点名；只有河道区逐个标名。设计稿就是这么做的（边缘只标 8 个簇名，不标每个点）。

4. **不同手机宽度**（375 vs 390 vs 414）：viewBox 固定 368，SVG `width:100%` 会按视口等比拉伸，375→368 几乎无感，414→368 放大约 1.13 倍（字 10→11.3px，反而更可读）。**结论**：无需为不同宽度做适配，1:1 在主流宽度下都成立。

5. **边连线在新坐标下的走线**：自动布局用贝塞尔曲线连列内节点；手工坐标下边可能交叉乱窜。**缓解**：mobile 模式只画"河道区"的连线（活跃主线内部），远期簇之间不画连线（设计稿里远期簇也是散点无连线），减少视觉噪声。

6. **上一轮 dualmode 计划的关系**：上一轮（`knowledge-map-mobile-dualmode-plan.md`）做了列表模式当默认。本轮**不删除列表**（保留为 toggle），只把默认翻回图谱 + 让图谱本身可读。列表组件零改动，降级为无障碍备选。

7. **上游冲突**：全部改动在 `src/app/nana/`、`src/components/nana/`（nana 自有文件），不碰 wrong-notebook 上游文件，无同步冲突。

---

## 8. 技术附录

### 8.1 坐标配置数据结构 + 区域分配

```ts
// src/components/nana/knowledge-map/mobile-layout-coords.ts

// 画布尺寸（对齐设计稿 viewBox="0 0 368 684"，给底部留一点 → 700）
export const MOBILE_W = 368;
export const MOBILE_H = 700;

// 节点坐标：nodeId → {x, y}（368×700 坐标系内）
export const MOBILE_COORDS: Record<string, { x: number; y: number }> = {
  // === 河道区（居中流下，活跃主线，逐个标名）===
  // M1 集合（左上起点，y≈85-260）
  "BG101": { x: 52, y: 95 },   // 元素与数集关系（入口）
  "BG102": { x: 118, y: 88 },  // 列举法
  // ... M1 其余节点
  // M2a 函数基础（中部，y≈300-470）
  "BG104": { x: 150, y: 318 }, // 定义域优先
  // ... M2a 其余节点

  // === 边缘簇（远期主线，每簇只标簇名不标节点名）===
  // 右上簇：平面向量（x≈310-336, y≈86-106）
  // 右中簇：三角函数（x≈318-334, y≈212-236）
  // 右下簇：导数（x≈330-344, y≈352-374）
  // 左下簇：概率统计（x≈44-62, y≈412-430）
  // 左中下簇：立体几何（x≈42-56, y≈294-314）
  // 左中簇：解析几何（x≈44-58, y≈244-264）
  // 底部簇：数列/地基层（x≈172-238, y≈436-452）
};

// 簇标签（边缘远期主线的集体名称，替代逐个节点名）
export const CLUSTER_LABELS: Array<{ name: string; x: number; y: number }> = [
  { name: "平面向量", x: 318, y: 124 },
  { name: "三角函数", x: 328, y: 254 },
  { name: "导数",     x: 338, y: 392 },
  { name: "概率统计", x: 56,  y: 448 },
  { name: "立体几何", x: 48,  y: 332 },
  { name: "解析几何", x: 50,  y: 282 },
  { name: "数列",     x: 180, y: 470 },
  { name: "地基层",   x: 228, y: 468 },
];
```

**区域分配哲学**（设计稿的空间逻辑）：
- **河道区**（x:30-280, y:80-470）：当前活跃主线（集合→函数）逐个节点铺开、逐个标名，连线相连。这是用户"走过的路"
- **边缘簇**（画布四边）：尚未涉足的远期主线，每条缩成 2-3 个小灰点 + 一个簇标签，不标节点名、不画连线。这是"远方还在等的地图"
- 新增节点 → 按其主线归属，加到对应区域；远期主线新节点加到对应簇

**execute-agent 注意**：上表坐标是设计稿里**已命名节点**的位置（约 15 个河道节点 + 8 个簇）。完整 48 节点的坐标需 execute-agent 查询 DB 的 KnowledgeNode 列表，按主线归属填入对应区域。缺失坐标的节点 fallback 到 `{x: MOBILE_W/2, y: MOBILE_H/2}` + console.warn。

### 8.2 "可以先看 / 下一个" 切换逻辑

```ts
// page.tsx 内
const nextLabel: "可以先看" | "下一个" =
  mapData && mapData.stats.stable === 0 ? "可以先看" : "下一个";

// 下传给三个子组件 + legend
<KnowledgeMapCanvas variant="mobile" nextLabel={nextLabel} ... />
<KnowledgeMapListView nextLabel={nextLabel} ... />
<KnowledgeDetailCard nextLabel={nextLabel} ... />
// legend 文案也用 nextLabel
```

**四个触点**（都要改）：
1. `knowledge-map-canvas.tsx`：蓝虚线圈上方的标签文本（当前硬编码 `"下一个"`，line 251）→ `{nextLabel}`
2. `knowledge-map-list-view.tsx`：SECTIONS 数组里 `next` 组的 `title`（当前硬编码 `"下一个"`）→ 动态 `{nextLabel}`
3. `knowledge-detail-card.tsx`：前沿提示 `"下一个要攻克的知识点"`（line 93）→ `` `${nextLabel}要攻克的知识点` `` 或分支措辞
4. `page.tsx` legend：`下一个`（line 170）→ `{nextLabel}`

### 8.3 canvas mobile 分支契约

```tsx
// knowledge-map-canvas.tsx 新增 prop
interface Props {
  // ...existing
  variant?: "desktop" | "mobile";  // 默认 "mobile"
  nextLabel?: "下一个" | "可以先看"; // 默认 "下一个"
}

// 内部布局源切换
const positions = variant === "mobile"
  ? MOBILE_COORDS                          // 固定坐标
  : computeLayout(nodes, mainlines).positions;  // 自动列布局

const { width, height } = variant === "mobile"
  ? { width: MOBILE_W, height: MOBILE_H }      // 固定 368×700
  : { width: svgWidth, height: svgHeight };     // 动态算

// viewBox 固定（mobile）或动态（desktop）
<svg viewBox={`0 0 ${width} ${height}`} ... />
```

**边渲染（mobile）**：只画两端坐标都在河道区的边；两端任一在边缘簇的边跳过（减少噪声，对齐设计稿）。

**灰底图渲染（mobile）**：所有非 stable 非 frontier 节点画灰圆 `r=6` + 若在河道区画灰名 10px、若在边缘簇只画点不画名（簇名由 CLUSTER_LABELS 单独渲染）。

### 8.4 详情卡 restyle 契约

对齐 `04-knowledge-map.html` 的 `.kcard`：

| 设计稿 kcard | 当前 detail card | 改动 |
|--------------|------------------|------|
| grip handle ✅ | ✅ 已有（line 74） | 不动 |
| 节点名 + 状态圆点 ✅ | ✅ 已有 | 不动 |
| 描述（teachingNotes 截断） | ✅ 已有（截 60 字） | 不动 |
| 分隔线 | ✅ 已有 | 不动 |
| 判定标准 / 例题 行 ✅ | ✅ 已有 | 不动 |
| "✦ 你是在 X 月 X 日点亮的"（琥珀） | "✦ 最近一次确认是在 ..."（琥珀） | 措辞微调对齐设计稿 |
| 无关闭按钮（点遮罩关） | 有"关闭"按钮（line 136-140） | **删除**按钮，遮罩 onClick 已有 |
| 前沿提示"下一个要攻克" | 同 | 接收动态 nextLabel |

### 8.5 RecapBar 改动

```tsx
// recap-bar.tsx 两个分支的 Link
// 改前：href="/nana/knowledge-map"  文案"看看我的知识地图 →"
// 改后：href="/nana/session"        文案"去做小检查，点亮它们 →"
```

分支一（有点亮）：正文保留"上次你点亮了 X / 已有 N 个光点"，CTA 改 `/nana/session`（去做检查点亮更多）。
分支二（只收过题）：正文保留"收过题 N 个 / 做完就能点亮"，CTA 本就是行动导向，href 改 `/nana/session`。

---

## 9. 决策点（需用户确认）

### DP1：布局方案 — 手工坐标 vs 紧凑自动 vs 混合？
- **选项 A**：手工坐标配置（48 节点逐个写 x,y）
- **选项 B**：紧凑自动布局（把 COL_WIDTH/GAP 调到极小）
- **选项 C**：混合（自动排结构 + 手机调参）
- **推荐 A**：设计稿本身就是手工坐标（这是它的核心特征，Goal 1 要"对齐"）；48 节点是稳定种子数据；自动布局无法复现"河道+边缘簇"的有机形态。代价是新增节点要手动加坐标（§7 风险 1 已缓解）。

### DP2：列表模式去留？
- **选项 A**：完全移除列表
- **选项 B**：保留为 toggle，图谱做手机默认
- **推荐 B**：列表对屏幕阅读器/无障碍有价值；保留为 opt-in 不增加复杂度（组件零改动）；图谱做默认满足 Goal 6。

### DP3：RecapBar 改法？
- **选项 A**：纯提示，去掉所有链接
- **选项 B**：链接改 `/nana/session`
- **推荐 B**：保留行动力（"去做小检查，点亮它们"是有方向的引导），且消除与 ActionCard 的重复（Goal 5）。

### DP4：底部详情卡 — restyle vs 保持现状？
- **选项 A**：完整重写匹配 kcard
- **选项 B**：保持现状
- **推荐**：**轻量 restyle**（介于 A/B 之间）。当前卡片结构已 90% 对齐设计稿，只需删关闭按钮 + 日期措辞微调 + 接动态 nextLabel。不值得重写。

### DP5（评审追加）：移动端知识地图页面布局 — 地图优先整屏 vs 当前结构？
- **选项 A**：**地图优先、整屏画布**。RecentCasesList 改浮层入口（角落小按钮 / 底部 pill），点击以底部抽屉展开。图谱独占主屏（flex-1），375px 下可见高度 ≥ 600px。CaseTagPanel（含题图预览）只在浮层里。KnowledgeDetailCard 以 overlay 浮在图谱底部。
- **选项 B**：保持当前结构（RecentCasesList 常驻上方）
- **推荐 A**（评审已拍板）：当前 `page.tsx:155` 的 RecentCasesList 常驻上方占掉半屏，与设计稿整屏图谱严重不符。这是"图谱不可用"的**结构性根因**（比字号更根本——字号修好了也只有半屏空间）。DP5 是本轮最关键改动，任务 H 必须先于其他任务落地。
- **具体要求**（评审 7 条）：
  1. 手机进入 `/nana/knowledge-map` 第一视觉是图谱本身（接近设计稿整屏体验）
  2. RecentCasesList 保留但不常驻上方
  3. 题图预览只在点开某题后以底部抽屉/浮层展示
  4. 节点详情继续用底部卡片（overlay），不挤压画布
  5. 图谱模式是主体验，列表是 toggle 备选
  6. 375px 验收时地图有完整可用区域（≥600px 高），不能只剩半屏
  7. 不改 schema/API，只调整前端布局和交互

---

## 范围确认（收口声明）

- ✅ **无 schema 变更**（不动 Prisma，不违反铁律 3）
- ✅ **无 API 变更**（复用 `GET /api/diagnosis/map`，`learningFrontier` 算法不动，只换前台措辞）
- ✅ **纯前端**（布局配置 + 渲染分支 + 措辞 + 链接）
- ✅ **不碰上游文件**（全部在 `src/app/nana/`、`src/components/nana/`）
- ✅ **四色语义保留**（绿/蓝/琥珀/灰 hex 严格沿用）
- ✅ **措辞合规**（OPS §4：已点亮/下一个/可以先看/收过题/未探索）
