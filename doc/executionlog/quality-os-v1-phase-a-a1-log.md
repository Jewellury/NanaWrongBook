# Quality OS v1 · Phase A · A-1 执行日志

> 关联计划：`doc/plan/nana-quality-os-v1-plan.md`（r3.3 §4.1 A-1）+ `doc/plan/nana-test-framework-plan.md`（r3.1 任务 2.1~2.7+2.9）
> 关联规格：`doc/spec/nana-v1-minimum-loop-acceptance.md`（FREEZE-001 已冻结 14 条 R1a 主路径条款）
> 开始时间：2026-07-19
> 执行者：execute-agent

---

## 执行顺序与状态总览

| # | 任务 | 状态 | Commit | 备注 |
|---|------|:----:|--------|------|
| 1 | CL-06 UI 补齐（textbookTopic=null 占位） | ✅ | 待提交 | TDD 红→绿 |
| 2 | CL-14 UI 补齐（audioStatus=failed 重试按钮） | ✅ | 待提交 | TDD 红→绿 |
| 3 | 任务 2.1：fake-provider-server.ts + register-fixture.ts | ⬜ | — | 基础设施 |
| 4 | 任务 2.2：virtual-microphone.ts + playwright.config.ts 升级 | ⬜ | — | 基础设施 |
| 5 | 任务 2.3：db-verifier.ts | ⬜ | — | 基础设施 |
| 6 | 任务 2.4：nana-golden-path.spec.ts | ⬜ | — | 黄金闭环 |
| 7 | 任务 2.5：nana-batch-path.spec.ts | ⬜ | — | 三题批量 |
| 8 | 任务 2.5c：nana-cross-user.spec.ts | ⬜ | — | CL-16 强化 |
| 9 | 任务 2.5b：nana-sequential-capture.spec.ts | ⬜ | — | fixture-blocked |
| 10 | 任务 2.6：nana-main-flow.spec.ts 去绕过 | ⬜ | — | |
| 11 | 任务 2.9：ci.yml 集成 | ⬜ | — | |
| 12 | PLACEHOLDER.md（素材组 B 需求） | ⬜ | — | |
| 13 | 执行日志收口 | 🟡 | — | 本段更新 |

## Fixture 实际状况（开案时核对）

- 素材组 A：`tests/fixtures/nana/cases/clear-printed.jpg`、`with-handwriting.jpg`、`tilted-partial.jpg` **已存在**（已脱敏确认）→ 任务 2.4 / 2.5 / 2.5c 可真实跑通
- 素材组 B：`set-theory.jpg`、`inequality.jpg`、`function-graph.jpg` **不存在**（AI 无法生成真实数学题图）→ 任务 2.5b 标 `.fixme` + `@fixture-blocked`
- 静默 WAV：本任务用 ffmpeg 生成占位静默 WAV（标 `@TODO 真实数学口述`）

## 执行记录

### 子任务 1+2：CL-06 + CL-14 UI 补齐（2026-07-19）

**TDD 流程（FREEZE-001 §9.3 + r3.3 §10 要求）：**

1. **先写测试（红）**：`src/__tests__/unit/nana/ai-result-card.test.tsx` 9 个用例
   - CL-06 占位：2 个用例（null 时显示占位 / 有值时显示章节）
   - CL-14 音频重试：4 个用例（未传 prop / 传 prop / 点击回调 / audioStatus=success 不显示）
   - 既有契约防回归：3 个用例（失败重试 / possibleMistakeReason=null 隐藏 / 成功 5 区块）
   - 首次跑：3 红 6 绿（符合预期——3 个新行为未实现）

2. **实现（绿）**：`src/components/nana/capture/ai-result-card.tsx`
   - 新增 `onRetryAudioTranscribe?: () => void` prop（语义独立于 `onRetry`，专门用于音频子失败）
   - CL-06：`textbookTopic=null` 时仍渲染分类区块，显示"暂未覆盖"占位胶囊（`bg-[#F5F1EA]` + `text-[#8C857B]`，与现有视觉风格一致）
   - CL-14：`audioStatus=failed && onRetryAudioTranscribe` 时显示"再试转一次"按钮，复用 `RotateCcw` 图标 + 现有"再试一次"按钮样式（缩小版）
   - 注释头部更新：标注 CL-06/CL-08/CL-14 规约来源 + FREEZE-001 A-1 补齐

3. **测试数据 bug 修复**（execute-agent 汇报的"未跑第二次测试"被本会话发现）：
   - `makeSuccessResult` 默认 `nextActionSuggestion: '回看 3.2 函数的基本性质'` 恰好包含 "函数的基本性质" 字符串
   - CL-06 测试断言 `not.toContain('函数的基本性质')` 因此误判失败（虽然实际渲染是对的——占位显示了、章节胶囊没显示）
   - 修正：默认值改为 `'回看 3.2 节相关内容'`，避免与 textbookTopic.name 字符串重复
   - 不是实现 bug，是测试数据设计 bug

4. **接线 capture/page.tsx**：
   - Line 607 `processState === "done"`：传 `onRetryAudioTranscribe={handleRetryProcess}`（audioStatus=failed 出现在 done 态，必须接线）
   - Line 613 `processState === "error"`：传 `onRetryAudioTranscribe={handleRetryProcess}`（防御性，万一 audioStatus=failed + processingStatus=failed 并存）
   - `handleRetryProcess` 已存在于 `capture/page.tsx:290`，复用此函数——对同一 caseId 重新触发 `/api/nana/cases/:id/process`，不创建重复 Case（符合 CL-14 成功条件 ③）

5. **lint 修复**：测试文件 `(globalThis as any)` → `(globalThis as Record<string, unknown>)`，避免新增 `no-explicit-any` 错误

**验证结果：**

| 命令 | 结果 |
|------|------|
| `npm.cmd run test -- src/__tests__/unit/nana/ai-result-card.test.tsx --run`（红） | 3 红 6 绿（符合 TDD 预期） |
| `npm.cmd run test -- src/__tests__/unit/nana/ai-result-card.test.tsx --run`（绿） | **9/9 通过** ✅ |
| `npm.cmd run build` | **通过** ✅（57 页面全部编译） |
| `npm.cmd run lint`（仅看本任务新增/修改文件） | **干净** ✅（既有 268 个 lint 错误与本任务无关，不在本任务范围） |
| 本地 Docker 测试容器 | **未跑**（本地 Docker 状态未知；测试容器门禁交 GitHub Actions） |

**关键判断**：
- 测试用例 `textbookTopic 有值时显示具体章节名` 验证：当 textbookTopic 有值时渲染 `函数的基本性质` 章节胶囊、不渲染占位——证明 CL-06 双分支渲染正确
- 测试用例 `点击"再试转一次"调用 onRetryAudioTranscribe（不调用 onRetry）` 验证：CL-14 的音频重试和整体失败重试语义独立，不会误触
- 接线后 `handleRetryProcess` 对同一 caseId 重试——满足 FREEZE-001 §9.1 CL-14 的"重试不创建重复 Case"硬约束

**安全铁律遵守**：
- 未改 Prisma schema / 上游表（铁律 3）✅
- 未入 git 密钥（铁律 4）✅
- 未碰其他 untracked 文件（ci-status-*.txt / doc/research/*）（本任务边界清晰）✅
- 遇到测试失败先定位再修（铁律 5）✅
- 9/9 测试通过、build 通过、lint 干净才提交（铁律 6）✅

