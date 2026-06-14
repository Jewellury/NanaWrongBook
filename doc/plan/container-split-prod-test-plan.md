# 容器分层方案 · 开发计划

> 关联规格: doc/reference/TECH_PLAN_v2.md §8.5 数据安全与环境隔离
> 计划日期: 2026-06-14
> 预计影响: docker-compose.test.yml（新增）、.env.test.example（新增）、.gitignore（修改）、docker-compose.yml（不改）、Dockerfile（不改）

## 1. 大白话概述

当前问题：整个项目只有一个 Docker 容器，既是生产运行环境、又是开发测试环境。每次跑测试都要「手动拷文件进容器 → 进容器跑命令 → 拷结果出来」，而且测试直接读写生产数据库 `/app/data/dev.db`。这违反 TECH_PLAN_v2 §8.5 "生产/开发环境隔离"原则——一旦测试脚本写坏数据，她的知识地图就没了。

本轮要做的事：新增一个独立的「一次性测试容器」，和生产容器完全隔离。

- **生产容器**：原封不动。还是 `docker-compose up -d`，跑 Next.js + Prisma runtime，读写 `./data/dev.db`。
- **测试容器**：新增 `docker-compose.test.yml`，用 `node:22-alpine` 基础镜像临时挂载代码，跑 `npm ci` → `prisma generate` → `migrate deploy` → `seed` → `vitest`。读写独立的 `./data/test/test.db`，碰不到生产库一根毫毛。
- **用完即弃**：测试跑完 `docker compose -f docker-compose.test.yml down -v`，不残留任何东西。

## 2. 两种方案比较

### 方案 A：独立 docker-compose.test.yml + node:22-alpine

```
docker-compose.test.yml
  └─ services:
       test:
         image: node:22-alpine
         volumes: .:/app, /app/node_modules, ./data/test:/app/data
         env_file: .env.test
         command: sh -c "npm ci && npm run test:unit && npm run test:integration"
```

| 优点 | 缺点 |
|------|------|
| 不依赖现有 Dockerfile 构建缓存 | 每次 `npm ci` ∼2 分钟 |
| 生产容器完全不知测试的存在 | 需要单独维护一个 compose 文件 |
| 镜像层干净（node:22-alpine 官方维护） | |
| 测试数据库物理隔离（`./data/test/` vs `./data/`） | |

### 方案 B：复用 Dockerfile builder stage

在现有 Dockerfile 里给 builder stage 加个名字，然后：

```
docker compose run --rm -e DATABASE_URL=file:/app/data/test.db test
```

| 优点 | 缺点 |
|------|------|
| 复用现有 `npm ci`，不重复安装 | builder stage 的 Prisma migrate 用的是生产 DB 路径，要覆盖环境变量 |
| 不新增 compose 文件 | 每次改 Dockerfile 影响生产构建 |
| | runner stage 已删 devDependencies，要单独保留 builder stage 镜像 |
| | 耦合度高，改 Dockerfile 容易把生产构建搞坏 |

### 推荐：方案 A

本项目 Dockerfile 的 `builder` stage 里跑了 `prisma migrate deploy`（面向生产库），要复用 builder 就必须覆盖一堆环境变量，还给生产构建引入风险。方案 A 用全新的 `node:22-alpine`、全新的 compose 文件、全新的数据目录，隔离最彻底，出错最容易排查。2 分钟的 npm ci 开销完全可以接受。

## 3. 任务分解

- [ ] 任务1: 新增 `.env.test.example`（模板文件，提交 git）+ 用户本地创建 `.env.test`（不入库）
- [ ] 任务2: 新增 `docker-compose.test.yml`（独立测试服务，含 `/app/node_modules` 匿名卷防污染）
- [ ] 任务3: 修改 `.gitignore`（确认 `.env.test` 在忽略列表中）
- [ ] 任务4: 验证隔离性（跑测试 + PowerShell 对比生产库时间戳）

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| .env.test.example | 新增 | 测试环境变量模板（提交 git），用户复制为 `.env.test` 后使用 |
| .env.test | 用户本地创建 | 不入库（.gitignore 已覆盖 `.env*`），从 example 复制 |
| docker-compose.test.yml | 新增 | 独立测试容器定义，含 `/app/node_modules` 匿名卷 |
| .gitignore | 修改 | 确认 `.env.test` 不会被误提交 |
| docker-compose.yml | 不改 | 生产容器原封不动 |
| Dockerfile | 不改 | 不碰多阶段构建 |

## 5. 设计决策

### 决策①：.env.test 不入库，提交 .env.test.example

按安全铁律 4（密钥不入 git），`.env.test` 绝不能提交。哪怕里面是占位 key，也别养成 env 文件入库的习惯。

做法：提交 `.env.test.example`（模板），真实 `.env.test` 由用户本机 `cp .env.test.example .env.test` 创建。`.gitignore` 已有 `.env*` 规则，确认 `.env.test` 被覆盖即可。

### 决策②：测试数据库路径

`DATABASE_URL="file:/app/data/test.db"`，宿主机实为 `./data/test/test.db`。

测试 docker-compose 挂载 `./data/test:/app/data`（不是 `./data:/app/data`），所以容器内只能看到 `test.db`，不可能碰到 `dev.db`。

### 决策③：node 镜像版本

用 `node:22-alpine`（与现有 Dockerfile 的 base image 一致，版本对齐）。

### 决策④：测试流程

测试容器的 command 按顺序执行，任一步失败立即退出（`&&` 链）：

```bash
npm ci \
  && npx prisma generate \
  && npx prisma migrate deploy \
  && npm run seed \
  && npm run test:unit \
  && npm run test:integration
```

### 决策⑤：node_modules 匿名卷防宿主机污染

测试容器挂载 `.:/app` 后 `npm ci` 会在宿主机生成/改动 `node_modules`，污染开发目录。

更干净的做法：加一个匿名卷 `/app/node_modules`，依赖装在容器卷里不写回宿主机：

```yaml
volumes:
  - .:/app
  - /app/node_modules          # 匿名卷：依赖隔离，不污染宿主机
  - ./data/test:/app/data
```

### 决策⑥：覆盖范围

- `test:unit`：19 纯单元用例。理论不依赖数据库，但 `prisma generate` 是必须的前置。
- `test:integration`：8 集成用例（连测试库）。seed 必须先跑。
- 不跑 `test:e2e`（Playwright），本轮无 UI。

### 决策⑦：测试容器清理

`docker compose -f docker-compose.test.yml down -v` 清理容器和匿名卷（含 `/app/node_modules`），但 `./data/test/test.db` 是 bind mount，`down -v` 不会删它。

清理测试数据库需单独执行（这是删除操作，按安全铁律 1 必须先确认）：

```powershell
Remove-Item -Recurse -Force .\data\test
```

### 决策⑧：生产库未污染验证方式

测试前后各跑一次，对比 `LastWriteTime`（Windows，非 Linux `stat`）：

```powershell
Get-Item .\data\dev.db | Select-Object FullName, Length, LastWriteTime
```

测试后时间戳与测试前一致 → 隔离通过。

## 6. 验收标准

- [ ] `.env.test.example` 已提交 git，`.env.test` 不在 `git status` 中
- [ ] `docker compose up -d` 生产容器正常启动，访问 `localhost:3001` 返回页面
- [ ] `docker compose -f docker-compose.test.yml up --abort-on-container-exit` 执行全部测试
- [ ] 测试输出中 `npm run test:unit` 全部通过
- [ ] 测试输出中 `npm run test:integration` 全部通过
- [ ] 宿主机 `node_modules` 未被测试容器改动（匿名卷隔离验证）
- [ ] 生产数据库 `./data/dev.db` LastWriteTime 未变化（PowerShell 对比测试前后）
- [ ] 生产容器在测试全程未被 stop/restart

## 7. 风险与注意事项

| 风险 | 影响 | 对策 |
|------|------|------|
| WSL2 仍不可用 | 什么容器都跑不了 | WSL 修好后先验证生产容器能启动，再跑测试容器 |
| `npm ci` 每次下载全量依赖 | 测试慢 2 分钟 | 可接受；匿名卷 `/app/node_modules` 缓存，同容器重跑不复装 |
| `.env.test.example` 里的占位 key 忘了改 | 集成测试调用 AI 可能报错 | 集成测试不调 AI API，占位 key 足够；如需调 AI 则在 `.env.test` 填真 key |
| `./data/test` 残留未清理 | 占用磁盘约 1-5MB | 执行 `Remove-Item -Recurse -Force .\data\test`（先确认） |
| 当前 WSL 问题未解决 | 两个计划都无法验证 | 本计划输出后可先存档，等 WSL 恢复再执行 |

## 8. 技术附录

### 8.1 .env.test.example（提交 git）

```bash
# ========== 测试数据库 ==========
# 使用独立数据库文件，绝不碰生产库 ./data/dev.db
DATABASE_URL="file:/app/data/test.db"

# ========== NextAuth（测试占位）==========
NEXTAUTH_SECRET="test-secret-do-not-use-in-prod"

# ========== AI 配置（占位，prisma generate 需要）==========
AI_PROVIDER="openai"
OPENAI_API_KEY="sk-test-placeholder"
OPENAI_BASE_URL="https://api.deepseek.com/v1"
OPENAI_MODEL="deepseek-chat"

# ========== 日志 ==========
LOG_LEVEL="error"
```

**用户本地操作**：

```bash
# bash（Git Bash / WSL）
cp .env.test.example .env.test

# 或 PowerShell
# Copy-Item .env.test.example .env.test
```

（`.env.test` 已被 `.gitignore` 忽略，不入库）。

### 8.2 docker-compose.test.yml

```yaml
# 测试专用容器 —— 一次性 test runner
# 使用方式：
#   cp .env.test.example .env.test    # 首次使用前创建（已创建则跳过）
#   docker compose -f docker-compose.test.yml up --abort-on-container-exit
#   docker compose -f docker-compose.test.yml down -v

services:
  test:
    image: node:22-alpine
    container_name: nana-test-runner
    working_dir: /app
    env_file:
      - .env.test
    volumes:
      - .:/app                              # 挂载全部代码
      - /app/node_modules                   # 匿名卷：依赖隔离，不污染宿主机
      - ./data/test:/app/data               # 测试数据库独立目录（隔离生产 ./data/dev.db）
    command: >
      sh -c "
        echo '=== 安装依赖 ===' &&
        npm ci &&
        echo '=== 生成 Prisma Client ===' &&
        npx prisma generate &&
        echo '=== 运行迁移（测试库）===' &&
        npx prisma migrate deploy &&
        echo '=== 灌入种子数据 ===' &&
        npm run seed &&
        echo '=== 纯单元测试 ===' &&
        npm run test:unit &&
        echo '=== 集成测试（连测试库）===' &&
        npm run test:integration &&
        echo '=== 全部通过 ✅ ==='
      "
```

### 8.3 使用命令

```bash
# === 首次准备（仅一次）===
cp .env.test.example .env.test              # 创建本地 env（不入库）

# === 生产容器（不变）===
docker compose up -d                          # 启动生产容器
docker compose down                           # 停止生产容器

# === 测试容器（新增）===
# 跑全部测试（任一步失败立即停）
docker compose -f docker-compose.test.yml up --abort-on-container-exit

# 如果只想跑单元测试：
docker compose -f docker-compose.test.yml run --rm test \
  sh -c "npm ci && npx prisma generate && npm run test:unit"

# 如果只想跑集成测试：
docker compose -f docker-compose.test.yml run --rm test \
  sh -c "npm ci && npx prisma generate && npx prisma migrate deploy && npm run seed && npm run test:integration"

# 清理测试容器和匿名卷
docker compose -f docker-compose.test.yml down -v
```

### 8.4 验证生产库未被污染

```powershell
# === 测试前 ===
Get-Item .\data\dev.db | Select-Object FullName, Length, LastWriteTime

# 跑测试
docker compose -f docker-compose.test.yml up --abort-on-container-exit

# === 测试后 ===
Get-Item .\data\dev.db | Select-Object FullName, Length, LastWriteTime
# 预期：LastWriteTime 与测试前一致
```

### 8.5 清理测试数据库

`down -v` 清的是匿名卷，不删 bind mount `./data/test`。手动清理需执行（这是删除操作，按安全铁律 1 必须先向用户确认）：

```powershell
Remove-Item -Recurse -Force .\data\test
```

### 8.6 回滚方式

零成本回退：

```bash
# 删除测试用文件
rm .env.test
rm .env.test.example
rm docker-compose.test.yml
rm -rf ./data/test

# 生产容器不受任何影响
```

### 8.7 commit 计划

| # | commit 消息 | 内容 |
|---|------------|------|
| ① | `feat: 新增独立测试容器` | .env.test.example + docker-compose.test.yml + .gitignore 确认 |
