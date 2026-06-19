# Claude Code 的机制

**自定义子代理注册：**Claude Code 官方文档明确支持通过文件定义自定义子代理。在 SDK 文档中说明可以在工程目录或用户目录下创建 `.claude/agents/` 文件夹，并将每个子代理以 Markdown 文件形式（含 YAML 前言）存放其中。这些文件中 `name` 字段定义子代理标识，系统提示 (`prompt`)、工具权限等通过前言配置。用户也可通过 SDK API（`ClaudeAgentOptions.agents`）以编程方式注册代理。文档中提到“程序定义的代理优先于文件定义的相同名称代理”。

**`.claude/agents/` 自动加载：**文档明确指出 `.claude/agents/` 目录为官方支持的子代理配置目录。当 Claude Code 启动时，会递归搜索当前工程及父目录中的所有 `.claude/agents/` 文件夹，加载其中的子代理定义。不过，**这些代理仅在启动时加载**，如果运行过程中创建新文件，需要重启会话才能生效。此外，配置目录 (`settings.json`) 下也可含 `.claude/agents/`（如企业托管设置）文件，优先级高于项目和用户目录。

**`.claude/commands/`、`skills`、MCP、设置等关系：**Claude Code 之前的自定义命令（slash commands）使用 `.claude/commands/` 目录（在 CLI 交互或 SDK 中以 `/命令名` 形式调用）。该方式已被新的「skills」机制取代：官方推荐使用 `.claude/skills/<name>/SKILL.md` 目录结构，新版功能一致并增加更多特性。旧的 `.claude/commands/` 目录依然被兼容支持但称为“legacy”格式。MCP 相关配置（如允许访问的 MCP 服务器）可在子代理前言中指定（见 `mcpServers` 字段）；工具访问控制也可通过前言的 `tools` / `disallowedTools` 设置。`settings.json` 可全局配置，如 `disableBundledSkills`、`permissions.allow/deny` 等，用于控制技能、命令和子代理的可见性和权限。总体上，**commands/skills/agents** 作用不同：`commands`（或新格式的 `skills`）定义可由用户 `/name` 调用的一次性快捷指令，而 `agents` 定义可并行运行的子代理。

**路由机制：**Claude Code 的主代理通过“Agent”工具调用子代理。系统会自动根据子代理的描述（`description`）判断何时调用哪个子代理。也可在用户提示中显式提及子代理名称强制调用，如示例 `"Use the code-reviewer agent to…"``（“使用 code-reviewer agent…”）直接触发名为 `code-reviewer` 的子代理。无论自动或手动触发，代理内部使用 `Agent` 工具来隔离上下文并返回结果。简言之，用户输入“请派 XX agent …”，Claude Code 并非凭借特定路由表，而是通过识别提示文本中的子代理名字（或匹配描述）来调用对应已注册的子代理。

# OpenCode 的机制

**`.opencode/agents/` 支持：**OpenCode 同样支持在配置目录定义 Markdown 形式的子代理。官方文档指出，可在全局 `~/.config/opencode/agents/` 和项目根目录的 `.opencode/agents/` 中创建 `.md` 文件来定义代理。这些文件开头为 YAML 前言，常见字段包括 `description`、`mode`（`primary` 或 `subagent`）、`model`、`permission` 等。例如：  
```yaml
---
description: Reviews code for quality...
mode: subagent
model: anthropic/claude-sonnet-4-20250514
permission:
  edit: deny
  bash: deny
---
你是代码审查专家…（后续提示文本）  
```  
文件名（如 `review.md`）即成为代理名。因此 `.opencode/agents/` 目录是 OpenCode 的**原生代理注册机制**，不只是简单模板载入，而是真正的运行时配置。

**agent/skill/command 规则：**OpenCode 对不同元素有各自的规则：  
- **代理（agent）：**如上，通过 `mode` 字段区分主代理或子代理，前言中 `description` 必需提供用途说明。`permissions` 可以细化工具权限，其他可选字段还包括 `maxTurns`、`background` 等。  
- **技能（skill）：**OpenCode 将可复用提示封装为 SKILL，比如一个目录 `SKILL.md` 文件。它支持在 `.opencode/skills/<name>/SKILL.md`（或兼容路径如 `.claude/skills/`、`.agents/skills/`）定义技能，前言字段包括 `name`、`description`、`license`、`compatibility`、`metadata` 等。例如：  
  ```yaml
  ---
  name: git-release
  description: Create consistent releases...
  license: MIT
  compatibility: opencode
  metadata:
    audience: maintainers
    workflow: github
  ---
  ## What I do...
  ```  
  该技能可通过 `skill` 工具按需调用，或手动执行如 `/git-release`。  
- **命令（command）：**OpenCode 支持通过命令目录定义自定义命令。可在全局 `~/.config/opencode/commands/` 或项目 `.opencode/commands/` 下放 `.md` 文件，前言中通常含有 `description`、`agent`、`model` 等。文件名去除扩展名即为命令名，如 `test.md` 定义 `/test` 命令。命令正文是提示模板，可使用 `$ARGUMENTS` 占位传参。  

**独立性：**OpenCode 与 Claude Code 在实现上基本独立，只是在设计上参考兼容了一些 Claude 约定。例如，OpenCode 文档中提到对迁移友好，会回退使用 `CLAUDE.md`、`~/.claude/CLAUDE.md` 和 `~/.claude/skills/` 等文件，但并未提及支持 `.claude/agents/`。也就是说，OpenCode 自身不识别 `.claude/agents/` 目录（默认为 `.opencode/agents/`），两者的子代理系统并不互通。要在 OpenCode 中使用 Claude 代理，需要手动迁移定义（如将 `.claude/agents/` 文件复制到 `.opencode/agents/` 并根据需求修改前言）。总之，OpenCode 是一个独立项目，其代理、技能、命令规范都有自己的配置路径和语法。

# 对当前项目架构的影响

- **假设验证：**“将文件放入 `.claude/agents/` 就能 spawn 子代理”这一假设**部分成立但存在条件**。确实，Claude Code 会在会话启动时加载该目录下的子代理定义；但代理不会自动运行，需要通过匹配描述或显式调用才会 spawn。同时，如果文件是在会话启动后新增的，需要重启才能生效，所以放文件后直接“spawn”并不总是即时发生。  

- **正确实现路径：**如果想让用户命令（如“请派 XX agent”）启动子代理，有两种推荐做法：  
  1. **使用显式调用：**在提示中包含子代理名称，Claude Code 会通过 Agent 工具触发该代理。例如让主代理输出 `"CALL_AGENT XX"` 或直接说“使用 XX 代理”可完成路由。或者通过 SDK/CLI 的 `--agent` 参数在会话开始时指定主代理类型，并由其调用子代理。  
  2. **使用 Slash 命令或 Skill：**如果任务适合作为一次性操作，可改用自定义命令或技能。例如，将工作流写入 `.claude/commands/`（legacy）或 `.claude/skills/` 中，让用户通过 `/命令名` 触发。这样不依赖 Agent 工具，仅通过常规命令机制路由任务。  
  若需要在 OpenCode 中实现类似功能，可将逻辑放在 `.opencode/commands/` 或 `.opencode/agents/` 中，或在代码中通过 OpenCode CLI 的 `agent create` 等命令动态生成代理配置。

- **架构选型：**基于以上，当前项目架构建议优先考虑**Slash Command 路由或主代理注入提示**的方式，而非单纯依赖 `.claude/agents/` 文件。若目标是在对话中并行处理任务，最符合 Claude Code 设计的是“原生子代理”方案（使用 Agent 工具），但这需要在代码侧预先定义代理（程序化或文件化）并通过提示启动；如果项目更偏向配置式或 CLI 操作，使用 **slash 命令（即 Skill/commands）** 可能更简单。例如，把任务逻辑写入技能，在对话中通过 `/技能名` 调用，或者在程序中调用 `query` 时指定 `agents` 参数。此外，也可考虑在控制器层面注入合适的 `AgentDefinition` 对象，由主代理按需触发。**Runtime 适配层**（如将用户请求转化为代理调用）需要借助上述方式之一来实现。

# 结论

Claude Code 官方支持将 `.claude/agents/*.md` 用作子代理定义目录，并通过描述匹配或名称提及触发子代理。OpenCode 也原生支持 `.opencode/agents/` 目录，用于定义其代理，两者的机制互相独立。基于官方文档，**假设“放文件到 `.claude/agents/` 即可自动 spawn 子代理”并不完全成立**：文件定义需要在会话重启时加载，且子代理必须通过系统匹配或用户明确调用才能执行。如果该假设不成立，替代方案包括：在提示中显式使用 `agent` 工具或配置主代理参数启动子代理，或将功能实现为 slash 命令/skills 以触发工作流。**综上，原方案不可行。**可行的最小替代架构是使用 Claude Code 的命令/技能机制（或在主代理中编程注入子代理）来实现所需功能，而不是单纯依赖文件放入 `.claude/agents/`。 

**参考资料：**Claude Code 官方文档和示例；OpenCode 官方文档。