# 火山方舟 VLM 接入 · 开发计划

> 关联: [doc/reference/TECH_PLAN_v2.md](../reference/TECH_PLAN_v2.md)（§AI 管线）、[doc/reference/OPS_handbook.md](../reference/OPS_handbook.md)
> 计划日期: 2026-06-20
> 计划者: plan-agent
> 预计影响范围:
> - 新增: `src/lib/ai/volcengine-vision.ts`、可选 `src/lib/ai/xml-parser.ts`
> - 上游文件最小增量修改（⚠️ 已标注）: `.env.example`、`src/app/api/analyze/route.ts`、`src/app/api/reanswer/route.ts`
> - **不修改**: `src/lib/ai/openai-provider.ts`、`src/lib/ai/types.ts`、`src/lib/ai/index.ts`、`src/lib/config.ts`

---

## 0. ⚠️ 前置验证（先验后建，必须先做）

> **🔴 这一段是整个方案的前置门禁。不通过则整个方案不成立。**

> **在真正投入开发前，先用方舟 Pro 跑 5–10 张真实手持拍照样本（E 线已在拍错题，素材现成）。如果手持场景准确率掉到不可用，整个接入方案的前提就不成立了——那时候应该先调拍照指引/预处理，而不是急着接 API。先验后建。**

### 0.1 为什么必须先验

现有"VLM 够用了"的结论，验收数据来自 **2024 Q1–Q4 干净印刷 PDF（150DPI）**——平铺扫描、光照均匀、无手写、无反光。

真实使用场景是**外甥女/外甥手持拍教辅**，至少有以下变量是 PDF 验收里没覆盖的：

| 变量 | PDF 验收 | 手持实景 |
|------|----------|----------|
| 角度 | 平铺正拍 | 倾斜、透视畸变 |
| 光照 | 均匀 | 阴影、台灯反光、纸张镜面反光 |
| 清晰度 | 高 | 手抖、对焦失败、低分辨率 |
| 内容纯净度 | 纯印刷 | 印刷 + 手写批注混入 |
| 纸张状态 | 平整 | 折痕、卷边、跨页中线 |

### 0.2 先验怎么验（验完再开工）

1. 从 E 线外甥女已拍的错题素材里挑 5–10 张真实手持照（含不同光照/角度/学科）
2. 用现成的 `scripts/vlm-transcribe.ts`（已验证可调方舟 Pro），改成"识别+结构化"任务，输出 `<question_text>/<answer_text>/<analysis>` XML
3. 人工核对准确率。判定阈值（建议）：
   - **题目正文提取正确率 ≥ 80%** → 可开工
   - **60–80%** → 暂停，先优化拍照指引 / 加预处理（去阴影、纠偏）
   - **< 60%** → 整个方案前提不成立，回炉

### 0.3 先验成果归档

- 样本图片放: `doc/research/vision-samples/handheld/`（**不入 git**，加 `.gitignore`）
- 验收记录放: `doc/research/vision-samples/handheld-report.md`（每张图 → AI 输出 → 人工判定）
- 决策记入: `doc/DECISIONS.md`（D-编号：是否通过先验、采用的阈值）

---

## 1. 大白话概述

### 1.1 现在的问题是什么

**一句话**：用户拍照上传后，图片被发给了 DeepSeek（一个看不懂图的纯文本模型），结果"识图"等于瞎猜。

**详细一点**：
- 上游代码里有个 AI 服务（`OpenAIProvider`），里面 4 个方法本来都走 `this.openai`
- 项目把 `this.openai` 配成了 DeepSeek（文本强、视觉零）
- 其中 **2 个方法会带图调用**：`analyzeImage`（拍照识题）和 `reanswerQuestion`（重新作答带图）
- 这两个方法把 base64 图片塞进请求发给 DeepSeek → **DeepSeek 看不到图，只能根据 system prompt 里的文字瞎编**

### 1.2 想怎么解决

**一句话**：让"带图"的活走方舟 Pro，"纯文本"的活继续走 DeepSeek，互不打扰。

**详细一点**：
- 方舟 Pro 是个真正的 VLM（视觉模型），看得懂图
- 已有 `scripts/vlm-transcribe.ts` 验证过方舟 API 与 OpenAI SDK 兼容，能直接用 `new OpenAI({baseURL: ...})` 调
- 新建一个 **方舟视觉服务** 文件，专门处理"带图"的两个方法
- 纯文本的两个方法（`generateSimilarQuestion`、`analyzeForGeogebra`）继续走老路，不动

### 1.3 三方分工（不含语音，语音轮另行处理）

| 服务 | 职责 | 配置 |
|------|------|------|
| DeepSeek | 纯文本：相似题生成、GeoGebra 分析、不带图的重新作答 | 现有 `OPENAI_*` |
| **方舟 Pro** | **视觉：拍照识题、带图的重新作答** | **`VOLCENGINE_*` + `PRO_ENDPOINT_ID`** |
| 方舟 Lite | 语音（本轮不含） | — |

> **适用范围限定**：
> 本方案的前提是"当前活动 provider 看不了图"。项目 `AI_PROVIDER` 支持三种 provider：
> - `openai`（本项目实际配的是 DeepSeek，**看不了图**）→ **本方案适用**
> - `azure`（Azure GPT-4o，**能看图**）→ 不需要切方舟，本方案不适用
> - `gemini`（Gemini 2.5 Flash，**能看图**）→ 不需要切方舟，本方案不适用
>
> **当前决策**：本方案仅在 `AI_PROVIDER=openai` 且 baseURL 指向 DeepSeek（或类似纯文本模型）时启用方舟视觉服务。Azure/Gemini 场景下保持原 provider 处理图片，避免无谓绕过。
>
> **实现建议**：`getVolcengineVisionService()` 工厂内可加一道判定——读取 `getAppConfig().aiProvider`，若非 `openai` 则抛错或回退到 `getAIService()`。或者更简单：在 `analyze/route.ts`/`reanswer/route.ts` 内根据 `aiProvider` 选择走哪条路径。

---

## 2. 任务分解

> 任务编号约定：`T{阶段}-{序号}`，阶段 1=先验，2=新建文件，3=路由切换，4=配置同步，5=测试

### T1 先验（前置门禁，对应第 0 节）

- [ ] **T1-1** 从 E 线素材里选 5–10 张手持照，放 `doc/research/vision-samples/handheld/`
- [ ] **T1-2** 写一个临时脚本（或改 `vlm-transcribe.ts` 加 `--task=analyze-sample`），逐张调用方舟 Pro，要求 XML 结构化输出
- [ ] **T1-3** 人工判定准确率，写 `doc/research/vision-samples/handheld-report.md`
- [ ] **T1-4** 按阈值决策（通过 → 进 T2；不通过 → 停，回 /plan 重做）
  - execute-agent 启动 T2 前，必须在 `doc/executionlog/<feature>-log.md` 顶部引用 `DECISIONS.md` 的 D-编号（如"D-xxx: T1 先验通过，准确率 85%"）。audit-agent 审计时若该引用缺失，直接判不通过。
- [ ] **T1-5** 决策记入 `doc/DECISIONS.md`

### T2 新建方舟视觉服务文件（对应 P0-2）

- [ ] **T2-1** 新建 `src/lib/ai/volcengine-vision.ts`
  - 封装方舟视觉客户端（用 OpenAI SDK 兼容方式）
  - 从 `process.env` 读 `VOLCENGINE_API_KEY` / `VOLCENGINE_BASE_URL` / `PRO_ENDPOINT_ID`（避开改 `config.ts`）
  - 实现 `analyzeImage()`（与 `AIService.analyzeImage` 签名一致）
  - 实现 `reanswerWithImage()`（处理 `reanswerQuestion` 带图分支的等效逻辑）
  - **图像预处理**：两个图片入口方法先调用 `ensurePortrait()`（自动旋转横图为竖图），再发方舟 API。
    实测发现横拍照片（宽>高）会导致方舟 Pro 超时或卡死，竖拍则正常。详见 §6.8。
- [ ] **T2-2** 在新文件内**独立实现** `extractTag()` + 两条解析路径（XML 标签解析），逻辑与上游 `OpenAIProvider` 内 private 方法等效
  - **A 路径（`analyzeImage` 用）**：实现等效的 `parseResponse()`（约 60 行），提取 9 个标签：`question_text`/`answer_text`/`analysis`/`subject`/`knowledge_points`/`requires_image`/`wrong_answer_text`/`mistake_analysis`/`mistake_status`
  - **B 路径（`reanswerWithImage` 用）**：内联解析（约 15 行），仅提取 6 个标签：`answer_text`/`analysis`/`knowledge_points`/`wrong_answer_text`/`mistake_analysis`/`mistake_status`
  - **禁止**让 `reanswerWithImage` 复用 `parseResponse`，否则会多提取 `question_text`/`subject`/`requires_image` 等无关字段，与 `ReanswerQuestionResult` 接口冲突，导致类型错误
  - **理由**：上游方法为 private，无法 import；抽共享工具会导致上游也要改（违反铁律 3）。独立实现是"不动上游"前提下的最小代价
  - 详见 §6.3 复用方式说明（含两条独立路径）
- [ ] **T2-3** 在新文件内**独立实现** `handleError()` 错误分类逻辑（与上游 `OpenAIProvider` 等效）
  - 保证 `/api/analyze` 和 `/api/reanswer` 路由层能复用现有的 `AI_CONNECTION_FAILED` / `AI_TIMEOUT_ERROR` / `AI_QUOTA_EXCEEDED` 等错误码，前端无需改

### T3 路由切换（对应 P0-1 两个图片入口）

> ⚠️ 本节会修改 2 个上游文件，每处都是**最小增量**（换 import + 换 1 行调用），commit message 须标注 `⚠️上游文件修改`。

- [ ] **T3-1** 修改 `src/app/api/analyze/route.ts`（⚠️上游文件修改）
  - 图片是必传字段，整个路由的语义就是"识图"，直接切到方舟视觉服务
  - 改动点：`getAIService()` → `getVolcengineVisionService()`（或类似工厂）
- [ ] **T3-2** 修改 `src/app/api/reanswer/route.ts`（⚠️上游文件修改）
  - 这里**有图无图都要支持**，加一行分支：
    - `imageBase64` 存在 → 走方舟视觉服务的 `reanswerWithImage()`
    - 不存在 → 继续走 `getAIService().reanswerQuestion()`（DeepSeek）
  - 这正是 **P0-1** 强调的"两个图片入口"之一

### T4 配置同步（对应 P1-1、P1-2）

- [ ] **T4-1** 修改 `.env.example`（⚠️上游文件修改），补三行 + 注释：
  ```env
  # 火山方舟 VLM 配置（用于拍照识图，方舟 Pro）
  VOLCENGINE_API_KEY=""
  VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
  PRO_ENDPOINT_ID=""  # 方舟 Pro 视觉模型的 Endpoint ID
  ```
- [ ] **T4-2** 确认 `.env` 已在 `.gitignore`（铁律 4，已核实 OK）
- [ ] **T4-3** **禁止硬编码** URL（P1-1）：方舟 baseURL 只能从 `process.env.VOLCENGINE_BASE_URL` 读，代码里不写死 `https://ark.cn-beijing.volces.com/api/v3`
- [ ] **T4-4** config 层选型确认：方舟配置直接在 `volcengine-vision.ts` 内从 `process.env` 读取，**不改 `src/lib/config.ts`**。理由：改 `AppConfig` 接口会牵动 `getAppConfig()`、`updateAppConfig()`、迁移逻辑等多处上游代码，代价远超收益

### T5 测试（对应 P2-1、P2-2）

- [ ] **T5-1** 单元测试 `src/__tests__/unit/ai/volcengine-vision.test.ts`
  - mock 方舟 API 响应（含正常 XML、缺标签、空响应、超时、401 等场景）
  - 验证 `parseResponse()` 输出与上游 `OpenAIProvider.parseResponse()` 行为一致
  - 验证 `handleError()` 错误分类覆盖所有错误码
- [ ] **T5-2** 集成测试（仅当 T1 先验通过）
  - 复用 T1 的 5–10 张样本，跑 `volcengine-vision.ts`
  - 比对单元 mock 与真实响应的解析差异
- [ ] **T5-3** 路由级回归测试
  - `/api/analyze`：mock 方舟服务，验证路由层正确调用并处理错误码
  - `/api/reanswer`：双分支测试（带图 → 方舟，无图 → DeepSeek）

### T6 风险预案（对应 P2-2）

- [ ] **T6-1（可选）** 评估是否加降级路径：方舟挂了时，`/api/analyze` 是否回退到提示用户重试（而非直接 500）
  - 默认方案：**不加降级**，直接复用现有错误码（`AI_SERVICE_UNAVAILABLE` 等）让前端展示
  - 理由：方舟和 DeepSeek 是异构服务，跨 provider 降级语义混乱；先让失败可见，积累真实故障率后再决策

---

## 3. 文件变更清单

| 文件 | 操作 | 是否上游 | 改动量 | 风险 |
|------|------|:--:|--------|------|
| `src/lib/ai/volcengine-vision.ts` | **新增** | 否 | 约 250–350 行 | 低（新文件独立） |
| `src/__tests__/unit/ai/volcengine-vision.test.ts` | **新增** | 否 | 约 200 行 | 低 |
| `doc/research/vision-samples/handheld/` | **新增目录** | 否 | 5–10 张图（不入 git） | 低 |
| `doc/research/vision-samples/handheld-report.md` | **新增** | 否 | 准确率报告 | 低 |
| `.env.example` | ⚠️ 上游修改 | 是 | +3 行 +注释 | 极低 |
| `src/app/api/analyze/route.ts` | ⚠️ 上游修改 | 是 | 换 1 import + 换 1 行 | 低 |
| `src/app/api/reanswer/route.ts` | ⚠️ 上游修改 | 是 | 换 1 import + 加 1 分支 | 中（双分支） |
| `.gitignore` | 视情况 | — | 加 `doc/research/vision-samples/handheld/`（若未覆盖） | 极低 |
| `src/lib/ai/openai-provider.ts` | **不动** | 是 | 0 | — |
| `src/lib/ai/types.ts` | **不动** | 是 | 0 | — |
| `src/lib/ai/index.ts` | **不动** | 是 | 0 | — |
| `src/lib/config.ts` | **不动** | 是 | 0 | — |

**上游文件修改总计**：3 个（`.env.example`、`analyze/route.ts`、`reanswer/route.ts`），全部为最小增量。

---

## 4. 验收标准

### 4.1 前置验收（T1，必须先过）

- [ ] 5–10 张手持样本准确率达到 §0.2 阈值（≥ 80% 直接通过，60–80% 暂停评估）
- [ ] 报告 `handheld-report.md` 已产出，决策已记入 `DECISIONS.md`
- [ ] 若不通过，方案回炉，不进入 T2

### 4.2 功能验收

- [ ] 拍照识题（`POST /api/analyze`）：真实样本可正确返回 `<question_text>/<answer_text>/<analysis>` 结构化结果
- [ ] 重新作答带图（`POST /api/reanswer` 带 `imageBase64`）：走方舟，能正确解析图片内容
- [ ] 重新作答无图（`POST /api/reanswer` 不带 `imageBase64`）：仍走 DeepSeek，行为与改动前一致（回归零差异）
- [ ] 相似题生成（`generateSimilarQuestion`）：仍走 DeepSeek，行为零差异
- [ ] GeoGebra 分析（`analyzeForGeogebra`）：仍走 DeepSeek，行为零差异

### 4.3 工程验收

- [ ] `.env.example` 含 3 个新变量，注释清晰
- [ ] 无任何硬编码的方舟 URL（grep 确认）
- [ ] `npm run test:all` 通过（含新增单元测试）
- [ ] commit message 中上游修改处已标注 `⚠️上游文件修改`
- [ ] `git status` 确认无 `.env` 被追踪

### 4.4 错误处理验收

- [ ] 方舟返回 401 → 前端看到 `AI_AUTH_ERROR`
- [ ] 方舟返回 429 → 前端看到 `AI_QUOTA_EXCEEDED`
- [ ] 方舟网络不通 → 前端看到 `AI_CONNECTION_FAILED`
- [ ] 方舟超时 → 前端看到 `AI_TIMEOUT_ERROR`
- [ ] 方舟返回空响应或非法 XML → 前端看到 `AI_RESPONSE_ERROR`

---

## 5. 风险与注意事项

### 5.1 P0 级（必须处理）

#### P0-1 方案必须覆盖两个图片入口
**风险**：只改 `analyzeImage` 会遗漏 `reanswerQuestion` 的带图分支，导致"重新作答带图"静默失败（DeepSeek 看不到图但假装作答）。

**对策**：见 T3-1（analyze 切换）和 T3-2（reanswer 加分支）。**审计时必须专门验证 reanswer 带图路径确实走了方舟**。

#### P0-2 不得直接改上游 `openai-provider.ts`
**风险**：直接在上游 provider 内加方舟分支会污染上游文件，将来 sync upstream 必然冲突。

**对策**：新建 `volcengine-vision.ts`，完全独立实现。符合项目"追加挂接"哲学（与 D 线转写脚本、前端架构方案一致）。

### 5.2 P1 级（应处理）

#### P1-1 禁止硬编码 URL
**风险**：把 `https://ark.cn-beijing.volces.com/api/v3` 写死在代码里，将来方舟换域名或上线国际区时全代码库改。

**对策**：见 T4-3，强制从 `process.env.VOLCENGINE_BASE_URL` 读。`.env.example` 给默认值作为参考。

#### P1-2 补 `.env.example`
**风险**：新接手的人 clone 仓库后不知道要配方舟变量，跑起来报错。

**对策**：见 T4-1，补 3 个变量 + 注释。

### 5.3 P2 级（已知限制，记录在案）

#### P2-1 先验后建（前置门禁）
**说明**：见第 0 节。**这是整个方案成立的前提**，不通过则回炉。

#### P2-2 两个 provider = 两个故障点
**说明**：方舟挂了，`/api/analyze` 直接失败；DeepSeek 挂了，`/api/reanswer`（无图）失败。两个故障域独立。

**对策**：
- **默认**：复用现有错误分类（`handleError` 等效实现），让前端看到统一错误码，不跨 provider 降级
- **可选**：T6-1 评估降级路径，但默认不加。先让失败可见，积累真实故障率数据再决策

### 5.4 其他注意事项

- **复用 parseResponse 的代价**：上游 `OpenAIProvider` 的 `extractTag` / `parseResponse` / `handleError` 是 private 方法，无法 import。新文件必须独立实现等效逻辑（约 100 行重复）。**这是"不动上游"铁律的必然代价**，记入设计债，等上游同步时再统一抽取共享工具。注意上游实际有**两条**独立解析路径（A 路径 `parseResponse` 用于 `analyzeImage`、B 路径内联解析用于 `reanswerQuestion`），新文件需分别等效实现，不可混用（详见 §6.3）。
- **接口一致性**：新文件 `analyzeImage` 必须与 `AIService.analyzeImage` 签名严格一致（参数顺序、返回类型），否则路由层无法平滑切换。
- **回归风险**：`reanswer/route.ts` 加分支时，必须保证"无图"路径行为零差异。审计时必须覆盖双分支测试。
- **前端零改**：本方案不动前端（UploadZone/ImageCropper），前端调的 URL 不变，只是后端换了服务实现。

---

## 6. 技术附录

### 6.1 现有调用链（已核实）

```
用户拍照 → UploadZone → ImageCropper → POST /api/analyze
  → getAIService() → aiService.analyzeImage(base64)
    → OpenAIProvider → this.openai (DeepSeek，看不了图！)
                       ↑↑↑ 这是要切的点

重新作答 → POST /api/reanswer
  → getAIService() → aiService.reanswerQuestion(text, lang, subject, imageBase64?, semester)
    → 若 imageBase64 存在 → 构建多模态消息（openai-provider.ts:386-389）→ 仍发给 this.openai (DeepSeek)
                                                                       ↑↑↑ 第二个图片入口，也要切
    → 若 imageBase64 不存在 → 纯文本消息 → DeepSeek（正确，不动）
```

### 6.2 切换后的调用链（目标）

```
拍照识题 → POST /api/analyze
  → getVolcengineVisionService() → visionService.analyzeImage(base64)
    → VolcengineVision → ark client（方舟 Pro，能看图 ✅）

重新作答 → POST /api/reanswer
  → 分支：
    [有图]  → getVolcengineVisionService().reanswerWithImage(text, base64, ...)
              → 方舟 Pro（能看图 ✅）
    [无图]  → getAIService().reanswerQuestion(text, lang, subject, undefined, semester)
              → DeepSeek（保持原行为 ✅）

相似题生成 → POST /api/... → getAIService().generateSimilarQuestion(...) → DeepSeek（不动）
GeoGebra  → POST /api/... → getAIService().analyzeForGeogebra(...)       → DeepSeek（不动）
```

### 6.3 复用 `parseResponse` 的方式（关键决策）

**背景**：上游 `OpenAIProvider` 内 `extractTag` / `parseResponse` / `handleError` 均为 private 方法，外部无法 import。方舟视觉服务需要等效的 XML 解析能力。

**三种候选方案**：

| 方案 | 做法 | 优点 | 缺点 | 评估 |
|------|------|------|------|------|
| A. 抽共享工具 | 新建 `src/lib/ai/xml-parser.ts`，让方舟文件 import；上游不动（仍用自己的 private） | 解析逻辑集中，未来上游同步时可直接复用 | 上游不同步前，工具文件只有方舟用，"伪共享" | 中期最优，短期略显超前 |
| B. 独立实现 | 在 `volcengine-vision.ts` 内复制一份等效逻辑 | 完全独立，无依赖 | 约 100 行逻辑重复 | 短期最稳 |
| C. 改上游 | 把上游 private 方法改成 import 共享工具 | 真正去重 | **违反铁律 3** | ❌ 否决 |

**推荐：方案 B（独立实现）**。

**理由**：
1. 方案 A 的"伪共享"在短期增加心智负担（工具文件存在但上游不用，读者会困惑）
2. 方案 B 重复量可控（`extractTag` 约 25 行、`parseResponse` 约 60 行、`handleError` 约 35 行），且逻辑稳定不会频繁变动
3. 等将来 sync upstream 时，可顺手把两边统一抽到共享工具，记入设计债
4. 完全规避"改上游"风险，最符合项目"追加挂接"哲学

**设计债记录**：在 `doc/00_CURRENT.md` 的设计债表追加一条——"方舟视觉服务与 OpenAIProvider 的 XML 解析逻辑重复，待上游同步后抽取共享工具"。

**解析逻辑的两条独立路径**：
上游 `OpenAIProvider` 内实际有**两套**响应解析逻辑：
- **A 路径**（`analyzeImage` 用）：调用 `parseResponse()`（:101-162），提取 9 个标签：`question_text`/`answer_text`/`analysis`/`subject`/`knowledge_points`/`requires_image`/`wrong_answer_text`/`mistake_analysis`/`mistake_status`
- **B 路径**（`reanswerQuestion` 用）：内联解析（:429-438），仅提取 6 个标签：`answer_text`/`analysis`/`knowledge_points`/`wrong_answer_text`/`mistake_analysis`/`mistake_status`

方舟视觉服务必须分别独立实现这两条路径：
- `analyzeImage()` 内复用 A 路径等效逻辑（约 60 行）
- `reanswerWithImage()` 内复用 B 路径等效逻辑（约 15 行，更简单）
- 不要让 `reanswerWithImage` 复用 `parseResponse`，否则会多提取 `question_text`/`subject`/`requires_image` 等无关字段，且 `ReanswerQuestionResult` 接口不包含这些字段，会导致类型错误

### 6.4 工厂/路由层选型

**背景**：方舟视觉服务需要在某处被实例化并注入到调用链。两种候选：

#### 方案 A：扩展 `AIService` 工厂（改 `src/lib/ai/index.ts`）

```ts
// src/lib/ai/index.ts（上游文件，需 ⚠️标注）
export function getVisionService(): VisionService {
  return new VolcengineVision(/* from env */);
}
```

- 优点：工厂层统一管理，调用方一致（都从 `@/lib/ai` import）
- 缺点：动 `index.ts`（上游文件），且 `getAIService()` 与 `getVisionService()` 语义并列容易混淆

#### 方案 B：route 层直接实例化（改 route）

```ts
// src/app/api/analyze/route.ts（上游文件，需 ⚠️标注）
import { getVolcengineVisionService } from "@/lib/ai/volcengine-vision";
// ...
const vision = getVolcengineVisionService();
const result = await vision.analyzeImage(imageBase64, ...);
```

- 优点：语义最清晰（"这个 API 就是识图的，用视觉服务天经地义"）；改动局部（每个 route 改一行）
- 缺点：动 route 文件（上游）

**推荐：方案 B**。

**理由**：
1. 两个方案都要动上游文件，方案 B 改的是"语义最贴近视觉服务"的 route 文件，最小惊讶
2. 不污染 `getAIService()` 的语义（它本来就返回"主 AI 服务"=DeepSeek）
3. `getVolcengineVisionService()` 工厂函数直接定义在 `volcengine-vision.ts` 内导出，不新增工厂文件
4. `reanswer/route.ts` 的双分支判断写在 route 里，逻辑透明可见，便于审计

### 6.5 `volcengine-vision.ts` 接口设计（草案）

```ts
// src/lib/ai/volcengine-vision.ts
import OpenAI from "openai";
import sharp from "sharp";
import type { ParsedQuestion, ReanswerQuestionResult } from "./types";
import { generateAnalyzePrompt, generateReanswerPrompt } from "./prompts";
import { safeParseParsedQuestion } from "./schema";
import { normalizeMistakeStatusForSave } from "../mistake-status";
import { createLogger } from "../logger";

const logger = createLogger('ai:volcengine-vision');

export class VolcengineVision {
  private ark: OpenAI;
  private model: string;      // = process.env.PRO_ENDPOINT_ID
  private baseURL: string;    // = process.env.VOLCENGINE_BASE_URL

  constructor() {
    const apiKey = process.env.VOLCENGINE_API_KEY;
    const baseURL = process.env.VOLCENGINE_BASE_URL;
    const model = process.env.PRO_ENDPOINT_ID;

    if (!apiKey || !baseURL || !model) {
      throw new Error("AI_AUTH_ERROR: VOLCENGINE_API_KEY / VOLCENGINE_BASE_URL / PRO_ENDPOINT_ID are required");
    }

    this.ark = new OpenAI({ apiKey, baseURL });
    this.baseURL = baseURL;
    this.model = model;
  }

  /** 图片预处理：自动旋转横图为竖图（实测必需，否则横图 VLM 易超时） */
  private async ensurePortrait(base64: string): Promise<string> {
    const buf = Buffer.from(base64, 'base64');
    const img = sharp(buf);
    const meta = await img.metadata();
    if (meta.width && meta.height && meta.width > meta.height) {
      const rotated = await img.rotate(90).jpeg({ quality: 90 }).toBuffer();
      return rotated.toString('base64');
    }
    return base64;
  }

  // 签名与 AIService.analyzeImage 严格一致
  // 入口先调用 ensurePortrait 自动旋转横图，再发方舟
  async analyzeImage(
    imageBase64: string,
    mimeType?: string,
    language?: 'zh' | 'en',
    grade?: 7 | 8 | 9 | 10 | 11 | 12 | null,
    subject?: string | null,
    gradeSemester?: string | null
  ): Promise<ParsedQuestion> {
    const normalized = await this.ensurePortrait(imageBase64);
    // ... 后续调用方舟 API
  }

  // 处理 reanswerQuestion 带图分支
  // 入口先调用 ensurePortrait 自动旋转横图，再发方舟
  async reanswerWithImage(
    questionText: string,
    imageBase64: string,
    language?: 'zh' | 'en',
    subject?: string | null,
    gradeSemester?: string | null
  ): Promise<ReanswerQuestionResult> {
    const normalized = await this.ensurePortrait(imageBase64);
    // ... 后续调用方舟 API
  }

  // 独立实现的等效逻辑（见 §6.3 方案 B + 两条独立解析路径）
  private extractTag(text: string, tagName: string): string | null { /* 与上游等效 */ }
  // A 路径：analyzeImage 用，提取 9 个标签（与上游 parseResponse :101-162 等效）
  private parseResponse(text: string): ParsedQuestion { /* 与上游等效 */ }
  // B 路径：reanswerWithImage 用，仅提取 6 个标签（与上游内联解析 :429-438 等效，不复用 parseResponse）
  private parseReanswerResponse(text: string): ReanswerQuestionResult { /* 与上游等效 */ }
  private handleError(error: unknown): never { /* 与上游等效 */ }
}

// 工厂函数（方案 B）
export function getVolcengineVisionService(): VolcengineVision {
  return new VolcengineVision();
}
```

### 6.6 reanswer 路由层双分支（草案）

```ts
// src/app/api/reanswer/route.ts（⚠️上游文件修改）
import { getAIService } from "@/lib/ai";
import { getVolcengineVisionService } from "@/lib/ai/volcengine-vision";  // 新增 import

// ... 在 POST handler 内：
if (imageBase64) {
  // 带图分支：走方舟 Pro
  const vision = getVolcengineVisionService();
  const result = await vision.reanswerWithImage(questionText, imageBase64, language, subject, gradeSemester);
  return NextResponse.json(result);
} else {
  // 无图分支：保持原行为，走 DeepSeek
  const aiService = getAIService();
  const result = await aiService.reanswerQuestion(questionText, language, subject, undefined, gradeSemester);
  return NextResponse.json(result);
}
```

### 6.7 错误处理契约

方舟视觉服务的 `handleError` 必须产出与上游 `OpenAIProvider.handleError` **完全一致**的错误码集合，确保前端 `/api/analyze` 和 `/api/reanswer` 的错误处理逻辑零修改：

| 输入特征 | 输出错误码 |
|----------|------------|
| `fetch failed` / `network` / `connect` | `AI_CONNECTION_FAILED` |
| `timeout` / `timed out` / `aborted` / `408` | `AI_TIMEOUT_ERROR` |
| `quota` / `额度` / `rate limit` / `429` / `too many` | `AI_QUOTA_EXCEEDED` |
| `403` / `forbidden` / `permission` | `AI_PERMISSION_DENIED` |
| `404` / `not found` / `does not exist` | `AI_NOT_FOUND` |
| `500` / `502` / `503` / `504` / `overloaded` / `unavailable` | `AI_SERVICE_UNAVAILABLE` |
| `invalid json` / `parse` | `AI_RESPONSE_ERROR` |
| `api key` / `unauthorized` / `401` | `AI_AUTH_ERROR` |
| 其他 | `AI_UNKNOWN_ERROR` |

（与 `openai-provider.ts:503-539` 完全对齐）

### 6.8 图像预处理：自动旋转（实测验证）

**发现来源**：T1 先验测试中，横拍照片（宽 > 高，如 1919×1080）导致方舟 Pro VLM 处理超时或卡死，竖拍照片（高 > 宽，如 1080×1919）则正常。测试使用 `sharp` 库自动旋转横图后，20/20 全通过。

**要求**：`VolcengineVision` 的两个图片入口方法（`analyzeImage` / `reanswerWithImage`）在发送图片给方舟之前，必须做自动旋转预处理：

```ts
import sharp from 'sharp';

async function ensurePortrait(imageBuffer: Buffer): Promise<Buffer> {
  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  // 如果宽 > 高（横图），旋转 90° 为竖图
  if (meta.width && meta.height && meta.width > meta.height) {
    return img.rotate(90).jpeg({ quality: 90 }).toBuffer();
  }
  return imageBuffer;
}
```

**注意**：
- 仅在发送给 VLM 前旋转，**不修改原始文件**
- 旋转后重新编码为 JPEG（quality=90），文件大小基本不变
- `sharp` 已是项目依赖（通过 `test:all` 验证），无需新增依赖
- 测试脚本 `scripts/vlm-handheld-test.ts` 已有完整可运行的实现参考

**设计债**：当前仅在 VolcengineVision 内做旋转。如果未来需要支持更多图片预处理（去阴影、纠偏），建议抽取独立的 `ImagePreprocessor` 工具。

### 6.9 方舟 API 调用实证（已验证）

参考 `scripts/vlm-transcribe.ts:212-229`，方舟 API 与 OpenAI SDK 完全兼容：

```ts
const config: Config = {
  apiKey: process.env.VOLCENGINE_API_KEY,
  baseURL: process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
  model: resolvedModel,  // 即 PRO_ENDPOINT_ID
  // ...
};
// 用 new OpenAI({apiKey, baseURL}) 即可调用
```

本方案在此基础上加结构化 XML 输出 prompt，无新技术风险。

---

## 7. 执行顺序建议

```
T1 先验 ────────► (不通过 → 停)
        │
        └─(通过)─► T2 新建文件 ──► T5-1 单元测试
                                  │
                                  ├─► T3 路由切换 ──► T5-3 路由回归
                                  │
                                  └─► T4 配置同步 ──► T5-2 集成测试 ──► 审计
```

- T1 是硬门禁，必须先完成
- T2 / T4 可并行（一个写代码，一个改配置）
- T3 依赖 T2（要先有服务才能切）
- T5 各阶段对应插入到 T2/T3 之后

---

## 8. 计划完成判定

本计划完成 = 以下全部满足：

- [ ] T1 先验通过，决策记入 `DECISIONS.md`
- [ ] T2 新文件 `volcengine-vision.ts` 落地，含等效 `parseResponse` / `handleError`
- [ ] T3 两个路由切换完成（含 reanswer 双分支）
- [ ] T4 `.env.example` 补全，无硬编码 URL
- [ ] T5 单元测试 + 集成测试 + 路由回归全过
- [ ] 第 4 节验收标准全过
- [ ] commit 历史清晰，上游修改处标注 `⚠️上游文件修改`
- [ ] 交接 audit-agent 审计

---

> 计划产出者：plan-agent
> 等待用户确认后，方可进入 /execute 阶段。
