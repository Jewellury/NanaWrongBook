# 技术调研：如何在高中数学错题采集产品外「薄薄包一层豆包多模态」

> 目标场景：用户在手机浏览器拍一道数学题 + 录一段语音说思路 → 调用豆包/火山方舟 → 输出稳定的结构化 JSON（转写、题目摘要、知识点候选、温和反馈）用于落库和展示。
>
> 结论先行：**可以直接「包豆包」做第一版。** 火山方舟的豆包 Seed-2.0 全模态模型已经支持「图片 + 音频 + 文本提示词」同一次请求输入，OpenAI 兼容接口调用，能拿到结构化 JSON。第一版推荐**一体化多模态**方案，同时把「独立 ASR + 独立 VLM」的两步管线作为降级预案保留。
>
> 说明：本文所有型号、价格、限额均随平台快速迭代，落地前请以火山方舟控制台「模型列表 / 模型价格」和官方文档为准。文末附参考来源。

---

## 一、豆包 / 火山方舟能力边界

### 1. 哪些豆包模型支持图片输入？

支持图片输入的是**视觉/多模态理解系列**，主要包括：

| 模型系列 | 输入模态 | 关键特点 |
|---|---|---|
| **Doubao-Seed-2.0-lite / mini / pro（及 Seed 2.1）** | 文本 + 图片 + 视频 + **音频** | 豆包家族首个「全模态」统一理解模型，图片音频可同请求 |
| Doubao-Seed-1.6 / 1.6-vision | 文本 + 图片 + 视频 | 视觉深度思考、工具调用（缩放/框选/旋转），教育解题场景表现强 |
| Doubao-1.5-vision-pro / 1.5-thinking-vision-pro | 文本 + 图片 + 视频 | 支持任意分辨率/极端长宽比，文档识别、细节理解 |
| Doubao-vision-lite / pro | 文本 + 图片 | 轻量图文理解，性价比高 |

对本产品而言，**只要用 Seed-2.0 及以上的全模态型号，就同时满足图片和音频输入**；如果只用纯视觉型号（1.6-vision、1.5-vision-pro 等），则只能收图，收不了音频。

### 2. 哪些模型支持音频输入 / 语音识别？

这里要区分两条完全不同的产品线，别混淆：

- **方舟大模型「音频理解」（推荐用这条）**：Doubao-Seed-2.0 系列把音频作为**原生输入模态**，可在 Chat/Responses 接口里直接塞音频。官方称支持 19 种语言语音转写、中英文与其他 14 种语言互译，并能捕捉情绪起伏与环境背景声。公开评测里 ASR 指标处于第一梯队（如 LibriSpeech test-clean WER ≈ 1.07，优于 Whisper large-v3 公布值）。**对「转写学生 10 秒语音」这种需求完全够用。**
- **火山引擎「语音技术」独立 ASR/TTS（voice-tech 产品线）**：录音文件识别、一句话识别、流式识别等，**端点和方舟 Chat API 不同，需要单独开通**（不同的 appid/token）。适合做纯转写、需要精确时间戳、或作为方案 B 的降级 ASR。

### 3. 是否支持「图片 + 音频 + 文本提示词」同一次请求输入？

**支持。** 这正是 Seed-2.0 全模态模型的核心卖点——在一个 `messages`（或 Responses 的 `input`）里同时放文本、图片、音频多个 content item，模型做联合理解。**这是本产品选一体化方案的技术前提。**

### 4. 如果不能同请求输入，官方推荐怎么拆？

由于 Seed-2.0 已支持同请求多模态，一般无需强拆。但若你选的是纯视觉型号，或想要更可控的降级，官方与社区的常规做法是拆成 **ASR（语音→文本）+ VLM（图片→理解）** 两步，再把 ASR 得到的 transcript 作为文本上下文喂给 VLM。这也是本报告方案 B。

### 5. OpenAI Compatible API 是否支持多模态？message 格式？

**支持。** 方舟提供 OpenAI 兼容端点：

- Base URL：`https://ark.cn-beijing.volces.com/api/v3`
- 直接用 `openai` SDK，把 `base_url` 指过来、`api_key` 用方舟 `ARK_API_KEY` 即可。

多模态 message 用标准的 content 数组（OpenAI 风格）：

```jsonc
{
  "model": "doubao-seed-2.0-lite",   // 以控制台实际型号ID为准
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": [
        { "type": "text", "text": "提示词..." },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,....", "detail": "high" } },
        { "type": "input_audio", "input_audio": { "data": "<base64音频>", "format": "mp3" } }
    ]}
  ]
}
```

> 注意：音频 content item 的确切字段名（`input_audio` 内层用 `data`/`format`）请以官方「音频理解」文档为准，个别代理平台写法略有出入；图片 item 的 `detail` 可取 `high`/`low`。

### 6. 浏览器录音格式（webm/opus、mp4/aac、m4a、wav）是否支持？要转码吗？

官方「音频理解」明确列出的常见格式是 **mp3 / wav / m4a / flac**。

- **wav、m4a**：一般直接支持。
- **webm/opus（Chrome `MediaRecorder` 默认）、mp4/aac**：**不在明确支持列表内，建议转码**。浏览器端 `MediaRecorder` 在不同平台默认吐 `audio/webm;codecs=opus` 或 `audio/mp4`，因此**产品侧需要在上传前或服务端做一次转码到 wav/mp3/m4a**（服务端用 ffmpeg 最稳）。这是工程上最容易被坑的一点，务必在 Spike 里先验证。

### 7. 图片输入支持哪些方式？

三种方式：

1. **公网 URL**：`image_url.url` 传 `http(s)://...`（含 TOS/S3 预签名 URL）。
2. **Base64 / Data URL**：`image_url.url` 传 `data:image/jpeg;base64,....`。手机拍照直传最常用。
3. **Files API 先上传拿 file_id**：适合大图或复用；单文件最大 **512MB**，默认存 7 天（可配 1–30 天）。Responses API 里用 `input_image` + `file_id` 引用。

对本产品，**手机照片直接 Base64 内联**是最简单的第一版做法（照片一般压到几百 KB 内即可）。

### 8. 单次请求限额（图片大小/音频时长/token/文件大小）

| 维度 | 参考值（以控制台/官方文档为准） |
|---|---|
| 上下文窗口 | Seed-2.0/2.1 约 **256K tokens**，输出最大可达 128K；1.6-vision 系列 256K；1.5-vision-pro 128K |
| 图片（Files API） | 单文件最大 **512MB**；Base64 内联建议压到几百 KB～数 MB 以内以控延迟 |
| 音频时长 | 建议**单段 ≤ 30 分钟**以保证稳定；本产品 5–10 秒完全无压力 |
| 计费口径 | 音频/图片都会被编码成 token 计费（不是按秒/按张单独计），按 token 统一结算 |

---

## 二、结构化输出能力

### 1. 是否支持 JSON mode / response_format / tool calling / function calling？

- **JSON mode**：Chat API 支持 `response_format: { type: "json_object" }`，强制输出合法 JSON 对象。
- **严格 JSON Schema**：方舟有「**结构化输出（beta）**」，在 **Responses API** 下可按 JSON Schema 约束输出字段。
- **Function Calling / Tool Calling**：完整支持（`tools` 字段），可用 LangChain / OpenAI Agents SDK 等直接对接。

### 2. Node.js / TypeScript 调用格式

用官方 `openai` npm 包即可（示例见第六节伪代码）。核心是 `client.chat.completions.create({ model, messages, response_format: { type: "json_object" } })`。

### 3. 如果拿不到严格 JSON，社区常用什么办法稳定拿 JSON？

综合官方文档与社区实践，可靠度从高到低叠加使用：

1. **Prefill Response（官方推荐）**：把 `messages` 最后一条设为 `assistant` 且内容为 `"{"`，模型会顺着续写，直接吐 JSON 对象，跳过寒暄/markdown。
2. **`response_format: json_object`**：同时开启，双保险。
3. **`json_repair` 兜底（官方文档亲自演示）**：模型有随机性，无法 100% 保证可解析，用社区 `json_repair` 库对返回做修复解析。Node 侧可用 `jsonrepair` 包。
4. **提示词里给完整 schema + 1–2 个 few-shot 示例**，明确字段名、类型、必填、缺失时如何处理。

### 4. 如何处理 markdown code fence / 非法 JSON / 字段缺失 / nodeId 幻觉？

产品侧必须做一层「**清洗 + 校验**」：

- **code fence**：先 strip 掉 ```` ```json ```` 包裹（正则或找第一个 `{` 到最后一个 `}`）。
- **非法 JSON**：先 `JSON.parse`，失败则走 `jsonrepair` 再 parse，仍失败则触发一次「修复重试」（把坏输出回喂让模型只修 JSON），再失败则降级。
- **字段缺失 / 类型错误**：用 **zod / ajv** 按 schema 校验，缺失字段填默认值（如 `knowledgeCandidates: []`）。
- **知识点/nodeId 幻觉**：**关键**——不要让模型自由发明知识点 ID。做法：提示词里**给定知识点候选清单（枚举 label）**，让模型只从清单里选；返回后由产品侧再做一次「label → 你自己的 nodeId」映射，**幻觉 label 一律丢弃或标记为待人工确认**。

### 5. 有没有「多模态输入 → 结构化 JSON 输出」的官方/社区示例？

有，模式很成熟：社区大量用豆包视觉模型做「**图片 OCR → 提示词里定制格式 → 输出结构化 JSON**」（如发票/票据抽取），反馈是效果好、成本低。方舟 Responses API 官方实战（如「公司尽调 Dossier 生成器」）也演示了「检索 → 按 JSON Schema 严格输出 → 落库」的端到端范式。把「文本抽取」换成「图片+音频抽取」即为本产品。

---

## 三、推荐架构对比：方案 A（一体化） vs 方案 B（拆两条管线）

| 维度 | 方案 A：一体化多模态 Case Analyzer | 方案 B：ASR + VLM 两条管线 |
|---|---|---|
| **可行性** | 高，Seed-2.0 原生支持图+音+文同请求 | 高，但需接两套服务（语音技术 ASR + 方舟 VLM） |
| **稳定性** | 单次调用，链路短；但一次失败全失败 | 每步可独立重试；某步失败不牵连另一步 |
| **延迟** | 一次往返，通常更快（估 2–6s，开深度思考更久） | 两次往返（ASR + VLM），串行更慢；可并行部分环节 |
| **成本** | 一次请求，token 合并计费，通常更省 | 两次请求 + 两条产品线计费，略高 |
| **失败降级** | 粗粒度：整体失败只能整体重试/降级 | 细粒度：语音挂了仍能出图片结论，反之亦然 |
| **调试难度** | 低（一个 prompt、一份 JSON），但排查「是图错还是音错」较难定位 | 高一点（两套接口），但每段可单独观察，定位更清晰 |
| **第一版是否够简单** | ✅ 最简单，1 个接口 1 个 prompt | ❌ 要接 2 套、拼上下文，略重 |
| **扩展到深度诊断** | ✅ 天然适合（联合语音情绪+题图+思路一起推理） | 需要把两路结果再喂给一个分析模型，多一层 |

**结论：第一版用方案 A（一体化），把方案 B 当作降级/兜底能力保留。** 例如「一体化调用失败 / 音频转码异常」时，退化为「只跑 VLM 出题目+知识点，transcript 置空并提示用户」。

---

## 四、社区案例（含链接、可借鉴点、风险点）

> 均为官方文档或公开技术文章。代码片段为「核心思路摘要」，请以原文为准。

1. **豆包视觉做 OCR → 结构化 JSON（发票抽取）** — 火山引擎开发者社区
   链接：https://developer.volcengine.com/articles/7438453555541114931
   核心：视觉模型 + 提示词里定制输出格式（"organize into a structured JSON format"）即可把票据抽成结构化数据。
   借鉴：**提示词直接内嵌目标 JSON 格式**是最省事的结构化手段；成本远低于传统 OCR 服务。
   风险：字段一多容易漏/错，需产品侧 schema 校验。

2. **FastAPI + 豆包 doubao-seed-1-6 图片理解（Base64 + detail）** — 腾讯云社区
   链接：https://cloud.tencent.com/developer/article/2547376
   核心：`image_url` 传 `data:{mime};base64,{data}`，用 `detail: high/low` 控制理解精度；前端 HTML5 File API 上传、限制 5MB。
   借鉴：手机拍照 → Base64 内联的**完整前后端链路**可直接照抄。
   风险：Base64 让请求体很大，SSE 场景要改用 fetch POST（EventSource 只支持 GET）。

3. **豆包 API 识别图片文字（抽帧 + Base64 + 方舟 ChatCompletion）** — CSDN
   链接：https://blog.csdn.net/weixin_44786530/article/details/146113781
   核心：Python 组装「提示词 + 图像 Base64」调用方舟 ChatCompletion，视频先抽帧。
   借鉴：Base64 组装与调用样板；单图场景去掉抽帧即可。

4. **方舟 Responses API 实战：结构化 Dossier 生成器（JSON Schema 落库）** — CSDN / 火山 ADG
   链接：https://adg.csdn.net/696f4478437a6b403369cfc1.html
   核心：`web_search` 拉源 → 按 JSON Schema 严格输出 → `previous_response_id` 多轮。
   借鉴：**「严格 JSON Schema + 落库」的工程范式**，深度诊断阶段可复用。

5. **豆包 1.6 多模态解高考数理化带图大题** — 智源社区
   链接：https://hub.baai.ac.cn/view/46457
   核心：豆包 1.6 视觉深度思考在海淀模拟卷理科 706 分；具备图形题理解能力。
   借鉴：说明豆包**对数学题图的理解力足以支撑「判断知识点」这种轻任务**。

6. **6 大模型决战高考数学（含 OCR 识别问题）** — 知乎
   链接：https://zhuanlan.zhihu.com/p/1915181460853356065
   核心：豆包/元宝并列第一（93% 正确率）；**但实测发现部分模型对题图公式/几何识别出错**（DeepSeek 尤甚，需先转文本）。
   风险（重要）：**VLM 对数学公式、几何图的 OCR 保真度是主要坑**。

7. **PaddleOCR-VL（0.9B）图片公式 → LaTeX** — 火山 ADG 社区
   链接：https://adg.csdn.net/69532ece5b9f5f31781bb7ae.html
   核心：小模型把高考题图里的公式转成标准 LaTeX、几何图转 Base64 嵌 Markdown。
   借鉴：**若发现豆包对复杂公式识别不稳，可加一层专用 OCR→LaTeX 预处理**，再把结构化文本喂给豆包。这是方案 B 的一个强化变体。

---

## 五、最小 Spike（验证实验设计）

**输入**：1 张手机拍的数学题照片 + 1 段 5–10 秒学生语音 + 1 段要求返回 JSON 的提示词。

**步骤**：
1. 前端 `MediaRecorder` 录音 → **服务端 ffmpeg 转码到 mp3/wav**（先解决格式坑）。
2. 照片压缩到 ≤1MB → Base64。
3. 一次 `chat.completions.create` 同时塞 text + image_url + input_audio，`response_format: json_object` + prefill `{`。
4. 返回 → strip fence → `JSON.parse`／`jsonrepair` → zod 校验。

**要验证的 7 件事与判定标准**：

| # | 验证项 | 怎么看 / 通过标准 |
|---|---|---|
| 1 | 同请求处理图+音 | 返回里 transcript 和 questionSummary 同时有值即通过 |
| 2 | transcript 是否准确 | 人工对比 10 条语音，字准率主观 ≥90% |
| 3 | 题图理解是否靠谱 | questionSummary 是否说对了题目大意（**重点看含公式/几何的题**） |
| 4 | JSON 是否稳定 | 跑 50 次，可解析率目标 ≥98%（配 prefill+repair） |
| 5 | 延迟 | 记录端到端秒数，目标 P50 < 5s（可关深度思考提速） |
| 6 | 成本 | 见下方估算方法 |
| 7 | 失败降级 | 断网/坏音频/坏 JSON 三种注入，验证降级路径都走通 |

**成本估算方法**：单次成本约等于

\[
\text{Cost} \approx (T_{\text{img}} + T_{\text{audio}} + T_{\text{prompt}}) \times P_{\text{in}} + T_{\text{out}} \times P_{\text{out}}
\]

其中 \(T_{\text{img}}\)（一张压缩照片，几百～上千 token）、\(T_{\text{audio}}\)（10 秒语音编码后的 token）、\(T_{\text{out}}\)（一份 JSON，约 200–400 token）。以 lite 档「几元/百万输入 token」量级估，**单次通常在几分钱人民币级别**。务必在控制台「账单/用量」里读**真实 token 数**再换算，别拍脑袋。

---

## 六、最终输出（可落地）

### 1. 能不能直接「包豆包」做第一版？

**能。** 图+音+文同请求 + OpenAI 兼容 + JSON 输出这三件事全部具备，第一版就是「一个后端接口薄薄封一层」。

### 2. 推荐方案

**一体化多模态（方案 A）为主，ASR+VLM（方案 B）为降级兜底。**

### 3. 推荐模型与 endpoint 配置

- **主模型**：`Doubao-Seed-2.0-lite`（全模态、性价比高；型号 ID 以控制台为准，可能形如 `doubao-seed-2-0-lite-*`）。需要更强题图理解时切 `Doubao-Seed-2.0-pro` 或 `Doubao-Seed-1.6`。
- **Endpoint**：`https://ark.cn-beijing.volces.com/api/v3`（Chat 兼容）或 `/responses`（Responses API，走严格 Schema 时用）。
- **鉴权**：`Authorization: Bearer $ARK_API_KEY`。
- **降级 ASR（可选）**：火山引擎「语音技术」录音文件识别（单独开通）。

### 4. Node.js / TypeScript 伪代码

```typescript
import OpenAI from "openai";
import { z } from "zod";
import { jsonrepair } from "jsonrepair";

const ark = new OpenAI({
  apiKey: process.env.ARK_API_KEY!,
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
});

// 与产品侧知识点库对齐的候选清单（防幻觉）
const KNOWLEDGE_LABELS = ["函数与导数", "三角函数", "数列", "立体几何",
  "解析几何", "概率统计", "不等式", "向量" /* ... */];

const Schema = z.object({
  transcript: z.string(),
  questionSummary: z.string(),
  knowledgeCandidates: z.array(z.object({
    label: z.enum(KNOWLEDGE_LABELS as [string, ...string[]]),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
  studentFacingFeedback: z.string(),
});

export async function analyzeCase(imageB64: string, audioB64: string) {
  const resp = await ark.chat.completions.create({
    model: "doubao-seed-2.0-lite",          // 以控制台实际 ID 为准
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT(KNOWLEDGE_LABELS) },
      { role: "user", content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}`, detail: "high" } },
          { type: "input_audio", input_audio: { data: audioB64, format: "mp3" } },
      ]},
      { role: "assistant", content: "{" },   // prefill，引导直接吐 JSON
    ],
  });

  let raw = "{" + (resp.choices[0].message.content ?? "");
  raw = stripCodeFence(raw);
  let obj: unknown;
  try { obj = JSON.parse(raw); }
  catch { obj = JSON.parse(jsonrepair(raw)); }   // 兜底修复

  const parsed = Schema.safeParse(obj);
  if (!parsed.success) return fallback(obj);      // 校验失败 → 降级
  return mapLabelsToNodeIds(parsed.data);         // label → 自己的 nodeId
}
```

### 5. Prompt 模板

```text
【System】
你是高中数学错题采集助手。你的唯一任务是把「一张题目照片」和「一段学生语音」转成结构化 JSON，不要解题，不要长篇大论。

规则：
1. 先转写学生语音为 transcript（口语，允许保留"嗯/然后"等）。
2. 用一句话概括题目大意 questionSummary（若公式看不清就描述可见部分，不要编造）。
3. 从下面固定知识点清单里选出最多 3 个相关知识点，禁止发明清单外的名称：
   {{KNOWLEDGE_LABELS}}
   每个给 confidence(0~1) 和一句 reason。
4. 给一句温和、鼓励式的 studentFacingFeedback（面向学生，不透露答案对错，不批评）。
5. 只输出 JSON，不要 markdown 代码块，不要多余文字。

【User】
请分析这道题的照片和这段语音，按下面 JSON 结构返回：
{
  "transcript": "",
  "questionSummary": "",
  "knowledgeCandidates": [{"label": "", "confidence": 0.0, "reason": ""}],
  "studentFacingFeedback": ""
}
```

### 6. JSON Schema 示例

```json
{
  "type": "object",
  "required": ["transcript", "questionSummary", "knowledgeCandidates", "studentFacingFeedback"],
  "additionalProperties": false,
  "properties": {
    "transcript": { "type": "string" },
    "questionSummary": { "type": "string" },
    "knowledgeCandidates": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["label", "confidence", "reason"],
        "additionalProperties": false,
        "properties": {
          "label": { "type": "string", "enum": ["函数与导数", "三角函数", "数列", "立体几何", "解析几何", "概率统计", "不等式", "向量"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "reason": { "type": "string" }
        }
      }
    },
    "studentFacingFeedback": { "type": "string" }
  }
}
```

> 走 Responses API 的「结构化输出(beta)」时，把上面这段作为 `json_schema` 传入即可获得更强约束。

### 7. 风险清单

| 风险 | 说明 | 缓解 |
|---|---|---|
| **公式/几何 OCR 出错** | 实测多家 VLM 对数学公式、几何图识别易错（最大坑） | 题图压缩别过度；`detail: high`；必要时加 PaddleOCR-VL 转 LaTeX 预处理；questionSummary 允许「看不清则描述」 |
| **浏览器录音格式** | webm/opus、mp4/aac 不在官方支持列表 | 服务端 ffmpeg 统一转码 wav/mp3 |
| **JSON 不稳定** | 模型随机性，偶发非法 JSON / 多字段 | prefill `{` + json_object + jsonrepair + zod 三层兜底 |
| **知识点幻觉** | 模型发明清单外知识点/编造 nodeId | 提示词固定枚举 + 产品侧 label→nodeId 映射，越界丢弃 |
| **深度思考拖慢延迟** | thinking 开启后响应变长 | 第一版关闭深度思考或限制 budget；低延迟推理档 |
| **型号/价格漂移** | 平台高频迭代，ID/价可能变 | 配置化 model 别名；上线前核对控制台；做灰度回滚 |
| **温和反馈越界** | 模型可能给出评判/答案 | 提示词明确「不解题、不判对错、鼓励式」；必要时加审核 |
| **成本失控** | 图/音都计 token，量大时累积 | 读真实 token 估算；批量推理/上下文缓存降本；限制图片尺寸 |
| **隐私合规** | 学生语音+人脸/笔迹可能涉未成年人数据 | 明确同意、脱敏、存储期限、按规留存 |

### 8. 需要产品侧自己做的事

模型只负责「输入 → 一坨 JSON」，以下**必须由产品工程侧承担**：

1. **音频转码**：MediaRecorder 输出 → wav/mp3（ffmpeg）。
2. **图片预处理**：压缩、旋转纠偏、大小限制、Base64。
3. **JSON 清洗与校验**：strip fence → parse/repair → zod/ajv schema 校验 → 缺省填充。
4. **知识点映射**：把模型选的 `label` 映射到你自己的知识点树 `nodeId`，越界项丢弃或标「待人工确认」。
5. **落库**：原始图/音、transcript、结构化结果、模型版本、置信度、耗时、成本，全部留痕（便于回溯与评测）。
6. **失败提示与降级**：转码失败/模型失败/JSON 失败各自的用户文案与降级路径（如只出题目不出转写）。
7. **人工修正闭环**：低置信度或校验失败的 case 进人工队列；人工修正结果回流做评测集/微调数据。
8. **评测集**：攒一批「题图+语音+人工标注知识点」的 golden set，持续回归模型换版效果。

---

## 参考来源

- 火山方舟文档中心（模型列表 / 音频理解 / 图片理解 / 多模态理解 / 结构化输出 / 续写模式）：https://www.volcengine.com/docs/82379
- 豆包大模型产品页：https://www.volcengine.com/product/doubao ；火山引擎语音技术：https://www.volcengine.com/product/voice-tech
- 火山引擎方舟 API 平台深度调研（花叔）：https://www.huasheng.ai/insights/volcengine-ark-api-guide/
- Seed-2.0-lite 全模态（含 input_audio 用法、audio 基准）：https://help.apiyi.com/en/seed-2-0-lite-260428-omnimodal-guide-en.html
- 豆包 1.6 全模态发布报道：https://readhub.cn/topic/8sueYGU4S0I ；https://www.gzsouth.cn/news/266.html
- Responses API 结构化落库实战：https://adg.csdn.net/696f4478437a6b403369cfc1.html
- 豆包视觉 OCR→JSON：https://developer.volcengine.com/articles/7438453555541114931
- FastAPI+豆包图片理解：https://cloud.tencent.com/developer/article/2547376
- 高考数学实测（OCR 风险）：https://zhuanlan.zhihu.com/p/1915181460853356065
- PaddleOCR-VL 公式→LaTeX：https://adg.csdn.net/69532ece5b9f5f31781bb7ae.html

> 免责声明：本文为技术调研，非法律/采购建议。型号、限额、价格与合规要求以火山方舟官方最新文档和你所在地区法规为准。
