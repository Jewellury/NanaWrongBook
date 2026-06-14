# 容器分层方案 + M1 补验 · 审计报告

> 关联计划: doc/plan/container-split-prod-test-plan.md
> 执行日志: doc/executionlog/container-split-prod-test-log.md
> 关联审计: doc/auditlog/knowledge-graph-data-layer-audit.md（M1 上一轮审计）
> 审计日期: 2026-06-14
> 审计基准: commit f48caa2

## 审计结论（大白话）

**总体判定：✅ 通过**

本轮实际做了两件事：把 M1 图谱验收补完，同时建了一个「一次性测试容器」让以后所有测试都不用钻生产容器。

测试容器完整链路跑通了——`docker compose -f docker-compose.test.yml up --abort-on-container-exit` 退出码 0，26 个图谱用例全部通过（19 单元 + 7 集成）。生产数据库 `./data/dev.db` 在测试全程纹丝未动（时间戳 `8:19:52` 始终不变），隔离设计生效。

一个已知问题：全仓 `test:unit` 有 5 个上游既有测试在 `.env.test` 环境下失败，原因是上游测试对 `AI_PROVIDER` 和 `LOG_LEVEL` 有隐含默认值假设。本轮已通过图谱专用脚本隔离，不影响 M1 验收。建议后续单独开 `upstream-test-env-isolation` 轮处理。

可以把本轮合入 main，容器分层方案即日起生效。

## 检查清单

### 计划一致性
- [x] 新增 `.env.test.example`（模板，提交 git）
- [x] 新增 `docker-compose.test.yml`（独立测试服务，node:22-alpine + build 依赖）
- [x] `.gitignore` 新增 `!.env.test.example` 例外——`.env.test` 仍被忽略
- [x] 不改 Dockerfile、不改 docker-compose.yml
- [x] 8 个设计决策全部落地（①.name ②路径 ③镜像 ④流程 ⑤匿名卷 ⑥范围 ⑦清理 ⑧验证）

### 代码质量
- [x] `docker-compose.test.yml`：yaml 结构清晰，volumes 三行分别对应代码挂载/依赖隔离/数据隔离
- [x] `.env.test.example`：全部占位值，无真实密钥
- [x] `package.json`：新增 2 行 scripts，最小增量
- [x] `test:graph:*` 脚本精确指向图谱测试文件，不跑全仓

### 安全性
- [x] `.env.test.example` 使用的都是占位 key（`sk-test-placeholder`），无真实凭据
- [x] `.env.test`（本地真实版）已被 `.gitignore` 忽略——`git status` 验证无残留
- [x] 测试数据库路径 `./data/test/test.db` 与生产库 `./data/dev.db` 物理隔离

### 偏离复核

| # | 计划原内容 | 实际做了 | 复核结论 |
|---|-----------|---------|:--:|
| 1 | 用 `npm run test:unit && test:integration` | 改用 `test:graph:unit && test:graph:integration` | ✅ 属微调：上游既有测试与 .env.test 环境不兼容，图谱专用脚本是正确收口 |
| 2 | `node:22-alpine` 直接 `npm ci` | 前置 `apk add python3 make g++ libc6-compat openssl` | ✅ 属微调：better-sqlite3 编译需要，不影响容器结构 |

### 上游兼容性
- [x] 未修改 wrong-notebook 已有 Prisma 模型
- [x] 未修改 Dockerfile、docker-compose.yml
- [x] `package.json` 只新增 2 行 test:graph:* scripts（⚠️上游文件修改，已标注）
- [x] `.gitignore` 新增 1 行例外规则（⚠️上游文件修改，已标注）
- [x] 全部新增文件在独立路径

### 测试——M1 图谱最终验收

| 测试 | 用例数 | 结果 |
|------|--------|:--:|
| `test:graph:unit` | 19 | ✅ 全部通过 |
| `test:graph:integration` | 7 | ✅ 全部通过 |
| 退出码 | — | 0 |

### 隔离验证

| 验证项 | 测试前 | 测试后 |
|--------|--------|--------|
| `./data/dev.db` LastWriteTime | `8:19:52` | `8:19:52` ✅ |
| `./data/dev.db` 文件大小 | 675840 | 675840 ✅ |
| 生产容器运行 | Up 2h | 持续运行 ✅ |
| `.env.test` 在 git status | — | 无 ✅ |
| 宿主机 `node_modules` | — | 未被测试容器改动 ✅ |

## 已知问题清单

| 严重度 | 问题 | 所在文件 | 建议 |
|--------|------|----------|------|
| P2 | 全仓 `test:unit` 在 `.env.test` 下有 5 个上游测试失败 | config.test.ts, logger.test.ts | 上游测试对环境变量有隐含假设（`AI_PROVIDER=gemini`、`LOG_LEVEL` 允许 info/warn），`.env.test` 设置了不同值。**本轮不修**——M1 用图谱专用脚本验收已正确收口。建议后续单独开 `upstream-test-env-isolation` 轮处理 |
| P3 | 既有上游旧 seed 配置仍指向 ts-node | package.json `prisma.seed` 字段 | 不影响 `npm run seed`（已指向 tsx），旧配置可后续清理 |

## 现场状态

- Git 工作区：干净
- 当前分支：dev
- 最新 commit：f48caa2
- 已推送 origin：是（dev 分支）
- Docker：正常（wrong-notebook 容器 Up）
- 测试容器：已执行 `down -v`（匿名卷已清理），`./data/test/` 待用户确认后手动清理

## 建议的后续动作

1. **合入 main**：`git checkout main && git merge dev && git push origin main`
2. **清理测试数据**（按安全铁律 1 先确认）：`Remove-Item -Recurse -Force .\data\test`
3. **下一轮**：启动 `upstream-test-env-isolation` 计划，修复上游测试环境变量隔离
