# Stage 3 v3-revised Round 2 — /process API + 集成测试执行日志

> **轮次**: Round 2（/process 端点 + GET 状态查询 + 集成测试）
> **计划**: [stage3-ai-integration-plan-v3-revised.md](../plan/stage3-ai-integration-plan-v3-revised.md) §11 / §7 / §12
> **日期**: 2026-07-05
> **执行者**: execute-agent (Claude)
> **状态**: build 通过 + 14 集成测试全绿

---

## 0. 执行范围

| 步骤 | 内容 | 状态 |
|------|------|:----:|
| 1 | 实现 POST /api/nana/cases/[id]/process/route.ts | 完成 |
| 2 | 实现 GET /api/nana/cases/[id]/process/route.ts 状态查询 | 完成 |
| 3 | 编写集成测试 process-api.test.ts | 完成 |
| 4 | npm run build 通过 | 通过 |
| 5 | 集成测试 14/14 通过 | 通过 |

**未做的事**（严格守范围）：
- 未改前端
- 未改 cases/route.ts 列表 API
- 未改 map/route.ts
- 未写 ai-result/route.ts（纠错端点，后续 Round）
- 未执行真实 provider 调用

---

## 1. 变更文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| src/app/api/nana/cases/[id]/process/route.ts | new | POST + GET handler |
| src/__tests__/integration/nana/process-api.test.ts | new | 14 集成测试 |
| doc/executionlog/stage3-revised-round2-process-api-log.md | new | 本执行日志 |

---

## 2. POST /process 实现摘要

### 2.1 流程

1. 登录校验: getServerSession(authOptions) -> session.user.id
2. 归属校验: prisma.case.findFirst({ where: { id, studentId } }) -> 不存在返回 404
3. 提取题图 + 音频: 从 Artifact 按 type 提取
4. 加载知识点 + 课本章节: 从 DB 查询, 按 TextbookNodeMapping 过滤
5. 调 analyzeCase(): mock 在测试中, 真实不进 CI
6. 成功: persistAiResult() -> upsert CaseAiResult + CaseKnowledgeTag + CaseTextbookTopicTag
7. 失败: persistFailedResult() -> upsert CaseAiResult(processingStatus=failed)

### 2.2 高置信阈值

HIGH_CONFIDENCE_THRESHOLD = 0.5
- confidence >= 0.5 的候选 -> 自动挂 tag
- confidence < 0.5 的候选 -> 不挂 tag, 但在响应中返回候选列表

### 2.3 用户纠错保护

- questionSummaryEdited = true -> update 时 questionSummary 设为 undefined（不覆盖）
- textbookTopicEdited = true -> update 时 textbookTopicId / textbookTopicConfidence 设为 undefined

---

## 3. GET /process 实现摘要

1. 登录校验 + 归属校验
2. CaseAiResult 不存在 -> { status: "pending", audioStatus: "skipped" }
3. CaseAiResult 存在 -> 返回 processingStatus + AI 结果字段

---

## 4. 测试覆盖（评审 8 项重点）

| # | 评审重点 | 用例数 | 覆盖方式 |
|---|----------|:------:|----------|
| 1 | 登录 + Case.studentId 归属校验 | 3 | POST 未登录->401 + POST 跨用户->404 + GET 跨用户->404 |
| 2 | GET 状态查询 CaseAiResult 不存在->pending | 1 | GET 新 case -> { status: "pending" } |
| 3 | 成功写 CaseAiResult + CaseKnowledgeTag + CaseTextbookTopicTag | 1 | POST 成功后查三表验证 |
| 4 | 低置信候选不自动挂 tag | 1 | confidence=0.3/0.2 -> 查表 length=0 |
| 5 | 用户纠错不被覆盖 | 2 | questionSummaryEdited + textbookTopicEdited |
| 6 | 失败诚实写 processingStatus=failed | 2 | CaseAnalyzerError + CaseAnalyzerTimeoutError |
| 7 | 响应不返回 base64 原图 | 2 | POST + GET 响应检查 |
| 8 | 真实 provider 不进 CI | 14 | 全部 mock analyzeCase |
| 补充 | GET 成功后返回正确状态 | 1 | 验证 status/questionSummary/feedback 等 |
| 补充 | 缺少题图->400 | 1 | 只有 transcript 的 case |

### 测试统计
- 测试文件: 1 passed (1)
- 测试用例: 14 passed (14)
- 耗时: 3.91s

---

## 5. 构建验证

| 验证项 | 结果 |
|--------|:----:|
| npm run build | 通过 |
| npx vitest run src/__tests__/integration/nana/process-api.test.ts | 14/14 passed |

---

## 6. 偏离项记录

| # | 偏离 | 级别 | 说明 |
|---|------|------|------|
| 1 | transcript 回写 Artifact 用 findFirst + update/create 而非 upsert | 微调 | Prisma Artifact 没有 caseId+type 的 unique 约束, 无法直接 upsert。改用 findFirst + 分支 update/create, 功能等价。 |
| 2 | 超时测试 audioStatus 断言从 failed 改为 skipped | 微调 | 无音频时 deriveAudioStatus 返回 skipped（不管错误类型）, 这是正确行为 -- audioStatus 描述音频处理状态, 不是整体调用状态。 |

---

## 7. 测试库准备

Round 2 首次需要 TextbookTopic 表 + 种子数据在测试库中:
1. DATABASE_URL=file:./data/test/test.db npx prisma migrate deploy -- 应用 pending migration
2. DATABASE_URL=file:./data/test/test.db npx tsx prisma/seed_textbook_topics.ts -- 灌入 16 topics + 48 mappings

---

## 8. Git 收口

| 项 | 值 |
|----|-----|
| 分支 | dev |
| commit message | feat: Stage3 v3-revised Round 2 /process API + 14 集成测试 |
| push | origin/dev |

---

## 9. 回滚方案

Round 2 新增 2 个文件, 不改既有代码。回退用 git revert, 无风险。

---

## 10. 下一步

Round 2 审计通过后 -> Round 3（题目汇总 API + 视图, 或 ai-result 纠错端点）。
