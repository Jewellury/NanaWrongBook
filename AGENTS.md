# NanaWrongBook — 全局规则

> **本文件是项目最终权威入口。** 所有 agent 必须先读本文件。
> Claude 专属操作细节见 `CLAUDE.md`。OpenCode 运行时说明见 `OPENCODE.md`。
> 子代理角色定义 canonical 源在 `doc/agents/`。运行时加载路径：`.claude/agents/`（Claude）、`.opencode/agents/`（OpenCode）。

---

## 文档优先级

1. `AGENTS.md`（本文件）
2. `CLAUDE.md`（Claude 运行时）或 `OPENCODE.md`（OpenCode 运行时）
3. `doc/00_CURRENT.md` — 当前状态、卡在哪、下一步
4. `doc/DECISIONS.md` — 技术决策台账
5. `doc/INDEX.md` — 文档索引看板
6. `doc/active_spec.md` — 当前轮任务详情
7. `doc/progress.md` — 项目历史轨迹

如果文件之间存在冲突，以上述优先级为准。

---

## 项目定位

NanaWrongBook 是一个面向数学基础薄弱高中生的个性化诊断辅导系统。
基于 wrong-notebook（上游）fork，采用追加挂接方式扩展，不修改上游表结构。

技术栈：Next.js + Prisma + SQLite + Docker。开发 AI 用 DeepSeek，外部评审用 Claude/Codex。

详见 `doc/reference/TECH_PLAN_v2.md`（技术方案权威版）和 `doc/reference/OPS_handbook.md`（运营手册）。

---

## 三代理协作框架

本项目采用「/plan → /execute → /audit」三代理闭环。由人类手工编排，不引入 Controller agent。

| 角色 | 定位 | 写入边界 |
|------|------|----------|
| plan-agent | 计划者：设计而不是执行 | `doc/plan/`、`doc/spec/` |
| execute-agent | 执行者：按已确认计划实现代码 | 代码文件 + `doc/executionlog/` |
| audit-agent | 审计者：检查一致性和质量，只指出不修改 | `doc/auditlog/` |

子代理角色完整定义见 `doc/agents/plan-agent.md`、`doc/agents/execute-agent.md`、`doc/agents/audit-agent.md`。

Claude Code 加载路径：`.claude/agents/`。OpenCode 加载路径：`.opencode/agents/`。
斜杠命令（`/plan`、`/execute`、`/audit`）已改为 agent 委托——敲斜杠等同于 spawn 对应 agent。

## 门禁摘要

1. /plan 未经用户确认 → /execute 不得启动
2. /execute 偏离计划分两级：微调记录后继续，大偏离回 /plan
3. /audit 只指出问题、不直接改代码，须专门复核所有"偏离记录"中的微调是否真属微调
4. 审计通过 → 更新 `doc/progress.md`（追加记录）和 `doc/active_spec.md`（替换内容）

---

## 安全铁律（不可违反）

### 铁律 1：破坏性操作须确认
修改数据库结构（Prisma schema/migration）、删除文件、运行可能破坏数据的命令前，
必须停下来，用大白话向用户解释：
- 要做什么
- 有什么后果
- 有没有更安全的替代方案
等用户明确同意后再执行。

### 铁律 2：保持可回退
- 每轮正式开发前，确认 git 工作区干净（`git status`）
- 提交当前所有改动后再开始新工作
- 如果改坏了，告诉用户如何退回到上一个可用状态

### 铁律 3：不改上游表结构
绝不修改 wrong-notebook 已有的 Prisma 模型（model）。
所有新功能一律以新增 model 挂接，不改原有 model 的任何字段。

### 铁律 4：密钥不入 git
- API Key、密码、Token 等敏感信息只能放在 `.env` 文件中
- 确认 `.env` 已在 `.gitignore` 中
- 提交前检查：`git status` 确认没有 .env 被 staged
- 绝不将密钥写入代码文件、commit message、或文档

### 铁律 5：遇错停下来
遇到报错、不确定的情况、或需要做大范围改动的想法时，停下来问用户。
不自作主张做大范围改动或猜测性修复。

### 铁律 6：显式失败，不掩盖
任何步骤若被静默跳过、未验证、或结果不确定，绝不可宣称"已完成/已通过/正常"。
主动报告"这一步没做成/不确定/跳过了"，宁可多报问题不少报。
数据迁移、记录处理类操作尤甚：跳过几条、失败几条，必须明确报数。

### 高危操作特别警告：git reset --hard
`git reset --hard` 会永久丢弃改动、无法找回。这是最高危操作：
- 日常回退优先用 `git revert`（不删历史的安全方式）
- 只有万不得已才考虑 `git reset --hard`
- 执行前必须单独、明确地告诉用户"这一步会永久丢掉哪些东西"
- 等用户明确确认后再执行

---

## 代码修改准则

### 先读后写
给 wrong-notebook 已有文件或模块增加代码前，先通读相关的现有函数、导出接口、调用方。
不理解现有代码为何这样写时，先问用户再动手。"看起来跟现有代码没关系"是最危险的判断。

### 遵从既有约定
严格沿用 wrong-notebook 的现有代码风格和命名约定，即使你有不同偏好。
不另起一套新范式。确有改进建议先提出讨论，不暗中偏离。

### 暴露冲突不折中
发现代码库里两套矛盾的模式时，不和稀泥融合。明确选一个（优先更新、更经测试的），
说明选择理由，把另一个标记为待清理。

---

## Git 协作规范

### 远程配置
- `origin` = `git@github.com:Jewellury/NanaWrongBook.git`（用户的仓库，可推送）
- `upstream` = `git@github.com:wttwins/wrong-notebook.git`（对方原始仓库，只拉取不推送）

### 三分支模型
- `dev`：日常开发分支，频繁提交、推送 origin。90% 时间在这里工作
- `main`：稳定版本，只放测试通过、能跑的代码。从 dev 合入
- `sync-upstream`：临时同步分支，只在拉取上游更新时创建，用完即删

### 日常 Git 操作
- 开始开发：`git checkout dev`
- 保存进度：`git add -A && git commit -m "描述"`
- 推送到自己的 GitHub：`git push origin dev`
- dev 稳定后合入 main：`git checkout main && git merge dev && git push origin main && git checkout dev`
- 查看状态：`git status`
- 查看历史：`git log --oneline -20`

### Git 收口闸门
- 每次 task 或子任务结束后，先执行 `git status` 做收口判断，不能直接结束
- 默认规则：只要有可保留、可审计的成果，就立即提交；只有临时探索、半成品或无明确成果时，才暂缓提交
- 如果同一轮工作里有多个独立意图，必须拆成多个 commit，不能混在一起
- 收尾时必须明确输出：当前 `git status`、是否提交、为什么；若提交，再写出 commit message
- 如果当前不提交，必须说明下一次满足什么条件再提交

---

## 部署发布门禁

### 服务器默认只部署 main
- `dev` 是开发分支，不作为长期服务器部署分支。
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
至少包括：
- `git status` 干净
- 本地生产构建通过：`npm.cmd run build` 或对应平台命令
- GitHub Actions 测试容器门禁通过（CI 中 `docker-compose.test.yml` 退出码 0）
- 部署镜像来自 GitHub Actions 成功构建，不来自本地 Docker
- 如本地 Docker 可用，本地测试容器通过是加分项；如不可用，执行日志写明"本地未跑，门禁交由 CI"

### 服务器构建失败后不得现场热修
- 只能记录错误、停止部署。
- 修复必须回到本地仓库分支完成：改代码 → 提交 → 推送 → 服务器拉取。
- 不得在服务器 `/opt/nana` 中直接编辑源码绕过 Git。

### 部署前必须确认分支和 commit
每次部署日志必须记录：
- 本地分支/commit
- 远程 origin/main commit
- 服务器分支/commit
- 是否一致

### 部署前必须备份生产 SQLite
- 涉及 `docker compose build/up/down`、迁移、回滚前，必须先运行备份脚本。
- 备份失败不得继续部署。

### 生产构建不得依赖不稳定外部资源
- 如 Google Fonts、临时 CDN、国外 npm 源等。
- 若必须依赖，计划中必须说明失败降级方案。

### 外部状态变更必须写日志
- 包括服务器初始化、DNS、Caddy、证书、防火墙、`.env`、数据库备份与恢复。
- 失败时不得静默跳过。

---

### 同步上游更新（阶段性操作）

执行前先告知用户，确认后再动手。完整规程：

1. `git status` — 确保工作区干净
2. `git fetch upstream` — 下载对方最新代码（安全，只下载不合并）
3. `git log upstream/main --oneline -20` — 看看对方改了什么
4. `git checkout main && git checkout -b sync-upstream` — 在临时分支上操作
5. `git merge upstream/main` — 在临时分支尝试合并
6. **如果出现 CONFLICT**：停下来，把冲突内容用大白话解释给用户，逐处判断处理
7. 验证无问题后：`git checkout main && git merge sync-upstream`
8. 同步到 dev：`git checkout dev && git merge main`
9. 清理：`git branch -d sync-upstream`
10. 推送：`git push origin main && git push origin dev`

**铁律：绝不自动解决冲突或强制覆盖。**

### 目录原则
- 新功能优先用新文件、新目录，不改对方已有文件
- 必须修改对方已有文件时：只做最小增量添加，不重排原结构
- commit message 中标注 `⚠️上游文件修改`，方便以后追踪潜在冲突点
- 绝不重组或移动上游已有的目录结构

---

## 文档路径速查

| 文件 | 用途 | 规则 |
|------|------|------|
| `AGENTS.md` | 全局入口（本文件） | 规则变更时更新 |
| `CLAUDE.md` | Claude 运行时操作说明 | Claude 工具链变更时更新 |
| `OPENCODE.md` | OpenCode 运行时操作说明 | OpenCode 适配时更新 |
| `doc/INDEX.md` | 文档索引看板（找文件、看状态） | 新增/移动文件时更新 |
| `doc/00_CURRENT.md` | 当前项目整体状态（冷启动第一站） | 状态变化时更新 |
| `doc/DECISIONS.md` | 技术决策台账（为什么选 A 不选 B） | 新决策产生时追加 |
| `doc/spec/` | 技术规格 | 长期保留 |
| `doc/plan/` | 实施计划 | 长期保留，每轮一份 |
| `doc/executionlog/` | 执行日志 | 长期保留，每轮一份 |
| `doc/auditlog/` | 审计报告 | 长期保留，每轮一份 |
| `doc/progress.md` | 项目全程历史轨迹 | 只增不减 |
| `doc/active_spec.md` | 当前活跃任务 | 每轮替换 |
| `doc/agents/` | 子代理角色 canonical 正文 | 角色规则变更时改 → 跑 `node scripts/sync-agents.js` |

## 权威技术文档（必读）

任何开发任务开始前，三个代理**必须**先阅读以下文档理解项目全貌：

### 入口层（先读这些，找方向）

| 文档 | 内容 | 何时读 |
|------|------|--------|
| [doc/00_CURRENT.md](doc/00_CURRENT.md) | 冷启动第一站：当前状态、下一步、交接 | **每个新会话开始时** |
| [doc/DECISIONS.md](doc/DECISIONS.md) | 技术决策台账：为什么选 A、什么还开着 | 做架构相关决定前 |
| [doc/INDEX.md](doc/INDEX.md) | 文档索引看板：有哪些文档、各自什么状态 | 需要找文件时 |

### 核心参考（每轮开始前必读）

| 文档 | 内容 | 何时读 |
|------|------|--------|
| [doc/reference/TECH_PLAN_v2.md](doc/reference/TECH_PLAN_v2.md) | 技术方案权威版：战略定位、知识图谱、诊断引擎、BKT追踪、AI管线、开发路线图 | 每轮开始前 |
| [doc/reference/OPS_handbook.md](doc/reference/OPS_handbook.md) | 运营手册：共创者框架、医生模式、上线SOP、前台措辞铁律、主次铁律 | 每轮开始前 |

这些文档已索引到 context-mode 知识库（source: `TECH_PLAN_v2` / `OPS_handbook`），
可用 `ctx_search` 按关键词快速检索，无需每次全文重读。

---

## 新会话启动规则

每个新会话开始时，所有 Agent 必须先读取：

1. `AGENTS.md`
2. `doc/00_CURRENT.md`
3. `doc/active_spec.md`

如果是开发任务，还须读取 `doc/reference/TECH_PLAN_v2.md` 和 `doc/reference/OPS_handbook.md`。

---

## Agent 同步机制

修改 `doc/agents/*.md`（canonical）后，必须运行：

```bash
node scripts/sync-agents.js         # 同步正文到 .claude/agents/ 和 .opencode/agents/
node scripts/check-agent-sync.js    # 验证一致性（exit 0 = 一致）
```

禁止直接修改 `.claude/agents/` 或 `.opencode/agents/` 中的规则正文。这两个目录的正文必须始终与 canonical 一致。

---

> 最后更新：2026-06-19
