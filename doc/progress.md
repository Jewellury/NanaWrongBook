# 项目进度历史

> 📌 只增不减。每轮开发完成后追加记录。
> 📌 这是项目长期轨迹，用来回顾"我们做过什么、什么时候做的"。

---

## 2026-06-13 · 基建轮：开发环境 + 三代理框架 + Git 配置

### 已完成

| 时间 | 任务 | 状态 | 说明 |
|------|------|:--:|------|
| 06-13 | Docker 启动基座 | ✅ | 修复换行符 bug，容器运行在 localhost:3001 |
| 06-13 | AI 切 DeepSeek | ✅ | API Key + Base URL 配置完成，模型 deepseek-chat |
| 06-13 | Git 远程配置 | ✅ | origin=Jewellury/NanaWrongBook, upstream=wttwins/wrong-notebook |
| 06-13 | 三分支模型创建 | ✅ | main（稳定）+ dev（开发），已推送 origin |
| 06-13 | 三代理命令文件 | ✅ | /plan, /execute, /audit |
| 06-13 | 进度文件 + 工作台 | ✅ | doc/progress.md + doc/active_spec.md |
| 06-13 | CLAUDE.md 更新 | ✅ | 三代理规则 + 安全铁律 + Git 规范 |

### 当前状态

- **当前分支**: dev
- **最新提交**: d18a94a（搭建开发环境）
- **容器状态**: 运行中，端口 3001

---

## 📊 里程碑总览

| 里程碑 | 状态 | 开始 | 完成 |
|--------|:--:|------|------|
| M0 环境搭建 | ✅ 完成 | 2026-06-13 | 2026-06-13 |
| M1 知识图谱数据层 | ✅ 完成 | 2026-06-14 | 2026-06-14 |
| M2 归因流程 | ⬜ 待开始 | — | — |
| M3 初诊+追踪 | ⬜ 待开始 | — | — |
| M4 深化 | ⬜ 待开始 | — | — |

---

## 2026-06-14 · M1 轮：知识图谱数据层

### 已完成

| 时间 | 任务 | 状态 | 说明 |
|------|------|:--:|------|
| 06-14 | Prisma schema 追加 | ✅ | 8 张新表，不改既有模型，SQLite 兼容 |
| 06-14 | 种子导入脚本 | ✅ | 幂等 upsert，48 节点/36 边/18 桥，19 悬空边跳过 |
| 06-14 | 内存图谱模块 | ✅ | fromData/load 双构造，prereqsOf/allPrereqsOf/dependentsOf/mainlineSubgraph/环检测 |
| 06-14 | 单元测试 | ✅ | 19 纯单元用例（Docker 内 12/12 验证，扩展后代码审核确认） |
| 06-14 | 集成测试 | ✅ | 通过测试容器补验：7/7 通过 |
| 06-14 | 审计修复 | ✅ | mainlineSubgraph 实现 + tool 边隔离 + lockfile 同步 |
| 06-14 | 审计 | ✅ | 通过，审计报告: doc/auditlog/knowledge-graph-data-layer-audit.md |
| 06-14 | 容器分层方案 | ✅ | 独立测试容器，M1 补验 26/26 全过 |

### 交付物

| 文件 | 类型 |
|------|------|
| prisma/schema.prisma | 修改（末尾追加 8 model） |
| prisma/migrations/20260613230423_add_knowledge_graph/migration.sql | 新增 |
| prisma/seed_graph.ts | 新增 |
| lib/graph.ts | 新增 |
| src/__tests__/unit/graph.test.ts | 新增 |
| src/__tests__/integration/graph.test.ts | 新增 |
| package.json | 修改（+2 行） |

### commit 链

a73fff4 → cf02a18 → 2518175 → 5a47be9 → c7b2604 → ae306f3 → ba3cdec

---

## 2026-06-14 · 容器分层方案

### 已完成

| 时间 | 任务 | 状态 | 说明 |
|------|------|:--:|------|
| 06-14 | .env.test.example + compose | ✅ | 测试环境变量模板 + 独立测试容器 |
| 06-14 | .gitignore 确认 | ✅ | `.env.test` 不入库 |
| 06-14 | 图谱专用测试脚本 | ✅ | test:graph:unit / test:graph:integration |
| 06-14 | M1 最终补验 | ✅ | 26/26 图谱用例通过（19 unit + 7 integration） |
| 06-14 | 隔离验证 | ✅ | dev.db 未触碰，生产容器未中断 |
| 06-14 | 审计 | ✅ | 通过，审计报告: doc/auditlog/container-split-prod-test-audit.md |

### 已知问题

全仓 `test:unit` 在 `.env.test` 下有 5 个上游测试失败（config.test.ts/logger.test.ts）。根因：上游测试对环境变量有隐含默认值假设。建议后续开 `upstream-test-env-isolation` 独立计划处理。

### 交付物

| 文件 | 类型 |
|------|------|
| .env.test.example | 新增 |
| docker-compose.test.yml | 新增 |
| .gitignore | 修改（+1 行） |
| package.json | 修改（+2 行 scripts） |

### commit 链

f48caa2 → 472ca98 → 6e57467 → c58b651 → 4d9b92f
