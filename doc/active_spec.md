# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-06-14

## 🎯 本轮目标

M2 归因流程骨架 —— 已完成 ✅，审计通过。

## ✅ 任务清单

- [x] Prisma schema 追加 3 张新表 + 迁移（DiagnosisSession/ProbeRecord/ErrorRecord）
- [x] 会话状态机（8 步，probe_drill 可选跳转）
- [x] API 路由（4 个：POST/GET sessions, POST probes, POST errors）
- [x] 9 条设计决策全部落地（含 evidenceRound/followUpVerified/禁旁路鉴权）
- [x] 测试：53/53 全部通过（M1 26 + M2 27），安全路径退出码 0
- [x] 生产库污染清理 + 事故复盘
- [x] 预防措施：test:all 聚合 + 执行铁律
- [x] 审计通过

## 🔗 关联文档

- 计划: doc/plan/M2-attribution-flow-plan.md
- 执行日志: doc/executionlog/M2-attribution-flow-log.md
- 事故复盘: doc/reference/M2-prod-contamination-postmortem.md
- 审计: doc/auditlog/M2-attribution-flow-audit.md ✅ 通过

## ⚠️ 已知问题

- 全仓 `test:unit` 在 `.env.test` 下有 5 个上游测试失败（已有 plan: upstream-test-env-isolation）
- `data/dev.db.bak-20260614` 备份残留（M2 稳定后可删除）

## 📝 备注

M2 里程碑完整闭环。预防措施（test:all + 执行铁律）已编码到 .claude/commands/execute.md。
下一轮：M3 初诊+追踪 或 upstream-test-env-isolation。
