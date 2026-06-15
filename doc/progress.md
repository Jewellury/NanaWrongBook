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
| M2 归因流程 | ✅ 完成 | 2026-06-14 | 2026-06-14 |
| M3a 追踪骨架 | ✅ 完成 | 2026-06-15 | 2026-06-15 |
| M3b 配题灌入 | ⬜ 待开始 | — | — |

---

## 2026-06-14 · 提示词修订 + DB 护栏

### 已完成

| 时间 | 任务 | 状态 | 说明 |
|------|------|:--:|------|
| 06-14 | DB 护栏断言 | ✅ | 白名单模式，setupFiles 首位挂载 |
| 06-14 | audit 安全补检 | ✅ | +2 条（安全路径验证 + 生产库未写入） |
| 06-14 | TDD 注记 | ✅ | plan.md + execute.md |
| 06-14 | 审计 | ⚠️ | 有条件通过（容器复跑待补） |
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

---

## 2026-06-14 · M2 轮：归因流程骨架

### 已完成

| 时间 | 任务 | 状态 | 说明 |
|------|------|:--:|------|
| 06-14 | Prisma schema 追加 | ✅ | 3 张新表（DiagnosisSession/ProbeRecord/ErrorRecord），含 evidenceRound/followUpVerified |
| 06-14 | 会话状态机 | ✅ | 8 步流程，probe_drill 可选跳转 |
| 06-14 | API 路由 | ✅ | 4 个（POST/GET sessions, POST probes, POST errors） |
| 06-14 | 测试 | ✅ | 53/53 全部通过（19+7+15+12），安全路径退出码 0 |
| 06-14 | 生产库污染清理 | ✅ | 5 条测试数据删除，M1 完整无损 |
| 06-14 | 预防措施 | ✅ | test:all 聚合 + 执行铁律 + 事故复盘 |
| 06-14 | 审计 | ✅ | 通过，审计报告: doc/auditlog/M2-attribution-flow-audit.md |

### 交付物

| 文件 | 类型 |
|------|------|
| prisma/schema.prisma | 修改（末尾追加 3 model） |
| prisma/migrations/20260614061611_add_m2_diagnosis_session/ | 新增 |
| lib/session-machine.ts | 新增 |
| src/app/api/diagnosis/sessions/*（4 个 route.ts） | 新增 |
| src/__tests__/unit/session-machine.test.ts | 新增 |
| src/__tests__/integration/diagnosis-api.test.ts | 新增 |
| package.json | 修改（+3 行） |
| docker-compose.test.yml | 修改（用 test:all 替代逐个清单） |
| .claude/commands/execute.md | 修改（+4 行测试铁律） |

### 事故与修正

生产库被 M2 集成测试写入 5 条测试数据（根因：compose 未同步 M2 测试脚本 + 执行代理退守 prod 容器）。复盘与修正见 doc/reference/M2-prod-contamination-postmortem.md。

### commit 链

6bdcabf → 4e8e5c5 → c7d196e → 9e9feb3 → 0eae9ea → 5db4ce7 → 8c02ae6 → f0ca0ec → c9742aa

---

## 2026-06-15 · M3a 轮：追踪骨架

### 已完成

| 时间 | 任务 | 状态 | 说明 |
|------|------|:--:|------|
| 06-15 | 真题种子 | ✅ | 101 题 / 34 节点 / 确定性 ID |
| 06-15 | Item 表 + 迁移 | ✅ | 纯 CREATE TABLE |
| 06-15 | 种子导入 | ✅ | DB 101 条，BG102/M2a-38 drill 无碰撞 |
| 06-15 | KST-lite（测试先行） | ✅ | 祖先/后代传播，6 用例 |
| 06-15 | BKT（测试先行） | ✅ | T=学习转移，12 用例 |
| 06-15 | API | ✅ | map GET + initial POST |
| 06-15 | 测试 | ✅ | 75/75，退出码 0 |
| 06-15 | 审计 | ✅ | 通过 |

### 已知限制

KST-lite gap 只传播一层 dependents，M4 补递归。

### 交付物

| 文件 | 类型 |
|------|------|
| prisma/seed_items_batch1.ts | 新增 |
| lib/kst-lite.ts | 新增 |
| lib/bkt.ts | 新增 |
| src/app/api/diagnosis/map/route.ts | 新增 |
| src/app/api/diagnosis/initial/route.ts | 新增 |
| src/__tests__/unit/kst-lite.test.ts | 新增 |
| src/__tests__/unit/bkt.test.ts | 新增 |

### commit 链

014554f → c678a0f → 7b72e6c → e059368 → 080351a → 462c4e0
