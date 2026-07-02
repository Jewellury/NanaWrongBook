# 知识地图移动端重设计 · 执行日志

> 关联计划: doc/plan/knowledge-map-mobile-redesign-plan.md
> 开始时间: 2026-07-02 21:50
> 执行人: execute-agent

## 执行记录

### 任务 H：页面布局重构——地图优先、整屏画布（DP5）
- 做了什么:
  - `page.tsx`：重写 JSX 布局结构。图例+图谱/列表 toggle 合并为一行紧凑顶栏(~40px)。RecentCasesList 从上方常驻移除，改为浮层抽屉。图谱/列表内容区使用 `flex-1` 独占剩余空间(375px 下≥600px)。KnowledgeDetailCard 保持 absolute overlay。添加 `drawerOpen` 状态控制浮层。
  - `recent-cases-list.tsx`：新增 `open`/`onClose` prop。当提供时，渲染为 bottom sheet(~80%高度，backdrop overlay + 顶部 X 关闭)。内部列表+CaseTagPanel 逻辑零改动(仅包装抽屉容器)。非抽屉模式保留向后兼容。
  - `page.tsx`：图谱模式下左下角显示"最近拍过"浮动入口按钮(ListFilter图标)，点击打开抽屉。
- 涉及文件: `src/app/nana/knowledge-map/page.tsx`, `src/components/nana/knowledge-map/recent-cases-list.tsx`
- 结果: ✅ 完成

### 任务 A：手机专用图谱布局坐标配置
- 做了什么:
  - 创建 `mobile-layout-coords.ts`：定义 MOBILE_W=368, MOBILE_H=700, MOBILE_COORDS(48节点全量坐标), CLUSTER_LABELS(8个边缘簇标签), CLUSTER_DECORATIONS(24个边缘簇装饰灰点).
  - 坐标来源：设计稿 04-knowledge-map.html SVG 的精确坐标(15个显式命名节点) + 自排位置(其余33个节点按 M1/M2a/M0 主线归属分布).
  - 边缘簇装饰灰点：对齐设计稿 mockup 的 8 个边缘簇(平面向量/三角函数/导数/概率统计/立体几何/解析几何/数列/地基层)，每簇 2-3 个灰点.
  - `getMobileCoord()`: 安全取值，缺失时 console.warn + fallback 画布中心.
  - ⚠️ 顶部注释提醒：新增节点必须手工加坐标.
- 涉及文件: `src/components/nana/knowledge-map/mobile-layout-coords.ts` (新增)
- 结果: ✅ 完成

### 任务 B：canvas 手机布局分支
- 做了什么:
  - `knowledge-map-canvas.tsx`：新增 `variant`("mobile"/"desktop",默认"mobile") 和 `nextLabel`(默认"下一个") prop.
  - mobile 模式：使用 MOBILE_COORDS 固定坐标 + 固定 viewBox 0 0 368 700 + minHeight 600px.
  - 边渲染：mobile 下过滤 fallback 坐标的边(两端都必须在显式坐标中)，减少交叉噪声.
  - 灰底图：mobile 模式新增 `renderedBaseMap`——48个节点灰圆(r=6)+灰名(10px,#BDB3A3)铺底 + 边缘簇装饰灰点 + 簇标签.
  - 节点渲染逻辑(绿稳定/蓝前沿/灰未探索/琥珀环)ZERO 改动——仅换坐标源.
  - "下一个"标签文本改用 `nextLabel` prop(无计划化"下一个").
  - desktop 模式：保留原有 computeLayout 逻辑，不变.
- 涉及文件: `src/components/nana/knowledge-map/knowledge-map-canvas.tsx`
- 结果: ✅ 完成

### 任务 C："下一个" → "可以先看"动态措辞
- 做了什么:
  - `page.tsx`：计算 `nextLabel = stats.stable === 0 ? "可以先看" : "下一个"`，下传至 canvas/list-view/detail-card/legend 四处.
  - `knowledge-map-canvas.tsx`：前沿节点标签文本使用 `nextLabel` prop.
  - `knowledge-map-list-view.tsx`：接收 `nextLabel` prop，next 分组标题改用动态值.
  - `knowledge-detail-card.tsx`：前沿提示改为 `nextLabel: {node.name}`.
  - `page.tsx` legend：蓝色图例文本使用 `{nextLabel}` 替换硬编码"下一个".
- 涉及文件: `src/app/nana/knowledge-map/page.tsx`, 上述 3 个组件
- 结果: ✅ 完成

### 任务 D：底部详情卡 light restyle
- 做了什么:
  - 删除"关闭"按钮(点遮罩关闭，遮罩已存在).
  - 日期文案：从 "yyyy-MM-dd" 格式改为 "✦ 你是在 X月X日 点亮的"，颜色保持 #E5B570.
  - 前沿提示：接收 `nextLabel` prop，改为 "{nextLabel}：{node.name}".
  - 新增 `caseEvidenceCount` prop：>0 时显示"（收过 N 道错题）".
  - 移除未使用的 `format` import.
- 涉及文件: `src/components/nana/knowledge-map/knowledge-detail-card.tsx`
- 结果: ✅ 完成

### 任务 E：首页去重——RecapBar 改跳 session
- 做了什么:
  - `recap-bar.tsx` 两个分支(有点亮/只收过题)的 `href` 均改为 `/nana/session`.
  - 链接文案改为"去做小检查，点亮它们 →". 正文内容不变.
- 涉及文件: `src/components/nana/shared/recap-bar.tsx`
- 结果: ✅ 完成

### 任务 F：viewMode 默认值
- 做了什么:
  - `page.tsx`: `viewMode` 默认值从 `"list"` 改为 `"graph"`(DP2).
  - Segmented control "图谱 | 列表" 保留在图例行右侧，不额外占高.
  - 列表模式使用 flex-1 空间(与图谱同区).
- 涉及文件: `src/app/nana/knowledge-map/page.tsx`
- 结果: ✅ 完成

### 任务 G：375px 验证 + build
- 做了什么:
  - `npm.cmd run build` 通过(编译+TS+静态生成 56 页全过).
  - `DATABASE_URL=file:./data/test/test.db npx vitest run` — 12个测试文件 113个测试全部通过.
  - 375px DevTools 验证: **未执行** — 本地无 Playwright/浏览器自动化，需手动在 Chrome DevTools 375px 模式下验证:
    - 图谱可见高度 ≥ 600px
    - 节点名 ≥ 9.5px 真实像素
    - 灰底图 48 节点名可读
    - 四色语义(绿/蓝/琥珀/灰)正确
    - "可以先看"在零数据态出现
- 涉及文件: 无
- 结果: ⚠️ 部分完成(build通过+测试通过，375px 手动验证待用户执行)

## 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 边缘簇节点来自 M3/M4/M5/M6/M7/M8/M2b 主线 | 实际 seed 数据仅有 M0/M1/M2a 共 48 节点，边缘簇使用装饰性灰点(CLUSTER_DECORATIONS) + 簇标签(CLUSTER_LABELS)，无对应 DB 节点 | DB 中不存在 M3-M8 节点，纯视觉占位 | 否 |

## 上游文件修改

无。所有改动均在 `src/app/nana/`、`src/components/nana/`、`src/components/nana/shared/` (nana 自有文件)。

## 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| recent-cases-list.tsx extra closing brace | 移除了多余的 `}`，正确关闭 RecentCasesListInner 和 CaseTagPanel |
| vitest without DATABASE_URL → test guard rejected | 设置 `DATABASE_URL=file:./data/test/test.db` |
| 本地 Docker Desktop 不可用 | 测试容器本地未跑；门禁交由 GitHub Actions 执行 |

## 完成状态

- [x] 所有任务(H→A→B→C→D→E→F→G)完成
- [ ] 代码已提交（commit: 待提交）
- [x] 本地 `npm.cmd run build` 通过
- [x] 本地相关窄范围测试已运行：12 test files, 113 tests passed
- [ ] 测试容器门禁：本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行
- [ ] GitHub Actions 测试容器通过后，才允许部署
- [x] 确认测试在安全路径运行：test.db(`./data/test/test.db`)被更新，`./data/dev.db`未被触碰
- [ ] 可进入审计阶段(待 commit + 375px 手动验证)

## Schema/API 确认

- Prisma schema: 零变更
- 任何 API 端点: 零变更
- 数据迁移: 无
- 仅前端布局+措辞+交互变更
