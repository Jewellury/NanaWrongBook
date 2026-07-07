# 当前活跃任务

> 每轮替换。记录当前这一轮在做什么、做到哪了。
> 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-07

## 当前任务：Stage 3 生产接入部署 (r2)

### 背景

Provider Smoke 已完成（Conditional Go）。3 张 fixture 图片全部成功返回有效 JSON，
0 个幻觉 ID，0 个真实禁用词越界，反馈质量可接受。现在进入生产接入阶段。

**r2 关键补充**：部署前发现生产库 TextbookTopic/TextbookNodeMapping seed 不会自动灌入
（与 2026-07-02 KnowledgeNode=0 事故同类风险）。r2 计划新增 Dockerfile/entrypoint
seed 自动化修复 + 部署后只读验证步骤。

**特别声明**：本轮 Go 只覆盖 image-only 场景，语音转写质量需上线后单独验收。

### 计划文档

[stage3-deploy-plan.md](plan/stage3-deploy-plan.md) (r2)

### 执行步骤

1. **修复 Dockerfile + entrypoint seed 自动化**（🔴 致命）
   - 预编译 seed_textbook_topics.ts + seed_graph.ts
   - entrypoint 运行 seed（幂等）
2. 补 .env.test.example VOLCENGINE 占位值
3. 本地 npm.cmd run build 验证
4. dev 合 main → push origin main（触发 CI）
5. 等 CI 绿色
6. SSH 服务器追加 VOLCENGINE 环境变量到 /opt/nana/.env
7. 服务器执行 bash scripts/deploy.sh
8. **Migration + Seed 只读验证**（🔴 不可跳过）
   - TextbookTopic = 16
   - TextbookNodeMapping = 48
   - KnowledgeNode ≥ 48
   - KnowledgeEdge ≥ 36
   - CaseAiResult 表存在
   - CaseTextbookTopicTag 表存在
   - 不通过不得真机验收，按补 seed 流程处理
9. 真机验收（image-only）：手机拍题 → 等 AI → 看结果卡
10. 语音验收（单独）：拍题+录音 → 看 transcript 质量
11. Git 收口

### 验收标准

- CI 绿色（build + test container + push GHCR）
- 服务器容器正常运行
- **Stage 3 migration 已应用**
- **TextbookTopic = 16, TextbookNodeMapping = 48**
- **KnowledgeNode ≥ 48, KnowledgeEdge ≥ 36**
- **CaseAiResult / CaseTextbookTopicTag 表存在**
- 手机能访问 nana.nanatop.xyz/nana
- 拍题后 30-40 秒内出 AI 结果卡
- 结果卡内容合理（摘要/分类/反馈/下一步建议）
- 题目汇总页能看到新题

### 安全约束

- VOLCENGINE_API_KEY 只放服务器 .env，不入 git
- .env.test.example 只放占位值
- 部署前必须 backup.sh 备份
- 不改生产业务代码（只改 Dockerfile/entrypoint/.env.test.example）
- **部署后必须验证 seed 行数，不通过不得真机验收**
- 语音质量不阻塞 image-only 上线

### 失败回滚

- Seed 缺失：按补 seed 流程（容器内 docker exec node seed.js），不跳过
- 容器异常：回滚 NANA_IMAGE 到上一个 sha tag
- AI 不通：前端走"整理失败"路径，不影响现有功能
- 数据库：用 /opt/nana/backups/ 恢复

---

## 历史回顾：Stage 3 v3-revised Round 0-5 已完成

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib + 33 mock 单测
- Round 2：/process API + 18 集成测试
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
- Round 4：拍题触发整理 + 轮询状态 + AI 结果卡 + 10 集成测试
- Round 4 Hotfix：P1 竞态保护 + P2-a AbortController + P2-c 类型对齐 + 3 新测试
- Round 5 Provider Smoke：3 张 fixture 真实 API 验证，Conditional Go

### 当前状态

- 当前分支: dev
- dev 最新提交: 512fbbc（docs stage3-deploy r1）
- origin/dev: 领先 4 个 commit 未 push
- main 最新提交: 待合入

---

## 后续决策路径

### 部署成功（真机验收通过）

1. v1 闭环正式上线
2. 安排语音验收
3. 进入正常迭代（打印页、手动编辑课本分类、重复题识别等）

### 部署失败

1. 回滚镜像到部署前
2. 修复后重新走 CI → 部署流程
3. 不在服务器热修

### 语音质量不达标

1. image-only 继续可用
2. 评估音频格式支持 / 前端转码 / 换模型
3. 不阻塞 image-only 场景

---

## 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 当前 case-analyzer.ts 需 VOLCENGINE_API_KEY，无 mock 模式
- 单主线诊断（决策 D-9 延续）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）
- **语音转写质量未验证**（上线后单独验收）

## 设计债（在册）

1. slipFlag — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. /initial 废弃 — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. light-feedback magic string __preliminary__ — Stage 3 接通真实 API 时处理
4. feedback API 未校验 case 存在性 — Stage 3 接通真实 API 时处理
5. 二进制 artifact 以 Base64 内联 SQLite — 33% 体积开销
6. TD-006 手动改课本分类写入口径统一 — 实现手动编辑课本分类时处理
7. **Seed 自动化缺口** — Dockerfile/entrypoint 不自动跑 seed_textbook_topics/seed_graph，r2 计划修复
