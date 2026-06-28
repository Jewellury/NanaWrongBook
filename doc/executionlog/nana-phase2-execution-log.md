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
- [x] 代码已提交（commit: `待填写`）
- [x] `test:nana:unit` 20/20 + `test:nana:integration` 11/11 + `diagnosis-api` 17/17
- [x] `npm run build` exit code 0 ✅
- [ ] Docker 测试容器验证
- [ ] 可进入审计阶段
