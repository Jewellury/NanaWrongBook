# Dual Runtime Agent Loading Decision

**Date**: 2026-06-20  
**Status**: active  
**Topic**: Claude Code 与 OpenCode 的 agent 加载机制分离与 canonical 共享

## 背景

经过实测和调研，项目最终确认：

- Claude Code 与 OpenCode 不是同一套 agent 注册机制。
- `.claude/agents/*.md` 与 `.opencode/agents/*.md` 都是各自 runtime 的加载层。
- 角色正文应统一保存在 `doc/agents/*.md`，作为 canonical source。
- runtime 文件必须带各自要求的 YAML frontmatter，否则可能不会被加载。

## 决策

1. `doc/agents/*.md` 作为唯一 canonical 角色正文。
2. `.claude/agents/*.md` 作为 Claude Code runtime layer，使用 Claude 所需的 YAML frontmatter。
3. `.opencode/agents/*.md` 作为 OpenCode runtime layer，使用 OpenCode 所需的 YAML frontmatter。
4. canonical 变更后必须运行 `node scripts/sync-agents.js`。
5. 同步后必须运行 `node scripts/check-agent-sync.js` 验证一致性。
6. `CLAUDE.md` 与 `OPENCODE.md` 只承担各自 runtime 的路由和补充说明，不承担跨 runtime 的统一注册职责。

## 影响

- 修改 agent 角色时，只改 `doc/agents/*.md`。
- 运行时文件不应手工维护正文分叉。
- 新项目如果采用同样架构，可以直接复用这套 bootstrap 和同步脚本。
- 若 loader contract 发生变化，优先重新验证 frontmatter 规范，再考虑改正文。

## 复查条件

当出现以下情况时，需要重新评估该决策：

- runtime 加载规则发生变化。
- 新版本 Claude Code 或 OpenCode 改变了 agent 目录或 frontmatter 规范。
- 同步脚本不能再直接复用，或验证脚本出现系统性误报。
