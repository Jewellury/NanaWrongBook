# 新项目双运行时 Agent 出厂配置指南

> 版本: v1.0（基于 nana 项目 Claude + OpenCode 双侧实跑验证）
> 最后更新: 2026-06-20
> 适用范围: 新项目需要同时支持 Claude Code 和 OpenCode 子代理

---

## 1. 核心原理

Claude Code 和 OpenCode 各自有独立的子代理注册机制，不可互通，但可以共享同一套 canonical 角色正文。

| 运行时 | 注册目录 | 注册方式 | 关键字段 |
|--------|---------|---------|---------|
| Claude Code | `.claude/agents/*.md` | 会话启动时自动加载 YAML frontmatter + 正文 | `name`, `description`, `model`, `color`, `tools` |
| OpenCode | `.opencode/agents/*.md` | 启动时自动加载 YAML frontmatter + 正文 | `description`, `mode`, `temperature`, `steps`, `permission` |

**两端 frontmatter 格式不同**——Claude 用 `model: inherit` + `tools` 数组，OpenCode 用 `mode: primary/subagent` + `permission` 映射。

**正文必须相同**——同一套角色定义（职责、门禁、工作流、输出模板）。这是"同一套开发规范"的含义。

---

## 2. 目录结构

```text
# === 运行时无关（全局权威） ===
AGENTS.md                          # 全局入口：项目约束、文档优先级、安全铁律、agent 速览
CLAUDE.md                          # Claude 运行时说明（context-mode 路由等 Claude 专属内容）
OPENCODE.md                        # OpenCode 运行时说明（启动顺序、与 Claude 的差异）
doc/agents/                        # canonical 正文（纯 markdown，无 YAML frontmatter）
  plan-agent.md
  execute-agent.md
  audit-agent.md

# === Claude Code 加载层 ===
.claude/agents/                    # 每文件 = Claude YAML frontmatter + 正文
  plan-agent.md
  execute-agent.md
  audit-agent.md

# === OpenCode 加载层 ===
.opencode/agents/                  # 每文件 = OpenCode YAML frontmatter + 正文
  plan-agent.md
  execute-agent.md
  audit-agent.md

# === 向后兼容（可选） ===
.claude/commands/                  # 斜杠命令，内容改为 agent 委托
  plan.md                          #   "请 spawn plan-agent..."
  execute.md
  audit.md

# === 同步脚本 ===
scripts/
  sync-agents.js                   # 从 canonical 同步正文到两个运行时加载层
  check-agent-sync.js              # 验证运行时正文与 canonical 一致
```

---

## 3. 文件内容模板

### 3.1 `AGENTS.md`（全局入口）

```markdown
# <项目名> — 全局规则

> **本文件是项目最终权威入口。** 所有 agent 必须先读本文件。
> Claude 专属操作细节见 `CLAUDE.md`。OpenCode 运行时说明见 `OPENCODE.md`。
> 子代理角色定义 canonical 源在 `doc/agents/`。

## 文档优先级

1. `AGENTS.md`（本文件）
2. `CLAUDE.md`（Claude 运行时）或 `OPENCODE.md`（OpenCode 运行时）
3. <项目具体文档路径>

如果文件之间存在冲突，以上述优先级为准。

## 项目定位
<项目简介>

## Agent 速览

| 角色 | 定位 | 写入边界 |
|------|------|----------|
| plan-agent | 计划者：设计而不是执行 | <产出路径> |
| execute-agent | 执行者：按已确认计划实现代码 | <产出路径> |
| audit-agent | 审计者：检查一致性和质量，只指出不修改 | <产出路径> |

子代理完整定义见 `doc/agents/plan-agent.md`、`doc/agents/execute-agent.md`、`doc/agents/audit-agent.md`。
修改角色规则 → 改 `doc/agents/` → 跑 `node scripts/sync-agents.js` → 跑 `node scripts/check-agent-sync.js`。

## 门禁
<项目门禁规则>

## 安全铁律
<安全铁律>

## 新会话启动规则

每个新会话开始时，所有 Agent 必须先读取：
1. `AGENTS.md`
2. <项目状态文件>
3. <当前任务文件>
```

### 3.2 `CLAUDE.md`（Claude 运行时说明）

```markdown
# Claude Code 运行时说明

> **本文件是 Claude Code 运行时补充，权威低于 `AGENTS.md`。**
> 全局规则见 `AGENTS.md`。

## 子代理路由

本项目有三个子代理，定义在 `.claude/agents/`，由 Claude Code 启动时自动注册。

| 触发词 | 子代理 | 职责 |
|--------|--------|------|
| "请派 plan agent" | `plan-agent` | 设计计划 |
| "请派 execute agent" | `execute-agent` | 执行实现 |
| "请派审计 agent" | `audit-agent` | 审计质量和一致性 |

当用户说以上触发词时，使用 Agent 工具 spawn 对应子代理。
修改角色规则 → 改 `doc/agents/` → 跑 `node scripts/sync-agents.js`。

## 启动阅读顺序
1. `AGENTS.md`
2. <项目状态文件>
3. <当前任务文件>

# （以下是 Claude/MCP 专属规则，如 context-mode 路由等）
```

### 3.3 `OPENCODE.md`（OpenCode 运行时说明）

```markdown
# OpenCode 运行时说明

> **本文件是 OpenCode 运行时补充，权威低于 `AGENTS.md`。**
> 全局规则见 `AGENTS.md`。Claude Code 运行时见 `CLAUDE.md`。

## Agent 规则

Agent 规则 canonical 源在 `doc/agents/`（运行时中立）。OpenCode 加载路径为 `.opencode/agents/`。
修改角色规则 → 改 `doc/agents/` → 跑 `node scripts/sync-agents.js`。

## 与 Claude Code 的差异

- `CLAUDE.md` 中的 context-mode 路由规则为 Claude/MCP 专属，OpenCode 不适用。
- OpenCode 通过 `.opencode/agents/` 的 YAML `mode` 字段控制 agent 能否 spawn 子代理。

## 启动阅读顺序
1. `AGENTS.md`
2. <项目状态文件>
3. <当前任务文件>
```

### 3.4 `doc/agents/plan-agent.md`（Canonical 正文模板）

```markdown
# plan-agent

> **Canonical source.** 本文件是 plan-agent 角色定义的唯一权威源。
> 运行时加载文件由此同步生成。修改本文件后必须运行 `node scripts/sync-agents.js`。

## 职责定位
你是**计划代理（Planner）**。你的职责是设计，不是执行。

- 你负责：需求拆解、架构设计、任务拆分、风险识别、验收标准定义
- 你产出：<产出路径>
- 你参考：<参考文档>

## 门禁（不可违反）
<门禁规则>

## 输出模板
<模板>

## 工作流
<工作流>

## 严禁事项
<严禁事项>
```

（execute-agent 和 audit-agent 同理，替换角色定义。）

### 3.5 `.claude/agents/plan-agent.md`（Claude 加载层模板）

```yaml
---
name: plan-agent
description: 计划代理——设计而不是执行。当用户说"请派 plan agent"、"plan agent 帮我"时使用。
model: inherit
color: blue
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task", "WebFetch"]
---

> **Canonical source:** `doc/agents/plan-agent.md` — 修改规则请改 canonical，再运行 `node scripts/sync-agents.js`。
> 运行时加载文件不得独立修改规则本体。

## 职责定位
（以下是 canonical 正文，由 sync-agents.js 同步，不要手动修改此处）
```

**Claude YAML 字段说明**：

| 字段 | 必填 | 说明 |
|------|:--:|------|
| `name` | ✅ | agent 标识，用户说"请派 XX agent"时匹配此名 |
| `description` | ✅ | 描述用途。Claude Code 用它匹配用户意图。**触发词写在这里** |
| `model` | ✅ | `inherit` 继承主会话模型，或指定 `sonnet`/`opus`/`haiku` |
| `color` | 否 | 终端显示色 |
| `tools` | 否 | 工具白名单数组。省略 = 全部工具可用。建议按需限制 |

### 3.6 `.opencode/agents/plan-agent.md`（OpenCode 加载层模板）

```yaml
---
description: 计划代理——设计而不是执行。读文档→产出 spec/plan，不写业务代码。
mode: primary
temperature: 0.1
steps: 30
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow
  bash: ask
  task: allow
  external_directory: allow
  webfetch: allow
  websearch: deny
---

> **Canonical source:** `doc/agents/plan-agent.md` — 修改规则请改 canonical，再运行 `node scripts/sync-agents.js`。
> 运行时加载文件不得独立修改规则本体。

## 职责定位
（以下是 canonical 正文，由 sync-agents.js 同步，不要手动修改此处）
```

**OpenCode YAML 字段说明**：

| 字段 | 必填 | 说明 |
|------|:--:|------|
| `description` | ✅ | agent 用途描述 |
| `mode` | ✅ | `primary`=可 spawn 子代理，`subagent`=不可 |
| `temperature` | 否 | 0.0~1.0。审计建议 0.0，计划/执行建议 0.1 |
| `steps` | 否 | 最大回合数 |
| `permission` | 否 | 工具白名单（`allow`/`ask`/`deny`）。省略 = 全部 ask |

### 3.7 同步脚本

`scripts/sync-agents.js` 和 `scripts/check-agent-sync.js` 直接复制 nana 项目的现成文件即可：
- [scripts/sync-agents.js](file://e:/nana/scripts/sync-agents.js)
- [scripts/check-agent-sync.js](file://e:/nana/scripts/check-agent-sync.js)

脚本行为：
- `sync-agents.js`：从 `doc/agents/` 读取 canonical 正文 → 写到 `.claude/agents/` 和 `.opencode/agents/`（各自保留 YAML frontmatter）
- `check-agent-sync.js`：对比运行时正文与 canonical，行尾归一化（`\r\n`→`\n`，去 BOM），exit 0 表示一致

---

## 4. 出厂配置流程

按以下顺序操作：

### Step 1: 建目录
```bash
mkdir -p doc/agents
mkdir -p .claude/agents
mkdir -p .opencode/agents
mkdir -p scripts
```

### Step 2: 写 canonical 正文
在 `doc/agents/` 下创建三份角色文件。**纯 markdown，不含 YAML frontmatter。**
直接复制 nana 的 `doc/agents/plan-agent.md` 等文件，按项目需求改产出路径和门禁。

### Step 3: 创建 YAML frontmatter 骨架
在 `.claude/agents/` 和 `.opencode/agents/` 下各创建三份文件，**先只写 YAML frontmatter**，正文后面同步脚本会填。参照上方模板。

### Step 4: 复制同步脚本
从 nana 复制 `scripts/sync-agents.js` 和 `scripts/check-agent-sync.js`。不需要改代码——它们通过相对路径找目录，只要目录结构一致就能直接用。

### Step 5: 首次同步
```bash
node scripts/sync-agents.js      # 填充正文到两端运行时文件
node scripts/check-agent-sync.js # 验证一致性
```

### Step 6: 写入口文件
创建 `AGENTS.md`、`CLAUDE.md`、`OPENCODE.md`。参照上方模板。

### Step 7: 可选——斜杠命令
在 `.claude/commands/` 下创建 `plan.md`、`execute.md`、`audit.md`，内容为 agent 委托：
```markdown
请 spawn plan-agent 处理以下需求。如果用户未提供具体需求，先询问用户要做什么。
```

### Step 8: 验证
1. **重启 Claude Code 会话**（agent 在启动时加载）
2. 输入"请派 plan agent 帮我设计一个测试需求"→ 确认 plan-agent 被 spawn
3. 在 OpenCode 中同样测试

---

## 5. 常见错误

| 错误 | 原因 | 修复 |
|------|------|------|
| `Agent type 'plan-agent' not found` | `.claude/agents/plan-agent.md` 缺 YAML frontmatter 或 `name` 字段 | 补 YAML frontmatter，重启会话 |
| Claude 不 spawn agent，自己扮演 | `description` 字段没有写触发词 | 在 `description` 中写"当用户说'请派 plan agent'时使用" |
| OpenCode 加载失败 | YAML frontmatter 格式不对（缩进错误、缺 `mode` 字段） | 检查 YAML 格式，参照模板 |
| 正文分叉 | 有人直接改了 `.claude/agents/` 或 `.opencode/agents/` 的正文 | 跑 `sync-agents.js` 覆盖；治理规则禁止直接改运行时文件 |
| check-agent-sync.js 假阳性 | Windows `\r\n` vs `\n` | 脚本已做行尾归一化，不应出现。如果还出现，检查 BOM |
| 会话中新增 agent 文件不生效 | Claude Code 只在启动时加载 agent | 重启会话 |

---

## 6. 维护规则

1. **改角色规则 → 只改 `doc/agents/*.md`** → 跑 `sync-agents.js` → 跑 `check-agent-sync.js`
2. **改 YAML frontmatter（如调整 tools 权限、切换 model） → 直接改对应的运行时文件**，不需要跑同步脚本（sync 脚本不覆盖 frontmatter）
3. **两端 YAML frontmatter 各自独立维护**——Claude 和 OpenCode 的配置字段不同，不需要保持一致
4. **Canonical 正文不得包含 YAML frontmatter**——它是纯 markdown，被两端共享

---

## 7. nana 项目完整参考

以下是 nana 项目经验证的完整文件，可直接对照或复制修改：

| 文件 | 用途 |
|------|------|
| [AGENTS.md](file://e:/nana/AGENTS.md) | 全局入口（项目约束、安全铁律、agent 速览、Git 规范） |
| [CLAUDE.md](file://e:/nana/CLAUDE.md) | Claude 运行时说明（context-mode 路由、子代理路由表） |
| [OPENCODE.md](file://e:/nana/OPENCODE.md) | OpenCode 运行时说明（启动顺序、与 Claude 的差异） |
| [doc/agents/plan-agent.md](file://e:/nana/doc/agents/plan-agent.md) | Canonical 计划代理正文 |
| [doc/agents/execute-agent.md](file://e:/nana/doc/agents/execute-agent.md) | Canonical 执行代理正文 |
| [doc/agents/audit-agent.md](file://e:/nana/doc/agents/audit-agent.md) | Canonical 审计代理正文 |
| [.claude/agents/plan-agent.md](file://e:/nana/.claude/agents/plan-agent.md) | Claude 计划代理加载层 |
| [.claude/agents/execute-agent.md](file://e:/nana/.claude/agents/execute-agent.md) | Claude 执行代理加载层 |
| [.claude/agents/audit-agent.md](file://e:/nana/.claude/agents/audit-agent.md) | Claude 审计代理加载层 |
| [.opencode/agents/plan-agent.md](file://e:/nana/.opencode/agents/plan-agent.md) | OpenCode 计划代理加载层 |
| [.opencode/agents/execute-agent.md](file://e:/nana/.opencode/agents/execute-agent.md) | OpenCode 执行代理加载层 |
| [.opencode/agents/audit-agent.md](file://e:/nana/.opencode/agents/audit-agent.md) | OpenCode 审计代理加载层 |
| [scripts/sync-agents.js](file://e:/nana/scripts/sync-agents.js) | 同步脚本（可无修改复用） |
| [scripts/check-agent-sync.js](file://e:/nana/scripts/check-agent-sync.js) | 检查脚本（可无修改复用） |
| [doc/plan/opencode-dual-runtime-plan.md](file://e:/nana/doc/plan/opencode-dual-runtime-plan.md) | 完整方案与决策过程 |
