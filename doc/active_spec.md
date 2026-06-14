# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-06-14

## 🎯 本轮目标

容器分层方案 + M1 最终补验 —— 已完成 ✅，审计通过。

## ✅ 任务清单

- [x] 新增 .env.test.example（模板，提交 git）
- [x] 新增 docker-compose.test.yml（独立测试容器）
- [x] 确认 .gitignore 覆盖 .env.test
- [x] 新增 test:graph:unit / test:graph:integration 脚本
- [x] M1 图谱补验：26/26 用例通过（19 unit + 7 integration）
- [x] 隔离验证：dev.db 未触碰，生产容器未中断
- [x] 审计通过

## 🔗 关联文档

- 计划: doc/plan/container-split-prod-test-plan.md
- 执行日志: doc/executionlog/container-split-prod-test-log.md
- 审计: doc/auditlog/container-split-prod-test-audit.md ✅ 通过

## ⚠️ 已知问题

全仓 `test:unit` 在 `.env.test` 下有 5 个上游测试失败（config.test.ts ×1 + logger.test.ts ×4）。
根因：上游测试依赖默认 env 值（AI_PROVIDER=gemini / LOG_LEVEL 不抑制 info）。
建议后续开 `upstream-test-env-isolation` 独立计划处理。

## 📝 备注

M1 里程碑完整闭环。下一轮：M2 归因流程 或 upstream-test-env-isolation。
