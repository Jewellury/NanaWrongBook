# 当前活跃任务

> 📌 每轮替换。记录当前这一轮在做什么、做到哪了。
> 📌 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-06

## ✅ Stage 3 v3-revised Round 0-4 已完成并收口

### v1 闭环已成型且竞态安全

Round 4 主体 + Hotfix 全部完成，复审通过 ✅。
v1 最小 AI 闭环：**拍题 → 保存 → AI 整理 → 卡片反馈 → 汇总页可见**

### 历史回顾

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib（case-analyzer.ts）+ 33 mock 单测
- Round 2：/process API（POST + GET）+ 18 集成测试
- Round 2 P1 修复：CaseKnowledgeTag 清理 + 事务包裹 + 测试数据修复
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
- Round 4：拍题触发整理 + 轮询状态 + AI 结果卡 + 10 集成测试
- Round 4 Hotfix：P1 竞态保护 + P2-a AbortController + P2-c 类型对齐 + P2-d 文档更正 + 3 新测试

详见：
- Round 4 计划 → [plan](plan/stage3-revised-round4-process-trigger-plan.md)
- Round 4 审计 → [audit](auditlog/stage3-revised-round4-process-trigger-audit.md)
- Hotfix 复审 → [reaudit](auditlog/stage3-revised-round4-hotfix-reaudit.md)

### 当前状态

- **当前分支**: dev
- **dev 最新提交**: `918a592`（fix stage3-r4-hotfix）
- **origin/dev**: 同步
- **main 最新提交**: 待合入

---

## ⏳ 下一步：真实 provider smoke

用户倾向优先做真实 provider smoke，验证真实 LLM 接上后的表现。这是 v1 闭环最后也是最大的不确定性。

### 需要验证的关键点

1. 真实 LLM 返回的 7 字段 JSON 是否能通过 Zod 校验
2. 文案是否合规（无"诊断/薄弱/掌握/得分"等越界词）
3. 真实延迟下轮询和 UI 表现是否正常（5-15 秒等待）
4. 竞态保护在真实延迟下是否有效
5. 音频转写（如有）是否正常

### 其他可选方向（smoke 之后）

- dev 合入 main + 部署到腾讯云
- 打印页
- 手动编辑课本分类（需处理 TD-006）

---

## ⚠️ 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 当前 case-analyzer.ts 需 VOLCENGINE_API_KEY，无 mock 模式
- 单主线诊断（决策 D-9 延续）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）

## 🏗️ 设计债（在册）

1. **slipFlag** — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. **/initial 废弃** — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. **light-feedback magic string `__preliminary__`** — Stage 3 接通真实 API 时处理
4. **feedback API 未校验 case 存在性** — Stage 3 接通真实 API 时处理
5. **二进制 artifact 以 Base64 内联 SQLite** — ~33% 体积开销，case 多了拖慢查询/备份
6. **TD-006 手动改课本分类写入口径统一** — 实现手动编辑课本分类时处理
