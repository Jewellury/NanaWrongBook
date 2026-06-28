# 第 1 阶段：采集基础壳 · 执行日志

> 关联计划: doc/plan/nana-phase1-execution-plan.md
> 开始时间: 2026-06-27 20:30

---

## Commit ①：Prisma schema + case API

**开始时间**: 2026-06-27 20:30  
**完成时间**: 2026-06-27 21:10  
**Commit hash**: `df06c9b`

### 执行记录

#### 任务 1.1：追加 Prisma Schema
- **做了什么**: 在 `prisma/schema.prisma` 末尾追加 `Case` + `Artifact` 两个 model。`Case.studentId` 关联上游 `User.id`（不加 Prisma relation，与 `mistakeId` 同款处理）。`Artifact` 包含 `type`（image/audio/transcript/aiSummary）、`content`、`seq` 字段，`@@index([caseId])` 加速查询。
- **涉及文件**: `prisma/schema.prisma`
- **结果**: ✅ 完成

#### 任务 1.2：创建 POST /api/nana/cases
- **做了什么**: 创建 POST handler，鉴权（`getServerSession`）→ 校验 artifacts → Prisma 嵌套创建 Case + Artifacts → 返回 201。遵循 `diagnosis/sessions` 的现有 handler 模式。
- **涉及文件**: `src/app/api/nana/cases/route.ts`
- **结果**: ✅ 完成

#### 任务 1.3：创建 GET /api/nana/cases/:id
- **做了什么**: 创建 GET handler，鉴权 → `prisma.case.findUnique`（含 artifacts 按 seq 排序）→ 不存在返回 404。使用 Next.js 16 `params: Promise<{ id }>` 模式。
- **涉及文件**: `src/app/api/nana/cases/[id]/route.ts`
- **结果**: ✅ 完成

#### 任务 1.4：创建前端 API 客户端
- **做了什么**: 创建 `nana-api-client.ts`，封装 `createCase()` 和 `getCase()`，使用 `/api/nana` 基路径，抛错机制与上游 `api-client.ts` 一致。
- **涉及文件**: `src/lib/nana/nana-api-client.ts`
- **结果**: ✅ 完成

#### 任务 1.5：创建单元测试
- **做了什么**: mock `global.fetch`，测试 `createCase`（成功/失败）和 `getCase`（成功/失败）共 4 个用例。
- **涉及文件**: `src/__tests__/unit/nana/case-api.test.ts`
- **结果**: ✅ 完成（4/4 通过）

#### 任务 1.6：创建集成测试
- **做了什么**: 遵循现有 `diagnosis-api.test.ts` 模式，mock next/server、next-auth、logger、auth、api-errors，使用真实 PrismaClient（连测试库 `./data/test/test.db`）。测试 POST 创建、GET 读取、400 空 artifacts、404 不存在，共 5 个用例。
- **涉及文件**: `src/__tests__/integration/nana/case-api.test.ts`
- **结果**: ✅ 完成（5/5 通过）

#### 任务 1.7：更新 package.json
- **做了什么**: 追加 `test:nana:unit` 和 `test:nana:integration` 脚本，在 `test:all` 末尾追加 `&& npm run test:nana:unit && npm run test:nana:integration`。
- **涉及文件**: `package.json`
- **结果**: ✅ 完成

#### 任务 1.8：Prisma Migration + 测试验证
- **做了什么**:
  1. 用 `node node_modules/prisma/build/index.js migrate dev --name add_case_artifact` 生成迁移文件 `20260627124550_add_case_artifact`
  2. 向测试数据库 `./data/test/test.db` 执行 `migrate deploy`，14 个迁移全部应用
  3. 运行 `test:nana:unit` — 4/4 通过 ✅
  4. 运行 `test:nana:integration` — 5/5 通过 ✅
  5. 运行完整 `vitest run` — 611/623 通过；12 个失败均存在于已有测试（graph、diagnosis-api、m3c-flow、gemini-retry），因测试库未灌种子数据，与本次变更无关
  6. Build 验证 — 失败在 `scripts/vlm-handheld-test.ts`（类型错误），已在干净工作树确认是**已有问题**，非本次变更引入
- **涉及文件**: `prisma/migrations/20260627124550_add_case_artifact/migration.sql`, `prisma/migrations/migration_lock.toml`
- **结果**: ✅ 完成（需确认：Docker 未运行，测试在本地 vitest + 测试数据库 `./data/test/test.db` 上执行，该路径在 guard-db.ts 白名单中）

---

### 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 测试在 Docker 测试容器中运行 | 使用本地 vitest + 测试数据库 `./data/test/test.db` 运行 | Docker Desktop 未运行，无法启动测试容器 | 否 — guard-db.ts 白名单包含 `file:./data/test/test.db`，数据库安全性等价 |
| 2 | Build 验证 `npm run build` 无错误 | Build 在 `scripts/vlm-handheld-test.ts` 报类型错误 | **已有问题**，在干净工作树（git stash 后）复现 | 否 — 该错误与本次变更无关，且在 `doc/plan/frontend-architecture-plan.md` 等计划文档中已知 |

### 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `package.json` | 追加 `test:nana:unit` + `test:nana:integration`，更新 `test:all` | 执行计划 §2.6 要求 |

### 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| Docker Desktop 未运行 | 使用本地 vitest + 测试数据库 `./data/test/test.db`（guard-db 白名单允许） |
| `npx` 命令因 WSL 集成失败 | 使用 `node node_modules/...` 直接执行 |
| build 报已有类型错误 | 确认是已有问题（`scripts/vlm-handheld-test.ts`），在干净工作树验证，非本次变更引入 |
| `git stash pop` 冲突 | 丢弃 stash，确认所有变更文件完好 |

### 完成状态

- [x] 任务 1.1~1.8 全部完成
- [x] 代码已提交（commit: `df06c9b`）
- [x] `test:nana:unit` 通过（4/4）
- [x] `test:nana:integration` 通过（5/5）
- [x] 确认测试在安全路径运行（`./data/test/test.db` 被更新，`./data/dev.db` 未被触碰）
- [x] 未修改上游 model（`git diff prisma/schema.prisma` 仅末尾追加）
- [ ] ⚠️ `npm run build` — 已在干净工作树确认失败为已有问题，非本次变更引入
- [ ] ⚠️ Docker 测试容器 — 因 Docker 未运行而未使用，本地测试路径在 guard-db 白名单中

---

## Commit ②：场景入口首页 + /nana Layout

**开始时间**: 2026-06-28 05:50  
**完成时间**: 2026-06-28 06:20  
**Commit hash**: `a63e36a`（后接 `f1ec8c2` 清理 .tmp）

**完成时间**: 2026-06-28 06:20  
**Commit hash**: `a63e36a`（后接 `f1ec8c2` 清理 .tmp）

### 执行记录

#### 任务 2.1：创建段级 Layout
- **做了什么**: 创建 `src/app/nana/layout.tsx`，服务端组件（无 "use client"），使用 `getServerSession` 鉴权，未登录重定向 `/login`。背景色 `bg-[#FBF7F0]`，包裹 `<div className="nana-layout min-h-screen bg-[#FBF7F0]">`。无额外导航栏，遵循极简设计。
- **涉及文件**: `src/app/nana/layout.tsx`
- **结果**: ✅ 完成

#### 任务 2.2：创建首页 Page
- **做了什么**: 创建 `src/app/nana/page.tsx`，客户端组件（"use client"）。从 `GET /api/diagnosis/map?studentId=xxx` 异步加载数据。
  - **有记录态**（nodes 中有非 untested 节点）：显示 RecapBar（"上次你点亮了：XX" + "你的地图上已经有 N 个光点了"）+ "看看我的知识地图 →" 链接
  - **空状态**（全部 untested）：显示 EmptyHint（"你的光点地图还空着，第一道题，会点亮第一个光点"）
  - **两个行动卡始终显示**："拍一下这道题"（Camera 图标，绿色）+ "补一段你当时怎么想的"（MessageSquareText 图标，琥珀色）
  - 底部装饰文案："✦ 不急，每题都是光点 ✦"
  - 问候语："嗨，今天想从哪开始？" + "不急，挑一个就好。"
  - 加载中显示骨架屏动画
- **涉及文件**: `src/app/nana/page.tsx`
- **结果**: ✅ 完成

#### 任务 2.3：创建 3 个共享组件
- **做了什么**:
  1. `src/components/nana/shared/action-card.tsx` — 行动卡组件。Props: `title`, `description`, `icon` (LucideIcon), `href`, `iconBgClass`, `iconColorClass`。圆角卡片，带 hover shadow 和 active scale 微交互。
  2. `src/components/nana/shared/recap-bar.tsx` — 回顾条组件。Props: `latestNodeName`, `totalLitCount`。显示"上次你点亮了：XX" + 地图节点数 + "看看我的知识地图 →" 链接。
  3. `src/components/nana/shared/empty-hint.tsx` — 空提示组件。星形图标 + "你的光点地图还空着，第一道题，会点亮第一个光点。"。虚线边框，中心对齐。
- **涉及文件**: `src/components/nana/shared/action-card.tsx`, `src/components/nana/shared/recap-bar.tsx`, `src/components/nana/shared/empty-hint.tsx`
- **结果**: ✅ 完成

#### 任务 2.4：创建采集壳占位页
- **做了什么**: 创建 `src/app/nana/capture/page.tsx` 占位页，显示"功能建设中"提示和"回到首页"按钮，确保首页"拍一下这道题"链接不跳 404。完整采集壳将在 Commit ③ 实现。
- **涉及文件**: `src/app/nana/capture/page.tsx`
- **结果**: ✅ 完成

#### 任务 2.5：验证
- **做了什么**:
  1. `npm run test:nana:unit` — 4/4 通过 ✅
  2. `npm run test:nana:integration` — 5/5 通过 ✅
  3. `docker compose -f docker-compose.test.yml up --abort-on-container-exit` — 全部通过 ✅
  4. `npm run build` — exit code 0 ✅（增量构建）
- **结果**: ✅ 完成

### 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 无 → 创建 `capture/page.tsx` 占位页 | 额外创建占位页确保链接不跳 404 | 计划§3.3 标注"可选"，为保持导航完整性而创建 | 否 |
| 2 | 测试在本地运行方式未限定 | 本地 `DATABASE_URL=file:./data/test/test.db` 运行 + Docker 测试容器双重验证 | 本地 vitest 需显式设置 DATABASE_URL 通过 guard-db 检查 | 否 |

### 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| （无） | — | 所有文件均为新增，未修改上游任何文件 |

### 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| `npm run` 和 `npx` 因 WSL 集成失败（CreateProcessCommon 错误） | 使用 `node node_modules/...` 直接执行 |
| guard-db.ts 拦截（DATABASE_URL 为空） | 设置 `DATABASE_URL="file:./data/test/test.db"` 环境变量 |
| `test:all` 在本地测试时存在 13 个已有失败 | 已在 Docker 测试容器中全部通过（种子数据完整），确认是本地测试库缺少种子数据导致 |

### 完成状态

- [x] 任务 2.1~2.5 全部完成
- [x] 代码已提交（commit: `a63e36a`）
- [x] `test:nana:unit` 通过（4/4）
- [x] `test:nana:integration` 通过（5/5）
- [x] Docker 测试容器全部通过 ✅
- [x] `npm run build` exit code 0 ✅（增量构建）
- [x] 确认测试在安全路径运行（`./data/test/test.db` 被更新，`./data/dev.db` 未被触碰）
- [x] 零上游文件修改
- [x] P4 措辞合规：
  - "拍一下这道题" ✅（禁用"录入错题""诊断""评估"）
  - "补一段你当时怎么想的" ✅（禁用"口述录音""归因"）
  - "嗨，今天想从哪开始？" ✅（禁用"欢迎回来，继续学习"）
  - "上次你点亮了：XX" ✅（禁用"正确率""得分""未掌握"）
  - "第一道题，会点亮第一个光点" ✅（禁用"你还没有任何数据"）

---

## Commit ③：采集壳 UI + 组件

**开始时间**: 2026-06-28 07:00
**完成时间**: 2026-06-28 08:30
**Commit hash**: `1de9631`

### 执行记录

#### 任务 3.1：创建 mock-data.ts
- **做了什么**: 创建 `src/components/nana/capture/mock-data.ts`，包含 MOCK_QUESTION（题面）、MOCK_TRANSCRIPT（逐行转写）、MOCK_FEEDBACK（轻反馈文案）。
- **涉及文件**: `src/components/nana/capture/mock-data.ts`
- **结果**: ✅ 完成

#### 任务 3.2：创建 QuestionImageViewer
- **做了什么**: 题图查看器组件。Props: `stem: string`。渲染白色题面卡片（同 mockup：左侧金色竖条 + 题号 + 题目内容 + Times New Roman 数学字体）。固定在上半屏。
- **涉及文件**: `src/components/nana/capture/question-image-viewer.tsx`
- **结果**: ✅ 完成

#### 任务 3.3：创建 VoiceRecorder
- **做了什么**: 录音控件壳组件。三态：idle（圆形录音按钮 + "说说看"）→ recording（"正在听你说" + 闪烁圆点 + 波形动画 + mock 转写流 + "我听完了"按钮）→ completed（回调通知父组件）。定义了 AsrProvider 抽象接口（streamTranscribe / fileTranscribe），用 MockAsrProvider 实现（2s 延迟后逐字输出 MOCK_TRANSCRIPT）。
- **涉及文件**: `src/components/nana/capture/voice-recorder.tsx`
- **结果**: ✅ 完成

#### 任务 3.4：创建 TranscriptionPanel
- **做了什么**: 逐字稿面板组件。Props: `text: string`；`onChange?: (text: string) => void`。将文本按换行分割为可编辑段落，每行是一个 contentEditable div。底部提示"轻点任意一句就能改，改好会自动存，不急。"
- **涉及文件**: `src/components/nana/capture/transcription-panel.tsx`
- **结果**: ✅ 完成

#### 任务 3.5：创建 LightFeedback
- **做了什么**: 轻反馈组件。Props: `feedback: string | null; isPreliminary?: boolean`。loading 态显示"正在看你的描述…"，loaded 态显示反馈文案 + "不是终诊 · 这只是初步线索"标识。底部带"再拍一道"按钮。
- **涉及文件**: `src/components/nana/capture/light-feedback.tsx`
- **结果**: ✅ 完成

#### 任务 3.6：替换采集壳完整页面
- **做了什么**: 将占位页 `capture/page.tsx` 替换为完整采集壳：
  - 四分区布局：顶栏（←返回 / 这道题 / 重拍📷）→ 题图固定区 ~52vh → 三 tab → 下半屏内容
  - Tab 切换：讲讲思路→VoiceRecorder，我的话→TranscriptionPanel，帮你整理→LightFeedback
  - 自动切换：录音完成后 2s 自动跳转到"帮你整理"tab
  - 底部操作：已拍计数 + "再拍一道"按钮 + N≥3 时显示"开始诊断？"链接
  - 自定义 CSS 动画：波形柱状条、fadeIn、blink 圆点
  - P4 全部合规
- **涉及文件**: `src/app/nana/capture/page.tsx`
- **结果**: ✅ 完成

#### 任务 3.7：顺手修复 pre-existing build 错误
- **做了什么**: `submit-answers/route.ts` 中 `finalStates` 的类型是 `Map<string, { status: string; masteryProb: number }>`，在第 181 行合并到 `allStates`（`Map<string, ExistingState>`）时不兼容，因为 `ExistingState` 多了 `lastEvidence: Date | null`。修复：导入 `NodeStateOutput` 类型，合并时补 `{ ...s, lastEvidence: null }`。
- **涉及文件**: `src/app/api/diagnosis/submit-answers/route.ts`
- **结果**: ✅ 完成（build 通过）

### 验收标准

- [x] /nana/capture 页面可访问
- [x] 题图区域固定在上半屏，不随下半屏滚动
- [x] 录音前：显示录音按钮 + "说说看"文案
- [x] 录音中：波形动画 + mock 转写文字逐行出现 + "我听完了"按钮
- [x] 录音后：自动切换到"帮你整理"tab + 轻反馈动画（0.3s fade-in）
- [x] "我的话"tab 可编辑逐字稿（contentEditable）
- [x] "再拍一道"按钮可重置状态，已拍计数递增
- [x] 累积 3 道后显示"开始诊断"链接
- [x] 布局在 390px 手机宽度不崩
- [x] P4 措辞全部合规

### 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 3 | 仅创建采集壳组件 | 顺手修复了 submit-answers/route.ts 的 pre-existing 类型错误（`finalStates` 与 `allStates` 合并时类型不兼容） | 阻塞 build，且是已有问题非本次变更引入 | 否 |

### 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `src/app/api/diagnosis/submit-answers/route.ts` | 导入 `NodeStateOutput` 类型，合并时补 `lastEvidence` | Pre-existing 类型错误阻塞 build |

### 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| WSL bash 环境持续不可用（CreateProcessCommon 错误） | 使用 Docker 测试容器验证全部测试 |

### 完成状态

- [x] 任务 3.1~3.7 全部完成
- [x] 代码已提交（commit: `1de9631`）
- [x] `test:nana:unit` 通过（4/4）
- [x] `test:nana:integration` 通过（5/5）
- [x] Docker 测试容器全部通过 ✅
- [x] `npm run build` exit code 0 ✅
- [x] 确认测试在安全路径运行
- [x] 可进入审计阶段

---

## Commit ④：单题轻反馈规则版 API

**开始时间**: 2026-06-28 09:00  
**完成时间**: 2026-06-28 09:50  
**Commit hash**: `643f954`

### 执行记录

#### 任务 4.1：创建关键词匹配逻辑（feedback-rules.ts）
- **做了什么**: 创建 `src/lib/nana/feedback-rules.ts`，包含 3 条 KEYWORD_RULES（配方法/定义域与值域/计算习惯）、`matchTranscript()` 匹配函数、`getFeedback()` 核心函数。纯逻辑，无外部依赖，可独立测试。导出 `FeedbackResult` 接口（hint + relatedTags + isPreliminary: true）。
- **涉及文件**: `src/lib/nana/feedback-rules.ts`
- **结果**: ✅ 完成

#### 任务 4.2：创建 POST /api/nana/cases/:id/feedback
- **做了什么**: 创建 POST handler，鉴权 → 校验 transcript → 调用 `getFeedback(transcript)` 关键词匹配 → 返回 `{ hint, relatedTags, isPreliminary: true }`。400 校验（transcript 缺失或非字符串）。遵循现有 API 模式（next/server/next-auth/api-errors/logger）。
- **涉及文件**: `src/app/api/nana/cases/[id]/feedback/route.ts`
- **结果**: ✅ 完成

#### 任务 4.3：完善 LightFeedback 组件（连接真实 API）
- **做了什么**: 将组件从 Props 传入数据模式改为自动 fetch 模式。Props 改为 `{ transcript: string; caseId?: string }`。三态：loading（"正在看你的描述…" skeleton）→ loaded（hint + tags + "不是终诊"标识 + fade-in 动画）→ error（"这条先记下来了" fallback）。使用 useEffect + Abort 防止竞态。
- **涉及文件**: `src/components/nana/capture/light-feedback.tsx`
- **结果**: ✅ 完成

#### 任务 4.4：更新采集页（去掉 mock 反馈逻辑）
- **做了什么**: 去掉 `MOCK_FEEDBACK` 引用、`feedbackData` 状态、`isProcessing` 状态、`autoSwitchTimerRef`。录音完成后直接设置 transcript，800ms 后自动切换到 feedback tab（LightFeedback 自动 fetch）。"再拍一道"重置时只用重置 tab + transcript，不再管理 mock 反馈状态。
- **涉及文件**: `src/app/nana/capture/page.tsx`
- **结果**: ✅ 完成

#### 任务 4.5：创建单元测试（feedback-rules.test.ts）
- **做了什么**: 16 个测试用例覆盖：匹配"配方"/"完全平方"/"平方"/"定义域"/"值域"/"算错"/"算不对"/"算不出来"→ 各规则；多关键词优先第一条规则；无匹配/空字符串返回 null；`getFeedback` 完整输出（含 isPreliminary 断言）。
- **涉及文件**: `src/__tests__/unit/nana/feedback-rules.test.ts`
- **结果**: ✅ 完成（16/16 通过）

#### 任务 4.6：创建集成测试（feedback-api.test.ts）
- **做了什么**: 6 个测试用例，mock next/server/next-auth/logger/auth/api-errors。测试："配方"→配方法 hint，"定义域"→定义域 hint，"算不出来"→计算 hint，无匹配→默认 hint，空 transcript → 400，missing transcript → 400。
- **涉及文件**: `src/__tests__/integration/nana/feedback-api.test.ts`
- **结果**: ✅ 完成（6/6 通过）

#### 任务 4.7：验证
- **做了什么**:
  1. `test:nana:unit`（20/20）✅ — case-api 4 + feedback-rules 16
  2. `test:nana:integration`（11/11）✅ — case-api 5 + feedback-api 6
  3. **Docker 测试容器全部通过** ✅ — `test:all` 9 个脚本全部绿色
  4. **`npm run build` exit code 0** ✅ — 增量构建（通过 cmd shell 绕开 WSL 问题）
  5. 确认测试在安全路径运行（`./data/test/test.db`）
- **结果**: ✅ 完成

#### 任务 4.8：提交
- **做了什么**: `git add -A && git commit && git push origin dev`
- **涉及文件**: 6 个文件（4 新增 + 2 修改）
- **结果**: ✅ 完成（commit: `643f954`）

### 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 关键词匹配逻辑在 route.ts 中实现 | 抽取到独立的 `src/lib/nana/feedback-rules.ts` 中 | 便于单元测试不依赖 Next.js 环境 | 否 |
| 2 | 计划中的 KEYWORD_RULES hint 措辞略有不同 | 配方法 hint 改为"你提到配方法——可能和完全平方公式的灵活运用有关…"，添加 tags 字段 | 与测试文案一致、tags 支持 UI 展示 | 否 |
| 3 | LightFeedback Props 原为 `{ feedback, isPreliminary }` | 改为 `{ transcript, caseId }`，自动 fetch 而非传数据 | 符合"连接真实 API"目标，Props 语义更清晰 | 否 |

### 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `src/components/nana/capture/light-feedback.tsx` | 从 Props 驱动改为 auto-fetch 模式，Props 接口变更 | Commit ④ 要求连接真实 API |
| `src/app/nana/capture/page.tsx` | 去掉 mock 反馈逻辑及相关 import/state | 改为由 LightFeedback 组件自动 fetch |

### 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| WSL bash 环境持续不可用（CreateProcessCommon 错误） | 使用 `node -e` + `child_process.execSync` + `shell:'cmd.exe'` 运行 `next build` |
| guard-db.ts 拦截本地测试（DATABASE_URL 为空） | 设置 `DATABASE_URL="file:./data/test/test.db"` 环境变量 |
| 测试"算不对"用例文本不包含"算不对"子串 | 将"这个我怎么算都不对"改为"这个题我怎么算不对" |

### 完成状态

- [x] 所有任务完成（4.1~4.8）
- [x] 代码已提交（commit: `643f954`）
- [x] `test:nana:unit` 通过（20/20）
- [x] `test:nana:integration` 通过（11/11）
- [x] Docker 测试容器全部通过（`test:all` exit code 0）
- [x] `npm run build` exit code 0 ✅
- [x] 确认测试在安全路径运行（`./data/test/test.db` 被更新，`./data/dev.db` 未被触碰）
- [x] 可进入审计阶段
