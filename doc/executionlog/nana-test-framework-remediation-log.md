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
