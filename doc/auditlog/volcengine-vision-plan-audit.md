# 火山方舟 VLM 接入 · 开发计划 审计报告

> 审计对象: `doc/plan/volcengine-vision-integration-plan.md`（计划文档，505 行）
> 审计类型: **计划文档审计**（非代码 diff 审计）
> 关联代码: `src/lib/ai/openai-provider.ts`、`src/lib/ai/index.ts`、`src/lib/ai/types.ts`、`src/lib/config.ts`、`src/app/api/{analyze,reanswer}/route.ts`、`scripts/vlm-transcribe.ts`
> 审计日期: 2026-06-20
> 审计者: audit-agent

---

## 1. 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

这份"火山方舟 VLM 接入"的开发计划写得相当扎实——6 项原始评审发现（P0-1/P0-2/P1-1/P1-2/P2-1/P2-2）逐一落实，安全铁律（不改上游 `openai-provider.ts`、密钥从 `.env` 读、`.env.example` 补全、最小增量修改）全部守住，技术附录里对错误码、调用链、复用方案的论证也都对得上实际代码。

**但有 2 个 P1 问题需要 plan-agent 修订或补充论证才能放行 /execute：**

1. **「parseResponse 等效」描述不准**（P1）：方案反复说"独立实现 `parseResponse` 等效逻辑"，但上游里 `reanswerQuestion` 用的是**内联解析**（:429-438），跟 `analyzeImage` 用的 `parseResponse`（:101-162）提取的字段不同。如果新文件的 `reanswerWithImage()` 误用 `parseResponse`，会漏掉/多提取字段。方案需要明确区分两条解析路径。

2. **多 provider 场景未讨论**（P1）：项目 `AI_PROVIDER` 支持 `openai/azure/gemini` 三选一，Azure GPT-4o 和 Gemini 本来就能看图。方案默认假设"当前活动 provider 是 DeepSeek（看不了图）"，所以切方舟。但若用户切到 Azure/Gemini，强制切方舟反而绕过了已有视觉能力。方案需补一段"何时切方舟"的判定逻辑或至少声明"本方案仅在 AI_PROVIDER=openai 且后端是 DeepSeek 时启用"。

其余问题（P2 级）为提示性建议，不影响放行。

---

## 2. 逐项审计发现

### 2.1 事实准确性 ✅（整体准确，2 处需修正）

| 方案中的引用 | 实际代码 | 判定 |
|--------------|----------|------|
| `analyzeImage` 多模态走 `this.openai` 看不了图 | `openai-provider.ts:164-312`，:261-282 走 `this.openai.chat.completions.create` | ✅ 准确 |
| `reanswerQuestion` :386-389 检测 imageBase64 构建多模态消息发给 DeepSeek | `openai-provider.ts:382-389` 完全吻合 | ✅ 准确 |
| `extractTag`/`parseResponse`/`handleError` 均 private | :74/:101/:503 均标注 `private` | ✅ 准确 |
| `handleError` 错误码清单（§6.7 表） | 与 :503-539 完全对齐（含 `无可用`→`AI_SERVICE_UNAVAILABLE`） | ✅ 准确 |
| `analyzeImage` 签名（§6.5 草案） | 与 :164 一致（参数顺序、可选性等效） | ✅ 准确 |
| `getAIService()` 按 `config.aiProvider` 选 provider | `index.ts:13-29` 三分支：openai/azure/gemini | ✅ 准确 |
| `config.ts` 无方舟配置项、是上游文件 | `config.ts` 全文确认 | ✅ 准确 |
| `.env.example` 缺三个方舟变量 | 已 grep 确认 `.env.example` 无 `VOLCENGINE_*`/`PRO_ENDPOINT_ID` | ✅ 准确 |
| `.env` 已在 `.gitignore` | `.gitignore:34-35` `.env*` + `!.env.example` 例外 | ✅ 准确 |
| `vlm-transcribe.ts:212-229` 实证方舟 OpenAI SDK 兼容 | :212-229 完全吻合，`baseURL` 从 env 读 | ✅ 准确 |
| ❌ **方案 §6.5 / §6.3 反复说"独立实现 `parseResponse` 等效"** | `reanswerQuestion` 实际用**内联解析**（:429-438），不是 `parseResponse` | ⚠️ 不准（见 P1-1） |

### 2.2 评审发现落实情况 ✅（6 项全部落实）

| 编号 | 评审发现 | 方案落实位置 | 判定 |
|------|----------|--------------|------|
| **P0-1** | 覆盖两个图片入口（`analyzeImage` + `reanswerQuestion` 带图分支） | T3-1（analyze 切换）+ T3-2（reanswer 加分支）；§5.1 风险段强调"审计时必须验证 reanswer 带图路径" | ✅ 完整覆盖 |
| **P0-2** | 不直接改 `openai-provider.ts`，新建 `volcengine-vision.ts` | §3 文件清单标 `openai-provider.ts` 为"不动"；§5.1 P0-2 段；§6.3 复用方案 B 明确独立实现 | ✅ 落实 |
| **P1-1** | 禁止硬编码 URL，从 `.env` 读 `VOLCENGINE_BASE_URL` | T4-3 + §6.5 草案 constructor 从 `process.env.VOLCENGINE_BASE_URL` 读 | ✅ 落实 |
| **P1-2** | 补 `.env.example` 三个变量 | T4-1 含完整 env 片段（含注释） | ✅ 落实 |
| **P2-1** | 先验后建（手持拍照验证） | §0 整段前置门禁 + T1 全套（5 任务）+ §4.1 前置验收 + §7 执行顺序 T1 硬门禁 | ✅ 落实 |
| **P2-2** | 两个 provider = 两个故障点，错误处理策略 | §5.3 P2-2 段 + T6-1（默认不降级）+ §6.7 错误码对齐表 | ✅ 落实 |

### 2.3 逻辑自洽性 ⚠️（1 处内部矛盾）

| 矛盾点 | 详情 | 严重度 |
|---------|------|--------|
| **"parseResponse 等效" 与实际 reanswer 解析逻辑不符** | §6.5 草案 `reanswerWithImage` 与 §6.3 "独立实现 parseResponse 等效" 表述暗示 reanswer 也用 parseResponse。但实际 `openai-provider.ts:429-438` 的 reanswer 解析逻辑**独立内联**，提取字段集与 `parseResponse` 不同（无 `questionText`、`subject`、`requiresImage` 等）。 | P1 |
| **§3 上游修改清单 vs 实际** | 方案标 `.env.example` 为"上游修改"。但 `.env.example` 含 `OPENCLAW_*` 等本项目特有配置（`git log` 显示本项目曾修改过），可能并非 wrong-notebook 原始文件。标记偏保守（不算错，但分类不准）。 | P2 |

其余部分（§3 清单 ↔ §2 任务 ↔ §4 验收 ↔ §6 附录）内部一致，无矛盾。

### 2.4 铁律遵守 ✅（全部守住）

| 铁律 | 方案表现 | 判定 |
|------|----------|------|
| 铁律 1：破坏性操作须确认 | 计划层面无破坏性操作；T1 验证用独立脚本不碰 DB | ✅ |
| 铁律 2：保持可回退 | §4.3 验收要求 `git status` 干净、commit 标注上游修改 | ✅ |
| **铁律 3：不改上游表结构 / 上游文件** | `openai-provider.ts`/`types.ts`/`index.ts`/`config.ts` 全标"不动"；上游文件改动仅 `.env.example`/`analyze/route.ts`/`reanswer/route.ts` 三个，且最小增量；不碰 Prisma schema | ✅ |
| **铁律 4：密钥不入 git** | T4-2 确认 `.env` 已忽略；§6.5 草案 constructor 从 `process.env` 读，无硬编码；§0.3 样本图入库前加 `.gitignore` | ✅ |
| 铁律 5：遇错停下来 | §0.2 阈值 <60% 回炉；T1-4 不通过回 /plan | ✅ |
| 铁律 6：显式失败不掩盖 | §6.7 错误码对齐表保证前端看到统一错误；§4.4 验收逐条列错误码 | ✅ |

### 2.5 技术可行性 ⚠️（整体可行，2 处需补强）

| 设计点 | 评估 | 判定 |
|--------|------|------|
| **parseResponse 复用方式**（方案 B 独立实现） | 方案 B 的"独立实现等效逻辑"策略成立，但 §6.3 论证只针对 `parseResponse`（analyze 路径），未澄清 reanswer 路径用内联解析。技术上可行，描述需补强 | ⚠️ P1-1 |
| **工厂选型**（§6.4 方案 B：route 层直接 import `getVolcengineVisionService`） | route 层语义最清晰，符合"最小惊讶"；工厂函数定义在 `volcengine-vision.ts` 内导出，不新增工厂文件 | ✅ |
| **错误码对齐**（§6.7 表） | 与 `handleError`（:503-539）逐条核对完全一致，连 `无可用` → `AI_SERVICE_UNAVAILABLE` 都对齐 | ✅ |
| **方舟 SDK 兼容性**（§6.8 实证） | `vlm-transcribe.ts` 已用同样 `new OpenAI({apiKey, baseURL})` 调方舟，无新技术风险 | ✅ |
| **接口签名一致性**（§6.5） | `analyzeImage` 签名与 :164 严格一致；`reanswerWithImage` 把 `imageBase64` 提前并改必传（合理，因该分支必有图）；返回类型 `ParsedQuestion` / `ReanswerQuestionResult` 都从 `./types` 导出 | ✅ |
| **多 provider 场景** | 方案默认假设当前活动 provider 是 DeepSeek。但项目支持 `openai/azure/gemini` 三种 provider，Azure GPT-4o 与 Gemini 本就能看图，强制切方舟会绕过已有视觉能力 | ⚠️ P1-2 |

### 2.6 前置门禁完整性 ⚠️（设计扎实，1 处可加强）

**优点**：
- §0 把先验后建提到方案最前，"不通过则整个方案不成立" 的措辞明确
- §0.2 给出量化阈值（≥80% 通过 / 60-80% 暂停 / <60% 回炉）
- §7 执行顺序图把 T1 画成硬门禁，不通过直接停
- §4.1 前置验收要求报告产出 + 决策记入 `DECISIONS.md`
- T1-2 复用现成 `vlm-transcribe.ts` 改造，避免重写

**不足**：
- T1 是**计划层面软门禁**，没有代码/CI 层面的硬门禁（如 pre-commit hook 检查 `handheld-report.md` 是否存在）。execute-agent 理论上可跳过 T1 直接进 T2。建议 plan-agent 补一句"execute-agent 启动前需用户出示 T1 通过决策编号"或在执行日志中强制引用 `DECISIONS.md` 的 D-编号。属 P2 改进项。

---

## 3. 问题严重性分级

### P0（必须修改才能放行 /execute）
- **无**

### P1（建议修改，影响实施正确性）
| 编号 | 问题 | 所在位置 | 建议修正 |
|------|------|----------|----------|
| P1-1 | "parseResponse 等效" 表述误导。实际 `reanswerQuestion` 用**内联解析**（:429-438），与 `parseResponse`（:101-162）提取字段集不同 | §6.3、§6.5、§5.4 复用代价段、T2-2 | plan-agent 补一段澄清：analyze 路径复用 `parseResponse` 等效；reanswer 路径复用 :429-438 内联解析等效（提取 `answerText`/`analysis`/`knowledgePoints`/`wrongAnswerText`/`mistakeAnalysis`/`mistakeStatus`）。两条解析路径独立实现 |
| P1-2 | 多 provider 场景未讨论。项目 `AI_PROVIDER` 支持 openai/azure/gemini，后两者本就能看图 | §1.1、§1.3、§6.2 调用链 | plan-agent 补一段判定逻辑：何时启用方舟视觉服务（如 `AI_PROVIDER=openai 且 baseURL 指向 DeepSeek` 时启用；azure/gemini 时回退到原 provider），或明确声明"本方案默认场景为 AI_PROVIDER=openai + DeepSeek，其他 provider 场景后续单独评估" |

### P2（可忽略，提示性建议）
| 编号 | 问题 | 建议 |
|------|------|------|
| P2-1 | T1 前置门禁是软门禁，无代码/CI 强制 | 建议加一个轻量检查（如 execute-agent 启动前要求引用 `DECISIONS.md` 的 D-编号） |
| P2-2 | `.env.example` 标为"上游修改"略偏保守（含本项目特有 OPENCLAW 配置，非 wrong-notebook 原始） | 核实是否真为上游文件；若不是，分类改为"本项目文件修改" |
| P2-3 | §6.5 草案 `handleError(error: unknown): never` 与上游 `handleError(error: unknown)`（无 `: never`）签名略有差异 | 实现时保持 `: never`（更安全，TypeScript 强制所有路径抛出）。本差异对功能无影响 |
| P2-4 | §6.5 草案未展开 `generateAnalyzePrompt` 的 `options` 参数细节（需调 `getMathTagsFromDB`/`getTagsFromDB`） | 实现细节，可在 T2-1 任务说明里补一句"prompt 构造与上游 `analyzeImage` 一致，含标签 prefetch" |

---

## 4. 修正建议（给 plan-agent）

### 修正 1（P1-1）：明确两条解析路径

**在 §6.3 复用方案后追加一段**：

> **解析逻辑的两条独立路径**：
> 上游 `OpenAIProvider` 内实际有**两套**响应解析逻辑：
> - **A 路径**（`analyzeImage` 用）：调用 `parseResponse()`（:101-162），提取 9 个标签：`question_text`/`answer_text`/`analysis`/`subject`/`knowledge_points`/`requires_image`/`wrong_answer_text`/`mistake_analysis`/`mistake_status`
> - **B 路径**（`reanswerQuestion` 用）：内联解析（:429-438），仅提取 6 个标签：`answer_text`/`analysis`/`knowledge_points`/`wrong_answer_text`/`mistake_analysis`/`mistake_status`
>
> 方舟视觉服务必须分别独立实现这两条路径：
> - `analyzeImage()` 内复用 A 路径等效逻辑（约 60 行）
> - `reanswerWithImage()` 内复用 B 路径等效逻辑（约 15 行，更简单）
> - 不要让 `reanswerWithImage` 复用 `parseResponse`，否则会多提取 `question_text`/`subject`/`requires_image` 等无关字段，且 `ReanswerQuestionResult` 接口不包含这些字段，会导致类型错误

### 修正 2（P1-2）：补多 provider 场景说明

**在 §1.1 后追加一段**，或在 §1.3 三方分工表后加注：

> **适用范围限定**：
> 本方案的前提是"当前活动 provider 看不了图"。项目 `AI_PROVIDER` 支持三种 provider：
> - `openai`（本项目实际配的是 DeepSeek，**看不了图**）→ **本方案适用**
> - `azure`（Azure GPT-4o，**能看图**）→ 不需要切方舟，本方案不适用
> - `gemini`（Gemini 2.5 Flash，**能看图**）→ 不需要切方舟，本方案不适用
>
> **当前决策**：本方案仅在 `AI_PROVIDER=openai` 且 baseURL 指向 DeepSeek（或类似纯文本模型）时启用方舟视觉服务。Azure/Gemini 场景下保持原 provider 处理图片，避免无谓绕过。
>
> **实现建议**：`getVolcengineVisionService()` 工厂内可加一道判定——读取 `getAppConfig().aiProvider`，若非 `openai` 则抛错或回退到 `getAIService()`。或者更简单：在 `analyze/route.ts`/`reanswer/route.ts` 内根据 `aiProvider` 选择走哪条路径。

### 修正 3（P2-1，可选）：T1 软门禁加固

在 T1-4 任务后追加：

> execute-agent 启动 T2 前，必须在 `doc/executionlog/<feature>-log.md` 顶部引用 `DECISIONS.md` 的 D-编号（如"D-xxx: T1 先验通过，准确率 85%"）。audit-agent 审计时若该引用缺失，直接判不通过。

---

## 5. 审计结论

| 检查维度 | 判定 |
|----------|------|
| 事实准确性 | ⚠️ 9/10 准确（P1-1 的 parseResponse 表述误导） |
| 评审发现落实 | ✅ 6/6 全部落实 |
| 逻辑自洽性 | ⚠️ 1 处内部矛盾（P1-1 引发） |
| 铁律遵守 | ✅ 6/6 全部守住 |
| 技术可行性 | ⚠️ 整体可行，2 处需补强（P1-1、P1-2） |
| 前置门禁完整性 | ⚠️ 设计扎实，软门禁可加固（P2-1） |

**总体判定：⚠️ 有条件通过**

**放行 /execute 的条件**：
1. plan-agent 修订 P1-1（明确两条解析路径），并在方案中标注"修正 1 已纳入"
2. plan-agent 修订 P1-2（补多 provider 场景说明），并在方案中标注"修正 2 已纳入"

**P2 级问题不阻塞放行**，可在 /execute 阶段顺手处理或留作设计债。

**未触及代码**：本次审计仅审查方案文档，未修改任何代码或配置文件，符合 audit-agent"只指出不修改"的职责边界。

---

> 审计产出者：audit-agent
> 等待 plan-agent 修订 P1-1、P1-2 后方可放行 /execute。
