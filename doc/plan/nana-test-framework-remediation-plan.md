# Nana 测试框架修复计划 · A-1 Remediation Plan v2

> 关联规格: `doc/spec/nana-v1-minimum-loop-acceptance.md`（FREEZE-001，14 条 R1a 主路径已冻结）
> 关联文档: `doc/research/2026-07-28_test-framework-design-and-debug-lessons.md`（被评审的测试框架总结）
> 计划日期: 2026-07-30
> 预计影响: `package.json`、`scripts/`、`e2e/`、`src/__tests__/`、`.github/workflows/ci.yml`、`tsconfig.e2e.json`、`doc/plan/`、`doc/executionlog/`
> 性质：缩小范围后的可执行计划，覆盖 PR-0 / PR-1 / PR-2；生产 artifact Canary 不进入本轮

---

## 1. 大白话概述

### 这轮要做什么

过去 17 轮 CI 试错才找到“漏跑两条 seed”这一行配置错误，问题不在测试数量不够，而在每次失败只能看到“AI 摘要没出现”，分不清故障到底发生在哪一层。本轮只做四件事，顺序不能颠倒：

1. **先闭环当前业务故障**：`/process` 现在 HTTP 200 但业务状态是 `failed`（假 Provider 没收到请求），必须先定位根因、补回归测试，再删诊断代码。
2. **统一测试环境准备入口**：用一条命令 `npm run test:env:prepare` 替代 CI 里各处手写重复的 `prisma db push`/`seed` 命令，并且只允许在仓库内的临时测试目录生成数据库，防止误删生产数据。
3. **把测试护栏拆成三层**：API 契约测试（后端真实 HTTP 调用）、UI 契约测试（浏览器只验证页面状态）、全栈 Canary（一条不绕过后端的真实路径）。每层只验证自己该验证的东西，不互相重复。
4. **让测试能诚实失败**：修复监听 `requestfinished` 的异步 bug，让 `/process` 失败时一次就能看到 HTTP 状态、响应体 `status` 字段、`error`、`audioStatus` 和落库结果。

### 成功标志（引用评审 AI 提出的四个标准）

真正摆脱死胡同的标志不是“四条护栏全部建好”，而是：

1. **缺 seed 能在浏览器启动前 30 秒内明确失败**——`test:env:prepare` 用退出码 1 + 机器可读 JSON 报告告诉你是环境变量、schema 还是 seed 数量不过关。
2. **`/process` 失败时一次 CI 就知道是环境、HTTP、业务状态还是 Provider**——通过分层响应捕获和证据打印，不再只看到一个“AI 摘要没出现”的 timeout。
3. **每个 PR 只引入一种新的测试边界**——PR-0 修业务 bug + 补回归；PR-1 统一环境契约；PR-2 拆分护栏。不混做。
4. **不再需要 10 多轮远程试错才能定位一行配置**——通过 `test:env:prepare` 白名单、响应体断言、假 Provider 队列状态诊断，把根因定位收敛到 1-3 轮 CI 内。

### 本轮不做的事

- 不新增 `start-test-stack.ts` 一键启动脚本（本轮不做，避免范围扩大）。
- 不实现“生产 artifact Canary”（即不对 Docker/GHCR 镜像跑 Canary；本轮只跑 next dev 开发栈全链路测试，并诚实地称其为“开发栈全链路测试”）。
- 不新增假设验证代理；三代理保持 plan/execute/audit 不变。
- 不扩大范围到产品功能开发（如手动改课本分类 TD-006、打印页、真实 ASR 质量等）。
- 不默认新增 `domain-invariants.test.ts`；先复用 `process-api.test.ts` 和 `map-evidence.test.ts`，再决定要不要拆分或补缺。

---

## 2. PR 拆分路线图

### 总览

| PR | 目标 | 核心交付 | 大致 commit 数 | 是否硬门禁 |
|---|---|---|---|---|
| **PR-0** | 当前事故闭环 | 修监听 bug + 捕获 `/process` 完整响应 + 定位 200+failed 根因 + 补回归测试 + 清理诊断代码 | 4-5 | 是 |
| **PR-1** | 安全的环境契约 | 临时 DB 路径白名单 + `test:env:prepare`（含 profile）+ 统一 seed/preflight + 替换 CI 重复初始化 | 3-4 | 是 |
| **PR-2** | 护栏拆分 | 精简假 Provider（固定队列、workers:1、禁止重试）+ API 契约测试 + UI 契约测试 + 单条开发栈 Canary | 5-6 | 是 |
| **后续 PR** | 生产 artifact Canary | 对 Docker/GHCR 镜像运行 Canary（不进入本轮） | — | 后续规划 |

### PR-0：当前事故闭环（必须先完成）

**目标**：修复 `/process` HTTP 200 但业务失败（假 Provider 未收到请求）的当前故障，补回归测试，然后再清理临时诊断代码。

**顺序不能颠倒**：
1. 修监听器（让 CI 能看到真实响应）。
2. 读取完整响应：`HTTP status` + `body.status` + `body.error` + `body.audioStatus` + `CaseAiResult` 落库状态。
3. 找到当前 200+failed 根因（大概率是 fixture 注册/队列匹配问题，也可能是 case-analyzer 内部 catch 吞异常）。
4. 补一条回归测试，让该根因一旦复发就在 CI 中红。
5. 再删除临时诊断代码（`route.ts` 三处 `fs.appendFileSync`、`capture/page.tsx` 八处 `[ctrl-diag]`、`_diagnose-audio.spec.ts`）。

**任务分解（到 commit）**：

- **commit 0.1** `fix(e2e): 修复 requestfinished 监听器异步 bug`
  - 文件：`e2e/ci/nana-golden-path.spec.ts`（修改）
  - 内容：将 `req.response()?.status()` 改为 `response` 事件（`res.status()` 无需 await），或仅在 `requestfinished` 中记录 URL 而不读 status。保留 `requestfailed`/`response`/`request` 事件作为长期诊断护栏。
  - 验收：本地 `npx tsc --noEmit -p tsconfig.e2e.json` 通过（注：`tsconfig.e2e.json` 在 PR-1 新增；PR-0 阶段可先用 `tsc --noEmit e2e/ci/nana-golden-path.spec.ts` 做最小检查，或合并到 PR-1）。

- **commit 0.2** `feat(e2e): 捕获 /process 完整业务响应并打印分层证据`
  - 文件：`e2e/ci/nana-golden-path.spec.ts`（修改）、`e2e/helpers/process-response-logger.ts`（新增）
  - 内容：新增辅助函数，在 `waitForResponse` 捕获 `/process` 后打印 `HTTP status`、`body.status`、`body.error`、`body.audioStatus`、对应 `caseId` 的 `CaseAiResult.processingStatus` 和 `CaseAiResult.error`。
  - 验收：CI 跑一次 golden-path，能在日志中直接看到上述字段，无论成功与否。

- **commit 0.3** `fix(api): 修复 /process 200 但业务失败的根因（TBD 由证据决定）`
  - 文件：由 PR-0 执行阶段根据证据决定（可能是 `src/lib/nana/case-analyzer.ts`、`src/app/api/nana/cases/[id]/process/route.ts`、`e2e/helpers/fake-provider-server.ts` 或 `e2e/helpers/register-fixture.ts` 等）
  - 内容：根因未定位，计划不做预设。一旦证据显示根因，再补该 commit。若根因是“假 Provider 动态注册未命中”，改为更稳定的注册/队列方式（为 PR-2 假 Provider 精简做准备）。
  - 验收：golden-path 在 CI 中 `/process` 返回 `body.status='success'` 且 `CaseAiResult` 落库成功。

- **commit 0.4** `test(integration): 为 /process 200+failed 根因补回归测试`
  - 文件：`src/__tests__/integration/nana/process-api.test.ts`（修改，优先复用）或新增文件（仅当现有文件无法覆盖时）
  - 内容：用现有 `process-api.test.ts` 的 mock 模式，复现并固定该根因场景。例如：若根因是“analyzeCase 内部异常被吞导致返回 `failed`”，则加一个 `mockAnalyzeCase.mockRejectedValueOnce` 的测试断言响应必须诚实暴露错误；若根因是 Provider 匹配失败，则加一个假 Provider 不匹配时返回明确错误码的契约测试（在 PR-2 中落地）。
  - 验收：回归测试在修复前红、修复后绿。

- **commit 0.5** `chore(diagnostics): 清理 /process 调试诊断代码`
  - 文件：`src/app/api/nana/cases/[id]/process/route.ts`（修改）、`src/app/nana/capture/page.tsx`（修改）、`e2e/ci/_diagnose-audio.spec.ts`（删除）
  - 内容：删除 `[process-route DEBUG]` 三处 `fs.appendFileSync` 和 `[ctrl-diag]` 八处日志；删除临时诊断 spec。
  - 保留：A2 stderr pipe、A3 Dump step、D1 `waitForResponse` + 三事件监听、D4 APIRequestContext 直调 + retry 作为长期诊断护栏。
  - 验收：`git grep -E '\[process-route DEBUG\]|\[ctrl-diag\]'` 无结果；`_diagnose-audio.spec.ts` 不存在；CI 仍绿。

### PR-1：安全的环境契约

**目标**：把 CI 中各处手写、重复、且可能误伤生产数据库的数据库初始化命令，换成一条统一、安全、可 profile 的入口。

**核心原则**：
- `test:env:prepare` 自己生成绝对临时路径（如 `data/test/<job-id>.db`），拒绝外部传入的非测试目录数据库。
- 执行前校验绝对路径位于允许的测试目录（如 `<repo>/data/test/`）。
- 只允许删除/重建该临时文件；禁止对普通 `DATABASE_URL` 使用 `--accept-data-loss`。
- 输出 `errorCode`/`errorMessage`，不在 `catch` 中把真实异常吞掉。
- 支持 profile，不同测试 job 只验证自己真正需要的环境变量。

**任务分解（到 commit）**：

- **commit 1.1** `feat(scripts): 新增安全的 test:env:prepare 入口`
  - 文件：`scripts/test-env-prepare.ts`（新增）、`package.json`（修改）
  - 内容：实现环境准备脚本，包含：
    - 生成绝对临时 DB 路径（`data/test/<job-id>.db`，job-id 默认用 `process.env.GITHUB_RUN_ID` 或 `nanoid()`，用后者时打印 warning）。
    - 白名单检查：解析后的绝对路径必须位于 `<repo>/data/test/` 内，否则 exit 1 并输出 `errorCode: DATABASE_URL_NOT_IN_WHITELIST`。
    - 拒绝外部传入：如果 `DATABASE_URL` 指向 `<repo>/data/test/` 以外的路径，拒绝执行并输出错误。
    - 删除并重建该临时文件（只删白名单内的文件），然后 `prisma db push`（不加 `--accept-data-loss`，除非明确 env 开关）。
    - 执行必要 seed：`prisma db seed`（admin 用户）、`seed_graph.ts`、`seed_textbook_topics.ts`。
    - 验证：KnowledgeNode ≥48、TextbookTopic =16、TextbookNodeMapping =48。
    - 支持 `--profile=domain|api|ui|canary`：domain 不检查 Provider 变量；api/ui/canary 检查 `VOLCENGINE_API_KEY`/`BASE_URL`/`LITE_ENDPOINT_ID`（UI 契约不需要 Provider 时也走 canary 模式）。
    - 输出机器可读 JSON 到 stdout，包含 `ok`、`errorCode`、`errorMessage`、`durationMs`、`counts`、白名单路径等。
  - 验收：本地 `npm run test:env:prepare -- --profile=domain` 成功；`DATABASE_URL=file:./data/prod.db` 时 exit 1；JSON 输出可解析。

- **commit 1.2** `chore(ci): 用 test:env:prepare 替换 integration-test 和 e2e-test 的重复 seed 命令`
  - 文件：`.github/workflows/ci.yml`（修改）
  - 内容：将 `integration-test` job 的 `Setup test database` step 和 `e2e-test` job 的 `Setup Database` step 替换为 `npm run test:env:prepare -- --profile=domain`（integration）和 `--profile=ui`（e2e，若 golden-path 仍依赖 Provider）或 `--profile=canary`（视 PR-2 后的 Canary 命名）。在 `env` 段统一设置 `DATABASE_URL` 指向仓库内的 `data/test/test.db`（不再用 `file:./e2e.db` 这种可能游离的路径）。
  - 验收：CI 运行 `test:env:prepare` 成功，且不再出现 `npx prisma db push --accept-data-loss` 手写命令。

- **commit 1.3** `feat(tests): 新增 tsconfig.e2e.json 对 e2e 目录做类型检查`
  - 文件：`tsconfig.e2e.json`（新增）、`package.json`（修改）
  - 内容：`extends tsconfig.json`，`include: ["e2e/**/*.ts"]`，`compilerOptions.noEmit: true`；`package.json` 增加 `test:e2e:types` 脚本；CI 在 `e2e-test` job 中 `Install dependencies` 后增加 `npm run test:e2e:types` step。
  - 验收：`npm run test:e2e:types` 本地通过；PR-0 的异步监听 bug 被类型检查捕获或已修复。

- **commit 1.4** `docs(decisions): 在 DECISIONS.md 登记测试环境准备入口和安全规则`
  - 文件：`doc/DECISIONS.md`（追加）
  - 内容：新增一条决策（D-16）：测试环境准备统一入口、临时 DB 白名单、profile 设计、禁止对外部 DATABASE_URL 使用 `--accept-data-loss`。
  - 验收：DECISIONS.md 追加一行，格式与现有表格一致。

### PR-2：护栏拆分

**目标**：把假 Provider 从动态哈希注册改成更简单的固定响应队列，并把测试拆成 API 契约、UI 契约、单条开发栈 Canary 三层；优先复用现有测试，不新增不必要的文件。

**核心原则**：
- 假 Provider 固定响应队列 + `workers: 1` + 禁止重试 + `beforeEach` 清空队列，避免并行/重试串场。
- 不新增 `domain-invariants.test.ts`；先在现有 `process-api.test.ts` 和 `map-evidence.test.ts` 上确认覆盖，再决定要不要拆分或补缺。
- API 契约测试：明确是“启动真实 Next 服务后发真实 HTTP”，不是 `import route handler`。
- 本轮 API 契约先只跑 image-only 路径；完整音频链路继续按计划暂停（已有音频转码独立测试）。
- UI 契约 mock 响应必须经过与生产响应相同的 Zod/schema 校验，防止前后端契约漂移。
- Canary 在 `main` push 失败必须阻塞；nightly 失败只告警。

**任务分解（到 commit）**：

- **commit 2.1** `refactor(e2e): 精简假 Provider 为固定响应队列`
  - 文件：`e2e/helpers/fake-provider-server.ts`（修改）、`e2e/helpers/register-fixture.ts`（删除）
  - 内容：
    - 新增 `POST /__test/queue` 控制端点：测试预先压入一个固定响应队列（按顺序弹出）。
    - `POST /chat/completions` 每次从队列头部弹出下一个固定响应；队列为空时返回 HTTP 500 + `QUEUE_EMPTY`。
    - 删除 `/__test/register` 和动态 SHA-256 映射逻辑。
    - 删除 `setupFixtureRegistration` 及相关 Playwright 请求拦截注册代码。
    - 在 `playwright.config.ts` 中设置 `workers: 1`、`retries: 0`（或针对这些 spec 单独配置）。
    - 在相关 spec 的 `beforeEach` 中调用 `POST /__test/queue` 的 `DELETE` 清空队列。
  - 验收：CI 中假 Provider 队列不被并行/重试串场；`register-fixture.ts` 不存在。

- **commit 2.2** `test(integration): 建立 /process API 契约测试（image-only，真实 Next 服务）`
  - 文件：`src/__tests__/integration/nana/process-api-contract.test.ts`（新增）或优先复用 `process-api.test.ts`（修改）
  - 内容：
    - 明确契约层级：在测试启动真实 Next.js 服务（通过 `test:env:prepare --profile=api` + `next dev` 或类似方式），然后发真实 HTTP POST 到 `/api/nana/cases/:id/process`。
    - 使用固定响应队列假 Provider，image-only（不验证完整音频链路）。
    - 断言：HTTP 200、`body.status='success'`、`audioStatus='skipped'`、`CaseAiResult` 字段正确、假 Provider 收到 1 次 `/chat/completions`。
    - 覆盖失败路径：队列为空时返回 `QUEUE_EMPTY` 或明确 `failed` 状态，测试必须诚实红。
  - 验收：该测试在本地和 CI 通过；复用现有 `process-api.test.ts` 的 mock 数据生成方式。

- **commit 2.3** `test(e2e): 建立 UI 契约测试（浏览器 + 拦截 /process）`
  - 文件：`e2e/ci/nana-ui-contract.spec.ts`（新增）、`e2e/ci/nana-golden-path.spec.ts`（修改或拆分）
  - 内容：
    - 浏览器只验证页面状态：拍题 → 保存 → “已收好” → 整理状态 → 结果卡展示。
    - 用 `page.route()` 拦截 `/api/nana/cases/*/process`，返回固定成功/失败响应。
    - mock 响应必须先经过与生产响应相同的 Zod/schema 校验（使用 `src/lib/nana/case-analyzer.ts` 或共享 schema 的 `processResponseSchema`）。
    - 不验证 DB 细节（DB 细节由 API 契约测试覆盖）。
    - 保留虚拟麦克风配置，但 CI 下 audio 链路仍跳过（组件竞态根因未定位）。
  - 验收：UI 契约测试在 CI 通过；拦截响应的 schema 校验失败时测试红。

- **commit 2.4** `test(e2e): 保留单条开发栈 Canary`
  - 文件：`e2e/ci/nana-canary.spec.ts`（新增）
  - 内容：
    - 只保留一条路径：浏览器 → 真实 route → 真实 DB → 假 Provider（不拦截 `/process`）。
    - 使用固定响应队列。
    - 仅验证：流程走通、页面关键文案出现、DB 有 `CaseAiResult`。
    - 明确标注为“开发栈全链路测试（next dev）”，不是生产 artifact Canary。
    - 在 `playwright.config.ts` 中仅对 `nana-canary.spec.ts` 设置 `workers: 1`、`retries: 0`。
  - 验收：Canary 在 CI nightly 运行；main push 失败阻塞合入（通过 ci.yml 条件控制）。

- **commit 2.5** `chore(ci): 拆分 e2e-test job 为 ui-contract-test / api-contract-test / canary-test`
  - 文件：`.github/workflows/ci.yml`（修改）
  - 内容：
    - `ui-contract-test`：push/PR 硬门禁，跑 `nana-ui-contract.spec.ts`。
    - `api-contract-test`：push/PR 硬门禁，跑 `process-api-contract.test.ts`（可并入 `integration-test` job 或独立）。
    - `canary-test`：仅在 `schedule` / `main` push 触发，跑 `nana-canary.spec.ts`；`main` 构建产物失败必须阻塞（nightly 只告警）。
    - 所有 job 失败时保留 A3 Dump step 和 evidence pack 上传。
    - 由于 API 契约测试需要真实 Next 服务，考虑将其并入 `e2e-test` 改造后的 `api-contract-test` job（启动服务成本高，复用一次启动跑多个 spec）。
  - 验收：CI 三个 job 各司其职，main push 时 Canary 失败阻塞合并。

- **commit 2.6** `test(e2e): 调整现有 E2E spec 以复用现有测试`
  - 文件：`e2e/ci/nana-batch-path.spec.ts`（修改或删除）、`e2e/ci/nana-cross-user.spec.ts`（修改或删除）、`e2e/ci/nana-sequential-capture.spec.ts`（修改）、`e2e/ci/nana-main-flow.spec.ts`（删除）
  - 内容：
    - `nana-batch-path.spec.ts`：若批量场景逻辑可用 API 契约测试覆盖，则删除或改为少量 UI 断言；否则保留为 API 契约测试的一部分。
    - `nana-cross-user.spec.ts`：跨用户隔离已有 `map-evidence.test.ts` 和 `process-api.test.ts` 覆盖；若重复则删除。
    - `nana-sequential-capture.spec.ts`：保持 `test.fixme` 直到素材组 B fixture 就位；就位后改为 UI 契约测试 + API 契约测试组合（不新增文件）。
    - `nana-main-flow.spec.ts`：合并进 Canary 或删除，避免重复。
  - 验收：删除文件列表经用户确认；CI 总 spec 数减少，不重复覆盖。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/test-env-prepare.ts` | 新增 | 统一测试环境准备入口，含临时 DB 白名单、profile、安全校验 |
| `tsconfig.e2e.json` | 新增 | e2e 目录独立类型检查 |
| `e2e/helpers/fake-provider-server.ts` | 修改 | 固定响应队列替代动态哈希注册 |
| `e2e/helpers/register-fixture.ts` | 删除 | 动态哈希注册取消 |
| `e2e/helpers/process-response-logger.ts` | 新增 | 捕获并打印 `/process` 完整业务响应 |
| `e2e/ci/nana-golden-path.spec.ts` | 修改 | 修复异步监听 bug；增加响应体捕获 |
| `e2e/ci/nana-ui-contract.spec.ts` | 新增 | UI 契约测试（页面状态 + 拦截 `/process` + schema 校验） |
| `e2e/ci/nana-canary.spec.ts` | 新增 | 单条开发栈全链路测试（浏览器→真实 route→真实 DB→假 Provider） |
| `e2e/ci/nana-batch-path.spec.ts` | 修改或删除 | 若重复则删除，否则改为 API 契约测试场景 |
| `e2e/ci/nana-cross-user.spec.ts` | 修改或删除 | 若重复则删除 |
| `e2e/ci/nana-sequential-capture.spec.ts` | 修改 | 保持 `test.fixme`；素材就位后改 UI/API 契约组合 |
| `e2e/ci/nana-main-flow.spec.ts` | 删除 | 合并进 Canary 或删除 |
| `e2e/ci/_diagnose-audio.spec.ts` | 删除 | 临时诊断 spec 清理 |
| `src/__tests__/integration/nana/process-api.test.ts` | 修改 | 优先复用，补 200+failed 根因回归测试 |
| `src/__tests__/integration/nana/process-api-contract.test.ts` | 可能新增 | 仅当 `process-api.test.ts` 无法覆盖真实 HTTP 契约时新增；优先复用 |
| `src/__tests__/integration/nana/map-evidence.test.ts` | 可能修改 | 确认覆盖已满足，不重复新增 domain-invariants |
| `src/app/api/nana/cases/[id]/process/route.ts` | 修改 | 删除 `[process-route DEBUG]` 诊断写入；可能需修复业务根因 |
| `src/app/nana/capture/page.tsx` | 修改 | 删除 `[ctrl-diag]` 调试日志；可能需修复业务根因 |
| `src/lib/nana/case-analyzer.ts` | 可能修改 | 若证据显示根因在此，修复异常吞掉问题 |
| `playwright.config.ts` | 修改 | 设置 `workers:1`/`retries:0`、移除哈希注册配置、Canary 项目配置 |
| `.github/workflows/ci.yml` | 修改 | 统一 `test:env:prepare`、拆分护栏 job、main 失败阻塞 |
| `package.json` | 修改 | 新增 `test:env:prepare`、`test:e2e:types` 脚本 |
| `doc/DECISIONS.md` | 追加 | 登记测试环境入口和 DB 安全规则 |
| `doc/active_spec.md` | 更新 | A-1 状态与暂停项说明 |
| `doc/executionlog/nana-test-framework-remediation-log.md` | 新增 | 执行日志（每 PR 完成后追加） |
| `doc/auditlog/nana-test-framework-remediation-audit.md` | 可能新增 | 审计报告（PR 收尾后由 audit-agent 产出） |

**注**：`scripts/start-test-stack.ts` 不在本轮清单中，明确不做。

---

## 4. 验收标准

### 4.1 PR-0 验收标准（必须先完成）

- [ ] `e2e/ci/nana-golden-path.spec.ts` 的 `requestfinished` 监听器不再调用 `req.response()?.status()` 同步读异步响应；类型检查无错。
- [ ] CI 跑一次 golden-path 后，日志中能直接看到 `/process` 的 `HTTP status`、`body.status`、`body.error`、`body.audioStatus`、对应 `CaseAiResult` 的 `processingStatus` 和 `error`。
- [ ] 定位当前 `/process` HTTP 200 但 `body.status='failed'` 的根因（产生一条一句话根因说明和复现步骤）。
- [ ] 在现有 `process-api.test.ts` 中补一条回归测试，该测试在修复前红、修复后绿。
- [ ] `route.ts` 的 `[process-route DEBUG]` 三处 `fs.appendFileSync`、`capture/page.tsx` 的 `[ctrl-diag]` 八处日志、`_diagnose-audio.spec.ts` 已删除；A2/A3/D1/D4 长期护栏保留。
- [ ] `git grep -E '\[process-route DEBUG\]|\[ctrl-diag\]|_diagnose-audio'` 无结果。

### 4.2 PR-1 验收标准

- [ ] `npm run test:env:prepare -- --profile=domain` 在本地和 CI 都能成功：创建临时 DB、跑 schema、跑 seed、验证数量、输出 JSON。
- [ ] 当 `DATABASE_URL` 指向 `data/test/` 以外路径时，`test:env:prepare` exit 1 并输出 `errorCode: DATABASE_URL_NOT_IN_WHITELIST` 和绝对路径信息。
- [ ] `test:env:prepare` 脚本内部不调用 `prisma db push --accept-data-loss`；schema 变更时明确拒绝破坏性操作。
- [ ] `--profile=domain` 不检查 Provider 变量；`--profile=api` 检查 Provider 变量；`--profile=ui` 不强制 Provider（若 UI 契约不拦截 Provider）。
- [ ] `.github/workflows/ci.yml` 的 `integration-test` 和 `e2e-test` job 不再手写 `prisma db push`/`seed`/`seed_graph`/`seed_textbook_topics` 命令，统一调用 `test:env:prepare`。
- [ ] `tsconfig.e2e.json` 存在，`npm run test:e2e:types` 在 CI 中通过；PR-0 的异步监听 bug 被修复或类型检查通过。
- [ ] `doc/DECISIONS.md` 追加 D-16（测试环境入口与安全规则）。

### 4.3 PR-2 验收标准

- [ ] 假 Provider 使用固定响应队列；`register-fixture.ts` 已删除；`playwright.config.ts` 对受影响 spec 设置 `workers: 1` 和 `retries: 0`；`beforeEach` 清空队列。
- [ ] API 契约测试存在且通过：真实 Next 服务 + 真实 HTTP 调用 `/process` + image-only + 断言 `body.status='success'`、`audioStatus='skipped'`、落库正确、假 Provider 收到 1 次请求。
- [ ] UI 契约测试存在且通过：浏览器 + 拦截 `/process` + mock 响应经过 schema 校验 + 页面状态流转断言；不查 DB。
- [ ] Canary 测试存在且通过：浏览器 → 真实 route → 真实 DB → 假 Provider；明确标注为“开发栈全链路测试（next dev）”。
- [ ] CI 中 `ui-contract-test` 和 `api-contract-test` 在 push/PR 上失败即阻塞；`canary-test` 在 `main` push 失败也阻塞，nightly 失败只告警。
- [ ] 不新增 `domain-invariants.test.ts`；现有 `process-api.test.ts` 和 `map-evidence.test.ts` 覆盖已确认；若确实需要拆分，在 PR-2 末尾经用户确认后新增。
- [ ] 删除 `nana-main-flow.spec.ts`；`nana-batch-path.spec.ts` / `nana-cross-user.spec.ts` 要么删除要么并入 API 契约测试；`nana-sequential-capture.spec.ts` 保持 `test.fixme` 并写明素材组 B 就位后的重写方式。

### 4.4 整体 CI 验收标准（三轮合并后）

- [ ] 连续 10 次 CI（含 PR 与 schedule）无 flaky：同一条 spec 在没有代码变更的情况下连续 10 次结果一致。
- [ ] 缺 seed 时 `test:env:prepare` 在浏览器启动前 30 秒内 exit 1 并打印明确原因。
- [ ] `/process` 失败时，一次 CI 就能看到是环境、HTTP、业务状态还是 Provider 层问题。
- [ ] 本地 `npm run test:env:prepare -- --profile=domain` + `npm run test:unit` + `npm run test:integration` + `npm run test:e2e:types` 可跑（本地不启动服务，不跑 API/Canary 契约测试）。
- [ ] 生产 artifact Canary 不进入本轮；后续 PR 单独规划。

---

## 5. 风险与注意事项

### 5.1 测试数据库安全（重点）

- `test:env:prepare` 必须自己生成绝对临时路径（`data/test/<job-id>.db`），拒绝外部传入的非测试目录数据库。
- 执行前必须校验绝对路径位于允许的测试目录（如 `<repo>/data/test/`），否则 exit 1 并输出 `errorCode: DATABASE_URL_NOT_IN_WHITELIST`。
- 只允许删除/重建该临时文件；禁止对普通 `DATABASE_URL` 使用 `--accept-data-loss`。
- 输出必须包含 `errorCode` 和 `errorMessage`，`catch` 中不能把真实异常吞掉（用 `console.error` 或结构化 JSON 输出）。
- 脚本是破坏性操作（会删除临时 DB 文件），但作用域严格限定在白名单临时目录；执行前仍需在计划/执行日志中向用户说明这一点，等待用户确认（AGENTS.md 铁律 1）。

### 5.2 上游文件修改

- `.github/workflows/ci.yml` 追踪自上游 `wrong-notebook`。本次修改属于 Nana 自有增量，commit message 必须标注 `⚠️上游文件修改`，方便以后 sync-upstream 时识别潜在冲突点。
- `package.json`、`playwright.config.ts` 也有上游继承关系，改动尽量以新增 scripts / 最小增量方式完成，不重排原结构。
- 必须修改上游已有文件时，只做最小增量添加，不重排原结构。

### 5.3 安全铁律

- **铁律 1（破坏性操作须确认）**：删除文件（`register-fixture.ts`、`_diagnose-audio.spec.ts`、`nana-main-flow.spec.ts` 等）、修改 CI 数据库初始化步骤、运行可能删除测试 DB 的脚本前，必须向用户说明后果并确认。
- **铁律 3（不改上游表结构）**：本轮只新增测试相关文件，不修改 `prisma/schema.prisma` 中任何已有 model。测试用到的临时数据通过 seed 和事务隔离实现。
- **铁律 4（密钥不入 git）**：`test-env-prepare.ts` 只检查 env 存在性，不打印 env 值；CI 中继续通过 `secrets` 或 GitHub Actions env 注入 `VOLCENGINE_API_KEY` 等敏感变量。`.env` 已在 `.gitignore` 中，提交前检查 `git status` 确认没有 `.env` 被 staged。
- **铁律 5（遇错停下来）**：PR-0 中如果 `/process` 200+failed 的根因证据不明确，不要猜测性修复，必须停下来向用户汇报证据并请用户确认下一步。
- **铁律 6（显式失败，不掩盖）**：任何步骤若被静默跳过、未验证、或结果不确定，绝不可宣称“已完成/已通过/正常”。例如 `test:env:prepare` 若跳过某条 seed 必须报数；E2E 若跳过录音步骤必须在日志中明确说明。

### 5.4 治理约束

- **不新增“假设验证代理”**：三代理保持 plan/execute/audit 不变。本轮通过调整任务状态机来强化诊断纪律：失败 → Diagnosing → 根因证据成立 → Plan → Execute → Audit。
- **不扩大范围到产品功能开发**：本轮不碰 TD-006（手动改课本分类）、打印页、DELETE API、ASR 真实录音质量等产品功能，只修复测试框架和 CI 诊断能力。
- **不修改 `doc/agents/*.md` canonical 文件**：除非用户明确要求调整角色定义，否则本轮只改 `doc/active_spec.md` 和 `doc/DECISIONS.md` 中的状态/决策记录，不触发 agent sync。
- **不新增假设验证代理**：按评审要求，三代理保持 plan/execute/audit 不变。
- **不扩大范围到产品功能开发**：本轮不碰 TD-006（手动改课本分类）、打印页、DELETE API、ASR 真实录音质量等产品功能，只修复测试框架和 CI 诊断能力。

### 5.5 技术风险

- **Windows 本地 Docker 仍然不可用**：本地无法跑测试容器，所有测试容器门禁继续 100% 依赖 GitHub Actions。计划执行时必须在执行日志中诚实记录这一点。
- **Next.js dev mode vs standalone 生产模式差异**：Canary 仍可能暴露生产模式独有的问题，但这不在本轮修复范围内；本轮只确保测试失败时能分层定位。生产 artifact Canary 作为后续 PR。
- **素材组 B fixture 缺失**：`nana-sequential-capture.spec.ts` 的跨章节/竞态场景依赖脱敏题图，教研线未提供前只能保持 `test.fixme`。
- **假 Provider 队列串场**：必须通过 `workers: 1`、`retries: 0`、`beforeEach` 清空队列来规避。D4 的自动 retry 不应成为永久护栏，它会产生重复写入并扰乱队列。
- **Canary 责任定义**：明确本轮 Canary 是“开发栈全链路测试（next dev）”，不是生产 artifact 验证。后续 PR 再对 Docker/GHCR 镜像运行 Canary。

---

## 6. 技术附录

### 6.1 `test:env:prepare` 安全实现

**命令**

```bash
# 本地 domain 测试（不需要 Provider）
npm run test:env:prepare -- --profile=domain

# API 契约测试（需要假 Provider）
npm run test:env:prepare -- --profile=api

# UI 契约测试（不需要 Provider，用 page.route 拦截）
npm run test:env:prepare -- --profile=ui

# Canary（开发栈全链路）
npm run test:env:prepare -- --profile=canary
```

**`package.json` 脚本**

```json
{
  "scripts": {
    "test:env:prepare": "tsx scripts/test-env-prepare.ts"
  }
}
```

**`scripts/test-env-prepare.ts` 核心逻辑（伪代码）**

```typescript
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid'; // 或内部实现

interface PreflightReport {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  dbPath: string;
  schemaOk: boolean;
  seedOk: boolean;
  counts: {
    knowledgeNode: number;
    textbookTopic: number;
    textbookNodeMapping: number;
  };
  envOk: boolean;
  missingEnv: string[];
  durationMs: number;
}

const ALLOWED_TEST_DIR = path.resolve(process.cwd(), 'data/test');

function resolveDbPath(): string {
  const jobId = process.env.GITHUB_RUN_ID || nanoid();
  const dbName = `test-${jobId}.db`;
  return path.join(ALLOWED_TEST_DIR, dbName);
}

function validateDbPath(dbPath: string): void {
  const abs = path.resolve(dbPath);
  const allowedAbs = path.resolve(ALLOWED_TEST_DIR);
  const relative = path.relative(allowedAbs, abs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`DATABASE_URL_NOT_IN_WHITELIST: ${abs} 不在 ${allowedAbs} 下`);
  }
}

async function main(): Promise<void> {
  const start = Date.now();
  const report: PreflightReport = {
    ok: false,
    dbPath: '',
    schemaOk: false,
    seedOk: false,
    counts: { knowledgeNode: 0, textbookTopic: 0, textbookNodeMapping: 0 },
    envOk: false,
    missingEnv: [],
    durationMs: 0,
  };

  try {
    // 1. 确定 DB 路径并写回环境变量
    const dbPath = resolveDbPath();
    report.dbPath = dbPath;
    validateDbPath(dbPath);
    process.env.DATABASE_URL = `file:${dbPath}`;

    // 2. 按 profile 检查 env
    const profile = process.argv.includes('--profile=domain') ? 'domain'
      : process.argv.includes('--profile=api') ? 'api'
      : process.argv.includes('--profile=ui') ? 'ui'
      : process.argv.includes('--profile=canary') ? 'canary'
      : 'api'; // 默认 api

    const commonRequired = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
    const providerRequired = ['VOLCENGINE_API_KEY', 'VOLCENGINE_BASE_URL', 'LITE_ENDPOINT_ID'];
    const required = profile === 'domain' || profile === 'ui'
      ? commonRequired
      : [...commonRequired, ...providerRequired];

    for (const key of required) {
      if (!process.env[key]) report.missingEnv.push(key);
    }
    report.envOk = report.missingEnv.length === 0;
    if (!report.envOk) {
      throw new Error(`MISSING_ENV: ${report.missingEnv.join(', ')}`);
    }

    // 3. 安全删除并重建临时 DB 文件
    fs.mkdirSync(ALLOWED_TEST_DIR, { recursive: true });
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    // 4. schema + seed（不加 --accept-data-loss）
    execSync('npx prisma db push', { stdio: 'inherit' });
    execSync('npx prisma db seed', { stdio: 'inherit' });
    execSync('npx tsx prisma/seed_graph.ts', { stdio: 'inherit' });
    execSync('npx tsx prisma/seed_textbook_topics.ts', { stdio: 'inherit' });
    report.schemaOk = true;
    report.seedOk = true;

    // 5. 验证数量
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    report.counts.knowledgeNode = await prisma.knowledgeNode.count();
    report.counts.textbookTopic = await prisma.textbookTopic.count();
    report.counts.textbookNodeMapping = await prisma.textbookNodeMapping.count();
    await prisma.$disconnect();

    report.ok =
      report.counts.knowledgeNode >= 48 &&
      report.counts.textbookTopic === 16 &&
      report.counts.textbookNodeMapping === 48;

    if (!report.ok) {
      throw new Error(
        `SEED_COUNT_MISMATCH: KnowledgeNode=${report.counts.knowledgeNode}, TextbookTopic=${report.counts.textbookTopic}, TextbookNodeMapping=${report.counts.textbookNodeMapping}`
      );
    }
  } catch (e) {
    report.ok = false;
    if (!report.errorCode) {
      report.errorCode = 'UNKNOWN_ERROR';
      report.errorMessage = e instanceof Error ? e.message : String(e);
    }
    // 显式打印原始错误，不吞掉
    console.error('[test-env-prepare] failed:', e);
  } finally {
    report.durationMs = Date.now() - start;
    console.log(JSON.stringify(report));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
```

**关键点**

- 路径解析：把 `file:` 协议去掉后，用 `path.resolve` 求绝对路径，再用 `path.relative` 判断是否落在白名单目录内。
- 拒绝外部传入：如果用户设 `DATABASE_URL=file:/app/data/dev.db` 或 `file:../prod.db`，直接拒绝。
- 不加 `--accept-data-loss`：schema 变更走正常 migration 流程，破坏性变更需要人工确认。
- 输出：stdout 最后一行是 JSON；stderr 打印原始错误；exit 0/1 表示通过/失败。

### 6.2 固定响应队列 + workers:1 / 禁止重试 / beforeEach 清空

**`e2e/helpers/fake-provider-server.ts` 核心逻辑（伪代码）**

```typescript
interface QueuedResponse {
  content: string; // JSON.stringify(analyzeCase 结果)
  delayMs?: number;
}

const queue: QueuedResponse[] = [];

function handleControl(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url === '/__test/queue' && req.method === 'POST') {
    const body = await readBody(req);
    queue.push(...body.items);
    res.end(JSON.stringify({ queued: body.items.length, total: queue.length }));
    return;
  }
  if (req.url === '/__test/queue' && req.method === 'DELETE') {
    queue.length = 0;
    res.end(JSON.stringify({ cleared: true }));
    return;
  }
}

function handleChatCompletions(req, res) {
  const item = queue.shift();
  if (!item) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'QUEUE_EMPTY', message: '测试未压入 mock 响应' }));
    return;
  }
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-fake',
      choices: [{ message: { role: 'assistant', content: item.content }, finish_reason: 'stop' }],
    }));
  }, item.delayMs ?? 0);
}
```

**`playwright.config.ts` 配置**

```typescript
export default defineConfig({
  workers: 1,
  retries: 0,
  // ... 其他配置
});
```

**spec 中 `beforeEach` 清空队列**

```typescript
test.beforeEach(async () => {
  await fetch(`${FAKE_PROVIDER_BASE_URL}/__test/queue`, { method: 'DELETE' });
});
```

**为什么推荐 workers:1 而不是命名空间**

- 当前项目规模小，workers:1 简单可靠，避免 Playwright 重试、并行 worker 或多个请求并发时题 A 消费题 B 的响应。
- 不引入测试运行 ID 命名空间，减少复杂度。

### 6.3 API 契约测试：明确是真实 HTTP 调用

**契约层级说明**

| 层级 | 是否启动真实 Next 服务 | 是否发真实 HTTP | 验证能力 | 本轮用途 |
|---|---|---|---|---|
| 直接 import handler | 否 | 否 | 单元/集成逻辑 | 已有 `process-api.test.ts` 使用，覆盖权限、事务、落库 |
| 启动真实 Next 服务后发 HTTP | 是 | 是 | 路由注册、中间件、NextAuth cookie、请求解析、OpenAI SDK 调用链 | 本轮新增 API 契约测试，覆盖 `/process` 完整 HTTP 链路 |

**为什么本轮需要真实 HTTP 层级**

- 已有 `process-api.test.ts` 是 mock Next.js 模块后直接 import handler，不能覆盖 `route.ts` 模块加载、OpenAI SDK 初始化、NextAuth session 解析等真实链路。
- 17 轮 CI 的故障正发生在真实 Next 服务 + Playwright webServer 环境下，所以必须在真实 HTTP 层级补一条契约测试。

**实现方式**

- 在 `api-contract-test` job 中：
  1. `npm run test:env:prepare -- --profile=api`
  2. 启动假 Provider（`npx tsx scripts/start-fake-provider.ts`）
  3. 启动 Next.js dev server（`npx next dev`）
  4. 用 Playwright `APIRequestContext` 或 `node-fetch` 发真实 HTTP POST 到 `/api/nana/cases/:id/process`
  5. 断言响应和落库
- 也可以复用 Playwright 的 `request` fixture，在 `api-contract-test` job 中不启动浏览器，只发 HTTP。

**image-only 路径**

- 本轮 API 契约测试只验证 image-only（无音频）路径。
- 完整音频链路（录音→转码→转写）继续按计划暂停，由本地/真机抽检覆盖；音频转码已有独立单元测试。

### 6.4 UI 契约 mock 响应的 Zod/schema 校验

**目的**：防止前后端契约漂移。UI 契约测试用 `page.route()` 拦截 `/process`，但拦截返回的响应必须和生产的响应结构一致。

**实现方式**

1. 在 `src/lib/nana/case-analyzer.ts` 或共享位置定义 `processApiResponseSchema`（Zod）。
2. UI 契约测试中从固定响应队列 fixture 取 mock 数据，先用 `processApiResponseSchema.parse()` 校验，再作为拦截响应体。

```typescript
import { z } from 'zod';
import { processApiResponseSchema } from '@/lib/nana/case-analyzer';

const mockResponse = processApiResponseSchema.parse({
  status: 'success',
  transcript: null,
  questionSummary: '判断函数单调性',
  textbookTopic: { id: 'TB-010', name: '函数的基本性质' },
  initialFeedback: '你很仔细',
  possibleMistakeReason: '可能符号出错',
  nextActionSuggestion: '回看 3.2 函数的基本性质',
  audioStatus: 'skipped',
});

await page.route('**/api/nana/cases/*/process', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockResponse),
  });
});
```

**约束**

- 如果 schema 变更（如新增字段），UI 契约测试的 mock 必须同步更新，否则 `parse()` 失败 → 测试红，强制前后端对齐。
- 若项目尚未使用 Zod，可用 TypeScript 类型守卫或 JSON schema 替代，但优先复用现有 `case-analyzer.ts` 的校验逻辑。

### 6.5 诊断监听 bug 修复和分层证据打印

**原错误（`e2e/ci/nana-golden-path.spec.ts` line 206）**

```typescript
page.on('requestfinished', (req) => {
  if (req.url().includes('/process')) {
    console.log(`[e2e-diag] requestfinished ${req.url()} status=${req.response()?.status()}`);
  }
});
```

**修复方式 B（推荐）**：改用 `response` 事件，`res` 已经是 `Response` 对象，无需 await。

```typescript
page.on('response', (res) => {
  if (res.url().includes('/process')) {
    console.log(`[e2e-diag] response ${res.url()} status=${res.status()}`);
  }
});
```

**分层证据打印（`e2e/helpers/process-response-logger.ts`）**

```typescript
export async function logProcessOutcome(
  page: Page,
  prisma: PrismaClient,
  caseId: string,
) {
  const response = await page.waitForResponse(
    (res) => res.request().method() === 'POST' && /\/api\/nana\/cases\/[^/]+\/process$/.test(res.url()),
  );
  const status = response.status();
  const text = await response.text();
  let body: { status?: string; error?: string; audioStatus?: string } | null = null;
  try { body = JSON.parse(text); } catch { /* ignore */ }

  const aiResult = await prisma.caseAiResult.findUnique({ where: { caseId } });

  console.log(`[process-outcome] HTTP status=${status}`);
  console.log(`[process-outcome] body.status=${body?.status}`);
  console.log(`[process-outcome] body.error=${body?.error}`);
  console.log(`[process-outcome] body.audioStatus=${body?.audioStatus}`);
  console.log(`[process-outcome] CaseAiResult.processingStatus=${aiResult?.processingStatus}`);
  console.log(`[process-outcome] CaseAiResult.error=${aiResult?.error}`);
}
```

### 6.6 CI workflow 修改

**`integration-test` job 调整**

```yaml
integration-test:
  runs-on: ubuntu-latest
  name: Integration Tests
  needs: unit-test
  env:
    DATABASE_URL: "file:./data/test/test.db" # 指向仓库内白名单目录
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'npm' }
    - run: npm ci
    - run: npx prisma generate
    - name: Prepare test environment
      run: npm run test:env:prepare -- --profile=domain
    - run: npm run test:integration
```

**`e2e-test` job 拆分为 `ui-contract-test` / `api-contract-test` / `canary-test`**

```yaml
ui-contract-test:
  runs-on: ubuntu-latest
  name: UI Contract Tests
  needs: build-check
  timeout-minutes: 30
  env:
    DATABASE_URL: "file:./data/test/test.db"
    NEXTAUTH_SECRET: "ci-secret-value-123456"
    NEXTAUTH_URL: "http://127.0.0.1:3000"
    # UI 契约不需要 Provider，用 page.route 拦截
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'npm' }
    - run: npm ci
    - run: npx playwright install --with-deps
    - run: npm run test:env:prepare -- --profile=ui
    - run: npm run test:e2e:types
    - run: npx playwright test --project=mobile-chrome e2e/ci/nana-ui-contract.spec.ts
    - if: always()
      uses: actions/upload-artifact@v4
      with: { name: ui-contract-evidence, path: test-results/, retention-days: 14 }

api-contract-test:
  runs-on: ubuntu-latest
  name: API Contract Tests
  needs: build-check
  timeout-minutes: 30
  env:
    DATABASE_URL: "file:./data/test/test.db"
    NEXTAUTH_SECRET: "ci-secret-value-123456"
    NEXTAUTH_URL: "http://127.0.0.1:3000"
    VOLCENGINE_API_KEY: "fake-key"
    VOLCENGINE_BASE_URL: "http://127.0.0.1:3999"
    LITE_ENDPOINT_ID: "fake-endpoint"
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'npm' }
    - run: npm ci
    - run: npm run test:env:prepare -- --profile=api
    - run: |
        nohup npx tsx scripts/start-fake-provider.ts > /tmp/fake-provider.log 2>&1 &
        echo $! > /tmp/fake-provider.pid
        # ready check...
    - run: npx next dev & # 或等价方式启动 Next.js
    - run: npx playwright test --project=api-contract e2e/ci/nana-api-contract.spec.ts
    - if: always()
      run: |
        if [ -f /tmp/fake-provider.pid ]; then kill $(cat /tmp/fake-provider.pid) || true; fi
    - if: always()
      uses: actions/upload-artifact@v4
      with: { name: api-contract-evidence, path: test-results/, retention-days: 14 }

canary-test:
  runs-on: ubuntu-latest
  name: Development Stack Canary
  needs: build-check
  if: github.event_name == 'schedule' || github.ref == 'refs/heads/main'
  timeout-minutes: 30
  env:
    DATABASE_URL: "file:./data/test/test.db"
    NEXTAUTH_SECRET: "ci-secret-value-123456"
    NEXTAUTH_URL: "http://127.0.0.1:3000"
    VOLCENGINE_API_KEY: "fake-key"
    VOLCENGINE_BASE_URL: "http://127.0.0.1:3999"
    LITE_ENDPOINT_ID: "fake-endpoint"
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'npm' }
    - run: npm ci
    - run: npx playwright install --with-deps
    - run: npm run test:env:prepare -- --profile=canary
    - run: |
        nohup npx tsx scripts/start-fake-provider.ts > /tmp/fake-provider.log 2>&1 &
        echo $! > /tmp/fake-provider.pid
        # ready check...
    - run: npx playwright test --project=mobile-chrome e2e/ci/nana-canary.spec.ts
    - if: always()
      run: |
        if [ -f /tmp/fake-provider.pid ]; then kill $(cat /tmp/fake-provider.pid) || true; fi
    - if: always()
      uses: actions/upload-artifact@v4
      with: { name: canary-evidence, path: test-results/, retention-days: 14 }
```

**注意**

- `api-contract-test` 和 `canary-test` 都需要启动假 Provider 和 Next.js，成本高；若 CI 资源有限，可合并到一个 job 中但用多个 step 分别跑不同 spec。拆成独立 job 更清楚，但需重复启动服务。
- `canary-test` 在 `main` push 时失败必须阻塞合入；nightly 失败只告警（通过 `if: github.ref == 'refs/heads/main'` 或 job 状态控制）。
- 所有 job 保留 A3 Dump step 和 evidence pack 上传，但 dump 内容从临时文件转为 `test-env-prepare` 的 JSON 输出和 Playwright 日志。

### 6.7 测试覆盖映射（不复用默认新增 domain-invariants）

**现有测试覆盖对照**

| 测试文件 | 已覆盖 | 本轮是否复用/调整 |
|---|---|---|
| `src/__tests__/integration/nana/process-api.test.ts` | 权限、双层标签、重复处理、失败状态、持久化数据 | 复用，补 200+failed 根因回归 |
| `src/__tests__/integration/nana/map-evidence.test.ts` | 不写 StudentNodeState、跨用户隔离、caseEvidenceCount | 复用，不新增 domain-invariants |
| `e2e/ci/nana-golden-path.spec.ts` | 黄金路径 UI 闭环 | 修复监听 bug，拆出 UI 契约 |
| `e2e/ci/nana-batch-path.spec.ts` | 批量同章节 | 删除或并入 API 契约 |
| `e2e/ci/nana-cross-user.spec.ts` | 跨用户隔离 | 删除（已被 map-evidence / process-api 覆盖） |
| `e2e/ci/nana-main-flow.spec.ts` | 快速冒烟 | 删除或并入 Canary |

**新增文件最小化原则**

- 优先修改/复用现有文件。
- 只有当 `process-api.test.ts` 的 mock 模式无法覆盖真实 HTTP 契约时，才新增 `process-api-contract.test.ts`。
- 只有当现有 `map-evidence.test.ts` 和 `process-api.test.ts` 覆盖不足时，才考虑新增 `domain-invariants.test.ts`，且需经用户确认。

---

> 本计划待用户确认后方可进入执行阶段。
