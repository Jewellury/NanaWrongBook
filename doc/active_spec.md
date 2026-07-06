# 当前活跃任务

> 每轮替换。记录当前这一轮在做什么、做到哪了。
> 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-06

## 当前任务：真实 Provider Smoke 验证

### 背景

Stage 3 v3-revised Round 0-4 已全部收口，v1 最小 AI 闭环成型且竞态安全。
现在进入"验证真实 AI 质量"阶段——用 3 张 fixture 图片直接打真实豆包 Lite API，
在不碰生产、不写数据库的前提下评估返回质量，出报告后决定是否上线。

### 计划文档

[stage3-provider-smoke-plan.md](plan/stage3-provider-smoke-plan.md)

### 已有资产（无需新建）

- 脚本：scripts/stage3-provider-smoke.ts（621 行，完整实现）
- Fixture：tests/fixtures/nana/cases/ 下 3 张图片（隐私已检查）
- 依赖：dotenv / jsonrepair / tsx 均已安装
- 环境变量：.env 中 VOLCENGINE_API_KEY 等已配置

### 执行步骤

1. 补充 .env.example（添加 VOLCENGINE 变量定义）
2. 运行 npx tsx scripts/stage3-provider-smoke.ts
3. 审阅 provider-smoke-report.json
4. 人工撰写 provider-smoke-report.md（含 Go/No-Go 建议）
5. Git 收口

### 验证清单

- 3 张图片全部成功返回
- 7 字段 JSON 通过 Zod 校验
- topicId 全部在 16 个 TextbookTopic 白名单内（0 幻觉）
- nodeId 全部在 48 个 KnowledgeNode 白名单内（0 幻觉）
- 无禁用词违规
- 平均延迟小于 15 秒
- 反馈质量人工审阅可接受

### 安全约束

- 密钥只放 .env，不写入代码/文档/日志/commit
- 不写数据库（脚本不 import Prisma）
- 不改生产代码
- 不部署到服务器

---

## 历史回顾：Stage 3 v3-revised Round 0-4 已完成

Round 4 主体 + Hotfix 全部完成，复审通过。
v1 最小 AI 闭环：拍题 - 保存 - AI 整理 - 卡片反馈 - 汇总页可见

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib + 33 mock 单测
- Round 2：/process API + 18 集成测试
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
- Round 4：拍题触发整理 + 轮询状态 + AI 结果卡 + 10 集成测试
- Round 4 Hotfix：P1 竞态保护 + P2-a AbortController + P2-c 类型对齐 + 3 新测试

### 当前状态

- 当前分支: dev
- dev 最新提交: 918a592（fix stage3-r4-hotfix）
- origin/dev: 同步
- main 最新提交: 待合入

---

## 后续决策路径（smoke 之后）

### Go（质量可接受）
1. 配置生产服务器 .env
2. dev 合入 main
3. CI 构建 - 部署腾讯云 - 真机验收

### Conditional Go（部分需优化）
1. 调整 case-analyzer.ts prompt
2. 重新跑 smoke 验证

### No-Go（质量不达标）
1. 评估换模型或调整架构
2. v1 闭环暂不上线

---

## 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 当前 case-analyzer.ts 需 VOLCENGINE_API_KEY，无 mock 模式
- 单主线诊断（决策 D-9 延续）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）

## 设计债（在册）

1. slipFlag — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. /initial 废弃 — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. light-feedback magic string __preliminary__ — Stage 3 接通真实 API 时处理
4. feedback API 未校验 case 存在性 — Stage 3 接通真实 API 时处理
5. 二进制 artifact 以 Base64 内联 SQLite — 33% 体积开销
6. TD-006 手动改课本分类写入口径统一 — 实现手动编辑课本分类时处理
