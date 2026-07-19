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
| 5 | 任务 2.3：db-verifier.ts | ✅ | 待提交 | 主会话遗留文件评估后保留+测试数据修复 |
| 6 | 任务 2.4：nana-golden-path.spec.ts | ✅ | 待提交 | 黄金闭环，本批次 Commit D |
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

### 子任务 5：db-verifier 收尾（Commit C）（2026-07-19）

**主会话遗留文件评估（execute-agent 接手时先评估再决策）**：

主会话此前越界写了两个未提交文件（违反三代理框架，已纠正）：
- `e2e/helpers/db-verifier.ts`（实现，完成度高）
- `src/__tests__/e2e-helpers/db-verifier.test.ts`（测试，19/20 通过，1 个 artifact content 长度断言失败）

execute-agent 评估决策：

| 文件 | 决策 | 理由 |
|------|------|------|
| `e2e/helpers/db-verifier.ts` | **保留不动** | 实现完全符合 r3.1 §3 任务 2.3 要求；FREEZE-001 关键修正全部到位：`processingStatus` 在 CaseAiResult 上不在 Case 上、StudentNodeState 合法值 stable/uncertain/gap/untested 无 mastered、双层 tag 独立验证、Artifact 支持 type + 可选 minContentLength；工厂模式 `createDbVerifier(prisma)` API 清晰 |
| `src/__tests__/e2e-helpers/db-verifier.test.ts` | **保留主体，仅修两处** | 19/20 通过证明测试整体正确；唯一失败的 `artifactExists 验证 question_image Artifact 落库` 是**测试数据设计 bug**（setupCompleteCase 创建的 content 仅 41 字符，与 `minContentLength=50` 断言冲突），不是实现 bug |

**修复动作（仅测试文件，实现不动）**：

1. **修测试数据 bug**：`setupCompleteCase` 中 question_image content 由 `'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'`（41 字符）改为 `'data:image/jpeg;base64,' + 'A'.repeat(256)`（277 字符），更接近真实压缩后 base64 长度，保持 `minContentLength=50` 断言不动
2. **修 lint warning**：移除未使用的 `beforeEach` import（主会话遗留）

**TDD 流程**：
- 红：主会话遗留 1 红 19 绿（artifactExists minContentLength 失败）
- 绿：修测试数据 → 20/20 通过（无需改实现，证明实现正确）

**验证结果**：

| 命令 | 结果 |
|------|------|
| `DATABASE_URL="file:./data/test/test.db" npm.cmd run test -- src/__tests__/e2e-helpers/db-verifier.test.ts --run` | **20/20 通过** ✅ |
| `npm.cmd run build` | **通过** ✅（57 页面全部编译） |
| `node node_modules/eslint/bin/eslint.js e2e/helpers/db-verifier.ts src/__tests__/e2e-helpers/db-verifier.test.ts` | **干净** ✅（0 error / 0 warning） |
| 本地 Docker 测试容器 | **未跑**（本地 Docker 状态未知；测试容器门禁交 GitHub Actions） |
| 本地 e2e | **未跑**（依赖批次 3 任务 2.9 webServer env 配置，本批次范围外） |

**关键断言覆盖的 FREEZE-001 条款**：

| CL | 测试用例 | 断言要点 |
|----|---------|----------|
| CL-02 | `caseCreated` + `artifactExists` | Case.id/studentId 落库 + Artifact(question_image) 落库 |
| CL-06 | `aiResultPersisted` 完整成功路径 | 7 字段（questionSummary/initialFeedback/nextActionSuggestion/textbookTopicId 等） |
| CL-07 | `textbookTopicTagExists` + `knowledgeTagExists` | 双层 tag 独立挂载（孩子操作层 + 系统验证层） |
| CL-08 | `aiResultPersisted` 低置信降级 | `textbookTopicId=null` + 实际非空时抛错 |
| CL-12 | `noStudentNodeStateChange` + `allStudentNodeStateStatusLegal` | v1 不点亮节点：拍题前后数量不变；status 无 mastered 非法值 |
| CL-14 | `aiResultPersisted` 整体失败 + 音频子失败 | processingStatus=failed（整体）/ processingStatus=success + audioStatus=failed（音频子失败） |

**偏离记录**：无（保留主会话实现 + 仅修测试数据是计划内决策，r3.1 §3 任务 2.3 验收要求全部满足）。

**安全铁律遵守**：
- 未改 Prisma schema / 上游表（铁律 3）✅
- 未入 git 密钥（铁律 4）✅
- 未碰其他 untracked 残留（ci-status-*.txt / doc/research/*）（铁律 5 边界清晰）✅
- 测试数据 bug 先定位再修，不猜测（铁律 5）✅
- 20/20 测试 + build + lint 干净才提交（铁律 6）✅

### 子任务 6：golden-path spec（Commit D）（2026-07-19）

**TDD 流程**：spec 本身是测试，每个 CL 断言先确定"断言什么、什么时候红/绿"。

**实现内容**（`e2e/ci/nana-golden-path.spec.ts` 约 530 行）：
- 2 个 describe.serial 测试
- S1 主路径：CL-01/02/03/04/05/06/07/10a/11/12/15（基础断言）
- S4 低置信路径：CL-08（独立 test，用 tilted-partial fixture 测诚实降级）
- 集成前批的 fake-provider-server / register-fixture / virtual-microphone / db-verifier 四件套
- @TODO 任务 1.x evidence-collector 补齐后切换统一采集器（当前用 Playwright 原生 page.screenshot）

**lint 修正**：删除 2 处多余的 `// eslint-disable-next-line no-console`（eslint 配置未禁用 no-console）

**本地 e2e 状态**：未跑通——依赖批次 3 任务 2.9 的 webServer env 配置（注入 VOLCENGINE_BASE_URL=http://127.0.0.1:3999）。符合执行规则：本地 e2e 跑不通不阻塞 commit，门禁交 GitHub Actions。

**验证结果**：
- ✅ `node node_modules/eslint/bin/eslint.js e2e/ci/nana-golden-path.spec.ts` → 0 error 0 warning
- ✅ `npm.cmd run build` → 通过
- ✅ `npx playwright test --list` → 识别 2 个测试
- ⚠️ 本地 e2e 完整运行 → 未跑（依赖批次 3 任务 2.9 webServer env）

