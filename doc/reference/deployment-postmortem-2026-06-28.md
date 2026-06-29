# 部署复盘 · 2026-06-28 首次远程访问调试

> 目标：让外甥女用手机访问 `/nana` 全链路。结果：本地可以，远程穿透失败。
> 文档记录三重障碍和未来方案，供下次部署参考。
> **发现隐藏条件：全程 VPN 开启，境内网络 + VPN 拦截双重叠加，所有隧道方案均不可行。**

---

## 隐藏条件（2026-06-29 发现）

用户在调试全程开启了 VPN。VPN 导致以下系统性失败：

| 症状 | 根因 |
|------|------|
| Serveo DNS 解析到 `198.18.1.95`（本地拦截地址） | VPN 客户端接管 DNS，将 Serveo 指向本地代理 |
| npm registry `ECONNRESET` | VPN 路由导致 npm 请求超时或重置 |
| Cloudflare Tunnel Error 1033 | 7844 端口流量被 VPN 策略拦截 |
| 上述错误间歇性出现 | VPN 路由动态变化，部分请求可能通过、部分被拦截 |

**教训**：排查网络问题时必须先确认 VPN 状态。VPN 开启时，所有公网隧道/穿透方案都可能不可靠。

---

## 三重独立障碍

### 1. Docker Desktop + WSL2 Pipe 间歇性断连

**现象**：
```
connect ENOENT \\.\pipe\dockerDesktopEngine
```
Docker Desktop UI 能打开（容器列表可见），但 Engine 通信管道 `dockerDesktopEngine` 和 `dockerDesktopLinuxEngine` 均未注册。`docker compose` 命令和 UI 内的启动/停止全部失败。

**根因**：
WSL2 发行版 `docker-desktop` 状态为 Running，但 Pipe 未在预期路径创建。与 06-14 和 06-27 两次 Docker 宕机可能同源——Windows 快速启动（Fast Startup）关闭后冷关机可修复，但下次开机可能自动重启后 Pipe 又不稳定。

**解药**：
```powershell
# 方案一：关闭快速启动 + 冷关机（已验证有效，但有代价）
控制面板 → 电源按钮功能 → 确认快速启动关闭 → 关机 → 开机

# 方案二：先查状态，不要盲目冷关机
wsl -l -v
# 检查 docker-desktop 是否 Running

# 方案三：重启 Docker 服务（在找到更稳定的根因前）
wsl --shutdown
# 以管理员身份重启 Docker Desktop
```

**教训**：
1. 先查 `wsl -l -v`，确认 `docker-desktop` 发行版状态
2. 不要盲目冷关机——先重启服务试试
3. 如果 Docker Desktop 连续出现 Pipe 问题，考虑替换方案

---

### 2. 新增页面后 Docker 需显式重构建

**现象**：
`docker compose up -d` 启动的容器中，`/nana/*` 路由报 404。宿主机的 `npm run dev` 正常。

**根因**：
新增路由（`/nana/session`、`/nana/knowledge-map` 等）在旧容器的 `.next` 构建缓存中不存在。`up -d` 不会自动重新构建——它只启动已有镜像。

**解药**：
```powershell
# 强制重构建（无缓存）
docker compose build --no-cache

# 启动
docker compose up -d

# 调试时查看日志
docker logs --tail 40 wrong-notebook
```

**教训**：
1. 新增路由/组件后，Docker 容器必须显式重构建
2. 调试时先看 `docker logs --tail 40`，比单纯看浏览器 404 页面信息多

---

### 3. 网络封锁穿透端口

**现象**：
三种隧道方案全部失败：

| 方案 | 结果 | 原因 |
|------|------|------|
| Cloudflare Tunnel | ❌ Error 1033 | 国内网络封锁，7844 端口被封锁 |
| localtunnel | ❌ npm 安装超时 | 依赖 GitHub 源，被限制 |
| Serveo | ⚠️ SSH 可用 | 连接成功，但时断时续不稳定 |

**根因**：
国内网络环境对实时端口穿透工具有系统性限制。Cloudflare Tunnel 的 QUIC/HTTP3 流量特征容易被识别和封锁。localtunnel 依赖 npm registry（国内镜像不稳定）。Serveo 走 SSH 协议相对稳健但带宽低。

**解药（临时）**：
```powershell
# Serveo SSH 隧道（可用但不稳）
ssh -R 80:localhost:3000 serveo.net
```

**教训**：
1. 实时穿透在国内不可靠，不应作为长期方案依赖
2. 需要直接部署到有公网 IP 或 CDN 的平台

---

## 未来方向

| 方案 | 代价 | 适用阶段 |
|------|------|----------|
| **Serveo SSH 隧道（救急）** | 不稳定，带宽低 | 临时演示 |
| **Vercel 免费部署（推荐中期）** | 需 SQLite → 云数据库（如 Turso/Neon） | 真实验证期 |
| **frp + 国内 VPS（备选）** | 月费 ~30 元，需配置 frp 客户端 | 长期运营 |
| **Docker + Cloudflare Tunnel（原方案）** | 依赖外部隧道，国内封锁风险 | 仅限非中国大陆使用 |

### 推荐路线

1. **短期（本周）**：Serveo 救急隧道 或 把本地 `npm run dev` 跑起来直接用
2. **中期（1-2 周）**：迁移到 Vercel（免费，Next.js 原生支持，国内部分地区可直连）
   - 代价：SQLite 需替换为 Turso（SQLite 兼容的边缘数据库）或 Neon（PostgreSQL）
   - 收益：真实验证期完全无阻，不用依赖你本机开机
3. **长期**：如果真实验证通过，考虑 frp + 国内 VPS

---

## 新增纪律

1. **新增路由后**：`docker compose build --no-cache && docker compose up -d`
2. **容器异常**：先 `docker logs --tail 40` 查看日志
3. **测试容器 compose command**：新增测试脚本时同步更新
4. **访问前端**：必须加 `/nana` 路径前缀（`http://localhost:3000/nana`）

---

## 2026-06-29 更新：VPN 关闭后成功

关闭 VPN 后，使用以下方案成功上线：

1. **本地服务**：`npm run build && npm run start -- -p 3003`（**生产模式**，dev 模式不行）
2. **隧道**：`ssh -R 80:localhost:3003 serveo.net`
3. **访问**：`https://<hash>.serveousercontent.com/nana` ✅ 可打开

**关键发现**：
- **dev 模式（`next dev`）** 通过 Serveo 转发返回 502 — 即使本地 200。生产模式（`next start`）正常
- VPN 关闭是必要条件——VPN 开启时 Serveo DNS 被劫持到 `198.18.x.x`

### 最终部署命令

```powershell
cd E:\nana
taskkill /f /im node.exe
npm run build
npm run start -- -p 3003
# 新开窗口：
ssh -R 80:localhost:3003 serveo.net
```
> 关联文档：`doc/guide/deployment-guide.md`（原部署指南，建议后续按此复盘修订）
