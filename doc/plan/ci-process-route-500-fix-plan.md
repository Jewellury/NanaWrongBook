# CI /process route 返回 500 · 先拿证据再修复计划

> 关联上一轮计划: [doc/plan/ci-process-abortcontroller-fix-plan.md](ci-process-abortcontroller-fix-plan.md)（AbortController 假设，已被证据推翻，保留作历史记录）
> 关联诊断执行日志: [doc/executionlog/ci-process-abortcontroller-diagnose-stage1-log.md](../executionlog/ci-process-abortcontroller-diagnose-stage1-log.md)（阶段 1 D1-D4 + 末尾「根因反转」节）
> 关联问题征询: [doc/research/2026-07-27_ci-process-route-silent-failure-consult.md](../research/2026-07-27_ci-process-route-silent-failure-consult.md)
> 触发事件: 阶段 1 诊断 CI（commit `73bb3d1`, run 30316321387）D4 直调 3 次全部 HTTP 500，POST 函数体第一行 console.log 完全不出现，推翻 AbortController 假设
> 计划日期: 2026-07-28
> 执行者: plan-agent（设计），待用户确认后交 execute-agent 分两轮执行
> 预计影响: `src/app/api/nana/cases/[id]/process/route.ts`、`e2e/ci/nana-golden-path.spec.ts`、`playwright.config.ts`、`.github/workflows/ci.yml`，以及阶段 B 待定文件

---

## 1. 大白话概述

上一轮我们以为是"前端提前取消了 AI 请求"（AbortController 假设），加了 4 个诊断证据点跑了一轮 CI，**证据把这个假设彻底推翻了**：用工具直接调后端接口（绕过前端），3 次全部返回 **HTTP 500**；后端代码第一行的打印日志**完全不出现**。这说明后端的整理接口（`/process`）在**代码还没开始跑**时就崩溃了——最大嫌疑是 Next.js 开发模式第一次访问这个接口时，加载某个关联文件（import）失败了，框架把错误吞掉只返回 500。

**问题是：我们看不到那个被吞掉的错误堆栈**。上一轮 CI 的日志只能看到"返回 500"，但看不到 500 背后的具体报错——因为 next dev 在测试运行期间的错误输出没有传到 CI 日志里。

**这一轮分两阶段做**：
- **阶段 A（补诊断能力，拿 500 真实堆栈）**：给后端代码加"写文件"的诊断钩子（不依赖日志透传）+ 给测试配置加错误输出透传 + CI 跑完专门打印错误日志。跑一轮 CI，**无论拿到什么结论都诚实记录**。
- **阶段 B（基于堆栈的修复 + 护栏）**：拿到堆栈后，对号入座到预设的 5 个根因方向之一，执行对应修复。**在堆栈出来之前，不预判是哪个方向**。

**为什么不能直接猜一个方向修**：上一轮就是信了外部 AI 的假设直接修，结果 16 轮 CI 迭代全白费。这一轮铁律：**先拿证据，再动手**。

---

## 2. 任务分解

> **关键**：阶段 A 和阶段 B 是**两次独立的 execute 轮**，中间隔一次 CI 跑 + 用户确认。阶段 A 跑完拿到 500 堆栈 → 用户确认根因方向 → 才进阶段 B。

### ═══ 阶段 A：补诊断能力，拿 500 真实堆栈（必做）═══

> 诊断目标：拿到 /process 返回 500 时 Next.js 框架捕获的真实错误堆栈，定位是哪个 import / 哪一行模块顶层代码崩溃。
> **铁律 6 声明**：如果阶段 A 跑完后仍然拿不到堆栈（Next.js 把关键信息吞得太深），必须诚实声明，不能假装"差不多知道了"。届时考虑本地复现或二分法诊断（见 §5.1 风险 A）。

#### 任务 A1：route.ts 模块加载标记 + POST 入口文件写入

- **涉及文件**：`src/app/api/nana/cases/[id]/process/route.ts`
- **做什么**：
  1. **模块顶层标记**：在 import 块全部结束之后（当前 line 36 `const logger = createLogger(...)` 之前），插入一段同步写文件代码：
     ```typescript
     // [DEBUG CI 2026-07-28 阶段A] 模块加载完成标记——证明所有 import 成功
     // 不依赖 console.error 透传，直接写 CI 文件系统（铁律6：双保险拿证据）
     try {
       const fs = require("fs");
       fs.appendFileSync('/tmp/process-route-module-loaded.log',
         `[${new Date().toISOString()}] route.ts module evaluation COMPLETED\n`);
     } catch (e) { /* 模块顶层不能 throw，吞掉 */ }
     ```
     **为什么用 `require` 而非 `import fs`**：ESM 中 `import` 是 hoisted（提升），会在所有其他 import 之前执行；而我们要的是"所有 import 之后"的标记。`require` 是同步且不提升的，放在 import 块后就是按顺序执行。Next.js dev mode 的 route.ts 支持 `require`（有 `tsconfig` 的 `esModuleInterop` + Node 运行时）。
     **注意**：如果 execute-agent 发现 `require` 在该文件报 TS 错误（`Cannot use require`），改用 `import fs from "node:fs"` 放在文件最顶部 import 区——但需知此时 import 顺序不可控，mark 可能早于其他 import 执行。两种都试，以 CI 上哪种能跑通为准（铁律 5：不确定就问）。
  2. **POST 入口文件写入**（双保险，承接上一轮 D2 已有的 console.log）：在当前 POST 函数体第一行的 `console.log("[process-route DEBUG]", {...})` **紧挨着**加：
     ```typescript
     try {
       const fs = require("fs");
       fs.appendFileSync('/tmp/process-route-post-entered.log',
         `[${new Date().toISOString()}] POST handler ENTERED\n`);
     } catch (e) { /* ignore */ }
     ```
  3. **POST 外层 catch 写堆栈**：当前 POST 的最外层 catch（line 397-400）只调 `internalError()`，把错误堆栈吞了。改为在 `return internalError()` 之前加：
     ```typescript
     try {
       const fs = require("fs");
       fs.appendFileSync('/tmp/process-route-error.log',
         `[${new Date().toISOString()}] POST outer catch:\n${error instanceof Error ? error.stack : String(error)}\n`);
     } catch { /* ignore */ }
     ```
- **诊断逻辑**（CI 跑完后看哪几个文件出现）：
  | `/tmp/process-route-module-loaded.log` | `/tmp/process-route-post-entered.log` | `/tmp/process-route-error.log` | 结论 |
  |:-:|:-:|:-:|:--|
  | ❌ 没出现 | ❌ | ❌ | **import 链崩溃**——模块顶层没执行完。重点看 A2 的 stderr stack |
  | ✅ 出现 | ❌ | ❌ | 模块加载完了，但 POST 没被调到——Next.js 框架层在路由匹配/dispatch 时崩溃 |
  | ✅ | ✅ | ❌ | POST 进来了但中途崩溃——看 A2 stderr + A1 的 outer catch log |
  | ✅ | ✅ | ✅ | POST 内部异常被 outer catch 捕获——**直接拿到 stack，阶段 B 可启动** |
- **风险**：低。`fs.appendFileSync` 是同步阻塞 IO，但只在诊断路径执行（每次 /process 调用最多写一次），不影响业务逻辑。`require("fs")` 在 Next.js route 中可用。

#### 任务 A2：playwright.config.ts webServer 加 stdout/stderr 透传

- **涉及文件**：`playwright.config.ts`（webServer 配置块，当前 line 45-64）
- **做什么**：
  1. webServer 配置块**新增** `stdout` 和 `stderr` 选项（启动命令 `npx next dev -p ${E2E_PORT}` **不动**，用户硬约束）：
     ```typescript
     webServer: {
       command: `echo "..." && npx next dev -p ${E2E_PORT}`,  // 不变
       url: E2E_HOST,                                          // 不变
       reuseExistingServer: !process.env.CI,                  // 不变
       timeout: 180 * 1000,                                   // 不变
       stdout: 'pipe',   // 新增：显式声明透传（Playwright 默认就是 pipe，显式写出来排除不确定性）
       stderr: 'pipe',   // 新增：同上。关键：让 next dev test 期间的编译错误/模块加载错误传到 CI 日志
       env: { ... },     // 不变
     }
     ```
  2. **关于 Playwright 版本**：`package.json` 实际装的是 `@playwright/test@^1.57.0`（不是问题征询报告里写的 1.49）。Playwright 1.57 的 `webServer.stdout/stderr` 选项值为 `'pipe' | 'ignore'`，默认 `'pipe'`。虽然默认就是 pipe，但显式写出来有两好处：① 排除"默认值被某处覆盖"的不确定性；② 文档化意图，让后续维护者知道这是诊断需要。
  3. **诚实声明（铁律 6）**：上一轮执行日志判断"next dev stderr 在 test 期间被 Playwright 吞掉"——**这个判断本身可能不准确**。Playwright 默认就是 pipe，理论上 stderr 应该已经透传。test 期间看不到 stderr 的真实原因可能是：① Next.js 框架把模块加载错误 catch 后没输出到 stderr；② GitHub Actions step 输出被截断；③ next dev 的编译错误走了别的通道（如 overlay UI）。A2 显式设置后，如果还是看不到 stack，说明原因不是 Playwright 透传，而是 Next.js 框架层——届时靠 A1 的写文件兜底。
- **备选方案（A2 写文件兜底）**：如果 Playwright stdout/stderr pipe 仍拿不到 next dev 的模块加载错误，在 route.ts 用 `fs.appendFileSync` 手动复制 `console.error` 输出（A1 已覆盖此场景）。
- **风险**：低。stdout/stderr 是透传选项，不改启动命令、不改端口、不改超时。最坏情况是 CI 日志变长（next dev 的 verbose 输出全透传），但信息多是好事。

#### 任务 A3：CI step 增加错误日志 cat

- **涉及文件**：`.github/workflows/ci.yml`（e2e-test job，Run Playwright step 之后）
- **做什么**：在 `Run Playwright tests` step（当前 line 185-193）之后、`Stop fake provider server` step（line 198）之前，**新增一个 step**：
  ```yaml
      # [阶段A 诊断] 打印 route.ts 诊断文件——无论 Playwright 成功失败都执行
      # 配合任务 A1：把 route.ts 写的模块加载标记 / POST 入口 / outer catch stack 全打出来
      - name: Dump process route diagnostic logs
        if: always()
        run: |
          echo "=== /tmp/process-route-module-loaded.log ==="
          cat /tmp/process-route-module-loaded.log 2>/dev/null || echo "(file not found — module evaluation did NOT complete)"
          echo "=== /tmp/process-route-post-entered.log ==="
          cat /tmp/process-route-post-entered.log 2>/dev/null || echo "(file not found — POST handler never entered)"
          echo "=== /tmp/process-route-error.log ==="
          cat /tmp/process-route-error.log 2>/dev/null || echo "(file not found — no outer catch triggered)"
  ```
  - **`if: always()`** 保证即使 Playwright step 失败（CL-04 timeout）也会执行
  - 三个文件分别对应 A1 的三个诊断点，缺失本身也是诊断信息（见 A1 诊断逻辑表）
- **风险**：无。只读文件，`2>/dev/null` 容错，不改变任何测试行为。

#### 任务 A4：D4 直调用例加 response body 解析 + retry

- **涉及文件**：`e2e/ci/nana-golden-path.spec.ts`（D4 describe，当前 line 499-600）
- **做什么**：
  1. **500 时解析 response body**：当前 D4 只 `console.log` status + body.status（body 解析失败时只打 parse error）。改为：500 时额外尝试读取 response text（Next.js 500 响应可能是 HTML 错误页或 JSON），打印前 2000 字符到日志：
     ```typescript
     const response = await page.context().request.post(`/api/nana/cases/${caseId}/process`);
     console.log(`[e2e-diag D4] direct POST status=${response.status()}`);
     const body = await response.json().catch(() => null);
     if (body) {
       console.log(`[e2e-diag D4] direct POST body.status=${body.status}`);
     } else {
       // JSON 解析失败 → 可能是 Next.js 500 HTML 错误页，读 text
       const text = await response.text().catch(() => '(unreadable)');
       console.log(`[e2e-diag D4] direct POST body (non-JSON, first 2000 chars): ${text.slice(0, 2000)}`);
     }
     ```
     **注意**：`response.json()` 和 `response.text()` 不能都调（body 已被消费）。execute-agent 需先 `const text = await response.text()`，再 `try { body = JSON.parse(text) } catch { body = null }`。这是 Playwright API 的正确用法。
  2. **加 retry 机制（区分冷启动 vs 确定性崩溃）**：第一次直调如果非 200，等 5 秒重试一次：
     ```typescript
     let response = await page.context().request.post(`/api/nana/cases/${caseId}/process`);
     console.log(`[e2e-diag D4] attempt 1 status=${response.status()}`);
     if (response.status() !== 200) {
       console.log('[e2e-diag D4] attempt 1 non-200, waiting 5s for next dev cold-compile to settle, then retry...');
       await page.waitForTimeout(5000);
       response = await page.context().request.post(`/api/nana/cases/${caseId}/process`);
       console.log(`[e2e-diag D4] attempt 2 status=${response.status()}`);
     }
     ```
     **诊断价值**：
     - attempt 1 失败 + attempt 2 成功 → **next dev 首次按需编译的瞬时失败**（方向 2 实锤），修复方向是 CI 预热
     - attempt 1 失败 + attempt 2 仍失败 → **确定性模块加载错误**（方向 1/3/4/5），修复方向看 A1/A2 的 stack
  3. **断言放宽（仅阶段 A）**：当前 D4 断言 `expect(response.status()).toBe(200)`。阶段 A 把它改为**不断言 200，只采集证据**（断言移到注释里），让 D4 无论 200/500 都跑完，拿全 body + retry 信息。**阶段 B 修复后恢复断言 200**。
     ```typescript
     // [阶段A] 不断言 200，只采集证据。阶段B 修复后恢复：expect(response.status()).toBe(200)
     console.log(`[e2e-diag D4] final status=${response.status()} (阶段A: 不断言, 只采集)`);
     ```
- **风险**：低。retry 只在非 200 时触发，不掩盖首次失败（首次失败已打日志）。断言放宽是阶段 A 临时策略，阶段 B 恢复。

#### 任务 A5：阶段 A CI 跑完后的清理（保留长期诊断能力）

- **涉及文件**：`src/app/api/nana/cases/[id]/process/route.ts`、`playwright.config.ts`、`.github/workflows/ci.yml`、`e2e/ci/nana-golden-path.spec.ts`
- **做什么**（阶段 A CI 跑完、用户确认根因方向后执行）：
  | 项 | 处置 | 理由 |
  |---|---|---|
  | A1 的 route.ts 顶层 `fs.appendFileSync` mark | **删除** | 临时诊断，已拿证据 |
  | A1 的 POST 入口 `fs.appendFileSync` | **删除** | 同上 |
  | A1 的 POST outer catch `fs.appendFileSync` stack 写入 | **保留**（改造为长期护栏）| 这是铁律 6 护栏——500 时把 stack 写文件，未来任何 500 都能留证据。把文件名改为 `/tmp/process-route-500-stack.log`，catch 里同时 `console.error` + 写文件 |
  | A2 的 playwright.config.ts `stdout/stderr: 'pipe'` | **保留** | 长期诊断能力，让未来任何 next dev stderr 都透传 |
  | A3 的 CI step `Dump process route diagnostic logs` | **保留** | `if: always()` 让未来任何 500 都留下证据；改名为 `Dump process route error log (long-term guardrail)` |
  | A4 的 D4 body 解析 + retry | **保留** | D4 本身就是长期诊断能力（区分前后端问题）。retry 保留，断言在阶段 B 恢复 200 |
  | 上一轮 D2 的 `[process-route DEBUG]` console.log（env + auth） | **删除** | 临时诊断，env/auth 信息已通过 A1 mark 间接确认。删除减少日志噪音 |
  | 上一轮 D3 的 `[ctrl-diag]` 前端日志（capture/page.tsx） | **删除** | 根因已确认在后端（不是前端 abort），前端诊断日志无价值 |
- **风险**：清理时注意别误删 A1 outer catch 的长期护栏版（保留版 vs 删除版的区别见上表）。execute-agent 应对照本表逐项操作。

---

### ═══ 阶段 B：基于 stack 的修复（弹性设计）═══

> **关键**：阶段 B 的具体修复方式**必须等阶段 A 拿到 stack 才能定**。本节列出 5 个预设的根因方向 + 对应修复预案，让用户在阶段 A 出 stack 后能快速对号入座。**不预判哪个方向**。

#### 任务 B0：解读阶段 A 的 stack，归类根因方向（必做，可能回 /plan）

- **做什么**：拿阶段 A CI 跑出的证据（A1 的三个文件 + A2 的 stderr + A4 的 D4 body/retry），对照下方 5 个方向归类。
- **如果 5 个方向都对不上**：诚实声明"发现新根因方向"，回 /plan 二次重设计。不硬塞到某个方向。

#### 任务 B1～B.N：根据方向执行修复（弹性，下方按方向列预案）

##### 方向 1：import 链中某个模块的 native binding / 外部包加载失败

- **嫌疑评估**（代码层证据）：
  - `better-sqlite3`（通过 `@prisma/adapter-better-sqlite3` 间接依赖）：**嫌疑较低**。`src/lib/prisma.ts` 的 `new PrismaClient({...})` 未指定 adapter，默认用 Prisma Rust query engine；且 createCase route 同样用 prisma 却成功。但 Turbopack dev 按需编译的模块图扫描可能触碰它。
  - `openai@^6.9.1`（`case-analyzer.ts` 顶层 import）：**中等嫌疑**。纯 JS SDK，但入口可能有 Conditional Exports 在 dev mode ESM 下走了错误分支。
  - `bcryptjs@^3.0.3`（`auth.ts` import）：**低嫌疑**。已在 `serverExternalPackages`，且 createCase route 的鉴权链已成功。
  - `undici@^7.16.0`（显式依赖，Node 22 自带）：**低嫌疑**。可能与 Node 内置版本冲突，但无直接 import 链证据。
- **修复预案**：
  - 把嫌疑包加入 `next.config.ts` 的 `serverExternalPackages`（如 `openai`、`@prisma/adapter-better-sqlite3`），让 Next.js 不 bundle 而是 require
  - 如果是 better-sqlite3 native binding 问题，可能需要在 CI 加 `npm rebuild` step
  - 替换为纯 JS 替代（最后手段）

##### 方向 2：next dev 按需编译时序问题（首次冷启动编译失败）

- **嫌疑评估**：
  - D4 attempt 1 失败 + attempt 2 成功（阶段 A 任务 A4 的 retry 会证实）→ 实锤冷启动问题
  - next dev 第一次访问 route 时触发即时编译，CI 机器慢时编译未完成就返回 500
- **修复预案**：
  - **CI 预热**：在 `Run Playwright tests` step 之前加一个 `Warm up next dev routes` step，用 curl 访问 `/api/nana/cases/dummy-case-id/process`（预期 401，但触发 route 编译）+ 其他关键 route。等编译完成后再跑 test。
  - 预热 step 伪代码：
    ```yaml
    - name: Warm up next dev route compilation
      run: |
        # 等 next dev ready（webServer url 检查已在 Playwright 内部完成）
        sleep 5
        # 触发关键 route 按需编译（不关心返回码，只要触发编译）
        curl -s -o /dev/null http://127.0.0.1:3000/api/nana/cases/warmup/process || true
        sleep 3  # 等编译完成
    ```

##### 方向 3：env 变量在 dev 模式下的读取时机问题

- **嫌疑评估**：
  - `case-analyzer.ts` 的 `new OpenAI({...})` 在函数体内（line 315），不在顶层——**不是嫌疑**
  - `case-analyzer.ts` line 304-313 读 `VOLCENGINE_API_KEY/BASE_URL/LITE_ENDPOINT_ID` 在函数体内——**不是嫌疑**
  - 但 `logger.ts` line 64 顶层 `const isPrettyMode = process.env.NODE_ENV !== 'production'`——纯布尔判断，不会 throw
  - `auth.ts` 顶层 `process.env.NODE_ENV`（line 31）、`process.env.NEXTAUTH_URL`（line 31）——在对象字面量内，求值时读，不会 throw
  - **整体嫌疑低**：route.ts import 链上没有"顶层读 env 并立即用于会 throw 的操作"的代码
- **修复预案**（如 stack 确指此方向）：
  - 把所有顶层 env 读取移到函数体内
  - 但基于代码审查，这个方向概率很低，除非 stack 显示 `Cannot read property 'xxx' of undefined` 指向某个 env

##### 方向 4：Next.js 16 + Turbopack dev mode 的 known issue

- **嫌疑评估**：
  - Next.js `^16.0.10`（package.json）+ Turbopack（next dev 默认用 Turbopack）
  - next.config.ts 配了 `output: 'standalone'`，dev mode 下可能与 Turbopack 的按需编译有冲突
  - **中等嫌疑**：Next 16.0.x 是较新版本，Turbopack dev mode 的 edge case 可能未完全覆盖
- **修复预案**：
  - **方案 A**：升级 Next.js patch 版本（如 16.0.10 → 16.0.11+），查看 changelog 是否有相关 fix
  - **方案 B**：CI dev mode 临时禁用 Turbopack（`next dev --no-turbopack`），用 webpack dev。**注意**：禁用 Turbopack **不等于**关闭 React Strict Mode（Strict Mode 是 React 的，Turbopack 是打包器的，互相独立）。这是用户硬约束"不关 Strict Mode"允许的。但需改 webServer 启动命令（用户硬约束"不改启动方式"）——**如果走到这步，必须回 /plan 向用户申请特批解禁**。
  - **方案 C**：CI 改用 `next start`（生产模式启动）而非 `next dev`——但这与 `output: 'standalone'` 冲突（问题征询报告 §三假设 3 已证实），且会关闭 Strict Mode（违反硬约束）。**排除**。

##### 方向 5：auth 模块在 dev mode 下的加载问题

- **嫌疑评估**：
  - `src/lib/auth.ts` line 11: `adapter: PrismaAdapter(prisma)` 在 `authOptions` export const 求值时执行——**顶层副作用**
  - line 125-130: 模块加载时 `logger.info({...}, 'AuthConfig loading')`——启动期日志曾出现 NextAuth 警告（执行日志 line 185），说明 auth 模块**至少在启动期被加载过**
  - 但 process route 第一次按需编译时，auth 模块可能在新编译上下文中重新求值
  - **中等嫌疑**：如果 PrismaAdapter 初始化在某些条件下 throw（如 prisma client 未就绪），整个 import 链失败
- **修复预案**：
  - 待 stack 确认后细化
  - 可能的修法：把 `PrismaAdapter(prisma)` 延迟到第一次使用时（lazy init），而非模块加载时

#### 任务 B-last：护栏（无论哪个方向都要补的独立改进）

> 这些护栏与根因无关，是长期质量保障。承接原 AbortController plan 的相关任务。

- **B-last-1（原 R3）**：补 Strict Mode 组件回归测试。用 `@testing-library/react` 渲染 CapturePage，验证 effect cleanup 不取消 POST。**与本轮 500 根因无关，但覆盖了"前端生命周期"的测试盲区**。前置任务：装 `@testing-library/react@^16` + `@testing-library/jest-dom@^6`（原 R1）。
- **B-last-2（原 R4）**：E2E 升级响应断言 + fake provider 计数。CL-04 `waitForResponse` 断言 200（阶段 A 已改，阶段 B 恢复断言）+ CL-07 加 `expect(getChatCompletionsCount()).toBeGreaterThanOrEqual(1)`。
- **B-last-3（原 R5）**：非静默错误护栏。轮询 catch 非空（`console.error` 非 AbortError 的错误）+ route 返回 401/500 时前端进 error 态。
- **B-last-4（原 R6）**：不关 Strict Mode（声明性硬约束，延续）。

---

### ═══ 原计划阶段的处置（对照表）═══

| 原计划部分 | 处置 | 理由 |
|-----------|------|------|
| 原阶段 1 D1（waitForResponse + 三事件监听 + chat/completions 计数） | **保留**（长期诊断能力） | D1 让本轮立即看到 500，证明有效 |
| 原阶段 1 D2（route 日志前置） | **阶段 A 任务 A5 清理** | A1 的文件写入比 console.log 更可靠；D2 的 env/auth 日志已完成使命 |
| 原阶段 1 D3（前端 controller 日志） | **阶段 A 任务 A5 清理** | 根因已确认在后端，前端日志无价值 |
| 原阶段 1 D4（APIRequestContext 直调） | **保留并扩展**（任务 A4） | D4 一举推翻 abort 假设，是本轮功臣 |
| 原阶段 1 D5（清理诊断日志） | **被 A5 取代** | A5 更细化（区分删除/保留） |
| 原阶段 2 R1（装 testing-library） | **保留**（阶段 B-last-1 前置） | 与根因无关，独立护栏 |
| 原阶段 2 R2（拆 AbortController） | **降级为 deferred 改进项** | 是代码健康改进但**不是本轮根因**。**明确标注：deferred，不是 cancelled**——下一轮独立做。本轮不做避免与 500 修复混淆 |
| 原阶段 2 R3（Strict Mode 组件测试） | **保留**（阶段 B-last-1） | 独立护栏 |
| 原阶段 2 R4（E2E 响应断言 + provider 计数） | **保留**（阶段 B-last-2） | 独立护栏 |
| 原阶段 2 R5（非静默错误） | **保留**（阶段 B-last-3） | 铁律 6 护栏 |
| 原阶段 2 R6（不关 Strict Mode） | **保留**（阶段 B-last-4 声明） | 延续 |

---

## 3. 文件变更清单（阶段 A）

| 文件 | 操作 | 上游冲突风险 | 说明 |
|------|------|:---:|------|
| `src/app/api/nana/cases/[id]/process/route.ts` | 修改 | 无（本项目新增 route） | A1: 顶层 mark + POST 入口 + outer catch 写文件。A5: 部分删除、部分保留为长期护栏 |
| `e2e/ci/nana-golden-path.spec.ts` | 修改 | 无（本项目新增 spec） | A4: D4 加 body 解析 + retry + 断言放宽。A5: 保留 D4 改造、删除 D2/D3 临时日志 |
| `playwright.config.ts` | 修改 | 无（本项目新增配置） | A2: webServer 加 `stdout: 'pipe'` + `stderr: 'pipe'`（不改启动命令）。A5: 保留（长期诊断能力） |
| `.github/workflows/ci.yml` | 修改 | ⚠️ **上游文件**（wrong-notebook 追踪） | A3: e2e-test job 加 `Dump process route diagnostic logs` step。commit message 标注 `⚠️上游文件修改`。A5: 保留并改名 |

> **注意**：阶段 B 的文件变更清单待 stack 出来后补充。
> `ci.yml` 是上游追踪文件，本轮修改是**增量加 step**（不改现有 step），冲突点明确且可合并。

---

## 4. 验收标准

### 4.1 阶段 A 验收（拿到 stack 或诚实声明拿不到）

- [ ] 推送阶段 A 改动到 dev 后，CI E2E Tests job 跑完，`Dump process route diagnostic logs` step 输出**出现以下之一**：
  - **情况 1（拿到 stack）**：`/tmp/process-route-error.log` 含完整 error stack → **阶段 B 可启动**
  - **情况 2（模块没加载完）**：`/tmp/process-route-module-loaded.log` 不存在，但 A2 的 stderr pipe 透传了 Next.js 的模块加载错误 → **阶段 B 可启动**
  - **情况 3（D4 body 有信息）**：D4 的 response body（HTML 或 JSON）含 Next.js 错误信息 → **阶段 B 可启动**
  - **情况 4（拿到了部分信息但不足以定位）**：诚实记录"看到 X 但不足以定位根因"，列出还缺什么 → 考虑本地复现或二分法（见 §5.1）
  - **情况 5（什么都没拿到）**：三个文件都不存在 + stderr 无新信息 + D4 body 无错误详情 → **诚实声明诊断失败**，回 /plan 考虑完全不同的诊断路径（如本地 Docker 复现、加更多 console.log 二分查找）
- [ ] D4 retry 结果记录（attempt 1 vs attempt 2 状态码对比）→ 用于区分方向 2（冷启动）vs 其他
- [ ] 诊断结论写入执行日志（即使是"仍不确定"也要诚实记录，铁律 6）
- [ ] A5 清理执行完毕（该删的删、该留的留）

### 4.2 阶段 B 验收（修复 + 护栏）

#### 自动化测试（必须全绿）
- [ ] D4 直调恢复断言 200 + body.status 非空（attempt 1 就应 200，不需 retry）
- [ ] **CL-04~07 在 CI 全绿**：waitForResponse 断言 200 + status 字段；`/chat/completions` 计数 ≥ 1；DB 双层 tag 落库
- [ ] 新增 Strict Mode 组件回归测试通过（B-last-1，场景 A/B/C）
- [ ] 现有 round4-process-trigger.test.tsx 不回归

#### CI 证据（最终门禁）
- [ ] 推送阶段 B 到 dev 后，CI E2E Tests job **退出码 0**
- [ ] CI 日志中 `requestfailed` 监听**不再捕获** `/process` 的 abort 事件
- [ ] CI 日志中 `/process` response **不再是 500**
- [ ] `Dump process route error log` step 输出"no error log"（500 不再出现）

#### 本地 sanity check
- [ ] `npm.cmd run build` 通过
- [ ] `npm.cmd run test -- --run` 全过
- [ ] `node node_modules/eslint/bin/eslint.js src/app/api/nana/cases/[id]/process/route.ts e2e/ci/nana-golden-path.spec.ts playwright.config.ts` → 0 error

### 4.3 不变性（不能破坏的现有行为）
- [ ] Unit / Integration / Build job 继续绿色
- [ ] CL-01~04（导航、题图、保存"已收好"）不受影响
- [ ] createCase route 继续工作（它是 process route 的对照组——如果 createCase 也开始 500，说明根因是全局性的）
- [ ] 竞态保护（currentCaseIdRef 机制）保留有效

### 4.4 测试策略标注

> 本轮核心是**诊断**（阶段 A），不是"测试先行"的场景。阶段 A 的诊断点本身是"验证假设"——每个诊断文件出现/缺失都是证据。阶段 B 的修复才是"测试先行"：先复现 500 的测试（D4 直调断言 200），再修复让它转绿。

---

## 5. 风险与注意事项

### 5.1 plan-agent 发现的额外风险

#### 风险 A：阶段 A 拿到的 stack 可能仍不足以定位根因

Next.js 框架在 dev mode 下捕获模块加载错误时，可能只输出一个高层错误（如"Module not found"或"Cannot compile"），不包含具体哪个 import 失败的完整堆栈。这是 Next.js Turbopack 的已知行为——它的错误边界设计偏向"给开发者看 overlay UI"而非"输出可解析的 stderr"。

**应对**：
- 如果 stack 不够，**先诚实声明**（铁律 6），不猜
- 二分法备选：创建多个诊断 probe route（如 `/api/nana/_diag/probe-openai`、`/api/nana/_diag/probe-case-analyzer`），每个只 import 一个嫌疑模块，看哪个 500。但这需要多轮 CI，是阶段 A 拿不到 stack 时的 Plan B
- 本地复现备选：在本地（Windows）用 `npx next dev` + `curl /api/nana/cases/dummy/process` 触发同样的按需编译，看本地 stderr 能否复现。但本地是 Windows + glibc 差异，可能复现不了 Linux CI 的问题

#### 风险 B：R2（AbortController 拆分）降级后可能被遗忘

原 AbortController plan 的 R2（拆分 POST 与轮询的取消域）是合理的代码健康改进，但**不是本轮 500 的根因**。本轮降级为 deferred 后，如果没有明确的追踪机制，下一轮排期时可能被遗忘。

**应对**：
- 本 plan §2 原计划处置表已明确标注"R2 = deferred，不是 cancelled"
- 建议用户在阶段 B 结束后，把 R2 写入 `doc/active_spec.md` 的"下一轮候选"清单
- R2 本身的设计（原 plan §6.2 修复前后 ref 关系图 + §6.3 伪代码）保留在原 plan 文件中，不丢失

#### 风险 C：`require("fs")` 在 Next.js route.ts 的 ESM 上下文中可能不可用

任务 A1 计划用 `require("fs")` 绕过 ESM import hoisting。但 Next.js 16 的 route handler 是 ESM 模块，`require` 在纯 ESM 上下文中未定义（除非有 CJS interop）。

**应对**：
- execute-agent 先试 `require("fs")`，如果 TS 编译报错或运行时 `require is not defined`，改用 `import fs from "node:fs"` 放在文件顶部 import 区
- 用 `import` 时，由于 hoisting，mark 会早于其他 import 执行——此时 mark 出现只能证明"route.ts 被 Next.js 尝试加载"，不能证明"所有 import 完成"。诊断逻辑表需相应调整：mark 出现 + POST mark 不出现 → import 链崩溃（但不能区分是哪个 import）
- 如果两种都不行，回 /plan 重新设计诊断钩子（可能需要 wrapper 模块）

### 5.2 技术不确定性

| 项 | 不确定性 | 处置 |
|----|---------|------|
| A1 的 `require("fs")` 是否可用 | 不确定（ESM 上下文） | 见风险 C，两种方案都试 |
| A2 的 stderr pipe 能否拿到 Next.js 框架内部错误 | 不确定（可能被框架 catch 不输出） | A1 的写文件兜底；如都不行，二分法 |
| A4 的 D4 body 是否包含有用错误信息 | 不确定（Next.js 500 可能只返回通用错误页） | 尝试解析，无用则靠 A1/A2 |
| 阶段 B 修复方向 | **高度不确定**（取决于 stack） | 5 个方向预案，不预判 |
| R2 deferred 后何时排期 | 不确定（取决于用户排期） | 写入 active_spec 候选清单 |

### 5.3 本轮硬约束（用户明令延续 + 本轮调整）

- **不动** `next.config.ts` 的 `output: 'standalone'`
- **不动** `Dockerfile`
- **不跳过** CL-05/06/07 任何一步断言换绿灯（阶段 A 的 D4 断言放宽是**诊断需要**，不是跳过；阶段 B 恢复断言）
- **不关闭** React Strict Mode
- **playwright.config.ts webServer 启动命令不改**（仍 `npx next dev`）——本轮**部分解禁**：允许加 `stdout/stderr` 透传选项（只为拿 stack）

### 5.4 不做的事（范围控制）

- 不改 Prisma schema（铁律 3）
- 不改 case-analyzer.ts 业务逻辑（本轮只诊断 route 加载层，AI 管线本身不是范围）
- 不做 R2（AbortController 拆分）——deferred 到下一轮
- 不跳过任何 CI 门禁换绿灯

---

## 6. 技术附录

### 6.1 上一轮诊断证据汇总（阶段 1 CI run 30316321387）

| 证据点 | 结果 | 来源 |
|--------|------|------|
| S1 主路径 /process response | `status=500` × 3（3 retries） | `[e2e-diag] response` 日志 |
| S1 requestfailed | `errorText=net::ERR_ABORTED` × 3 | `[e2e-diag] requestfailed` 日志 |
| D4 直调状态码 | `status=500` × 3 | `[e2e-diag D4] direct POST status=500` |
| chat/completions 计数 | `total seen: 0` | `[e2e-diag] chat/completions` 日志 |
| `[process-route DEBUG]` POST 入口日志 | **完全不出现**（0 次） | route.ts line 276 console.log |
| `[ctrl-diag]` 前端日志 | 完全不出现（未加 `page.on('console')` 转发，**不能下结论**） | — |
| next dev 启动期 stderr | baseline-browser-mapping / middleware / NextAuth 警告 | 仅启动期，test 期间无新增 |
| Build job | ✅ 通过（57 页面全编译，路由表含 `/api/nana/cases/[id]/process`） | Build Check job |

**关键推论**：Build job 通过证明 `npm run build`（全量编译）能成功打包 process route。但 next dev（按需编译）第一次访问时 500。这是**运行时模块加载问题**，不是编译问题。

### 6.2 route.ts import 链全图（模块加载崩溃定位用）

```
src/app/api/nana/cases/[id]/process/route.ts
├── next/server (NextResponse)                    ← 框架提供，无嫌疑
├── @/lib/prisma                                  ← 顶层 new PrismaClient()
│   └── @prisma/client (serverExternalPackages)   ← 已 externalize，低嫌疑
├── @/lib/auth                                    ← 顶层 PrismaAdapter(prisma) + logger.info 副作用
│   ├── next-auth                                 ← 框架提供
│   ├── @next-auth/prisma-adapter                 ← 纯 JS
│   ├── next-auth/providers/credentials           ← 纯 JS
│   ├── bcryptjs (serverExternalPackages)         ← 已 externalize，低嫌疑
│   └── @/lib/prisma (同上)
├── next-auth (getServerSession)                  ← 框架提供
├── @/lib/api-errors                              ← 纯函数 + 常量，无副作用
├── @/lib/logger                                  ← 顶层 createLoggerInstance，纯 JS
├── @/lib/nana/case-analyzer                      ← 顶层 import openai + createLogger
│   ├── openai (^6.9.1)                          ← ★ 中等嫌疑：纯 JS 但 Conditional Exports 可能在 dev mode 走错分支
│   ├── openai/resources/chat/completions (type)  ← type-only，编译期消除
│   ├── zod                                       ← 纯 JS
│   ├── @/lib/logger (同上)
│   ├── @/lib/nana/audio-transcode               ← 顶层 promisify(execFile)，Node 内置
│   │   └── child_process / fs / path / os        ← Node 内置，低嫌疑（但 Turbopack 对内置模块的 ESM 处理有 edge case）
│   └── @/lib/nana/audio-utils                    ← 纯常量 + 纯函数，无副作用
├── @/lib/nana/audio-utils (同上)
└── @/lib/nana/transcript-utils                   ← 纯常量 + 纯函数，无副作用
```

**★ 标注的最高嫌疑**：`openai` 包。它是 process route 独有的 import（createCase route 不 import case-analyzer，因此不 import openai）。这完美解释了"createCase 成功但 process route 500"的差异——**两个 route 的模块图不同，process 多了 openai 这条链**。

**第二嫌疑**：`@/lib/nana/audio-transcode` 的 `child_process` / `fs` / `path` / `os` 在 Turbopack dev 按需编译下的 ESM 处理。但这些是 Node 内置，createCase route 的 prisma 间接也用了 fs，嫌疑较低。

**但以上都是推测，不预判**——等 A1+A2 的 stack。

### 6.3 任务 A1 的诊断逻辑（文件出现/缺失矩阵）

| module-loaded.log | post-entered.log | error.log | 诊断结论 | 下一步 |
|:-:|:-:|:-:|:--|:--|
| ❌ | ❌ | ❌ | import 链崩溃，模块顶层没执行完 | 看 A2 stderr stack；二分法定位嫌疑 import |
| ✅ | ❌ | ❌ | 模块加载完，但 POST 没被调到 | Next.js 框架 dispatch 层问题（方向 4） |
| ✅ | ✅ | ❌ | POST 进来了，中途崩溃但没到 outer catch | 看 A2 stderr；POST 内部某行 throw 未被 try 包裹 |
| ✅ | ✅ | ✅ | POST 内部异常被 outer catch 捕获 | **直接读 error.log 的 stack，阶段 B 启动** |

### 6.4 任务 A2 的 Playwright webServer stdout/stderr 文档

**Playwright 版本**：`@playwright/test@^1.57.0`（package.json line 70，非问题征询报告里的 1.49）

**webServer.stdout / webServer.stderr 选项**（Playwright 1.57）：
- `'pipe'`（默认）：透传 webServer 子进程的 stdout/stderr 到测试运行的 process
- `'ignore'`：丢弃

**关键认知**：默认就是 `'pipe'`，理论上 stderr 应该已经透传。上一轮执行日志判断"test 期间 stderr 被吞"可能不准确（铁律 6：上一轮判断本身有不确定性）。本轮显式写 `'pipe'` 是为了：
1. 排除"默认值不确定"的可能性
2. 文档化意图

如果显式 `'pipe'` 后仍看不到 next dev test 期间的 stderr，说明问题不在 Playwright 透传，而在：
- Next.js 框架把模块加载错误 catch 后**没输出到 stderr**（走 overlay UI 或内部 logger）
- GitHub Actions step 输出缓冲/截断

届时靠 A1 的 `fs.appendFileSync` 写文件兜底（不依赖任何透传机制）。

### 6.5 5 个根因方向的代码层证据

#### 方向 1（native binding）的证据

- **better-sqlite3**：`package.json` line 33 `@prisma/adapter-better-sqlite3@^7.0.1` + line 73 `@types/better-sqlite3`。但 `src/lib/prisma.ts` 的 `new PrismaClient` 未指定 adapter，默认用 Rust query engine。**better-sqlite3 可能未被实际加载**，除非 Turbopack 模块图扫描触碰到。`better-sqlite3` 不在 `serverExternalPackages`——如果被 bundle，native `.node` 文件会加载失败。
- **无 fluent-ffmpeg / sharp**：`package.json` 无这两个依赖。`audio-transcode.ts` 用 `child_process.execFile("ffmpeg", ...)` 调二进制，不 import npm 包。**这两个常见 native binding 嫌疑排除**。
- **openai@^6.9.1**：纯 JS SDK，无 native binding。但入口文件可能有 Conditional Exports。

#### 方向 2（冷启动编译）的证据

- next dev 第一次访问 route 时触发即时编译。CI 机器（GitHub Actions ubuntu-latest）性能有限，编译可能耗时。
- playwright.config.ts line 56: `timeout: 180 * 1000`（webServer 启动 3 分钟超时），说明已知 dev 模式首屏编译慢。
- 但 webServer url 检查通过（启动期）≠ route 按需编译完成。route 的按需编译在**第一次请求该 route 时**触发，不在 webServer 启动时。

#### 方向 3（env 读取时机）的证据

代码审查 route.ts 全部 import 链，**未发现顶层 env 读取 + 立即用于会 throw 的操作**：
- `case-analyzer.ts` 的 `new OpenAI({...})` 在函数体内（line 315），不在顶层
- `case-analyzer.ts` 的 env 读取（line 304-313）在函数体内
- `logger.ts` line 64 顶层 `process.env.NODE_ENV !== 'production'`——纯布尔，不会 throw
- `auth.ts` 顶层 env 读取（line 31）在对象字面量内，只读不操作

**方向 3 概率最低**。除非 stack 明确指向 env 相关的 undefined。

#### 方向 4（Next.js 16 + Turbopack known issue）的证据

- `package.json` line 51: `next@^16.0.10`（较新版本）
- next dev 默认用 Turbopack（Next 16 行为）
- next.config.ts `output: 'standalone'` 在 dev mode 下通常无效（standalone 是 build 时选项），但它的存在可能影响 Turbopack 的模块解析行为
- **无法在本地直接验证**（Windows 与 CI Linux 环境差异）

#### 方向 5（auth 模块加载）的证据

- `src/lib/auth.ts` line 10: `export const authOptions: NextAuthOptions = { adapter: PrismaAdapter(prisma), ... }`——**顶层副作用**：模块加载时执行 `PrismaAdapter(prisma)`
- line 125-130: 模块加载时 `logger.info({...}, 'AuthConfig loading')`
- 执行日志 line 185 提到启动期有"NextAuth 警告"——说明 auth 模块至少在启动期被加载过（可能被 createCase route 或 middleware 触发）
- **关键疑问**：如果 auth 模块在启动期已加载成功，为什么 process route 第一次访问时还会因 auth 崩溃？可能解释：Next.js dev mode 每个 route 有独立的模块编译上下文，auth 模块在不同上下文中重复求值，某次求值失败

### 6.6 任务 A4 的 D4 body 解析正确用法

**Playwright API 陷阱**：`response.json()` 和 `response.text()` 都会消费 body，不能都调。

**正确写法**（先读 text，再尝试 JSON.parse）：
```typescript
const response = await page.context().request.post(url);
const text = await response.text();
let body: unknown = null;
try {
  body = JSON.parse(text);
} catch {
  body = null;
}
if (body) {
  console.log(`[e2e-diag D4] body.status=${(body as any).status}`);
} else {
  console.log(`[e2e-diag D4] body (non-JSON, first 2000): ${text.slice(0, 2000)}`);
}
```

**retry 的正确写法**（body 已消费，retry 时重新请求）：
```typescript
let response = await page.context().request.post(url);
let status = response.status();
const text1 = await response.text();
console.log(`[e2e-diag D4] attempt 1 status=${status}`);
if (status !== 200) {
  await page.waitForTimeout(5000);
  response = await page.context().request.post(url);  // 重新请求
  status = response.status();
  console.log(`[e2e-diag D4] attempt 2 status=${status}`);
}
const finalText = await response.text();
// ... 解析 finalText
```

---

## 7. 开放问题决策（用户已确认，2026-07-28）

> 用户答复全部采纳推荐方案，**除开放问题 4 外**（用户比 plan-agent 建议更保守）。

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | A1 用 `require("fs")` 还是 `import fs` | **先试 `require`，报错改 `import`** | require 不 hoist，诊断语义更准确 |
| 2 | 是否加诊断 probe route | **不加** | A1+A2+A3+A4 先跑，不够再说 |
| 3 | 阶段 B 是否合并 R2 | **不合并** | R2 与 500 根因无关，避免混淆修复边界；deferred 到下一轮 |
| 4 | 诊断失败是否接受本地 Docker | **❌ 不接受**（用户决策，比推荐更保守） | 本地 Windows Docker 不稳定（AGENTS.md 已记录）；阶段 A 彻底失败时回 /plan 重设计其他诊断路径（加更多 console.log 二分查找、拆 probe route、其他） |
| 5 | ci.yml commit 标注 | **标注 `⚠️上游文件修改`** | 遵循 AGENTS.md 目录原则 |
| 6 | 方向 4 Turbopack 解禁 | **不预批** | 等 stack 出来确认是方向 4 再说 |

**阶段 A 启动条件已满足**，可交 execute-agent 执行 A1-A4（A5 在 CI 跑完、用户确认根因后才执行）。

**验收标准相应调整**（开放问题 4 决策影响 §4.1 情况 5）：
- 原情况 5：诊断彻底失败 → 回 /plan 考虑本地 Docker 复现
- 新情况 5：诊断彻底失败 → **回 /plan 重设计其他诊断路径**（不涉及本地 Docker；候选方向：加 probe route 二分查找、加更多 console.log 二分、改用裸 node server.js 启动绕开 webServer）

---

## 8. 执行顺序建议

### 阶段 A（一次 execute 轮，跑完隔一次 CI）

1. **A1** route.ts 加模块顶层 mark + POST 入口文件写入 + outer catch stack 写文件
2. **A2** playwright.config.ts webServer 加 `stdout: 'pipe'` + `stderr: 'pipe'`
3. **A3** ci.yml 加 `Dump process route diagnostic logs` step
4. **A4** golden-path.spec.ts D4 加 body 解析 + retry + 断言放宽
5. 本地 sanity check（`npm.cmd run build` + eslint）
6. 提交 + 推 dev → CI 跑 → 拿证据
7. **A5** 拿到证据后清理（删临时 mark，保留长期护栏）
8. 写执行日志，等用户确认根因方向 → 进阶段 B

### 阶段 B（一次 execute 轮，确认根因后才启动）

1. **B0** 解读 stack，归类方向（1-5 或新方向）
2. **B1~B.N** 按方向执行修复
3. **B-last-1~4** 补护栏（Strict Mode 测试 + provider 计数 + 非静默错误 + 不关 Strict Mode 声明）
4. 恢复 D4 断言 200 + CL-04~07 断言
5. 本地 sanity check
6. 提交 + 推 dev → CI 跑 → CL-04~07 全绿
7. 写执行日志

---

> 本计划完成后，等用户确认（特别是 §7 开放问题 1-6 的决策）再进入 execute 阶段。
> 阶段 A 和阶段 B 是两次独立的 execute 轮，中间必须有"CI 跑 + 用户确认根因方向"这个检查点。
> **铁律 6 重申**：阶段 A 拿不到 stack 就诚实说拿不到，不猜根因，不假装"差不多知道了"。
