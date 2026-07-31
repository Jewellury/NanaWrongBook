# Nana 测试框架修复 · 执行日志

> 关联计划: doc/plan/nana-test-framework-remediation-plan.md
> 开始时间: 2026-07-30
> 执行范围: PR-0（当前事故闭环）

## 执行记录

### commit 0.1: fix(e2e): 修复 requestfinished 监听器异步 bug
- 文件: `e2e/ci/nana-golden-path.spec.ts`
- 内容: 将 `req.response()?.status()` 改为 `response` 事件监听（`res.status()` 无需 await）
- 结果: ✅ 完成

### commit 0.2: feat(tests): 新增 tsconfig.e2e.json 和 test:e2e:types 脚本
- 文件: `tsconfig.e2e.json`（新增）、`package.json`（修改）
- 内容: `extends tsconfig.json`，`include: ["e2e/**/*.ts"]`，`compilerOptions.noEmit: true`
- 结果: ✅ 完成。`npm run test:e2e:types` 通过，异步 bug 已被类型系统捕获

### commit 0.3: feat(e2e): 捕获 /process 完整业务响应并打印分层证据
- 文件: `e2e/helpers/process-response-logger.ts`（新增）、`e2e/ci/nana-golden-path.spec.ts`（修改）
- 内容: `logProcessOutcome` 辅助函数，在 waitForResponse 后打印 HTTP status、body.status/error/audioStatus、CaseAiResult
- 第一次实现（6dfae8e）：waitForResponse 超时时异常抛出，console.log 证据丢失
- 第二次修复（36b8e0d / 128a9e7 force-pushed to 36b8e0d）：wrap waitForResponse 在 try-catch 中，超时时也打印 HB status=TIMEOUT + DB 查询结果
- 结果: ✅ 完成。CI 日志确认：
  - `[process-outcome] HTTP status=200`
  - `[process-outcome] body.status=success`
  - `[process-outcome] body.error=(null)`
  - `[process-outcome] body.audioStatus=skipped`
  - `[process-outcome] CaseAiResult.processingStatus=success`

### commit 0.4: fix(api): 修复 /process 200 但业务失败的根因
- 证据显示：/process 已正常返回 200 + body.status=success + 落库成功
- 之前的 200+failed 问题已由 seed 修复（74e542c）+ logger async bug 修复共同解决
- 没有新的业务故障需要修复，跳过此 commit
- 结果: ✅ 跳过（无根因需求）

### commit 0.5: test(integration): 补回归测试
- 异步监听器 bug 已由 `test:e2e:types`（tsconfig.e2e.json）类型检查捕获
- 后续若有代码改动 reintroduce `req.response()?.status()` 模式，类型检查会在 CI 中红
- 不额外在 process-api.test.ts 中补测试（已有完整覆盖）
- 结果: ✅ 完成（类型系统作为回归护栏）

### commit 0.6: chore(diagnostics): 清理临时诊断代码
- 删除 route.ts 三处 `fs.appendFileSync`（module-loaded.log、post-entered.log、error.log）
- 删除 route.ts 两处 `[process-route DEBUG]` console.log
- 删除 capture/page.tsx 八处 `[ctrl-diag]` console.log 及其注释
- 删除 `e2e/ci/_diagnose-audio.spec.ts`
- 保留：A2 stderr pipe、A3 Dump step、D1 waitForResponse + 三事件监听、D4 APIRequestContext 直调 + retry
- 验证：`git grep -E 'process-route DEBUG|ctrl-diag|_diagnose-audio|appendFileSync.*process-route'` 无结果
- 结果: ✅ 完成

## 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | commit 0.4 修复 200+failed 根因 | 跳过，证据显示无业务故障 | logger async bug 修复后 /process 全绿，无需修复 | 否 |
| 2 | commit 0.5 补回归测试 | 类型系统（test:e2e:types）作为回归护栏 | 异步监听 bug 已被 tsc 编译时捕获，不需要运行时测试 | 否 |

## 上游文件修改（如有）

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `src/app/api/nana/cases/[id]/process/route.ts` | 删除诊断代码 | PR-0 清理临时诊断 |
| `src/app/nana/capture/page.tsx` | 删除诊断代码 | PR-0 清理临时诊断 |

## 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| `git add -A` 误把未跟踪的 research docs 和 ci-status 文件加入提交 | `git reset --soft HEAD~1` + `git restore --staged` 后 forcve push |
| 初始 logger 实现中 waitForResponse 超时时异常吞掉证据 | 改为 try-catch 包裹，超时也打印 status=0 + DB 结果后 re-throw |

## 完成状态

- [x] 所有任务完成（PR-0 闭环）
- [x] 代码已提交
  - `a0fce2c` fix(e2e): 修复 requestfinished 监听器异步 bug
  - `def7ff0` feat(tests): 新增 tsconfig.e2e.json 和 test:e2e:types 脚本
  - `36b8e0d` fix(e2e): process-response-logger 超时时也打印分层证据
  - `75a8fc5` chore(diagnostics): 清理临时诊断代码
- [x] 本地 `npm.cmd run build` — 通过
- [x] 本地 `npm run test:e2e:types` — 通过
- [x] 本地 Docker 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行
- [x] GitHub Actions 测试容器通过后，才允许部署
- [x] 确认测试在安全路径运行
- [x] 可进入 PR-1/PR-2 阶段

---

## PR-1 执行记录（安全的环境契约）

### commit 1.1~1.2: test:env:prepare 统一入口
- `scripts/test-env-prepare.ts`（新增）：白名单校验（仅 `<repo>/data/test/` 内）、profile（domain/api/ui/canary）、删除重建临时 DB、seed + 数量 preflight（KnowledgeNode≥48 / TextbookTopic=16 / 映射=48）、输出机器可读 JSON + errorCode/errorMessage、catch 不吞异常
- `package.json`：注册 `test:env:prepare` 脚本
- 本地验证：`--profile=domain` 通过（48/16/48）；外部路径 `file:./data/dev.db` exit 1 + `DATABASE_URL_NOT_IN_WHITELIST`

### commit 1.3: guard-db.ts 目录包含判定
- 从精确匹配改为目录包含判定：`file:/app/data/test.db` 精确放行 + 解析后位于 `<cwd>/data/test/` 目录内放行
- 验证：dev.db / 游离 DB / 空值全部拒绝，data/test/ 下任意 profile 路径放行

### commit 1.4: ci.yml 替换重复 seed 命令
- `integration-test` job：手写 `prisma db push + seed_graph + seed_textbook_topics` → `npm run test:env:prepare -- --profile=domain`
- `e2e-test` job：手写 `prisma db push + db seed + seed_graph + seed_textbook_topics` → `npm run test:env:prepare -- --profile=canary`
- **偏离记录 3**：第一次 CI 失败（Integration Tests 500），根因是相对路径被 Prisma 相对 `prisma/` schema 目录解析，导致 vitest 连 `prisma/data/test/test.db`（无数据）
- **修复**：CI 改用绝对路径 `file:${{ github.workspace }}/data/test/<job>.db`（r2.1 约束 1：Node 脚本改 env 不传 CI step，路径必须 job 级显式设置）
- 本地验证：绝对路径下 314/314 集成测试全过

### commit 1.5: DECISIONS.md 登记 D-16
- 统一测试环境入口、DB 白名单、profile、禁止 `--accept-data-loss`、机器可读错误输出

## PR-1 完成状态

- [x] 所有任务完成（PR-1 闭环）
- [x] 代码已提交
  - `7f7bd22` feat(ci): 统一测试环境入口 test:env:prepare
  - `2bbccfa` fix(ci): 用绝对 DATABASE_URL 修复相对路径解析问题
- [x] CI 全绿：Unit / Integration / Build / E2E 全部 success
- [x] 可进入 PR-2 阶段
