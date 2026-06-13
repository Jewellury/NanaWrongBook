# Git 协作方案：自己开发 + 安全拉取上游更新

> 适用场景：从开源仓库 clone，自己大量开发，同时希望定期合并上游更新。

---

## 1. 当前现状（大白话）

| 项目 | 现状 | 大白话 |
|------|------|--------|
| remote | 只有一个 `origin`，指向 `wttwins/wrong-notebook` | 你只连着一个远程仓库，就是对方的原版 |
| 分支 | 在 `main` 分支上 | 你正在对方的主分支上 |
| 未提交改动 | `docker-compose.yml`、`docker-entrypoint.sh` 已修改 | 有两个文件改过但还没 git commit |
| 未跟踪文件 | `CLAUDE.md`、`doc/` 整个目录 | 你自己新建的文件，git 还没管它们 |
| 你能否推送 | 很可能不能（你没对方仓库的写权限） | 推不上去，需要换成你自己的远程仓库 |

### ⚠️ 核心问题

你现在直接在 `origin/main` 上改代码，但 `origin` 指向的是**别人的仓库**。正确的做法是：

- 你有一个**自己的远程仓库**放自己代码（叫 origin）
- 对方的原始仓库作为**上游**（叫 upstream），只拉取、不推送

---

## 2. 上游追踪配置

### 2.1 origin 和 upstream 的区别

| 名称 | 指向谁 | 你做什么操作 |
|------|--------|-------------|
| `origin` | **你自己的远程仓库** | `git push`（推送你的代码） |
| `upstream` | **对方的原始仓库** | `git pull`（拉取对方更新） |

```
你电脑上的代码
    ↙          ↘
  push         pull
   ↓             ↑
你的 origin    对方 upstream
(GitHub 你的仓库)  (wttwins/wrong-notebook)
```

### 2.2 需要执行的配置（待你确认后动手）

**前提**：你需要先在 GitHub 上创建一个自己的空仓库（fork 方式或新建都可以，推荐 fork）。

然后执行：

```bash
# 第 1 步：把对方仓库改名为 upstream（只拉取不推送）
git remote rename origin upstream

# 第 2 步：把你自己的仓库设为 origin（推送代码用）
#         把 <你的仓库地址> 替换成你的实际地址
git remote add origin <你的仓库地址>

# 第 3 步：验证配置正确
git remote -v
```

期望看到的结果：

```
origin    <你的仓库地址> (fetch)
origin    <你的仓库地址> (push)
upstream  git@github.com:wttwins/wrong-notebook.git (fetch)
upstream  git@github.com:wttwins/wrong-notebook.git (push)
```

> 注意：`upstream` 显示 push 地址是正常的，但你不应该往它推送。

### 2.3 日常操作命令速查

| 场景 | 命令 | 说明 |
|------|------|------|
| 拉取对方最新代码 | `git fetch upstream` | 只是下载，不合并，安全无副作用 |
| 看看对方更新了什么 | `git log upstream/main --oneline -10` | 看对方最近 10 条提交 |
| 推送自己的代码 | `git push origin main` | 把本地改好、提交好的代码推到你的仓库 |
| 看看工作区有没有没提交的 | `git status` | 每次开发前先跑这个 |

---

## 3. 分支策略（为单人非技术开发者定制）

### 3.1 最简单有效的策略：两条分支

| 分支 | 用途 | 说明 |
|------|------|------|
| `main` | **你的开发分支** | 你日常所有开发都在这里，它和上游是两条路 |
| `upstream/main` | **对方最新代码**（只读） | 不用你管，`git fetch upstream` 自动更新 |

**不需要创建额外分支。** 你是单人开发，没有多人协作的冲突，两条线足够。

### 3.2 合并上游更新的安全步骤（关键！）

当你想把对方最新代码拉进来时，按以下顺序操作：

```bash
# 第 1 步：确保自己工作区干净
git status
# 应该看到 "nothing to commit, working tree clean"
# 如果显示有改动，先提交：git add -A && git commit -m "保存当前进度"

# 第 2 步：拉取对方最新代码（只下载，不动你的代码）
git fetch upstream

# 第 3 步：看看对方改了什么（只是看，不会改任何东西）
git log upstream/main --oneline -20

# 第 4 步：合并对方的更新到你的 main
git merge upstream/main
```

**第 4 步可能出现的两种结果：**

| 结果 | 现象 | 你怎么办 |
|------|------|----------|
| ✅ 自动合并成功 | 终端没有报错，可能弹出编辑器让你写合并说明 | 直接 `:wq` 保存退出，搞定 |
| ❌ 出现冲突 | 终端显示 `CONFLICT` 字样 | **停下来，告诉我**。不要瞎操作，我帮你逐个判断 |

### 3.3 冲突时的应对原则

```
看到 CONFLICT → 停下来 → 把终端输出复制给我 → 我告诉你每处怎么处理
```

**你自己不要**：乱删代码、瞎选保留哪边、强行 commit。

### 3.4 万一改坏了怎么退回去

```bash
# 合并前记录当前位置（以防万一）
git log --oneline -1
# 记下那串 commit hash（如 8656759）

# 想撤销合并、回到干净状态：
git merge --abort

# 如果已经合并完了想回退：
git reset --hard <之前记下的那串hash>
```

---

## 4. 目录整理评估

### 4.1 结论：不要重组对方已有的代码目录

**原因**：你改了对方文件的目录结构 = 对方每个新版本都会和你冲突。这不是"偶尔冲突"的问题，是**每次合并必定冲突**。对于不懂代码的你，这不是"整理"，是给自己埋雷。

### 4.2 替代方案：你自己的一切放在独立新目录

| 你的内容 | 放在哪 | 会冲突吗 |
|----------|--------|:--:|
| 技术方案 / 调研 | `doc/research/`（已有） | ❌ 不冲突 |
| 规格 / 计划 | `doc/spec/`、`doc/plan/` | ❌ 不冲突 |
| 进度仪表盘 | `doc/state.md` | ❌ 不冲突 |
| 新增数据库表 | `prisma/schema.prisma` 里新增 model，不改已有 | ⚠️ 微小冲突概率 |
| 新增页面/API | `src/app/` 下新建目录/文件 | ❌ 不冲突 |
| 新增组件 | `src/components/` 下新建文件 | ❌ 不冲突 |
| 配置类改动 | `.env.example` 只追加、docker-compose.yml 只在自己仓库维护 | ⚠️ 需留意 |

> **原则**：新增不进旧文件，必须改旧文件时记录下来。

### 4.3 必须改对方文件时的清单

当前已有的"改动对方文件"记录，供将来合并时重点留意：

| 文件 | 改了什么 | 冲突风险 |
|------|----------|:--:|
| `docker-compose.yml` | 从拉镜像改为本地构建 + env_file | 🟡 中 |
| `docker-entrypoint.sh` | 修了 Windows 换行符（已 git add） | 🟢 低 |

如果 `docker-entrypoint.sh` 的换行符问题将来还要再出现，考虑在 CLAUDE.md 记录"克隆后先跑 `sed -i 's/\r$//' docker-entrypoint.sh`"。

---

## 5. 追加到 CLAUDE.md 的规则

以下内容将在你确认后追加到 CLAUDE.md 末尾：

```markdown
## Git 协作规范

### 远程仓库
- `origin` = 用户自己的远程仓库（可推送）
- `upstream` = wttwins/wrong-notebook 原始仓库（只拉取，不推送）

### 分支策略
- 单人开发，只维护 `main` 一条分支
- 对方更新通过 `git fetch upstream` + `git merge upstream/main` 拉取

### 目录原则
- 用户新增内容优先放入独立新目录（doc/、src/ 下新建文件）
- 尽量不修改对方已有文件
- 必须修改对方已有文件时，在 commit message 中标注"⚠️上游文件修改"
- 绝不重组或移动对方已有的目录结构

### 合并上游更新的规程
1. 执行前先告知用户，确认后再动手
2. 先 `git fetch upstream`（只下载，安全无副作用）
3. 再 `git merge upstream/main`
4. 如果出现 CONFLICT，停下来，把冲突内容用大白话解释给用户，逐个判断处理
5. 绝不自动解决冲突或强制覆盖

### 安全回退
- 每次合并前用 `git log --oneline -1` 记录当前 commit hash
- 告诉用户：想撤销可用 `git reset --hard <hash>`
- 合并前确保 `git status` 干净（所有改动已提交）
```

---

## 6. 执行步骤汇总（等你确认后逐条执行）

| 序号 | 操作 | 需要你做什么 |
|------|------|-------------|
| 1 | 你在 GitHub 上创建自己的空仓库 | 浏览器操作，或我指导你用 `gh` 命令 |
| 2 | `git remote rename origin upstream` | 复制粘贴命令 |
| 3 | `git remote add origin <你的仓库地址>` | 替换成你的地址 |
| 4 | 提交当前未提交的改动 | 我给你命令 |
| 5 | 首次推送 `git push origin main` | 复制粘贴命令 |
| 6 | 创建目录、修改 CLAUDE.md | 我动手，你确认 |
| 7 | 更新 `doc/state.md` 记录本轮完成 | 我动手 |

---

## 7. 待确认

1. **GitHub 仓库**：你有没有 GitHub 账号？知道怎么创建空仓库（或 fork）吗？需要我一步步教你吗？
2. **SSH/HTTPS**：你推送代码习惯用 SSH Key 还是用户名密码？之前配过吗？
3. **分支策略**：只用 `main` 一条分支够吗？还是要加一条 `dev` 分支来隔离开发中的代码？
4. **方案整体**：以上内容是否 OK？确认后我立刻动手执行。
