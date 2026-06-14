# 提示词修订 + DB 护栏 · 审计报告

> 关联计划: doc/plan/prompt-revision-plan.md
> 关联提案: doc/plan/three-agent-prompt-revision-plan.md
> 审计日期: 2026-06-14
> 审计基准: commit d46cd12

## 审计结论（大白话）

**总体判定：✅ 通过**

5 个文件改动全部到位，挂账项已解除。DB 护栏用白名单模式挂在 setupFiles 首位——任何测试连了非 test 库都会在第一秒崩溃。audit 模板补了"安全路径验证"和"生产库未写入"两条检查，正好是 M2 事故里审计漏掉的那两问。plan 和 execute 加了 TDD 注记，轻量不影响现有流程。

安全路径验证：`docker compose -f docker-compose.test.yml up --abort-on-container-exit` 全链跑通——19+7+15+12=53 用例全部通过、退出码 0、数据写入 `./data/test/test.db`、`./data/dev.db` 纹丝未动。护栏在真实安全路径上不误拦。

本轮可合入 main，新规从 M3 起生效。

## 检查清单（首次使用新增的安全补检）

### 计划一致性
- [x] 决策① 白名单模式（空值/db 路径 → 阻断，仅白名单放行）
- [x] 决策② guard-db.ts 挂在 setupFiles 首位——在任何连接前拦截
- [x] 决策③ 不改 execute.md 已有的 5 条守门规则

### 代码质量
- [x] guard-db.ts：23 行，白名单数组 + 空值拦截 + 清晰报错信息
- [x] vitest.config.ts：setupFiles 只改一行（首位插入），不重排已有条目
- [x] audit.md：测试节 +2、"安全性"节 +1，位置正确
- [x] plan.md：TDD 注记在验收标准节顶部，不影响已有 checklist
- [x] execute.md：插入第 2 步（测试先行），旧 2-6 → 3-7，编号连续无重无漏

### 安全性
- [x] 无密钥泄露
- [x] 无 SQL 注入风险
- [x] 护栏白名单逻辑已验证：空值 / `file:/app/data/dev.db` → 阻断，`file:/app/data/test.db` → 放行
- [x] 本轮未向生产库写入测试数据：`./data/dev.db` LastWriteTime 不变

### 偏离复核
无偏离——按计划执行，三个任务全部完成。

### 上游兼容性
- [x] vitest.config.ts 只改 setupFiles 数组（⚠️上游文件修改，已标注）
- [x] .claude/commands/ 三个文件：项目自有文件，非上游
- [x] guard-db.ts：新增文件，独立目录

### 测试（新审计检查）
- [x] 确认测试在安全路径运行：53/53 通过，退出码 0，`./data/test/test.db` 被更新，`./data/dev.db` 未触碰
- [x] DB 护栏断言存在且生效：`src/__tests__/setup/guard-db.ts` 已挂载到 setupFiles 首位
- [x] 护栏故意触发验证：manually tested dev.db URL → crash with "🛑 测试禁止连接非测试库"

## 安全路径复跑记录

| 时间 | 测试套件 | 用例 | 结果 | 数据路径 |
|------|---------|------|:--:|------|
| 06-14 | test:graph:unit | 19 | ✅ | 无 |
| 06-14 | test:graph:integration | 7 | ✅ | test.db |
| 06-14 | test:m2:unit | 15 | ✅ | 无 |
| 06-14 | test:m2:integration | 12 | ✅ | test.db |
| — | **合计** | **53** | ✅ **退出码 0** | — |
| — | dev.db LastWriteTime | — | `15:56:16` 不变 | ✅ |

## 现场状态

- Git 工作区：2 个未跟踪文件（plan 提案文件），非本轮产物
- 当前分支：dev
- 最新 commit：d46cd12
- Docker：正常，prod 容器 + 测试容器均已验证

## 建议的后续动作

1. 合入 main
2. 起 M3 /plan（新规已生效：plan TDD 注记、execute 测试先行步骤、audit 安全补检）
3. 1B（vitest run 全量）+ upstream-test-env-isolation 独立推进，不卡 M3
