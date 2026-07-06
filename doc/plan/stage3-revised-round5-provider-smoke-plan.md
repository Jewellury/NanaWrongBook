# Stage 3 v3-revised Round 5 — 真实 Provider Smoke 最小验证计划

> 计划者：plan-agent
> 日期：2026-07-06
> 状态：待用户确认
> 前置：Round 4 主体 + Hotfix 已完成并复审通过

---

## 1. 背景与目标

v1 闭环代码已成型（拍题 → 保存 → AI 整理 → 卡片反馈 → 汇总页可见），但全部测试使用 mock。
当前最大的不确定性是：**真实豆包 Lite 对学生拍照题图的反馈质量能否达到孩子能信任的水平。**

本轮目标：**在不改生产代码、不写生产数据库的前提下，用一次性脚本验证真实 LLM 质量。**

---

## 2. 范围边界

### 只做

1. 检查本地/生产所需环境变量清单
2. 只在本地一次性脚本中对 3 张 fixture 调用真实 Lite API
3. 验证 Lite 返回 7 字段 JSON、课本分类命中 16 个 TextbookTopic、知识点候选在 48 个 KnowledgeNode 内
4. 记录延迟、错误、空字段比例、反馈质量
5. 输出 smoke 报告

### 明确不做

- ❌ 不改生产代码（case-analyzer.ts / process route / 前端）
- ❌ 不写生产数据库（不调用 Prisma，不创建 Case / CaseAiResult）
- ❌ 不配置生产 .env
- ❌ 不上线真实 provider 开关
- ❌ 不做打印页、手动编辑课本分类、重复题识别

---

## 3. 环境变量清单

| 变量名 | 用途 | 当前状态 |
|--------|------|----------|
| `VOLCENGINE_API_KEY` | 方舟 API Key | ✅ 已在 `.env` 中（`ark-f026...`） |
| `VOLCENGINE_BASE_URL` | 方舟 API Base URL | ✅ 已在 `.env` 中（`https://ark.cn-beijing.volces.com/api/v3`） |
| `LITE_ENDPOINT_ID` | Lite 模型 Endpoint ID | ✅ 已在 `.env` 中（`ep-20260619160218-5m76d`） |
| `LITE_MODEL_NAME` | Lite 模型名（备选） | ✅ 已在 `.env` 中（`doubao-seed-2-0-lite-260215`） |
| `CASE_ANALYZER_TIMEOUT_MS` | 超时（可选） | 未设置，默认 60000ms |

### 安全检查

- `.env` 已在 `.gitignore` 中（第 34 行 `.env*`，排除 `.env.example`）
- `.env.example` 中**不含** VOLCENGINE 相关变量（未泄露密钥格式）
- 脚本通过 `dotenv/config` 读取，绝不硬编码密钥
- 报告输出不包含 API Key

---

## 4. Fixture 图片

使用已有 fixture（`tests/fixtures/nana/cases/`），隐私已确认：

| 文件 | 描述 | 用途 |
|------|------|------|
| `clear-printed.jpg` | 清晰题图，含手写解答痕迹，题面完整可识别 | 基线质量 |
| `with-handwriting.jpg` | 含详细手写解答的题图（导数推导过程） | 手写干扰测试 |
| `tilted-partial.jpg` | 倾斜/不完整但可识别，有空白姓名/学号栏 | 边缘 case |

---

## 5. 验证脚本设计

### 文件

`scripts/stage3-provider-smoke.ts`（一次性脚本，不进 CI）

### 设计原则

- **自包含**：不 import 生产代码（`case-analyzer.ts` 依赖 `@/lib/logger`，tsx 无法解析路径别名），直接复制 48 节点 + 16 章节 + prompt + Zod schema，与 `stage3-spike-v3.ts` 保持一致模式
- **无数据库**：不 import Prisma，不创建任何 DB 记录
- **密钥安全**：通过 `dotenv/config` 读取，报告中脱敏

### 执行流程

```
对每张 fixture 图片（共 3 张）:
  1. 读取图片 → base64 data URL
  2. 构造 prompt（48 节点 + 16 章节清单）
  3. 调用 Lite API（单次，图 only，无音频）
  4. 计时（延迟）
  5. 解析 JSON → Zod 校验 7 字段
  6. 验证 topicId ∈ 16 个 TextbookTopic
  7. 验证 nodeId ∈ 48 个 KnowledgeNode
  8. 检查文案合规（禁用词扫描）
  9. 记录空字段
  10. 记录 token usage

输出:
  - 控制台汇总
  - doc/research/provider-smoke-report.json（详细结果）
```

### 验收维度

| 维度 | 通过标准 | 不通过处理 |
|------|----------|-----------|
| API 连通性 | 3/3 张图片返回非空响应 | 检查网络/Key/Endpoint |
| JSON 结构 | 7 字段全部通过 Zod 校验 | 记录解析错误，分析 prompt 是否需调整 |
| 课本分类命中 | topicId 全部在 16 个 TextbookTopic 内 | 记录幻觉 ID，评估清单是否需扩充 |
| 知识点命中 | nodeId 全部在 48 个 KnowledgeNode 内 | 记录幻觉 ID，评估清单是否需扩充 |
| 文案合规 | 无"诊断/薄弱/掌握/得分/解析/答案"等越界词 | 记录越界词，评估 prompt 约束力 |
| 空字段比例 | possibleMistakeReason 允许空（不确定时留空），其他字段不应为空 | 记录空字段，评估模型质量 |
| 延迟 | 单张 < 30s（可接受 < 60s） | 超时需评估轮询策略 |

---

## 6. 执行步骤

### Step 1: 运行脚本

```bash
npx tsx scripts/stage3-provider-smoke.ts
```

### Step 2: 人工审阅报告

- 逐张查看 `questionSummary` 是否准确概括题面
- 逐张查看 `initialFeedback` 是否温和、鼓励、不透露答案
- 逐张查看 `nextActionSuggestion` 是否具体可行（回看章节 + 小动作）
- 逐张查看 `possibleMistakeReason` 是否用"可能/也许"措辞

### Step 3: 决策

- **质量达标** → 进入生产 .env 配置 + 部署阶段
- **质量不达标** → 调整 prompt / 换模型 / 缩小范围，再跑一轮 smoke
- **质量部分达标** → 记录问题，评估是否可接受降级上线

---

## 7. 安全铁律

- 密钥只放 `.env` / GitHub Secrets，不写入代码、文档、日志或 commit
- 脚本不 import Prisma，不触碰任何数据库
- 报告文件不含 API Key（脱敏处理）
- 脚本为一次性手动执行，不进 CI，不依赖 VOLCENGINE_API_KEY 做门禁

---

## 8. 输出物

| 文件 | 用途 |
|------|------|
| `scripts/stage3-provider-smoke.ts` | 一次性 smoke 脚本 |
| `doc/research/provider-smoke-report.json` | 自动生成的详细报告（JSON） |

报告生成后由用户人工审阅，再决定下一步。
