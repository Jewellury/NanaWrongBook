# Nana 移动端 E2E 自动化 · 部署日志

> 日期: 2026-07-04
> 关联审计: doc/auditlog/mobile-automation-audit.md
> PR: [#1 dev→main](https://github.com/Jewellury/NanaWrongBook/pull/1)

## 部署记录

### 1. PR 合并

| 项目 | 值 |
|------|-----|
| PR | #1 dev→main (merge commit) |
| 合并方式 | merge commit |
| 合并时间 | 2026-07-04 |

### 2. Commit 记录

| 项目 | 值 |
|------|-----|
| 本地 main commit (合并前) | `27d820a` |
| origin/main commit (合并后) | `02c4cc8` |
| 服务器 commit (部署前) | `27d820a` |
| 服务器 commit (部署后) | `02c4cc8` |
| 本地 / origin / 服务器一致性 | ✅ 三方一致，均为 `02c4cc8` |

### 3. GitHub Actions CI

| Workflow | Run ID | 状态 | 说明 |
|----------|--------|------|------|
| CI (main push) | `28700544979` | ✅ success | Unit + Integration + Build + E2E 全通过 |
| Build and Push | `28700544989` | ✅ success | 测试容器通过 + Docker 镜像推 GHCR |

### 4. Docker 镜像

| 项目 | 值 |
|------|-----|
| 镜像仓库 | `ghcr.io/jewellury/nanawrongbook` |
| 镜像 tag | `sha-02c4cc8`（对应 main commit） |
| 同时推送 | `latest` + 时间戳 tag |
| 镜像来源 | GitHub Actions 构建，非本地 Docker |

### 5. 服务器部署

| 项目 | 值 |
|------|-----|
| 服务器 | 119.28.42.208 |
| 部署脚本 | `scripts/deploy.sh` |
| 部署时间 | 2026-07-04 16:39:57 |
| 部署分支 | main |
| commit 变更 | `27d820a → 02c4cc8` |
| wrong-notebook 容器 | Up 5 seconds ✅ |
| caddy 容器 | Up 4 days ✅ |

### 6. SQLite 备份

| 项目 | 值 |
|------|-----|
| 备份方式 | cp 快速备份 + backup.sh sqlite3 快照 |
| 备份目录 | `backups/` |
| 备份文件名 | `prod-<timestamp>.db`（由 deploy.sh 自动生成） |
| 备份状态 | ✅ 完成（deploy.sh step 5/8） |

### 7. HTTPS 健康检查

| 项目 | 值 |
|------|-----|
| URL | `https://nana.nanatop.xyz/nana` |
| HTTP 状态码 | 200 ✅ |
| 检查方式 | PowerShell Invoke-WebRequest |

### 8. 生产 Smoke Test

| 项目 | 值 |
|------|-----|
| Workflow | smoke-test.yml |
| Run ID | `28700841325` |
| 触发方式 | workflow_dispatch (reason: 部署后验证 02c4cc8) |
| 状态 | ✅ success |
| 验证内容 | 登录 → /nana → 三入口 → 知识地图（只读） |

## 部署总结

全流程通过，生产环境已更新到 `02c4cc8`：

1. ✅ PR #1 合并 dev→main
2. ✅ CI 4 项全绿（Unit / Integration / Build / E2E）
3. ✅ Build and Push 全绿（测试容器 + Docker 镜像推 GHCR）
4. ✅ 服务器备份 SQLite + pull 新镜像 + 重启容器
5. ✅ HTTPS 健康检查 200
6. ✅ 生产 Smoke Test 通过

## 回滚方案

如需回滚：
1. 查看可用备份: `ls -lh backups/`
2. 恢复数据库: `cp backups/prod-<timestamp>.db data/dev.db`
3. 回滚镜像: 修改 `.env` 中 `NANA_IMAGE` 为旧 tag，然后重新部署
4. 详情见: `doc/guide/deployment-guide.md §4 回滚指南`
