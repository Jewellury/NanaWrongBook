# Nana 测试框架 · CI 启动 Bug 修复计划 · 审计报告（计划预审）

> 关联计划: [doc/plan/nana-test-framework-ci-fix-plan.md](../plan/nana-test-framework-ci-fix-plan.md)
> 关联执行日志: [doc/executionlog/quality-os-v1-phase-a-a1-log.md](../executionlog/quality-os-v1-phase-a-a1-log.md)（待被诚实化补丁修订）
> 审计类型: **计划预审（pre-execution audit）** —— 本次审计对象是 plan-agent 产出的修订计划本身，尚无代码改动
> 审计日期: 2026-07-26

---

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

这份计划抓住了真问题——CI E2E 失败的两个 bug（假 Provider 启动失败 + bash 就绪检查逻辑错）诊断准确，根因分析站得住；执行日志"门禁交 CI"是空头支票这一发现也符合铁律 6（显式失败不掩盖）。

但计划有 **1 个 P1 事实错误** 和 **5 个 P2 不严谨** 必须修后再进 execute：

- **P1**：任务 E 说要"新增"`src/__tests__/e2e-helpers/fake-provider-server.test.ts`"——**这个文件已经存在**（commit `9060f9e` 提交，222 行 11 个用例，覆盖范围比计划描述的还宽）。plan-agent 没有先 `glob` 现有文件就下结论，属于调查缺失。
- **P2**：验收标准里"CI 日志打印 HTTP 200"与技术方案 A（用 404 作为就绪信号）矛盾；执行日志行号有 1 处偏差；Windows 下 env 内联语法在 cmd 里不工作；Task A 缺 Plan B；执行日志被修订对后续审计的影响未列入风险。

修完上述 6 条后，计划可以进 execute。**任务 C（dev push 触发 CI）从审计角度倾向 C1**（忠实 r3.1"每次 push"原意），但需用户确认仓库可见性（public/private 影响 Actions 额度），最终决策权在用户。

---

## 检查清单（A–F 六维逐项判定）

### A. 合规性审计

- ✅ **plan-agent 未越界写代码**：计划文档只在 `doc/plan/` 目录，伪代码/bash/yaml 片段属于 plan-agent 门禁 1 允许的"设计表达"。
- ✅ **写入边界合规**：仅写入 `doc/plan/nana-test-framework-ci-fix-plan.md`。
- ✅ **未违反安全铁律**：① 不改 Prisma schema（铁律 3 不触发）；② 不触及生产库 `./data/dev.db`（CI 用 `file:./e2e.db`，本地验证用 `VOLCENGINE_API_KEY=fake`，明确不连真实 Provider）；③ 无破坏性操作；④ `git revert` 而非 `git reset --hard`（计划 §5.3 已明示）。
- ✅ **尊重 FREEZE-001**：本次修订只触及 CI 配置 + 执行日志 + 启动脚本，**不触碰 14 条 R1a 主路径冻结条款**（CL-01~CL-16 中已冻结的 14 条）。已对照 `nana-v1-minimum-loop-acceptance.md` §9.1 冻结清单，无交叉。

### B. 技术方案稳健性

- ⚠️ **任务 A（start-fake-provider.ts）**：
  - ✅ 现有 `fake-provider-server.ts` 第 212 行确实 `export function startFakeProvider`，第 329 行确实 `export function stopFakeProvider`，第 41 行 `export const MOCK_RESULTS`——import 路径 `'../e2e/helpers/fake-provider-server'` 真实可达。
  - ⚠️ **伪代码精度问题**：plan §6.1 line 227 写 `const { server, port } = await startFakeProvider(PORT)`，但实际返回 `{ server, port, store }`（fake-provider-server.ts 第 200-204 行）。脚本用不到 `store`，少解构一个字段不会报错，但 plan-agent 应该按真实签名写。
  - ❌ **缺 Plan B**：plan §5.1 第一行只说"换独立脚本文件能完全绕开这个问题，不需要查清根因也能修好"——这是假设，不是兜底。如果 `npx tsx scripts/start-fake-provider.ts` 也失败（例如 tsx 配置、ESM/CJS 解析问题），plan 没有明确处置。**见问题清单 P2-3**。

- ✅ **任务 B（bash 退出码）方案 A 站得住**：
  - curl 对 connection refused 返回退出码 7（非 0），对拿到 HTTP 响应（含 404）返回 0——这在 ubuntu-latest 上稳定。
  - plan §5.1 第三行准确识别了 `if curl ...; then` 里的失败不触发 `set -e`，bash 语义判断正确。
  - 现有 fake-provider-server.ts 第 312-313 行对未知路径返回 404，方案 A 用退出码判断 404 = ready 的语义成立。

- ✅ **任务 C 三个选项对照 r3.1 原文**：
  - 实际打开 r3.1 §3 任务 2.9（`nana-test-framework-plan.md` 第 484-490 行），第 488 行原文确实是"**黄金路径每次 push 跑**"。
  - 当前 `ci.yml` 第 5 行 `branches: [main]` 把 dev push 排除——确实偏离 r3.1 原意。
  - plan 倾向 C1 的论证（忠实 r3.1 + AGENTS.md "dev 是日常开发分支 90% 时间"）站得住。

- ⚠️ **任务 D 行号核对**：实际打开 `quality-os-v1-phase-a-a1-log.md`（共 512 行）逐条核对：
  - 第 16-17 行：✅ 确为任务 2.1/2.2 状态表，标 ⬜"基础设施"。
  - 第 204 行：✅ 确为子任务 9（ci.yml 集成）验证结果表，写"门禁交 CI"。
  - 第 254 行：✅ 确为子任务 7（batch-path spec）验证结果表，写"门禁交 GitHub Actions nightly schedule"。
  - 第 272-275 行：✅ 确为完成状态 checklist 的"测试容器门禁通过（二选一）"段。
  - **第 491-492 行**：❌ **行号有偏差**。第 491 行实际是"fixture-blocked 状态：任务 2.5b 4 个 test.fixme 不会执行"，第 492 行才是"本地 e2e 全部未跑...门禁交 CI nightly schedule"。plan §6.4 表格写"整体总结第 491-492 行 → 本地 e2e 全部未跑..."只匹配 492，491 是无关内容。**见问题清单 P2-2**。
  - 第 506-510 行：✅ 确为"测试容器门禁状态"段。

- ❌ **任务 E（可选单测）**：plan §2 任务 E 和 §3 文件变更清单都把 `src/__tests__/e2e-helpers/fake-provider-server.test.ts` 标为"**新增（可选）**"。
  - **事实核查**：实际 `glob src/__tests__/**/*.test.ts` 显示该文件**已存在**；`git log -- src/__tests__/e2e-helpers/fake-provider-server.test.ts` 显示该文件随 commit `9060f9e`（任务 2.1）提交，222 行 11 个用例。
  - 现有测试覆盖：① 启动监听动态端口（隐式验证 `startFakeProvider` 是函数）；② 未注册哈希 500；③ 注册端点 200；④ 已注册 happy path 端到端；⑤ delayMs 延迟；⑥ MOCK_RESULTS 含 6 fixture；⑦ 7 字段完整性；⑧ tilted-partial 降级；⑨ 404。
  - **覆盖范围比 plan 任务 E 描述的还宽**。plan 任务 E 实质已完成，"新增"是调查缺失。**见问题清单 P1-1**。
  - 旁证：`src/__tests__/e2e-helpers/` 目录已有 `db-verifier.test.ts`、`virtual-microphone.test.ts`，目录约定一致，plan 对目录约定的判断本身正确。

### C. 风险覆盖完整性

- ✅ §5.1 技术不确定性表覆盖了 tsx -e 失败、信号处理、set -e 三个核心点。
- ✅ §5.2 dev push 触发 CI 的额度与节奏风险有讨论（但需用户确认仓库可见性）。
- ✅ §5.3 PR #3 处置策略清晰，明确反对 force-push 抹历史。
- ✅ §5.4 上游冲突风险定位准确（ci.yml 改动范围限定在 f43eda5 引入的 step）。
- ✅ §5.5 不做的事范围控制清晰。
- ❌ **缺一项关键风险**：执行日志是 audit-agent 后续"偏离复核"的输入。任务 D 改写执行日志措辞会改变未来审计看到的原始记录。plan §2 任务 D 末尾说"不删记录、只追加纠正"是对的原则，但 §5 风险表没把这条列为显式风险。**见问题清单 P2-4**。
- ⚠️ **ubuntu-latest 镜像漂移风险未提**：plan 提到 curl 退出码稳定，但没提 GitHub Actions 偶尔升级 ubuntu-latest 主版本（如 22.04→24.04）可能影响 nohup + & 的进程组行为。这不是阻塞，但建议补一句。

### D. 验收标准可执行性

- ❌ **验收 4.1 第三条与方案 A 矛盾**：
  - plan §4.1 第三条："`Start fake provider server` step 打印 `fake provider ready (HTTP 200)` 或类似真实就绪信号（不是 HTTP 000000）"
  - 但 plan §6.2 推荐方案 A 用退出码判断，现有 fake-provider 对 `/` 返回 **404**（不是 200）。
  - plan §6.3 修改后的 bash 实际打印的是 `"fake provider ready (responded on attempt $i)"`——不含 "HTTP 200"。
  - 验收示例字面值"HTTP 200"与技术方案不一致；"或类似真实就绪信号"留了余地但示例误导。**见问题清单 P2-1**。
  - 修法二选一：① 把示例改成"`(responded on attempt N)` 或 `(HTTP 200/404)`"；② 实施任务 B-可选（加 `/__test/health` 返回 200），验收示例才能成立。

- ⚠️ **验收 4.2 第二条 Windows 可执行性**：
  - "`VOLCENGINE_API_KEY=fake npx tsx scripts/start-fake-provider.ts`"——这是 POSIX shell 内联 env 语法。
  - 用户环境是 win32（cmd.exe 或 PowerShell）。**cmd.exe 不支持** `VAR=val command` 语法；PowerShell 也不支持（要用 `$env:VAR='val'; command`）。
  - bash（Git Bash / WSL）下可以。
  - plan 应注明"在 bash/PowerShell 中运行"或给 cmd 等价命令（`set VOLCENGINE_API_KEY=fake && npx tsx ...`）。**见问题清单 P2-5**。

- ✅ **验收 4.1 其他条款可执行**：推送 dev → PR 自动更新 → CI 触发，这条链路成立（无论选 C1 还是 C2，PR 更新都触发 CI）。
- ✅ **验收 4.2 第一条（eslint）和第三条（npm.cmd run build）**：路径准确，命令跨平台兼容。
- ✅ **验收 4.3 文档诚实化**：基于真实 git log（`9060f9e`/`cc18805` 已确认存在），状态表纠错有据。

### E. 三代理框架一致性

- ✅ **任务 C 要求用户决策**符合 plan-agent 门禁 2"禁止跳过确认"。
- ✅ **execute-agent 写入边界清晰**：plan §3 文件变更清单明确列出每个文件的操作类型；§5.5"不做的事"段划定禁区（不改 playwright.config、不改 spec、不改 src、不改 Prisma、不改 r3.1 计划本身）。
- ✅ **commit SHA 真实性**：`f43eda5`（ci.yml 集成）、`9060f9e`（任务 2.1 假 Provider）、`cc18805`（任务 2.2 虚拟麦克风）三个 SHA 经 `git log --oneline` 全部确认存在。
- ⚠️ **execute-agent 任务 E 边界提示**：因 P1-1，execute-agent 不应再"新增"该测试文件。如果计划修订后任务 E 改为"已存在，无需新增"，execute-agent 应跳过这一项；如果计划仍要求"增强现有测试"，execute-agent 必须先 `git log` 该文件历史再决定。

### F. Agent 同步一致性

- ✅ **`node scripts/check-agent-sync.js` 退出码 0**（已实际执行，输出"OK: 3/3 agents in sync."）。
- ✅ canonical（`doc/agents/`）与运行时（`.claude/agents/` + `.opencode/agents/`）一致。

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| **P1-1** | 任务 E 把 `src/__tests__/e2e-helpers/fake-provider-server.test.ts` 标为"新增（可选）"，但**该文件已存在**（commit `9060f9e`，222 行 11 用例，覆盖范围比 plan 描述的更宽）。这是 plan-agent 调查缺失——没有先 `glob`/`git log` 现有文件就下结论。 | `doc/plan/nana-test-framework-ci-fix-plan.md` §2 任务 E、§3 文件变更清单 | 把任务 E 改写为"**已存在，无需新增**。现有测试（commit `9060f9e`）已覆盖导出验证 + 端到端 happy path + 延迟 + 6 fixture 完整性。本修订无需新增测试，除非 execute-agent 发现现有测试在新启动脚本下覆盖不到的盲点（如信号处理），再补。" §3 文件变更清单删除该行或改为"已存在，不修改"。 |
| **P2-1** | 验收 §4.1 第三条示例"打印 `fake provider ready (HTTP 200)`"与任务 B 方案 A 矛盾（方案 A 用 404 作为就绪信号，修改后 bash 实际打印 `responded on attempt N`，不含 "HTTP 200"）。 | `doc/plan/nana-test-framework-ci-fix-plan.md` §4.1 第三条 | 二选一：① 把示例改为"`fake provider ready (responded on attempt N)` 或 `(HTTP 200/404)`，**不是** `HTTP 000000`"；② 如要保留 "HTTP 200"，必须实施任务 B-可选（加 `/__test/health` 端点）。 |
| **P2-2** | plan §6.4 表格"整体总结第 491-492 行 → 本地 e2e 全部未跑...门禁交 CI nightly schedule"——实际只有第 492 行匹配，第 491 行是"fixture-blocked 状态"无关内容。 | `doc/plan/nana-test-framework-ci-fix-plan.md` §6.4 第四行 | 把"第 491-492 行"改为"第 492 行"，或在表格里把 491 和 492 拆成两行分别说明。 |
| **P2-3** | 任务 A 没有 Plan B。plan §5.1 第一行假设"换独立脚本文件能完全绕开这个问题"，但如果 `npx tsx scripts/start-fake-provider.ts` 也失败，plan 未规定处置。 | `doc/plan/nana-test-framework-ci-fix-plan.md` §5.1 第一行 | 在 §5.1 第一行末尾补一句"**如果独立脚本也失败**，execute-agent 必须停下来报告（铁律 5），不要尝试第三种启动方式（如改用 node 直接跑编译产物、改用 jest worker 等）——那些会扩大改动范围。失败根因（tsx 配置/ESM 解析/tsconfig 路径）应回传 plan-agent 重新评估。" |
| **P2-4** | §5 风险表未列入"修订执行日志会影响后续 audit-agent 偏离复核"这一风险。 | `doc/plan/nana-test-framework-ci-fix-plan.md` §5 | 在 §5 新增一节"§5.6 修订执行日志的审计副作用"：明确"任务 D 修订执行日志时，必须保留原文 + 追加纠正（不删不覆盖），让未来 audit-agent 能区分'原始声明'与'纠正后声明'。建议用 `~~原文~~ → **纠正**` 或 `<details><summary>原文</summary>...</details>` 折叠语法。" |
| **P2-5** | 验收 §4.2 第二条 `VOLCENGINE_API_KEY=fake npx tsx ...` 是 POSIX 语法，cmd.exe 不支持。用户环境为 win32。 | `doc/plan/nana-test-framework-ci-fix-plan.md` §4.2 第二条 | 改为跨平台写法：① bash/PowerShell：`VOLCENGINE_API_KEY=fake npx tsx scripts/start-fake-provider.ts`（bash）或 `$env:VOLCENGINE_API_KEY='fake'; npx tsx scripts/start-fake-provider.ts`（PowerShell）；② cmd.exe：`set VOLCENGINE_API_KEY=fake && npx tsx scripts/start-fake-provider.ts`。 |

---

## 用户决策建议（任务 C）

从审计角度，**倾向 C1（`branches: [main, dev]`）**，理由：

1. **r3.1 原文明确**："黄金路径每次 push 跑"（`nana-test-framework-plan.md` 第 488 行）。当前 `branches: [main]` 实质违反这一约束。C1 是对原意的忠实恢复。
2. **这次事故的根因之一就是 dev 10 个 commit 从未跑过 CI**。C2（保持现状）等同于"接受事故重演"。
3. **C3（条件触发）配置复杂度高**：在 YAML 里给单 job 加 `if:` 条件分支，可读性和可维护性都差，且仍会让 e2e 在 dev push 时跑——本质上和 C1 一样慢，但多一层复杂度。
4. **AGENTS.md 描述 dev 是"日常开发分支，90% 时间在这里工作"**：CI 不覆盖 dev 等于 90% 代码从没被 e2e 验证。

**但 C1 的前提是用户确认两件事**：

- **仓库可见性**：公开仓库 Actions 额度无限，C1 无成本；私有仓库 2000 分钟/月，按当前 e2e 5 分钟/次 × 频繁 push 估算可能超额。plan §5.2 已诚实标注"本项目目前是私有还是公开需用户确认"。
- **push 频率**：如果用户每天 push 30+ 次，C1 会显著拖慢节奏（每次 push 等 5+ 分钟 CI）。可考虑配合 `concurrency` 字段只保留最新一次 CI 运行，取消中间的。

**审计最终倾向**：C1 + 用户确认仓库可见性 + 加 `concurrency` 取消中间运行。但**最终决策权在用户**。

---

## execute-agent 边界提示

执行阶段需特别注意以下边界（基于本次预审发现）：

1. **任务 E 不要重复造文件**：`src/__tests__/e2e-helpers/fake-provider-server.test.ts` 已存在且覆盖完整。除非 plan 修订后明确要求增强（如加信号处理测试），否则跳过任务 E。
2. **任务 A 失败必须停下**：如果 `npx tsx scripts/start-fake-provider.ts` 本地起不来，**不要**自行尝试其他启动方式（node 直接跑、改用 jest、改 tsx 配置等）。停下来报告，回 plan-agent 评估。
3. **任务 D 修订执行日志用追加而非覆盖**：保留原文 + 追加 `⚠️ 纠正（2026-07-26）` 段，让 audit-agent 能看到原始声明。禁止 `~~划掉~~` 后删除原文（markdown 删除线渲染后原文仍在源码里，但易被误读）。
4. **任务 B 实施前先验证 bash 行为**：本地 Git Bash 跑一遍 `if curl -s -o /dev/null http://127.0.0.1:3999/ 2>/dev/null; then echo ready; fi`（先启动假 Provider），确认退出码逻辑在本地能复现 CI 行为。
5. **任务 C 等用户决策**：C1/C2/C3 在用户拍板前不要动 `on.push.branches`。execute-agent 可先完成任务 A+B+D（这三项独立于 C 的选择），把 ci.yml 的 `on.push` 留到最后改。
6. **commit message 必须标注 `⚠️上游文件修改`**：ci.yml 是上游追踪文件（plan §3 已正确提醒），保持标注习惯便于未来 sync upstream 时定位。
7. **任务 B-可选的依赖**：如果用户/execute-agent 决定做任务 B-可选（加 `/__test/health` 端点），那么验收 §4.1 第三条"HTTP 200"才成立；否则必须按 P2-1 修订验收示例。

---

## 附录：审计依据文件清单

| 文件 | 用途 | 状态 |
|------|------|------|
| `AGENTS.md` | 全局规则（安全铁律、三代理门禁、Git 规范） | 已读 |
| `doc/agents/plan-agent.md` | plan-agent 角色定义（检查越界） | 已读 |
| `doc/agents/audit-agent.md` | audit-agent 自身角色定义 | 已读 |
| `doc/plan/nana-test-framework-ci-fix-plan.md` | **本次审计对象** | 已读（366 行） |
| `doc/plan/nana-test-framework-plan.md` | r3.1 任务 2.9 原始约束（第 484-490 行） | 已读 |
| `doc/executionlog/quality-os-v1-phase-a-a1-log.md` | A-1 执行日志（512 行，行号核对全部实测） | 已读 |
| `.github/workflows/ci.yml` | 当前 CI 配置（273 行） | 已读 |
| `e2e/helpers/fake-provider-server.ts` | 假 Provider 实现（336 行，导出签名核对） | 已读 |
| `src/__tests__/e2e-helpers/fake-provider-server.test.ts` | **现有测试**（222 行 11 用例，证明任务 E 文件已存在） | 已读 |
| `doc/spec/nana-v1-minimum-loop-acceptance.md` | FREEZE-001 验收契约（14 条冻结条款） | 已读 §9 |
| `doc/00_CURRENT.md` + `doc/active_spec.md` | 项目当前状态 | 已读 |
| `node scripts/check-agent-sync.js` | Agent 同步一致性 | **已执行，exit 0** |
| `git log --oneline -30` | 验证 commit SHA（f43eda5/9060f9e/cc18805） | **已执行，全部确认存在** |

---

## 用户验证指南（计划预审版）

本次是计划预审，没有代码可验证。**用户应做的验证**：

1. **打开审计报告**：`doc/auditlog/nana-test-framework-ci-fix-plan-audit.md`（本文件）。
2. **逐条核对问题清单**：6 条问题（1 个 P1 + 5 个 P2），决定哪些要 plan-agent 修订后再进 execute，哪些可以接受现状由 execute-agent 灵活处理。
3. **任务 C 决策**：阅读"用户决策建议"段，确认仓库可见性（GitHub 上看 `Jewellury/NanaWrongBook` 是 Public 还是 Private），决定 C1/C2/C3。
4. **修订后再读一次 plan**：plan-agent 修订后，确认 P1-1（任务 E 文件已存在）和 P2-1（验收 HTTP 200 矛盾）已修正。
5. **确认后再启动 execute**：用户明确说"开始 execute"或"确认"后，execute-agent 才接手。

---

> 本审计报告由 audit-agent 在计划预审模式下产出，未修改任何代码或计划文件（铁律：只指出不修改）。
