# CI /process 静默失败 · AbortController 拆分修复计划

> 关联规格: [doc/research/2026-07-27_ci-process-route-silent-failure-consult.md](../research/2026-07-27_ci-process-route-silent-failure-consult.md)（问题征询报告）
> 关联上一轮计划: [doc/plan/nana-test-framework-ci-fix-plan.md](nana-test-framework-ci-fix-plan.md)（v1 + v2，前序 CI 启动 bug）
> 关联执行日志: [doc/executionlog/nana-test-framework-ci-fix-log.md](../executionlog/nana-test-framework-ci-fix-log.md)（v1 + v2，15 个 commit）
> 触发事件: 外部 AI 评审给出新根因方向——AbortController 共用导致 /process 在 CI（Strict Mode）被提前取消
> 计划日期: 2026-07-28
> 执行者: plan-agent（设计），待用户确认后交 execute-agent 分两轮执行
> 预计影响: `src/app/nana/capture/page.tsx`、`src/app/api/nana/cases/[id]/process/route.ts`、`e2e/ci/nana-golden-path.spec.ts`、`e2e/helpers/fake-provider-server.ts`、`src/__tests__/integration/nana/`、`package.json`

---

## 1. 大白话概述

这一轮要解决一个折磨了我们 16 次 CI 迭代的"幽灵 bug"：高中生平板拍照后点"收好这道题"，题确实存进去了，但 AI 整理这一步在 CI 上**永远卡住**——前端一直转"正在帮你整理…"，后端的 AI 整理代码**根本没被执行过**。本地开发却完全正常。

**根因已经被外部 AI 评审 + 主会话代码验证定位**（这一轮不再质疑根因是否成立）：拍题页面的前端代码用**同一个"取消按钮"（AbortController）**同时管两件事——①取消正在发送的 AI 请求，②取消轮询查询。React 的"严格模式"（开发模式默认开启，CI 用的就是开发模式）会故意把页面初始化跑两遍来抓 bug，第一遍结束时会按下"取消按钮"——结果把还在飞行中的 AI 请求也一起取消了。本地机器快，AI 请求在取消前就发完了；CI 机器慢，请求还在路上就被杀。这就是"本地好、CI 死"的原因。

**这一轮分两阶段做**：
- **阶段 1（受控诊断）**：先加监听证据，跑一轮 CI，**用证据确认**根因是"请求被取消"而不是"401/500/其他"。禁止猜，禁止直接动修复。
- **阶段 2（修复 + 护栏）**：确认根因后，把"取消按钮"拆成两个互不干扰的——一个专管取消 AI 请求，一个专管取消轮询。再补三个护栏测试，确保这个 bug 永远不再回来。

---

## 2. 任务分解

> **关键**：阶段 1 和阶段 2 是**两次独立的 execute 轮**，中间隔一次 CI 跑。阶段 1 跑完拿到证据 → 用户确认 → 才进阶段 2。

### ═══ 阶段 1：受控诊断（先证明，禁止猜）═══

#### 任务 D1：E2E 升级监听 /process 的真实命运

- **涉及文件**：`e2e/ci/nana-golden-path.spec.ts`（CL-04 之后的代码段，当前 line 283-303）
- **做什么**：
  1. 把 CL-04 的 `page.waitForRequest(...)` 改成 `page.waitForResponse(...)`，断言 HTTP 状态码 200 + 响应 JSON 的 `status` 字段非空
  2. 在点击"收好这道题"之前，注册三个事件监听器捕获 `/process` 请求的完整命运：
     - `page.on('requestfinished', ...)` → 请求成功完成，打印 URL + HTTP 状态码 + 响应正文前 200 字符
     - `page.on('requestfailed', ...)` → 请求失败，打印 URL + `failure().errorText`（这是捕获 aborted 的关键证据）
     - `page.on('response', ...)` → 收到响应，打印 URL + 状态码
  3. 同时保留对 `/chat/completions`（假 Provider 的 AI 接口）的监听，确认它有没有被调用
- **为什么这么做**：当前只看"请求是否发出"，不看"请求是否真的到达服务端"。`waitForRequest` 只捕获"请求对象创建"事件，请求被 abort 也能通过——这正是"CL-04 通过但 handler 不执行"的矛盾来源。改成 `waitForResponse` + 监听 `requestfailed`，能在 CI 日志里直接看到"请求被 aborted"的证据。
- **风险**：低。监听器只读不写，不改变请求行为。`waitForResponse` 如果请求被 abort，会 timeout——但 timeout 本身就是诊断信号（说明请求没成功到达服务端）。

#### 任务 D2：route 入口日志前置到鉴权之前

- **涉及文件**：`src/app/api/nana/cases/[id]/process/route.ts`（当前 line 269-282）
- **做什么**：
  1. 把现有的 `[process-route DEBUG]` console.log 从 line 276（`getServerSession` 之后）**移到 POST 函数体第一行（line 269 之后、line 273 之前）**——鉴权之前
  2. 新增一行鉴权结果日志：在 `if (!session?.user?.id) return unauthorized();` 之后打印 `[process-route DEBUG] auth result: ${session?.user?.id ? 'ok' : 'unauthorized'}`（**不打印 session token、不打印 user.id 值，只打印 ok/unauthorized**）
  3. 新增一行"handler 真正执行"的标记日志：在 try 块开始处打印 `[process-route DEBUG] handler executing for caseId=${id}`
- **为什么这么做**：当前诊断日志在鉴权之后，401 时不会打印——我们无法区分"handler 根本没被调到"vs"被调到但鉴权失败返回 401"。前置后：
  - 如果 CI 日志里**完全没有** `[process-route DEBUG]` → 请求根本没到达 route handler（前端 aborted 实锤）
  - 如果有 `auth result: unauthorized` → 是 401 问题，不是 aborted
  - 如果有 `handler executing` → handler 被调到了，问题在后续（500 / provider 不通）
- **为什么这么做（安全维度）**：日志只打印 env 是否设置（不打印值）、鉴权是否通过（不打印 token/userId），符合铁律 4（密钥不入日志）。
- **风险**：低。临时 console.log 不影响业务逻辑。鉴权前置打印"是否通过"不泄露任何敏感信息。

#### 任务 D3：前端 controller 生命周期日志

- **涉及文件**：`src/app/nana/capture/page.tsx`（handleSave / handleRetryProcess / 轮询 effect / handleRetake / handleTakeAnother）
- **做什么**：在以下 5 个关键节点加临时 `console.log`，统一格式 `[ctrl-diag]`：
  1. **controller 创建点**（handleSave line 221、handleRetryProcess line 295）：打印 `created controller for caseId=${id}, signal.aborted=${ac.signal.aborted}`
  2. **POST 调用前**（handleSave line 225、handleRetryProcess line 300）：打印 `POST triggered, signal.aborted=${ac.signal.aborted}`
  3. **POST catch 点**（handleSave line 230-236、handleRetryProcess line 305-309）：打印 `POST catch, err.name=${err.name}, signal.aborted=${ac.signal.aborted}`
  4. **轮询 effect setup**（line 247 之后）：打印 `poll effect setup, processState=${processState}, savedCaseId=${savedCaseId}, ref signal.aborted=${abortControllerRef.current?.signal.aborted}`
  5. **轮询 effect cleanup**（line 282 之前）：打印 `poll effect cleanup, aborting controller, signal.aborted=${ac.signal.aborted}`
- **为什么这么做**：这是定位"controller 生命周期"的直接证据。如果 CI 日志出现：
  - `poll effect setup` → 紧接着 `poll effect cleanup` → `POST catch, err.name=AbortError` → 实锤 Strict Mode cleanup abort 了 POST
- **风险**：低。临时日志不改变逻辑。caseId 是业务 ID 非敏感数据。

#### 任务 D4：APIRequestContext 直调验证（区分前端问题 vs 后端问题）

- **涉及文件**：`e2e/ci/nana-golden-path.spec.ts`（新增一个诊断 test，独立于 S1 主路径）
- **做什么**：在 S1 describe 内或独立 describe 加一个诊断用例：
  1. 用 golden-path 已登录的 BrowserContext 拿到 `request`（Playwright 的 APIRequestContext）
  2. 先走 CL-04 保存路径拿到一个真实的 caseId
  3. 用 `request.post('/api/nana/cases/${caseId}/process')` 直接调后端（绕过前端 React 组件生命周期）
  4. 断言状态码 200 + 响应有 status 字段
- **为什么这么做**：如果"页面调用 /process 失败但 API 直调成功"，**铁证**问题是前端生命周期（AbortController），不是后端 route handler 或鉴权。如果 API 直调也失败，则问题在后端，需要重新评估。
- **风险**：低。直调用的是已登录 context，鉴权状态合法。诊断用例独立于主路径，不影响 CL-04~07 断言。

#### 任务 D5：一轮 CI 后清理诊断日志（只保留证据采集）

- **涉及文件**：`src/app/api/nana/cases/[id]/process/route.ts`、`src/app/nana/capture/page.tsx`、`e2e/ci/nana-golden-path.spec.ts`
- **做什么**：阶段 1 跑完一轮 CI、拿到诊断证据、用户确认根因后：
  1. **删除** route.ts 的所有 `[process-route DEBUG]` 临时日志（D2 全部）
  2. **删除** capture/page.tsx 的所有 `[ctrl-diag]` 临时日志（D3 全部）
  3. **删除** golden-path 的 APIRequestContext 直调诊断用例（D4）
  4. **保留** golden-path 的 `waitForResponse` + `requestfailed`/`response` 监听（D1）——这是长期证据采集能力，不是临时日志
- **为什么这么做**：临时诊断日志是"脚手架"，用完即拆，不留技术债。证据采集能力（监听 + waitForResponse）是"护栏"，长期保留。
- **风险**：清理时注意别误删 D1 的长期监听代码。execute-agent 应对照本任务清单逐项删除。

---

### ═══ 阶段 2：修复 + 护栏（确认根因后才动）═══

#### 任务 R1：安装 @testing-library/react（前置子任务）

- **涉及文件**：`package.json`、`src/__tests__/setup.ts`（可能需要加 jest-dom matchers setup）
- **做什么**：
  1. `npm install -D @testing-library/react@^16 @testing-library/jest-dom@^6`（版本兼容 React 19 + vitest）
  2. 在 `src/__tests__/setup.ts` 顶部加 `import '@testing-library/jest-dom/vitest'`（启用 `toBeInTheDocument` 等 matchers）
  3. 验证：`npm.cmd run test -- --run` 确认现有测试不回归
- **为什么这么做**：`src/__tests__/integration/nana/round4-process-trigger.test.tsx:8` 明写"项目未安装 @testing-library/react，不渲染 React 组件"——这正是 effect cleanup 行为从未被测试覆盖的原因。vitest.config.ts 已配 `environment: 'jsdom'` + `@vitejs/plugin-react`，组件测试环境就绪，只差 testing-library。
- **风险**：版本不兼容。@testing-library/react@^16 要求 React 18+，项目用 React 19.2.0，兼容。jest-dom@^6 兼容 vitest@^4。
- **开放问题**：见 §7 开放问题 1（版本选择是否接受 plan-agent 推荐）。

#### 任务 R2：拆分 AbortController 取消域（核心修复）

- **涉及文件**：`src/app/nana/capture/page.tsx`（handleSave / handleRetryProcess / 轮询 effect / handleRetake / handleTakeAnother）
- **做什么**：
  1. **新增 `processAbortRef`**（专属于 POST 飞行请求）：`const processAbortRef = useRef<AbortController | null>(null);`
  2. **保留 `abortControllerRef` 但语义改为"仅轮询用"**——或者直接重命名为 `pollAbortRef`（推荐重命名，语义清晰，避免后续混淆）
  3. **handleSave 改动**：
     - line 220-221：`abortControllerRef.current?.abort()` 改为 `processAbortRef.current?.abort()`（取消旧的 POST）
     - line 221-222：`const ac = new AbortController(); abortControllerRef.current = ac;` 改为 `const ac = new AbortController(); processAbortRef.current = ac;`
     - line 225：`triggerCaseProcess(caseRecord.id, ac.signal)` 保持用 `ac`（来自 processAbortRef）
     - line 232 的 AbortError 分支保留（POST 自己被取消时静默）
  4. **handleRetryProcess 同步改动**（line 294-296）：同样改用 `processAbortRef`——**这个 bug 在 handleRetryProcess 里同样存在，必须一并修**
  5. **轮询 effect 改动**（line 255-256）：**彻底不读 `abortControllerRef.current`**，在 effect setup 内部创建局部 controller：`const pollController = new AbortController();`（局部变量，不存 ref）
  6. **轮询 effect cleanup 改动**（line 282-286）：cleanup 只调 `pollController.abort()`，**绝对不能碰 `processAbortRef.current`**
  7. **line 260 的 `getCaseProcessStatus(savedCaseId, ac.signal)`** 改用 `pollController.signal`
  8. **POST 取消时机限定**（handleRetake line 328、handleTakeAnother line 345）：这两处的 `abortControllerRef.current?.abort()` 改为 `processAbortRef.current?.abort()`（取消飞行 POST 是用户意图，正确）
  9. **绝不复用已 aborted 的 controller**：所有 ref 读取后检查 `signal.aborted`，若 aborted 则 new 新的；或在赋值前先 abort 旧的再 new 新的
- **为什么这么做**：见技术附录 §6.2 的修复前后 ref 关系图。核心原则——POST 的取消域和轮询的取消域必须物理隔离，Strict Mode 的 effect cleanup 只能取消轮询，不能波及 POST。
- **为什么这么做（handleRetryProcess 必须一并修）**：handleRetryProcess 的代码结构（line 294 创建 controller → line 297 setProcessState("processing") 触发轮询 effect → line 300 POST）与 handleSave 完全同构，**同样的 bug 在 retry 时也会触发**。只修 handleSave 不修 retry 是"修了一半"。
- **风险**：
  - 中等。这是核心业务逻辑修改，必须配合 R3 的 Strict Mode 组件测试验证。
  - 重命名 `abortControllerRef` → `pollAbortRef` 是大范围改动，execute-agent 应全文搜索确认所有引用点都改了。
  - 不能破坏现有竞态保护（currentCaseIdRef 机制保留不动）。

#### 任务 R3：补 Strict Mode 组件回归测试（核心护栏）

- **涉及文件**：`src/__tests__/integration/nana/capture-page-strict-mode.test.tsx`（新增）
- **做什么**：用 `@testing-library/react` 的 `render` + `act` 真实渲染 CapturePage，覆盖以下场景：
  1. **场景 A：保存触发 POST 后，effect cleanup 不应取消 POST**
     - mock `createCase` 立即 resolve
     - mock `triggerCaseProcess` 返回一个可控的 Promise（手动控制 resolve 时机）
     - 模拟点击"收好这道题"
     - 在 POST Promise resolve 之前，触发 React 的 effect cleanup（用 `act` 卸载组件，或用 Strict Mode 双重调用）
     - 断言：`triggerCaseProcess` 的 mock **没有被 abort**（即 signal.aborted === false，或 POST Promise 正常 resolve）
  2. **场景 B：retry 触发 POST 后，effect cleanup 不应取消 POST**（同上但走 handleRetryProcess 路径）
  3. **场景 C：轮询 effect 的 cleanup 正确取消轮询**（正向验证 cleanup 仍有效，没被误删）
- **为什么这么做**：`round4-process-trigger.test.tsx:8` 明写"不渲染 React 组件"——effect cleanup 行为从未被测试覆盖，这就是 bug 能潜伏至今的原因。只有真实渲染组件 + 模拟 Strict Mode 行为，才能覆盖这个盲区。
- **风险**：
  - CapturePage 依赖 `next/link`、`QuestionImageCapture`、`VoiceRecorder` 等子组件，测试时需要 mock 这些（用 `vi.mock`）。
  - jsdom 不支持 `MediaRecorder` / `getUserMedia`，VoiceRecorder 必须 mock。
  - 测试可能因组件依赖复杂而较重，建议最小化渲染——只测 controller 生命周期，不测 UI 渲染细节。

#### 任务 R4：E2E 升级响应断言 + fake provider 计数（护栏）

- **涉及文件**：`e2e/ci/nana-golden-path.spec.ts`（CL-04~07）、`e2e/helpers/fake-provider-server.ts`
- **做什么**：
  1. **CL-04 的 `waitForResponse` 断言**（承接阶段 1 任务 D1）：断言响应状态码 200 + JSON 的 `status` 字段非空（`pending`/`success`/`failed`/`timeout` 都算合法，证明 handler 真执行了）
  2. **CL-05 等待 AI 结果卡时，同时监听 `/chat/completions`**：确认假 Provider 真收到了 AI 请求
  3. **fake-provider-server.ts 加请求计数器**：导出一个 `getChatCompletionsCount()` 函数，记录 `/chat/completions` 被调用的次数
  4. **CL-07 DB 断言之后，加 fake provider 计数断言**：`expect(getChatCompletionsCount()).toBeGreaterThanOrEqual(1)`——如果计数为 0，说明 case-analyzer 根本没调到 provider，直接失败
- **为什么这么做**：当前"waitForRequest 通过但 handler 不执行"的矛盾，根因就是只看请求发出、不看请求到达。加响应断言 + provider 计数，形成"请求到达 → handler 执行 → provider 收到 → DB 落库"的完整证据链，任何一个环节断了都能立即定位。
- **风险**：低。计数器是累加的，需注意多个 test 之间状态隔离（每个 test 前重置计数）。

#### 任务 R5：非 Abort 错误不得静默（铁律 6 护栏）

- **涉及文件**：`src/app/nana/capture/page.tsx`（轮询 catch line 269-271）
- **做什么**：
  1. **line 232 的 AbortError 分支保留**（POST 自己被取消时静默是正确的）
  2. **line 269-271 的轮询 catch 不能全空**：改为 `catch (err) { if (err instanceof DOMException && err.name === 'AbortError') return; console.error('[poll] getCaseProcessStatus failed', err); }`——AbortError 静默，其他错误至少记录
  3. **route 返回 401/500 时前端必须显示明确失败态**：`triggerCaseProcess` 在 `!res.ok` 时 throw（nana-api-client.ts:172 已有），handleSave 的 catch（line 234-236）已设 `setProcessState("error")`——确认这条路径在 401/500 时真的走到，不被 AbortError 分支误吞
- **为什么这么做**：铁律 6 要求显式失败不掩盖。当前轮询 catch 全空 = 永久"整理中"，违反铁律。即使本轮修了 abort，未来其他错误（网络抖动、502）也不能让用户永久卡住。
- **风险**：低。加日志不改变控制流，但要让 401/500 进入 error 态需确认 catch 链路完整。

#### 任务 R6：不关 Strict Mode（硬约束声明）

- **涉及文件**：无（声明性任务）
- **做什么**：本计划**明确禁止**用 `reactStrictMode: false` 绕过。next.config.ts 不设此项（Next.js 16 dev 默认 true）。playwright.config.ts 的 webServer 维持 `npx next dev`（用户硬约束：本轮禁止动）。
- **为什么这么做**：Strict Mode 在帮我们暴露真实缺陷。关掉它等于"杀掉报警器而不是灭火"。

---

## 3. 文件变更清单

| 文件 | 操作 | 阶段 | 上游冲突风险 | 说明 |
|------|------|:---:|:---:|------|
| `src/app/api/nana/cases/[id]/process/route.ts` | 修改 | 阶段1 D2 + 阶段1 D5 清理 | 无（本项目新增 route） | 临时诊断日志前置到鉴权前，跑完一轮 CI 后删除 |
| `src/app/nana/capture/page.tsx` | 修改 | 阶段1 D3 + 阶段1 D5 清理 + 阶段2 R2/R5 | 无（本项目新增页面） | 阶段1加临时 controller 日志；阶段2拆分 AbortController + 修轮询 catch |
| `e2e/ci/nana-golden-path.spec.ts` | 修改 | 阶段1 D1/D4 + 阶段1 D5 清理 + 阶段2 R4 | 无（本项目新增 spec） | 阶段1加 waitForResponse + 事件监听 + API 直调诊断；阶段2保留监听+加 provider 计数断言 |
| `e2e/helpers/fake-provider-server.ts` | 修改 | 阶段2 R4 | 无（本项目新增） | 加 `/chat/completions` 请求计数器导出 |
| `src/__tests__/integration/nana/capture-page-strict-mode.test.tsx` | 新增 | 阶段2 R3 | 无 | Strict Mode 组件回归测试（核心护栏） |
| `src/__tests__/setup.ts` | 修改 | 阶段2 R1 | 无 | 加 `import '@testing-library/jest-dom/vitest'` |
| `package.json` | 修改 | 阶段2 R1 | 无 | 加 `@testing-library/react` + `@testing-library/jest-dom` devDependency |

> **注意**：`src/app/nana/capture/page.tsx` 和 `route.ts` 都是本项目自有文件（非上游 wrong-notebook 原有），无上游冲突风险。`playwright.config.ts` 和 `next.config.ts` 本轮**不动**（用户硬约束）。

---

## 4. 验收标准

### 4.1 阶段 1 验收（诊断证据）

- [ ] 推送阶段 1 改动到 dev 后，CI E2E Tests job 跑完，日志中**出现**以下证据之一：
  - **情况 A（确认 aborted）**：CI 日志有 `[ctrl-diag] poll effect setup` → 紧接 `poll effect cleanup` → `POST catch, err.name=AbortError`；且 route.ts 日志 `[process-route DEBUG]` **完全不出现**（handler 没被调到）；且 D4 的 API 直调**成功**（200 + status 字段）→ **实锤前端生命周期问题**
  - **情况 B（401）**：CI 日志有 `[process-route DEBUG] auth result: unauthorized` → 是鉴权问题
  - **情况 C（500/其他）**：CI 日志有 `[process-route DEBUG] handler executing` 但后续报错 → 是后端问题
- [ ] 诊断结论写入执行日志（即使是"仍不确定"也要诚实记录，铁律 6）
- [ ] 阶段 1 的临时日志（D2/D3/D4）在拿到证据后**全部删除**（D5），只保留 D1 的长期监听

### 4.2 阶段 2 验收（修复 + 护栏）

#### 自动化测试（必须全绿）
- [ ] **新增 Strict Mode 组件回归测试通过**（R3）：场景 A（POST 不被 effect cleanup 取消）+ 场景 B（retry 同样不被取消）+ 场景 C（轮询 cleanup 仍有效）
- [ ] **现有 round4-process-trigger.test.tsx 不回归**：13 个用例全过（R2 的重构不破坏现有逻辑）
- [ ] **现有 fake-provider-server.test.ts 不回归**：13 passed + 1 skipped（R4 的计数器不破坏现有行为）
- [ ] **E2E CL-04~07 在 CI 全绿**：`waitForResponse` 断言 200 + status 字段；`/chat/completions` 计数 ≥ 1；DB 双层 tag 落库断言通过

#### CI 证据（最终门禁）
- [ ] 推送阶段 2 到 dev 后，CI E2E Tests job **退出码 0**
- [ ] CI 日志中 `[ctrl-diag]` 临时日志已全部清除（D5 执行了）
- [ ] CI 日志中 `[process-route DEBUG]` 临时日志已全部清除（D5 执行了）
- [ ] CI 日志中 `getByText('AI 摘要')` 30s timeout **不再出现**
- [ ] CI 日志中 `requestfailed` 监听**不再捕获** `/process` 的 abort 事件

#### 本地 sanity check
- [ ] `npm.cmd run build` 通过
- [ ] `npm.cmd run test -- --run` 全过（含新增的 Strict Mode 测试）
- [ ] `node node_modules/eslint/bin/eslint.js src/app/nana/capture/page.tsx src/app/api/nana/cases/[id]/process/route.ts` → 0 error 0 warning

### 4.3 不变性（不能破坏的现有行为）
- [ ] Unit / Integration / Build job 继续绿色
- [ ] CL-01~04（导航、题图、保存"已收好"）不受影响
- [ ] 竞态保护（currentCaseIdRef 机制）保留有效
- [ ] "再拍一道"/重新拍摄时 POST 被取消（这是用户意图，正确行为，不能因为 R2 的拆分而失效）

### 4.4 测试策略标注

> 本轮涉及两类代码：①前端组件生命周期逻辑（capture/page.tsx 的 effect + ref）——**测试先行**，R3 的 Strict Mode 测试必须在 R2 修复后立即跑通；②E2E 断言升级（waitForResponse + provider 计数）——CI 真跑是最终门禁。R1（装 testing-library）是 R3 的前置。

---

## 5. 风险与注意事项

### 5.1 主会话验证之外的额外风险（plan-agent 发现）

> **以下三个风险点是主会话未明确点出的，plan-agent 在通读代码后发现，必须在本计划中标注。**

#### 风险 A：handleRetryProcess 有完全相同的 bug（必须一并修）

主会话的根因分析聚焦在 `handleSave`（line 221-236）。但通读 `handleRetryProcess`（line 290-310）发现**完全相同的代码结构**：

```
line 294: abortControllerRef.current?.abort();  // 取消旧的
line 295: const ac = new AbortController();
line 296: abortControllerRef.current = ac;       // ← 同一个 ref
line 297: setProcessState("processing");         // ← 触发轮询 effect 复用 ac
line 300: await triggerCaseProcess(savedCaseId, ac.signal);  // ← POST 用 ac
```

用户点"重试 AI 整理"时，同样会触发 Strict Mode 的 effect cleanup，abort 掉 retry 的 POST。**R2 任务必须显式覆盖 handleRetryProcess**，不能只修 handleSave。

#### 风险 B：handleRetake / handleTakeAnother 的 abort 语义需保留

`handleRetake`（line 328）和 `handleTakeAnother`（line 345）都有 `abortControllerRef.current?.abort()`——这是**用户意图取消 POST**（用户主动离开当前题），是正确行为。R2 拆分后，这两处应改为 `processAbortRef.current?.abort()`（取消 POST），**不能误删**。如果误删，用户点"再拍一道"时旧 POST 会继续飞行，回来后可能覆盖新题状态（P1 竞态保护失效）。

#### 风险 C：轮询 effect 的 processResult 依赖可能影响 cleanup 时序

轮询 effect 的依赖数组是 `[processState, savedCaseId, processResult]`（line 287）。当 POST 成功返回后 `setProcessResult(result)` 会让 processResult 变化，effect 会重新跑（cleanup 上一个 → setup 新的）。R2 改成局部 pollController 后，每次 re-setup 都会 new 一个新的 pollController，上一个被 cleanup abort——这是正确行为，但 execute-agent 需确认 re-setup 频率不会导致轮询风暴（理论上 processResult 变化只在 POST 返回时发生一次，频率低）。

### 5.2 技术不确定性

| 项 | 不确定性 | 处置 |
|----|---------|------|
| 阶段 1 诊断结果是否真的是 aborted | **不确定**——虽然主会话代码层面验证了因果链，但 CI 实际行为尚未观测 | 阶段 1 的存在就是为了消除这个不确定性。若诊断结果是 401/500，则根因不是 abort，需回 /plan 重新设计修复方案 |
| @testing-library/react@^16 与 vitest@^4 + jsdom@^27 的兼容性 | 推断兼容（都是最新稳定版），但未实测 | R1 任务第一步安装后立即跑 `npm.cmd run test -- --run` 验证不回归。若不兼容，退回 @testing-library/react@^15 |
| Strict Mode 组件测试能否真实复现 CI 的 abort 行为 | jsdom 环境 + `@testing-library/react` 的 `act` 能触发 effect 双重调用，但与真实浏览器 + next dev 的 Strict Mode 可能有细微差异 | R3 测试即使不能 100% 复现 CI 行为，也能覆盖"effect cleanup 不应 abort POST"的核心断言。CI 真跑是最终门禁 |
| CapturePage 子组件依赖复杂度 | VoiceRecorder 用 MediaRecorder（jsdom 不支持）、QuestionImageCapture 用 file input | R3 测试用 `vi.mock` mock 掉这些子组件，只测 CapturePage 自身的 controller 生命周期 |

### 5.3 React Strict Mode 行为差异

- **dev 模式默认开启**：Next.js 16 dev 模式（`next dev`）默认 `reactStrictMode: true`，effect 会 setup → cleanup → setup 跑两轮。这是 CI（用 `next dev`）能暴露 bug、而生产（用 `next start` + standalone）不会暴露的原因。
- **生产模式不开启**：生产构建 Strict Mode 不双重调用 effect。所以这个 bug 在生产环境**不会出现**——但这不意味着可以不修，因为：①CI 是我们的质量门禁，CI 红着就不能合 main；②Strict Mode 暴露的是真实缺陷（取消域共用），即使生产侥幸不出问题，代码味道也必须清除。
- **禁止关闭 Strict Mode 绕过**：见任务 R6。

### 5.4 临时诊断日志清理纪律

阶段 1 的临时日志（D2/D3/D4）是"脚手架"，**必须**在阶段 1 结束、进入阶段 2 之前清理（D5）。清理纪律：
- execute-agent 应在 commit message 中标注 `[cleanup] 阶段1诊断日志清理`，便于审计
- 清理后 PR diff 中不应再出现 `[process-route DEBUG]` / `[ctrl-diag]` 字样
- D1 的长期监听（`waitForResponse` + `requestfailed`）**不清理**——这是长期证据采集能力

### 5.5 上游文件冲突

本轮修改的文件（capture/page.tsx、route.ts、golden-path.spec.ts、fake-provider-server.ts）**全部是本项目自有新增**，非上游 wrong-notebook 原有，无上游冲突风险。
- `package.json` 是上游追踪文件，但加 devDependency 是增量操作，不破坏现有依赖，未来同步上游时冲突点明确。
- `playwright.config.ts` 和 `next.config.ts` 本轮**不动**（用户硬约束），无冲突。

### 5.6 不做的事（范围控制）

- **不动** `next.config.ts` 的 `output: 'standalone'`（用户硬约束）
- **不动** `Dockerfile`（用户硬约束）
- **不动** `playwright.config.ts` 的 webServer 启动方式（用户硬约束，维持 `npx next dev`）
- **不关闭** React Strict Mode（用户硬约束）
- **不跳过** CL-05/06/07 任何一步断言换绿灯（用户硬约束——必须真修通，不能用 skip 绕过）
- 不改 Prisma schema（铁律 3）
- 不改 case-analyzer.ts 业务逻辑（本轮只管前端生命周期 + route 入口诊断，AI 管线本身不是本轮范围）

---

## 6. 技术附录

### 6.1 代码行号证据（根因因果链）

> 以下行号基于当前 dev 分支的 `src/app/nana/capture/page.tsx`。

| 步骤 | 行号 | 代码 | 说明 |
|------|------|------|------|
| 1 | 221 | `const ac = new AbortController();` | 保存成功后创建 controller |
| 1 | 222 | `abortControllerRef.current = ac;` | 存入 ref |
| 2 | 223 | `setProcessState("processing");` | 触发轮询 effect |
| 3 | 225 | `triggerCaseProcess(caseRecord.id, ac.signal)` | POST 复用同一个 signal |
| 4 | 255-256 | `const ac = abortControllerRef.current ?? new AbortController(); abortControllerRef.current = ac;` | 轮询 effect 复用 ref（`??` 不触发，因 ref 非空） |
| 5 | 285 | `ac.abort();` | effect cleanup 调用——**这里的 ac 就是 POST 共用的那个** |
| 6 | 260 | `getCaseProcessStatus(savedCaseId, ac.signal)` | 第二轮 setup 时 ref 仍指向已 aborted 的对象，立即失败 |
| 7 | 232 | `if (err.name === "AbortError") return;` | POST 的 AbortError 被显式忽略 |
| 7 | 269-271 | `catch { // 轮询失败不立即报错 }` | 轮询 catch 全空——永久"整理中" |

**因果链**：CI 用 `next dev`（Strict Mode 开启）→ 保存触发 `setProcessState("processing")` → 轮询 effect setup → Strict Mode 立即跑一遍 cleanup → `ac.abort()` → POST 飞行中被客户端取消 → 服务端 handler 从未真正收到请求 → `page.waitForRequest` 能在浏览器捕获"请求对象创建"事件，但请求实际 aborted → 完美解释"waitForRequest 通过但 handler 不执行、fake provider 没收到 /chat/completions"的矛盾。

**本地 dev 看似没问题**是因为机器快，POST 在 cleanup 触发前已完成；CI 上机器慢，POST 还在飞行就被杀。

### 6.2 修复前后 ref 关系图

#### 修复前（当前，有 bug）

```
abortControllerRef.current ────┐
                               │
                               ▼
                    ┌─────────────────────┐
                    │  AbortController #1  │
                    │  signal ─────────────┼──→ POST triggerCaseProcess(caseId, signal)
                    │                      │
                    │                      │──→ 轮询 getCaseProcessStatus(caseId, signal)
                    └─────────────────────┘
                               ▲
                               │
            effect cleanup 调用 ac.abort()
            → POST 和轮询同时被取消（POST 飞行中被杀 = bug）
```

#### 修复后（R2 完成后）

```
processAbortRef.current ─────────────┐
                                     ▼
                          ┌─────────────────────┐
                          │  AbortController #P  │
                          │  signal ─────────────┼──→ POST triggerCaseProcess(caseId, signal)
                          └─────────────────────┘
                          （只被 handleTakeAnother / handleRetake / 新保存覆盖时取消）


轮询 effect setup 内部局部变量
                          ┌─────────────────────┐
                          │  pollController #L  │
                          │  signal ─────────────┼──→ 轮询 getCaseProcessStatus(caseId, signal)
                          └─────────────────────┘
                                     ▲
                                     │
            effect cleanup 调用 pollController.abort()
            → 只取消轮询，POST 不受影响（修复点）
```

### 6.3 修复前后伪代码对比（handleSave 片段）

#### 修复前（line 218-236）

```typescript
currentCaseIdRef.current = caseRecord.id;
abortControllerRef.current?.abort();
const ac = new AbortController();
abortControllerRef.current = ac;       // ← POST 和轮询共用这个 ref
setProcessState("processing");
try {
  const result = await triggerCaseProcess(caseRecord.id, ac.signal);
  // ...
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") return;
  // ...
}
```

#### 修复后（伪代码）

```typescript
currentCaseIdRef.current = caseRecord.id;
processAbortRef.current?.abort();        // ← 只取消旧的 POST
const postAc = new AbortController();
processAbortRef.current = postAc;        // ← POST 专用 ref
setProcessState("processing");           // ← 触发轮询 effect，但 effect 用自己的局部 controller
try {
  const result = await triggerCaseProcess(caseRecord.id, postAc.signal);
  // ...
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") return;
  // ...
}

// ─── 轮询 effect（独立 cancel 域）──
useEffect(() => {
  if (processState !== "processing" || !savedCaseId) return;
  if (processResult && (processResult.status === "success" || processResult.status === "failed")) return;

  const pollController = new AbortController();   // ← 局部变量，不存 ref

  pollRef.current = setInterval(async () => {
    try {
      const result = await getCaseProcessStatus(savedCaseId, pollController.signal);
      // ...
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error('[poll] getCaseProcessStatus failed', err);  // ← R5：非 Abort 错误记录
    }
  }, 3000);

  pollTimeoutRef.current = setTimeout(() => {
    setProcessState("error");
    if (pollRef.current) clearInterval(pollRef.current);
  }, 60000);

  return () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollController.abort();   // ← 只取消轮询，绝不碰 processAbortRef
  };
}, [processState, savedCaseId, processResult]);
```

### 6.4 阶段 1 诊断日志预期输出（三种根因情况）

#### 情况 A：确认 aborted（预期最可能）

```
[ctrl-diag] POST triggered, signal.aborted=false, caseId=xxx
[ctrl-diag] poll effect setup, processState=processing, savedCaseId=xxx, ref signal.aborted=false
[ctrl-diag] poll effect cleanup, aborting controller, signal.aborted=false → true
[ctrl-diag] POST catch, err.name=AbortError, signal.aborted=true
（route.ts 的 [process-route DEBUG] 完全不出现——handler 没被调到）
（D4 API 直调：200 + status 字段 → 后端没问题）
```

#### 情况 B：401 鉴权问题

```
[ctrl-diag] POST triggered, signal.aborted=false
（无 poll effect cleanup / POST catch AbortError）
[process-route DEBUG] env check: VOLCENGINE_API_KEY=(set)...
[process-route DEBUG] auth result: unauthorized
（D4 API 直调：401）
```

#### 情况 C：500 后端问题

```
[ctrl-diag] POST triggered, signal.aborted=false
[ctrl-diag] poll effect setup...
[process-route DEBUG] auth result: ok
[process-route DEBUG] handler executing for caseId=xxx
（后续 route 内部报错）
（D4 API 直调：500）
```

### 6.5 Strict Mode 组件测试（R3）伪代码

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock 子组件 + API client
vi.mock('@/components/nana/capture/question-image-capture', () => ({
  QuestionImageCapture: ({ onChange }: any) => (
    <button data-testid="mock-capture" onClick={() => onChange('fake-base64')}>mock capture</button>
  ),
}));
vi.mock('@/components/nana/capture/voice-recorder', () => ({
  VoiceRecorder: () => <div data-testid="mock-recorder" />,
}));
vi.mock('@/lib/nana/nana-api-client', () => ({
  createCase: vi.fn(),
  triggerCaseProcess: vi.fn(),
  getCaseProcessStatus: vi.fn(),
}));

import CapturePage from '@/app/nana/capture/page';
import { createCase, triggerCaseProcess } from '@/lib/nana/nana-api-client';

describe('CapturePage Strict Mode: AbortController 拆分回归', () => {
  beforeEach(() => vi.clearAllMocks());

  test('场景A: 保存触发 POST 后，effect cleanup 不取消 POST', async () => {
    vi.mocked(createCase).mockResolvedValue({ id: 'case-1', studentId: 'u', createdAt: '', artifacts: [] } as any);
    let resolvePost: (v: any) => void;
    const postPromise = new Promise((r) => { resolvePost = r; });
    vi.mocked(triggerCaseProcess).mockImplementation(async (_id: string, signal?: AbortSignal) => {
      // 记录 signal 状态用于断言
      (triggerCaseProcess as any).__lastSignal = signal;
      return postPromise as any;
    });

    const { unmount } = render(
      <React.StrictMode>
        <CapturePage />
      </React.StrictMode>
    );

    // 模拟拍照 + 保存
    fireEvent.click(screen.getByTestId('mock-capture'));
    fireEvent.click(screen.getByRole('button', { name: '收好这道题' }));

    // 等 POST 被触发
    await waitFor(() => expect(triggerCaseProcess).toHaveBeenCalled());
    const signal = (triggerCaseProcess as any).__lastSignal;

    // 在 POST resolve 之前卸载组件（触发 effect cleanup）
    unmount();

    // 核心断言：POST 的 signal 没有被 effect cleanup abort
    // （修复前：signal.aborted === true；修复后：signal.aborted === false）
    expect(signal.aborted).toBe(false);

    // 清理
    resolvePost!({ status: 'success', audioStatus: 'skipped', questionSummary: null, textbookTopic: null, feedback: null, possibleMistakeReason: null, nextActionSuggestion: null, transcript: null, error: null });
  });
});
```

> 注意：以上是伪代码示意，execute-agent 实现时需处理 jsdom 环境下 `next/link`、`fetch`、`setInterval` 的 mock。`React.StrictMode` 包裹后 render 会自动双重调用 effect，这正是复现 CI 行为的关键。

---

## 7. 技术债清理决策（上一轮遗留）

> 参考 [doc/executionlog/nana-test-framework-ci-fix-log.md:206-210](../executionlog/nana-test-framework-ci-fix-log.md) 的待清理清单。

| 技术债 | 决策 | 理由 |
|--------|------|------|
| `e2e/ci/_diagnose-audio.spec.ts` 诊断 spec | **本轮不动** | 这是录音问题的诊断 spec，与本轮 /process abortcontroller 问题是**不同的 bug 域**。录音问题（CI headless 上 getUserMedia→MediaRecorder state 不切换）根因未定位，诊断 spec 仍需保留。等录音问题单独处理时一并清理。 |
| `route.ts` 的 `[DEBUG CI 2026-07-27]` console.log（line 276-282） | **本轮阶段 1 处理**（D2 前置 + D5 清理） | 这个日志当前在鉴权之后，本轮任务 D2 会把它前置到鉴权之前并加 auth 结果日志，跑完一轮诊断后 D5 删除。即"先用、后清"。 |
| golden-path 录音步骤的 `process.env.CI` 跳过 | **本轮不动** | 录音跳过是独立的 CI 适配问题（plan v2 任务 F 诊断的 voice-recorder state 竞态），与本轮 /process abort 无关。本轮专注让 /process 在 CI 真正执行，录音路径的恢复留给后续轮次。 |
| `playwright.config.ts` 的 `npx next dev` | **本轮不动（用户硬约束）** | 用户明确禁止本轮动 webServer 启动方式。且 Strict Mode 正是暴露本 bug 的关键条件，改成 `next start` 反而会掩盖问题。 |

---

## 8. 开放问题决策（用户已确认，2026-07-28）

> 用户答复："按你推荐方" —— 5 个开放问题全部采纳 plan-agent 推荐方案。

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | @testing-library/react 版本（R1） | **`@testing-library/react@^16` + `@testing-library/jest-dom@^6`** | 兼容 React 19.2 + vitest 4 |
| 2 | 诊断日志跑几轮 CI 后清理（D5） | **跑 1 轮拿到证据后立即清理** | 证据足够区分 aborted/401/500 |
| 3 | handleRetryProcess 是否本轮一并修（R2） | **一并修** | 同构 bug，只修 handleSave 是修了一半 |
| 4 | 阶段 1 诊断不是 abort 时阶段 2 作废 | **接受不确定性** | 诊断优先于猜测；若证明 401/500 回 /plan |
| 5 | `abortControllerRef` 重命名（R2） | **重命名为 `pollAbortRef`** | 语义清晰；execute-agent 全文搜索确认所有引用点 |

**阶段 1 启动条件已满足**，可交 execute-agent 执行 D1-D4（D5 在阶段 1 CI 跑完、用户确认根因后才执行）。

---

## 9. 执行顺序建议

### 阶段 1（一次 execute 轮，跑完隔一次 CI）

1. **D2** route.ts 日志前置到鉴权之前 + 加 auth 结果日志
2. **D3** capture/page.tsx 加 controller 生命周期日志
3. **D1** golden-path.spec.ts 加 waitForResponse + 事件监听
4. **D4** golden-path.spec.ts 加 APIRequestContext 直调诊断用例
5. 提交 + 推 dev → CI 跑 → 拿证据
6. **D5** 拿到证据后清理 D2/D3/D4 的临时日志（保留 D1）
7. 写执行日志，等用户确认根因 → 进阶段 2

### 阶段 2（一次 execute 轮，确认根因后才启动）

1. **R1** 装 @testing-library/react + jest-dom，跑现有测试确认不回归
2. **R2** 拆分 AbortController（handleSave + handleRetryProcess + 轮询 effect + handleRetake + handleTakeAnother）
3. **R3** 写 Strict Mode 组件回归测试，跑通（先红后绿）
4. **R5** 修轮询 catch 非静默 + 确认 401/500 进 error 态
5. **R4** E2E 加 waitForResponse 断言 + fake provider 计数器
6. 提交 + 推 dev → CI 跑 → CL-04~07 全绿
7. 写执行日志

---

> 本计划完成后，等用户确认（特别是 §8 开放问题 1-5 的决策）再进入 execute 阶段。
> 阶段 1 和阶段 2 是两次独立的 execute 轮，中间必须有"CI 跑 + 用户确认根因"这个检查点。
