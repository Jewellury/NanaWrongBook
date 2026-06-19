# fof-semantic-query-mvp 双运行时架构审计笔记（已更新）

> 更新日期: 2026-06-20
> 原始发现: 2026-06-19（nana 项目 OpenCode 双运行时方案调研）
> 本次更新: nana 项目已完成 Claude + OpenCode 双侧实跑验证
> 目标项目: `E:\FOFLocal\FOFDataMapping\fof-semantic-query-mvp`

---

## 已验证结论（nana 实测通过）

### Claude Code 侧

- `.claude/agents/*.md` **会被 Claude Code 在会话启动时加载并注册为 agent type**——前提是文件必须有 YAML frontmatter（`name`、`description`、`model`、`color`、`tools` 等字段）
- 用户自然语言说"请派 XX agent"→ Claude Code 通过 Agent tool spawn 对应子代理 → agent 按定义正文执行
- 无 YAML frontmatter 的文件被静默跳过——这就是参考项目中 `.claude/agents/` 文件从未被注册为 agent type 的原因（它们都缺 frontmatter）

### OpenCode 侧

- `.opencode/agents/*.md` **会被 OpenCode 自动加载并注册为 agent type**——需要 YAML frontmatter（`description`、`mode`、`temperature`、`steps`、`permission` 等字段）
- 自然语言 spawn 在 OpenCode 侧同样可用

### 关键纠正

| 之前的假设 | 实际行为 |
|-----------|---------|
| `.claude/agents/` 不被 Claude Code 识别 | **被识别**，只需 YAML frontmatter |
| 参考项目的 `.claude/agents/` 是 prompt 模板存储 | 确认。它们缺 frontmatter，Claude Code 不加载它们。参考项目用 Controller 手动读文件 + 注入通用子代理 |
| `.opencode/agents/` 薄包装不工作 | 确认。FOFCode 的 YAML frontmatter + 完整正文格式才是正确做法 |

---

## 发现的问题（保留原分析）

### 1. `.opencode/agents/` 是空壳，OpenCode 侧从未验证

四个文件内容完全一致，只写了：

```markdown
> **Canonical source:** `docs/agents/xxx-agent.md`
> **Runtime:** OpenCode
> 本文件为 OpenCode 运行时适配层。规则本体在 canonical 源，此处可追加 OpenCode 特定补充。

（OpenCode 特定 Prompt Template 调整待真正切换时追加）
```

**问题**：
- OpenCode agent 文件缺少 YAML frontmatter（`mode`/`description`/`permission` 等），OpenCode 不会加载
- 文件没有 agent 角色正文，即使被加载 agent 也拿不到指令
- nana 已实测：必须 YAML frontmatter + 完整正文，薄包装不可行

### 2. `.claude/agents/` 缺 YAML frontmatter —— **这是根因**

参考项目四份 `.claude/agents/*.md` 文件都没有 YAML frontmatter（`name`/`description`/`model`/`tools`）。
Claude Code 在启动时看到这些文件，但因为不符合 agent 定义格式而跳过。
这就是为什么参考项目需要 Controller agent 手动读取这些文件并注入通用子代理——不是设计选择，是格式缺失导致的不得已。

**修正路径**：给 `.claude/agents/*.md` 补 YAML frontmatter，参考 nana 格式：
```yaml
---
name: plan-agent
description: 计划代理——设计而不是执行...
model: inherit
color: blue
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task", "WebFetch", ...]
---
```

### 3. `docs/agents/` 和 `.claude/agents/` 的输出路径模板不一致

`docs/agents/plan-agent.md`（canonical）写道：
```
task_records/specs/TASK-XX_<short_name>.md
task_records/plans/TASK-XX_<short_name>_plan.md
```

`.claude/agents/plan-agent.md`（Claude 加载层）写道：
```
task_records/specs/YYYYMMDD_{TASK-XX}_{short_name}.md
task_records/plans/YYYYMMDD_{TASK-XX}_{short_name}_plan.md
```

canonical 版本缺少 `YYYYMMDD_` 日期前缀。已出现无声分叉。

### 4. 四代理模型 vs OpenCode 侧的 Controller 路径未定义

`AGENTS.md` 描述了 Plan/Execute/Audit/Controller 四角色协作。OpenCode 侧的 controller-agent.md 和其他三个一样是空壳。谁来当 Controller 未明确。

---

## 修正建议（按优先级）

### 建议 1（P0）：给 `.claude/agents/` 补 YAML frontmatter

这是最高优先级。当前参考项目的 Claude 侧 agent 实际不可用（无 frontmatter → 不注册）。
参照 nana 项目的 [.claude/agents/plan-agent.md](file://e:/nana/.claude/agents/plan-agent.md) 格式补全。

### 建议 2（P0）：给 `.opencode/agents/` 写真正的 agent 文件

参照 FOFCode 的 YAML frontmatter 格式 + 完整正文。不再空壳。

### 建议 3（P1）：建立同步治理

nana 项目已实现 `scripts/sync-agents.js` + `scripts/check-agent-sync.js`——从 `doc(s)/agents/` 同步正文到两个运行时加载目录，各自保留 YAML frontmatter。参考项目可借鉴。

### 建议 4（P1）：修复 canonical 与 Claude 加载层的模板差异

以 `YYYYMMDD_` 版本为准统一两处模板。

### 建议 5（P2）：明确 Controller 在 OpenCode 侧的定位

如果人类当 Controller → 删除 `.opencode/agents/controller-agent.md`。
如果 AI 当 Controller → 写完整 agent 定义（含 YAML frontmatter）。

---

## nana 项目参考文件

| 文件 | 说明 |
|------|------|
| [AGENTS.md](file://e:/nana/AGENTS.md) | 全局入口 |
| [CLAUDE.md](file://e:/nana/CLAUDE.md) | Claude 运行时说明 |
| [OPENCODE.md](file://e:/nana/OPENCODE.md) | OpenCode 运行时说明 |
| [doc/agents/plan-agent.md](file://e:/nana/doc/agents/plan-agent.md) | canonical 正文（无 frontmatter） |
| [.claude/agents/plan-agent.md](file://e:/nana/.claude/agents/plan-agent.md) | Claude 加载层（YAML + 正文） |
| [.opencode/agents/plan-agent.md](file://e:/nana/.opencode/agents/plan-agent.md) | OpenCode 加载层（YAML + 正文） |
| [scripts/sync-agents.js](file://e:/nana/scripts/sync-agents.js) | 同步脚本 |
| [scripts/check-agent-sync.js](file://e:/nana/scripts/check-agent-sync.js) | 一致性检查脚本 |
| [doc/plan/opencode-dual-runtime-plan.md](file://e:/nana/doc/plan/opencode-dual-runtime-plan.md) | 完整方案文档 |
