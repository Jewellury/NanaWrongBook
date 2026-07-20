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
| 6 | 任务 2.4：nana-golden-path.spec.ts | ✅ | 07b3d87 | 黄金闭环，本批次 Commit D |
| 7 | 任务 2.5：nana-batch-path.spec.ts | ✅ | 5003d4c | 三题批量，本批次 Commit F |
| 8 | 任务 2.5c：nana-cross-user.spec.ts | ⬜ | — | CL-16 强化 |
| 9 | 任务 2.5b：nana-sequential-capture.spec.ts | ⬜ | — | fixture-blocked |
| 10 | 任务 2.6：nana-main-flow.spec.ts 去绕过 | ⬜ | — | |
| 11 | 任务 2.9：ci.yml 集成 | ✅ | f43eda5 | 本批次 Commit E |
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

### 子任务 9：CI 集成 ci.yml（Commit E: f43eda5）（2026-07-20）

**修改前现状评估**（先读后写）：
- 现有 e2e-test job 已包含：checkout → setup-node → npm ci → playwright install → setup db → build → run playwright tests → upload report(if: failure())
- playwright.config.ts webServer CI 模式下 `npm run start` 启动 Next.js（生产模式）；**无 webServer.env 配置**
- 结论：env 注入应放在 ci.yml job env 段（Next.js 子进程继承父 env），不动 playwright.config.ts

**修改内容**（`.github/workflows/ci.yml`）：

| # | 修改 | 决策依据 |
|---|------|---------|
| 1 | `on:` 加 `schedule: cron '0 18 * * *'` | r3.1 §3 任务 2.9：nightly 跑批量路径 + 跨用户 + 连续拍题等慢测试 |
| 2 | `e2e-test.env` 加 `VOLCENGINE_API_KEY/BASE_URL/LITE_ENDPOINT_ID` | webServer 子进程继承父 env；case-analyzer.ts 通过 `process.env.VOLCENGINE_BASE_URL` 找到假 Provider http://127.0.0.1:3999 |
| 3 | 新增 `Ensure ffmpeg available` step | sanity check + apt fallback；r3.1 §3 任务 2.9 显式要求，音频转码 webm→wav 依赖 ffmpeg |
| 4 | 新增 `Start fake provider server` step | nohup + tsx -e + dynamic import 后台启动；curl 探测 3999 端口 ready（最长 30s 超时）；PID 写文件供关闭 step 使用 |
| 5 | 修改 `Run Playwright tests` step 区分 push/schedule | push/PR 跑 `npx playwright test --project=mobile-chrome e2e/ci/nana-golden-path.spec.ts`；schedule 跑 `npx playwright test --project=mobile-chrome`（全部） |
| 6 | 新增 `Stop fake provider server` step（if: always） | kill PID + tail 日志，失败时也执行 |
| 7 | 新增 `Upload evidence pack` step（if: always） | `test-results/` artifact，retention 14 天（r3.1 §4.2 性能采集 + AI 评审证据） |
| 8 | 修改 `Upload Playwright Report` `if: failure()` → `if: always()` | 成功时也保留供对照 |

**关键决策记录**：

- **fake-provider 启动方式**：用 `npx tsx -e "import('./e2e/helpers/fake-provider-server').then(...)"` 一行命令而非新建 `scripts/start-fake-provider.ts`。原因：
  - 写入边界限定 `.github/workflows/ci.yml` + `e2e/ci/nana-batch-path.spec.ts` + executionlog
  - fake-provider-server.ts 只 export 函数无 standalone 入口，用 dynamic import + tsx -e 最简洁
  - 避免新增 scripts/ 文件（避免越界）

- **webServer env 注入方式**：选择 ci.yml job env 段而非 playwright.config.ts webServer.env。原因：
  - 不动 playwright.config.ts（不在写入边界）
  - 子进程继承父 env 是 Unix/Windows 通用机制
  - 简单透明，CI 日志可见

- **触发策略**：用 `GITHUB_EVENT_NAME` 环境变量在 step 内分支。push/PR 只跑黄金路径（快）；schedule 跑完整 mobile-chrome 套件（含批量路径等慢测试）。简单清晰，不依赖 Playwright tag annotation。

**验证结果**：

| 命令 | 结果 |
|------|------|
| YAML parse（node + js-yaml） | ✅ 5 jobs 完整 + e2e-test 12 steps + 6 env keys 全部就位 |
| `npm.cmd run build` | ✅ 通过（57 页面全部编译） |
| Lint（仅看本任务修改文件） | ✅ YAML 文件不在 eslint 范围 |
| 本地 Docker 测试容器 | 未跑（本地 Docker 状态未知；测试容器门禁交 GitHub Actions） |
| 本地 e2e | 未跑（依赖 Docker Desktop 跑 Next.js + fake-provider 联调；门禁交 CI） |

**安全铁律遵守**：
- 未改 Prisma schema / 上游表（铁律 3）✅
- 未入 git 密钥（fake-key 是占位，明示 fake，非真实凭证）（铁律 4）✅
- 未碰其他 untracked 残留（ci-status*.txt / doc/research/*）（铁律 5 边界清晰）✅
- YAML 语法解析通过才提交（铁律 6）✅

### 子任务 7：nana-batch-path spec（Commit F: 5003d4c）（2026-07-20）

**实现内容**（`e2e/ci/nana-batch-path.spec.ts` 577 行）：
- `test.describe.serial` 4 个 test 顺序执行，同一用户场景
- Q1 clear-printed（高置信 TB-010 + 录音 + 完整 7 字段）
- Q2 with-handwriting（高置信 TB-010 + 录音 + 完整 7 字段，验证多题同章节分组）
- Q3 tilted-partial（低置信 CL-08 降级 + 不录音 CL-03 验证）
- 汇总页 + 图谱（CL-10a/CL-11/CL-12）

**TDD 流程**：spec 本身是测试。每个 CL 断言先确定"断言什么、什么时候红/绿"：
- CL-02 三题题图 Artifact 落库（minContentLength=100，确保非空）
- CL-03 Q3 不录音 → audioStatus='skipped'
- CL-04 三题各自"已收好"在 5s/10s 内出现
- CL-05 Q1+Q2 transcript 非空（"这道题是判断函数单调性的"/"我先用导数算的..."）
- CL-06 三题 questionSummary/initialFeedback/nextActionSuggestion 各自匹配 mock
- CL-07 Q1+Q2 双层 tag 挂载（TB-010 + M2a-13）
- CL-08 Q3 textbookTopicId=null + 无 vlm tag（双层都降级）+ UI "暂未覆盖"占位
- CL-10a 默认 Tab=题目汇总 + 章节标题可见
- CL-11 3 题全部落库 + 分组正确（DB 维度精确断言）
- CL-12 StudentNodeState 拍题前后不变 + status 合法

**关键修正（偏离任务简报，记入偏离记录）**：

| # | 计划原内容（任务简报） | 实际做 | 原因 | 是否影响验收 |
|---|---|---|---|:--:|
| 1 | "三张都是函数题，组下有 3 道题" | TB-010 组 2 题（Q1+Q2）+ 未分类组 1 题（Q3） | FREEZE-001 §7.1 明示 tilted-partial 是 CL-08 降级路径，候选空数组 → textbookTopicId=null → 归未分类组。任务简报描述与 FREEZE 矛盾，按冻结条款写 | 否（按事实写，符合 FREEZE） |

**辅助函数抽取**（spec 内私有 helpers，避免污染 e2e/helpers/）：
- `registerAndLoginOnce` 仅 Q1 调用建立 batchUserId
- `loginExisting` Q2/Q3/汇总 test 复用同一账号
- `uploadImageAndExpectPreview` 上传 + 等预览
- `recordAbout1s` 录音 1.5s（虚拟麦克风走完整 getUserMedia→MediaRecorder 链路）
- `saveCaseAndExpectToast` 点保存 + 等"已收好" + 等 /process 触发（CL-04 解耦）

**验证结果**：

| 命令 | 结果 |
|------|------|
| `node node_modules/eslint/bin/eslint.js e2e/ci/nana-batch-path.spec.ts` | ✅ 0 error 0 warning |
| `node node_modules/@playwright/test/cli.js test --list` | ✅ 4 个 test 全部被识别（mobile-chrome project） |
| `npm.cmd run build` | ✅ 通过 |
| `npm.cmd run lint`（src/ 范围） | 既有 269 个问题与本任务无关（spec 不在 src/ 范围） |
| 本地 Docker 测试容器 | 未跑（本地 Docker 不可用；测试容器门禁交 GitHub Actions nightly schedule） |
| 本地 e2e 完整运行 | 未跑（依赖 Docker Desktop 跑 Next.js + fake-provider 联调） |

**安全铁律遵守**：
- 未改 Prisma schema / 上游表（铁律 3）✅
- 未入 git 密钥（铁律 4）✅
- 未碰其他 untracked 残留（铁律 5 边界清晰）✅
- 偏离任务简报但符合 FREEZE-001，记入偏离记录（铁律 5 + 6）✅
- 4 个 test 被 playwright 识别、build 通过、lint 干净才提交（铁律 6）✅

## 完成状态（本批次 3a）

- [x] 任务 2.9 ci.yml 集成完成（Commit E: f43eda5）
- [x] 任务 2.5 nana-batch-path.spec.ts 完成（Commit F: 5003d4c）
- [x] 代码已提交（Commit E + F 两个独立 commit）
- [x] 本地 `npm.cmd run build` 通过
- [x] 本地 lint（仅本任务新增/修改文件）干净
- [x] 本地相关窄范围测试已运行（playwright --list 识别 4 个 test）；e2e 完整运行本地未跑（依赖 Docker + ffmpeg + webServer env 联调，门禁交 CI）
- [ ] 测试容器门禁通过（二选一）：
  - 本地 Docker 可用：未跑（本地 Docker Desktop 状态未知）
  - GitHub Actions 测试容器门禁交由 nightly schedule + PR/push 触发执行
- [ ] GitHub Actions 测试容器通过后，才允许部署
- [ ] 确认测试在安全路径运行：CI 使用 `file:./e2e.db`，`./data/dev.db` 未被触碰
- [x] 可进入审计阶段（批次 3a 完成，批次 3b 可启动）


