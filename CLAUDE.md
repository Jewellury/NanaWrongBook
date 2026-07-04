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
