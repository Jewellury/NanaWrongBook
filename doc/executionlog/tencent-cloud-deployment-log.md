# 腾讯云香港服务器部署 · 执行日志

> 关联文档: `docker-compose.prod.yml`, `Caddyfile`, `backup.sh`, `.github/workflows/build-and-push.yml`
> 执行时间: 2026-06-29~30
> 目标服务器: 119.28.42.208 (Ubuntu 22.04 LTS)
> 目标域名: nana.nanatop.xyz → 119.28.42.208
> 部署路线: CI 镜像构建 → GHCR → 服务器 pull 运行（废弃原"服务器 build"方案）

---

## 整体状态

| Step | 描述 | 状态 |
|------|------|:----:|
| 0 | CI 方案拍板 | ✅ Phase 0 五问已确认 |
| 1 | 服务器迁移（新方案） | ✅ 无旧容器/旧数据，直接部署 |
| 2 | GitHub Actions CI 配置 | ✅ `build-and-push.yml` |
| 3 | CI 首次运行 | ✅ 通过，镜像已推送到 GHCR |
| 4 | 服务器 pull + HTTPS | ✅ Caddy 证书已签发，HTTPS 可达 |
| 5 | 备份 crontab | ⬜ 待安装 |
| 6 | 真机测试 | ⬜ 待执行（需外甥女手机） |

---

## Step 0：CI 方案确认

**时间**: 2026-06-30
**状态**: ✅ Phase 0 五问全部 "Yes"

Phase 0 五个确认问题：
1. 切换为 CI 镜像构建方案 → **是**
2. 镜像仓库首选 GHCR → **是**
3. CI 首期门禁：`build + test container` → **是**
4. 生产 compose 分拆为 `docker-compose.prod.yml` → **是**
5. Tag 策略含 `sha-<短sha>` + `latest` → **是**

---

## Step 1：本地准备

**时间**: 2026-06-30 07:00
**状态**: ✅ 完成

### 创建的文件
| 文件 | 用途 |
|------|------|
| `docker-compose.prod.yml` | 生产 compose：image 方式拉取，不 build，含 Caddy 反代 |
| `Caddyfile` | Caddy 配置：`nana.nanatop.xyz → reverse_proxy wrong-notebook:3000` |
| `backup.sh` | SQLite 备份脚本，保留 14 天。首次部署无 DB 时 exit 0 |
| `.github/workflows/build-and-push.yml` | CI 门禁：push main 触发 → `npm ci` → `prisma generate` → `npm run build` → `test container` → `docker build` → `docker push GHCR` |

### 已存在的相关文件
| 文件 | 说明 |
|------|------|
| `Dockerfile` | `node:22-alpine` → `output: standalone` → 包含 migrate/seed/entrypoint |
| `docker-compose.test.yml` | 测试容器复用（CI 中 `cp .env.test.example` 后启动） |

---

## Step 2：GitHub Actions CI 首次运行

**时间**: 2026-06-30 07:03~07:06
**状态**: ✅ 通过（首次镜像推送到 GHCR）

### CI 记录
| 项目 | 值 |
|------|-----|
| Commit | `83575b6` |
| 镜像 tag | `sha-83575b6`, `20260629-230627`, `latest` |
| GHCR 地址 | `ghcr.io/jewellury/nanawrongbook` |
| 认证方式 | `GITHUB_TOKEN`（write:packages） |
| 服务器拉取 | classic PAT（`read:packages`） |

### 修复记录
| 问题 | 根因 | 修复 |
|------|------|------|
| bcryptjs 运行时缺失 | `output: standalone` 未跟踪 bcryptjs | `next.config.ts` 加 `outputFileTracingIncludes`（commit `6c2563e`） |
| outputFileTracingIncludes 编译错 | Next.js 16 已移出 `experimental` | 放到顶层配置（commit `6c2563e`） |
| backup.sh 首次空库误报 | sqlite3 对不存在的 DB 创建空文件 | 加 `[ ! -f "$DB_PATH" ]` 保护（commit `c51d631`） |

---

## Step 3：服务器部署

**时间**: 2026-06-30 08:30
**状态**: ✅ 完成

### 执行记录
```bash
# 服务器初始化
apt install -y sqlite3
mkdir -p /opt/nana/{data,backups,config}

# GHCR 认证
echo '<PAT>' | docker login ghcr.io -u Jewellury --password-stdin

# git 同步
cd /opt/nana && git checkout main && git pull origin main

# 备份（首次自动 skip）
bash backup.sh

# 拉取 + 启动
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### 验证结果
| 检查项 | 结果 |
|--------|:----:|
| `docker ps -a` | ✅ wrong-notebook + caddy 均运行 |
| `docker logs wrong-notebook` | ✅ Next.js 16.0.10 ready in 132ms, Admin seed 成功 |
| `docker exec node -e "require('bcryptjs')"` | ✅ `bcryptjs ok` |
| `docker exec caddy curl -skI https://nana.nanatop.xyz/nana --resolve ...:443:127.0.0.1` | ✅ HTTP/2 307 → `/login`，Caddy 证书有效 |
| `docker exec caddy wget -q -O- http://wrong-notebook:3000/nana` | ✅ 返回完整登录页 HTML |
| 外部 HTTP (via IP) | ✅ 308 → HTTPS 跳转 |
| 外部 HTTPS | 需手机移动数据验证（本终端 DNS 被 198.18.x.x 拦截） |

### 容器状态
```
CONTAINER ID   IMAGE                                    STATUS         PORTS
e7b89f7eed79   ghcr.io/jewellury/nanawrongbook:latest   Up 8 seconds   3000/tcp
3d03e25ec5ce   caddy:2-alpine                           Up 1 hour      0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

### 已知限制
- 本终端 DNS 被 198.18.x.x 拦截，无法从本机验证 HTTPS
- HTTPS 通过服务器内部 caddy curl 和 Let's Encrypt 日志确认证书有效
- 真机测试须从外甥女手机浏览器访问 `https://nana.nanatop.xyz/nana`

---

## Step 5：备份 crontab

### 待执行
```bash
crontab -e
# 添加:
0 2 * * * /opt/nana/backup.sh
```

---

## 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 部署路线 | **CI 镜像构建 → GHCR → 服务器 pull** | 废弃服务器 build（慢、不可回滚、OOM 风险） |
| 镜像仓库 | **GHCR** | GitHub 原生集成，无需额外注册 |
| 生产 compose | **`docker-compose.prod.yml` 独立** | 开发用 build，生产用 image，不混淆 |
| Caddy 位置 | **同一 compose 内** | 一站式启动 |
| 镜像可见性 | **private + PAT** | 首期安全；可后续改为 public 简化运维 |
| Tag 策略 | **`sha-<短sha>` + `latest`** | sha 做精确回滚点 |

---

## 回滚指南

```bash
# 1. 查看当前镜像
docker inspect wrong-notebook --format '{{.Config.Image}}'

# 2. 切换到上一版本
echo 'NANA_IMAGE=ghcr.io/jewellury/nanawrongbook:sha-<上一个sha>' >> /opt/nana/.env

# 3. 备份数据库
bash backup.sh

# 4. 重启
docker compose -f docker-compose.prod.yml up -d
```
