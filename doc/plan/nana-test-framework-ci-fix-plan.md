# Nana 测试框架 · CI 启动 Bug 修复计划

> 关联计划: [doc/plan/nana-test-framework-plan.md](nana-test-framework-plan.md)（r3.1，任务 2.9 原始约束）
> 关联执行日志: [doc/executionlog/quality-os-v1-phase-a-a1-log.md](../executionlog/quality-os-v1-phase-a-a1-log.md)（A-1，需诚实化补丁）
> 触发事件: PR #3（dev → main）首次真实触发 CI，E2E Tests job 失败（5m22s）
> 计划日期: 2026-07-26
> 执行者: plan-agent（设计），待 execute-agent 实现
> 预计影响: `.github/workflows/ci.yml`、`scripts/`、`doc/executionlog/`、（可选）`e2e/helpers/fake-provider-server.ts`

---

## 1. 大白话概述

A-1 测试框架的 10 个 commit 做完后，因为 ci.yml 只在 main 分支 push 时触发，dev 上的日常 push 从来没跑过 CI。我开了 PR #3 让 CI 真跑了一次，结果 Unit / Integration / Build 都过了，**E2E 测试失败了**。

失败有两个直接原因（两个 bug 联合作用）：**①假 Provider 服务器没启动成功**——CI 用 `npx tsx -e "..."` 一行命令后台启动它，但 tsx 的 `-e` 模式没正确加载 .ts 文件的导出，报 `m.startFakeProvider is not a function`（其实源码第 212 行确实 export 了这个函数）；**②启动成功的检查逻辑写错了**——bash 用 `curl -w "%{http_code}" || echo "000"` 判断端口是否通，连接失败时拼成了 "000000"，被误判成"已就绪"，所以 Bug ①被掩盖了。

此外，执行日志里反复写的"测试容器门禁交 CI nightly schedule + PR/push 触发执行"是**空头支票**——dev push 不触发 CI、schedule 只在默认分支生效、假 Provider 启动 bug 让 e2e 即使触发也跑不通。这违反了铁律 6（显式失败，不掩盖），需要一并修正。

**本计划的最小目标**：用最小改动让 CI 的 E2E 真正能跑通假 Provider 黄金路径，并把执行日志的不实声明改成诚实记录。

---

## 2. 任务分解

### 任务 A：修假 Provider 启动方式（新建 `scripts/start-fake-provider.ts`）

**涉及文件**：`scripts/start-fake-provider.ts`（新增）、`.github/workflows/ci.yml`（改 Start step 的命令）

**做什么**：不再用 `npx tsx -e "import(...)"` 一行命令启动，而是新建一个独立入口脚本 `scripts/start-fake-provider.ts`，CI 里改用 `npx tsx scripts/start-fake-provider.ts` 启动。这个脚本：导入 `startFakeProvider`、启动监听 3999、打印端口、注册 SIGTERM/SIGINT 信号处理做优雅关闭。

**为什么这么做**：
- `npx tsx -e "..."` 的 `-e` 模式在 Node 22 + tsx 组合下，对 `.ts` 文件的 dynamic import 行为不稳定（具体失败机制**待 execute-agent 验证**，但现象明确：`m.startFakeProvider is not a function`，说明 import 回来的 module 对象没有拿到导出）。换成独立脚本文件后，tsx 走正常的文件加载路径，行为可预测。
- execute-agent 当时在执行日志里写"避免新增 scripts/ 文件（避免越界）"——这个自缚手脚的判断是**误判**。AGENTS.md 的 execute-agent 写入边界是"代码文件 + doc/executionlog/"，scripts/ 属于合法代码目录；而且 r3.1 计划 §6 文件变更清单本身就列了 `scripts/ai-review-runner.ts`、`scripts/generate-checklist.ts` 等新增脚本。为 CI 配套一个启动 helper 脚本是合理且符合既有约定的。
- 独立脚本还有个好处：本地也能用 `npx tsx scripts/start-fake-provider.ts` 手动起，方便联调。

**风险**：
- 新增 scripts/ 文件，需确认 .dockerignore / gitignore 不会误排除（scripts/ 已有其他 .ts 文件，风险低）。
- 信号处理写错可能导致 CI Stop step 的 kill 不生效——但 Stop step 用的是 PID kill，脚本收到 SIGTERM 做完清理即可，双重保险。

---

### 任务 B：修 bash 就绪检查逻辑

**涉及文件**：`.github/workflows/ci.yml`（改 Start step 的 bash 循环）

**做什么**：把"用 curl HTTP 状态码 + `|| echo` 兜底"的判断方式，改成"用 curl 退出码判断"。curl 连接成功拿到任何 HTTP 响应（哪怕 404）都返回退出码 0；连接拒绝返回非 0。不再需要 `-w "%{http_code}"`，也不再需要 `|| echo "000"`。

**为什么这么做**：
- 当前 bug：连接失败时 `curl -w "%{http_code}"` 输出 "000"，`|| echo "000"` 又追加 "000"，response = "000000"，`"000000" != "000"` 为真 → 误判 ready。CI 日志里 `fake provider ready (HTTP 000000)` 就是铁证。
- 改用退出码后逻辑干净：`if curl -s -o /dev/null http://...; then ready; fi`。curl 拿到响应（含 404）= 服务器在；连接失败 = 非退出码 0 = 没在。
- fake-provider-server.ts 当前对未知路径（如 `/`）返回 404，这已经足够作为"服务器活着"的信号，**不强制**加健康端点（见任务 B 可选增强）。

**风险**：低。curl 退出码语义在 ubuntu-latest 上稳定。注意 GitHub Actions 默认 `set -e -o pipefail`，但放在 `if` 条件里的命令失败不会触发 set -e，安全。

---

### 任务 B-可选：为假 Provider 加 `/__test/health` 健康端点

**涉及文件**：`e2e/helpers/fake-provider-server.ts`（增量添加一个端点）

**做什么**：在 `startFakeProvider` 的 server 路由里加一个 `GET /__test/health` → 返回 200 `{ ok: true }`。CI 就绪检查探测这个端点而非 `/`。

**为什么这么做**：语义更明确（404 可能被误解，200+ok 是无歧义的"健康"）。但这是**锦上添花**，任务 B 用退出码判断 404 已经够用。是否做由 execute-agent / 用户决定。

**风险**：修改 fake-provider-server.ts 是改测试基础设施代码，需跑一次单测确认没破坏现有行为（若有单测的话；当前无，见任务 E）。

---

### 任务 C：让 dev push 触发 CI（开放问题，需用户决策）

**涉及文件**：`.github/workflows/ci.yml`（改 `on.push.branches`）

**做什么**：当前 ci.yml 第 5 行 `branches: [main]`，dev 日常 push 不触发 CI。r3.1 计划任务 2.9 原文写的是"黄金路径每次 push 跑"——**原始意图是每次 push 都跑**，但分支过滤把 dev 排除了，导致意图落空。

**这是一个需要用户决策的开放问题，列出三个选项：**

| 选项 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **C1（推荐）** | `branches: [main, dev]`，全 job 都跑 | 忠实 r3.1"每次 push"意图；dev 问题立刻暴露，不用等 PR | 每次 dev push 跑完整 CI（含 e2e 5+ min），消耗 Actions 额度，拖慢频繁 push 的节奏 |
| **C2** | 保持 main-only + PR 触发（现状） | dev push 快，不拖节奏 | 问题要到开 PR 才发现（就是这次的教训） |
| **C3** | `branches: [main, dev]`，但 e2e-test job 加条件：dev push 时也跑（因为 e2e 是这次事故点） | 平衡：核心门禁每次跑，慢测试也每次跑 | 配置略复杂 |

**plan-agent 倾向 C1**：这次事故的根因之一就是"dev 上 10 个 commit 从没跑过 CI"。AGENTS.md 说 dev 是"日常开发分支，90% 时间在这里工作"——如果 CI 不覆盖 dev，等于 90% 的代码从没被 e2e 验证。慢一点比漏掉强。但最终由用户决定。

**风险**：无论选哪个，CI 改动要同步确认 schedule（nightly）仍然只在默认分支生效（GitHub Actions 的 schedule 本来就只在默认分支跑，这是平台行为，无需改）。

---

### 任务 D：执行日志诚实化补丁

**涉及文件**：`doc/executionlog/quality-os-v1-phase-a-a1-log.md`（修改）

**做什么**：把执行日志里违反铁律 6 的不实声明改正。具体：

1. **状态表纠错**：任务 2.1（commit `9060f9e`）和 2.2（commit `cc18805`）在 git log 里**确实已提交**，但执行日志状态表把它们标成 ⬜"不在 A-1 范围（基础设施前置）"——这与 git 历史矛盾，是事实错误。应改为 ✅，备注"基础设施前置，已由前批提交"。

2. **"门禁交 CI"声明纠正**：日志中多处（完成状态 checklist 第 273-275 行、子任务 7 验证结果第 254 行、子任务 9 第 204 行、整体总结第 491/506-510 行）写"本地 Docker 不可用，测试容器门禁交 GitHub Actions nightly schedule + PR/push 触发执行"——这些是**空头支票**，因为：
   - ci.yml `on.push.branches: [main]` 排除 dev，dev push 不触发
   - schedule 只在默认分支（main）生效，但 main 上当时没有这些 e2e 代码（都在 dev）
   - 即使触发，假 Provider 启动 bug 让 e2e 也跑不通

   应改为明确写："**CI 首次真实运行（PR #3）e2e 失败，根因 + 修复见 `doc/plan/nana-test-framework-ci-fix-plan.md`。本日志写作时 CI 门禁尚未实际通过。**"

3. **追加 PR #3 结果记录**：在 A-1 整体总结后追加一节"CI 首次运行结果（PR #3）"，记录：Unit/Integration/Build ✅、E2E ❌、两个 bug 根因、本修复计划引用。

**为什么这么做**：铁律 6 要求"任何步骤若被静默跳过、未验证、或结果不确定，绝不可宣称已完成/已通过/正常"。执行日志把"没跑过的 CI"写成"门禁交 CI"，等于把没验证的东西说成已验证，是典型的掩盖。必须显式纠正。

**风险**：改历史执行日志的措辞，不删记录、只追加纠正，保留可审计轨迹。

---

### 任务 E（可选，防御性）：为 fake-provider-server.ts 加导出验证单测

**涉及文件**：`src/__tests__/e2e-helpers/fake-provider-server.test.ts`（新增）

**做什么**：写一个轻量单测，验证 `import { startFakeProvider, MOCK_RESULTS }` 能正常拿到导出（`typeof startFakeProvider === 'function'`、`MOCK_RESULTS` 含 6 个 fixture）。可选再加一个"启动 → register → chat completions 端到端"的 happy path 测试。

**为什么这么做**：Bug ①的现象是"导出拿不到"。加一个导出烟雾测试能防止将来重构（改 export 方式、改文件路径、tsconfig 变动）时再次出现"not a function"。属于防御性投资，**非阻塞**。

**风险**：低。单测不依赖网络，启动用 port=0（OS 分配），测完 stopFakeProvider 关掉。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 | 上游冲突风险 |
|------|------|------|:---:|
| `scripts/start-fake-provider.ts` | 新增 | 假 Provider 独立启动入口（含信号处理优雅关闭） | 无 |
| `.github/workflows/ci.yml` | 修改 | ①Start step 改用 `npx tsx scripts/start-fake-provider.ts`；②就绪检查改用 curl 退出码；③（可选）`on.push.branches` 加 dev | 低（ci.yml 的 e2e-test job 是本项目自有增量，非上游原有；本次只改本任务自己 f43eda5 引入的行） |
| `doc/executionlog/quality-os-v1-phase-a-a1-log.md` | 修改 | 状态表 2.1/2.2 改 ✅；"门禁交 CI"声明改诚实；追加 PR #3 结果记录 | 无（本项目文档） |
| `e2e/helpers/fake-provider-server.ts` | 修改（可选） | 加 `GET /__test/health` 端点（任务 B-可选） | 无（本项目新增文件） |
| `src/__tests__/e2e-helpers/fake-provider-server.test.ts` | 新增（可选） | 导出验证 + 启动/注册/响应 happy path 单测（任务 E） | 无 |

> **注意**：ci.yml 是项目核心 CI 配置。本次修改针对的是 f43eda5 自己引入的 Start step 和就绪检查，不触碰 e2e-test job 之外的 job，不重排结构。commit message 应标注 `⚠️上游文件修改`（虽然 e2e-test job 是自有增量，但 ci.yml 文件本身追踪自上游，保持标记习惯便于以后同步上游时定位）。

---

## 4. 验收标准

### 4.1 CI 真跑通（最终门禁）

- [ ] 推送修复到 dev 后，PR #3 自动更新并重新触发 CI（或新开 PR）
- [ ] E2E Tests job 退出码 0，`nana-golden-path.spec.ts` 全部通过
- [ ] CI 日志中 `Start fake provider server` step 打印 `fake provider ready (HTTP 200)` 或类似真实就绪信号（**不是 HTTP 000000**）
- [ ] CI 日志中 `Stop fake provider server` step 打印的 `/tmp/fake-provider.log` 不再出现 `m.startFakeProvider is not a function`
- [ ] Unit / Integration / Build 三个 job 继续保持绿色（修复不引入回归）

### 4.2 本地 sanity check（不强制 Docker）

- [ ] `node node_modules/eslint/bin/eslint.js scripts/start-fake-provider.ts` → 0 error 0 warning
- [ ] 本地手动起假 Provider 验证启动脚本能跑：`VOLCENGINE_API_KEY=fake npx tsx scripts/start-fake-provider.ts`（Ctrl+C 能优雅退出，不残留进程）——本地能起就行，不要求跑完整 e2e
- [ ] `npm.cmd run build` 通过
- [ ] （任务 E 如做）`npm.cmd run test -- src/__tests__/e2e-helpers/fake-provider-server.test.ts --run` 通过
- [ ] （任务 B-可选如做）`node node_modules/eslint/bin/eslint.js e2e/helpers/fake-provider-server.ts` 干净

### 4.3 文档诚实化

- [ ] 执行日志状态表任务 2.1/2.2 与 git log（`9060f9e`/`cc18805`）一致
- [ ] 执行日志不再有"门禁交 CI"这类在当时无法兑现的声明，改为明确标注"CI 首次运行失败 + 修复计划引用"

### 4.4 测试策略标注

> 本次修复涉及两类代码：①bash/yaml 配置（ci.yml）——无单测，靠 CI 真实运行验证；②TS 启动脚本（start-fake-provider.ts）——逻辑简单（导入+启动+信号处理），可选加烟雾单测。不强制 TDD，因为修复的核心是"让 CI 能跑"，验收手段就是 CI 真跑通。

---

## 5. 风险与注意事项

### 5.1 技术不确定性

| 项 | 不确定性 | 处置 |
|----|---------|------|
| `npx tsx -e` 的具体失败机制 | 不确定是 tsx 没拦截 `-e`、还是 Node 22 ESM 解析路径问题、还是 import 路径缺扩展名 | **待 execute-agent 验证**。但换独立脚本文件能完全绕开这个问题，不需要查清根因也能修好。若 execute-agent 有兴趣可本地 `npx tsx -e "console.log(typeof require)"` 对比 `npx tsx script.ts` 行为差异，留记录 |
| 信号处理在 nohup + & 下的行为 | nohup 默认忽略 SIGHUP；SIGTERM/SIGINT 能否被脚本捕获 | Stop step 用 `kill $PID`（默认发 SIGTERM），脚本应监听 SIGTERM。即使信号处理没生效，kill 也能终止进程（兜底）。双保险 |
| GitHub Actions bash `set -e` | `if curl ...; then` 里的 curl 失败会不会触发 set -e | 不会。`if/while` 条件里的命令失败属于"被检查的失败"，不触发 set -e。安全 |

### 5.2 dev push 触发 CI 的影响（任务 C）

- 若选 C1（加 dev），每次 `git push origin dev` 触发完整 CI。AGENTS.md 说 dev"频繁提交、推送"——意味着 Actions 额度消耗增加、push 后要等 CI 才能合 main。
- 缓解：CI 失败不阻塞 dev 继续开发（dev 是工作分支，CI 红了就修，不影响 main 稳定）。GitHub Actions 公开仓库额度无限，私有仓库有 2000 分钟/月——本项目目前是私有还是公开需用户确认。
- schedule nightly 仍然只在默认分支（main）生效。若选 C1，nightly 的意义变成"main 稳定基线的每日回归"，和 dev push 上的实时门禁互补。

### 5.3 PR #3 处置

- 修复推到 dev 后，PR #3（dev → main）会**自动更新**并重新跑 CI，无需关闭重开。
- commit history：修复是 dev 上的新 commit，追加在 f43eda5 等之后，历史线性可追溯。不建议 force-push 抹掉 f43eda5——保留事故 commit 便于审计回溯（铁律 2：保持可回退）。
- 如果用户希望 PR #3 的 diff 更干净（只含"能跑通的 CI"而非"先坏后修"），可以关闭 PR #3、在 dev 上 `git revert f43eda5` 后重做——但 plan-agent **不推荐**，因为事故本身就是可审计资产，"先坏后修"是真实轨迹。

### 5.4 上游文件冲突

- ci.yml 是上游追踪文件。本次修改范围限定在 f43eda5 自己引入的 `Start fake provider server` / `Stop fake provider server` / 就绪检查 bash 这几处，不动其他 job。未来同步 upstream 时，若上游 ci.yml 有变动，冲突点明确可定位。
- fake-provider-server.ts 是本项目新增文件（commit `9060f9e`），无上游冲突风险。

### 5.5 不做的事（范围控制）

- 不改 playwright.config.ts（webServer env 注入维持现状——execute-agent 选择在 ci.yml job env 段注入而非 webServer.env，子进程继承父 env，已验证可行）
- 不改任何 spec 文件（e2e 测试逻辑本身没问题，CI 日志显示 `[CL-04] 已收好 耗时 137ms` 保存路径走通，失败全在 `getByText('AI 摘要')` 30s timeout——因为 Provider 没起来导致 /process 失败）
- 不改 src/ 业务代码
- 不创建 Prisma schema 变更
- 不修 r3.1 计划本身（计划是冻结的设计文档，执行偏差在执行日志里纠正）

---

## 6. 技术附录

### 6.1 `scripts/start-fake-provider.ts` 推荐伪代码

```typescript
/**
 * 假豆包 Provider CI/本地启动入口。
 *
 * 用法：
 *   CI:    nohup npx tsx scripts/start-fake-provider.ts > /tmp/fake-provider.log 2>&1 &
 *   本地:  npx tsx scripts/start-fake-provider.ts   （Ctrl+C 退出）
 *
 * 设计要点：
 * - 独立脚本文件，避免 `npx tsx -e` 模式对 .ts 动态 import 的不稳定行为
 * - 监听 SIGTERM/SIGINT，收到信号时优雅关闭 server 再退出（CI Stop step 用 kill $PID 发 SIGTERM）
 * - 端口默认 3999，与 ci.yml 的 VOLCENGINE_BASE_URL 一致
 */
import { startFakeProvider, stopFakeProvider } from '../e2e/helpers/fake-provider-server';

const PORT = Number(process.env.FAKE_PROVIDER_PORT) || 3999;

async function main() {
  const { server, port } = await startFakeProvider(PORT);
  console.log(`fake-provider listening on ${port}`);

  const shutdown = async (signal: string) => {
    console.log(`received ${signal}, shutting down...`);
    try {
      await stopFakeProvider(server);
      console.log('fake-provider stopped cleanly');
      process.exit(0);
    } catch (err) {
      console.error('error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('failed to start fake-provider:', err);
  process.exit(1);
});
```

> 注意 import 路径用 `'../e2e/helpers/fake-provider-server'`（从 scripts/ 目录出发的相对路径）。execute-agent 实现时确认 tsx 能解析无扩展名 import（项目 tsconfig + tsx 默认支持，但建议本地起一次验证）。

### 6.2 bash 就绪检查方案对比

| 方案 | 伪代码 | 优点 | 缺点 |
|------|--------|------|------|
| **A（推荐）** curl 退出码 | `if curl -s -o /dev/null http://127.0.0.1:3999/ 2>/dev/null; then ready; fi` | 最简洁；curl 拿到任何响应（含 404）= 退出码 0 = 服务器在；无字符串拼接 bug | 404 也算 ready，语义略宽（但假 Provider 对 `/` 返回 404 是已知行为，够用） |
| **B** curl 退出码 + health 端点 | `if curl -s -o /dev/null http://127.0.0.1:3999/__test/health 2>/dev/null; then ready; fi` | 语义明确（200+ok 才算健康）；需配合任务 B-可选加端点 | 多改一个文件 |
| **C** nc 端口探测 | `if nc -z 127.0.0.1 3999 2>/dev/null; then ready; fi` | 只看端口通不通，不依赖 HTTP | ubuntu-latest 默认装 nc，但 HTTP 层 ready 和 TCP listen 有微秒级 gap，极端情况 nc 通了但 server 还没处理请求 |
| **D** 修字符串 bug（保留原思路） | 去掉 `\|\| echo "000"`，只留 `-w "%{http_code}"` | 改动最小 | 仍然依赖字符串比较，不如退出码语义干净 |

**plan-agent 推荐 A**：最小改动、语义足够。若 execute-agent 觉得 404 不够明确，可升级到 B（配合任务 B-可选）。

### 6.3 ci.yml 推荐改动 diff 片段

**改动 1：Start step 命令 + 就绪检查（任务 A + B）**

```yaml
      # 修改前（f43eda5 引入，有 bug）
      - name: Start fake provider server
        run: |
          nohup npx tsx -e "import('./e2e/helpers/fake-provider-server').then(m => m.startFakeProvider(3999).then(({ port }) => console.log('fake-provider listening on', port)).catch(e => { console.error(e); process.exit(1); }))" > /tmp/fake-provider.log 2>&1 &
          echo $! > /tmp/fake-provider.pid
          response="000"
          for i in $(seq 1 30); do
            response=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3999/ 2>/dev/null || echo "000")
            if [ "$response" != "000" ]; then
              echo "fake provider ready (HTTP $response)"
              break
            fi
            sleep 1
          done
          if [ "$response" = "000" ]; then
            echo "::error::fake provider failed to start within 30s"
            echo "--- fake-provider.log ---"
            cat /tmp/fake-provider.log 2>/dev/null || true
            exit 1
          fi

      # 修改后（任务 A + B）
      - name: Start fake provider server
        run: |
          nohup npx tsx scripts/start-fake-provider.ts > /tmp/fake-provider.log 2>&1 &
          echo $! > /tmp/fake-provider.pid
          # 用 curl 退出码判断就绪：拿到任何 HTTP 响应（含 404）= 服务器已启动
          ready=0
          for i in $(seq 1 30); do
            if curl -s -o /dev/null http://127.0.0.1:3999/ 2>/dev/null; then
              echo "fake provider ready (responded on attempt $i)"
              ready=1
              break
            fi
            sleep 1
          done
          if [ "$ready" != "1" ]; then
            echo "::error::fake provider failed to start within 30s"
            echo "--- fake-provider.log ---"
            cat /tmp/fake-provider.log 2>/dev/null || true
            exit 1
          fi
```

**改动 2（可选，任务 C 选 C1 时）：on.push.branches 加 dev**

```yaml
      # 修改前
      on:
        push:
          branches: [main]
      
      # 修改后（选 C1）
      on:
        push:
          branches: [main, dev]
```

**Stop step 无需改动**：它用 `kill $PID` + tail 日志，和新启动方式兼容。PID 仍由 `echo $!` 写入。

### 6.4 执行日志纠正片段示意（任务 D）

执行日志需修正的具体位置（行号基于当前文件）：

| 位置 | 现状（不实） | 改为（诚实） |
|------|-------------|-------------|
| 状态表 第 16-17 行 | 任务 2.1/2.2 标 ⬜"不在 A-1 范围" | 标 ✅，备注"commit `9060f9e`/`cc18805`，基础设施前置已提交" |
| 完成状态 checklist 第 272-275 行 | "测试容器门禁通过（二选一）...GitHub Actions 测试容器门禁交由 nightly schedule + PR/push 触发执行" | 追加"⚠️ 截至 2026-07-26，CI 从未在 dev push 上触发（ci.yml branches=[main]）；PR #3 首次触发 e2e 失败。门禁实际未通过，修复见 `doc/plan/nana-test-framework-ci-fix-plan.md`" |
| 整体总结第 491-492 行 | "本地 e2e 全部未跑...门禁交 CI nightly schedule" | 同上追加纠正 |
| 第 506-510 行"测试容器门禁状态" | "测试容器门禁交由 GitHub Actions nightly schedule + PR/push 触发执行" | 改为"CI 首次运行（PR #3）e2e 失败，根因=假 Provider 启动失败+就绪检查 bug。修复进行中。门禁实际未通过。" |
| 文末 | 无 PR #3 记录 | 追加新节"## CI 首次运行结果（PR #3，2026-07-26）"，记录 Unit/Integration/Build ✅、E2E ❌、两 bug 根因、本计划引用 |

### 6.5 r3.1 任务 2.9 原始约束对照

| r3.1 原文要求 | f43eda5 实现 | 本修复 |
|--------------|-------------|--------|
| "黄金路径每次 push 跑" | ci.yml `on.push.branches: [main]`（dev push 不触发，违反"每次"） | 任务 C 选项 C1 恢复原始意图 |
| "批量路径只在 nightly schedule 或 release tag 时跑" | `GITHUB_EVENT_NAME` 分支判断（push 跑 golden-path，schedule 跑全部） | 不改，实现符合 |
| "ci.yml 的 e2e-test job 增加假 Provider 启动步骤" | 新增 Start/Stop step | 修启动命令 + 就绪检查（任务 A+B） |
| "证据包作为 artifact 上传（保留 14 天）" | Upload evidence pack step（retention 14 天） | 不改 |
| "显式 ffmpeg 检查" | Ensure ffmpeg available step | 不改 |

> **结论**：f43eda5 的设计骨架符合 r3.1，问题出在执行细节（tsx -e 调用方式、bash 就绪检查、dev 分支遗漏）。本修复是对 f43eda5 的补丁，不是重新设计。

---

## 7. 执行顺序建议

1. **任务 A**（新建启动脚本）→ 本地 `npx tsx scripts/start-fake-provider.ts` 能起
2. **任务 B**（改 ci.yml 就绪检查 + Start 命令）→ 和 A 一起提交，推 dev 看 PR #3 CI
3. **任务 D**（执行日志诚实化）→ 可与 A+B 同批或紧跟
4. **任务 C**（dev push 触发）→ **等用户决策后**再改
5. **任务 B-可选 / E**（健康端点 / 单测）→ 视 A+B 修复后 CI 是否一次跑通决定：跑通则可选做；仍有问题则补

---

> 本计划完成后，等用户确认（特别是任务 C 的选项决策）再进入 execute 阶段。

---

# 修订 v2：虚拟麦克风录音步骤 CI 适配（2026-07-27 追加）

> 关联：本计划 §5 第 197 行"不改 playwright.config.ts"在 v2 中被推翻——v1 修复后 CI 实际卡在录音步骤，必须改。
> 关联：r3.1 §3 任务 2.2 降级预案（[nana-test-framework-plan.md:311](nana-test-framework-plan.md)）、r3.1 §5.2 技术风险第 1 条（[nana-test-framework-plan.md:741](nana-test-framework-plan.md)）。
> 触发：v1 任务 A-E + 5 个额外 bug 已推 dev，CI 多轮迭代后卡点收敛到录音步骤（`e2e/ci/nana-golden-path.spec.ts:256-258` "我听完了"按钮 5s timeout）。
> 计划日期：2026-07-27
> 执行者：plan-agent（设计），待用户确认后交 execute-agent

---

## 1. 背景

v1 修复（任务 A-E + 5 个额外 bug：tsx -e / curl 退出码 / dev push 触发 / 端口冲突 / standalone 模式 / 执行日志诚实化 / 单测补强）全部完成后，CI 前序 bug 全部修通。卡点最终收敛到 `e2e/ci/nana-golden-path.spec.ts:256-258`：

```ts
await expect(
    page.getByRole('button', { name: '我听完了' }),
).toBeVisible({ timeout: 5_000 });
```

这是 CL-03 录音路径的第 2 步：点"说说看"开始录音（line 254）后，前端应切到 recording 态并渲染"我听完了"按钮。CI headless 上 5s 内未出现 → timeout。

### 1.1 根因状态：推断，未确认

当前 8 次 CI 失败的日志**只显示 timeout，没有 console error / DOM 快照 / 录音状态证据**，根因是推断：

| 假设 | 内容 | 可能性 |
|------|------|--------|
| A | Chromium fake-media flags 在 headless Linux 不产生有效音频流 → `MediaRecorder.ondataavailable` 不触发 → state 不切换 | 中（最常见解释） |
| B | `math-voice-sample.wav` 路径在 CI 上解析错（launchOptions 在 config 加载时算绝对路径，理论 OK，未验证） | 低 |
| C | 前端录音组件 state 转换依赖 headless 下行为差异的浏览器 API | 中 |
| D | `--use-file-for-fake-audio-capture` flag 在新版 Chromium 改名或行为变化 | 低 |

**任务 F 的存在就是为了把"推断"变成"确认"。**

### 1.2 关键事实

- `playwright.config.ts:13` 已调用 `getVirtualMicLaunchOptions()`（含 `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` + `--use-file-for-fake-audio-capture=...math-voice-sample.wav`）
- `playwright.config.ts:90-97` mobile-chrome project 已 `launchOptions: virtualMicLaunchOptions`
- `e2e/helpers/virtual-microphone.ts:100-132` `injectFakeUserMedia()` 降级 helper **已完整实现**，用 WebAudio 生成静默 AudioStream，让真实 MediaRecorder 处理 fake stream
- r3.1 §3 任务 2.2（plan:311）+ §5.2（plan:741）**已明确把"headless 不工作"列为已知技术风险**，降级到 injectFakeUserMedia 是计划内选项，不是偏离

---

## 2. 任务分解

### 任务 F：诊断 + 选型（必做，先诊断再修）

**涉及文件**：`e2e/ci/_diagnose-audio.spec.ts`（新增，临时诊断 spec）

**做什么**：写一个独立的轻量诊断 spec，只验证"点'说说看'后录音状态切换"，不做完整 golden path。伪代码：

```ts
import { test } from '@playwright/test';
import { injectFakeUserMedia } from '../helpers/virtual-microphone';
// 复用 golden-path 的 registerAndLogin / setupFixtureRegistration

test('diagnose: 说说看 → 我听完了 状态切换', async ({ page }) => {
  // 采集浏览器 console + pageerror
  page.on('console', msg => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  // 1. 注册登录 + 导航 /nana/capture + 注册 fixture + 上传题图（复用现有 helper）
  // 2. 点击前截图
  await page.screenshot({ path: 'test-results/diagnose-before-click.png' });

  // 3. 点"说说看"
  await page.getByRole('button', { name: '说说看' }).click();

  // 4. 立即截图 + 2s 后再截图（给 state 切换时间）
  await page.screenshot({ path: 'test-results/diagnose-after-click.png' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/diagnose-2s.png' });

  // 5. dump 页面 HTML + 可见按钮列表
  const html = await page.content();
  require('fs').writeFileSync('test-results/diagnose-page.html', html);
  const buttons = await page.getByRole('button').allTextContents();
  console.log('[visible-buttons]', JSON.stringify(buttons));

  // 6. 不做断言，spec 永远 pass（目的是收集诊断产物，不是验证）
});
```

CI 跑一次后，从 artifact 下载 `test-results/diagnose-*.png` + `diagnose-page.html`，结合 job log 中 `[browser]` / `[pageerror]` / `[visible-buttons]` 输出，人工分析根因。

**为什么这么做**：
- 8 次失败全是同一个 timeout，没有 console error / DOM 快照，无法判断是 launchOptions.flags 失效还是前端 state 依赖问题
- 独立 spec 跑得快（< 1 min），不污染 golden-path，可反复迭代
- 诊断产物（截图 + HTML + console log）是 G/H/I 的决策依据

**风险**：低。诊断 spec 不做断言、不影响其他 spec。跑完可保留（防御性回归）或删除。

**诊断结论会指向**：
- 截图显示"说说看"按钮还在（未切到 recording 态）→ launchOptions.flags 失效 → 选 G
- 截图显示"我听完了"已出现但 spec 仍 timeout → selector 或 timing 问题（超出当前假设，需新方案）
- console 有 `MediaRecorder` / `AudioContext` / `file not found` 错误 → 对应假设确认

---

### 任务 G：方案 1——降级到 injectFakeUserMedia（r3.1 §3 任务 2.2 预案）

**涉及文件**：
- `playwright.config.ts`（修改 mobile-chrome project：line 90-97）
- `e2e/ci/nana-golden-path.spec.ts`（加 addInitScript hook）
- 同步检查 `nana-cross-user.spec.ts` / `nana-batch-path.spec.ts` / `nana-sequential-capture.spec.ts` 是否有录音步骤

**做什么**：
1. `playwright.config.ts:90-97` mobile-chrome project 改为只用 base flags（保留 `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream`，**移除** `--use-file-for-fake-audio-capture`——这是失败嫌疑点）
2. 在 spec 的 page 创建后、`page.goto` 之前加 `await page.addInitScript(injectFakeUserMedia)`
3. `injectFakeUserMedia`（virtual-microphone.ts:100-132）已实现，用 WebAudio 生成静默 AudioStream，让真实 MediaRecorder 处理

**伪代码（spec 改动）**：
```ts
import { injectFakeUserMedia } from '../helpers/virtual-microphone';

// 推荐：用 context-level init script（比 page-level 更稳，覆盖所有新 page）
// 在 beforeAll 创建 browserContext 后：
await context.addInitScript(injectFakeUserMedia);
// 必须在 context.newPage() / page.goto 之前调用
```

**为什么这么做**：
- r3.1 §3 任务 2.2（plan:311）原文："如果 Chromium fake-media 在 headless 中不工作：降级为 `page.addInitScript` 注入 fake `getUserMedia` 返回预制 Blob，但仍不替换 `MediaRecorder`"
- r3.1 §5.2（plan:741）把"Chromium fake-media 在 headless CI 中不工作"明确列为已知技术风险，缓解方案就是 injectFakeUserMedia
- virtual-microphone.ts:100-132 已实现降级 helper，最小改动
- 降级方案仍走真实 MediaRecorder，验证完整链路（getUserMedia → MediaRecorder → webm → ffmpeg → /process）

**风险**：
- WebAudio 在 headless 也可能行为差异（`AudioContext` 在某些 Chromium headless 配置下需要 `--autoplay-policy=no-user-gesture-required`）——若 G 失败可叠加任务 I 的 flag
- `addInitScript` 必须在 `page.goto` 之前注入，否则首屏的 getUserMedia 调用拿不到 fake 版本——execute-agent 注意调用顺序
- 多个 ci spec 都用到 page，建议用 `browserContext.addInitScript`（context 级，覆盖所有新 page）而非 `page.addInitScript`（page 级，每个新 page 都要重注入）

---

### 任务 H：方案 2——让 golden-path 录音步骤可降级跳过

**涉及文件**：
- `e2e/ci/nana-golden-path.spec.ts`（line 251-264 录音 step 加环境检测）
- `.github/workflows/ci.yml`（e2e-test job env 加 `SKIP_AUDIO_IN_CI`）

**做什么**：
1. spec 中加环境检测：`process.env.CI && process.env.SKIP_AUDIO_IN_CI` 时跳过 CL-03 录音 step，直接进 CL-04 保存
2. CI e2e-test job env 段加 `SKIP_AUDIO_IN_CI: 'true'`
3. **execute-agent 必须先验证 CL-04 保存路径是否依赖 audio_note**（读 `src/app/[locale]/nana/capture/page.tsx` 确认）——若强依赖，H 不可行，必须选 G

**伪代码（spec 改动）**：
```ts
await test.step('CL-03+04 录音可选 + 保存不等待 AI', async () => {
  const skipAudio = !!(process.env.CI && process.env.SKIP_AUDIO_IN_CI);

  if (!skipAudio) {
    // 原 CL-03 录音步骤（line 253-264）
    await page.getByRole('button', { name: '说说看' }).click();
    await expect(page.getByRole('button', { name: '我听完了' })).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '我听完了' }).click();
    await page.waitForTimeout(1500);
  } else {
    test.info().annotations.push({
      type: 'skip-reason',
      description: 'CI SKIP_AUDIO_IN_CI：录音路径在 CI 不覆盖，由本地/真机抽检覆盖（r3.1 §5 第五层）',
    });
  }

  // CL-04 保存步骤（line 271+）原样保留
  // ...
});
```

**为什么这么做**：
- r3.1 §3 任务 2.2 录音是"可选"路径（CL-03 标的就是"录音可选"），保存路径 CL-04 不应强依赖录音
- 最快让 CI 转绿，把诊断压力降下来
- 录音路径由 r3.1 §5 第五层（本地/真机抽检）覆盖，CI 不覆盖是可接受的降级

**风险**：
- **录音路径在 CI 长期不覆盖** → 若选 H 作为永久方案，需在执行日志显式记录"录音链路 CI 不覆盖"
- 临时跳过易、恢复难——若选 H，必须加 `@TODO(r3.1-task-2.2-audio-ci)` 注释 + 在 `doc/00_CURRENT.md` 登记技术债
- 若 CL-04 保存逻辑强依赖 audio_note（execute-agent 验证），H 不可行，必须选 G

**与 G 的关系**：H 是"先转绿再优化"的过渡方案。可先 H 让 CI 转绿 + 留录音路径技术债，后续再补 G；或直接 G 一次到位。由用户决策。

---

### 任务 I：方案 3——Chromium flags 调优（备选）

**涉及文件**：`e2e/helpers/virtual-microphone.ts`（`VIRTUAL_MIC_BASE_FLAGS` 增补）

**做什么**：研究 Playwright + Chromium fake-media 在 headless Linux 的已知问题，可能的调整：
- 加 `--autoplay-policy=no-user-gesture-required`（让 AudioContext 不需用户手势即可启动）
- 加 `--mute-audio`（避免 fake audio 触发实际播放错误）
- 升级 `@playwright/test` 版本（若是 Playwright 已知 bug，新版可能已修）
- 检查 Chromium 版本与 `--use-file-for-fake-audio-capture` 的兼容性

**为什么这么做**：
- 若任务 F 诊断显示 launchOptions.flags 部分生效（如 getUserMedia 拿到 stream 但 MediaRecorder 不触发 dataavailable），可能是某个 flag 缺失或冲突
- 这是 G 和 H 之外的备选，研究成本高

**风险**：
- 高。Playwright/Chromium headless 行为差异的官方文档稀少，研究可能无果
- 改 flags 影响所有用 launchOptions 的 project（mobile-chrome + smoke）
- 若选 I，必须配合任务 F 的诊断产物验证，不能盲调

---

## 3. 任务优先级与决策路径

**强烈建议**：F 先诊断 → 根据诊断结果选 G 或 H。I 仅在 G/H 都失败时作为备选。

```
任务 F（诊断 spec，必做，< 1 个 CI 周期）
    ↓
人工分析 diagnose 截图 + console log
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 假设 A/B/D 确认（flags 失效）→ 任务 G（injectFakeUserMedia）    │
│ G 仍失败 → 任务 I（flags 调优）作为 G 的补丁                    │
└─────────────────────────────────────────────────────────────┘
                       或
┌─────────────────────────────────────────────────────────────┐
│ 时间紧 / 想先转绿 → 任务 H（跳过录音）                          │
│ 转绿后再补 G（恢复录音覆盖）                                    │
└─────────────────────────────────────────────────────────────┘
```

**plan-agent 倾向：F + G**。理由：
1. r3.1 §3 任务 2.2 + §5.2 已明确把 injectFakeUserMedia 列为预案，G 是计划内路径，不是新设计
2. F 的诊断成本低（< 1 个 CI 周期），收益高（明确根因，避免继续打地鼠）
3. H 虽快但留下技术债，长期看反而增加维护成本
4. I 风险高、收益不确定，作为最后备选

**但最终由用户决定。**

---

## 4. 文件变更清单

| 文件 | 操作 | 任务 | 上游冲突风险 |
|------|------|------|:---:|
| `e2e/ci/_diagnose-audio.spec.ts` | 新增（临时/保留） | F | 无（本项目新增） |
| `playwright.config.ts` | 修改（mobile-chrome project 的 launchOptions） | G | 无（mobile-chrome project 是本项目新增，非上游） |
| `e2e/ci/nana-golden-path.spec.ts` | 修改（加 addInitScript 或环境检测） | G 或 H | 无（本项目新增） |
| `e2e/ci/nana-cross-user.spec.ts` / `nana-batch-path.spec.ts` / `nana-sequential-capture.spec.ts` | 修改（如有录音步骤，同步改） | G | 无（本项目新增） |
| `.github/workflows/ci.yml` | 修改（e2e-test job env 加 `SKIP_AUDIO_IN_CI`） | H | 低（自有增量 job） |
| `e2e/helpers/virtual-microphone.ts` | 修改（`VIRTUAL_MIC_BASE_FLAGS` 增补 flag） | I | 无（本项目新增） |

> **关于"不改 playwright.config.ts"的推翻**：v1 §5（风险）第 197 行写了"不改 playwright.config.ts（webServer env 注入维持现状）"——那是 v1 修复阶段的范围控制（v1 当时卡点在假 Provider 启动，不在录音）。v2 卡点已变（前序 bug 全修通，卡在录音），必须动 launchOptions/project 配置。这个推翻本身在执行日志记录即可，不算偏离（计划本身允许修订）。

---

## 5. 验收标准

### 5.1 CI 转绿（最终门禁）

- [ ] 推送修复到 dev 后，CI E2E Tests job 退出码 0
- [ ] `nana-golden-path.spec.ts` 全部测试通过
- [ ] CI 日志中不再出现 `getByRole('button', { name: '我听完了' })` 5s timeout

### 5.2 任务 F 验收（如做）

- [ ] `_diagnose-audio.spec.ts` 跑通，artifact 含 `diagnose-*.png` + `diagnose-page.html` + job log 含 `[browser]` / `[pageerror]` / `[visible-buttons]` 输出
- [ ] 人工分析诊断产物，根因明确写入执行日志（即使结论是"仍不确定"，也要诚实记录）

### 5.3 任务 G 验收（如做）

- [ ] spec 中 `context.addInitScript(injectFakeUserMedia)` 在 `page.goto` 之前调用
- [ ] 录音步骤在 CI 通过（"我听完了"按钮可见 → 点击 → completed 态）
- [ ] CL-04 保存路径 + CL-05/06/07/08 后续断言全部通过
- [ ] `playwright.config.ts:90-97` mobile-chrome project 已移除 `--use-file-for-fake-audio-capture`

### 5.4 任务 H 验收（如做）

- [ ] CI e2e-test job env 含 `SKIP_AUDIO_IN_CI: 'true'`
- [ ] spec 录音 step 在 CI 跳过，`test.info().annotations` 记录 `skip-reason`
- [ ] 执行日志显式记录"录音路径在 CI 不覆盖，由本地/真机抽检覆盖（r3.1 §5 第五层）"
- [ ] spec 中加 `@TODO(r3.1-task-2.2-audio-ci)` 注释登记技术债

### 5.5 不变性

- [ ] Unit / Integration / Build job 继续绿色
- [ ] smoke project 不受影响（smoke 用独立 launchOptions，不强行联动）
- [ ] 本地（非 CI 环境）跑 golden-path 不受影响（H 的 `SKIP_AUDIO_IN_CI` 只在 CI 生效；G 的 injectFakeUserMedia 对本地无副作用）

---

## 6. 风险与注意事项

### 6.1 不确定性诚实标注

| 项 | 不确定性 | 处置 |
|----|---------|------|
| Chromium fake-media 在 headless Linux 的实际行为 | **未确认**（8 次 CI 失败未采集诊断产物） | 任务 F 采集后再确认 |
| `math-voice-sample.wav` 路径在 CI 是否正确解析 | 推断 OK（launchOptions 在 config 加载时算绝对路径），未验证 | 任务 F 的 console log 会暴露 file not found 错误 |
| `injectFakeUserMedia` 在 headless 是否工作 | 推断 OK（WebAudio 标准 API），但 AudioContext 可能需 autoplay flag | G 失败时叠加 I 的 `--autoplay-policy=no-user-gesture-required` |
| CL-04 保存是否依赖 audio_note | **未验证** | H 实施前 execute-agent 必须读 `src/app/[locale]/nana/capture/page.tsx` 确认 |

### 6.2 范围控制

**不做的事**：
- 不改 `src/` 业务代码（如 capture/page.tsx 的录音组件逻辑）——若任务 F 诊断显示前端有 bug，单独开新计划，不在 v2 内混入
- 不改 r3.1 计划本身（计划冻结，执行偏差在执行日志记录）
- 不重构 `virtual-microphone.ts`（已实现完整，只在 `VIRTUAL_MIC_BASE_FLAGS` 增补 flag）
- 不改其他 spec 的非录音部分

### 6.3 与 v1 计划的关系

- v2 是 v1 的延续：v1 任务 A-E + 5 个额外 bug 已完成，不在 v2 范围
- v1 §5 第 197 行"不改 playwright.config.ts"被 v2 推翻——基于 v1 修复后实际卡点的合理调整
- v1 的执行顺序（§7）已完成，v2 在 v1 之后启动

### 6.4 r3.1 计划对照

| r3.1 原文 | v2 实现位置 |
|-----------|------------|
| §3 任务 2.2（plan:311）："如果 Chromium fake-media 在 headless 中不工作：降级为 `page.addInitScript` 注入 fake `getUserMedia`" | 任务 G 直接落实这个预案 |
| §5.2 第 1 条（plan:741）："Chromium fake-media 在 headless CI 中不工作 → 降级为 `page.addInitScript` 注入 fake `getUserMedia`" | 任务 G |
| §3 任务 2.2 录音"可选"（CL-03 标"录音可选"） | 任务 H 利用"可选"语义跳过 |

> **结论**：v2 的 G/H/I 都是 r3.1 已预案的路径，不是新设计。任务 F 是新增的诊断手段（r3.1 未明确写），属于"先诊断再修"的工程常识，符合 AGENTS.md 铁律 5（遇错停下来）和铁律 6（显式失败，不掩盖）。

### 6.5 诚实声明

- 本计划写时根因**未确认**（任务 F 之前无法确认）。所有假设 A/B/C/D 都是推断。
- 8 次 CI 失败未采集诊断产物，是前序执行的疏漏——v2 任务 F 就是为了补这个疏漏。
- 若用户选 H 跳过诊断直接转绿，等于"接受根因未知，先把 CI 转绿"——这是合法选择，但要在执行日志写明"根因未查清，录音路径技术债待还"。

---

## 7. 需要用户决策的开放问题

1. **执行路径**（必答）：
   - 选项 ①：F（先诊断）→ G（降级 injectFakeUserMedia）—— plan-agent 倾向
   - 选项 ②：F（先诊断）→ H（先转绿，留技术债）
   - 选项 ③：直接 H（不诊断，最快转绿）—— 风险：根因永远不知道
   - 选项 ④：直接 G（不诊断，直接试降级方案）—— 风险：若 G 失败，仍不知道为什么

2. **任务 F 诊断 spec 跑完后的处置**：保留作为回归诊断工具，还是跑完即删？

3. **若选 H**：CI 录音路径技术债什么时候还？（建议下个开发轮次，或某次 Playwright/Chromium 升级后重试）

4. **若 G + I 都失败**：是否接受 H 作为长期方案（CI 永久不覆盖录音路径）？

5. **任务 F 的诊断 spec 的 fixture**：复用 golden-path 的 `clear-printed.jpg`，还是单独准备一张更小的图（更快）？

---

> 本修订 v2 完成后，等用户确认（特别是开放问题 1-5 的决策）再进入 execute 阶段。
