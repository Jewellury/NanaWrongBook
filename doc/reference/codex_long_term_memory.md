# Codex Long-Term Memory

> 只记录长期有效、可复用、会影响后续协作的约定。临时任务状态不写入。

## 已采纳的长期约定

### 文档治理
- `doc/INDEX.md` 是文档总索引，只负责找文件和看状态，不写长叙事。
- `doc/00_CURRENT.md` 是当前状态入口，只写现在在哪、卡在哪、下一步是什么。
- `doc/DECISIONS.md` 是长期决策台账，只记录会持续影响协作和实现的取舍。
- `doc/reference/` 保留原始参考、调研和临时输入；新增 review / workorder / handoff / postmortem 类文档时，优先使用 `YYYY-MM-DD_HHMM_<artifact>_<topic>.md`。
- 新增或移动文件后更新 `doc/INDEX.md`。

### Git 收口闸门
- 每次 task / 子任务结束前先看 `git status`，再决定是否提交。
- 默认倾向提交；只要有可保留、可审计的成果就及时提交。
- 若同一轮包含多个独立意图，必须拆成多个 commit。
- 收尾必须说明：当前 `git status`、是否提交、为什么提交/不提交。
- 若暂不提交，必须说明下次满足什么条件再提。

### Git 提交格式
- commit message 使用 `<type>[(scope)]: <中文描述>`。
- type 仅允许 `feat` / `fix` / `docs` / `test`。
- scope 使用任务或轮次编号，如 `m2` / `m3` / `m3c`。
- 修改上游文件时，commit message 必须包含 `⚙️上游文件修改`。
- 不使用破坏性回滚手段，日常回退优先 `git revert`。

### 文档与审计习惯
- `/plan → /execute → /audit` 是长期有效的三代理闭环。
- 真题扫描或批处理脚本要避免覆盖历史草稿，必要时先按批次隔离，再合并去重。
- 如果扫描后发现异构输入，要先确认保存策略（`append-safe` / `batch-safe`）再扩量。
- `doc/plan/frontend-architecture-plan.md` 的默认路由命名空间是 `src/app/nana/`，配套组件放 `src/components/nana/`。
- `/nana` 是登录后的场景，低压感，收藏、采集、session 等仍然保持账号归属。
- 后续修改同类方案时，先检查：路由命名是否唯一、切片顺序是否服务主验证点、入口文档是否与鉴权前提一致。

### 双运行时加载
- Claude Code 和 OpenCode 的 agent 加载机制彼此独立，不能默认互通，也不能默认把 `.claude/agents/` 和 `.opencode/agents/` 当成同一套注册目录。
- canonical 子代理正文统一放在 `doc/agents/*.md`，运行时文件分别放在 `.claude/agents/*.md` 和 `.opencode/agents/*.md`，并且必须带各自 runtime 需要的 YAML frontmatter。
- 修改 canonical 后，先跑 `node scripts/sync-agents.js`，再跑 `node scripts/check-agent-sync.js` 验证一致性。
- 运行时 agent 没有被加载时，优先检查 frontmatter 是否符合该 runtime 的要求，而不是先怀疑正文内容。
- `CLAUDE.md` 和 `OPENCODE.md` 只做各自 runtime 的路由与补充说明，不承担跨 runtime 的统一注册职责。
- 双运行时 bootstrap 与验证细节，长期参考放在 `doc/reference/new-project-dual-runtime-bootstrap-guide.md` 和对应决策档中。

## 待持续观察
- 项目 AI 是否稳定执行“task 结束后先做 git 收口”的流程。
- 扫描类脚本是否已经统一成批次隔离或合并去重，避免覆盖写。
- 如果后续再次出现“只总结不收口”的情况，需要继续强化收尾闸门提示。
