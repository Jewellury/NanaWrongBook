# CI /process 静默失败 · AbortController 诊断 · 阶段 1 执行日志

> 关联计划：[doc/plan/ci-process-abortcontroller-fix-plan.md](../plan/ci-process-abortcontroller-fix-plan.md)（§2 阶段 1）
> 关联上一轮执行日志：[nana-test-framework-ci-fix-log.md](nana-test-framework-ci-fix-log.md)（v1 + v2，/process handler 在 CI 不执行的矛盾定位）
> 开始时间：2026-07-28
> 执行者：execute-agent
> 任务范围：**仅阶段 1 的 D1-D4 诊断任务**（D5 清理 + 阶段 2 修复本轮不做）

---

## 任务范围声明

本轮严格按计划 §2 阶段 1 节执行 4 个诊断任务，**未做**：
- D5（清理诊断日志）——需先跑一轮 CI 拿到证据
- 阶段 2 R1-R6（修复 + 护栏）——需先确认根因
- next.config.ts / Dockerfile / playwright.config.ts 改动（用户硬约束）
- 关闭 React Strict Mode（用户硬约束）
- Prisma schema 改动（铁律 3）
- 任何 commit（留给主会话统一收口）

---

## 执行记录

### 任务 D2：route 入口日志前置到鉴权之前

- **涉及文件**：`src/app/api/nana/cases/[id]/process/route.ts`
- **做了什么**：
  1. 把原 line 276-282 的 `[process-route DEBUG]` env 日志块**从 `getServerSession` 之后移到 POST 函数体第一行**（鉴权之前）。注释更新为 `[DEBUG CI 2026-07-28]`，说明本轮诊断目的（区分 handler 没被调到 / 401 / 500）
  2. 在 `if (!session?.user?.id) return unauthorized();` 之后新增：`console.log("[process-route DEBUG] auth result: ...")`——**只打印 ok/unauthorized，不打印 userId 值**（铁律 4）
  3. 在 try 块内 `const { id } = await params;` 之后新增：`console.log("[process-route DEBUG] handler executing for caseId=${id}")`
- **改动后关键行号**：
  - env 日志：line 273-282（POST 函数体开头、getServerSession 之前）
  - `const session = await getServerSession(authOptions);`：line 284
  - `if (!session?.user?.id) return unauthorized();`：line 285
  - auth result 日志：line 286
  - `try {`：line 288
  - `const { id } = await params;`：line 289
  - handler executing 日志：line 290
- **铁律 4 遵守**：env 日志保持 `(set)`/`(unset)` 格式（不打值）；auth 日志只打 `ok`/`unauthorized`（不打 token/userId）；caseId 是业务 ID（非敏感），按计划允许打印
- **结果**：✅ 完成

### 任务 D3：前端 controller 生命周期日志

- **涉及文件**：`src/app/nana/capture/page.tsx`
- **做了什么**：统一前缀 `[ctrl-diag]`，在 5 类节点（共 8 处，因 handleSave 和 handleRetryProcess 各有创建/POST前/catch）加临时 console.log：
  1. **controller 创建点（保存路径）**：handleSave 内 `new AbortController()` 之后、`setProcessState("processing")` 之前——line 224
  2. **POST 调用前（保存路径）**：handleSave 内 try 块第一行、`await triggerCaseProcess` 之前——line 228
  3. **POST catch（保存路径）**：handleSave catch 块第一行、AbortError 判断之前——line 236
  4. **轮询 effect setup**：early return 之后、`const ac = abortControllerRef.current ?? ...` 之前——line 262
  5. **轮询 effect cleanup**：cleanup return 内、`ac.abort()` 之前——line 295
  6. **controller 创建点（重试路径）**：handleRetryProcess 内——line 309
  7. **POST 调用前（重试路径）**：handleRetryProcess try 块第一行——line 314
  8. **POST catch（重试路径）**：handleRetryProcess catch 块第一行——line 322
- **日志内容**（按计划格式）：
  - 创建点：`created controller for caseId=${id}, signal.aborted=${ac.signal.aborted}`
  - POST 前：`POST triggered, signal.aborted=${ac.signal.aborted}, caseId=${...}`
  - POST catch：`POST catch, err.name=${err instanceof Error ? err.name : 'unknown'}, signal.aborted=${ac.signal.aborted}`
  - 轮询 setup：`poll effect setup, processState=..., savedCaseId=..., ref signal.aborted=...`
  - 轮询 cleanup：`poll effect cleanup, aborting controller, signal.aborted=...`
- **为什么 8 处而非 5 处**：计划描述的"5 个关键节点"是**节点类型**（创建/POST前/catch/轮询setup/轮询cleanup）；其中创建/POST前/catch 三类在 handleSave 和 handleRetryProcess 两条路径各加一处（同构 bug 必须双覆盖），故实际日志语句 3×2 + 1 + 1 = 8 处
- **结果**：✅ 完成

### 任务 D1：E2E 升级监听 /process 的真实命运

- **涉及文件**：`e2e/ci/nana-golden-path.spec.ts`
- **做了什么**：
  1. **在 S1 主路径 test 函数顶部**（test.setTimeout 之后、setupFixtureRegistration 之前）注册 4 个事件监听器 + 1 个计数器：
     - `page.on('requestfinished', ...)` → /process 完成时打印 URL + 状态码
     - `page.on('requestfailed', ...)` → /process 失败时打印 URL + errorText（**捕获 aborted 的关键证据**）
     - `page.on('response', ...)` → /process 收到响应时打印 URL + 状态码
     - `page.on('request', ...)` → /chat/completions 计数（chatCompletionsSeen++）
  2. **CL-04 step 内**：把 `page.waitForRequest(...)` 改为 `page.waitForResponse(...)`，匹配 POST /process。保留返回值 `processResponse`，后续 `await processResponse.json()` 采集 body.status
  3. **CL-04 step 末尾**：打印 /process response status + body.status
  4. **test 函数 finally 内**：打印 chatCompletionsSeen 总数（timeout 失败时也会走到 finally）
- **关键设计**：
  - 事件监听器放在 test 函数顶部（不在 test.step 内），确保 `chatCompletionsSeen` 变量作用域覆盖整个 test 函数体（含 finally）
  - waitForResponse 匹配条件用 `res.request().method() === 'POST'`（waitForRequest 用的是 `req.method()`，API 不同）
- **⚠️ 阶段 1 预期失败声明**（铁律 6）：
  - 若根因是"前端 abort 了 /process"，`waitForResponse` 会 timeout（30s）→ CL-04 失败 → 整个 S1 golden-path 在此停
  - **这是期望行为**：timeout 本身就是诊断证据（说明请求没成功到达服务端），不算回归
  - CL-05/06/07/10a/11/12/15 这些后续 step 不会执行——本轮不要求它们绿，只要拿诊断证据
- **结果**：✅ 完成（CL-04 在 CI 上预期失败，不算回归）

### 任务 D4：APIRequestContext 直调验证（区分前后端问题）

- **涉及文件**：`e2e/ci/nana-golden-path.spec.ts`
- **做了什么**：在 S1 describe 之后、S4 describe 之前**新增独立 describe** `nana-golden-path: D4 诊断 APIRequestContext 直调 /process`，内含一个 test：
  1. 注册 + 登录（走真实 UI，确保 NextAuth cookies 写入 `page.context()`）
  2. 进入拍题页 → 上传题图 → 点"收好这道题"
  3. `waitForResponse` 捕获 `/api/nana/cases`（createCase），确保 DB 有 case
  4. 从 DB 取 caseId（`getLatestCaseId`）
  5. **用 `page.context().request.post('/api/nana/cases/${caseId}/process')` 直调 /process**
  6. 断言 status=200 + body.status 非空
  7. finally 内 cleanupUserData + disposeReg
- **共享 cookies 的方式**（铁律 5：先确认正确写法）：
  - 用 `page.context().request` —— 这是 **BrowserContext 自带的 APIRequestContext**，自动共享 context 的 cookies（含 NextAuth session token）和 storageState
  - **不用** `request` fixture（独立 context，不带 cookies，需手动注入 storageState）
  - **不用** `request.newContext({ storageState })`（虽然可行，但多此一举）
  - URL 用相对路径 `/api/nana/cases/${caseId}/process`，baseURL 已在 playwright.config.ts 配置（CI=127.0.0.1:3000，本地=127.0.0.1:3025）
- **为什么独立 describe 而非 S1 内部**：
  - S1 用 `test.describe.serial`，若主路径 test 因 CL-04 timeout 失败，serial 模式会跳过 describe 内后续 test
  - D4 放独立 describe，**不受 S1 失败传播影响**，确保即使 CL-04 失败也能拿到"后端是否正常"的决定性证据
- **诊断逻辑**：
  - 直调 200 + body.status 非空 → 后端没问题，主路径失败是前端生命周期（aborted 实锤）
  - 直调 401 → 鉴权问题
  - 直调 500/其他 → 后端 route handler 有问题，需回 /plan 重新评估
- **结果**：✅ 完成

---

## 本地验证结果

| 验证项 | 命令 | 结果 |
|--------|------|------|
| eslint（3 文件） | `node node_modules/eslint/bin/eslint.js src/app/nana/capture/page.tsx "src/app/api/nana/cases/[id]/process/route.ts" e2e/ci/nana-golden-path.spec.ts` | ⚠️ **0 error，1 warning（pre-existing）** |
| build | `npm.cmd run build` | ✅ 通过（57 页面全编译，route + capture 页面完好） |

### eslint warning 详细说明（铁律 6：显式报告）

- **warning 内容**：`src/app/nana/capture/page.tsx:46:7 'SUCCESS_MSG' is assigned a value but never used`
- **是否本轮引入**：**否**。git diff 确认本轮 page.tsx 改动全部在 line 220+（新增 [ctrl-diag] 日志），未触及 line 46 的 SUCCESS_MSG 常量定义
- **execute-agent 处置**：**不清理**。清理 pre-existing warning 超出 D3 任务范围（D3 是加日志，不是清理常量）。本轮新增的日志代码本身 0 warning
- **建议**：留待主会话决策（可单独起一个微清理任务，或在阶段 2 R2 改 page.tsx 时顺手清理）

### 未跑的验证（按计划要求）

- ❌ **未跑完整 e2e**：需 webServer + fake provider 联调，门禁交 CI（本轮核心目的就是推 CI 拿证据）
- ❌ **未跑 Vitest 集成测试**：本轮没改 src/__tests__/（D1/D4 改的是 e2e/，不属于 Vitest 范畴）

---

## 安全铁律遵守清单

- [x] 铁律 1：无破坏性操作（未改 Prisma schema、未删文件、未跑破坏性命令）
- [x] 铁律 2：保持可回退（未 commit，工作区改动留给主会话审）
- [x] 铁律 3：不改上游表结构（未碰 prisma/）
- [x] **铁律 4：密钥不入日志**——D2 env 日志只打 `(set)`/`(unset)`；auth 日志只打 `ok`/`unauthorized`；caseId 是业务 ID 按计划允许打印
- [x] 铁律 5：遇错停下——D4 共享 cookies 方式先读 Playwright API 确认 `page.context().request` 是标准方式，不凭猜测写代码；eslint warning 先 git diff 确认是否本轮引入，不盲目清理
- [x] 铁律 6：显式失败不掩盖——CL-04 预期 timeout 失败已声明；eslint pre-existing warning 已显式报告；未跑的验证已标注原因

---

## 偏离记录

**无计划偏离**。所有改动严格按 D1-D4 任务描述执行。以下几点是"实现细节决策"（非偏离）：

1. **D4 放独立 describe 而非 S1 内部**：计划 §2 任务 D4 说"在 S1 describe 内或独立 describe"，两者都允许。选独立 describe 是为了不受 S1 serial 失败传播影响（确保 D4 一定执行）。这是计划允许范围内的实现选择，非偏离
2. **D1 事件监听器放 test 函数顶部**：计划说"在点击'收好这道题'之前注册"，test 函数顶部满足"之前"且作用域覆盖 finally（用于打印 chatCompletionsSeen），是实现细节
3. **D3 共 8 处日志而非 5 处**：计划"5 个关键节点"是节点类型，handleSave + handleRetryProcess 两条路径各覆盖（计划 §5.1 风险 A 明确要求 handleRetryProcess 一并覆盖），实际语句 8 处，符合计划意图

---

## 留给主会话的疑问/注意事项

1. **eslint pre-existing warning**：`SUCCESS_MSG` 未使用（line 46）。是否需要单独清理？execute-agent 默认不动（超出本轮范围）
2. **D4 的 createCase 等待方式**：D4 内用 `waitForResponse(/\/api\/nana\/cases$/)` 等 createCase 返回。如果前端 createCase 也被某种原因 abort（不太可能，createCase 不走 AbortController），D4 会卡住。当前设计假设 createCase 稳定（它确实不走 controller），主会话知悉即可
3. **CI 推送后预期看到的诊断证据**（按计划 §6.4 三种情况）：
   - **情况 A（aborted，预期最可能）**：`[ctrl-diag] POST triggered` → `poll effect setup` → `poll effect cleanup` → `POST catch, err.name=AbortError`；route.ts 的 `[process-route DEBUG]` **完全不出现**；D4 直调 **200 + status 字段**
   - **情况 B（401）**：`[process-route DEBUG] auth result: unauthorized`；D4 直调 401
   - **情况 C（500/其他）**：`[process-route DEBUG] handler executing` 后 route 内部报错；D4 直调 500
   4. **git status 改动文件**（未 commit，留给主会话）：
   - `src/app/api/nana/cases/[id]/process/route.ts`（D2：日志前置）
   - `src/app/nana/capture/page.tsx`（D3：8 处 [ctrl-diag] 日志）
   - `e2e/ci/nana-golden-path.spec.ts`（D1：监听器 + waitForResponse；D4：独立 describe 诊断用例）
   - `doc/executionlog/ci-process-abortcontroller-diagnose-stage1-log.md`（本文件）

---

## ➕ 追加：阶段 1 CI 跑完后的根因反转（2026-07-28，主会话追加）

> commit `73bb3d1` 已推 origin/dev，CI run 30316321387 (pull_request event) E2E Tests job **失败**。
> **本节由主会话在拉取 CI 日志分析后追加，记录根因反转——外部 AI 假设被 D4 诊断证据推翻。**

### CI 证据汇总

| 证据点 | 日志输出 | 出现次数 |
|--------|----------|---------|
| S1 主路径 /process response | `[e2e-diag] response .../process status=500` | 3 (3 retries) |
| S1 requestfailed | `[e2e-diag] requestfailed .../process errorText=net::ERR_ABORTED` | 3 |
| D4 直调状态码 | `[e2e-diag D4] direct POST status=500` | 3 |
| chat/completions 计数 | `[e2e-diag] chat/completions total seen: 0` | 3 |
| `[process-route DEBUG]` 日志 | **完全不出现** | 0 |
| `[ctrl-diag]` 前端日志 | **完全不出现** | 0（注：未加 `page.on('console')` 转发，不能下结论） |
| `[WebServer]` next dev 启动期输出 | baseline-browser-mapping / middleware / NextAuth 警告 | 仅启动期，test 期间无新增 |
| Build job | ✅ 通过（57 页面全编译，路由表含 `/api/nana/cases/[id]/process` 标记 ƒ 动态） |
| 其他 job | Unit / Integration / Build Check ✅ 全过；Docker Build skipped（CI 配置）；OCR ✅ |

### 根因反转（外部 AI 假设被推翻）

**原假设（外部 AI 评审）**：前端 AbortController 共用导致 POST 在 React Strict Mode effect cleanup 中被提前取消，请求 aborted，从未到达服务端。

**CI 证据指向的真实根因**：**后端 route handler 返回 500，POST 函数体第一行的 console.log 都没执行到**。这指向：
1. Next.js dev mode 第一次按需编译/加载 `/api/nana/cases/[id]/process/route.ts` 模块时崩溃
2. Next.js 框架捕获 import-time / 模块初始化错误并返回 500
3. route.ts POST 函数体的 console.log 因此从未执行
4. D4 用 APIRequestContext 直调（绕过前端 React 生命周期）同样 500，证明问题在后端

**为什么之前的"aborted"误判成立**：
- `waitForRequest` 只看请求对象创建事件，500 响应也能通过 → CL-04 看起来通过，到 CL-05 才暴露
- `requestfailed errorText=net::ERR_ABORTED` 在 500 响应后 11ms 触发，是浏览器收到 500 后的连接清理（不是前端主动 abort）
- next dev 的 stderr 在 test 期间被 Playwright webServer 子进程吞掉（只透传启动期输出），看不到 500 真实堆栈
- "fake provider 没收到 /chat/completions" 与 500 完全一致（route 没执行到调 provider 那步）

### 看不到的关键证据（铁律 6：诚实声明）

- **500 的真实 stack trace**：next dev stderr 在 test 期间没透传到 CI 日志，无法直接定位是哪个 import / 哪一行模块顶层代码崩溃
- route.ts 顶层（line 1-36）只有 import + `const logger = createLogger(...)`，无副作用代码
- case-analyzer.ts 顶层（line 1-31）同样只有 import + logger 定义；`new OpenAI(...)` 在函数体内（line 315）
- **本地无法直接推断 dev mode 模块加载失败的具体原因**——需要新一轮诊断 CI 拿 stack

### 上一轮 waitForRequest 的"伪通过"机制（重要教训）

之前 16 轮 CI 迭代一直误判根因，是因为 CL-04 用 `page.waitForRequest(...)`：它只捕获浏览器侧"请求对象创建"事件，**请求被服务端返回 500 也能"通过"**。所以 CL-04 看似绿灯，到 CL-05 `getByText('AI 摘要')` 30s timeout 才暴露。本轮 D1 把 `waitForRequest` 改成 `waitForResponse`，CL-04 立即暴露 500——这是诊断能力的本质提升。

### 决策（用户已确认）

按 plan §8 开放问题 4 的用户决策「接受阶段 1 推翻阶段 2 的不确定性」：
- **原计划阶段 2（R1-R6 AbortController 拆分）作废**，回 /plan 重新设计
- **新阶段 1.5**：补诊断能力（next dev stderr 透传 + route try/catch 写文件 + 前端 console 转发），跑一轮 CI 拿 500 真实 stack
- **新阶段 2**：基于真实 stack 重设计修复方向（保留"等 stack 出来再细化"的弹性）
- 原 D2/D3/D4 临时诊断日志：等新 plan 出来后决定保留/清理/合并

### 仍保留价值的部分（不要丢）

- D1 改造的 `waitForResponse` + 三事件监听（requestfinished/requestfailed/response）+ chat/completions 计数器是**长期证据采集能力**，应保留
- D4 APIRequestContext 直调用例是**区分前后端问题的标准手段**，应保留（修复后改为断言 200）
- "Strict Mode 组件回归测试"虽不是本轮根因，但仍是值得补的护栏（独立于本轮修复）
- AbortController 拆分本身（POST 与轮询不共用 controller）是合理的代码健康改进，**可作为独立改进项**排进未来轮次，不一定是本轮修复

### Git 状态

- commit `73bb3d1` 已推 origin/dev
- 工作区干净（除上轮遗留的 untracked 临时文件 ci-status*.txt / ci-status.json / ci5.txt + doc/research/*.md，与本轮无关）
- dev 领先 main 51 个 commit（含本轮诊断）
