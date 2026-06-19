# OpenCode 双运行时支持方案

> 计划日期: 2026-06-19
> 关联决策: D-15
> 预估影响: 根目录 3 文件 + `doc/agents/` + `.claude/agents/` + `.opencode/agents/` + `.claude/commands/` 改为委托 + `scripts/sync-agents.js` + `scripts/check-agent-sync.js` + `CLAUDE.md` 精简 + `doc/INDEX.md` + `doc/DECISIONS.md`

---

## 1. 背景与目标

当前项目只有 Claude Code 一条入口。三份角色提示词放在 `.claude/commands/`（斜杠命令机制），
但用户实际工作流是自然语言 spawn 子代理（"请 plan agent 帮我..."），不是敲 `/plan` 斜杠。

目标：
1. Claude Code 和 OpenCode 都能通过自然语言 spawn 同一套子代理（plan / execute / audit）
2. 运行时无关的规则只有一份 canonical 正文，不出现分叉
3. 保留 `.claude/commands/` 作为斜杠快捷入口，改为委托 agent
4. 不引入 Controller agent，人类继续手工编排三代理

---

## 2. 现状分析

### 2.1 当前文件布局

```
CLAUDE.md                          # 事实上的唯一入口（混合了 runtime-agnostic + Claude 专属）
.claude/commands/
  plan.md                          # 斜杠命令（只在敲 /plan 时读取）
  execute.md
  audit.md
doc/agents/                        # 不存在
.claude/agents/                    # 不存在
.opencode/agents/                  # 不存在
AGENTS.md                          # 不存在
OPENCODE.md                        # 不存在
```

### 2.2 关键发现

- 用户说"请 plan agent"不走 `.claude/commands/`，走的是 Agent tool spawn 机制。
  Agent tool 读取的是 `.claude/agents/<name>.md`，不是 `.claude/commands/`。
- 当前 `.claude/commands/` 三份文件**不是子代理机制本身，而是 slash 入口层**——
  敲 `/plan` 时读取，自然语言 spawn 时走的是另一条路径（Agent tool 读 `.claude/agents/`）。
  两种机制互不覆盖，当前项目只有 slash 入口层，缺了 agent 定义层。
- `CLAUDE.md` 里混合了 runtime-agnostic 内容（安全铁律、代码准则、Git 规范、三分支模型）
  和 Claude 专属内容（context-mode 路由）。OpenCode 不需要后者。

---

## 3. 参考项目做法

### 3.1 FOFCode（OpenCode only，无 Claude）

- 无 `.claude/` 目录
- `.opencode/agents/fof-{plan,execute,audit}.md`：YAML frontmatter + 完整正文
- `AGENTS.md` 是全局权威入口（项目使命、agent 速览、工作流、禁止事项）
- 子代理通过 YAML `mode: primary` / `mode: subagent` 控制能否再 spawn 子代理
- 无斜杠命令

### 3.2 fof-semantic-query-mvp（Claude Code only，OpenCode 未验证）

- `.claude/agents/`：完整正文 + canonical 指针注释
- `.opencode/agents/`：存在但内容仅为"待切换时追加"，未真正跑过
- `docs/agents/`：canonical 正文（无 frontmatter）
- `AGENTS.md`：运行时无关入口（项目定位、硬约束、文档优先级）
- `CLAUDE.md`：运行时说明（context-mode 路由、Python 路径等）
- `OPENCODE.md`：运行时说明（与 Claude 的差异）
- 有 Controller agent + 三个子代理（4 代理模型）

### 3.3 可借鉴的模式

| 模式 | 来源 | 采纳 |
|------|------|:--:|
| `AGENTS.md` = 全局入口，`CLAUDE.md`/`OPENCODE.md` = 运行时说明 | fof-semantic | ✅ |
| `doc/agents/` = canonical 正文（无 frontmatter） | fof-semantic | ✅ |
| 运行时加载文件内嵌完整正文 + canonical 指针注释 | fof-semantic | ✅ |
| `.opencode/agents/` = YAML frontmatter + 正文 | FOFCode | ✅ |
| `.claude/commands/` 改为 agent 委托 | 本项目决定 | ✅ |
| 4 代理模型（含 Controller） | fof-semantic | ❌ 不采用 |

### 3.4 冲突点与裁决

| 冲突 | 裁决 |
|------|------|
| fof-semantic 用 `docs/`，nana 用 `doc/` | **保留 nana 的 `doc/`**。canonical agent 放 `doc/agents/` |
| fof-semantic 有 Controller agent | **不引入**。nana 保持人类手工编排 |
| FOFCode `.opencode/` 有 CHECKLIST/REFERENCE/PRINCIPLES/skills | **本轮不照搬**。先打通 agent 加载，后续按需追加 |

---

## 4. 推荐架构

### 4.1 结论

**运行时加载文件内嵌完整 agent 正文，顶部标注 canonical source 指针。**
`doc/agents/` 是唯一修改入口。修改规则 → 先改 canonical → 机械同步到两个运行时加载文件。

### 4.2 目录结构

```text
AGENTS.md                          # 全局入口（运行时无关）：项目约束、文档优先级、agent 速览
CLAUDE.md                          # Claude 运行时说明：context-mode 路由、Git 命令序列
OPENCODE.md                        # OpenCode 运行时说明：沙箱策略、与 Claude 的差异

doc/agents/                        # canonical 正文（纯 markdown，无 frontmatter）
  plan-agent.md
  execute-agent.md
  audit-agent.md

.claude/agents/                    # Claude Code 加载层（内嵌 canonical 正文）
  plan-agent.md
  execute-agent.md
  audit-agent.md

.opencode/agents/                  # OpenCode 加载层（YAML frontmatter + 内嵌 canonical 正文）
  plan-agent.md
  execute-agent.md
  audit-agent.md

.claude/commands/                  # 保留，改为 agent 委托（向后兼容 /plan 斜杠）
  plan.md                          #   内容：spawn plan-agent
  execute.md
  audit.md
```

### 4.3 各文件职责

| 文件 | 职责 | 修改规则 |
|------|------|----------|
| `AGENTS.md` | 项目定位、硬约束、文档优先级、agent 速览、安全铁律、代码准则、Git 规范、三分支模型 | 治理变更时改 |
| `CLAUDE.md` | Claude 专属：context-mode 路由、工具选择层次、Git 命令序列（实操部分）、子代理路径指引 | Claude 工具链变更时改 |
| `OPENCODE.md` | OpenCode 专属：启动阅读顺序、agent 加载路径、与 Claude 的差异说明 | OpenCode 适配时改 |
| `doc/agents/*.md` | canonical 角色正文，唯一修改入口 | 角色规则变更时改 → 同步 `.claude/agents/` 和 `.opencode/agents/` |
| `.claude/agents/*.md` | Claude 子代理定义（被 Agent tool 读取），内嵌 canonical 正文 | 仅从 canonical 同步，不独立修改 |
| `.opencode/agents/*.md` | OpenCode 子代理定义，YAML frontmatter + canonical 正文 | 仅从 canonical 同步，不独立修改 |
| `.claude/commands/*.md` | 斜杠命令，内容为 agent 委托（spawn 对应 agent） | agent 名称变更时同步 |

### 4.4 交互关系

```text
用户说 "请 plan agent 帮我设计 XXX"
  → Claude Code Agent tool 读取 .claude/agents/plan-agent.md → spawn plan-agent
  → OpenCode 读取 .opencode/agents/plan-agent.md → spawn plan-agent

用户敲 /plan XXX
  → Claude Code 读取 .claude/commands/plan.md → spawn plan-agent（同一条路径）

规则修改流程：
  1. 改 doc/agents/plan-agent.md（canonical）
  2. 运行 `node scripts/sync-agents.js` 自动同步到 `.claude/agents/` 和 `.opencode/agents/`
  3. 运行 `node scripts/check-agent-sync.js` 验证同步结果

脚本行为：
  - `sync-agents.js`：从 `doc/agents/` 读取 canonical 正文，写到两个运行时加载目录。
    `.claude/agents/` 输出 = canonical 指针注释头 + 正文；`.opencode/agents/` 输出 = YAML frontmatter（从既有文件保留）+ 正文。不会覆盖 frontmatter。
  - `check-agent-sync.js`：对比运行时文件正文与 canonical，有差异则 exit 1 并报告具体文件。
```

### 4.5 `.claude/commands/` 委托模板

斜杠命令只做一件事：spawn 对应 agent。

`/plan` → `.claude/commands/plan.md` 内容：

```markdown
请 spawn plan-agent 处理以下需求。如果用户未提供具体需求，先询问用户要做什么。
```

`/execute` 和 `/audit` 同理，分别指向 execute-agent 和 audit-agent。

### 4.6 同步机制

人工手动复制三处会分叉，必须用脚本机械化同步。以下两个脚本放在 `scripts/` 下：

**`scripts/sync-agents.js`**（同步脚本）：
- 读取 `doc/agents/plan-agent.md`、`execute-agent.md`、`audit-agent.md` 的正文
- 输出到 `.claude/agents/`：文件头 = canonical 指针注释 + 空行 + 正文。纯文本拼接，不涉及 frontmatter
- 输出到 `.opencode/agents/`：保留目标文件已有的 YAML frontmatter 块 + 空行 + 正文。frontmatter 从目标文件读取后复写，不会被 canonical 正文覆盖
- 如果目标文件不存在（首次新建），报错并提示先生成 frontmatter 骨架

**`scripts/check-agent-sync.js`**（检查脚本）：
- 对比 `.claude/agents/*.md` 和 `.opencode/agents/*.md` 的正文部分与 `doc/agents/*.md` 是否一致
- 对比前做行尾归一化（`\r\n` → `\n`，去除 BOM，移除末尾空行），避免 Windows 下的假阳性
- 一致 → `exit 0`，打印 `OK: 3/3 agents in sync`
- 不一致 → `exit 1`，打印 `MISMATCH: .claude/agents/plan-agent.md differs from canonical` 等具体差异

**使用方式**：
```bash
# 修改 canonical 后同步
node scripts/sync-agents.js

# 验证同步结果
node scripts/check-agent-sync.js    # exit 0 = 一致, exit 1 = 有漂移
```

**集成到验证流程**：
- 每次 audit 检查项中增加"运行时文件与 canonical 一致（`check-agent-sync.js` 通过）"
- 本方案实施时，step 4-5 生成 `.claude/agents/` 和 `.opencode/agents/` 后立即跑同步脚本，确保初始状态一致

---

## 5. 内容搬家方案

### 5.1 `CLAUDE.md` → `AGENTS.md`（搬家）

从 `CLAUDE.md` 搬入 `AGENTS.md`：

- 三代理协作框架概述（/plan → /execute → /audit）
- 文档路径速查表
- 权威技术文档（必读）表
- 门禁摘要（4 条）
- 安全铁律（6 条 + git reset --hard 警告）
- 代码修改准则（3 条：先读后写、遵从约定、暴露冲突）
- Git 协作规范（远程配置、三分支模型描述、目录原则）
- 日常 Git 操作命令序列
- Git 收口闸门规则

其中 "日常 Git 操作命令序列" 和 "同步上游更新步骤" 属于具体的操作指令，
放在 `AGENTS.md` 的"Git 协作规范"节中，不作为独立文件。

### 5.2 留在 `CLAUDE.md`（不搬）

- context-mode — MANDATORY routing rules（BLOCKED commands / REDIRECTED tools / Tool selection hierarchy）
- Subagent routing 说明
- Output constraints（<500 words, artifacts to files）
- ctx commands 速查表

### 5.3 `OPENCODE.md` 内容

- 指向 `AGENTS.md` 为全局入口
- 说明 agent 加载路径为 `.opencode/agents/`
- 说明 `CLAUDE.md` 中的 context-mode 路由规则为 Claude/MCP 专属，OpenCode 不适用
- 启动阅读顺序

---

## 6. OpenCode Agent Frontmatter 参数

参照 FOFCode，三个 agent 的 YAML frontmatter 如下：

### plan-agent

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
```

`mode: primary`——plan-agent 需要 dispatch execute-agent，必须有 spawn 子代理能力。

### execute-agent

```yaml
---
description: 执行代理——严格按已批准的计划实现代码，每步记录在案。
mode: subagent
temperature: 0.1
steps: 40
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow
  bash: ask
  task: deny
  external_directory: allow
  webfetch: deny
  websearch: deny
---
```

`mode: subagent` + `task: deny`——execute-agent 不 spawn 更多子代理，防止级联失控。
`steps: 40`——执行类任务比规划类需要更多回合。

### audit-agent

```yaml
---
description: 审计代理——审查代码质量、验证计划一致性、发现潜在问题，只指出不修改。
mode: subagent
temperature: 0.0
steps: 30
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow
  bash: ask
  task: deny
  external_directory: allow
  webfetch: deny
  websearch: deny
---
```

`temperature: 0.0`——审计需要最大确定性，不需要创造性。

### 参数说明（通用）

| 参数 | 含义 | 本项目取值依据 |
|------|------|---------------|
| `mode` | `primary`=可 spawn 子代理，`subagent`=不可 | plan 需要 dispatch execute |
| `temperature` | 0.0~1.0，越低越确定 | plan/execute 0.1（少量创造），audit 0.0（纯判断） |
| `steps` | 最大回合数 | FOFCode 经验值，nana 任务复杂度相当 |
| `permission` | 工具白名单 | webfetch 仅 plan 开放（查文档），execute/audit 不需要 |

---

## 7. 文件变更清单

### 新增（15 个文件）

| 文件 | 说明 |
|------|------|
| `AGENTS.md` | 全局入口：项目约束、文档优先级、agent 速览、安全铁律、代码准则、Git 规范 |
| `OPENCODE.md` | OpenCode 运行时说明 |
| `doc/agents/plan-agent.md` | canonical 计划代理正文 |
| `doc/agents/execute-agent.md` | canonical 执行代理正文 |
| `doc/agents/audit-agent.md` | canonical 审计代理正文 |
| `.claude/agents/plan-agent.md` | Claude 计划代理加载文件 |
| `.claude/agents/execute-agent.md` | Claude 执行代理加载文件 |
| `.claude/agents/audit-agent.md` | Claude 审计代理加载文件 |
| `.opencode/agents/plan-agent.md` | OpenCode 计划代理加载文件（YAML frontmatter + 正文） |
| `.opencode/agents/execute-agent.md` | OpenCode 执行代理加载文件 |
| `.opencode/agents/audit-agent.md` | OpenCode 审计代理加载文件 |
| `scripts/sync-agents.js` | 从 canonical 同步正文到 `.claude/agents/` 和 `.opencode/agents/` |
| `scripts/check-agent-sync.js` | 检查运行时文件与 canonical 是否一致 |

### 修改（4 个文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `CLAUDE.md` | 精简 | 移除 runtime-agnostic 内容 → 搬入 `AGENTS.md`，只保留 Claude 专属 |
| `.claude/commands/plan.md` | 改为委托 | 内容改为 spawn plan-agent |
| `.claude/commands/execute.md` | 改为委托 | 内容改为 spawn execute-agent |
| `.claude/commands/audit.md` | 改为委托 | 内容改为 spawn audit-agent |

### 索引更新（2 个文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/sync-agents.js` | 新增 | 从 canonical 同步到两个运行时加载目录 |
| `scripts/check-agent-sync.js` | 新增 | 检查运行时文件与 canonical 是否一致（exit 1 表示漂移） |
| `doc/INDEX.md` | 修改 | 新增 AGENTS.md、OPENCODE.md、doc/agents/、.opencode/agents/、本方案文档 |
| `doc/DECISIONS.md` | 修改 | 追加 D-15：双运行时 agent 架构决策 |

### 保留不动

| 文件/目录 | 原因 |
|-----------|------|
| `doc/` 及其子目录（除新增/修改外） | 不改既存文档路径 |
| `.claude/settings.local.json` | 用户本地配置 |
| `.gitignore` | 无需新增忽略项 |
| `.env` / `.env.test` | 不涉及密钥变更 |

---

## 8. 风险与回滚

### 8.1 风险点

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|:--:|------|------|
| R1 | `.claude/agents/` 格式不被当前 Claude Code 版本识别 | 低 | 高：子代理无法 spawn | 保留 `.claude/commands/` 作为 fallback，改造后立即验证 |
| R2 | OpenCode 不识别 `.opencode/agents/` 的 frontmatter 参数 | 中 | 中：OpenCode 侧不可用 | 参数完全参照 FOFCode（已验证项目），改造后在 OpenCode 中验证 |
| R3 | canonical 和运行时文件正文分叉 | 中 | 中：两个运行时行为不一致 | `check-agent-sync.js` 在每次同步后验证一致；audit 检查项包含此验证 |
| R4 | `AGENTS.md` 和 `CLAUDE.md` 优先级冲突 | 低 | 中：agent 读取两份不同指令 | `AGENTS.md` 第一条明确自己的最高权威地位，`CLAUDE.md` 声明自己为 Claude 专属补充 |
| R5 | `.claude/commands/` 改为委托后，用户习惯的 `/plan` 多一跳 | 低 | 低：慢 1-2 秒 | latency 差异可忽略，功能等价 |

### 8.2 回滚方式

这是纯文档/配置文件改造，不涉及业务代码。回滚步骤：

1. `git revert <commit>` 回到改造前的最后一个 commit
2. 删除新增目录：`doc/agents/`、`.claude/agents/`、`.opencode/`
3. 恢复原有文件：`CLAUDE.md`、`.claude/commands/*.md`
4. `git status` 确认干净 → 继续工作

回滚不丢代码、不破数据库、不影响已有功能。

---

## 9. 验证清单

### 9.1 Claude Code 侧

- [ ] `AGENTS.md` 存在，内容完整（项目约束、文档优先级、安全铁律、代码准则、Git 规范）
- [ ] `CLAUDE.md` 精简为 Claude 专属内容（context-mode 路由）
- [ ] `.claude/agents/plan-agent.md` 存在，内容 = canonical 指针 + 完整正文
- [ ] `.claude/agents/execute-agent.md` 存在
- [ ] `.claude/agents/audit-agent.md` 存在
- [ ] `.claude/commands/plan.md` 改为 agent 委托
- [ ] `.claude/commands/execute.md` 改为 agent 委托
- [ ] `.claude/commands/audit.md` 改为 agent 委托
- [ ] **功能验证**：用户说"请 plan agent 设计 XXX" → Claude Code spawn plan-agent → agent 按 canonical 角色定义产出计划
- [ ] **斜杠兼容**：敲 `/plan XXX` → spawn plan-agent → 行为等价
- [ ] **功能验证**：完整走一轮 plan → execute → audit，确认三代理闭环不中断

### 9.2 OpenCode 侧

- [ ] `OPENCODE.md` 存在
- [ ] `.opencode/agents/plan-agent.md` 存在，YAML frontmatter 格式正确
- [ ] `.opencode/agents/execute-agent.md` 存在
- [ ] `.opencode/agents/audit-agent.md` 存在
- [ ] **功能验证**：在 OpenCode 中说"请 plan agent 设计 XXX" → OpenCode 识别并 spawn plan-agent
- [ ] **功能验证**：完整走一轮 plan → execute → audit

### 9.3 一致性

- [ ] `doc/agents/*.md` 是唯一 canonical 正文
- [ ] `node scripts/check-agent-sync.js` 通过（exit 0）
- [ ] `.claude/commands/*.md` 全部指向 agent 委托，不含独立角色正文
- [ ] `AGENTS.md` 明确声明自己是最终权威
- [ ] `CLAUDE.md` 声明自己是 Claude 运行时补充，权威低于 `AGENTS.md`
- [ ] `OPENCODE.md` 声明自己是 OpenCode 运行时补充

### 9.4 索引

- [ ] `doc/INDEX.md` 包含新增文件入口
- [ ] `doc/DECISIONS.md` 包含 D-15 记录
- [ ] `doc/INDEX.md` 中本方案文档已登记

---

## 10. 备选方案

### 方案 B：不改 `.claude/commands/`，只新增 `.claude/agents/` + OpenCode 侧

做法：保留 `.claude/commands/` 现有内容不动，新建 `.claude/agents/` 和 `.opencode/agents/`，
让斜杠命令和自然语言 spawn 并存，互不依赖。

**优点**：
- 更保守，`.claude/commands/` 零改动，零风险
- 如果 agent 加载失败，斜杠命令仍有完整正文可用

**缺点**：
- `.claude/commands/` 和 `.claude/agents/` 各有一份正文，容易分叉
- 占用更多维护精力（多一套文件需要同步）
- 不符合用户"同一套开发规范"的目标

**结论**：不推荐。首选方案的 agent 委托模式已经足够保守——`.claude/commands/` 只是内容缩短，
文件仍存在，斜杠仍可用。方案 B 的分叉风险大于收益。

---

## 11. 实施顺序

1. 新建 `AGENTS.md`——从 `CLAUDE.md` 提取 runtime-agnostic 内容
2. 精简 `CLAUDE.md`——只保留 Claude 专属部分
3. 新建 `doc/agents/`——三份 canonical 正文（基于现有 `.claude/commands/` 内容升级）
4. 新建 `scripts/sync-agents.js` + `scripts/check-agent-sync.js`
5. 新建 `.claude/agents/`——三份 Claude 加载文件骨架，跑 `sync-agents.js` 填充正文
6. 新建 `.opencode/agents/`——三份 OpenCode 加载文件骨架（含 YAML frontmatter），跑 `sync-agents.js` 填充正文
7. 跑 `check-agent-sync.js`——确认同步结果一致
8. 修改 `.claude/commands/`——三份改为 agent 委托
9. 新建 `OPENCODE.md`
10. 更新 `doc/INDEX.md` + `doc/DECISIONS.md`
11. 功能验证：Claude Code 侧完整走一轮 plan → execute → audit
12. 功能验证：OpenCode 侧完整走一轮

Step 1-10 为文档改造（无业务影响），Step 11-12 为验证。
