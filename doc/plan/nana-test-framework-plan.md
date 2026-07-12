# Nana 测试框架 · 开发计划 (r3)

> **前置条件：** `doc/spec/nana-v1-minimum-loop-acceptance.md`（v1 最小闭环验收契约）已冻结
> 关联规格: `doc/spec/nana-v1-minimum-loop-acceptance.md`（验收契约）、`doc/product/nana-product-behavior-manual-v1.md`（产品行为手册）
> 关联 backlog: TD-006（手动改课本分类写入口径统一）、OD-003（E2E 补真实入口路径）
> 关联参考: `doc/reference/TECH_PLAN_v2.md`（技术方案）、`doc/reference/OPS_handbook.md`（运营手册）
> 计划日期: 2026-07-12（r2: 2026-07-12，r3 修订: 2026-07-12，整合验收契约评审反馈）
> 预计影响: `e2e/`、`playwright.config.ts`、`.github/workflows/`、`tests/fixtures/`、`scripts/`、`doc/`

---

## r3 修订摘要

| 评审问题 | r2 不足 | r3 修正 |
|---------|---------|---------|
| 缺少功能契约 | 测试框架只解决"怎么测"，没有权威定义"测什么" | 新增 `doc/spec/nana-v1-minimum-loop-acceptance.md`，冻结 CL-01～CL-16 验收点；测试场景映射到 CL 编号 |
| ffmpeg 在 CI 主机缺失 | r2 只在 Docker runner 装 ffmpeg，CI 主机跑 Next.js 时也需要 | r3 在 ci.yml e2e-test job 中显式 `ffmpeg -version` 检查 + 安装步骤 |
| 假 Provider 响应选择不可靠 | r2 用进程级 `E2E_FIXTURE_NAME` 环境变量切换，批量测试中不可靠 | r3 改为按请求 body 中题图哈希映射固定响应，去掉环境变量切换 |
| R1a/R1d 范围重复 | r2 在 R1a 写入 2.8（30 题场景）又单列 R1d，范围重叠 | r3 将 30 题场景（任务 2.8）从 R1a 移除，明确归入 R1d |
| 保存时间阈值不一致 | r2 §4.2 写"2 秒"，§7.1 写"10 秒" | r3 统一：保存确认硬门禁 = 10s（CI）/ 5s（本地），由验收契约 CL-04 定义 |
| Fixture 来源未约束 | r2 只说"补充集合、不等式、三角函数"，未约束到 16 个 TextbookTopic | r3 要求所有新 fixture 必须来自当前 16 个 TextbookTopic 覆盖范围，逐张脱敏确认 |
| 手动分类定位不清 | r2 未明确手动分类在产品中的定位 | r3 明确：手动 TextbookTopic 分类是纠错路径（CL-09），不是每题必经步骤；理想路径是 AI 自动分类 |

---

## r2 修订摘要

| 评审问题 | r1 错误 | r2 修正 |
|---------|---------|---------|
| 核心假设 | TextbookTopic 和 KnowledgeNode "二选一" | 改为**双层契约**：孩子操作层=TextbookTopic，系统验证层=KnowledgeNode，两层都测 |
| Mock 方案 | `page.route()` 拦截 /process，后端不执行 | 改为**本地假 Provider 服务器**，`VOLCENGINE_BASE_URL` 指向它，真实 /process 代码完整执行 |
| R1 依赖 | 声称无依赖但含手动改分类（依赖 TD-006） | 拆为 R1a（无依赖）/ R1b（依赖 TD-006）/ R1c（依赖打印页） |
| 性能门禁 | 绝对耗时立即硬门禁 | R1 只采集不阻塞；积累 20 次后用滚动基线 +30% 告警；硬门禁仅保留功能性断言 |
| 数据治理 | "删除 Case 或删除用户"未决策 | 固定专用测试账号 + 记录 Case ID + afterAll 精确删除；DELETE API 审计通过前不启用 nightly 写测试 |
| processingStatus | 写在 Case 上 | 修正：`processingStatus` 在 `CaseAiResult` 上，`Case` 无此字段 |
| StudentNodeState.status | 断言 `status != 'mastered'` | 修正：合法值为 `stable/uncertain/gap/untested`，无 `mastered`；断言无新增记录或 stable 数量不变 |
| 环境变量 | `VOLCENGINE_LITE_ENDPOINT` | 修正：项目实际使用 `LITE_ENDPOINT_ID` |
| Provider Smoke env | 给 runner 注入豆包 Key 改变生产容器 | 修正：生产服务用自己的 .env，Smoke workflow 只需 URL + 测试账号 |
| 7 字段非空 | 要求全部非空 | 修正：`possibleMistakeReason` 允许为空，空时隐藏区块 |
| 虚拟麦克风 | 自己改写 MediaRecorder | 改为 Chromium `--use-fake-device-for-media-stream` + 真实 WAV 文件 |
| 视频/trace | 全局 `video: on`、`trace: on` | 分层策略：截图始终保留；trace `retain-on-failure`；video 仅失败或 Provider/AI 评审时保留；artifact 14 天 + 大小上限 |
| Fixture 多样性 | 3 张全偏函数题 | 补充集合、不等式、三角函数等不同章节脱敏题图 |
| 数据规模 | 只测 1-3 题 | 新增 30 题汇总页数据规模场景 |
| AI 评审 | 只"扮演孩子" | 必须引用具体截图/步骤/指标；人工校准 10 次；只用专用测试账号+脱敏题图；始终是建议非门禁 |

---

## 1. 大白话概述

### 这轮要做什么

给 Nana 建一套**分层的自动化测试框架**，不写 20 条散乱 E2E，而是按五层组织：

1. **确定性 CI 闭环**——启动本地假 Provider 服务器替代豆包 API，浏览器仍请求真实 `/process` 路由，真实代码完成转码、解析、事务和落库。每次 push 自动跑黄金路径，验证功能走通 + 数据落库。
2. **性能与毛刺采集**——在同一条路径上采集按钮反馈耗时、页面加载、控制台错误、网络耗时、截图。R1 只采集不阻塞；积累 20 次后用滚动基线 +30% 偏差告警；硬门禁仅保留功能性断言。
3. **真实 Provider Smoke**——用固定专用测试账号 + 真实豆包 API，验证识图/转写/分类/反馈的真实质量。初期手动触发，稳定后每周 2-3 次。DELETE API 审计通过前不启用 nightly 写测试。
4. **AI 体验评审**——AI 按固定量表找问题，必须引用具体截图、步骤和指标。初期由人工抽查 10 次校准一致性。始终是建议，不成为发布硬门禁。
5. **真机抽检清单**——相机/麦克风权限、iOS Safari、微信浏览器、实际打印，每次大版本发版前 5 分钟抽检。

### 为什么要做

现在 CI E2E 只覆盖了"上传题图→保存→知识地图→展开原图"，而且用 `?openCases=1` 绕过了真实入口点击。生产 Smoke 只测登录、首页和知识地图可打开。**录音、AI 整理结果卡、题目汇总按章节分组、图谱琥珀证据、打印预览**这些核心路径完全没有自动化覆盖。

孩子用的每一个环节都有可能出问题：按钮点了没反应、AI 整理等太久以为卡住、分类分错、打印出来裁切重叠。我们需要一套框架，不仅测"能不能走通"，还测"孩子用着顺不顺手"。

### 核心假设：双层分类契约（已确认）

**不是"TextbookTopic 和 KnowledgeNode 二选一"，而是双层契约：**

```
孩子操作层：TextbookTopic
  手动分类、汇总分组、打印分组
              ↓ 映射
系统验证层：KnowledgeNode
  AI 系统标签、知识地图琥珀证据
  不写 StudentNodeState，不变绿色
```

确认：
- 孩子只能看到并修改课本章节分类 TextbookTopic。
- 自动化还要验证它映射到正确的 KnowledgeNode，让地图产生琥珀证据。
- 两层都测，但不能让孩子直接面对内部 48 节点。

---

## 2. 前置依赖与分轮拆分

### 2.1 依赖一：TD-006 — TextbookTopic 写入口径统一

- **现状**：`CaseAiResult.textbookTopicId` 和 `CaseTextbookTopicTag` 双写，手动改分类时写入口径不统一
- **需要做到**：孩子手动修改的是 TextbookTopic，汇总页以 `CaseTextbookTopicTag`（source=manual 优先）为权威来源
- **阻塞的测试**：手动改分类验证、汇总页按章节分组验证、打印页按章节分组验证
- **归属轮次**：R1b

### 2.2 依赖二：Nana 专用打印预览页 `/nana/print-preview`

- **现状**：现有 `/print-preview` 属于上游 wrong-notebook 功能，调 `/api/error-items/list`，不调 `/api/nana/cases`
- **需要做到**：新增 `/nana/print-preview` 路由，按 TextbookTopic 章节分组
- **阻塞的测试**：打印预览页验证、PDF 生成验证
- **归属轮次**：R1c

### 2.3 依赖三：DELETE API — Case 删除接口

- **现状**：`src/app/api/nana/cases/` 下无 DELETE handler
- **需要做到**：新增 `DELETE /api/nana/cases/:id`，带归属校验（只能删自己的 Case），级联删除 Artifact + CaseAiResult + Tags
- **阻塞的测试**：Provider Smoke 自动清理
- **归属轮次**：R4 前置；DELETE API 需单独计划、审计和用户确认
- **过渡策略**：DELETE API 上线前，Provider Smoke 保持手动触发，不开启 nightly 写测试

### 2.4 分轮拆分

| 轮次 | 范围 | 依赖 | 预计工时 |
|------|------|------|----------|
| **R1a（立即可做）** | 证据采集基础设施 + 假 Provider 服务器 + 虚拟麦克风 + 黄金路径（不含手动改分类/打印/30题） + 去掉 `?openCases=1` + 真机清单 + 补充多章节 fixture | 无 | 3-4 天 |
| **R1b（依赖 TD-006）** | 手动改分类验证 + 汇总页按章节分组验证 | TD-006 解决 | 0.5 天 |
| **R1c（依赖打印页）** | 打印预览验证 + PDF 生成验证 | `/nana/print-preview` 实现 | 0.5 天 |
| **R1d（数据规模）** | 30 题汇总页性能场景 | R1a 完成 | 0.5 天 |
| **R4（依赖 DELETE API）** | 真实 Provider Smoke + 自动清理 | 专用测试账号 + DELETE API 审计通过 + secrets 配置 | 1.5 天 |
| **R5（依赖 R4）** | AI 评审 + 人工校准 | R4 证据包 + AI 评审 adapter | 1.5 天 |

> **建议**：R1a 立即启动。R1b/R1c 等产品功能补齐后接上。R1d 在 R1a 稳定后做。R4/R5 等 DELETE API 审计通过后推进。

---

## 3. 任务分解

### 第一部分：测试证据采集基础设施

> 目标：Playwright 每次跑测试都自动保存"体验证据包"，AI 不需要重新操作页面，只需审阅。

- [ ] 任务 1.1：创建 `e2e/helpers/evidence-collector.ts`——统一的证据采集工具类
  - 每步手动截图（`page.screenshot`），始终保留
  - 网络请求耗时采集（`page.on('requestfinished')`）
  - 控制台错误/警告采集（`page.on('console')` + `page.on('pageerror')`）
  - 页面性能数据（`page.evaluate(() => performance.getEntries())`）
  - 输出结构化 JSON：`{ step, timestamp, screenshotPath, networkTimings, consoleErrors, perfMetrics }`

- [ ] 任务 1.2：升级 `playwright.config.ts`——分层证据采集策略
  - `use.screenshot: 'only-on-failure'`（自动截图仅失败时；每步手动截图在 spec 中做）
  - `use.trace: 'retain-on-failure'`（不在 CI 中全局开 `on`，避免拖慢和堆积）
  - `use.video: 'retain-on-failure'`（普通 CI 只在失败时保留；Provider Smoke / AI 评审任务单独覆写为 `'on'`）
  - 新增 reporter：除 `html` 外，增加 `json` reporter 输出结构化结果
  - 新增 `use.actionTimeout: 10_000` 和 `use.navigationTimeout: 15_000`
  - artifact 保留 14 天，设单次大小上限（`retention-days: 14`）

- [ ] 任务 1.3：创建 `e2e/helpers/performance-collector.ts`——性能采集（非门禁）工具
  - 定义采集指标常量（见 §4.2 性能采集表）
  - `measureButtonFeedback(page, buttonSelector)`——点击到出现 pressed/loading 反馈，返回耗时
  - `measureNavigation(page)`——页面加载耗时
  - `collectConsoleErrors(page)`——收集未处理控制台错误
  - `collectFailedRequests(page)`——收集失败网络请求
  - `checkHorizontalOverflow(page)`——检测横向溢出
  - `checkButtonOverlap(page)`——检测按钮文字重叠（视觉检测辅助）
  - **R1 阶段：只采集记录，不因绝对耗时阻塞**
  - 硬门禁断言（始终阻塞）：无点击反馈、保存超时、关键 API 失败、横向溢出、未处理异常

- [ ] 任务 1.4：创建 `e2e/helpers/report-generator.ts`——AI 证据包生成器
  - 测试结束后聚合所有截图、指标、控制台日志为单个 JSON
  - 输出目录：`test-results/evidence-pack/`
  - 包含：截图序列（按步骤排序）、性能指标汇总、控制台错误列表、网络请求耗时表、数据库验证结果
  - 设大小上限：单次证据包不超过 50MB（截图压缩到 JPEG quality 80）

### 第二部分：确定性 CI 闭环

> 目标：用本地假 Provider 服务器替代豆包 API，浏览器请求真实 /process，真实代码完成转码、解析、事务和落库。每次 push 自动跑黄金路径，验证功能走通 + 数据落库。

- [ ] 任务 2.1：创建 `e2e/helpers/fake-provider-server.ts`——本地假豆包 Provider
  - 启动一个本地 HTTP 服务器，模拟 OpenAI 兼容接口（`/chat/completions`）
  - **r3 修正：按请求 body 中题图哈希映射固定响应**（不用进程级环境变量切换）
  - 响应延迟可控（默认 <100ms，可模拟慢响应）
  - 支持 fixture 响应（按题图哈希索引）：
    - `clear-printed` 哈希 → 正常成功路径（高置信、完整字段）
    - `with-handwriting` 哈希 → 手写干扰路径（转写有内容、分类有候选）
    - `tilted-partial` 哈希 → 低置信降级路径（置信度 <0.5、未分类、诚实降级）
    - `set-theory` 哈希 → 集合题路径（不同章节，验证多章节分组）
    - `inequality` 哈希 → 不等式题路径（不同章节）
  - **关键**：浏览器仍请求真实 `/api/nana/cases/:id/process`，真实 route handler 执行，真实 `case-analyzer.ts` 调用假 Provider URL，真实 Prisma 事务落库

  ```typescript
  // e2e/helpers/fake-provider-server.ts（伪代码）
  import http from 'http';
  import crypto from 'crypto';

  // r3：按题图哈希映射固定响应，不依赖进程级环境变量
  // 预计算每张 fixture 题图的哈希，建立哈希→mock 响应的映射表
  const FIXTURE_HASHES: Record<string, string> = {
    'a1b2c3d4...': 'clear-printed',    // clear-printed.jpg 的图片内容哈希
    'e5f6g7h8...': 'with-handwriting', // with-handwriting.jpg 的哈希
    'i9j0k1l2...': 'tilted-partial',   // tilted-partial.jpg 的哈希
    'm3n4o5p6...': 'set-theory',       // set-theory.jpg 的哈希
    'q7r8s9t0...': 'inequality',        // inequality.jpg 的哈希
  };

  const MOCK_RESPONSES: Record<string, object> = {
    'clear-printed': { /* 7 字段 */ },
    'with-handwriting': { /* 7 字段 */ },
    'tilted-partial': { /* 7 字段，低置信 */ },
    'set-theory': { /* 7 字段，TB-003 集合运算 */ },
    'inequality': { /* 7 字段，TB-008 一元二次不等式 */ },
  };

  export function startFakeProvider(port = 3999): http.Server {
    return http.createServer((req, res) => {
      if (req.url === '/chat/completions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          // r3：从请求 body 中提取 image_url，计算哈希，匹配 fixture
          const parsed = JSON.parse(body);
          const imageUrl = parsed.messages?.[0]?.content?.find(
            (c: any) => c.type === 'image_url'
          )?.image_url?.url || '';
          const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
          const fixtureName = FIXTURE_HASHES[hash] || 'clear-printed'; // fallback
          const mockResult = MOCK_RESPONSES[fixtureName];
          // 包裹在 OpenAI chat completion 响应格式中
          const response = {
            id: 'chatcmpl-fake-' + Date.now(),
            object: 'chat.completion',
            choices: [{
              index: 0,
              message: { role: 'assistant', content: JSON.stringify(mockResult) },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  }
  ```

  > **r3 关键修正**：不再使用 `process.env.E2E_FIXTURE_NAME` 切换响应。批量测试中多张题图同时上传时，进程级变量不可靠。改为每张 fixture 预计算图片内容 MD5 哈希，假 Provider 从请求 body 提取 image_url 计算哈希后匹配。

  - CI 启动方式：`webServer.command` 中先启动假 Provider，再启动 Next.js
  - 环境变量：`VOLCENGINE_API_KEY=fake-key`、`VOLCENGINE_BASE_URL=http://127.0.0.1:3999`、`LITE_ENDPOINT_ID=fake-endpoint`
  - **r3：不需要 `E2E_FIXTURE_NAME` 环境变量**——假 Provider 按题图哈希自动匹配

- [ ] 任务 2.2：创建 `e2e/helpers/virtual-microphone.ts`——虚拟麦克风（Chromium 原生方案）
  - **优先使用 Chromium 官方 fake-media 参数**，不自己改写 MediaRecorder
  - Playwright launch options 增加 Chromium flags：
    - `--use-fake-device-for-media-stream`（使用虚拟音频/视频设备）
    - `--use-fake-ui-for-media-stream`（自动授权，不弹权限对话框）
  - 准备一段脱敏的数学口述 WAV 文件放入 `tests/fixtures/nana/audio/`
  - 让浏览器真实录制成 webm，再经过 ffmpeg 和 /process 完整音频链路
  - 这样能验证完整音频链路（录音→转码→转写），而不是只验证录音按钮状态
  - **如果 Chromium fake-media 在 headless 中不工作**：降级为 `page.addInitScript` 注入 fake `getUserMedia` 返回预制 Blob，但仍不替换 `MediaRecorder`，让真实 `MediaRecorder` 处理 fake stream

  ```typescript
  // playwright.config.ts 中的 project 配置
  {
    name: 'mobile-chrome',
    testDir: './e2e/ci',
    use: {
      ...devices['Pixel 7'],
      // 虚拟麦克风：Chromium 原生 fake media
      launchOptions: {
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
        ],
      },
    },
  }
  ```

- [ ] 任务 2.3：创建 `e2e/helpers/db-verifier.ts`——数据库验证工具
  - 直接连接测试 SQLite 数据库（`prisma` client，`DATABASE_URL` 指向 e2e.db）
  - 验证 Case 创建（`Case.id`、`Case.studentId`、`Case.createdAt`）
  - 验证 CaseAiResult 字段（**`processingStatus` 在 CaseAiResult 上，不在 Case 上**）
  - 验证 CaseTextbookTopicTag 挂载
  - 验证 CaseKnowledgeTag 挂载（系统层 KnowledgeNode 验证）
  - 验证 Artifact 写入（question_image + audio_note）
  - 验证 `textbookTopicEdited` 标记（R1b，依赖 TD-006）
  - **验证 StudentNodeState 无新增记录**（v1 不点亮节点）
    - 合法值为 `stable/uncertain/gap/untested`，无 `mastered`
    - 断言方式：记录测试前 StudentNodeState 数量，测试后数量不变

  ```typescript
  // 修正后的数据库验证
  async function verifyCaseCreated(caseId: string) {
    const case_ = await prisma.case.findUnique({ where: { id: caseId } });
    expect(case_).toBeTruthy();
    expect(case_!.studentId).toBeTruthy();
    // Case 没有 processingStatus 字段——它在 CaseAiResult 上
  }

  async function verifyAiResult(caseId: string, expected: MockResult) {
    const aiResult = await prisma.caseAiResult.findUnique({ where: { caseId } });
    expect(aiResult).toBeTruthy();
    expect(aiResult!.processingStatus).toBe('success'); // ← 在 CaseAiResult 上
    expect(aiResult!.questionSummary).toBe(expected.questionSummary);
    // possibleMistakeReason 允许为空
    if (expected.possibleMistakeReason) {
      expect(aiResult!.possibleMistakeReason).toBe(expected.possibleMistakeReason);
    } else {
      expect(aiResult!.possibleMistakeReason).toBeNull();
    }
  }

  async function verifyNoStudentNodeStateChange(studentId: string, beforeCount: number) {
    // v1 不点亮节点 —— StudentNodeState 不应有新增
    // 合法值: stable|uncertain|gap|untested，无 mastered
    const afterCount = await prisma.studentNodeState.count({
      where: { studentId },
    });
    expect(afterCount).toBe(beforeCount);
  }

  async function verifyKnowledgeNodeTag(caseId: string, source: string, nodeId: string) {
    // 系统验证层：KnowledgeNode 标签存在
    const tag = await prisma.caseKnowledgeTag.findFirst({
      where: { caseId, source, nodeId },
    });
    expect(tag).toBeTruthy();
  }

  async function verifyTextbookTopicTag(caseId: string, source: string, topicId: string) {
    // 孩子操作层：TextbookTopic 标签存在
    const tag = await prisma.caseTextbookTopicTag.findFirst({
      where: { caseId, source, textbookTopicId: topicId },
    });
    expect(tag).toBeTruthy();
  }
  ```

- [ ] 任务 2.4：编写黄金闭环最小路径 spec（R1a）——`e2e/ci/nana-golden-path.spec.ts`
  - 登录测试账号（注册临时用户，复用现有模式）
  - 上传真实手拍题图 `clear-printed.jpg`
  - 通过虚拟麦克风完成录音（Chromium fake-media，不能跳过）
  - 点击"收好这道题"
  - **硬门禁断言**：10s 内看到"已收好"（CI 环境）/ 5s（本地）（保存超时 = 阻塞，由 CL-04 定义）
  - **硬门禁断言**：AI 整理状态出现（无反馈 = 阻塞）
  - **性能采集（不阻塞）**：记录按钮反馈耗时、整理状态出现耗时
  - 等待假 Provider 返回（<100ms），验证 AI 结果卡：
    - transcript 非空（有录音时）
    - questionSummary 非空
    - textbookTopicId 在种子范围（孩子操作层验证）
    - knowledgeNodeCandidates 在种子范围（系统验证层验证）
    - initialFeedback 非空
    - **possibleMistakeReason 可空**（空时隐藏区块，不报错）
    - nextActionSuggestion 非空
  - 进入题目汇总，确认题目归入正确章节（自动分类，非手动改）
  - 进入图谱，确认有琥珀色"收过题"证据
  - **DB 验证（双层）**：
    - Case + CaseAiResult + CaseTextbookTopicTag + CaseKnowledgeTag + Artifact 全部正确落库
    - CaseAiResult.processingStatus = 'success'
    - StudentNodeState 无新增记录（v1 不点亮）
  - **证据采集**：每步截图 + 性能指标 + 控制台错误 + 网络耗时

- [ ] 任务 2.5：编写三题批量路径 spec（R1a，不含手动改分类/打印）——`e2e/ci/nana-batch-path.spec.ts`
  - 三张 fixture 依次走黄金路径：
    - `clear-printed.jpg`：正常成功路径
    - `with-handwriting.jpg` + 录音：验证手写干扰和转写
    - `tilted-partial.jpg`：验证低置信、未分类及诚实降级
  - 验证三题在汇总页正确分组（自动分类）
  - 验证图谱中有三个琥珀证据点
  - **R1b 补充**：手动改分类验证（依赖 TD-006）
  - **R1c 补充**：打印预览验证（依赖 `/nana/print-preview`）

- [ ] 任务 2.6：升级现有 `nana-main-flow.spec.ts`——去掉 `?openCases=1` 绕过
  - 改为通过真实 UI 入口点击进入"最近拍过的题"浮层
  - 保留作为快速冒烟测试（不跑完整黄金路径）

- [ ] 任务 2.7：补充多章节 fixture 题图
  - 现有 3 张全偏函数题，无法证明"按不同课本章节整理错题集"真的有用
  - 至少补充：集合题（TB-003）、不等式题（TB-008）等不同章节的脱敏题图
  - **r3 约束**：所有新 fixture 必须来自当前 16 个 TextbookTopic 覆盖范围（见验收契约 §7），逐张脱敏确认
  - 对应的假 Provider mock 响应也需要覆盖新章节的 topicId/nodeId

- [ ] 任务 2.8：30 题数据规模场景 spec（**R1d，不在 R1a 范围**）——`e2e/ci/nana-scale-test.spec.ts`
  - 通过数据库直接灌入 30 道 Case + CaseAiResult（不同章节分布）
  - 打开题目汇总页，验证：
    - 首屏可操作时间（采集，不阻塞）
    - 按章节分组正确
    - 滚动流畅性（无明显卡顿）
    - 无横向溢出（硬门禁）
  - 打开图谱，验证 30 个琥珀证据点渲染性能
  - **目的**：当前毛刺和慢的问题，很可能在题量增加后才暴露

- [ ] 任务 2.9：CI 工作流集成
  - `ci.yml` 的 `e2e-test` job 增加假 Provider 启动步骤
  - **r3：显式 ffmpeg 检查**——CI 主机跑 Next.js 时也需要 ffmpeg（音频转码依赖），必须在 e2e-test job 中显式安装和验证
  - 环境变量：`VOLCENGINE_API_KEY=fake-key`、`VOLCENGINE_BASE_URL=http://127.0.0.1:3999`、`LITE_ENDPOINT_ID=fake-endpoint`
  - 黄金路径每次 push 跑
  - 批量路径只在 nightly schedule 或 release tag 时跑
  - 证据包作为 artifact 上传（保留 14 天）

### 第三部分：真实 Provider Smoke

> 目标：用固定专用测试账号 + 真实豆包 API，验证识图/转写/分类/反馈的真实质量。
> **关键**：Provider Smoke 在 GitHub runner 上运行，目标是已部署的生产 URL。生产服务使用服务器自己的 .env（含 VOLCENGINE_API_KEY 等），Smoke workflow 只需 URL + 测试账号凭证。

- [ ] 任务 3.1：创建 `e2e/smoke/nana-provider-smoke.spec.ts`——真实 Provider 写操作 Smoke
  - 复用固定专用测试账号（`E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD`）
  - 上传 `clear-printed.jpg`（单题，不跑批量）
  - 真实录音（Chromium fake-media 喂入脱敏 WAV）
  - 等待真实豆包返回（≤60s 正常，45-60s 警告，>60s 失败）
  - 验证 7 字段结构完整性（**possibleMistakeReason 允许为空**）：
    - transcript 非空（有录音时）
    - questionSummary 非空
    - textbookTopicId 在 16 个种子章节范围内（或为 null 表示未分类）
    - knowledgeNodeCandidates 在 48 个系统节点范围内
    - initialFeedback 非空
    - possibleMistakeReason 可空
    - nextActionSuggestion 非空
  - 验证 audioStatus = success（真实转写成功）
  - **性能采集**：记录真实 AI 耗时
  - 证据包上传为 artifact，供 AI 评审
  - **数据清理**：afterAll 记录本次创建的 Case ID，通过经过归属校验的 DELETE API 精确删除
  - **过渡策略**：DELETE API 审计通过前，Smoke 保持手动触发（`workflow_dispatch`），不开启 nightly 写测试

- [ ] 任务 3.2：创建 `.github/workflows/provider-smoke.yml`——Provider Smoke 工作流
  - 触发：`workflow_dispatch`（手动）
  - **不设 nightly schedule**（DELETE API 审计通过后再加）
  - 稳定后改为每周 2-3 次手动触发或 schedule
  - 需要 secrets：`E2E_SMOKE_EMAIL`、`E2E_SMOKE_PASSWORD`、`E2E_BASE_URL`
  - **不需要** `VOLCENGINE_API_KEY` 等——生产服务用自己的 .env
  - 生成证据包 artifact
  - 失败时发 issue（不阻塞 main 合并，初期只告警）

  ```yaml
  # .github/workflows/provider-smoke.yml
  name: Provider Smoke Test
  on:
    workflow_dispatch:
      inputs:
        reason:
          description: '触发原因'
          required: false
          default: 'manual'
    # schedule:
    #   - cron: '0 19 * * 1,4'  # TODO: DELETE API 审计通过后启用，每周二周五

  jobs:
    provider-smoke:
      runs-on: ubuntu-latest
      timeout-minutes: 15
      env:
        E2E_MODE: smoke
        E2E_SMOKE_EMAIL: ${{ secrets.E2E_SMOKE_EMAIL }}
        E2E_SMOKE_PASSWORD: ${{ secrets.E2E_SMOKE_PASSWORD }}
        E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
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
        - name: Upload Evidence Pack
          if: always()
          uses: actions/upload-artifact@v4
          with:
            name: provider-evidence-pack
            path: test-results/
            retention-days: 14
        - name: Create Issue on Failure
          if: failure()
          uses: actions/create-issue@v1
          with:
            title: 'Provider Smoke 失败'
            body: '请查看 evidence-pack artifact 中的截图和指标'
  ```

- [ ] 任务 3.3：DELETE API 计划（独立计划，不在此实现）
  - 新增 `DELETE /api/nana/cases/:id`，带归属校验 + 级联删除
  - 需单独计划、审计和用户确认
  - 上线前：Provider Smoke 保持手动触发，不开启 nightly 写测试
  - 上线后：Smoke afterAll 记录 Case ID → 精确删除 → 启用 schedule

### 第四部分：AI 体验评审

> 目标：AI 按固定量表找问题，必须引用具体截图、步骤和指标。初期由人工抽查校准。始终是建议，不成为发布硬门禁。

- [ ] 任务 4.1：创建 `e2e/helpers/ai-review-adapter.ts`——AI 评审 adapter（不绑定具体模型）
  - 定义评审输入接口：`{ screenshots: string[], metrics: PerfMetrics, consoleErrors: string[], steps: StepInfo[] }`
  - 定义评审输出接口：`{ scores: ScoreItem[], totalScore: number, summary: string }`
  - 定义 adapter 接口：`review(input: ReviewInput): Promise<ReviewOutput>`
  - **R1/R5 初期不绑定具体模型**：先定义 adapter 和人工审阅证据包的流程
  - 后续可实现 DeepSeek adapter / Claude adapter 等

- [ ] 任务 4.2：创建 `e2e/helpers/ai-review-prompt.ts`——AI 评审提示词和量表
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
  - **强制要求**：每项评分必须引用具体截图编号、步骤名称和指标数据
  - 输出格式：标准 JSON `{ item, score, reason, screenshotRef, stepRef, metricRef }`
  - **隐私保护**：只允许使用专用测试账号和脱敏题图的截图，避免把真实孩子数据发给第三方模型

- [ ] 任务 4.3：创建 `scripts/ai-review-runner.ts`——AI 评审执行脚本
  - 读取证据包 JSON（截图路径 + 性能指标 + 控制台错误）
  - 将截图序列 + 量表 prompt 发给 AI 模型（通过 adapter 接口）
  - **使用不同于豆包 Lite 的模型**做评审，避免自己给自己打分
  - 输出评审报告到 `test-results/ai-review/report.json`
  - 聚合分数 + 高亮低分项 + 附原始截图引用

- [ ] 任务 4.4：人工校准流程
  - 初期由人工抽查 10 次 AI 评审结果
  - 对比 AI 评分与人工评分的一致性
  - 校准 prompt 直到一致性达标（建议 ≥80% 项分差 ≤1）
  - 校准通过后 AI 评分可作为参考，但**始终是建议，不成为发布硬门禁**

- [ ] 任务 4.5：CI 集成 AI 评审（校准通过后）
  - 在 Provider Smoke 工作流后增加 `ai-review` job
  - 依赖 provider-smoke 的证据包 artifact
  - 评审报告上传为 artifact
  - 不阻塞发布

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
- [ ] 黄金路径覆盖：登录→拍题→录音→保存→AI整理→汇总→图谱
- [ ] **假 Provider 不绕过后端**：真实 /process 路由执行，真实 case-analyzer.ts 调用假 Provider URL，真实 Prisma 事务落库
- [ ] 每步有截图、网络耗时、控制台错误记录
- [ ] 数据库验证（双层）：
  - Case + CaseAiResult + CaseTextbookTopicTag + CaseKnowledgeTag + Artifact 全部正确落库
  - CaseAiResult.processingStatus = 'success'（在 CaseAiResult 上，不在 Case 上）
  - StudentNodeState 无新增记录（合法值 stable/uncertain/gap/untested，无 mastered）
- [ ] 去掉 `?openCases=1` 绕过，通过真实 UI 入口进入
- [ ] 虚拟麦克风使用 Chromium fake-media 参数，真实录制成 webm，经过 ffmpeg 和 /process
- [ ] 三题批量路径在 nightly/release 时跑通
- [ ] 30 题数据规模场景验证汇总页和图谱性能

### 4.2 性能采集与门禁策略

#### R1 阶段：只采集，不因绝对耗时阻塞

| 指标 | 采集值 | 硬门禁？ |
|------|:------:|:--------:|
| 按钮点击到 pressed/loading 反馈 | 记录 | 是（无反馈=阻塞） |
| 上传后题图预览出现 | 记录 | 否（仅采集） |
| 保存后“已收好”出现 | 记录 | 是（>10s=阻塞，CI / >5s 本地） |
| AI 整理状态出现 | 记录 | 是（无反馈=阻塞） |
| 假 Provider 完成 | 记录 | 否（<2s 期望） |
| 题目汇总首屏可操作 | 记录 | 否（仅采集） |
| 全流程控制台未处理错误 | 0 | 是（≥1=阻塞） |
| 全流程失败网络请求 | 0 | 是（≥1=阻塞） |
| 全流程横向溢出 | 0 | 是（≥1=阻塞） |

#### 积累 20 次后的门禁升级策略

1. 计算 20 次有效运行的中位数、P90 和波动系数
2. 设定滚动基线 = 最近 20 次的中位数
3. **告警**（不阻塞）：单次耗时 > 滚动基线 × 1.3
4. **硬门禁**（阻塞）：仅保留功能性断言——无点击反馈、保存超时、关键 API 失败、横向溢出、未处理异常
5. 真实 Provider 60 秒上限继续保留，但属于 Smoke，不属于普通 CI 性能门禁

#### 性能数据存储

- [ ] 性能采集数据写入证据包 JSON
- [ ] 每次运行的性能数据追加到 `test-results/perf-history.jsonl`（用于计算滚动基线）
- [ ] 积累 20 次后自动计算基线并更新 `e2e/helpers/performance-baseline.ts`

### 4.3 真实 Provider Smoke 验收

- [ ] 手动触发 Provider Smoke，真实豆包返回 7 字段
- [ ] topicId 在种子范围内（或 null 表示未分类）
- [ ] nodeId 在种子范围内
- [ ] audioStatus = success（真实转写）
- [ ] possibleMistakeReason 可空（不要求全部非空）
- [ ] 真实 AI 耗时记录在证据包中
- [ ] 失败时自动创建 GitHub Issue
- [ ] 初期不阻塞 main 合并
- [ ] **DELETE API 上线前**：Smoke 保持手动触发，不开启 nightly 写测试
- [ ] **DELETE API 上线后**：afterAll 精确删除本次 Case，启用 schedule

### 4.4 AI 评审验收

- [ ] 评审报告 JSON 包含 10 项量表评分 + 原因
- [ ] **每项评分必须引用具体截图编号、步骤名称和指标数据**
- [ ] 评审使用不同于豆包 Lite 的模型（通过 adapter 接口）
- [ ] 评审报告引用截图路径（可追溯）
- [ ] 只使用专用测试账号和脱敏题图的截图
- [ ] 人工校准 10 次后一致性达标（≥80% 项分差 ≤1）
- [ ] **始终是建议，不成为发布硬门禁**

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
| TD-006 未解决 | 手动改分类测试、汇总页分组测试无法正确验证 | R1a 不做这些测试；R1b 等 TD-006 解决后补上 |
| `/nana/print-preview` 未实现 | 打印预览验证无法做 | R1a 不做打印测试；R1c 等打印页实现后补上 |
| DELETE API 未实现 | Provider Smoke 无法自动清理 | 过渡策略：Smoke 保持手动触发，不开启 nightly 写测试；DELETE API 上线后启用 |

### 5.2 技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Chromium fake-media 在 headless CI 中不工作 | 录音测试无法自动化 | 降级为 `page.addInitScript` 注入 fake `getUserMedia` 返回预制 Blob，但不替换 `MediaRecorder` |
| 假 Provider 与真实豆包 API 响应格式不一致 | CI 闭环通过但真实 Provider 失败 | 假 Provider 严格模拟 OpenAI chat completion 格式；Provider Smoke 验证真实格式 |
| GitHub runner 性能波动大 | 绝对耗时断言不稳定 | R1 只采集不阻塞；积累 20 次后用滚动基线 +30% 偏差告警；硬门禁仅保留功能性断言 |
| 截图/视频/trace 占用大量 CI 存储空间 | CI 超存储限额 | 分层策略：截图始终保留（JPEG 压缩）；trace `retain-on-failure`；video 仅失败或 Provider/AI 评审时保留；artifact 14 天 + 50MB 上限 |
| AI 评审模型输出不稳定 | 评审结果不可复现 | 固定 temperature=0；prompt 中强制 JSON 输出 + 引用截图；解析失败时标"评审失败"不阻塞；人工校准 10 次 |
| 真实 Provider Smoke 污染生产数据库 | 生产数据被测试 Case 污染 | 固定专用测试账号 + 记录 Case ID + afterAll 精确删除；DELETE API 审计通过前不启用 nightly 写测试 |
| 现有 fixture 全偏函数题 | 无法验证多章节分组 | 补充集合、不等式、三角函数等不同章节脱敏题图 |
| 只测 1-3 题无法暴露性能问题 | 题量增加后才暴露的毛刺被遗漏 | 新增 30 题数据规模场景 |

### 5.3 上游文件冲突风险

| 文件 | 操作 | 冲突风险 |
|------|------|----------|
| `playwright.config.ts` | 修改（已有文件） | 低——已有 nana 专用 project 配置，增量添加 |
| `.github/workflows/ci.yml` | 修改（已有文件） | 低——在 e2e-test job 中增量添加环境变量 |
| `e2e/ci/nana-main-flow.spec.ts` | 修改（已有文件） | 低——去掉 `?openCases=1` 绕过 |
| 新增 `e2e/helpers/*` | 新增 | 无冲突 |
| 新增 `e2e/ci/nana-golden-path.spec.ts` | 新增 | 无冲突 |
| 新增 `e2e/ci/nana-batch-path.spec.ts` | 新增 | 无冲突 |
| 新增 `e2e/ci/nana-scale-test.spec.ts` | 新增 | 无冲突 |
| 新增 `e2e/smoke/nana-provider-smoke.spec.ts` | 新增 | 无冲突 |
| 新增 `.github/workflows/provider-smoke.yml` | 新增 | 无冲突 |
| 新增 `scripts/ai-review-runner.ts` | 新增 | 无冲突 |
| 新增 `scripts/generate-checklist.ts` | 新增 | 无冲突 |
| 新增 `doc/checklist/real-device-checklist.md` | 新增 | 无冲突 |
| 新增 `tests/fixtures/nana/audio/*.wav` | 新增 | 无冲突 |
| 新增 `tests/fixtures/nana/cases/*.jpg` | 新增 | 无冲突 |

### 5.4 注意事项

1. **不写 20 条散乱 E2E**：所有测试组织在 5 个 spec 文件中，每个 spec 对应一个层级
2. **程序硬断言 vs AI 语义判断分离**：接口状态、数据库结果、布局溢出由程序硬断言；AI 只做语义和体验判断
3. **AI 评审不能自己给自己打分**：使用不同于豆包 Lite 的模型（通过 adapter 接口）
4. **AI 评审始终是建议**：不成为发布硬门禁
5. **证据包是核心产出**：AI 不需要重新操作页面，只需审阅一次完整"体验证据包"
6. **虚拟麦克风不跳过录音组件**：使用 Chromium fake-media 参数 + 真实 WAV，让浏览器真实录制成 webm，经过完整音频链路
7. **假 Provider 不绕过后端**：`VOLCENGINE_BASE_URL` 指向本地假服务器，真实 /process 代码完整执行
8. **双层分类契约**：孩子侧 TextbookTopic + 系统侧 KnowledgeNode，两层都测
9. **性能门禁分阶段**：R1 只采集不阻塞；积累 20 次后滚动基线 +30% 告警；硬门禁仅功能性断言
10. **生产 Smoke 数据治理**：固定专用测试账号 + 精确删除；DELETE API 审计通过前不启用 nightly 写测试

---

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `e2e/helpers/evidence-collector.ts` | 新增 | 统一证据采集工具类（截图/网络/控制台/性能） |
| `e2e/helpers/performance-collector.ts` | 新增 | 性能采集工具（R1 只采集不阻塞 + 硬门禁功能性断言） |
| `e2e/helpers/fake-provider-server.ts` | 新增 | 本地假豆包 Provider 服务器（OpenAI 兼容接口） |
| `e2e/helpers/virtual-microphone.ts` | 新增 | 虚拟麦克风配置（Chromium fake-media 参数 + WAV 文件） |
| `e2e/helpers/db-verifier.ts` | 新增 | 数据库验证工具（Prisma client 直连 e2e.db，双层验证） |
| `e2e/helpers/report-generator.ts` | 新增 | AI 证据包生成器（聚合截图+指标+日志为 JSON） |
| `e2e/helpers/ai-review-adapter.ts` | 新增 | AI 评审 adapter 接口（不绑定具体模型） |
| `e2e/helpers/ai-review-prompt.ts` | 新增 | AI 评审提示词 + 统一量表定义 |
| `e2e/ci/nana-golden-path.spec.ts` | 新增 | 黄金闭环最小路径（单题，假 Provider，R1a） |
| `e2e/ci/nana-batch-path.spec.ts` | 新增 | 三题批量路径（nightly/release 触发，R1a + R1b + R1c） |
| `e2e/ci/nana-scale-test.spec.ts` | 新增 | 30 题数据规模场景（R1d） |
| `e2e/ci/nana-main-flow.spec.ts` | 修改 | 去掉 `?openCases=1` 绕过，改用真实入口点击 |
| `e2e/smoke/nana-provider-smoke.spec.ts` | 新增 | 真实 Provider 写操作 Smoke |
| `playwright.config.ts` | 修改 | 分层证据采集策略 + json reporter + Chromium fake-media flags |
| `.github/workflows/ci.yml` | 修改 | e2e-test job 增加假 Provider 启动 + 环境变量 + 证据包上传 |
| `.github/workflows/provider-smoke.yml` | 新增 | Provider Smoke 工作流（手动触发，DELETE API 审计后加 schedule） |
| `scripts/ai-review-runner.ts` | 新增 | AI 评审执行脚本（读证据包 → 发模型 → 输出报告） |
| `scripts/generate-checklist.ts` | 新增 | 真机抽检清单自动生成脚本 |
| `doc/checklist/real-device-checklist.md` | 新增 | 真机抽检清单（4 项检查） |
| `tests/fixtures/nana/audio/math-voice-sample.wav` | 新增 | 脱敏数学口述 WAV 文件（虚拟麦克风用） |
| `tests/fixtures/nana/cases/set-theory.jpg` | 新增 | 集合题脱敏题图（多章节覆盖） |
| `tests/fixtures/nana/cases/inequality.jpg` | 新增 | 不等式题脱敏题图（多章节覆盖） |
| `tests/fixtures/nana/cases/exponent.jpg` | 新增 | 指数函数题脱敏题图（TB-011，多章节覆盖） |
| `.env.e2e.example` | 新增 | E2E 环境变量模板（假 Provider 配置 + smoke 凭证占位） |

---

## 7. 技术附录

### 7.1 黄金闭环路径详细步骤（R1a 版）

```
1. 注册临时用户 → 登录 → /nana
2. 点"拍一道题" → /nana/capture
3. 上传 clear-printed.jpg（setInputFiles）
4. 切到录音 tab → 点"说说看" → Chromium fake-media 触发 → 3 秒后点"我听完了"
   └── 真实 MediaRecorder 录制成 webm → 经过 ffmpeg 转码 → 喂给 /process
5. 点"收好这道题"
   ├── 硬门禁：≤10s 看到"已收好"（保存超时=阻塞）
   ├── 硬门禁：AI 整理状态出现（无反馈=阻塞）
   ├── 性能采集（不阻塞）：记录按钮反馈耗时、整理状态出现耗时
   └── 假 Provider 返回 <100ms → 真实 /process 代码完整执行 → Prisma 事务落库
6. 验证 AI 结果卡：
   ├── transcript 非空（有录音时）
   ├── questionSummary 非空
   ├── textbookTopicId 在种子范围（孩子操作层验证）
   ├── knowledgeNodeCandidates 在种子范围（系统验证层验证）
   ├── initialFeedback 非空
   ├── possibleMistakeReason 可空（空时隐藏区块，不报错）
   └── nextActionSuggestion 非空
7. 点"去题目汇总" → /nana/knowledge-map（默认 tab=题目汇总）
   ├── 验证题目在正确章节分组下（自动分类，非手动改）
   └── 性能采集：首屏可操作时间
8. 切到"图谱" tab
   ├── 验证有琥珀色"收过题"证据
   └── 验证无绿色"掌握"节点（v1 不点亮）
9. DB 验证（双层）：
   ├── Case.id + Case.studentId + Case.createdAt
   ├── CaseAiResult.processingStatus = 'success'（在 CaseAiResult 上）
   ├── CaseAiResult.questionSummary / initialFeedback / nextActionSuggestion 非空
   ├── CaseAiResult.possibleMistakeReason 可空
   ├── CaseTextbookTopicTag source=vlm（孩子操作层）
   ├── CaseKnowledgeTag source=vlm（系统验证层）
   ├── Artifact: question_image + audio_note
   └── StudentNodeState 无新增记录（beforeCount == afterCount）
10. 证据包输出：截图序列 + 性能指标 + 控制台错误 + 网络耗时 + DB 验证结果
```

### 7.2 假 Provider 服务器方案（r3 修订）

```typescript
// e2e/helpers/fake-provider-server.ts（伪代码）

import http from 'http';
import crypto from 'crypto';

// 严格模拟 OpenAI chat completion 响应格式
// case-analyzer.ts 调用 client.chat.completions.create()
// 假 Provider 需要返回相同格式

// r3：预计算每张 fixture 题图的 MD5 哈希，建立哈希→fixture 名映射
const FIXTURE_HASHES: Record<string, string> = {
  'a1b2c3d4...': 'clear-printed',    // clear-printed.jpg 的图片内容哈希
  'e5f6g7h8...': 'with-handwriting', // with-handwriting.jpg 的哈希
  'i9j0k1l2...': 'tilted-partial',   // tilted-partial.jpg 的哈希
  'm3n4o5p6...': 'set-theory',       // set-theory.jpg 的哈希
  'q7r8s9t0...': 'inequality',        // inequality.jpg 的哈希
};

const MOCK_RESULTS: Record<string, object> = {
  'clear-printed': {
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
  },
  'with-handwriting': {
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
  },
  'tilted-partial': {
    transcript: '',
    questionSummary: '图片不太完整，能看到部分三角函数内容',
    textbookTopicCandidates: [], // 低置信 → 空数组
    knowledgeNodeCandidates: [], // 低置信 → 空数组
    initialFeedback: '这道题拍得有点斜，不过没关系，先帮你收着',
    possibleMistakeReason: '', // 空 → 隐藏区块
    nextActionSuggestion: '下次拍照时尽量把题目拍完整，方便 AI 更好地帮你整理',
  },
};

// r3 关键修正：不再使用 process.env.E2E_FIXTURE_NAME 切换响应
// 批量测试中多张题图同时上传时，进程级变量不可靠
// 改为每张 fixture 预计算图片内容 MD5 哈希，假 Provider 从请求 body 提取 image_url 计算哈希后匹配

export function startFakeProvider(port = 3999): http.Server {
  return http.createServer((req, res) => {
    if (req.url === '/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        // r3：从请求 body 中提取 image_url，计算哈希，匹配 fixture
        const parsed = JSON.parse(body);
        const imageUrl = parsed.messages?.[0]?.content?.find(
          (c: any) => c.type === 'image_url'
        )?.image_url?.url || '';
        const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
        const fixtureName = FIXTURE_HASHES[hash] || 'clear-printed'; // fallback
        const mockResult = MOCK_RESULTS[fixtureName];
        // 包裹在 OpenAI chat completion 响应格式中
        const response = {
          id: 'chatcmpl-fake-' + Date.now(),
          object: 'chat.completion',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(mockResult),
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}
```

### 7.3 CI webServer 启动方案

```typescript
// playwright.config.ts 中的 webServer 配置

// CI 模式下：先启动假 Provider，再启动 Next.js
// 假 Provider 作为独立进程在后台运行
// Next.js 的 VOLCENGINE_BASE_URL 指向假 Provider

webServer: {
  command: process.env.CI
    ? 'node e2e/helpers/fake-provider-server.js & npm run start'
    : `npx next dev -p ${E2E_PORT}`,
  url: E2E_HOST,
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000,
  env: {
    VOLCENGINE_API_KEY: 'fake-key',
    VOLCENGINE_BASE_URL: 'http://127.0.0.1:3999',
    LITE_ENDPOINT_ID: 'fake-endpoint',
    LITE_MODEL_NAME: 'fake-model',
    NANA_AUDIO_TRANSCRIPT_ENABLED: 'true',
    // DATABASE_URL 等其他变量从 ci.yml 注入
  },
}
```

> **注意**：`fake-provider-server.js` 需要预先编译（`tsc` 或 `esbuild`），或者用 `.mjs` 直接写 JavaScript。

### 7.4 数据库验证查询（修正版）

```typescript
// e2e/helpers/db-verifier.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

// 修正：processingStatus 在 CaseAiResult 上，不在 Case 上
async function verifyCaseCreated(caseId: string) {
  const case_ = await prisma.case.findUnique({ where: { id: caseId } });
  expect(case_).toBeTruthy();
  expect(case_!.studentId).toBeTruthy();
  // Case 只有 id, studentId, createdAt —— 没有 processingStatus
}

async function verifyAiResult(caseId: string, expected: MockResult) {
  const aiResult = await prisma.caseAiResult.findUnique({ where: { caseId } });
  expect(aiResult).toBeTruthy();
  // processingStatus 在 CaseAiResult 上
  expect(aiResult!.processingStatus).toBe('success');
  expect(aiResult!.questionSummary).toBe(expected.questionSummary);
  expect(aiResult!.initialFeedback).toBe(expected.initialFeedback);
  expect(aiResult!.nextActionSuggestion).toBe(expected.nextActionSuggestion);
  // possibleMistakeReason 允许为空
  if (expected.possibleMistakeReason) {
    expect(aiResult!.possibleMistakeReason).toBe(expected.possibleMistakeReason);
  } else {
    expect(aiResult!.possibleMistakeReason).toBeNull();
  }
  // textbookTopicId 验证（孩子操作层）
  if (expected.textbookTopicCandidates.length > 0) {
    const topCandidate = expected.textbookTopicCandidates[0];
    if (topCandidate.confidence >= 0.5) {
      expect(aiResult!.textbookTopicId).toBe(topCandidate.topicId);
    } else {
      expect(aiResult!.textbookTopicId).toBeNull();
    }
  }
}

// 修正：StudentNodeState.status 合法值为 stable|uncertain|gap|untested
// 没有 mastered，v1 不写 StudentNodeState
async function verifyNoStudentNodeStateChange(studentId: string, beforeCount: number) {
  const afterCount = await prisma.studentNodeState.count({
    where: { studentId },
  });
  expect(afterCount).toBe(beforeCount);
}

// 系统验证层：KnowledgeNode 标签
async function verifyKnowledgeNodeTag(caseId: string, source: string, nodeId: string) {
  const tag = await prisma.caseKnowledgeTag.findFirst({
    where: { caseId, source, nodeId },
  });
  expect(tag).toBeTruthy();
}

// 孩子操作层：TextbookTopic 标签
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
```

### 7.5 虚拟麦克风方案（Chromium 原生）

```typescript
// playwright.config.ts 中的 project 配置

{
  name: 'mobile-chrome',
  testDir: './e2e/ci',
  use: {
    ...devices['Pixel 7'],
    // Chromium 原生 fake media —— 不改写 MediaRecorder
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
}

// 这样浏览器会：
// 1. getUserMedia({ audio: true }) → 自动授权，返回虚拟音频流
// 2. MediaRecorder 真实录制虚拟音频流 → 生成 webm Blob
// 3. webm Blob 经过 ffmpeg 转码 → 喂给 /process → case-analyzer.ts 调用假/真 Provider
// 完整音频链路被验证

// 如果需要特定音频内容（数学口述），可用 --use-file-for-fake-audio-capture 指定 WAV 文件
// launchOptions: {
//   args: [
//     '--use-fake-device-for-media-stream',
//     '--use-fake-ui-for-media-stream',
//     '--use-file-for-fake-audio-capture=tests/fixtures/nana/audio/math-voice-sample.wav',
//   ],
// }
```

### 7.6 Playwright 配置升级方案（分层策略）

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
        // 分层策略：不全开 on，避免拖慢和堆积
        trace: 'retain-on-failure',   // 失败时保留 trace
        video: 'retain-on-failure',   // 失败时保留 video
        screenshot: 'only-on-failure', // 失败时自动截图（每步手动截图在 spec 中做）
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
    },
    projects: isSmoke ? [
        {
            name: 'smoke',
            testDir: './e2e/smoke',
            use: {
                ...devices['Pixel 7'],
                // Smoke 任务单独覆写：video on（需要完整证据包供 AI 评审）
                video: 'on',
                trace: 'on',
                launchOptions: {
                    args: [
                        '--use-fake-device-for-media-stream',
                        '--use-fake-ui-for-media-stream',
                        '--use-file-for-fake-audio-capture=tests/fixtures/nana/audio/math-voice-sample.wav',
                    ],
                },
            },
            retries: 0,
        },
    ] : [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: ['**/ci/**', '**/smoke/**'],
        },
        {
            name: 'mobile-chrome',
            testDir: './e2e/ci',
            use: {
                ...devices['Pixel 7'],
                launchOptions: {
                    args: [
                        '--use-fake-device-for-media-stream',
                        '--use-fake-ui-for-media-stream',
                        '--use-file-for-fake-audio-capture=tests/fixtures/nana/audio/math-voice-sample.wav',
                    ],
                },
            },
        },
    ],
    // webServer 配置见 §7.3
});
```

### 7.7 AI 评审量表 JSON 输出格式（含引用）

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
      "reason": "每个页面都有明确的引导按钮，'收好这道题'和'去题目汇总'都很清楚",
      "screenshotRef": "screenshot-05-save-case.png",
      "stepRef": "step-5-save-case",
      "metricRef": "buttonFeedbackMs=85"
    },
    {
      "item": 2,
      "question": "每次点击是否立即有反馈",
      "score": 1,
      "reason": "大部分按钮有反馈，但上传图片后等了约2秒才出现预览",
      "screenshotRef": "screenshot-04-image-preview.png",
      "stepRef": "step-4-upload-image",
      "metricRef": "imagePreviewMs=2100"
    }
  ],
  "totalScore": 16,
  "maxScore": 20,
  "lowScoreItems": [2, 4],
  "summary": "整体体验流畅，主要问题在图片预览速度和颜色含义说明"
}
```

### 7.8 真机抽检清单模板

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

### 7.9 CI 工作流集成方案

```yaml
# ci.yml e2e-test job 增量修改

e2e-test:
  env:
    DATABASE_URL: "file:./e2e.db"
    NEXTAUTH_SECRET: "ci-secret-value-123456"
    NEXTAUTH_URL: "http://127.0.0.1:3000"
    # 假 Provider 配置
    VOLCENGINE_API_KEY: "fake-key"
    VOLCENGINE_BASE_URL: "http://127.0.0.1:3999"
    LITE_ENDPOINT_ID: "fake-endpoint"
    NANA_AUDIO_TRANSCRIPT_ENABLED: "true"
  steps:
    - name: Checkout repository
      uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - name: Install ffmpeg (r3)
      run: |
        sudo apt-get update -qq
        sudo apt-get install -y -qq ffmpeg
        ffmpeg -version
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    - name: Setup Database
      run: |
        npx prisma db push
        npx prisma db seed
    - name: Build application
      run: npm run build
    - name: Verify ffmpeg (r3)
      run: ffmpeg -version
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
        retention-days: 14
    - name: Upload Playwright Report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 14
```

### 7.10 五层测试与发布门禁关系（修订）

```
┌──────────────────────────────────────────────────────────┐
│  层级              验证什么               阻塞发布？        │
├──────────────────────────────────────────────────────────┤
│  1. CI 功能闭环    每步走通+数据落库        是             │
│     (假 Provider)  双层分类验证             是             │
│                    无点击反馈/保存超时/     是             │
│                    API失败/溢出/异常                       │
│  2. 性能采集       耗时/控制台/网络/溢出    R1只采集不阻塞  │
│                    滚动基线+30%告警         积累20次后告警  │
│                    功能性硬门禁              是             │
│  3. 真实 Provider   识图/转写/分类质量       初期告警       │
│     Smoke          60s上限                  稳定后门禁      │
│                   (DELETE API审计前手动)                   │
│  4. AI 体验评审    孩子视角语义判断        始终是建议      │
│                   必须引用截图/步骤/指标    不阻塞          │
│  5. 真机抽检       相机/麦克风/iOS/微信    发版前抽检       │
└──────────────────────────────────────────────────────────┘
```

### 7.11 实施优先级和分轮建议（修订）

| 轮次 | 范围 | 依赖 | 预计工时 |
|------|------|------|----------|
| **R1a（立即可做）** | 第一部分全部 + 第二部分 2.1-2.4, 2.5(不含手动改分类/打印), 2.6-2.7, 2.9 + 第五部分 5.1 | 无 | 3-4 天 |
| **R1b（依赖 TD-006）** | 手动改分类验证 + 汇总页按章节分组验证 | TD-006 解决 | 0.5 天 |
| **R1c（依赖打印页）** | 打印预览验证 + PDF 生成验证 | `/nana/print-preview` 实现 | 0.5 天 |
| **R1d（数据规模）** | 30 题汇总页性能场景（任务 2.8） | R1a 完成 | 0.5 天 |
| **R4（依赖 DELETE API）** | 真实 Provider Smoke + 自动清理 | 专用测试账号 + DELETE API 审计通过 + secrets 配置 | 1.5 天 |
| **R5（依赖 R4）** | AI 评审 + 人工校准 | R4 证据包 + AI 评审 adapter | 1.5 天 |

> **建议**：R1a 立即启动，不受任何产品功能阻塞。R1b/R1c 等产品功能补齐后接上。R1d 在 R1a 稳定后做。R4/R5 等 DELETE API 审计通过后推进。

---

## 8. 开放项决议（已确认）

| # | 开放项 | 决议 |
|---|--------|------|
| 1 | 分类体系 | **双层契约**：孩子侧 TextbookTopic，系统侧 KnowledgeNode，两层都测 |
| 2 | AI 评审模型 | R1/R5 暂不绑定；先定义 adapter 和人工审阅证据包的流程 |
| 3 | Smoke 账号 | 固定专用测试账号 |
| 4 | 清理策略 | 精确删除本次 Case；DELETE API 审计通过前不启用 nightly 写测试 |
| 5 | 性能基线 | 先采集 20 次，不立即硬门禁；滚动基线 +30% 告警；硬门禁仅功能性断言 |
| 6 | 调度 | 先每次部署后手动触发，稳定后每周 2-3 次，不必每日 |
| 7 | R1 启动 | r2 修订后启动缩窄后的 R1a |
| 8 | 功能契约 | **r3 新增**：先冻结 `doc/spec/nana-v1-minimum-loop-acceptance.md`（CL-01～CL-16），再启动 R1a。测试场景映射到 CL 编号，不围绕页面结构固化 |
| 9 | ffmpeg CI | **r3 新增**：ci.yml e2e-test job 显式安装 + 验证 ffmpeg，避免虚拟录音链路失败 |
| 10 | 假 Provider 响应选择 | **r3 新增**：按请求 body 中题图哈希映射固定响应，不用进程级环境变量 |
| 11 | 时间阈值 | **r3 新增**：保存确认硬门禁统一为 10s（CI）/ 5s（本地），由 CL-04 定义 |
| 12 | Fixture 来源 | **r3 新增**：所有新 fixture 必须来自 16 个 TextbookTopic 覆盖范围，逐张脱敏确认 |
