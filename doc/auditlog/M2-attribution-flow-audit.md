# M2 归因流程骨架 · 审计报告

> 关联计划: doc/plan/M2-attribution-flow-plan.md
> 执行日志: doc/executionlog/M2-attribution-flow-log.md
> 事故复盘: doc/reference/M2-prod-contamination-postmortem.md
> 审计日期: 2026-06-14
> 审计基准: commit 6bdcabf（含预防措施）

## 审计结论（大白话）

**总体判定：✅ 通过**

M2 交付物按 9 条决策完整落地——3 张新表全部在 schema 末尾追加、没碰上游一个字段；状态机 8 步流程逻辑正确；4 个 API 路由入参校验和鉴权都在位；53 个测试全部在安全路径上通过、退出码 0。

生产库污染事故处理到位：5 条测试数据已清理，M1 种子无损（48/36/18 全匹配），备份文件留存可追溯。

预防措施有效封闭了根因：`test:all` 聚合脚本把 compose 命令与测试清单解耦——以后新增测试只需更新 package.json，compose 自动跟上。执行命令文件新增了"禁止 docker exec vitest"铁律。事故复盘如实记录了时间线和三层根因。

本轮可合入 main，进入 M3。

## 检查清单

### 计划一致性（9 条决策）
- [x] ① dialogueLog 用 `String?` 存 JSON 字符串（SQLite 兼容）
- [x] ② mistakeId 指向 ErrorItem，不建 relation——comment 标注清楚
- [x] ③ 状态机不持久化 state 字段——由调用顺序自然决定
- [x] ④ API 路由不接 AI——纯 CRUD 存取
- [x] ⑤ 鉴权沿用 `getServerSession + authOptions`
- [x] ⑥ test:m2:unit / test:m2:integration 脚本已加
- [x] ⑦ evidenceRound `Int?` 已埋入 ErrorRecord
- [x] ⑧ followUpVerified `String @default("none")` 已埋入
- [x] ⑨ 集成测试打真实路由 handler + mock session，不旁路 Prisma

### 代码质量
- [x] lib/session-machine.ts：125 行，类型安全，8 步 + probe_drill 可选跳转
- [x] API 路由：统一错误处理、入参校验（400/404/201）、logger
- [x] 单元测试 15 用例：正常流程 / 非法跳转 / isComplete / reset / getAllSteps
- [x] 集成测试 12 用例：创建 / 读 / 拒绝非法参数 / evidenceRound+followUpVerified 字段验证
- [x] 测试 mock 策略：mock next/server + @/lib/*，handler 代码路径不变

### 安全性
- [x] 无密钥泄露——代码中无 API Key/密码/Token
- [x] 无 SQL 注入——全部 Prisma ORM 参数化查询
- [x] 鉴权：所有路由入口 `getServerSession` + `unauthorized()`

### 偏离复核

| # | 偏离 | 复核结论 |
|---|------|:--:|
| 1 | 集成测试在 prod 容器跑 → 生产库污染 | ✅ 已修正：数据清理完毕，测试容器补装 test:m2，安全路径重跑 53/53 |
| 2 | 路由 handler 需加 next/server + @/lib/* mock | ✅ 确属微调：Next.js router handler 不能裸 import，mock 后 handler 逻辑不变 |
| 3 | `var` 代 `let` 绕过 vi.mock 提升 | ✅ 确属微调：纯 vitest 机制兼容 |

### 生产库污染事故闭环

| 检查项 | 结果 |
|--------|:--:|
| dev.db 备份 | ✅ `dev.db.bak-20260614` 存在 |
| test-user-001 数据已删 | ✅ DiagnosisSession/ProbeRecord/ErrorRecord 三表 test-user-001 残留 = 0 |
| M1 数据完整 | ✅ 节点 48 / 边 36 / 桥 18 / 主线 10 |
| 安全路径重跑 | ✅ test:all 53/53，退出码 0，数据在 test.db |

### 预防措施验证

| 措施 | 文件 | 状态 |
|------|------|:--:|
| test:all 聚合脚本 | package.json:22 | ✅ 涵盖 M1+M2 四个测试套件 |
| compose 使用 test:all | docker-compose.test.yml:31 | ✅ `npm run test:all`，不再逐个列举 |
| 禁止 docker exec vitest | .claude/commands/execute.md:70 | ✅ 写入执行铁律 |
| 新增 test:* 时同步更新 test:all | .claude/commands/execute.md:73-74 | ✅ 写入工作流 |
| 事故复盘 | doc/reference/M2-prod-contamination-postmortem.md | ✅ 时间线 + 三层根因 + 防治清单 |

### 上游兼容性
- [x] 未修改 wrong-notebook 已有 Prisma 模型（仅末尾追加 3 model，diff 确认）
- [x] `package.json` 新增 3 行（test:m2:* + test:all），⚠️上游文件修改
- [x] `.claude/commands/execute.md` 新增 4 行铁律，⚠️
- [x] 全部新增代码在独立目录/文件

### 测试验证

**安全路径**（`docker compose -f docker-compose.test.yml up --abort-on-container-exit`）：

| 测试套件 | 用例数 | 结果 |
|----------|--------|:--:|
| test:graph:unit | 19 | ✅ |
| test:graph:integration | 7 | ✅ |
| test:m2:unit | 15 | ✅ |
| test:m2:integration | 12 | ✅ |
| **合计** | **53** | **✅ 退出码 0** |

## 已知问题

| 严重度 | 问题 | 位置 | 建议 |
|--------|------|------|------|
| P2 | 全仓 `test:unit` 在 `.env.test` 下有 5 个上游测试失败 | config/logger test | 已有 upstream-test-env-isolation 计划，不阻塞 M3 |
| P3 | `data/dev.db.bak-20260614` 备份文件残留在 data 目录 | ./data/ | 确认 M2 稳定后可删除（文件已在 .gitignore 的 `data/` 规则中忽略） |

## 现场状态

- Git 工作区：干净
- dev.db LastWriteTime：`2026/6/14 15:56:16`（清理操作）
- test.db LastWriteTime：`2026/6/14 16:00:01`（安全路径重跑）
- dev.db.bak：存在
- .env.test：不入库
- Docker：正常

## 建议的后续动作

1. **合入 main**：`git checkout main && git merge dev && git push origin main`
2. **清备份**（确认后再做）：`rm data/dev.db.bak-20260614`（可选，等 M2 稳定后）
3. **下一轮**：M3 初诊+追踪，或先修 upstream-test-env-isolation
