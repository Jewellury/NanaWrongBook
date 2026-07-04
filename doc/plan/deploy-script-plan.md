# 部署脚本 + 部署指南更新 · 开发计划

> 关联规格: doc/guide/deployment-guide.md（现有部署指南）
> 计划日期: 2026-07-04
> 预计影响: scripts/deploy.sh（新增）、doc/guide/deployment-guide.md（修改）

## 1. 大白话概述

- **这轮做什么**：写一个一键部署脚本 `scripts/deploy.sh`，放到服务器 `/opt/nana/` 下，以后部署只需 ssh 登服务器、运行 `bash scripts/deploy.sh`。同时更新部署指南，补充常见问题和故障排查。
- **为什么要做**：前面几次部署发现操作有陷阱——`docker compose up -d --build` 静默不生效（因为 prod compose 没有 build 指令），正确操作是 `docker compose pull && docker compose up -d`。需要把这个操作固化成脚本，减少人工失误。同时把踩过的坑记到文档里，下次部署和以后的人不用重新踩。

## 2. 任务分解

- [x] 任务1: 设计 `scripts/deploy.sh` — 服务器端一键部署脚本（新增）
- [x] 任务2: 更新 `doc/guide/deployment-guide.md` — 补充故障排查、常见问题、引用 deploy.sh
- [x] 任务3: 写本计划文档 `doc/plan/deploy-script-plan.md`

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/deploy.sh` | 新增 | 服务器端一键部署脚本 |
| `doc/guide/deployment-guide.md` | 修改 | 增补故障排查、常见问题、deploy.sh 引用 |
| `doc/plan/deploy-script-plan.md` | 新增 | 本计划文档 |

## 4. 验收标准

### scripts/deploy.sh
- [ ] 能在服务器 `/opt/nana/` 下运行（bash scripts/deploy.sh）
- [ ] 非 main 分支部署直接退出（除非 --force）
- [ ] git pull origin main 前检查工作区干净（untracked 不阻塞）
- [ ] 数据库备份成功才继续部署
- [ ] 部署结束后输出部署报告（分支、commit、容器状态）

### doc/guide/deployment-guide.md
- [ ] 新增第6节"故障排查"包含 `No services to build` 错误解释
- [ ] 新增第8节"常见问题"包含部署后按钮不可见的问题
- [ ] 新增对 `scripts/deploy.sh` 的引用说明

## 5. 风险与注意事项

- **路径一致性**：`backup.sh` 中数据库路径是 `/opt/nana/data/dev.db`，deploy.sh 必须保持一致，不能写别的路径
- **docker compose 版本**：当前 docker-compose.prod.yml 没有 `build` 指令，只有 `image`。必须确保 deploy.sh 用 `pull` 而不是 `build`
- **CI 依赖**：deploy.sh 不会等待 GitHub Actions（那是本地操作），但会在日志里提示"请确认 CI 已完成构建"
- **脚本可重入**：deploy.sh 应在多次连续运行时不损坏状态（第二次运行时 git pull 可能 nothing to update，应正常退出）
- **安全铁律**：脚本中的备份步骤必须在 pull 之后、up -d 之前；任何一步失败必须停止（set -e）

## 6. 技术附录

### deploy.sh 设计概要

```bash
#!/bin/bash
set -e

流程:
  1. cd /opt/nana
  2. git status 检查（untracked 不阻塞）
  3. 记录当前分支 + commit
  4. 确认分支为 main（非 main 需 --force）
  5. git pull origin main
  6. cp data/dev.db → backups/prod-<timestamp>.db（快速文件备份）
  7. bash backup.sh（sqlite3 .backup 快照）
  8. docker compose -f docker-compose.prod.yml pull
  9. docker compose -f docker-compose.prod.yml up -d
  10. sleep 5 + docker compose ps 检查
  11. 输出部署报告

配置项:
  PROJECT_DIR="/opt/nana"
  COMPOSE_FILE="docker-compose.prod.yml"
  DB_PATH="data/dev.db"
  BACKUP_DIR="backups"

颜色输出: RED/GREEN/YELLOW 用于步骤提示和结果标注

安全设计:
  - set -e 确保任何失败即停止
  - 备份失败流程会 exit 1（数据库安全第一）
  - main 分支检查（非 main 需 --force 确认）
  - 每步有 echo 提示，方便追踪故障点
```

### 部署指南更新内容

故障排查新增：
- `No services to build` 错误解释：说明 prod compose 无 build 指令，必须用 pull
- 部署后按钮不可见：检查是否 pull 了新镜像（CI 可能未完成）

引用 deploy.sh：
- 在"日常发布"流程中增加"也可用 bash scripts/deploy.sh 一键部署"
