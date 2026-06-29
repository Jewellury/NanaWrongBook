# 腾讯云香港服务器部署 · 执行日志

> 关联文档: docker-compose.yml, Dockerfile, docker-entrypoint.sh
> 开始时间: 2026-06-29
> 目标服务器: 119.28.42.208 (Ubuntu 22.04 LTS)
> 目标域名: nana.nanatop.xyz → 119.28.42.208

## 整体状态

| Step | 描述 | 状态 |
|------|------|:----:|
| 1 | 服务器初始化 | ✅ 完成 |
| 2 | 拉取项目 | ✅ 完成 |
| 3 | 配置 .env | ✅ 完成 |
| 4 | 构建并启动（HTTP 测试） | ❌ 阻塞（见 Step 4 问题记录） |
| 5 | 配置 Caddy + HTTPS | ⬜ 未开始（依赖域名审核） |
| 6 | 防火墙 + 备份脚本 | ⬜ 未开始 |
| 7 | 全链路验证 | ⬜ 未开始 |

---

## Step 1：服务器初始化

**执行时间**: 2026-06-29 19:59
**状态**: ✅ 完成

### 执行记录
- SSH 连接服务器 119.28.42.208（root, Ubuntu 22.04 LTS）
- `apt update && apt upgrade`（系统已是最新）
- 安装 Docker（curl -fsSL https://get.docker.com | sh）
- Docker Compose 插件已内置
- **Docker 版本**: 29.6.1
- **Docker Compose 版本**: v5.2.0

### 遇到问题
- 无

---

## Step 2：拉取项目

**执行时间**: 2026-06-29 20:05
**状态**: ✅ 完成

### 执行记录
- 克隆到 `/opt/nana`
- 创建 `data/` 和 `backups/` 目录
- **当前分支**: dev（commit `df87945`，含 Phase 1-3 全部代码）

### 遇到问题
- 最初切到 `main` 分支，但 Phase 1-3 代码在 `dev` 上。已切回 `dev`

---

## Step 3：配置 .env

**执行时间**: 2026-06-29 20:10
**状态**: ✅ 完成

### 执行记录
- `openssl rand -base64 32` 生成 `NEXTAUTH_SECRET`
- 写入 `/opt/nana/.env`
- bash history 已清除

---

## Step 4：构建（阻塞中）

**执行时间**: 2026-06-29 20:15~20:40
**状态**: ❌ 阻塞——TypeScript 编译错误

### 错误 1：prisma/seed_graph.ts 路径解析失败

```
./prisma/seed_graph.ts:20:8
Type error: Cannot find module '../doc/research/seed_graph_batch1'
```

**根因**：`tsconfig.json` `include: ["**/*.ts"]` 将 `prisma/` 目录纳入类型检查。`seed_graph.ts` 引用 `doc/research/seed_graph_batch1`，在 Docker 纯净环境中解析失败（本地有增量缓存所以没暴露）。

**修复**：`tsconfig.json` 的 `exclude` 追加 `"prisma"` 和 `"scripts"`。

### 错误 2：initial/route.ts 类型 error

```
./src/app/api/diagnosis/initial/route.ts:115:26
Argument of type 'unknown' is not assignable to parameter of type 'string | undefined'.
```

**根因**：`main` 分支上已有的类型问题——`logger.error('初诊失败', error)` 中 `error` 类型 `unknown`，不匹配 logger 的签名。`dev` 分支上已有修复但 `main` 未同步。

**修复**：将 `error` 用 `String(error)` 包裹。正在重新构建验证。

### 核心教训

1. **`main` 分支的 build 是坏的**。Phase 1-3 的 `dev` 代码包含 `tsconfig.json` 排除和类型修复，但 `main` 分支没有同步这些修复。部署前应先确认 `main` 分支的 CI 构建能通过。
2. **Docker 构建 vs 本地构建不一致**：本地 `npm run build` 因为增量缓存能通过，但 Docker 是从零构建，所有文件都被编译，更容易暴露隐式路径依赖。
3. **需要完善 `main`←`dev` 的合并纪律**：`dev` 上修复的类型问题应尽快合入 `main`，否则服务器拉 `main` 就卡住。

---

## 未开始步骤

| Step | 依赖条件 |
|------|---------|
| 5 配置 Caddy + HTTPS | 域名 `nana.nanatop.xyz` 实名审核通过 + Step 4 构建成功 |
| 6 防火墙 + 备份脚本 | 可随时开始，不依赖其他步骤 |
| 7 全链路验证 | 依赖 Step 4-6 全部完成 |
