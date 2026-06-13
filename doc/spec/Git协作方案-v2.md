# Git 协作方案 v2.0（修订版）

> 修订说明：采用三分支模型（dev/main/sync-upstream），分离"自己开发"与"同步上游"。
> 用户远程：github.com/Jewellury/NanaWrongBook · SSH 推送

---

## 1. 远程配置

| 名称 | 指向 | 权限 |
|------|------|:--:|
| `origin` | `git@github.com:Jewellury/NanaWrongBook.git`（你自己的仓库） | 推送 + 拉取 |
| `upstream` | `git@github.com:wttwins/wrong-notebook.git`（对方原始仓库） | 只拉取，不推送 |

```
你电脑上的代码
    ↙              ↘
  push              pull (偶尔)
   ↓                  ↑
origin              upstream
你的 GitHub         对方 GitHub
(Jewellury/         (wttwins/
 NanaWrongBook)      wrong-notebook)
```

---

## 2. 三分支模型

### 2.1 三条分支，各司其职

| 分支 | 用途 | 推送到 origin？ | 说明 |
|------|------|:--:|------|
| `dev` | 日常开发 | ✅ | 频繁提交、半成品代码在这。90% 时间你在这里工作 |
| `main` | 稳定版本 | ✅ | 只放测试通过、能跑的代码。从 dev 合进来 |
| `sync-upstream` | 临时同步分支 | ❌ | 只在拉取上游更新时创建，用完即删 |

### 2.2 为什么这样分

```
你的 origin 仓库（Jewellury/NanaWrongBook）
├── main          ← 只有稳定版本
├── dev           ← 你的所有开发提交
└── (sync-upstream 只在本地，不推)

你的 origin 仓库历史永远是干净的：
- main 的提交 = 你的稳定版本 + 上游更新（少量、清晰）
- dev 的提交 = 你的日常开发（大量、细碎）
- 两者不会混在一起
```

### 2.3 日常开发流

```
git checkout dev              # 切换到开发分支
# ... 写代码 ...
git add -A
git commit -m "做了什么"
git push origin dev           # 推到你的 GitHub

# 当 dev 上的代码稳定、测试通过、你在界面确认 OK 后：
git checkout main
git merge dev                 # dev 的稳定成果合入 main
git push origin main          # main 也推上去
```

---

## 3. 同步上游的完整规程

这是偶尔才做的事（对方发布了值得同步的更新时）。**每一步执行前先告诉我，我确认后再动手。**

### 3.1 标准流程（无冲突的理想情况）

```bash
# === 第 1 步：保存当前工作 ===
git status                          # 看看有没有没提交的改动
# 如果有，先提交：
git add -A && git commit -m "保存进度，准备同步上游"

# === 第 2 步：拉取对方最新代码（只下载，不合并） ===
git fetch upstream                  # 安全操作，只下载不动任何东西

# === 第 3 步：看看对方改了什么 ===
git log upstream/main --oneline -20 # 对方最近 20 条提交

# === 第 4 步：创建临时同步分支 ===
git checkout main                   # 从 main 出发
git checkout -b sync-upstream       # 新建临时分支 sync-upstream

# === 第 5 步：在临时分支上尝试合并 ===
git merge upstream/main             # 在这个隔离环境里合并

# === 第 6 步：检查结果 ===
# 如果第 5 步没有 CONFLICT 字样 → 自动合并成功
git diff main                       # 看看对方改了什么（只影响这个临时分支）
docker-compose up -d --build        # 跑起来确认没坏

# === 第 7 步：确认没问题，合入 main ===
git checkout main
git merge sync-upstream             # 把上游更新正式合入 main

# === 第 8 步：main 同步给 dev ===
git checkout dev
git merge main                      # dev 也拿到上游更新

# === 第 9 步：清理 ===
git branch -d sync-upstream         # 删掉临时分支

# === 第 10 步：推送到你的 GitHub ===
git push origin main
git push origin dev
```

### 3.2 第 5 步出现冲突时

```
看到 CONFLICT 字样 → 停下来 → 把终端输出完整复制给我
→ 我用大白话解释：哪个文件、哪处冲突、对方改了什么、你改了什么
→ 逐处帮你判断保留哪边
→ 解决后继续第 6 步
```

**铁律：绝不 `git merge --abort` 后强行覆盖，也不自动解决冲突。**

---

## 4. 目录原则

### 4.1 核心规则

| 规则 | 说明 |
|------|------|
| **能新增就不改旧** | 新功能优先用新文件、新目录，不碰对方已有文件 |
| **非改不可时增量添加** | 只在对方文件末尾加内容，不移动原有结构、不重排 |
| **改了要标注** | commit message 中加 `⚠️上游文件修改`，方便以后追踪 |

### 4.2 你的内容放哪里

| 内容 | 目录 | 会冲突吗 |
|------|------|:--:|
| 所有文档（方案/计划/日志/审计/进度） | `doc/` | ❌ 完全独立 |
| 三代理命令文件 | `.claude/commands/` | ❌ 完全独立 |
| AI 配置 | `.env` | ❌ 已 gitignore |
| Docker 编排 | `docker-compose.yml` | 🟡 轻微（你已改为本地构建，与上游不同） |
| 新增页面/API | `src/app/` 下新建目录 | ❌ 不冲突 |
| 新增组件 | `src/components/` 下新建文件 | ❌ 不冲突 |
| 新增数据库表 | `prisma/schema.prisma` 末尾新增 model | 🟡 小概率 |
| 启动脚本 | `docker-entrypoint.sh` | 🟡 轻微（你已修了换行符） |

---

## 5. 安全回退

```bash
# 每次合并前，记下当前位置：
git log --oneline -1
# 输出示例：8656759 fix(build): resolve TypeScript compilation errors
# 记住这串 hash（8656759）

# 万一合并搞坏了，回退到合并前：
git checkout <当时所在分支>        # 先切回那个分支
git reset --hard 8656759           # 回到合并前状态
# ⚠️ reset --hard 会丢弃之后的所有修改，谨慎使用

# 如果已经推送了坏的代码：
git revert <坏的commit-hash>       # 安全方式，不丢历史
git push origin <分支名>
```

---

## 6. 执行步骤（待确认后逐条执行）

| 序号 | 操作 | 干什么 |
|------|------|--------|
| 1 | `git remote rename origin upstream` | 把当前 origin 改名为 upstream |
| 2 | `git remote add origin git@github.com:Jewellury/NanaWrongBook.git` | 设置你自己的仓库为 origin |
| 3 | `git remote -v` | 验证：origin=你的仓库，upstream=对方仓库 |
| 4 | `git checkout -b dev` | 从当前 main 创建 dev 分支 |
| 5 | 提交当前未提交的改动 | 把 docker-compose.yml 等改动保存 |
| 6 | `git push origin main` + `git push origin dev` | 首次推送两个分支到你的 GitHub |
| 7 | 创建 doc/ 子目录 + 三代理命令文件 | 文档基建 |
| 8 | 修改 CLAUDE.md | 追加三代理规则 + Git 规范 + 安全铁律 |

---

## 7. 日常操作速查卡

| 场景 | 命令 |
|------|------|
| 每天开始开发 | `git checkout dev` |
| 保存改动 | `git add -A && git commit -m "描述"` |
| 推到自己的 GitHub | `git push origin dev` |
| dev 稳定后合入 main | `git checkout main && git merge dev && git push origin main` |
| 看看对方有没有更新 | `git fetch upstream && git log upstream/main --oneline -5` |
| 同步上游（完整流程） | 见第 3 节，每步告诉我 |
| 看看工作区状态 | `git status` |
| 看看提交历史 | `git log --oneline -20` |
