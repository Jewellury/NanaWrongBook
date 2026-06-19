# 工单 · 搭建 VLM 识图转写路（火山方舟豆包 VLM）

> 目标：把"页面图 → VLM 看图 → 结构化转写 draft → 我方复核"这条路跑通。
> 背景：DeepSeek 看不了图，2024 真题由参谋长手工核准兜底。2025/2026 + 将来她的教辅照片，
> 改用**火山方舟豆包 VLM** 识图——这正是 TECH_PLAN_v2 规划的生产识图能力（P1），本工单等于让它**第一次实战练兵**。
> 性质：离线工具脚本 + 配置 + 说明文档。**不碰 wrong-notebook 上游**。涉及 API Key，**建议走 /plan**。

---

## 产出一：注册 + 配置说明文档（面向用户）

以下步骤基于 [火山方舟官方文档](https://www.volcengine.com/docs/82379)（2026-06 核实）。
**这些入口和名称会随平台更新变化，开通时以控制台实际显示为准。**

### 步骤 1：注册火山引擎账号
1. 打开 [火山引擎官网](https://www.volcengine.com/)
2. 点击右上角「注册」→ 填写手机号/邮箱 → 完成注册
3. 登录后进入控制台，完成**实名认证**（个人或企业均可）

### 步骤 2：开通火山方舟（Ark）大模型服务
1. 在火山引擎控制台顶部搜索「方舟」或「Ark」
2. 进入「火山方舟」产品页面 → 点击「立即开通」
3. 同意服务协议后即开通成功

### 步骤 3：开通豆包视觉模型 + 创建推理接入点
1. 在方舟控制台左侧导航 → **「模型广场」**或**「在线推理」**
2. 找到视觉/多模态模型，当前推荐：
   - **`doubao-1.5-vision-pro-32k`**（豆包 1.5 视觉专业版，32K 上下文）
   - 或 `doubao-seed-1.5-vision`（豆包 Seed 视觉版，最新代）
   > ⚠️ 模型名会更新。选 **vision / 多模态 / 图片理解** 类型的即可。
3. 点击模型 → **「创建推理接入点」**（Endpoint）
4. 填写接入点名称（如 `nana-vlm-transcribe`）→ 确认创建
5. 记下 **Endpoint ID**（格式如 `ep-20240615100632-2m9cl`）

### 步骤 4：创建 API Key
1. 方舟控制台左侧 → **「API Key 管理」**
2. 点击「创建 API Key」→ 填写名称
3. **立即复制保存** Key（关闭后无法再次查看）

### 步骤 5：配置三件套

| 配置项 | 说明 | 示例值 |
|--------|------|--------|
| `base_url` | 方舟 OpenAI 兼容接口地址 | `https://ark.cn-beijing.volces.com/api/v3` |
| `api_key` | 步骤 4 创建的 Key | （48 位字符串） |
| `model` | Endpoint ID 或模型名 | `doubao-seed-2-0-pro-260215`（拍照识题） / `doubao-seed-2-0-lite-260215`（录音转笔记） |

> **重要**: 方舟提供 OpenAI 兼容接口。可直接复用项目已有的 OpenAI Provider 模式，
> 只需把 `base_url` 和 `api_key` 替换为方舟的值即可。SDK 无需改动。
> 本项目脚本从 `.env` 读取 `VOLCENGINE_API_KEY` + `VOLCENGINE_BASE_URL`，模型由 `--task` 参数自动路由。

### 步骤 6：配置到项目 `.env`（`e:\nana\.env`）

```env
# 火山方舟豆包 VLM
VOLCENGINE_API_KEY="你的-api-key"
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"

# 拍照识题 — Pro（视觉精度最高，公式/图表 SOTA）
PRO_ENDPOINT_ID="ep-20260619xxxx-xxxx"
PRO_MODEL_NAME="doubao-seed-2-0-pro-260215"

# 录音转笔记 — Lite（全模态：文本+图片+语音+视频，19语种）
LITE_ENDPOINT_ID="ep-20260619xxxx-xxxx"
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"
```

> 脚本优先用 `*_ENDPOINT_ID`（推荐，路由到具体推理接入点），没配则回退到 `*_MODEL_NAME`。

### 模型路由策略

| 任务 | 自动模型 | 选型理由 |
|------|----------|----------|
| 📷 **拍照识题** (`--task=vision`) | `doubao-seed-2-0-pro-260215` | Pro 图表理解 SOTA，数学公式（根号范围、上下标、区间开闭）精度最高 |
| 🎙️ **录音转笔记** (`--task=audio`) | `doubao-seed-2-0-lite-260215` | Lite 全模态（文本+图片+语音+视频），19 语种转写 + 情绪/背景声捕捉，未来用 |

> 调用端无需关心路由——传 `--task=vision` 或 `--task=audio`，脚本自动选模型。
> 也可手动覆盖：`--model=doubao-seed-2-0-mini-260215`。

### 费用提醒（Seed 2.0 系列）

| 模型 | 输入 ¥/M tokens | 输出 ¥/M tokens |
|------|-----------------|-----------------|
| Pro | ¥3.2 | ¥16 |
| Lite | ¥0.6 | ¥3.6 |
| Mini | ¥0.2 | ¥2 |

- 一张 A4 试卷页面（150DPI JPG）约消耗 3-8K input tokens
- Pro 跑一页约 ¥0.01-0.03，全卷 10 页约 ¥0.1-0.3
- **建议先跑 1-2 页验证效果，确认管线正常再放量跑全卷**

## 产出二：识图转写脚本
- 位置：`scripts/`（或 `tools/`），新文件，不进 Next 运行时、不碰上游。
- 输入：`doc/research/extracted/<year>/pages/*.jpg`。
- 调用：火山方舟豆包 VLM（OpenAI 兼容 chat + 图片）。图片以 **base64 data URI** 放进 message 的 image 内容。
- 提示词：**复用** `doc/reference/M3_content_prompts.md` 的「提示词 A：真题逐题解析（修订版）」——看图转写纪律、字段、[存疑] 标注、考点关键词，全照它。
- 输出：结构化 draft 写到 `doc/research/transcripts/<year>-vlm-draft.md`，字段与 `2024-verified.md` 对齐（qid/number/type/score/stem(LaTeX)/options/answer/analysis_brief/has_figure）。
- 工程要求：**增量可跑**（按年、按页范围参数化）；**打印 token/费用用量**；网络/超时失败要明确报，不静默吞。

## 安全铁律（硬约束，违反即不合格）
- **API Key 只进 `.env`**，确认 `.env` 在 `.gitignore`；提交前 `git status` 确认没被 staged（铁律 4）。
- **绝不**把 key 写进代码、文档、commit message、日志输出、转写文件。
- 脚本从 `process.env` 读 key，不硬编。

## 验收（关键：拿 ground truth 验证生产识图质量）
1. **先只跑 2024 的 page-01.jpg + page-02.jpg**，生成 Q1–Q4 的转写。
2. **逐字对比** `doc/research/transcripts/2024-verified.md`（参谋长手工核准版）——重点看 VLM 能否正确读出：
   - T1 的 $-\sqrt[3]{5}<x<\sqrt[3]{5}$、$1<\sqrt[3]{5}<2$
   - T2 的 $\dfrac{z}{z-1}=1+\mathrm{i}$
   - T3 的向量垂直 $\vec{b}\perp(\vec{b}-4\vec{a})$
   - T4 的 $\cos(\alpha-\beta)=-3m$
3. 一致（或仅极小差异）→ VLM 识图可信，再放开跑 2025/2026 全卷。
4. 偏差大 → 调提示词/分辨率/模型，先别放量。
> 这一步等于用已知正确答案校准生产识图管线，比直接信 VLM 稳得多。

## 分工与后续
- VLM 出 draft → **参谋长复核**（重点查数字/正负号/区间开闭/根号）→ 入库。
- **A/B 层精加工**（通法步骤、大题第一问填 teachingNotes），**压轴题忠实转写即可**。
- 这套脚本将来可直接复用到"她的教辅照片识图"——即生产 P1 识图管线的雏形。

---
> 完成后发参谋长：先看注册文档是否对照官方核实、key 是否只在 .env、page-01/02 的 VLM 输出与核准版差多少。
