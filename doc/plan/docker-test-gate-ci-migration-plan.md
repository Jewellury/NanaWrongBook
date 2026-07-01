# 调整部署/测试门禁（本地 Docker 退场，测试容器门禁交给 GitHub Actions）· 开发计划

> 关联规格：[doc/plan/ci-image-deployment-plan.md](ci-image-deployment-plan.md)（已采纳的 CI 镜像部署方案）
> 关联参考：[doc/reference/docker-troubleshooting-guide.md](../reference/docker-troubleshooting-guide.md)
> 计划日期：2026-07-01
> 预计影响：`AGENTS.md`、`doc/agents/{plan,execute,audit}-agent.md`、`doc/INDEX.md`、`doc/reference/docker-troubleshooting-guide.md`，以及由 sync-agents.js 生成的运行时文件
> 性质：**纯规则文档修订，零源码改动**。把"测试门禁"的执行地点从不稳定的 Windows Docker Desktop 搬到已经稳定运行的 GitHub Actions，让规则追上现实。

---

## 1. 大白话概述

这轮要做的事一句话：**把"上线前必须跑通测试"这个关卡，从经常卡死的本地 Windows Docker，挪到云端已经很稳的 GitHub Actions，但测试本身一个都没少。**

为什么要做：项目已经换成 CI 镜像部署路线（本地改代码 → 推 GitHub → GitHub Actions 自动构建+跑测试容器+打镜像 → 服务器拉镜像运行）。云端那套测试容器其实**早就在每次推 main 时自动跑**了（同样的 `docker-compose.test.yml`、同样的 test.db 隔离、同样的护栏）。可是现在三个 agent 的规则文档还写着"本地必须把 Docker 测试容器跑通才能上线"。现实是 Windows 用户的 Docker Desktop 动不动就卡在"Starting Engine"，反复把开发卡死。规则和现实脱节了——规则要求一个本地根本起不来的东西，而真正把关的 CI 反而没写进规则。

怎么改：只改规则文档，不碰任何代码。核心原则是——**本地 Docker 能跑最好（算加分项），跑不动不挡路也不挡提交；但 CI 那一道是硬门禁，CI 没过绝对不准上线；测试容器永远只能用 test.db，生产容器、生产库永远不许拿来跑测试。** 这是把质量门禁搬家，不是拆门。

---

## 2. 任务分解

- [ ] **任务 1**：修订 `AGENTS.md` §部署发布门禁——新增"测试与部署门禁（CI 镜像路线）"小节，并把"dev 合入 main 前必须完成发布候选验证"里的本地 Docker 硬要求改为 CI 路线。（涉及文件：`AGENTS.md`，行 ~147–156）
- [ ] **任务 2**：修订 `doc/agents/execute-agent.md`——把"完成状态"里的本地 `test:all` 硬要求拆成本地 Docker 可用/不可用两条路；并在工作流 #5 补一句"本地 Docker 起不来就停排障、交给 CI，但仍不许用生产容器"。（涉及文件：`doc/agents/execute-agent.md`，行 ~78–84、~92–95）
- [ ] **任务 3**：修订 `doc/agents/audit-agent.md`——把审计模板的"测试"小节拆成本地/CI 两路，并新增"部署镜像来自 GitHub Actions 成功构建"等检查项。（涉及文件：`doc/agents/audit-agent.md`，行 ~77–96）
- [ ] **任务 4**：修订 `doc/agents/plan-agent.md` §部署计划专项要求——把"Docker 验证命令 = 本地 `docker compose build --no-cache`"改为"CI 测试容器门禁"，并要求计划必须写明本地 Docker 非必需、CI 失败即停。（涉及文件：`doc/agents/plan-agent.md`，行 ~79–87）
- [ ] **任务 5**：修订 `doc/reference/docker-troubleshooting-guide.md`——新增"当前策略更新（CI 镜像部署后）"小节，说明 Docker Desktop 不再是上线前置、卡 Starting Engine 时可放手交给 CI。（涉及文件：`doc/reference/docker-troubleshooting-guide.md`，顶部）
- [ ] **任务 6**（可选）：刷新 `doc/INDEX.md` 里 docker-troubleshooting-guide 的一句话描述，补"含 CI 策略更新"。（涉及文件：`doc/INDEX.md`，行 ~128）
- [ ] **任务 7**：运行 `node scripts/sync-agents.js`，把 4 个 canonical agent 文件同步到 `.claude/agents/` 和 `.opencode/agents/`（6 个运行时文件）。
- [ ] **任务 8**：运行 `node scripts/check-agent-sync.js`，确认 exit 0（一致）。
- [ ] **任务 9**：Git 收口——提交，commit message：`docs(agents): move docker test gate to GitHub Actions`。

> 执行顺序约束：任务 2/3/4 必须在任务 7 之前完成（先改 canonical，再 sync）。任务 7 必须在任务 8 之前。任务 1/5/6 与任务 2/3/4 之间无强依赖，可并行，但建议同一批改完再 sync，避免多次同步。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 | 是否 canonical |
|------|------|------|:--:|
| `AGENTS.md` | 修改 | §部署发布门禁新增 CI 测试门禁小节 + 修订 dev 合入 main 验证项 | — |
| `doc/agents/plan-agent.md` | 修改 | §部署计划专项要求 改用 CI 测试门禁 | ✅ canonical |
| `doc/agents/execute-agent.md` | 修改 | 完成状态拆本地/CI 两路 + 工作流补 Docker 排障停手规则 | ✅ canonical |
| `doc/agents/audit-agent.md` | 修改 | 测试小节拆本地/CI 两路 + 部署审计加 CI 镜像来源检查 | ✅ canonical |
| `doc/reference/docker-troubleshooting-guide.md` | 修改 | 顶部新增"当前策略更新"小节 | — |
| `doc/INDEX.md` | 修改（可选） | docker-troubleshooting-guide 一句话描述补"含 CI 策略更新" | — |

> **由 sync-agents.js 自动生成的运行时文件（执行方不得手改）**：
> `.claude/agents/plan-agent.md`、`.claude/agents/execute-agent.md`、`.claude/agents/audit-agent.md`、`.opencode/agents/plan-agent.md`、`.opencode/agents/execute-agent.md`、`.opencode/agents/audit-agent.md`。
> 这 6 个文件由任务 7（`sync-agents.js`）一次性写出，任务 8（`check-agent-sync.js`）验证一致。**执行方绝不直接编辑这两个目录**（违反 AGENTS.md §Agent 同步机制）。

> **不在本轮范围内（明确不动的）**：
> - `.github/workflows/build-and-push.yml`（CI 测试门禁基础设施已存在，本轮只改规则、不改 CI 配置）
> - `docker-compose.test.yml`、`src/__tests__/setup/guard-db.ts`、`package.json` 的 `test:all`（DB 护栏与测试聚合入口原样保留）
> - 任何 `src/`、`prisma/`、`lib/` 源码

---

## 4. 验收标准

> 测试策略：本轮是纯文档修订，**无自动化测试可跑**。验收靠 `check-agent-sync.js`（exit 0）+ 人工对照下方"工单验收项"逐条勾选。execute-agent 完成日志中本轮的"测试容器门禁"应走 CI 分支或明确记录本地未跑。

**对照工单的验收项（逐条映射，每条须满足）**：

- [ ] **AGENTS.md 明确本地 Docker 不再作为上线前置** → 任务 1 的新小节首句即写明
- [ ] **AGENTS.md 明确测试容器门禁由 GitHub Actions 强制执行** → 任务 1 新小节列出 CI 必跑命令 + "CI 失败不得部署"
- [ ] **execute-agent.md 区分本地 Docker 可用/不可用两种情况** → 任务 2 的完成状态拆为两条 bullet
- [ ] **audit-agent.md 要求检查 GitHub Actions 测试容器日志** → 任务 3 的测试小节新增"CI 日志退出码 0"检查项
- [ ] **plan-agent.md 部署计划要求包含 CI 测试门禁** → 任务 4 的计划必需字段更新
- [ ] **未删除 DB 护栏、未削弱测试容器隔离** → 逐项核对：所有修改点均保留 `test.db`/`dev.db` 护栏断言与"生产容器禁测"条款（技术附录中每条 after 文本可核验）
- [ ] **明确禁止生产容器跑测试** → 任务 2 工作流 #5 保留并强化该禁令；任务 1 新小节末尾重申
- [ ] **已运行 `node scripts/sync-agents.js`** → 任务 7 输出 "Done: 6/6 files synced."
- [ ] **已运行 `node scripts/check-agent-sync.js` 且通过** → 任务 8 exit 0，输出 "OK: 3/3 agents in sync."

**额外自检（防止误读为"测试可选"）**：读完全部 4 个 agent 文件后，任何读者应能清晰得出结论——"本地可跳过，CI 不可跳过"。若某处措辞可能被误读为"测试整体取消"，判 ❌，回 execute-agent 修措辞。

---

## 5. 风险与注意事项

### 风险 1（最高优先）：被误读成"降低质量门禁"

> **特别提醒（必须逐字保留本意图）**：
> 这不是降低质量门禁，而是把质量门禁从不稳定的 Windows Docker Desktop 移到稳定的 GitHub Actions。规则应表达清楚：**本地 Docker 不强制，CI Docker 强制。本地可跳过，CI 不可跳过。生产容器永远不能拿来跑测试。**

措辞红线：任何一处都**不能**单独出现"本地 Docker 不要求"而不紧跟着"CI 必须过"。两条必须成对出现。技术附录中每个 after 文本都已保证成对。

### 风险 2：改了 canonical 忘了 sync

`.claude/agents/` 和 `.opencode/agents/` 是 Claude Code / OpenCode 实际加载的文件。如果改了 `doc/agents/*.md` 但忘了跑 `sync-agents.js`，运行时 agent 仍用旧规则——audit-agent 的同步一致性检查会判 ❌。**任务 7 是硬性必做，任务 8 是验收必过。**

### 风险 3：削弱 DB 护栏 / 生产库污染回归

历史上发生过 M2 生产库污染事故（执行代理退守 prod 容器跑测试）。本轮改"本地 Docker 可跳过"时，**绝对不能顺手放宽"禁用生产容器"**。技术附录中每条改动的 after 文本都显式保留"禁止 `docker exec wrong-notebook npx vitest` 或任何生产容器测试"。

### 风险 4：与已有决策台账冲突

`doc/DECISIONS.md` 中 D-10（prod/test 容器分离）、D-11（test:all 聚合）、Gate-4（测试必须在测试容器跑）**全部保留，不削弱**。本轮只是改"在哪里跑"，不是改"跑不跑"或"用什么库跑"。执行方若发现改动后与这三条决策产生字面冲突，停下来报告，不要自行解释。

### 风险 5：上游文件修改标注

本轮不涉及 wrong-notebook 上游文件（`AGENTS.md`、`doc/agents/*`、`doc/reference/*` 均为本项目自建文件），无需 `⚠️上游文件修改` 标注。

---

## 6. 技术附录（精确改动串）

> 执行方按下列 before/after 逐条替换即可。`before` = 当前文件中的精确字符串（已逐字核对），`after` = 替换后的文本。**严禁改动 before/after 之外的任何字符。** 若某 before 串搜不到（可能因 CRLF/空格），停下报告，不要猜测替换。

---

### 改动点 A：`AGENTS.md`（§部署发布门禁）

#### A.1 — 新增"测试与部署门禁（CI 镜像路线）"小节

**位置**：在 `### 服务器默认只部署 main` 小节之后、`### dev 合入 main 前必须完成发布候选验证` 小节之前插入。

**锚点 before（A.1 插入点——紧贴此行之后插入新小节）**：
```
- 临时部署 `dev` 必须经用户明确确认，并在执行日志中标注"临时例外"。

### dev 合入 main 前必须完成发布候选验证
```

**after（把上面整段替换为：原"临时例外"行 + 新小节 + 原标题行）**：
```
- 临时部署 `dev` 必须经用户明确确认，并在执行日志中标注"临时例外"。

### 测试与部署门禁（CI 镜像路线）
当前部署路线：本地推代码 → GitHub Actions 构建 + 跑测试容器 + 打镜像 → 推 GHCR → 服务器 pull 运行。在此路线下：
- **本地 Docker Desktop 不再作为上线前置门禁**。Windows 本地 Docker 不稳定，不因本地 Docker 不可用而阻塞 commit/push。
- **本地开发阶段必须优先保证**：`npm.cmd run build` 通过；相关窄范围测试可跑则跑（能跑是加分项，不能跑不挡路）；`git status` 干净。
- **测试容器门禁保留，但强制执行位置改为 GitHub Actions**。CI 中必须运行：
  - `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test`
  - `docker compose -f docker-compose.test.yml down -v`
- **GitHub Actions 测试容器失败 → 不得部署到腾讯云**。
- 本地 Docker 不可用时，执行日志必须写明："本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行"。
- **禁止用生产容器或生产数据库跑测试**（`docker exec wrong-notebook npx vitest` 一律禁止）。测试只能在 test.db 的测试容器中跑。

### dev 合入 main 前必须完成发布候选验证
```

#### A.2 — 修订"dev 合入 main 前必须完成发布候选验证"块

**before**：
```
### dev 合入 main 前必须完成发布候选验证
至少包括：
- `git status` 干净
- 本地生产构建通过：`npm.cmd run build` 或对应平台命令
- Docker 构建通过：`docker compose build --no-cache`
- 如 Docker 不可用，必须明确记录"Docker 构建未验证"，不得宣称可部署
```

**after**：
```
### dev 合入 main 前必须完成发布候选验证
至少包括：
- `git status` 干净
- 本地生产构建通过：`npm.cmd run build` 或对应平台命令
- GitHub Actions 测试容器门禁通过（CI 中 `docker-compose.test.yml` 退出码 0）
- 部署镜像来自 GitHub Actions 成功构建，不来自本地 Docker
- 如本地 Docker 可用，本地测试容器通过是加分项；如不可用，执行日志写明"本地未跑，门禁交由 CI"
```

> 说明：删除原"如 Docker 不可用，必须明确记录'Docker 构建未验证'，不得宣称可部署"——因为该措辞会让本地 Docker 重新成为硬门禁，与本轮目标冲突。新措辞把"可部署"的判定权交给 CI。

---

### 改动点 B：`doc/agents/execute-agent.md`

#### B.1 — 修订"完成状态"清单

**before**：
```
## 完成状态
- [ ] 所有任务完成
- [ ] 代码已提交（commit: <hash>）
- [ ] `test:all` 通过（`docker compose -f docker-compose.test.yml up --abort-on-container-exit` 退出码 0）
- [ ] 确认测试在安全路径运行（`./data/test/test.db` 被更新，`./data/dev.db` 未被触碰）
- [ ] 可进入审计阶段
```

**after**：
```
## 完成状态
- [ ] 所有任务完成
- [ ] 代码已提交（commit: <hash>）
- [ ] 本地 `npm.cmd run build` 通过
- [ ] 本地相关窄范围测试已运行，或明确说明未运行原因
- [ ] 测试容器门禁通过（二选一）：
  - 本地 Docker 可用时：本地运行 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` 退出码 0
  - 本地 Docker 不可用时：执行日志写明"本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行"
- [ ] GitHub Actions 测试容器通过后，才允许部署
- [ ] 确认测试在安全路径运行：CI 或本地测试容器使用 test.db（`./data/test/test.db` 被更新），`./data/dev.db` 未被触碰
- [ ] 可进入审计阶段
```

#### B.2 — 修订工作流 #5

**before**：
```
5. **测试必须走测试容器**：`docker exec wrong-notebook npx vitest` 是禁止的——
   测试只能在 `docker compose -f docker-compose.test.yml up` 中运行。
   测试容器有 bug 就修测试容器，不能退而用 prod 容器
6. **新增 `test:*` 脚本时，同步更新 `test:all`**：`package.json` 的 `test:all` 是 compose 命令的唯一入口
```

**after**：
```
5. **测试必须走测试容器**：`docker exec wrong-notebook npx vitest` 是禁止的——
   测试只能在 `docker compose -f docker-compose.test.yml up` 中运行。
   测试容器有 bug 就修测试容器，不能退而用 prod 容器。
   **本地 Docker 不可用时**：不要无限排障。记录原因（如"Starting Engine 卡死"），
   停止本地 Docker 排障，把测试容器门禁交给 GitHub Actions 执行。
   但门禁交给 CI ≠ 允许用生产容器，`docker exec` 进 prod 容器跑测试始终禁止。
6. **新增 `test:*` 脚本时，同步更新 `test:all`**：`package.json` 的 `test:all` 是 compose 命令的唯一入口
```

---

### 改动点 C：`doc/agents/audit-agent.md`

#### C.1 — 修订"测试"小节

**before**：
```
### 测试
- [ ] 如存在相关自动化测试：已运行且全部通过（有测试就必须跑、必须过）
- [ ] 确认测试在安全路径运行：执行日志中最后一次成功测试经 docker-compose.test.yml 跑，写入 ./data/test/test.db，./data/dev.db 未被触碰
- [ ] DB 护栏断言（src/__tests__/setup/guard-db.ts）存在且生效
- [ ] 如不存在相关测试：已列出建议的手动验证步骤（见"用户验证指南"）
```

**after**：
```
### 测试
- [ ] 本地 `npm.cmd run build` 通过
- [ ] 本地 Docker 可用时：本地测试容器已通过（`docker-compose.test.yml` 退出码 0）
- [ ] 本地 Docker 不可用时：执行日志已明确记录原因，且 GitHub Actions 测试容器通过
- [ ] GitHub Actions 日志显示 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` 退出码 0
- [ ] 测试使用 test.db（`./data/test/test.db`），未触碰生产 `./data/dev.db`
- [ ] 没有退回生产容器跑测试（无 `docker exec wrong-notebook npx vitest` 等记录）
- [ ] DB 护栏断言（src/__tests__/setup/guard-db.ts）存在且生效
- [ ] 如不存在相关自动化测试：已列出建议的手动验证步骤（见"用户验证指南"）
```

#### C.2 — 修订"部署审计"小节

**before**：
```
### 部署审计（如本轮涉及部署/发布/上线）
- [ ] 服务器部署分支是 `main`，或 `dev` 部署有用户明确批准记录
- [ ] 本地生产构建已通过
- [ ] Docker 构建已通过，或明确记录"未验证"
- [ ] 服务器 commit 与 `origin/main` 一致
- [ ] 部署前已备份 SQLite
- [ ] `.env` 未进入 git
- [ ] 没有在服务器直接热修源码的记录
- [ ] 外部状态变更均写入执行日志
- [ ] 回滚方案可执行
- [ ] 生产构建不依赖不稳定外部资源，或已有替代/降级方案
```

**after**：
```
### 部署审计（如本轮涉及部署/发布/上线）
- [ ] 服务器部署分支是 `main`，或 `dev` 部署有用户明确批准记录
- [ ] 本地生产构建已通过
- [ ] 部署镜像来自 GitHub Actions 成功构建，不来自本地 Docker
- [ ] GitHub Actions 测试容器门禁通过（CI 未通过时未部署）
- [ ] 本地 Docker 可用时本地测试容器通过是加分项；不可用时执行日志已记录
- [ ] 服务器 commit 与 `origin/main` 一致
- [ ] 部署前已备份 SQLite
- [ ] `.env` 未进入 git
- [ ] 没有在服务器直接热修源码的记录
- [ ] 外部状态变更均写入执行日志
- [ ] 回滚方案可执行
- [ ] 生产构建不依赖不稳定外部资源，或已有替代/降级方案
```

---

### 改动点 D：`doc/agents/plan-agent.md`

#### D.1 — 修订 §部署计划专项要求 的"计划必需字段"

**before**：
```
### 计划必需字段
- **部署目标分支**：只能以 `main` 为目标。如须部署 `dev`，必须在计划中写明理由并等待用户明确确认
- **构建验证命令**：列出验证本地生产构建的具体命令（如 `npm.cmd run build`）
- **Docker 验证命令**：列出 `docker compose build --no-cache`，如不可用写"未验证"
- **生产环境变量清单**：所需 `.env` 变量的完整列表
- **数据备份方案**：SQLite 备份脚本路径和执行方式
- **回滚方案**：如果部署失败如何回滚到上一个可用版本
- **外部状态变更清单**：涉及 DNS、Caddy、证书、防火墙等变更的清单
- **失败停止条件**：哪些步骤失败时必须停止部署、不得继续
```

**after**：
```
### 计划必需字段
- **部署目标分支**：只能以 `main` 为目标。如须部署 `dev`，必须在计划中写明理由并等待用户明确确认
- **构建验证命令**：列出验证本地生产构建的具体命令（如 `npm.cmd run build`）
- **本地 Docker 是否必需**：默认结论——本地 Docker **不**作为部署前置；如某轮计划因特殊原因要求本地 Docker 必跑，必须在计划中写明理由并等待用户确认
- **CI 测试容器门禁**：必须写明 GitHub Actions 中跑 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` + `down -v`，且 CI 失败即停止部署
- **生产环境变量清单**：所需 `.env` 变量的完整列表
- **数据备份方案**：SQLite 备份脚本路径和执行方式
- **回滚方案**：如果部署失败如何回滚到上一个可用版本
- **外部状态变更清单**：涉及 DNS、Caddy、证书、防火墙等变更的清单
- **失败停止条件**：哪些步骤失败时必须停止部署、不得继续
```

---

### 改动点 E：`doc/reference/docker-troubleshooting-guide.md`

#### E.1 — 顶部插入"当前策略更新"小节

**位置**：在文件标题块之后、`## 根因` 之前插入。

**锚点 before（E.1 插入点——紧贴此行之后插入新小节）**：
```
# Docker Desktop "Starting Engine" 故障排查指南

> 现象：Docker Desktop 一直显示 "Starting engine"，永不就绪。
> `docker version` / `docker info` 超时。`wsl -l -v` 无 `docker-desktop` 发行版。

---

## 根因
```

**after（把上面整段替换为：原标题块 + 新小节 + 原分隔 + 原"## 根因"）**：
```
# Docker Desktop "Starting Engine" 故障排查指南

> 现象：Docker Desktop 一直显示 "Starting engine"，永不就绪。
> `docker version` / `docker info` 超时。`wsl -l -v` 无 `docker-desktop` 发行版。

---

## 当前策略更新（CI 镜像部署后）

项目已切换到 CI 镜像部署路线（本地推代码 → GitHub Actions 构建并跑测试容器 → 推 GHCR → 服务器 pull 运行）。策略变化：

- **Docker Desktop 仍可用于本地测试容器，但不再是部署上线的硬前置条件。**
- 如果卡在 "Starting Engine"：可以按下方方案排查，但**不要让本地 Docker 长时间阻塞业务开发**。
- 若本地 `npm.cmd run build` 已通过，可将测试容器门禁交由 GitHub Actions 执行——CI 用同样的 `docker-compose.test.yml`、同样的 test.db 隔离、同样的护栏，且每次推 main 都自动跑。
- **GitHub Actions 测试容器通过前，不得部署到服务器。**
- **禁止用生产容器替代测试容器**：即便本地 Docker 起不来，也绝不可退守 `docker exec wrong-notebook npx vitest` 或对生产库跑测试。

下方排查方案仍有效，作为"本地能修就修、修不好就交 CI"的参考。

---

## 根因
```

---

### 改动点 F（可选）：`doc/INDEX.md`

#### F.1 — 刷新 docker-troubleshooting-guide 一句话描述

**before**：
```
| ✅ | [reference/docker-troubleshooting-guide.md](reference/docker-troubleshooting-guide.md) | Docker Desktop 故障排查指南（Fast Startup + 修复流程） |
```

**after**：
```
| ✅ | [reference/docker-troubleshooting-guide.md](reference/docker-troubleshooting-guide.md) | Docker Desktop 故障排查指南（Fast Startup + 修复流程 + CI 策略更新） |
```

---

### 改动点 G：同步与验证命令（必跑，无文本替换）

完成 A–F 全部编辑后，依次执行：

```bash
node scripts/sync-agents.js        # 预期输出 "Done: 6/6 files synced."
node scripts/check-agent-sync.js   # 预期输出 "OK: 3/3 agents in sync." 且 exit 0
```

若 `check-agent-sync.js` 报 MISMATCH：说明 canonical 与运行时文件正文不一致。**不要手改 `.claude/agents/` 或 `.opencode/agents/`**——重新跑 `sync-agents.js` 即可（脚本会从 canonical 重新生成正文、保留各自 YAML frontmatter）。

---

## 附：与本计划无关但需执行方知晓的不变量

以下规则**本轮没有改动、也不允许改动**，列出以防执行时误删：

- D-10（生产/测试容器分离）、D-11（test:all 聚合入口）、Gate-4（测试必须在测试容器跑）——三项决策保留。
- `src/__tests__/setup/guard-db.ts`（DB 护栏断言）保留。
- `docker-compose.test.yml` 使用 `test.db`，与 `dev.db` 隔离——保留。
- AGENTS.md 安全铁律 1–6 全部不动；§Git 收口闸门不动；§同步上游更新 不动。

> 本计划到此结束。执行方按 §2 任务分解 + §6 技术附录逐条落地，完成后走 §4 验收标准自检，再交 audit-agent 复核。
