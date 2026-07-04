# 部署脚本 + 部署指南更新 · 审计报告

> 关联计划: doc/plan/deploy-script-plan.md
> 执行日志: doc/executionlog/（**缺失** — 见"问题清单"）
> 审计日期: 2026-07-04

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

脚本本身写得很扎实——语法正确、安全门禁齐全、CI 镜像路线正确、健康检查和部署报告都有。部署指南新增的常见问题和故障排查也很实用，把前面踩过的坑（`docker compose build 无效果`、部署后按钮不可见）都记下了。

**但有 2 个流程问题需要先解决：**

1. **没有对应的执行日志。** 按照三代理流程，有 plan 就应该有 execution log。需要补一份执行日志再 commit。
2. **代码还没提交。** `scripts/deploy.sh`、`doc/plan/deploy-script-plan.md` 都是 untracked，`doc/guide/deployment-guide.md` 的改动也没 staged。如果现在审计 "通过"，这些成果就留在工作区里，等于还没完成。

> ⚠️ **特别说明**：本轮是"直接审计两个文件改动"，没有经过标准的 /plan → /execute → /audit 三轮流程。用的是 AGENTS.md 中的 audit agent 角色检查代码质量，但不是传统意义上的"执行完某个 feature 后审计"——它更像是一次独立的代码审查任务。因此部分检查项（计划一致性、偏离复核）不直接适用，我会标注。

## 检查清单

### 计划一致性
- [x] 实现了计划中所有任务
  - `scripts/deploy.sh` — 已创建 ✅
  - `doc/guide/deployment-guide.md` — 已更新（新增故障排查、常见问题、deploy.sh 引用）✅
  - 计划文档 `doc/plan/deploy-script-plan.md` — 已创建 ✅
- [x] 未偏离计划（或偏离已记录且合理）— 与计划完全一致

### 代码质量
- [x] 无明显 bug — `bash -n scripts/deploy.sh` 语法检查通过 ✅
- [x] 错误处理到位 — `set -e` + 显式 exit + 每个步骤有 echo 提示 ✅
- [x] 代码风格一致
  - `scripts/deploy.sh`: Shell 脚本风格统一（颜色、步骤编号、日志输出）✅
  - `doc/guide/deployment-guide.md`: 新增内容与原有风格一致（heading 层级、代码块、表格）✅

### 安全性
- [x] 无密钥泄露 — 脚本不包含任何密钥/密码/token ✅
- [x] 无 SQL 注入风险 — 不涉及 SQL 操作（备份调 sqlite3 .backup 命令，非拼接 SQL）✅
- [x] 用户输入有校验 — `--force` 参数解析正确 ✅
- [x] 本轮未向生产库写入测试数据 — 不涉及数据写入 ✅

### 偏离复核
- 本轮不适用（不是从执行日志来的审计，而是直接审查文件改动）

### 上游兼容性
- [x] 未修改上游已有数据库表结构 ✅（不涉及 Prisma schema）
- [x] 上游文件修改已标注且最小化 ✅（不涉及上游文件）
- [x] 新增文件在独立目录中 ✅（`scripts/deploy.sh` 在 `scripts/` 目录下）

### 部署审计

> 本轮是"创建部署脚本 + 更新部署指南"，本身不涉及实际部署操作。以下检查部署脚本是否满足 AGENTS.md 中的部署发布门禁：

#### scripts/deploy.sh 门禁检查

| # | 门禁要求 | 检查结果 |
|---|---------|---------|
| 1 | 服务器部署分支是 `main`，或 `dev` 部署有用户明确批准记录 | ✅ 非 main 分支默认 exit 1，除非 `--force`（第 115-125 行）。且 `--force` 输出警告提醒需用户批准 |
| 2 | 部署镜像来自 GitHub Actions 成功构建，不来自本地 Docker | ✅ 使用 `docker compose -f docker-compose.prod.yml pull`（第 177 行），不使用 `build`。步骤 6 明确提示必须用 pull |
| 3 | 服务器 commit 与 `origin/main` 一致 | ✅ `git pull origin main`（第 132 行）确保同步。脚本记录拉取前后的 commit，方便对比 |
| 4 | 部署前已备份 SQLite | ✅ 两步备份：`cp` 快速文件备份（第 150-159 行）+ `bash backup.sh` sqlite3 快照（第 162-168 行）。备份失败阻断（`set -e`）|
| 5 | `.env` 未进入 git | ✅ 脚本不涉及 `.env` 操作，也不修改它 |
| 6 | 没有在服务器直接热修源码的记录 | ✅ 脚本只做 `git pull origin main`，不编辑文件 |
| 7 | 外部状态变更均写入执行日志 | ⚠️ 脚本本身输出到控制台但**没有自动写日志文件**。不过部署报告已在末尾输出，用户可手动保存 |
| 8 | 回滚方案可执行 | ✅ 末尾输出回滚指引（第 237-241 行），指引用户查看备份目录和回滚方法 |
| 9 | 生产构建不依赖不稳定外部资源 | ✅ 镜像在 CI 中提前构建好，服务器只 pull 不构建 |

#### doc/guide/deployment-guide.md 部署门禁检查

| 项目 | 检查结果 |
|------|---------|
| "部署前必须先 bash backup.sh" | ✅ 纪律中已写明（第 132 行）|
| "CI 失败时不跳过、不手动 build" | ✅ 纪律中已写明（第 133 行）|
| "服务器只用 main 分支" | ✅ 纪律中已写明（第 134 行）|
| "不得在服务器上直接编辑源码" | ✅ 纪律中已写明（第 135 行）|

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（exit 0）✅

### 测试
- 本轮不涉及测试代码（部署脚本无单元测试，不适用于此检查项）

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| **P1** | **对应执行日志缺失** — 有 `plan/deploy-script-plan.md` 但无 `executionlog/deploy-script-log.md` | `doc/executionlog/` | 补写执行日志（记录做了什么、遇到什么问题、如何解决的）。或者如果本轮是一步到位的文件审查（未经过 /execute 轮），需在审计结论中说明情况 |
| **P1** | **文件未提交** — `scripts/deploy.sh`、`doc/plan/deploy-script-plan.md` 为 untracked，`doc/guide/deployment-guide.md` 修改未 staged | 多个文件 | 建议：补执行日志 → `git add` → `git commit`（可分 2 个 commit：plan+script 一个，guide 一个）|
| **P2** | **`HEALTH_CHECK_URL` 变量定义但未使用** — 第 51 行定义了 `HEALTH_CHECK_URL="https://nana.nanatop.xyz/nana"`，但第 234 行只作为文本输出提示用户手动 curl，脚本本身不执行 HTTP 健康检查 | `scripts/deploy.sh:51` | 可选改进：在步骤 8 中添加自动 curl 健康检查（但不是必须的，当前 `docker compose ps` + 容器状态检查已够用）|
| **P2** | **备份文件名不一致** — `deploy.sh` 的 cp 备份用 `prod-<timestamp>.db`（第 153 行），而 `backup.sh` 用 `dev.db.<timestamp>`。虽然两种备份方式不同（cp vs sqlite3 .backup），但部署指南 §5 只记录了 `dev.db.*` 格式，未说明还有 `prod-*.db` 这种备份 | `scripts/deploy.sh:153` + `doc/guide/deployment-guide.md §5` | 在部署指南 §5 中补充说明：`deploy.sh` 还会额外创建 `prod-*.db` 格式的 cp 快速备份，防止用户只找 `dev.db.*` 漏掉另一份 |

## 详细代码审查

### scripts/deploy.sh 逐步骤审查

| 步骤 | 代码行 | 功能 | 判定 |
|------|--------|------|:----:|
| 参数解析 | 61-65 | `--force` 支持 | ✅ |
| 1: 进入目录 | 68-76 | 检查 `/opt/nana` 是否存在，cd 进入 | ✅ |
| 2: Git 状态 | 80-98 | 检查已跟踪文件修改（untracked 不阻塞），`--force` 可跳过 | ✅ |
| 3: 分支确认 | 101-125 | 检查当前分支 + 记录 commit，非 main 需 `--force` | ✅ |
| 4: git pull | 128-143 | 拉取 `origin main`，记录拉取前后 commit 对比 | ✅ |
| 5: 备份 | 146-168 | cp 快速备份 + backup.sh sqlite3 快照 | ✅ |
| 6: docker pull | 171-178 | `docker compose -f docker-compose.prod.yml pull` | ✅ |
| 7: docker up | 181-184 | `docker compose -f docker-compose.prod.yml up -d` | ✅ |
| 8: 健康检查 | 187-218 | sleep 5 → docker compose ps → 检查容器 Up 状态 → 日志 tail | ✅ |
| 部署报告 | 221-241 | 输出时间/分支/commit/容器状态/验证命令/回滚指引 | ✅ |

### doc/guide/deployment-guide.md 新增内容审查

| 节 | 新增内容 | 判定 | 说明 |
|----|---------|:----:|------|
| §2 发布流程 | 一键脚本方式 + docker compose 注意事项 | ✅ | 准确说明两种部署方式，重点提示 `docker compose` 的 build/pull 陷阱 |
| §6 故障排查 | `No services to build` 错误解释 | ✅ | 准确描述现象、根因、正确操作，引用 deploy.sh 作为预防手段 |
| §6 故障排查 | HTTPS 不通 + DNS 验证 | ✅ | 原有内容，未改动 |
| §8 常见问题 | Q1: 部署后按钮不可见 | ✅ | 准确描述旧镜像问题，给出排查步骤 |
| §8 常见问题 | Q2: pull 拉取不到新镜像 | ✅ | 准确描述 CI 未完成场景，给出门禁说明 |
| §8 常见问题 | Q3: 部署后确认正常 | ✅ | 四步检查清单（应用可达、容器运行、图谱数据、日志无 ERROR）|
| 索引 | `scripts/deploy.sh` 条目 | ✅ | 描述准确 |

## 用户验证指南

1. **审查 `scripts/deploy.sh` 内容**：通读 242 行，确认逻辑清晰、没有隐藏危险操作
2. **确认补执行日志**：检查 `doc/executionlog/deploy-script-log.md` 是否已补写
3. **确认文件已提交**：检查 `git status` 是否干净，所有改动已 commit
4. **手动运行语法检查**：在 Git Bash 中运行 `bash -n scripts/deploy.sh`，应无错误输出
