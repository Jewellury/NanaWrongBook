# Docker Desktop "Starting Engine" 故障排查指南

> 现象：Docker Desktop 一直显示 "Starting engine"，永不就绪。
> `docker version` / `docker info` 超时。`wsl -l -v` 无 `docker-desktop` 发行版。

---

## 当前策略更新（CI 镜像部署后）

项目已切换到 CI 镜像部署路线（本地推代码 → GitHub Actions 构建并跑测试容器 → 推 GHCR → 服务器 pull 运行）。策略变化：

- **Docker Desktop 仍可用于本地测试容器，但不再是部署上线的硬前置条件。**
- 如果卡在 "Starting Engine"：可以按下方方案排查，但**不要让本地 Docker 长时间阻塞业务开发**。
- 若本地 `npm.cmd run build` 已通过，可将测试容器门禁交由 GitHub Actions 执行——CI 用同样的 `docker-compose.test.yml`、同样的 test.db 隔离、同样的护栏，且每次推 main 都自动跑。
- **GitHub Actions 测试容器通过前，不得部署到服务器。**
- **禁止用生产容器替代测试容器**：即便本地 Docker 起不来，也绝不可退守 `docker exec wrong-notebook npx vitest` 或对生产库跑测试。

下方排查方案仍有效，作为"本地能修就修、修不好就交 CI"的参考。

---

## 根因

`com.docker.service`（Docker 后台服务）处于 **Stopped** 状态，或 WSL 2 的 `docker-desktop` 发行版损坏/丢失。

Docker Desktop 的 UI 进程能启动，但引擎（dockerd）依赖的 WSL 2 后端没有就绪，导致一直卡在 "starting engine"。

最常见的深层原因：**Windows 快速启动（Fast Startup）**开启时，"关机"不是真正的冷启动——它只注销用户 + 休眠内核，WSL 内核和 Docker 的 WSL 发行版会被恢复成半启动状态。反复半启动积累后，发行版数据损坏。

---

## 排查方法

```powershell
# 1. 检查 Docker 服务状态
Get-Service com.docker.service | Format-Table Name,Status,StartType
# 正常应为 Running | Manual

# 2. 检查 WSL 发行版
wsl -l -v
# 正常应有 docker-desktop 和 docker-desktop-data，均为 Running

# 3. 检查 Docker 引擎
docker version
# 不应超时
```

---

## 标准修复流程（按顺序，先试前面的）

### 方案 A：关闭快速启动 + 冷关机（成功率最高，推荐优先）

```
1. 控制面板 → 电源选项 → 选择电源按钮的功能
2. 点击"更改当前不可用的设置"
3. 取消勾选"启用快速启动（推荐）"
4. 保存 → 关机（开始菜单 → 关机）
5. 开机后手动打开 Docker Desktop
6. 等待 1-2 分钟，执行 wsl -l -v 确认
```

**原理**：快速启动开启时，Windows 的"关机"≠冷启动。关闭后"关机"才是真正的完整关机，WSL 内核完全重置，Docker 能重新创建干净的 WSL 发行版。

### 方案 B：手动清理 WSL 发行版 + 重启服务（方案 A 无效时）

```powershell
# 1. 清理 Docker WSL 发行版
wsl --shutdown
wsl --unregister docker-desktop
wsl --unregister docker-desktop-data

# 2. 重启 WSL 服务
Restart-Service LxssManager -Force

# 3. 启动 Docker 服务
Start-Service com.docker.service

# 4. 打开 Docker Desktop（开始菜单）
# 等待它重新创建 WSL 发行版
```

### 方案 C：重置 Docker Desktop 设置（最后手段）

```
Docker Desktop 图标 → Troubleshoot → Reset to factory defaults
```

这会丢失所有镜像/容器/配置，慎用。

---

## 验证标准

```powershell
wsl -l -v
# 必须看到 docker-desktop 和 docker-desktop-data

docker version
# Server 行不应超时

docker compose -f docker-compose.test.yml up --abort-on-container-exit
# 测试容器应正常跑完，退出码 0
```

---

## 本项目的 Docker 配置

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 生产容器，端口 3001 |
| `docker-compose.test.yml` | 测试容器（隔离库 ./data/test/test.db） |
| `docker-compose.https.yml` | HTTPS 容器 |
| `Dockerfile` | Alpine 基础镜像，Node 22 |
| `.env.test` / `.env.test.example` | 测试环境变量 |

### 关键约束

- 所有测试**必须**在测试容器跑：`docker compose -f docker-compose.test.yml up --abort-on-container-exit`
- 禁止 `docker exec` 进生产容器跑测试（M2 污染事故教训）
- 测试容器内流程：`npm ci` → `prisma migrate deploy` → `npm run seed` → `npm run test:all`

---

## 历史事故记录

| 日期 | 事件 | 根因 | 解决 |
|------|------|------|------|
| 2026-06-14 | Docker Desktop 执行末期宕机 | 未知（疑似 Fast Startup） | 先提交代码，Docker 恢复后补验 |
| 2026-06-14 | M2 生产库污染 | 测试容器未包含 M2 脚本，执行代理退守 prod 容器 | 事故复盘 → test:all 聚合脚本 + agent 规则固化 |
| 2026-06-27 | Docker Desktop starting engine 卡死 | Fast Startup 开启，WSL docker-desktop 发行版损坏 | 关闭 Fast Startup → 冷关机 → 开机后正常 |
