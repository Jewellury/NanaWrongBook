# Nana 测试框架 · CI 启动 Bug 修复 · 执行日志

> 关联计划：[doc/plan/nana-test-framework-ci-fix-plan.md](../plan/nana-test-framework-ci-fix-plan.md)
> 关联审计：[doc/auditlog/nana-test-framework-ci-fix-plan-audit.md](../auditlog/nana-test-framework-ci-fix-plan-audit.md)（⚠️ 有条件通过，1 P1 + 5 P2 约束）
> 开始时间：2026-07-27
> 执行者：execute-agent

## 用户决策（已下达，遵守执行）

| 项 | 决策 | 出处 |
|----|------|------|
| 任务 C 选项 | **C1**：`on.push.branches: [main, dev]` | 用户指令（仓库 Public，Actions 额度无限） |
| 任务 E | **改为补强现有单测**（不新建文件） | 用户指令 |
| 任务 B-可选 | **不做**（不加 `/__test/health` 端点） | 用户指令（最小改动） |

## 审计约束遵守清单

| 审计编号 | 约束 | 执行动作 |
|---------|------|---------|
| P1-1 | 任务 E 文件已存在 | 在 `src/__tests__/e2e-helpers/fake-provider-server.test.ts` 上**追加**用例，不新建 |
| P2-1 | 验收 §4.1 "HTTP 200" 与方案 A 矛盾 | 验收看 CI 日志打印 `responded on attempt N` 或类似；本地 sanity 只验证脚本能起 |
| P2-2 | 执行日志行号 491 是无关内容 | 按**实际内容**定位修订点，不机械套用计划里的行号 |
| P2-3 | 任务 A 无 Plan B | 本地启动验证已通过（详见任务 A 记录），未触发 |
| P2-4 | 修订执行日志影响后续审计 | 任务 D 用**追加而非覆盖**，保留原文 + 追加 `⚠️ 纠正（2026-07-26）` 段 |
| P2-5 | Windows env 语法 | 本地验证脚本时用 PowerShell `$env:VAR='val'` 或 cmd `set VAR=val&&`，不用 POSIX 内联语法（在 bash 工具里用 `VAR=val command` 因 Git Bash 兼容也用过一次） |

## 执行记录

### 任务 A：新建 `scripts/start-fake-provider.ts`

- **做了什么**：
  - 发现 `scripts/start-fake-provider.ts` 文件已存在（前批未提交的 untracked 文件），内容完整符合计划 §6.1 要求，并已做了一处合理改进（防止 SIGTERM/SIGINT 重复触发）
  - 验证本地启动（P2-3 触发点）：
    - eslint 0 error 0 warning ✅
    - TypeScript 类型检查（`tsc --noEmit`）通过 ✅
    - PowerShell 启动后日志打印 `fake-provider listening on 3996` ✅
    - curl `/` 拿到 HTTP 404（fake-provider-server.ts:312-313 未知路径预期）✅
    - curl `POST /__test/register` body=`{}` 返回 400 MISSING_DATA_URL（端到端走通）✅
- **涉及文件**：`scripts/start-fake-provider.ts`（新增，53 行）
- **结果**：✅ 完成

### 任务 B + C1：改 ci.yml

- **做了什么**：
  - **任务 C1**（行 4-9）：`on.push.branches: [main]` → `[main, dev]`，加注释说明决策依据（用户 C1 + r3.1 §3 任务 2.9「黄金路径每次 push 跑」原意 + 仓库 Public）
  - **任务 B**（行 149-180）：
    - 启动命令从 `nohup npx tsx -e "import('./e2e/...')..."` 改为 `nohup npx tsx scripts/start-fake-provider.ts`
    - 就绪检查从 `curl -s -o /dev/null -w "%{http_code}" ... || echo "000"` + 字符串比较，改为 `if curl -s -o /dev/null http://127.0.0.1:3999/ 2>/dev/null; then ready; fi`（退出码语义）
    - 失败消息从 "HTTP 000000" 误判改为 `responded on attempt $i`
    - 加详细注释说明两个 bug 根因（tsx -e 不稳定 + 字符串拼接误判），便于未来审计
    - 注释中标注 `⚠️上游文件修改`（ci.yml 追踪自上游 wrong-notebook）
  - **Stop step 不动**（kill $PID 兼容新启动方式）
- **涉及文件**：`.github/workflows/ci.yml`（修改 4 行 on.push 段 + 重写 32 行 Start step 段）
- **结果**：✅ 完成
- **验证**：
  - YAML parse（node + js-yaml）✅ 5 jobs 全在，12 step 顺序正确，`on.push.branches: ["main","dev"]`、`on.schedule` 完好

### 任务 D：修订执行日志（追加而非覆盖）

- **做了什么**：按 P2-4 约束（追加而非覆盖）+ P2-2 约束（按实际内容定位）修订 `doc/executionlog/quality-os-v1-phase-a-a1-log.md`：
  1. **状态表纠错**（行 16-17 + 行 474-475）：任务 2.1/2.2 从 ⬜ 改为 ✅，备注新值 `commit 9060f9e/cc18805，基础设施前置已提交` + 加 `⚠️ 纠正（2026-07-26）` 说明
  2. **完成状态 checklist 后追加引用块**（原行 272-277 后）：明确说明"门禁交 CI nightly schedule"在当时无法兑现的 3 个原因
  3. **整体总结"待 audit 项"第 4 项后追加引用块**（原行 492 后）：纠正"门禁交 CI nightly schedule"声明
  4. **文末"测试容器门禁状态"节后追加引用块**（原行 510 后）：纠正声明
  5. **文末追加新节**「## CI 首次运行结果（PR #3，2026-07-26 追加）」：记录 4 个 job 结果、E2E 失败两 bug 根因、修复计划引用
- **涉及文件**：`doc/executionlog/quality-os-v1-phase-a-a1-log.md`（追加 34 行，512 → 546 行）
- **结果**：✅ 完成
- **验证**：
  - 7 处 `⚠️ 纠正` 标记（含状态表 2 行 + 4 个引用块 + 1 个表格备注）
  - 9060f9e / cc18805 各出现 2 次（状态表 + 总结表）
  - PR #3 节定位在第 500 行
  - 原文所有未修订部分保持不动（如 CL-06/CL-14 行、子任务 1-9 的执行记录等）

### 任务 E：补强现有单测

- **做了什么**：在 `src/__tests__/e2e-helpers/fake-provider-server.test.ts` **追加**新 describe 块「独立脚本启动烟雾测试（防御 PR #3 tsx -e bug 重现）」，不删除原有 11 个用例。新增 3 个用例：
  1. `独立脚本启动后端口响应 HTTP 404（CI 启动路径验证）`——spawn 真实 `npx tsx scripts/start-fake-provider.ts` 子进程，轮询直到端口响应
  2. `独立脚本启动后 /__test/register 端到端响应 400 MISSING_DATA_URL（端到端走通验证）`——验证业务路由通
  3. `收到 SIGTERM 优雅退出（CI Stop step 行为验证）`——用 `it.skipIf(process.platform === 'win32')` 智能跳过 Windows（Windows 上 child.kill('SIGTERM') 等同 TerminateProcess，不会触发 node signal handler）
- **涉及文件**：`src/__tests__/e2e-helpers/fake-provider-server.test.ts`（追加 132 行：import spawn + describe 块 + spawnProvider 工具函数 + pollUntilReady 工具函数 + 3 个测试）
- **结果**：✅ 完成
- **验证**：
  - `DATABASE_URL="file:./data/test/test.db" npm.cmd run test -- src/__tests__/e2e-helpers/fake-provider-server.test.ts --run` → **13 passed + 1 skipped**（Windows 跳过 SIGTERM 测试；CI Linux 会全跑）✅
  - eslint 干净 ✅

### 主会话接管修复（execute-agent 子代理两次失败后接管）

**背景**：execute-agent 子代理通过 task tool 派遣两次都失败（第一次无返回、第二次被中断）。但 git status 显示前次 agent 实际已完成了任务 A/B/C1/D/E 的代码改动，只是执行日志任务 E 部分未写完（标"待执行"）。用户决策主会话接管。

**接管后的修复**：

| # | 问题 | 修复 |
|---|------|------|
| 1 | 任务 E 测试在 Windows 上 `spawn EINVAL` | `npx.cmd` 是 batch 文件，Node.js spawn 必须加 `shell: true`。原代码 `shell: false` 在 Linux/CI 假设下写的，未在 Windows 验证（违反铁律 6）。改为 `shell: process.platform === 'win32'`（跨平台：Windows 走 shell，Linux 保持 shell:false 更安全） |
| 2 | start-fake-provider.ts 缺幂等保护 | 主会话重写时遗漏了前次 agent 的"防止 SIGTERM/SIGINT 重复触发"改进。补回 `isShuttingDown` 标志，避免狂按 Ctrl+C 时 shutdown 重入导致 stopFakeProvider 多次调用 |

**修复后验证**：
- 单测：13 passed + 1 skipped ✅
- eslint：0 error 0 warning ✅
- npm.cmd run build：通过 ✅
- YAML parse：5 jobs 完好，`on.push.branches: ["main","dev"]` ✅

**偏离记录**：无（接管修复属于微调级别，未偏离计划意图；spawn shell 选项是跨平台兼容修复，幂等保护是防御性增强）

## 安全铁律遵守清单

- [x] 铁律 1：无破坏性操作（未改 Prisma schema、未删文件、未跑破坏性命令）
- [x] 铁律 2：保持可回退（commit 粒度小，不 force-push）
- [x] 铁律 3：不改上游表结构（未碰 prisma/）
- [x] 铁律 4：密钥不入 git（fake-key 是占位，明示 fake；真实 VOLCENGINE_API_KEY 在 CI secrets 和本地 .env，未入 commit）
- [x] 铁律 5：遇错停下（execute-agent 子代理失败后停下报告，由用户决策接管方式；spawn EINVAL 修复时先定位根因再改，未尝试其他绕过方式）
- [x] 铁律 6：显式失败不掩盖（execute-agent 子代理失败如实记录；spawn EINVAL 是前次 agent 在 Windows 未验证的 bug，明确标注；执行日志任务 E 部分如未写完不谎称完成）

## 本地验证结果汇总

| 任务 | 验证命令 | 结果 |
|------|---------|------|
| A | `node node_modules/eslint/bin/eslint.js scripts/start-fake-provider.ts` | ✅ 0 error 0 warning |
| A | `npm.cmd run build` | ✅ 通过（57 页面全部编译） |
| A 启动验证 | 由任务 E 的 spawn 烟雾测试覆盖 | ✅（13 passed） |
| B+C1 | YAML parse（node + js-yaml） | ✅ 5 jobs，`on.push.branches: ["main","dev"]` |
| B+C1 | `npm.cmd run build` | ✅ 通过 |
| D | 读修订后的执行日志 | ✅ 原文保留 + 7 处 ⚠️ 纠正块 + PR #3 结果节 |
| E | `DATABASE_URL="file:./data/test/test.db" npm.cmd run test -- src/__tests__/e2e-helpers/fake-provider-server.test.ts --run` | ✅ 13 passed + 1 skipped |
| E | `node node_modules/eslint/bin/eslint.js src/__tests__/e2e-helpers/fake-provider-server.test.ts` | ✅ 0 error 0 warning |

**未跑**：
- 本地 Docker 测试容器（本地 Docker Desktop 状态未知；测试容器门禁交 GitHub Actions）
- 本地 e2e 完整运行（依赖 Docker + ffmpeg + webServer env 联调，门禁交 CI）

## Git 收口

（本节原 v1 内容，下方 v2 追加）

---

## 追加记录：v2 录音步骤适配 + /process 静默失败诊断（2026-07-27）

> 本段由主会话在会话收尾时追加，记录 v1 之后的 10+ 次 CI 迭代和当前卡点。
> **下一个会话必须读本段 + 问题征询报告再继续。**

### v2 阶段 commits（按时间顺序，origin/dev 已推送）

| # | Commit | 内容 | CI 结果 |
|---|--------|------|---------|
| 1 | `8d3352d` | spec beforeAll 加端口检测（EADDRINUSE 修复） | E2E 进到 /process timeout |
| 2 | `901a53c` | webServer.env 显式注入 VOLCENGINE_* | 同上 |
| 3 | `2bb9e91` | fake-provider-server 加请求日志诊断 | 同上 |
| 4 | `8355ed4` | standalone server.js 替代 next start | 页面空白 |
| 5 | `ee14e50` | 复制 .next/static 到 standalone | 注册不跳转 |
| 6 | `ccc3fcf` | DATABASE_URL 绝对路径 | 仍不跳转 |
| 7 | `0173d9c` | 改用 `npx next dev`（开发模式） | 注册通了，/process 仍失败 |
| 8 | `56afc7d` | 回滚 fake-provider debug 日志 | 同上 |
| 9 | `05fb797` | plan v2 录音步骤修订计划 | — |
| 10 | `901357a` | 诊断 spec + ci.yml 临时改跑诊断 | 诊断 spec 失败（注册流程缺字段）|
| 11 | `72c430d` | 诊断 spec 注册流程对齐 golden-path | ✅ 诊断 spec pass |
| 12 | `c3b717b` | 诊断 spec 加上传题图复现场景 | ✅ 诊断 spec pass |
| 13 | `9f296d0` | 同时跑 golden-path + 诊断 | golden-path ❌ / 诊断 ✅ |
| 14 | `bbc8df5` | CI 跳过录音步骤（plan v2 任务 H） | golden-path 卡 /process timeout |
| 15 | `3dddbfe` | webServer 启动前 echo env（被缓冲没显示）| 同上 |
| 16 | `1a8e923` | /process route 加 console.log | **日志不出现 → handler 没执行** |

### v2 阶段关键发现

1. **getUserMedia 在 CI 可用**（诊断 spec 实证：返回 1 audio track，"我听完了"正常显示）——假设"虚拟麦克风失效"排除
2. **录音步骤不是 /process 失败的根因**——CI 跳过录音后 /process 仍失败
3. **/process route handler 在 CI 完全不执行**——`[process-route DEBUG]` console.log 在 CI 日志不出现
4. **fake provider 只收到 register 没收到 chat/completions**——case-analyzer 没被调到
5. **关键矛盾**：前端 `page.waitForRequest(/\/process$/)` 捕获到请求（CL-04 通过），但 handler 不执行

### 当前卡点（核心问题）

**Next.js 16 + `output: 'standalone'` + Playwright webServer 在 GitHub Actions CI 上，`/api/nana/cases/:id/process` route handler 静默失败——不执行、不报错、不返回。**

- 本地 dev 模式没这问题
- CI 上 `next start` + standalone 警告"does not work"
- CI 上 `next dev` 注册流程通了但 /process 仍静默失败
- 详见问题征询报告：`doc/research/2026-07-27_ci-process-route-silent-failure-consult.md`

### 当前未推 commit（本地工作区）

- `/process` route 的 `[DEBUG CI 2026-07-27]` console.log（`1a8e923`，已推）
- 无其他未推改动

### 给下一个会话的交接

**必读文件**（按顺序）：
1. `doc/research/2026-07-27_ci-process-route-silent-failure-consult.md` — 问题全貌（已准备好给外部 AI 协助）
2. 本文件（执行日志）
3. `doc/plan/nana-test-framework-ci-fix-plan.md` — v1 + v2 修订计划
4. `git log origin/main..origin/dev --oneline` — 49 个 commit（含 A-1 测试框架 + CI 修复）

**当前状态**：
- dev 领先 main 49 个 commit
- CI：Unit/Integration/Build/ai-review ✅ 全过，E2E ❌ 卡 /process
- PR #3 开着（dev → main）
- 工作区干净（除临时文件 ci-status*.txt + doc/research 两个 md）

**下一步（等外部 AI 反馈后决定）**：
- 方案 X：继续在 CI 用 `next start`
- 方案 Y：E2E 跳过 /process 相关断言
- 方案 Z：vitest 集成测试替代 E2E 覆盖 /process
- 方案 W：next.config.ts 环境变量切换 output
- 方案 V：移除 standalone，Dockerfile 改回传统模式

**待清理的技术债**（下一轮或后续轮次）：
- `e2e/ci/_diagnose-audio.spec.ts` 诊断 spec（根因定位后删除）
- `src/app/api/nana/cases/[id]/process/route.ts` 的 `[DEBUG CI 2026-07-27]` console.log（回滚）
- golden-path 录音步骤的 `process.env.CI` 跳过（根因解决后恢复）
- `playwright.config.ts` 的 `npx next dev`（根因解决后改回生产模式）

## 安全铁律遵守清单（v2 阶段补充）

- [x] 铁律 1：无破坏性操作（未改 Prisma schema、未删文件）
- [x] 铁律 2：保持可回退（49 个 commit 都在 dev，不 force-push）
- [x] 铁律 3：不改上游表结构（未碰 prisma/）
- [x] 铁律 4：密钥不入 git（fake-key 是占位）
- [x] 铁律 5：遇错停下（10+ 次迭代后停下报告，不盲目继续）
- [x] 铁律 6：显式失败不掩盖（每次 CI 失败如实记录，不谎报通过）
