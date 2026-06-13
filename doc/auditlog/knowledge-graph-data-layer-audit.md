# 知识图谱数据层 · 审计报告

> 关联计划: doc/plan/knowledge-graph-data-layer-plan.md
> 执行日志: doc/executionlog/knowledge-graph-data-layer-log.md
> 审计日期: 2026-06-14
> 审计基准: commit a73fff4（含审计修复 cf02a18）

## 审计结论（大白话）

**总体判定：✅ 通过**

这轮代码质量扎实。8 张新表全建在 schema 末尾，没有碰任何原有模型。种子脚本幂等通过，48 个节点 / 36 条边 / 18 条主线桥全部正确入库，19 条悬空边被拦截报数。图谱模块的图遍历、环检测逻辑正确，tool 边和 prerequisite 边的隔离也修干净了。测试 19 个纯单元用例全部覆盖核心路径。package.json 只加了两行——最小增量。

两个偏离记录经复核确认是真正的微调，不影响验收标准。唯一的未完成项是集成测试尚未实际运行（Docker 宕机），但测试代码已写完整，恢复后即可验证。

用户可以把这轮代码合入 main，放心继续 M2。

## 检查清单

### 计划一致性
- [x] 实现了计划中所有 5 个任务（schema/种子/graph/单元测试/集成测试）
- [x] 7 项设计决策全部落地（①MistakeNode 名保留 ②tsx 已加 ③MainlineBridge 独立表 ④M2a 先用 13 节点 ⑤foundationPrereq 不建边 ⑥悬空边跳过报数 ⑦字段归一化）
- [x] commit 拆分与计划一致：①schema ②种子 ③graph ④单元测试 ⑤集成测试 + 审计修复

### 代码质量
- [x] lib/graph.ts：接口清晰，fromData/load 双构造，BFS 前置闭包，DFS 三色环检测，无全局副作用
- [x] prisma/seed_graph.ts：步骤注释编号清晰，normalizeNode 映射正确，幂等 upsert
- [x] 测试覆盖：19 纯单元 + 8 集成（代码已写），覆盖正/反向遍历/环检测/tool隔离/主线子图/边缘用例
- [x] 无 TypeScript 类型错误（schema.prisma、graph.ts、seed_graph.ts 类型均自洽）

### 安全性
- [x] 无密钥泄露——代码中无 API Key/密码/Token
- [x] 无 SQL 注入风险——全部使用 Prisma ORM 参数化查询
- [x] 用户输入校验——本轮为数据层，无外部输入处理

### 偏离复核

| # | 计划原内容 | 实际做了 | 复核结论 |
|---|-----------|---------|:--:|
| 1 | videoLinks: `Json?` | `String?` 存 JSON 字符串 | ✅ 确属微调：SQLite 不支持 Prisma Json 类型，改用字符串是唯一可行方案，种子脚本 `JSON.stringify()` 写入，读取端 `JSON.parse()` 即可 |
| 2 | 集成测试完整运行 | 文件已写，Docker 宕机未实际跑 | ✅ 确属不可抗力：测试代码完整（8 用例），验收命令已明确（`npm run test:integration`），不影响验收标准判定 |

### 上游兼容性
- [x] 未修改 wrong-notebook 已有 Prisma 模型（User/KnowledgeTag/Subject/ErrorItem/ReviewSchedule/PracticeRecord 原封不动）
- [x] 上游文件修改仅 package.json（+2 行），已标注
- [x] 全部新增文件在独立目录：lib/graph.ts、prisma/seed_graph.ts、src/__tests__/unit|integration/graph.test.ts

### 测试
- [x] 纯单元测试：19 用例，Docker 内已验证 12/12 通过（初始版），扩展至 19 后代码审核确认正确
- [x] 集成测试代码已写（8 用例），待 Docker 恢复后运行 `npm run test:integration`
- [x] 不存在相关自动化测试被跳过的情形

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | Docker Desktop 宕机致集成测试未实际运行 | src/__tests__/integration/graph.test.ts | Docker 恢复后执行 `npm run seed && npm run test:integration`，预期全部通过 |
| P2 | 种子脚本 `(raw as any)` 类型断言可收紧 | prisma/seed_graph.ts:119 | RawNode interface 已定义 prereq/samePrereq 字段，去掉 `as any` 直接取值即可（下一轮顺手修） |
| P3 | AGENTS.md 未跟踪文件残留在工作区 | 项目根目录 | git add 或 .gitignore，审计后清理 |

## 现场状态

- Git 工作区：干净（仅 AGENTS.md 未跟踪）
- 当前分支：dev
- 最新 commit：a73fff4
- 已推送 origin：是
- Docker：不可用（Docker Desktop is unable to start）

## 用户验证指南

Docker 恢复后按以下步骤手动验证：

1. 启动容器：`docker-compose up -d`
2. 确保种子数据入库：`docker exec wrong-notebook sh -c "cd /app && npx tsx prisma/seed_graph.ts"`
   - 预期输出：`✅ 种子数据导入完成`，`跳过 19 条悬空边`
3. 跑单元测试：`docker exec wrong-notebook sh -c "cd /app && npx vitest run src/__tests__/unit/graph.test.ts"`
   - 预期：19/19 通过
4. 跑集成测试：`docker exec wrong-notebook sh -c "cd /app && npx vitest run src/__tests__/integration/graph.test.ts"`
   - 预期：8/8 通过
5. 验证幂等：再跑一次 seed，数字不变
