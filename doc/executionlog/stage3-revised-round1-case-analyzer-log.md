# Stage 3 v3-revised Round 1 — Case Analyzer lib + mock 单测执行日志

> **轮次**: Round 1（Case Analyzer lib + mock 单测）
> **计划**: [stage3-ai-integration-plan-v3-revised.md](../plan/stage3-ai-integration-plan-v3-revised.md) §4 / §12
> **日期**: 2026-07-05
> **执行者**: execute-agent (Claude)
> **状态**: build 通过 + 33 单测全绿

---

## 0. 执行范围

| 步骤 | 内容 | 状态 |
|------|------|:----:|
| 1 | 新增 `src/lib/nana/case-analyzer.ts` — 一体化 Case Analyzer | 完成 |
| 2 | 新增 `src/__tests__/unit/nana/case-analyzer.test.ts` — mock 单测 | 完成 |
| 3 | `npm run build` 通过 | 通过 |
| 4 | 单测全部通过（33 tests） | 通过 |
| 5 | 提交 + push | 待执行 |

**未做的事**（严格守范围）：
- 未写 `/process` API
- 未改前端
- 未执行真实 provider 调用
- 未读取/提交任何真实密钥
- 未改 prisma schema / migration
- 未 import v2 残留代码（TD-5）

---

## 1. 变更文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/lib/nana/case-analyzer.ts` | new | 一体化 Case Analyzer lib |
| `src/__tests__/unit/nana/case-analyzer.test.ts` | new | mock 单测，33 tests |
| `doc/executionlog/stage3-revised-round1-case-analyzer-log.md` | new | 本执行日志 |

---

## 2. case-analyzer.ts 实现摘要

### 2.1 接口契约（§4.5 + audioStatus 扩展）

```typescript
export interface CaseAnalyzerInput {
  imageDataUrl: string;
  audioBase64?: string;
  audioFormat?: string;
  nodes: { id: string; name: string }[];
  textbookTopics: { id: string; name: string; chapter: string; section: string }[];
}

export interface CaseAnalyzerResult {
  transcript: string;
  questionSummary: string;
  textbookTopicCandidates: TextbookCandidate[];
  knowledgeNodeCandidates: CaseAnalyzerCandidate[];
  initialFeedback: string;
  possibleMistakeReason: string;
  nextActionSuggestion: string;
  audioStatus: AudioStatus;   // success | skipped | failed | timeout
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}
```

### 2.2 Zod Schema（§4.4，7 字段）

与计划完全一致：transcript / questionSummary / textbookTopicCandidates(max 3) / knowledgeNodeCandidates(max 3) / initialFeedback / possibleMistakeReason / nextActionSuggestion。

### 2.3 音频状态推导

| 条件 | audioStatus |
|------|-------------|
| 未提供 audioBase64 或格式不支持（webm/mp4） | skipped |
| 格式支持 + API 调用成功 | success |
| 格式支持 + API 超时（AbortError） | timeout（throw CaseAnalyzerTimeoutError） |
| 格式支持 + API 失败 | failed（throw CaseAnalyzerError） |

成功路径：analyzeCase() 返回 audioStatus 字段。
失败/超时路径：函数 throw，调用方用 deriveAudioStatus() 推导。

### 2.4 清单外 ID 过滤

- textbookTopicCandidates 中 topicId 不在白名单 -> 过滤掉（warn 日志）
- knowledgeNodeCandidates 中 nodeId 不在白名单 -> 过滤掉（warn 日志）
- 过滤只按白名单，不按置信度

### 2.5 错误类型层级

- CaseAnalyzerError (base)
- CaseAnalyzerTimeoutError (AbortError -> 超时)
- CaseAnalyzerParseError (JSON 解析/校验失败，保留 rawOutput)

### 2.6 v2 残留参考（TD-5）

参考了 asr-transcribe.ts 和 vlm-classify.ts 的模式，但不 import：OpenAI SDK + AbortController、MIME 映射、extractJson()、错误类层级、logger。

---

## 3. 测试覆盖

### 3.1 统计

- 测试文件: 1 passed (1)
- 测试用例: 33 passed (33)
- 耗时: 3.82s

### 3.2 场景覆盖

| # | 场景 | 用例数 | 覆盖点 |
|---|------|:------:|--------|
| 1 | 成功 | 3 | 正常 JSON + audioStatus=success + markdown 代码块 + 空候选 |
| 2 | JSON 格式错误 | 4 | 非 JSON + 缺字段 + 空返回 + confidence 超范围 |
| 3 | 清单外 ID | 3 | 清单外 topicId 过滤 + 清单外 nodeId 过滤 + 全部清单外 |
| 4 | 低置信候选 | 2 | confidence < 0.5 保留 + confidence = 0 边界 |
| 5 | 无音频 | 2 | 未提供 audioBase64 + 空字符串 |
| 6 | webm/mp4 skipped | 2 | webm + mp4 -> skipped，验证不发送 input_audio |
| 7 | 超时 | 1 | AbortError -> CaseAnalyzerTimeoutError |
| 8 | 失败 | 4 | API 4xx + 5xx + 网络错误 + 未设 API_KEY |
| 补充 | 输入校验 | 3 | 空图片 + 空节点 + 空课本章节 |
| 补充 | API 调用参数 | 3 | image_url + input_audio + 提示词含清单 |
| 补充 | deriveAudioStatus | 6 | skipped/success/timeout/failed + 边界 |

---

## 4. 构建验证

| 验证项 | 结果 |
|--------|:----:|
| `npm run build` | 通过 |
| `npx vitest run src/__tests__/unit/nana/case-analyzer.test.ts` | 33/33 passed |

---

## 5. 偏离项记录

| # | 偏离 | 级别 | 说明 |
|---|------|------|------|
| 1 | CaseAnalyzerResult 新增 audioStatus 字段 | 微调 | 计划 §4.5 接口未含 audioStatus。用户验收要求"处理音频状态推导"，故新增。 |
| 2 | 新增 deriveAudioStatus() 导出函数 | 微调 | 供 /process API 在 catch 路径推导 failed/timeout。 |
| 3 | 超时从 30s 改为 60s | 微调 | v2 ASR/VLM 各 30s。v3 一体化调用需同时处理图片+音频，给 60s 更合理。可通过 CASE_ANALYZER_TIMEOUT_MS 覆盖。 |

三项偏离均为微调，不改变计划核心设计，不影响后续 Round。

---

## 6. Git 收口

| 项 | 值 |
|----|-----|
| 分支 | dev |
| commit message | `feat: Stage3 v3-revised Round 1 case-analyzer.ts + 33 mock 单测` |
| push | origin/dev |

---

## 7. 回滚方案

Round 1 只新增 2 个文件，不修改任何既有代码。回退用 `git revert`，无风险。

---

## 8. 下一步

Round 1 审计通过后 -> Round 2（/process API 端点）。
