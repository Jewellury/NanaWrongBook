<!-- 
  规则优先级（从高到低）：
  安全铁律 > 三代理门禁 > Git 协作规范
  当规则互相冲突时，高优先级覆盖低优先级。
-->

# 三代理协作开发规范

本项目采用「/plan → /execute → /audit」三代理闭环。

- `/plan <需求>` — 启动计划代理，输出 `doc/plan/<feature>-plan.md`
- `/execute <计划名>` — 启动执行代理，输出 `doc/executionlog/<feature>-log.md`
- `/audit <计划名>` — 启动审计代理，输出 `doc/auditlog/<feature>-audit.md`

完整规则和产出模板在命令文件中：
- `.claude/commands/plan.md`
- `.claude/commands/execute.md`
- `.claude/commands/audit.md`

## 文档路径速查

| 文件 | 用途 | 规则 |
|------|------|------|
| `doc/INDEX.md` | 文档索引看板（找文件、看状态） | 新增/移动文件时更新 |
| `doc/00_CURRENT.md` | 当前项目整体状态（冷启动第一站） | 状态变化时更新 |
| `doc/DECISIONS.md` | 技术决策台账（为什么选 A 不选 B） | 新决策产生时追加 |
| `doc/spec/` | 技术规格 | 长期保留 |
| `doc/plan/` | 实施计划 | 长期保留，每轮一份 |
| `doc/executionlog/` | 执行日志 | 长期保留，每轮一份 |
| `doc/auditlog/` | 审计报告 | 长期保留，每轮一份 |
| `doc/progress.md` | 项目全程历史轨迹 | 只增不减 |
| `doc/active_spec.md` | 当前活跃任务 | 每轮替换 |

## 权威技术文档（必读）

任何开发任务（/plan → /execute → /audit）开始前，三个代理**必须**先阅读以下文档理解项目全貌：

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

## 门禁摘要

1. /plan 未经用户确认 → /execute 不得启动
2. /execute 偏离计划分两级：微调记录后继续，大偏离回 /plan
3. /audit 只指出问题、不直接改代码，须专门复核所有"偏离记录"中的微调是否真属微调
4. 审计通过 → 更新 `doc/progress.md`（追加记录）和 `doc/active_spec.md`（替换内容）

---

# 安全铁律（不可违反）

## 铁律 1：破坏性操作须确认
修改数据库结构（Prisma schema/migration）、删除文件、运行可能破坏数据的命令前，
必须停下来，用大白话向用户解释：
- 要做什么
- 有什么后果
- 有没有更安全的替代方案
等用户明确同意后再执行。

## 铁律 2：保持可回退
- 每轮正式开发前，确认 git 工作区干净（`git status`）
- 提交当前所有改动后再开始新工作
- 如果改坏了，告诉用户如何退回到上一个可用状态

## 铁律 3：不改上游表结构
绝不修改 wrong-notebook 已有的 Prisma 模型（model）。
所有新功能一律以新增 model 挂接，不改原有 model 的任何字段。

## 铁律 4：密钥不入 git
- API Key、密码、Token 等敏感信息只能放在 `.env` 文件中
- 确认 `.env` 已在 `.gitignore` 中
- 提交前检查：`git status` 确认没有 .env 被 staged
- 绝不将密钥写入代码文件、commit message、或文档

## 铁律 5：遇错停下来
遇到报错、不确定的情况、或需要做大范围改动的想法时，停下来问用户。
不自作主张做大范围改动或猜测性修复。

## 铁律 6：显式失败，不掩盖
任何步骤若被静默跳过、未验证、或结果不确定，绝不可宣称"已完成/已通过/正常"。
主动报告"这一步没做成/不确定/跳过了"，宁可多报问题不少报。
数据迁移、记录处理类操作尤甚：跳过几条、失败几条，必须明确报数。

## 高危操作特别警告：git reset --hard
`git reset --hard` 会永久丢弃改动、无法找回。这是最高危操作：
- 日常回退优先用 `git revert`（不删历史的安全方式）
- 只有万不得已才考虑 `git reset --hard`
- 执行前必须单独、明确地告诉用户"这一步会永久丢掉哪些东西"
- 等用户明确确认后再执行

---

# 代码修改准则

## 先读后写
给 wrong-notebook 已有文件或模块增加代码前，先通读相关的现有函数、导出接口、调用方。
不理解现有代码为何这样写时，先问用户再动手。"看起来跟现有代码没关系"是最危险的判断。

## 遵从既有约定
严格沿用 wrong-notebook 的现有代码风格和命名约定，即使你有不同偏好。
不另起一套新范式。确有改进建议先提出讨论，不暗中偏离。

## 暴露冲突不折中
发现代码库里两套矛盾的模式时，不和稀泥融合。明确选一个（优先更新、更经测试的），
说明选择理由，把另一个标记为待清理。

---

# Git 协作规范

## 远程配置
- `origin` = `git@github.com:Jewellury/NanaWrongBook.git`（用户的仓库，可推送）
- `upstream` = `git@github.com:wttwins/wrong-notebook.git`（对方原始仓库，只拉取不推送）

## 三分支模型
- `dev`：日常开发分支，频繁提交、推送 origin。90% 时间在这里工作
- `main`：稳定版本，只放测试通过、能跑的代码。从 dev 合入
- `sync-upstream`：临时同步分支，只在拉取上游更新时创建，用完即删

## 日常 Git 操作
- 开始开发：`git checkout dev`
- 保存进度：`git add -A && git commit -m "描述"`
- 推送到自己的 GitHub：`git push origin dev`
- dev 稳定后合入 main：`git checkout main && git merge dev && git push origin main && git checkout dev`
- 查看状态：`git status`
- 查看历史：`git log --oneline -20`

## 同步上游更新（阶段性操作）

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

## 目录原则
- 新功能优先用新文件、新目录，不改对方已有文件
- 必须修改对方已有文件时：只做最小增量添加，不重排原结构
- commit message 中标注 `⚠️上游文件修改`，方便以后追踪潜在冲突点
- 绝不重组或移动上游已有的目录结构

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
