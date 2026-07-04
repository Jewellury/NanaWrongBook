# 部署脚本 + 部署指南更新 · 执行日志

> 关联计划: `doc/plan/deploy-script-plan.md`
> 执行日期: 2026-07-03
> 执行者: execute-agent

## 背景

本轮部署暴露出 CI 镜像路线下缺乏一键部署脚本的问题：
- `docker compose up -d --build` 和 `build --no-cache` 在无 `build` 指令时静默不生效
- 正确操作是 `docker compose pull && docker compose up -d`
- 部署前缺少分支确认、数据库备份、健康检查等标准化步骤

## 产出

| 文件 | 类型 | 说明 |
|------|------|------|
| `scripts/deploy.sh` | 新增 | 服务器一键部署脚本（8 步：目录检查 → git 状态 → 分支门禁 → pull → 备份 → pull 镜像 → up -d → 健康检查 + 部署报告） |
| `doc/guide/deployment-guide.md` | 修改 | 新增一键脚本推荐路线、build 陷阱说明、故障排查、3 个 FAQ、关键文件索引 |
| `doc/plan/deploy-script-plan.md` | 新增 | 计划说明文档 |

## 验证

- `bash -n scripts/deploy.sh` — 语法正确
- 审计通过（`doc/auditlog/audit-deploy-script-2026-07-04.md`），无 P0 问题，2 个 P1 已在本日志中解决

## 偏离记录

无偏离。

## 下一步

合并到 main 并推送到服务器。服务器 `/opt/nana/` 下 `bash scripts/deploy.sh` 即可一键部署。
