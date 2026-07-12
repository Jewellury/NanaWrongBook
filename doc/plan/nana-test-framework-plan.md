# Nana 测试框架 · 开发计划

> 关联规格: `doc/product/nana-product-behavior-manual-v1.md`（产品行为手册）
> 关联 backlog: TD-006（手动改课本分类写入口径统一）、OD-003（E2E 补真实入口路径）
> 关联参考: `doc/reference/TECH_PLAN_v2.md`（技术方案）、`doc/reference/OPS_handbook.md`（运营手册）
> 计划日期: 2026-07-12
> 预计影响: `e2e/`、`playwright.config.ts`、`.github/workflows/`、`tests/fixtures/`、`scripts/`、`doc/`

---

## 1. 大白话概述

### 这轮要做什么

给 Nana 建一套**分层的自动化测试框架**，不写 20 条散乱 E2E，而是按五层组织：

1. **确定性 CI 闭环**——用假 AI 响应 + 临时数据库，每次 push 自动跑一条最小黄金路径（拍题→录音→保存→AI整理→汇总→图谱→打印预览），确保功能每一步都走得通、数据落库正确。
2. **性能与毛刺采集**——在同一条路径上采集按钮反馈耗时、页面加载、控制台错误、网络耗时、截图、视频、trace，设可调基线门槛。
3. **真实 Provider Smoke**——用专用测试账号 + 真实豆包 API，验证识图/转写/分类/反馈的真实质量，初期告警不门禁。
4. **AI 孩子视角评审**——固定扮演"数学基础较弱、第一次使用的高中生"，看截图序列 + 指标，按统一量表输出 JSON 判断。
5. **真机抽检清单**——相机/麦克风权限、iOS Safari、微信浏览器、实际打印，每次大版本发版前 5 分钟抽检。

### 为什么要做

现在 CI E2E 只覆盖了"上传题图→保存→知识地图→展开原图"，而且用 `?openCases=1` 绕过了真实入口点击。生产 Smoke 只测登录、首页和知识地图可打开。**录音、AI 整理结果卡、题目汇总按章节分组、图谱琥珀证据 vs 绿色掌握区分、打印预览**这些核心路径完全没有自动化覆盖。

孩子用的每一个环节都有可能出问题：按钮点了没反应、AI 整理等太久以为卡住、分类分错、打印出来裁切重叠。我们需要一套框架，不仅测"能不能走通"，还测"孩子用着顺不顺手"。

### 关键假设

**我们最终要测试的是"孩子看到的课本分类"（TextbookTopic），不是目前内部 48 个系统知识点（KnowledgeNode）。** 若这个假设不成立，手动挂载和打印测试的数据契约都要重写。

---

## 2. 前置依赖：两个产品功能补齐

> ⚠️ 完整闭环门禁依赖以下两个功能先实现。第一轮测试框架可以先做"现有路径 + 性能采集 + 虚拟麦克风 + AI 证据包"，不受阻塞。

### 2.1 依赖一：TextbookTopic 作为孩子侧权威分类来源

- **现状**：`CaseAiResult.textbookTopicId` 和 `CaseTextbookTopicTag` 双写，手动改分类时写入口径不统一（BACKLOG TD-006）
- **需要做到**：孩子手动修改的是 TextbookTopic，汇总页以 `CaseTextbookTopicTag`（source=manual 优先）为权威来源
- **阻塞的测试**：手动改分类验证、汇总页按章节分组验证、打印页按章节分组验证
- **计划引用**：本计划的技术附录 §6.4 定义了测试数据契约，假设 TD-006 已解决

### 2.2 依赖二：Nana 专用打印预览页 `/nana/print-preview`

- **现状**：现有 `/print-preview` 属于上游 wrong-notebook 功能，调 `/api/error-items/list`，不调 `/api/nana/cases`，不按课本章节分组
- **需要做到**：新增 `/nana/print-preview` 路由，按 TextbookTopic 章节分组，每题含小题图 + AI 摘要 + AI 想对你说 + 下一步，不打印技术字段
- **阻塞的测试**：打印预览页验证、PDF 生成验证
- **产品行为手册**：§13.7 已定义完整信息架构和 CSS Print Media 规则

### 2.3 不受阻塞的第一轮可做项

| 可做项 | 说明 |
|--------|------|
| 现有路径增强 | 去掉 `?openCases=1` 绕过，测真实入口点击 |
| 性能采集框架 | Playwright 截图/视频/trace/网络/控制台/性能数据 |
| 虚拟麦克风录音 | Playwright `page.evaluate` 注入 fake MediaRecorder |
| AI 证据包格式定义 | 截图序列 + 指标 JSON + 控制台错误的结构化输出 |
| 假豆包响应 mock | `vi.mock` 或 route intercept 返回固定 AI 结果 |

---

## 3. 任务分解

### 第一部分：测试证据采集基础设施

> 目标：Playwright 每次跑测试都自动保存"体验证据包"，AI 不需要重新操作页面，只需审阅。

- [ ] 任务 1.1：创建 `e2e/helpers/evidence-collector.ts`——统一的证据采集工具类
  - 每步自动截图（`page.screenshot`）
  - 全程视频录制（Playwright `video: 'on'`）
  - trace 保存（`trace: 'on'`，已有配置升级为 `'retain-on-failure'` → `'on'`）
  - 网络请求耗时采集（`page.on('requestfinished')`）
  - 控制台错误/警告采集（`page.on('console')` + `page.on('pageerror')`）
  - 页面性能数据（`page.evaluate(() => performance.getEntries())`）
  - 输出结构化 JSON：`{ step, timestamp, screenshotPath, networkTimings, consoleErrors, perfMetrics }`

- [ ] 任务 1.2：升级 `playwright.config.ts`——全局开启证据采集
  - `use.screenshot: 'only-on-failure'` → 改为每步手动截图 + 失败自动截图
  - `use.video: 'on'`
  - `use.trace: 'on'`（CI 中保留所有 trace，本地 `'retain-on-failure'`）
  - 新增 reporter：除 `html` 外，增加 `json` reporter 输出结构化结果
  - 新增 `use.actionTimeout` 和 `use.navigationTimeout` 基线值

- [ ] 任务 1.3：创建 `e2e/helpers/performance-baseline.ts`——性能门槛定义和断言工具
  - 定义可调基线常量（见 §4.2 性能门槛表）
  - `assertButtonFeedback(page, buttonSelector, maxMs)`——点击到出现 pressed/loading 反馈
  - `assertNavigationTiming(page, maxMs)`——页面加载耗时
  - `assertNoConsoleErrors(page)`——零未处理控制台错误
  - `assertNoFailedRequests(page)`——零失败请求
  - `assertNoHorizontalOverflow(page)`——零横向溢出
  - `assertNoButtonOverlap(page)`——零按钮文字重叠（视觉检测辅助）

- [ ] 任务 1.4：创建 `e2e/helpers/report-generator.ts`——AI 证据包生成器
  - 测试结束后聚合所有截图、指标、控制台日志为单个 JSON
  - 输出目录：`test-results/evidence-pack/`
  - 包含：截图序列（按步骤排序）、性能指标汇总、控制台错误列表、网络请求耗时表、数据库验证结果

### 第二部分：确定性 CI 闭环

> 目标：用假豆包响应 + 临时数据库，每次 push 自动跑黄金路径，验证功能走通 + 数据落库。

- [ ] 任务 2.1：创建 `e2e/helpers/mock-provider.ts`——假豆包响应拦截器
  - `page.route('**/api/nana/cases/*/process', ...)` 拦截 /process 请求
  - 返回固定的 7 字段结构化 JSON（复用 `process-api.test.ts` 的 MOCK_RESULT 结构）
  - 支持三种 fixture 对应三种响应：
    - `clear-printed` → 正常成功路径（高置信、完整字段）
    - `with-handwriting` → 手写干扰路径（转写有内容、分类有候选）
    - `tilted-partial` → 低置信降级路径（置信度 <0.5、未分类、诚实降级）

- [ ] 任务 2.2：创建 `e2e/helpers/virtual-microphone.ts`——虚拟麦克风注入
  - `page.addInitScript` 注入 fake `navigator.mediaDevices.getUserMedia`
  - 返回固定音频流（从 `tests/fixtures/nana/audio/20260707_194923.m4a` 读取或生成静音 webm）
  - fake `MediaRecorder`：收集 chunk → 合成 Blob → 触发 onstop
  - 确保 VoiceRecorder 组件完整走完 idle → requesting → recording → completed 四态
  - **不能跳过录音组件**：必须真实触发 `getUserMedia` 和 `MediaRecorder`

- [ ] 任务 2.3：创建 `e2e/helpers/db-verifier.ts`——数据库验证工具
  - 直接连接测试 SQLite 数据库（`prisma` client，`DATABASE_URL` 指向 e2e.db）
  - 验证 Case 创建、CaseAiResult 字段、CaseTextbookTopicTag 挂载、Artifact 写入
  - 验证 `processingStatus` 流转：pending → success/failed
  - 验证 `audioStatus`：pending → success/skipped/failed
  - 验证 `textbookTopicEdited` 标记

- [ ] 任务 2.4：编写黄金闭环最小路径 spec——`e2e/ci/nana-golden-path.spec.ts`
  - 登录测试账号（注册临时用户，复用现有模式）
  - 上传真实手拍题图 `clear-printed.jpg`
  - 通过虚拟麦克风完成录音（不能跳过）
  - 点击"收好这道题"
  - **性能断言**：2 秒内看到"已收好"
  - **性能断言**：AI 整理状态 ≤500ms 出现
  - 等待假豆包返回（mock，<1s），验证转写、AI 摘要、课本分类、轻反馈、可能方向、下一步建议
  - 手动调整一个课本章节分类
  - 进入题目汇总，确认题目归入正确章节
  - 进入图谱，确认只有"收过题"琥珀证据，不变成绿色掌握
  - **DB 验证**：Case + CaseAiResult + Tags + Artifact 全部正确落库
  - **证据采集**：每步截图 + 性能指标 + 控制台错误 + 网络耗时

- [ ] 任务 2.5：编写三题批量路径 spec——`e2e/ci/nana-batch-path.spec.ts`（夜间/发布前触发）
  - 三张 fixture 依次走黄金路径：
    - `clear-printed.jpg`：正常成功路径
    - `with-handwriting.jpg` + 录音：验证手写干扰和转写
    - `tilted-partial.jpg`：验证低置信、未分类及诚实降级
  - 验证三题在汇总页正确分组
  - 验证图谱中有三个琥珀证据点
  - 打开打印预览，确认按课本章节分组（依赖 `/nana/print-preview` 实现）
  - 生成打印 PDF，检查没有裁切、重叠、孤立章节标题和技术字段

- [ ] 任务 2.6：升级现有 `nana-main-flow.spec.ts`——去掉 `?openCases=1` 绕过
  - 改为通过真实 UI 入口点击进入"最近拍过的题"浮层
  - 保留作为快速冒烟测试（不跑完整黄金路径）

- [ ] 任务 2.7：CI 工作流集成
  - `ci.yml` 的 `e2e-test` job 增加 mock provider 环境变量
  - 黄金路径每次 push 跑（快速，mock AI <1s）
  - 批量路径只在 nightly schedule 或 release tag 时跑
  - 证据包作为 artifact 上传（保留 30 天）

### 第三部分：真实 Provider Smoke

> 目标：用专用测试账号 + 真实豆包 API，验证识图/转写/分类/反馈的真实质量。初期告警不门禁，稳定后升级为门禁。

- [ ] 任务 3.1：创建 `e2e/smoke/nana-provider-smoke.spec.ts`——真实 Provider 写操作 Smoke
  - 复用 smoke 凭证（`E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD`）
  - 上传 `clear-printed.jpg`（单题，不跑批量）
  - 真实录音（虚拟麦克风喂入 `20260707_194923.m4a`）
  - 等待真实豆包返回（≤60s 正常，45-60s 警告，>60s 失败）
  - 验证 7 字段全部有值且非空（不验证具体内容，只验证结构完整性）
  - 验证 topicId 在 16 个种子章节范围内
  - 验证 nodeId 在 48 个系统节点范围内
  - 验证 audioStatus = success（真实转写成功）
  - **性能采集**：记录真实 AI 耗时，与基线对比
  - 证据包上传为 artifact，供 AI 评审

- [ ] 任务 3.2：创建 `.github/workflows/provider-smoke.yml`——Provider Smoke 工作流
  - 触发：`workflow_dispatch`（手动）+ nightly schedule（每天凌晨 3 点）
  - 需要 secrets：`E2E_SMOKE_EMAIL`、`E2E_SMOKE_PASSWORD`、`E2E_BASE_URL`、`VOLCENGINE_API_KEY`、`VOLCENGINE_BASE_URL`、`VOLCENGINE_LITE_ENDPOINT`
  - 生成证据包 artifact
  - 失败时发 issue（不阻塞 main 合并，初期只告警）

- [ ] 任务 3.3：Smoke 后自动清理测试数据
  - 调用 `DELETE /api/nana/cases/:id` 删除 Smoke 创建的 Case
  - 或注册临时用户 + 测试后删除用户级联数据
  - 确保生产数据库不被测试数据污染

### 第四部分：AI 孩子视角评审

> 目标：AI 固定扮演"数学基础较弱、第一次使用的高中生"，看截图序列 + 指标，按统一量表输出 JSON。AI 只负责语义和体验判断，接口状态/时间/数据库/布局溢出由程序硬断言。

- [ ] 任务 4.1：创建 `e2e/helpers/ai-review-prompt.ts`——AI 评审提示词和量表
  - 角色设定："你是一个数学基础较弱、第一次使用这个 App 的高中生"
  - 统一量表（10 项，每项 0-2 分）：
    1. 是否知道下一步点哪里
    2. 每次点击是否立即有反馈
    3. 等 AI 时是否误以为卡住
    4. 是否能区分"收过题"和"已经掌握"
    5. 转写是否保留原意
    6. 分类是否在可接受章节范围内
    7. AI 是否编造题目条件、答案或掌握结论
    8. 汇总页是否方便快速扫题
    9. 打印结果是否真的适合周末复习
    10. 整体第一印象是否愿意继续用
  - 输出格式：标准 JSON `{ item, score, reason }`

- [ ] 任务 4.2：创建 `scripts/ai-review-runner.ts`——AI 评审执行脚本
  - 读取证据包 JSON（截图路径 + 性能指标 + 控制台错误）
  - 将截图序列 + 量表 prompt 发给 AI 模型
  - **使用不同于豆包 Lite 的模型**做评审（建议 Claude 或 DeepSeek），避免自己给自己打分
  - 输出评审报告到 `test-results/ai-review/report.json`
  - 聚合分数 + 高亮低分项 + 附原始截图引用

- [ ] 任务 4.3：CI 集成 AI 评审（可选，初期手动触发）
  - 在 Provider Smoke 工作流后增加 `ai-review` job
  - 依赖 provider-smoke 的证据包 artifact
  - 需要 AI 评审模型的 API Key（如 `DEEPSEEK_API_KEY`）
  - 评审报告上传为 artifact
  - 初期不阻塞发布，只生成报告供人工审阅

### 第五部分：真机抽检清单

> 目标：自动化不能替代的 4 项，每次大版本发布前 5 分钟抽检。

- [ ] 任务 5.1：创建 `doc/checklist/real-device-checklist.md`——真机抽检清单
  - **手机相机选择器**：打开 `/nana/capture`，点拍照按钮，确认相机选择器弹出
  - **Android/iOS 麦克风授权**：录音按钮 → 系统弹窗授权 → 录音 → 停止 → 确认录音完成
  - **微信内置浏览器**：微信打开 `nana.nanatop.xyz`，走完拍题→保存→AI整理→汇总
  - **手机浏览器打印**：打开打印预览页 → 调用浏览器打印 → 另存 PDF → 检查无裁切/重叠
  - 每项标注：通过/不通过/未测 + 备注

- [ ] 任务 5.2：创建 `scripts/generate-checklist.ts`——自动生成带当前版本信息的清单
  - 读取 `git log --oneline -1` 获取当前 commit
  - 读取 `package.json` 版本号
  - 生成带日期/版本/commit 的 markdown 清单模板

---

## 4. 验收标准

### 4.1 功能闭环验收

- [ ] CI 每次 push 自动跑黄金路径，退出码 0
- [ ] 黄金路径覆盖：登录→拍题→录音→保存→AI整理→手动改分类→汇总→图谱→打印预览
- [ ] 每步有截图、视频、trace、网络耗时、控制台错误记录
- [ ] 数据库验证：Case + CaseAiResult + Tags + Artifact 全部正确落库
- [ ] 去掉 `?openCases=1` 绕过，通过真实 UI 入口进入
- [ ] 虚拟麦克风真实触发 `getUserMedia` + `MediaRecorder`，不跳过录音组件
- [ ] 三题批量路径在 nightly/release 时跑通

### 4.2 性能门槛验收（可调基线）

| 指标 | 基线 | 警告 | 失败 |
|------|------|------|------|
| 按钮点击到 pressed/loading 反馈 | ≤100ms | 100-200ms | >200ms |
| 上传后题图预览出现 | ≤1.5s | 1.5-3s | >3s |
| 保存后"已收好"出现 | ≤2s | 2-4s | >4s |
| AI 整理状态出现 | ≤500ms | 500-1000ms | >1000ms |
| 真 AI 完成（mock 路径） | ≤1s | — | >2s |
| 真 AI 完成（真实 Provider） | ≤45s | 45-60s | >60s |
| 题目汇总首屏可操作（模拟 4G） | ≤2.5s | 2.5-4s | >4s |
| 全流程控制台未处理错误 | 0 | — | ≥1 |
| 全流程失败网络请求 | 0 | — | ≥1 |
| 全流程横向溢出 | 0 | — | ≥1 |
| 全流程按钮文字重叠 | 0 | — | ≥1 |

- [ ] 性能基线常量定义在 `performance-baseline.ts`，可在 `.env.e2e` 中覆盖
- [ ] CI 中性能超基线 → 测试失败（阻塞发布）
- [ ] 性能数据写入证据包 JSON，供 AI 评审参考

### 4.3 真实 Provider Smoke 验收

- [ ] 手动触发 Provider Smoke，真实豆包返回 7 字段
- [ ] topicId 在种子范围内、nodeId 在种子范围内
- [ ] audioStatus = success（真实转写）
- [ ] 真实 AI 耗时记录在证据包中
- [ ] 失败时自动创建 GitHub Issue
- [ ] 初期不阻塞 main 合并

### 4.4 AI 评审验收

- [ ] 评审报告 JSON 包含 10 项量表评分 + 原因
- [ ] 评审使用不同于豆包 Lite 的模型
- [ ] 评审报告引用截图路径（可追溯）
- [ ] 初期不阻塞发布

### 4.5 真机抽检验收

- [ ] 清单文档存在且包含 4 项检查
- [ ] 每次大版本发布前人工填写

### 4.6 测试策略标注

> 逻辑重的模块（状态机、错因归因规则、图遍历、BKT 计算）已有单元/集成测试覆盖（216 单测 + 18 集成测试）。
> 本计划聚焦 E2E 闭环和体验证据采集，不重复已有单测/集测。

---

## 5. 风险与注意事项

### 5.1 产品功能阻塞风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| TD-006 未解决（TextbookTopic 写入口径不统一） | 手动改分类测试、汇总页分组测试、打印页分组测试无法正确验证 | 第一轮不做这些测试；先做现有路径 + 性能采集；TD-006 解决后补上 |
| `/nana/print-preview` 未实现 | 打印预览验证无法做 | 第一轮不做打印测试；打印页实现后补上 |
| 假设"测试 TextbookTopic 而非 KnowledgeNode"不成立 | 手动挂载和打印测试的数据契约全部重写 | 在计划中明确标注假设；用户确认后再进入执行 |

### 5.2 技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Playwright 虚拟麦克风在 CI（headless）中不工作 | 录音测试无法自动化 | 用 `page.addInitScript` 注入 fake `getUserMedia` + fake `MediaRecorder`，不依赖真实音频设备 |
| 假豆包 mock 与真实 API 响应结构不一致 | CI 闭环通过但真实 Provider 失败 | mock 结构严格对齐 `CaseAnalyzerResult` 接口；Provider Smoke 验证真实结构 |
| 性能基线在不同 CI runner 上波动大 | 性能断言不稳定 | 基线设为可调（`.env.e2e` 覆盖）；CI runner 固定 `ubuntu-latest`；先跑 10 次取 P90 |
| 截图/视频/trace 占用大量 CI 存储空间 | CI 超存储限额 | artifact 保留 30 天；trace 只在失败时保留（本地）/CI 中用 `'on'` 但压缩 |
| AI 评审模型输出不稳定 | 评审结果不可复现 | 固定 temperature=0；prompt 中强制 JSON 输出；解析失败时标"评审失败"不阻塞 |
| 真实 Provider Smoke 污染生产数据库 | 生产数据被测试 Case 污染 | 注册临时用户 + 测试后删除用户级联数据；或用专用测试账号 + 定期清理 |

### 5.3 上游文件冲突风险

| 文件 | 操作 | 冲突风险 |
|------|------|----------|
| `playwright.config.ts` | 修改（已有文件） | 低——已有 nana 专用 project 配置，增量添加 |
| `.github/workflows/ci.yml` | 修改（已有文件） | 低——在 e2e-test job 中增量添加环境变量 |
| `e2e/ci/nana-main-flow.spec.ts` | 修改（已有文件） | 低——去掉 `?openCases=1` 绕过 |
| 新增 `e2e/helpers/*` | 新增 | 无冲突 |
| 新增 `e2e/ci/nana-golden-path.spec.ts` | 新增 | 无冲突 |
| 新增 `e2e/smoke/nana-provider-smoke.spec.ts` | 新增 | 无冲突 |
| 新增 `.github/workflows/provider-smoke.yml` | 新增 | 无冲突 |
| 新增 `scripts/ai-review-runner.ts` | 新增 | 无冲突 |
| 新增 `doc/checklist/real-device-checklist.md` | 新增 | 无冲突 |

### 5.4 注意事项

1. **不写 20 条散乱 E2E**：所有测试组织在 5 个 spec 文件中，每个 spec 对应一个层级
2. **程序硬断言 vs AI 语义判断分离**：接口状态、时间、数据库结果、布局溢出由程序硬断言；AI 只做语义和体验判断
3. **AI 评审不能自己给自己打分**：使用不同于豆包 Lite 的模型（建议 DeepSeek 或 Claude）
4. **证据包是核心产出**：AI 不需要重新操作页面，只需审阅一次完整"体验证据包"
5. **虚拟麦克风不能跳过录音组件**：必须真实触发 `getUserMedia` 和 `MediaRecorder`，走完四态
6. **三张 fixture 的三种路径要区分**：正常成功、手写干扰+转写、低置信+诚实降级

---

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `e2e/helpers/evidence-collector.ts` | 新增 | 统一证据采集工具类（截图/视频/trace/网络/控制台/性能） |
| `e2e/helpers/performance-baseline.ts` | 新增 | 性能门槛常量 + 断言工具函数 |
| `e2e/helpers/mock-provider.ts` | 新增 | 假豆包响应拦截器（route intercept） |
| `e2e/helpers/virtual-microphone.ts` | 新增 | 虚拟麦克风注入（fake getUserMedia + MediaRecorder） |
| `e2e/helpers/db-verifier.ts` | 新增 | 数据库验证工具（Prisma client 直连 e2e.db） |
| `e2e/helpers/report-generator.ts` | 新增 | AI 证据包生成器（聚合截图+指标+日志为 JSON） |
| `e2e/helpers/ai-review-prompt.ts` | 新增 | AI 评审提示词 + 统一量表定义 |
| `e2e/ci/nana-golden-path.spec.ts` | 新增 | 黄金闭环最小路径（单题，mock AI） |
| `e2e/ci/nana-batch-path.spec.ts` | 新增 | 三题批量路径（nightly/release 触发） |
| `e2e/ci/nana-main-flow.spec.ts` | 修改 | 去掉 `?openCases=1` 绕过，改用真实入口点击 |
| `e2e/smoke/nana-provider-smoke.spec.ts` | 新增 | 真实 Provider 写操作 Smoke |
| `playwright.config.ts` | 修改 | 全局开启视频/trace/json reporter + 性能基线 |
| `.github/workflows/ci.yml` | 修改 | e2e-test job 增加 mock 环境变量 + 证据包上传 |
| `.github/workflows/provider-smoke.yml` | 新增 | Provider Smoke 工作流（nightly + manual） |
| `scripts/ai-review-runner.ts` | 新增 | AI 评审执行脚本（读证据包 → 发模型 → 输出报告） |
| `scripts/generate-checklist.ts` | 新增 | 真机抽检清单自动生成脚本 |
| `doc/checklist/real-device-checklist.md` | 新增 | 真机抽检清单（4 项检查） |
| `.env.e2e.example` | 新增 | E2E 环境变量模板（性能基线覆盖 + smoke 凭证占位） |

---

## 7. 技术附录

### 7.1 黄金闭环路径详细步骤

```
1. 注册临时用户 → 登录 → /nana
2. 点"拍一道题" → /nana/capture
3. 上传 clear-printed.jpg（setInputFiles）
4. 切到录音 tab → 点"说说看" → 虚拟麦克风触发 → 3 秒后点"我听完了"
5. 点"收好这道题"
   ├── 性能断言：≤2s 看到"已收好"
   ├── 性能断言：≤500ms 看到"正在整理"
   └── mock /process 返回 <1s
6. 验证 AI 结果卡：
   ├── transcript 非空
   ├── questionSummary 非空
   ├── textbookTopicId 在种子范围
   ├── initialFeedback 非空
   ├── possibleMistakeReason 可空（空时隐藏区块）
   └── nextActionSuggestion 非空
7. 点"改分类" → 选择另一个课本章节 → 确认
   ├── DB 验证：CaseTextbookTopicTag source=manual
   └── DB 验证：CaseAiResult.textbookTopicEdited=true（依赖 TD-006）
8. 点"去题目汇总" → /nana/knowledge-map（默认 tab=题目汇总）
   ├── 验证题目在正确章节分组下
   ├── 验证"未分类"分组不存在（已手动分类）
   └── 性能断言：首屏可操作 ≤2.5s
9. 切到"图谱" tab
   ├── 验证有琥珀色"收过题"证据
   └── 验证无绿色"掌握"节点（v1 不点亮）
10. 点"打印" → /nana/print-preview（依赖新页面实现）
    ├── 验证按课本章节分组
    ├── 验证每题含小题图 + AI 摘要 + AI 想对你说 + 下一步
    ├── 验证不打印技术字段（时间/置信度/source/转写）
    └── 调用 window.print() → 保存 PDF → 检查无裁切/重叠
11. 证据包输出：截图序列 + 性能指标 + 控制台错误 + 网络耗时 + DB 验证结果
```

### 7.2 假豆包 Mock 响应结构

```typescript
// e2e/helpers/mock-provider.ts

interface MockCaseAnalyzerResult {
  transcript: string;
  questionSummary: string;
  textbookTopicCandidates: { topicId: string; confidence: number; reason: string }[];
  knowledgeNodeCandidates: { nodeId: string; confidence: number; reason: string }[];
  initialFeedback: string;
  possibleMistakeReason: string;
  nextActionSuggestion: string;
  audioStatus: 'success' | 'skipped' | 'failed' | 'timeout';
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// 三种 fixture 的 mock 响应
const MOCK_CLEAR_PRINTED: MockCaseAnalyzerResult = {
  transcript: '这道题是判断函数单调性的',
  questionSummary: '判断 f(x)=x²-2x 在 [0,3] 上的单调性',
  textbookTopicCandidates: [
    { topicId: 'TB-010', confidence: 0.85, reason: '函数单调性判断' },
  ],
  knowledgeNodeCandidates: [
    { nodeId: 'M2a-13', confidence: 0.8, reason: '用定义判断单调性' },
  ],
  initialFeedback: '你很仔细，推导过程写得很完整',
  possibleMistakeReason: '可能在符号变换时出了差错',
  nextActionSuggestion: '回看 3.2 函数的基本性质，重点检查移项后的符号',
  audioStatus: 'success',
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
};

const MOCK_WITH_HANDWRITING: MockCaseAnalyzerResult = {
  transcript: '我先用导数算的，然后代入端点值比较',
  questionSummary: '利用导数判断函数单调性',
  textbookTopicCandidates: [
    { topicId: 'TB-010', confidence: 0.75, reason: '导数与单调性' },
  ],
  knowledgeNodeCandidates: [
    { nodeId: 'M2a-13', confidence: 0.7, reason: '导数应用' },
  ],
  initialFeedback: '思路很清晰，知道用导数来分析',
  possibleMistakeReason: '可能在计算导数时漏了系数',
  nextActionSuggestion: '回看 3.3 导数的运算，检查求导过程',
  audioStatus: 'success',
  usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
};

const MOCK_TILTED_PARTIAL: MockCaseAnalyzerResult = {
  transcript: '',
  questionSummary: '图片不太完整，能看到部分三角函数内容',
  textbookTopicCandidates: [], // 低置信 → 空数组
  knowledgeNodeCandidates: [], // 低置信 → 空数组
  initialFeedback: '这道题拍得有点斜，不过没关系，先帮你收着',
  possibleMistakeReason: '', // 空 → 隐藏区块
  nextActionSuggestion: '下次拍照时尽量把题目拍完整，方便 AI 更好地帮你整理',
  audioStatus: 'skipped',
  usage: { promptTokens: 80, completionTokens: 30, totalTokens: 110 },
};
```

### 7.3 虚拟麦克风注入方案

```typescript
// e2e/helpers/virtual-microphone.ts

async function injectVirtualMicrophone(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // fake getUserMedia —— 返回静音音频流
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const dest = audioContext.createMediaStreamDestination();
    oscillator.connect(dest);
    oscillator.start();

    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.audio) {
        return dest.stream;
      }
      throw new Error('Only audio supported in test');
    };

    // fake MediaRecorder —— 收集 chunk → 合成 Blob
    const OriginalMediaRecorder = window.MediaRecorder;
    class FakeMediaRecorder extends OriginalMediaRecorder {
      // 继承真实 MediaRecorder，但确保 stream 来自 fake getUserMedia
      // ondataavailable / onstop 行为不变
    }
    // 不替换 MediaRecorder 本身，只确保 getUserMedia 返回有效 stream
    // 真实 MediaRecorder 可以处理 fake stream
  });
}
```

> **注意**：此方案需要验证 Playwright headless Chromium 是否支持 `AudioContext` + `MediaRecorder`。
> 如果不支持，降级为：注入完全 fake 的 `MediaRecorder` 类，直接在 `onstop` 中返回预制的 Blob。

### 7.4 数据库验证查询

```typescript
// e2e/helpers/db-verifier.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function verifyCaseCreated(caseId: string) {
  const case_ = await prisma.case.findUnique({ where: { id: caseId } });
  expect(case_).toBeTruthy();
  expect(case_!.studentId).toBeTruthy();
  // processingStatus 应为 success（mock 立即返回）
  expect(case_!.processingStatus).toBe('success');
}

async function verifyAiResult(caseId: string, expectedResult: MockCaseAnalyzerResult) {
  const aiResult = await prisma.caseAiResult.findUnique({ where: { caseId } });
  expect(aiResult).toBeTruthy();
  expect(aiResult!.questionSummary).toBe(expectedResult.questionSummary);
  expect(aiResult!.initialFeedback).toBe(expectedResult.initialFeedback);
  // textbookTopicId 应等于最高置信候选
  if (expectedResult.textbookTopicCandidates.length > 0) {
    const topCandidate = expectedResult.textbookTopicCandidates[0];
    if (topCandidate.confidence >= 0.5) {
      expect(aiResult!.textbookTopicId).toBe(topCandidate.topicId);
    } else {
      expect(aiResult!.textbookTopicId).toBeNull();
    }
  }
}

async function verifyTextbookTopicTag(caseId: string, source: string, topicId: string) {
  const tag = await prisma.caseTextbookTopicTag.findFirst({
    where: { caseId, source, textbookTopicId: topicId },
  });
  expect(tag).toBeTruthy();
}

async function verifyArtifactCreated(caseId: string, type: string) {
  const artifact = await prisma.artifact.findFirst({
    where: { caseId, type },
  });
  expect(artifact).toBeTruthy();
}

async function verifyNoGreenMastery(studentId: string) {
  // v1 不点亮节点 —— StudentNodeState 不应有 status=mastered
  const mastered = await prisma.studentNodeState.findMany({
    where: { studentId, status: 'mastered' },
  });
  expect(mastered.length).toBe(0);
}
```

### 7.5 AI 评审量表 JSON 输出格式

```json
{
  "reviewId": "ai-review-2026-07-12-001",
  "model": "deepseek-chat",
  "role": "数学基础较弱、第一次使用的高中生",
  "screenshotsReviewed": 11,
  "scores": [
    {
      "item": 1,
      "question": "是否知道下一步点哪里",
      "score": 2,
      "reason": "每个页面都有明确的引导按钮，'收好这道题'和'去题目汇总'都很清楚"
    },
    {
      "item": 2,
      "question": "每次点击是否立即有反馈",
      "score": 1,
      "reason": "大部分按钮有反馈，但上传图片后等了约2秒才出现预览"
    },
    {
      "item": 3,
      "question": "等AI时是否误以为卡住",
      "score": 2,
      "reason": "'正在整理这题…'提示很清楚，还有预计时间"
    },
    {
      "item": 4,
      "question": "是否能区分'收过题'和'已经掌握'",
      "score": 1,
      "reason": "琥珀色和绿色有区分，但没有文字说明两者的区别"
    }
    // ... 10 项
  ],
  "totalScore": 16,
  "maxScore": 20,
  "lowScoreItems": [2, 4],
  "summary": "整体体验流畅，主要问题在图片预览速度和颜色含义说明"
}
```

### 7.6 真机抽检清单模板

```markdown
# 真机抽检清单

## 版本信息
- 日期：____-__-__
- Commit：________
- 版本号：____
- 检查人：______

## 检查项

### 1. 手机相机选择器
- 设备：____
- 浏览器：____
- 打开 /nana/capture → 点拍照按钮
- [ ] 通过 — 相机选择器弹出，可选择后置摄像头
- [ ] 不通过 — 问题描述：____
- 备注：____

### 2. Android/iOS 麦克风授权
- 设备：____
- OS 版本：____
- 浏览器：____
- 点"说说看" → 系统弹窗 → 授权 → 录音 5 秒 → "我听完了"
- [ ] 通过 — 授权弹窗出现，录音完成态正确
- [ ] 不通过 — 问题描述：____
- 录音格式：____（webm/mp4/other）

### 3. 微信内置浏览器
- 微信版本：____
- 打开 nana.nanatop.xyz → 登录 → 拍题 → 保存 → AI 整理 → 汇总
- [ ] 通过 — 全流程走通
- [ ] 不通过 — 卡在哪一步：____
- 备注：____

### 4. 手机浏览器打印
- 设备：____
- 浏览器：____
- 打开打印预览页 → 浏览器打印 → 另存 PDF
- [ ] 通过 — PDF 生成，无裁切/重叠
- [ ] 不通过 — 问题描述：____
- PDF 页数：____
```

### 7.7 CI 工作流集成方案

```yaml
# ci.yml e2e-test job 增量修改

e2e-test:
  # ... 现有配置 ...
  env:
    DATABASE_URL: "file:./e2e.db"
    NEXTAUTH_SECRET: "ci-secret-value-123456"
    NEXTAUTH_URL: "http://127.0.0.1:3000"
    # 新增：mock 模式标记
    E2E_MOCK_PROVIDER: "true"
  steps:
    # ... 现有步骤 ...
    - name: Run Playwright tests (golden path)
      run: npx playwright test --project=mobile-chrome e2e/ci/nana-golden-path.spec.ts
      env:
        CI: true

    - name: Upload Evidence Pack
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: evidence-pack
        path: test-results/evidence-pack/
        retention-days: 30

    - name: Upload Playwright Report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
```

```yaml
# .github/workflows/provider-smoke.yml（新增）

name: Provider Smoke Test
on:
  workflow_dispatch:
    inputs:
      reason:
        description: '触发原因'
        required: false
        default: 'manual'
  schedule:
    - cron: '0 19 * * *'  # 每天北京时间凌晨 3 点

jobs:
  provider-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      E2E_MODE: smoke
      E2E_SMOKE_EMAIL: ${{ secrets.E2E_SMOKE_EMAIL }}
      E2E_SMOKE_PASSWORD: ${{ secrets.E2E_SMOKE_PASSWORD }}
      E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
      VOLCENGINE_API_KEY: ${{ secrets.VOLCENGINE_API_KEY }}
      VOLCENGINE_BASE_URL: ${{ secrets.VOLCENGINE_BASE_URL }}
      VOLCENGINE_LITE_ENDPOINT: ${{ secrets.VOLCENGINE_LITE_ENDPOINT }}
      NANA_AUDIO_TRANSCRIPT_ENABLED: "true"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run Provider Smoke
        run: npx playwright test --project=smoke e2e/smoke/nana-provider-smoke.spec.ts
      - name: Run AI Review
        if: always()
        run: npx tsx scripts/ai-review-runner.ts
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
      - name: Upload Evidence Pack
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: provider-evidence-pack
          path: test-results/
          retention-days: 30
      - name: Create Issue on Failure
        if: failure()
        uses: actions/create-issue@v1
        with:
          title: 'Provider Smoke 失败'
          body: '请查看 evidence-pack artifact 中的截图和指标'
```

### 7.8 五层测试与发布门禁关系

```
┌─────────────────────────────────────────────────────┐
│  层级              验证什么               阻塞发布？   │
├─────────────────────────────────────────────────────┤
│  1. CI 功能闭环    每步走通+数据落库        是        │
│  2. 性能毛刺采集    耗时/控制台/网络/溢出     是        │
│  3. 真实 Provider   识图/转写/分类质量       初期告警   │
│     Smoke                          稳定后门禁        │
│  4. AI 体验评审     孩子视角语义判断        初期不阻塞  │
│  5. 真机抽检        相机/麦克风/iOS/微信    发版前抽检  │
└─────────────────────────────────────────────────────┘
```

### 7.9 Playwright 配置升级方案

```typescript
// playwright.config.ts 修改要点

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html', { host: '0.0.0.0' }],
        ['json', { outputFile: 'test-results/report.json' }],  // 新增
    ],
    use: {
        baseURL: isSmoke
            ? (process.env.E2E_BASE_URL ?? 'https://nana.nanatop.xyz')
            : E2E_HOST,
        trace: process.env.CI ? 'on' : 'retain-on-failure',  // 升级
        video: 'on',          // 新增
        screenshot: 'only-on-failure',  // 新增（每步手动截图在 spec 中做）
        actionTimeout: 10_000,    // 新增
        navigationTimeout: 15_000, // 新增
    },
    // ... 其余不变 ...
});
```

### 7.10 实施优先级和分轮建议

| 轮次 | 范围 | 依赖 | 预计工时 |
|------|------|------|----------|
| **R1（立即可做）** | 第一部分全部 + 第二部分 2.1-2.4, 2.6-2.7 + 第五部分 5.1 | 无 | 2-3 天 |
| **R2（依赖 TD-006）** | 第二部分 2.5（三题批量 + 手动改分类 + 汇总分组验证） | TD-006 解决 | 1 天 |
| **R3（依赖打印页）** | 第二部分 2.5 补充打印预览验证 | `/nana/print-preview` 实现 | 0.5 天 |
| **R4（独立）** | 第三部分全部（真实 Provider Smoke） | 测试账号 + secrets 配置 | 1 天 |
| **R5（独立）** | 第四部分全部（AI 评审） | R4 证据包 + AI 模型 API Key | 1 天 |

> **建议**：R1 立即启动，不受任何产品功能阻塞。R2/R3 等产品功能补齐后接上。R4/R5 可与 R1-R3 并行推进。

---

## 8. 开放项（需用户确认）

1. **核心假设确认**：我们最终要测试的是"孩子看到的课本分类"（TextbookTopic），不是内部 48 个系统知识点（KnowledgeNode）。这个假设是否成立？
2. **AI 评审模型选择**：使用 DeepSeek 还是 Claude 做评审？需要对应的 API Key。
3. **Provider Smoke 测试账号**：是否已有专用测试账号？还是需要注册一个？
4. **Provider Smoke 数据清理策略**：注册临时用户测试后删除，还是用固定账号定期清理？
5. **性能基线确认**：§4.2 中的基线值是否合理？是否需要调整？
6. ** nightly schedule 时间**：Provider Smoke 每天跑一次，北京时间凌晨几点合适？
7. **R1 启动确认**：是否确认按此计划进入执行阶段？
