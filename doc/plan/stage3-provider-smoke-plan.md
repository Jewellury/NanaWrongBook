# Stage 3 真实 Provider Smoke — 最小验证计划

> 关联规格: doc/plan/stage3-ai-integration-plan-v3-revised.md
> 计划日期: 2026-07-06
> 前置: Round 4 Hotfix 已收口（918a592），v1 闭环竞态安全
> 预计影响: .env.example（补文档）、doc/research/provider-smoke-report.json（生成报告）

---

## 0. 前置约束（必须遵守）

### 安全铁律

- **密钥只放 .env**：VOLCENGINE_API_KEY 绝不写入代码、文档、日志、commit message
- **不写生产数据库**：脚本不 import Prisma，不连任何数据库，只调 AI API
- **不改生产代码**：本轮不改 case-analyzer.ts、/process API、采集页等任何生产代码
- **.env 已在 .gitignore 中**：确认 .env* 被 ignore，.env.example 被 track

### 明确不做

- 不改生产代码（case-analyzer.ts / process API / 采集页）
- 不配置生产服务器 .env
- 不上线真实 provider 开关
- 不部署到腾讯云
- 不写数据库

---

## 1. 大白话概述

v1 闭环已经成型（拍题-保存-AI 整理-卡片反馈-汇总页可见），但 AI 整理这一环一直用 mock 数据测的，从没跑过真实豆包 Lite。现在要在不碰生产、不写数据库的前提下，拿 3 张已有的 fixture 图片，直接打真实 Lite API，看看它返回的 7 字段 JSON 到底质量如何——延迟多少秒、分类准不准、有没有幻觉 ID、有没有越界词、空字段比例。跑完出一份报告，人工审阅后再决定要不要上生产。

**为什么要做**：如果 Lite 对图片的反馈质量达不到孩子能信任的水平，后面 UI 做得再漂亮也救不了。先验证质量，再上线。

---

## 2. 现状盘点（已有资产）

### 2.1 脚本已就绪

scripts/stage3-provider-smoke.ts（621 行）已完整实现，功能包括：

- 从 .env 读取 VOLCENGINE_API_KEY / VOLCENGINE_BASE_URL / LITE_ENDPOINT_ID / LITE_MODEL_NAME
- 不 import Prisma，不连数据库
- 加载 3 张 fixture 图片，转 Base64 Data URL
- 使用与 case-analyzer.ts 完全一致的提示词 + Zod schema
- 逐张调真实 Lite API，记录延迟、token 用量
- Zod 校验 7 字段 JSON 结构
- topicId 幻觉检查（对照 16 个 TextbookTopic 白名单）
- nodeId 幻觉检查（对照 48 个 KnowledgeNode 白名单）
- 禁用词扫描（诊断/薄弱/掌握/得分/解析/答案/解题/正确答案/错误答案/完整识别）
- 空字段统计
- 控制台汇总 + JSON 报告输出到 doc/research/provider-smoke-report.json
- API Key 脱敏打印（只显示前 6 + 后 4 字符）
- jsonrepair 兜底解析（模型返回轻微格式错误时尝试修复）

### 2.2 Fixture 图片已就绪

tests/fixtures/nana/cases/ 目录下 3 张图片，已通过隐私检查：

| 文件 | 描述 | 大小 |
|------|------|------|
| clear-printed.jpg | 清晰题图（含手写解答痕迹，题面完整可识别） | 压缩至 200KB 以内 |
| with-handwriting.jpg | 含详细手写解答的题图（导数推导过程） | 压缩至 200KB 以内 |
| tilted-partial.jpg | 倾斜/不完整但可识别的题图（有空白姓名/学号栏未填写） | 压缩至 200KB 以内 |

来源：外甥女拍摄的真实错题，经人工目视确认无隐私信息。

### 2.3 依赖已安装

| 包 | 版本 | 用途 |
|----|------|------|
| dotenv | ^17.2.3 | 加载 .env 环境变量 |
| jsonrepair | ^3.13.1 | JSON 解析兜底 |
| tsx | ^4.19.0 | 直接运行 TypeScript 脚本 |

### 2.4 环境变量已配置

.env 中已有（不入 git）：

- VOLCENGINE_API_KEY（已配置）
- VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
- LITE_ENDPOINT_ID=ep-20260619160218-5m76d
- LITE_MODEL_NAME=doubao-seed-2-0-lite-260215

### 2.5 文档缺口

.env.example 未包含 VOLCENGINE 相关变量定义。需要补充，让其他开发者知道这些环境变量的存在和用途。

---

## 3. 任务分解

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1 | 补充 .env.example | .env.example | 添加 VOLCENGINE 变量空值模板和注释 |
| 2 | 运行 smoke 脚本 | 无文件变更 | npx tsx scripts/stage3-provider-smoke.ts |
| 3 | 审阅报告 | doc/research/provider-smoke-report.json | 人工审阅 7 字段质量 |
| 4 | 输出 smoke 报告 | doc/research/provider-smoke-report.md | 人工撰写质量评估和 Go/No-Go 建议 |

---

## 4. 详细设计

### 4.1 补充 .env.example（任务 1）

在 .env.example 末尾追加 Stage 3 AI 相关变量：

```
# Stage 3: Nana AI 整理（豆包 Lite 一体化）
VOLCENGINE_API_KEY=""
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
LITE_ENDPOINT_ID=""
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"
CASE_ANALYZER_TIMEOUT_MS="60000"
```

### 4.2 运行 smoke 脚本（任务 2）

执行命令：npx tsx scripts/stage3-provider-smoke.ts

脚本流程：
1. 读取 .env 中的 VOLCENGINE_API_KEY 等
2. 加载 3 张 fixture 图片转 Base64 Data URL
3. 构造与 case-analyzer.ts 完全一致的提示词（含 48 节点 + 16 章节清单）
4. 逐张调真实 Lite API（temperature: 0.2, max_tokens: 2048）
5. 对每张图片的返回执行：JSON 解析（含 jsonrepair 兜底）、Zod 7 字段校验、topicId 白名单过滤、nodeId 白名单过滤、禁用词扫描、空字段统计、延迟+token 用量记录
6. 控制台输出汇总
7. 保存详细 JSON 报告到 doc/research/provider-smoke-report.json

### 4.3 验证清单（任务 3 审阅依据）

| # | 验证项 | 通过标准 | 不通过处理 |
|---|--------|----------|------------|
| 1 | 3 张图片全部成功返回 | 3/3 HTTP 200 + 非空响应 | 记录失败原因，分析是 API 问题还是图片问题 |
| 2 | 7 字段 JSON 结构通过 Zod 校验 | 3/3 zodValid=true | 分析 zodErrors，判断是模型输出格式问题还是 schema 问题 |
| 3 | topicId 全部在 16 个 TextbookTopic 白名单内 | 0 个幻觉 | 如有幻觉，记录幻觉 ID |
| 4 | nodeId 全部在 48 个 KnowledgeNode 白名单内 | 0 个幻觉 | 如有幻觉，记录幻觉 ID |
| 5 | 无禁用词违规 | 0 个禁用词 | 如有，记录哪个字段含哪个禁用词 |
| 6 | 延迟在可接受范围 | 平均小于 15 秒 | 如超 15 秒，评估是否需要调整前端轮询策略 |
| 7 | 空字段比例 | transcript 空可接受（无音频），其他字段空率低于 30% | 如空率过高，评估提示词是否需要优化 |
| 8 | 反馈质量（人工判断） | questionSummary 准确概括题意、initialFeedback 温和鼓励、nextActionSuggestion 具体可操作 | 如质量不达标，记录具体问题 |

### 4.4 输出 smoke 报告（任务 4）

人工撰写 doc/research/provider-smoke-report.md，包含：

1. 执行环境：时间、模型、API 版本
2. 汇总数据：成功率、Zod 通过率、平均延迟、token 用量
3. 逐张分析：每张图片的 7 字段返回内容 + 质量评价
4. 禁用词和幻觉：如有，逐条列出
5. 质量评估：对 questionSummary / initialFeedback / possibleMistakeReason / nextActionSuggestion 分别评价
6. Go/No-Go 建议：
   - Go：质量可接受，建议配置生产 .env，走部署流程
   - Conditional Go：部分字段质量需优化提示词后再跑一次
   - No-Go：质量不达标，需调整模型/提示词/架构后重新验证

---

## 5. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | .env.example 包含 VOLCENGINE 变量定义 | 文件检查 |
| 2 | smoke 脚本成功运行，3 张图片全部测完 | 控制台输出 |
| 3 | provider-smoke-report.json 生成且非空 | 文件检查 |
| 4 | provider-smoke-report.md 产出，含 Go/No-Go 建议 | 人工审阅 |
| 5 | 无密钥泄露（报告、日志、commit 中不含完整 API Key） | grep 检查 |
| 6 | 不写数据库（脚本不 import Prisma） | 代码检查 |
| 7 | 不改生产代码 | git diff 确认 |

---

## 6. 风险与注意事项

### 6.1 API 调用费用

3 次 Lite API 调用，每次约 2K-4K tokens。费用极低（小于 0.01 元），不需特别审批。

### 6.2 API Key 安全

- .env 已在 .gitignore 中（.env* 被 ignore，.env.example 被 track）
- 脚本脱敏打印 API Key（只显示前 6 + 后 4 字符）
- JSON 报告中 api_key_preview 字段也是脱敏的
- 提交前检查：git status 确认 .env 不在 staged 中

### 6.3 脚本不写数据库

scripts/stage3-provider-smoke.ts 不 import Prisma，不连任何数据库。所有验证纯靠 AI API 返回 + 本地 Zod 校验。

### 6.4 fixture 图片代表性

3 张图片覆盖三种典型场景：清晰印刷（理想情况）、含手写（真实错题常见）、倾斜不完整（拍照质量差）。但不代表所有真实场景。未来可能需要更多 fixture。

### 6.5 提示词一致性

脚本中的 buildPrompt 函数与 case-analyzer.ts 中的完全一致（复制而非 import），确保 smoke 结果反映真实生产行为。如果未来 case-analyzer.ts 的 prompt 变了，需要同步更新脚本。

---

## 7. 执行顺序

1. 补充 .env.example（添加 VOLCENGINE 变量定义）
2. 确认 .env 中 VOLCENGINE_API_KEY 等已配置
3. 运行 npx tsx scripts/stage3-provider-smoke.ts
4. 审阅控制台输出 + provider-smoke-report.json
5. 人工撰写 doc/research/provider-smoke-report.md
6. Git 收口（提交 .env.example + smoke 报告，不提交 .env）

---

## 8. 回滚方案

- .env.example 修改：git revert 即可
- smoke 脚本：已有文件，不改动
- JSON 报告：doc/research/ 下，不入 git 或入 git 均可（不含密钥）
- 无 schema 变更，无 migration，无生产代码变更，无数据库写入

---

## 9. 后续决策路径

### 如果 Go（质量可接受）

1. 配置生产服务器 .env（VOLCENGINE_API_KEY 等）
2. dev 合入 main
3. CI 构建 - 部署到腾讯云
4. 真机验收（手机拍题 - 等待 AI 整理 - 查看结果卡 - 汇总页可见）
5. 如真机验收通过，v1 闭环正式上线

### 如果 Conditional Go（部分需优化）

1. 调整 case-analyzer.ts 的 prompt（加强约束/示例）
2. 重新跑 smoke 脚本验证
3. 满意后再走 Go 路径

### 如果 No-Go（质量不达标）

1. 评估是否换模型（如 doubao-seed-1.6-pro 替代 Lite）
2. 评估是否调整架构（如分离 VLM + ASR 双管线替代一体化）
3. 重新设计验证方案
4. v1 闭环暂不上线，保持 mock 模式

---

## 10. 用户验收提醒（execute-agent 必须遵守）

### 10.1 密钥安全

- VOLCENGINE_API_KEY 只从 .env 读取，绝不硬编码
- 报告中只出现脱敏后的 key preview
- git status 确认 .env 不在 staged 中
- commit message 不含任何密钥

### 10.2 不碰生产

- 不改 case-analyzer.ts、/process API、采集页等任何生产代码
- 不连数据库
- 不部署到服务器

### 10.3 诚实报告

- 如果某张图片 API 调用失败，如实记录错误信息
- 如果 Zod 校验失败，如实记录 zodErrors
- 如果有幻觉 ID，如实列出
- 如果有禁用词，如实列出
- 不掩饰任何质量问题

### 10.4 报告可读性

- provider-smoke-report.md 用大白话写，让非技术用户也能看懂
- 每张图片的 7 字段返回内容原样展示（截断超长字段）
- 质量评价给出具体理由，不只说"好"或"不好"
