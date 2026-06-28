# 第 2 阶段：知识地图 · 执行日志

> 关联计划: doc/plan/nana-phase2-execution-plan.md
> 开始时间: 2026-06-28 11:00

---

## Commit ①：扩展 map API + 知识地图页面框架

**开始时间**: 2026-06-28 11:00  
**完成时间**: 2026-06-28 12:00  
**Commit hash**: `fe79bd5`

### 执行记录

#### 任务 1：扩展 GET /api/diagnosis/map
- **做了什么**: states 查询追加 lastEvidence；nodes 查询追加 judgeCriteria/sampleItem/teachingNotes；新增 `prisma.knowledgeEdge.findMany()` 查全量边并支持 mainlineId 过滤（只返回两端均在 nodes 内的边）；新增 `prisma.mainline.findMany()` + nodeMainlines 组装 mainlines 响应。
- **涉及文件**: `src/app/api/diagnosis/map/route.ts`
- **结果**: ✅ 完成

#### 任务 2：创建知识地图页面框架
- **做了什么**: 新建 `"use client"` 页面，含顶栏（返回/标题/已点亮计数）、三态图例（已点亮/下一个/未探索）、SVG 画布容器、空状态检测（litNodeCount < 2 时显示"旅程从这一步开始" + 全灰底图 + 副标题）。
- **涉及文件**: `src/app/nana/knowledge-map/page.tsx`
- **结果**: ✅ 完成

#### 任务 3：前端 API 客户端
- **做了什么**: `nana-api-client.ts` 中 BASE 拆分为 `NANA_BASE` 和 `DIAGNOSIS_BASE`，追加 `getKnowledgeMap(studentId, mainlineId?)` 方法。
- **涉及文件**: `src/lib/nana/nana-api-client.ts`
- **结果**: ✅ 完成

#### 任务 4：更新集成测试
- **做了什么**: map 测试追加 edges/mainlines/judgeCriteria/sampleItem/lastEvidence 断言；新增 mainlineId 过滤测试（验证 edges 两端均在 nodes 集合内、mainlines 仅返回 M1）。
- **涉及文件**: `src/__tests__/integration/diagnosis-api.test.ts`
- **结果**: ✅ 完成（17/17 通过）

### 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | response nodes 不含 teachingNotes | 响应中包含了 teachingNotes | 详情卡在 Commit ② 需要此字段，提前包含避免后续改 API | 否 |

### 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `src/__tests__/integration/diagnosis-api.test.ts` | map 测试新增字段断言 + 新增 mainlineId 过滤测试 | 验证新功能 |
| `src/lib/nana/nana-api-client.ts` | BASE 拆分为 NANA_BASE 和 DIAGNOSIS_BASE，追加 getKnowledgeMap | 新增 API 客户端方法 |

### 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| 本地测试数据库未 seed 导致 nodes 为空 | `DATABASE_URL="file:./data/test/test.db" npx tsx prisma/seed_graph.ts` |
| WSL shell 不可用 | 使用 cmd /c 执行 npm 命令 |

### 完成状态

- [x] 所有任务完成
- [x] 代码已提交（commit: 待填写）
- [x] `test:nana:unit` 20/20 + `test:nana:integration` 11/11 + `diagnosis-api` 17/17
- [x] `npm run build` exit code 0 ✅
- [ ] Docker 测试容器验证
- [ ] 可进入审计阶段

---

## Commit ②：知识地图 SVG 可视化渲染

**开始时间**: 2026-06-28 13:00  
**完成时间**: 2026-06-28 13:30  
**Commit hash**: `cfc60de`

### 执行记录

#### 任务 1：KnowledgeMapCanvas — SVG 画布组件
- **做了什么**: 创建 `knowledge-map-canvas.tsx`，实现主线列布局算法（10 列映射）、三态节点渲染（稳定绿发光/前沿蓝虚线/未探索灰）、边渲染（两端 stable → 绿色 `#9CCBA6`，前沿入边 → 蓝色虚线 `#9FC3DE`，其他 → 灰色 `#E7DFD0`），SVG glow filter 光晕效果。
- **涉及文件**: `src/components/nana/knowledge-map/knowledge-map-canvas.tsx`, `src/components/nana/knowledge-map/knowledge-map-layout.ts`
- **结果**: ✅ 完成

#### 任务 2：KnowledgeDetailCard — 节点详情卡组件
- **做了什么**: 创建 `knowledge-detail-card.tsx`，底部弹出卡片（grip 拖动条 + 节点名称/状态圆点 + 描述截取 60 字 + 判定标准 + 例题 + "最近一次确认是在..."日期 + 前沿提示"下一个要攻克的知识点"/ 未探索提示"还没走到这里"）。不显示 masteryProb 百分比（P4）。
- **涉及文件**: `src/components/nana/knowledge-map/knowledge-detail-card.tsx`
- **结果**: ✅ 完成

#### 任务 3：页面集成 — page.tsx 修改
- **做了什么**: 添加 selectedNode 状态管理 + handleNodeClick 逻辑（未探索节点静默忽略）+ 集成 KnowledgeMapCanvas（传递 nodes/edges/mainlines/frontier/onNodeClick）+ 集成 KnowledgeDetailCard（selectedDetail 条件渲染 + onClose 清空选中状态）。
- **涉及文件**: `src/app/nana/knowledge-map/page.tsx`
- **结果**: ✅ 完成

#### 任务 4：布局算法单元测试
- **做了什么**: 提取 `computeLayout` 纯函数到 `knowledge-map-layout.ts`，编写 9 个测试（空数据/单节点/多节点垂直/多列/节点顺序/其他列/多主线归属/主线名称/列号排序验证）。
- **涉及文件**: `src/__tests__/unit/nana/knowledge-map-layout.test.ts`
- **结果**: ✅ 完成（29/29 全部通过）

### 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 计划中 `knowledge-node.tsx` 为独立组件 | 节点渲染内联在 canvas 中 | 节点是纯 SVG `<g>` 组合，无独立状态/逻辑，分离反而增加 props 传递复杂度 | 否 |
| 2 | 布局算法内联在 canvas 中 | 提取为独立 `knowledge-map-layout.ts` 纯函数模块 | 方便单元测试，符合项目已有模式（纯函数可测） | 否 |

### 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `src/app/nana/knowledge-map/page.tsx` | 导入 KnowledgeMapCanvas + KnowledgeDetailCard，添加 selectedNode 状态，替换占位 SVG | Commit ② 集成交互 |

### 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| 无 | — |

### P4 措辞自查

| 位置 | 使用的措辞 | 合规？ |
|------|-----------|:----:|
| 图例 | "已点亮" / "下一个" / "未探索" | ✅ |
| 详情卡 | "最近一次确认是在..." + 无 masteryProb | ✅ |
| 空状态（继承 Commit ①） | "旅程从这一步开始" + "点亮一道题，灰色地图就会染上一块绿 ✦" | ✅ |
| 前沿 | "下一个要攻克的知识点" | ✅ |
| 标题 | "你已经点亮了 N 个光点 ✦" | ✅ |
| 禁用词 | 无"掌握概率"、"未掌握"、"薄弱点"、"正确率" | ✅ |

### 完成状态

- [x] 所有任务完成
- [x] `test:nana:unit` 29/29 通过（含 9 个新增知识地图布局测试）
- [x] `npm run build` exit code 0 ✅
- [x] P4 措辞全部合规
- [x] 代码已提交（commit: `cfc60de`），已推送 `origin dev`
- [ ] Docker 测试容器验证
- [ ] 可进入审计阶段
