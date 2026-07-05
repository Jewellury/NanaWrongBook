# Claude Code 运行时说明

> **本文件是 Claude Code 运行时补充，权威低于 `AGENTS.md`。**
> 全局规则（项目定位、安全铁律、代码准则、Git 规范、三代理框架、文档路径）见 `AGENTS.md`。
> OpenCode 运行时见 `OPENCODE.md`。

## 子代理路径

Claude Code 加载子代理定义来自 `.claude/agents/`。规则 canonical 源在 `doc/agents/`。
修改角色规则 → 改 `doc/agents/` → 跑 `node scripts/sync-agents.js`。

斜杠命令（`.claude/commands/`）已改为 agent 委托——敲 `/plan`、`/execute`、`/audit` 等同于 spawn 对应 agent。

## 启动阅读顺序

1. `AGENTS.md` — 全局入口
2. `doc/00_CURRENT.md` — 当前状态
3. `doc/active_spec.md` — 当前任务
4. 按需：`doc/reference/TECH_PLAN_v2.md` + `doc/reference/OPS_handbook.md`

---

# context-mode — Mandatory Routing Rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## Blocked Commands — Do NOT Attempt

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

## Redirected Tools — Use Sandbox Equivalents

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

## Tool Selection Hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent Routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output Constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx Commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

---

# 长任务执行规范 — Mandatory

> 以下规则解决一个反复出现的问题：脚本/API 调用跑完后结果已落盘，但 agent 未主动收件、未报告、未推进，导致长时间空转。

## 规则 1：长任务前台等待，跑完同轮收件

- 跑脚本、API 调用、构建、测试套件时，**默认前台等待**，不用后台模式（除非用户明确要求后台）
- 脚本跑完 → **同一轮工具调用内**立即读结果文件 → 分析 → 报告给用户
- 禁止出现"脚本跑完了但报告在下一轮才出"的断档

## 规则 2：对话恢复时先扫文件系统，不信任摘要

- 对话被压缩/恢复后，摘要中的"尚未执行/进行中"描述**可能过时**
- 恢复后第一步：检查相关输出文件是否已存在（`ls` / `Get-Item` / `glob_file_search`）
- 如果输出文件已存在且非空 → 直接读结果，跳过执行步骤，立即报告
- 文件系统不会撒谎，摘要会

## 规则 3：Todo 状态与文件系统挂钩

- 脚本启动 → todo 标 `in_progress`
- 输出文件出现且非空 → **立即**标 `completed`，不等下一轮
- 禁止"文件已生成但 todo 还在 pending/in_progress"

## 规则 4：每个 in_progress todo 必须声明完成标志

- 标记 todo 为 `in_progress` 时，在 content 里写明"完成标志 = XXX 文件存在/命令退出码 0/..."
- 达到标志 → 立即推进到下一步，不停顿
- 如果不确定完成标志是什么，说明任务定义不够清晰，先问用户

---

# PowerShell 终端避坑规则

> 本项目开发环境为 Windows，终端实际是 PowerShell（非 cmd）。CatPaw 的终端工具底层调用 PowerShell，导致部分 cmd/bash 习惯写法会报错。以下规则避免重复踩坑。

## 铁律：每条命令单独执行，不用 && 链式拼接

PowerShell 5.x（Windows 10 默认）**不支持 `&&`**。以下写法会报错：

```
❌ cd /d e:\nana && git status          → "标记 && 不是有效语句分隔符"
❌ git add . && git commit -m "..."     → 同上
```

**正确做法**：拆成多条命令分别执行，或用 `;` 分隔（PowerShell 语法）：

```
✅ git add doc/INDEX.md                 → 单独执行
✅ git commit -m "描述"                  → 单独执行
✅ git status                           → 单独执行
```

> 如果必须一条命令完成多步，用 `;` 而非 `&&`。但**推荐拆开执行**，更清晰、更安全。

## 铁律：commit message 不用括号

PowerShell 会把括号 `()` 当子表达式解析。以下写法会报错：

```
❌ git commit -m "docs(r4): 修订内容"   → "无法将 r4 项识别为 cmdlet"
❌ git commit -m "feat(core): 新功能"   → 同上
```

**正确做法**：去掉括号，用空格或短横替代：

```
✅ git commit -m "docs r4: 修订内容"
✅ git commit -m "feat core: 新功能"
✅ git commit -m "docs: r4 推演修订"
```

## 铁律：不用 cd /d，直接用工作目录

PowerShell 不识别 `cd /d`（这是 cmd 专属语法）。CatPaw 终端默认工作目录已是 `e:\nana`，不需要 cd：

```
❌ cmd /c "cd /d e:\nana && git status" → 多层转义容易出问题
✅ git status                           → 直接执行，工作目录已正确
```

## 已知偶发问题：shell integration 延迟

VS Code shell integration 偶尔会出现 `shell_integration_warning: did not start within 5 seconds`，导致命令看起来"卡住"或"无输出"。

**处理方式**：直接重试同一条命令即可，不需要修改命令本身。这不是命令错误，是终端集成层的时序问题。

## 速查表

| 场景 | ❌ 错误写法 | ✅ 正确写法 |
|------|-----------|-----------|
| 多命令拼接 | `cmd1 && cmd2` | 拆开分别执行，或用 `;` |
| commit message 含括号 | `-m "docs(r4): ..."` | `-m "docs r4: ..."` |
| 切换目录 | `cd /d e:\nana` | 不需要（默认就在 e:\nana） |
| cmd 包装 | `cmd /c "cd /d ... && ..."` | 直接执行 PowerShell 命令 |

---

# 文件编辑工具避坑规则

> 以下规则解决一个反复出现的问题：`string_replace`、`MultiEdit`、`write` 在处理大段含中文、`$transaction`、模板字符串、方括号路径 `[id]` 的代码时，返回 `"undefined" is not valid JSON` 错误，导致编辑卡死。

## 铁律：优先用 patch，不要大段 string_replace

小改动（单行、几行、局部函数替换）用 `string_replace` 可以。但**大段代码（超过 ~15 行）尤其是包含以下元素的，禁止用 `string_replace` / `MultiEdit` / `write` 整文件覆写**：

- 中文字符
- 模板字符串（反引号）
- `$` 符号（如 `prisma.$transaction`）
- JSON 序列化内容
- 方括号路径 `[id]`

**替代方案**：创建 `.patch` 文件 → `git apply` 应用。

## 铁律：大改动拆成多个小 patch

每个 patch 只做一个意图：
1. 先改函数签名
2. 再改事务包裹
3. 再改内部 `prisma.` → `tx.`
4. 再补测试

每个 patch 应用后立即验证（`git diff` 确认），失败了容易定位。

## 铁律：不要用 PowerShell 内联脚本写复杂文件

`node -e "..."` 在 PowerShell 里遇到引号、反斜杠、中文、模板字符串很容易被截断或转义错。

如果必须脚本化，优先写临时 `.js` 文件再执行，**但用完必须清理临时文件**。

## 铁律：测试文件追加大块用"锚点 patch"

不要整文件覆写。找稳定锚点（如最后一个 `});` 前），用 patch 在锚点附近插入新测试。

## 铁律：文件改到半状态时先停下来盘点

如果一次编辑失败，文件可能处于半修改状态。**不要继续盲改**：

1. 先 `git diff` 看当前状态
2. 明确列出：哪些已改成功、哪些还没改
3. 如果混乱，`git checkout -- <file>` 回退到已提交版本重来

## 铁律：改完马上跑窄测试

```powershell
$env:DATABASE_URL='file:./data/test/test.db'
npx.cmd vitest run src/__tests__/integration/nana/process-api.test.ts
```

先让相关测试绿，再跑 `npm.cmd run build`。

## 速查表

| 场景 | ❌ 错误做法 | ✅ 正确做法 |
|------|-----------|-----------|
| 改 15+ 行含中文/`$`/反引号的代码 | 大段 `string_replace` | 写 `.patch` 文件 → `git apply` |
| 整文件重写 | `write` 覆写 | 拆成多个小 patch 逐个应用 |
| 写复杂 JS 脚本 | `node -e "..."` 内联 | 写临时 `.js` 文件，执行后清理 |
| 文件改到一半失败 | 继续盲改 | `git diff` 盘点 → 必要时 `git checkout` 重来 |
| 测试追加 100+ 行 | `write` 整文件 | 锚点 patch 在 `});` 前插入 |
| 改完验证 | 直接跑 `npm run build` | 先跑窄测试 `vitest run <具体文件>` |
