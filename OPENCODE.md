# OpenCode 运行时说明

> **本文件是 OpenCode 运行时补充，权威低于 `AGENTS.md`。**
> 全局规则（项目定位、安全铁律、代码准则、Git 规范、三代理框架、文档路径）见 `AGENTS.md`。
> Claude Code 运行时见 `CLAUDE.md`。

## Agent 规则

Agent 规则 canonical 源在 `doc/agents/`（运行时中立）。OpenCode 加载路径为 `.opencode/agents/`。

修改角色规则 → 改 `doc/agents/` → 跑 `node scripts/sync-agents.js`。

切运行时只需确保 `.opencode/agents/` 的正文与 canonical 一致，规则本体无需修改。

## 与 Claude Code 的差异

- `CLAUDE.md` 中的 `## context-mode — Mandatory Routing Rules` 为 Claude Code / MCP 专属功能，OpenCode 不适用。OpenCode 的 sandbox 等效能力应通过其自身的工具选择层次实现。
- `CLAUDE.md` 中的 `## ctx commands`（ctx stats / ctx doctor / ctx upgrade）为 Claude Code MCP 专属。

## 启动阅读顺序

1. `AGENTS.md` — 全局入口（运行时无关）
2. `doc/00_CURRENT.md` — 当前状态
3. `doc/active_spec.md` — 当前任务
4. 按需：`doc/reference/TECH_PLAN_v2.md` + `doc/reference/OPS_handbook.md`
