# CI /process route 500 · 阶段 A 补诊断能力 · 执行日志

> 关联计划: [doc/plan/ci-process-route-500-fix-plan.md](../plan/ci-process-route-500-fix-plan.md)（§2 阶段 A）
> 关联上一轮日志: [ci-process-abortcontroller-diagnose-stage1-log.md](ci-process-abortcontroller-diagnose-stage1-log.md)（末尾「根因反转」节）
> 执行日期: 2026-07-28
> 执行者: execute-agent（阶段 A：A1-A4，本轮不做 A5 清理）
> 范围声明: 严格限定 A1-A4；A5（清理）等 CI 跑完、用户确认根因后才执行；阶段 B 不在本轮范围

---

## 1. 本轮目标（来自计划 §2 阶段 A）

为 `/api/nana/cases/[id]/process` route 补诊断能力，目的是拿到 500 真实堆栈，定位是哪个 import / 哪一行模块顶层代码崩溃。**不修复、不预判根因方向**。

---

## 2. 任务执行情况

### 任务 A1：route.ts 模块加载标记 + POST 入口 + outer catch 写文件 ✅

**涉及文件**：`src/app/api/nana/cases/[id]/process/route.ts`

**决策 1 执行结果**：用 `require("fs")` **一次成功**，未切换到 `import fs`。
- `tsc`（通过 `next build` 的 `Running TypeScript` 阶段）未报"Cannot use require"
- eslint 配合 `// eslint-disable-next-line @typescript-eslint/no-require-imports` 注释，0 warning（沿用 `src/lib/global-proxy.ts:51-52` 现有模式）
- require 不被 hoist，放在 import 块后即按顺序执行，诊断语义符合 plan §6.3 矩阵

**三个诊断点行号**（编辑后）：
| 诊断点 | 行号 | 写入文件 | 触发时机 |
|--------|------|---------|---------|
| 模块顶层 mark | line 36-46 | `/tmp/process-route-module-loaded.log` | route.ts 模块求值完成（所有 import 之后） |
| POST 入口 mark | line 287-293 | `/tmp/process-route-post-entered.log` | POST handler 第一行 console.log 之后 |
| POST outer catch stack | line 411-419 | `/tmp/process-route-error.log` | POST 最外层 catch 触发时（`return internalError()` 之前） |

**实现要点**：
- 三个 try/catch 都用 `catch { /* ignore */ }`（无 `e` 参数），避免引入 unused-var warning
- 模块顶层 mark 放在 `import { isPlaceholderTranscript }` 之后、`const logger = createLogger(...)` 之前（plan §2 任务 A1 §1 指定位置）
- outer catch stack 写 `error instanceof Error ? error.stack : String(error)`，兼容 Error 与非 Error 抛出

### 任务 A2：playwright.config.ts webServer 加 stdout/stderr pipe ✅

**涉及文件**：`playwright.config.ts`

**改动**：webServer 配置块新增 `stdout: 'pipe'` + `stderr: 'pipe'`（行号约 line 58-62）

**未改动的项**（用户硬约束）：
- `command`（仍 `echo "..." && npx next dev -p ${E2E_PORT}`）
- `url`、`reuseExistingServer`、`timeout`、`env`

**诚实声明**（plan §6.4）：Playwright 1.57 默认即 `'pipe'`，显式写出是为排除默认值不确定性 + 文档化诊断意图。如显式 pipe 后仍看不到 next dev stderr，说明问题在 Next.js 框架层（不走 stderr），届时靠 A1 的 `fs.appendFileSync` 兜底。

### 任务 A3：ci.yml 加 Dump process route diagnostic logs step ✅

**涉及文件**：`.github/workflows/ci.yml`

**改动**：在 `Run Playwright tests` step（line 185-195）之后、`Stop fake provider server` step（原 line 198）之前，新增一个 step（约 line 197-214）。

**关键属性**：
- `if: always()`：保证即使 Playwright step 失败（如 CL-04 timeout）也会执行
- `2>/dev/null || echo "(file not found — ...)"`：容错，文件不存在本身也是诊断信息（plan §6.3 矩阵）
- 三个文件分别对应 A1 的三个诊断点
- **铁律 4 检查**：cat 输出只有 timestamp + stack，无 env 值、无 token、无 userId

**commit 规范**：ci.yml 是上游追踪文件，commit message 须标注 `⚠️上游文件修改`（决策 5）——execute-agent 不 commit，留给主会话收尾时标注。

### 任务 A4：D4 直调用例加 body 解析 + retry + 断言放宽 ✅

**涉及文件**：`e2e/ci/nana-golden-path.spec.ts`（D4 describe，原 line 565-592 区段）

**三项改动**：

1. **body 解析（§6.6 正确用法）**：先 `const text = await response.text()`，再 `try { body = JSON.parse(text) } catch { body = null }`。避免了原代码 `response.json().catch(...)` 后无法再读 text 的陷阱（body 只能消费一次）。

2. **retry 机制（区分冷启动 vs 确定性崩溃）**：
   - attempt 1 非 200 → `page.waitForTimeout(5000)` → 重新发起 POST（不复用已消费的 response/body）
   - attempt 2 状态码独立打印
   - attempt 1 失败 + attempt 2 成功 → 方向 2（next dev 冷启动编译）实锤
   - attempt 1 失败 + attempt 2 仍失败 → 方向 1/3/4/5（确定性模块加载错误）

3. **断言放宽（仅阶段 A）**：原 `expect(response.status()).toBe(200)` + body 非空断言全部移除（替换为 console.log 采集）。让 D4 无论 200/500 都跑完拿全证据。阶段 B 修复后恢复断言（已在代码注释中标明恢复点）。

---

## 3. 本地验证结果

### 3.1 eslint（本轮改动部分）

命令：`node node_modules/eslint/bin/eslint.js src/app/api/nana/cases/[id]/process/route.ts e2e/ci/nana-golden-path.spec.ts playwright.config.ts`

**结果**：0 error 0 warning（本轮改动部分）。
- 唯一输出是 `[baseline-browser-mapping]` 的 pre-existing 提示（与本轮无关，是 next 框架依赖的旧数据警告，AGENTS.md 任务说明已声明"已有的 pre-existing warning 不是本轮范围，不动"）
- 修复过程：第一次 eslint 报 2 个 `'e' is defined but never used` warning（A1 两个 catch 块的 `e` 参数），改为 `catch {` 无参数形式后清零

### 3.2 npm.cmd run build

命令：`npm.cmd run build`

**结果**：✅ 通过。
- `✓ Compiled successfully in 19.3s`
- `Running TypeScript` 阶段无错（证明 `require("fs")` 在 route.ts 中类型检查通过）
- `Generating static pages using 11 workers (57/57)` 全过
- Route 表含 `ƒ /api/nana/cases/[id]/process`（Dynamic 标记正常）
- 输出中 `[baseline-browser-mapping]` 与 `AuthConfig loading` 均为 pre-existing 噪音，与本轮无关

### 3.3 未跑的验证（按计划 §8 阶段 A 步骤 5）

- ❌ **未跑完整 e2e**（按任务说明"不要跑完整 e2e"，留 CI 跑）
- ❌ **未跑 Vitest 集成测试**（按任务说明"不要跑 Vitest 集成测试"，本轮无 unit/integration 范围改动）

---

## 4. 偏离记录

**无偏离**。四个任务全部按计划 §2 阶段 A 原文实现，无微调、无大偏离。

**值得记录的"按计划执行但需主会话知晓"的点**：
1. 决策 1（require vs import）**直接选 require 一次成功**，未触发"报错改 import"分支，诊断语义为 plan §6.3 矩阵原版（mark 出现 = 所有 import 完成）。
2. A1 的 catch 块写成 `catch {` 无参数形式，是沿用 A1.3 outer catch 的现有写法（plan 示例代码就是 `catch { /* ignore */ }`），不是偏离。
3. A4 实现 retry 时，把 `let response` 和 `let text` 都改为 `let`（原代码是 `const`），因为 retry 时要重新赋值——这是 plan §6.6 retry 正确写法示例代码本身的要求，不是偏离。

---

## 5. 留给主会话的疑问

**无疑问**。所有任务按计划执行，本地验证全过。等 CI 跑完拿证据后，由主会话判断是否进 A5（清理）或阶段 B（修复）。

---

## 6. Git 状态（execute-agent 不 commit，留给主会话收尾）

改动文件清单（本轮 execute-agent 引入）：
- `src/app/api/nana/cases/[id]/process/route.ts`（A1：3 个诊断点）
- `playwright.config.ts`（A2：stdout/stderr pipe）
- `.github/workflows/ci.yml`（A3：Dump step，⚠️上游文件修改）
- `e2e/ci/nana-golden-path.spec.ts`（A4：D4 body 解析 + retry + 断言放宽）
- `doc/executionlog/ci-process-route-500-diagnose-stageA-log.md`（本文件）

**工作区已存在的非本轮改动**（铁律 6 诚实声明，commit 时须区分）：
- `doc/executionlog/ci-process-abortcontroller-diagnose-stage1-log.md`（modified）——这是**上一轮主会话追加的「根因反转」节**（commit `73bb3d1` 之后留在工作区未提交），本轮 execute-agent 未改动它。建议主会话单独 commit 这个文件（属于上一轮的产物），不要和本轮 A1-A4 混在同一个 commit。
- 顶层 untracked 文件 `ci-status-5min.txt` / `ci-status.json` / `ci5.txt`——上一轮遗留的临时文件（上一轮日志已声明），与本轮无关。
- `doc/plan/ci-process-route-500-fix-plan.md` / `doc/research/*.md`——plan-agent / 上一轮的 untracked 文件，与本轮 execute-agent 无关。

**commit 建议**（供主会话参考）：
- 一个 commit 包含全部 A1-A4 + 本日志
- commit message 须标注 `⚠️上游文件修改`（因 ci.yml 在改动清单中）
- 推荐 message：`chore(ci): 阶段A 补 /process route 500 诊断能力 (A1-A4) ⚠️上游文件修改`

---

## 7. 验证清单回答

- [x] A1 三个诊断点全部加好；用 `require("fs")`（决策 1 一次成功）；行号见 §2 任务 A1 表
- [x] A2 stdout/stderr pipe 加好；启动命令未改（仍 `npx next dev`）
- [x] A3 Dump step 加在 Run Playwright 之后、Stop fake provider 之前；用 `if: always()`
- [x] A4 body 解析按 §6.6 正确用法（先 text 再 JSON.parse）；retry 实现（5s 后重新 POST）；断言放宽（不强制 200）
- [x] eslint 本轮改动部分 0 error 0 warning
- [x] `npm.cmd run build` 通过
- [x] git status 改动文件清单见 §6
- [x] 无偏离计划；无疑问留给主会话
