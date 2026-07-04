# Stage 3：真实 AI 接入最小闭环 · 开发计划

> 关联规格: [doc/plan/capture-map-v1-plan.md](capture-map-v1-plan.md)（§4 Stage 3）
> 关联参考: [doc/reference/TECH_PLAN_v2.md](../reference/TECH_PLAN_v2.md)（§AI 管线、P1-P5）、[doc/reference/OPS_handbook.md](../reference/OPS_handbook.md)（§4 措辞铁律）
> 关联先例: [scripts/vlm-transcribe.ts](../../scripts/vlm-transcribe.ts)（离线脚本已验证 ASR+VLM 双能力）
> 计划日期: 2026-07-04
> 计划者: plan-agent
> 边界: **最小闭环**——ASR 转写、VLM/LLM 轻分类、初步反馈。**不做深度诊断、不做 Newman 归因、不写 StudentNodeState、不让节点变绿。**

---

## 0. 大白话概述

**要做什么**：用户拍题 + 录音保存后，点一下"看看这道题"按钮，后台真实调两个 AI：
1. **录音 → 文字**（ASR，火山方舟豆包 Lite，已验证可转写音频）
2. **题图 → 候选知识点**（VLM 轻分类，火山方舟豆包 Pro，只做"大致属于哪几个知识点"，不做深度归因）

结果回写数据库：
- 转写文字替换掉 transcript artifact 里的"尚未转写"
- 候选知识点写入 CaseKnowledgeTag（source="vlm", confidence=模型给的置信度）
- 知识地图上对应节点出现"收过题"琥珀色反馈（已有逻辑，`caseEvidenceCount > 0` 即可）

**不做什么**：
- 不做深度诊断（Newman 归因、探针下探、BKT 更新）
- **不写 StudentNodeState**——节点状态不变，不会从"未探索"变绿
- 不做流式 ASR（文件式够用）
- 不做整卷转写（单题轻分类，不是 M3 转写）
- 不阻塞 `POST /cases`（createCase 只保存，AI 由显式 `/process` 触发）

---

## 1. 现有代码盘点（方案前提）

逐文件读过源码后的真实状态，确认方案建立在已有基础上：

### 1.1 已就绪（不动）

| 组件 | 文件 | 状态 | 说明 |
|------|------|:--:|------|
| Case 创建 | `src/app/api/nana/cases/route.ts` | ✅ | POST 保存 artifacts，返回 201+caseId。**不改动** |
| Case 读取 | `src/app/api/nana/cases/[id]/route.ts` | ✅ | findFirst 归属校验。**不改动** |
| Tags API | `src/app/api/nana/cases/[id]/tags/route.ts` | ✅ | GET/POST tags，source 恒 manual（服务端硬编码）。**不改动** |
| Case 列表 | `src/app/api/nana/cases/route.ts` GET | ✅ | 返回 tagCount/tagStatus/transcriptReady（当前恒 0/untagged/false）。Stage 3 扩展返回真实值 |
| 分类骨架 | `src/lib/nana/case-classify.ts` | ✅ | classifyCase 当前诚实返回 pending。Stage 3 替换为真实 VLM |
| 知识地图 API | `src/app/api/diagnosis/map/route.ts` | ✅ | 已有 `caseEvidenceCount`（groupBy CaseKnowledgeTag）。**修订 v2：需改为 distinct caseId 计数** |
| 知识地图 UI | `knowledge-map-list-view.tsx` | ✅ | 已有"收过题"琥珀分组（caseEvidenceCount > 0）。**VLM 写 tag 后自动出现琥珀** |
| 前端 API 客户端 | `src/lib/nana/nana-api-client.ts` | ✅ | createCase/getCase/listCaseTags/tagCaseManually 齐全。Stage 3 加 processCase |
| VLM 离线脚本 | `scripts/vlm-transcribe.ts` | ✅ | 已验证 vision(doubao-seed-2-0-pro) + audio(doubao-seed-2-0-lite) 双能力，走同一套 OpenAI 兼容接口 + VOLCENGINE_API_KEY |

### 1.2 需新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/nana/asr-transcribe.ts` | **新增** | ASR 薄封装：audio Base64 → 文字 |
| `src/lib/nana/vlm-classify.ts` | **新增** | VLM 轻分类封装：题图 Base64 → 候选知识点 |
| `src/lib/nana/transcript-utils.ts` | **新增** | `isPlaceholderTranscript(content)` helper |
| `src/app/api/nana/cases/[id]/process/route.ts` | **新增** | /process 端点，同步跑 ASR+VLM，独立 try/catch |
| `src/lib/nana/case-classify.ts` | **修改** | classifyCase 接真 VLM 分支 + source 白名单收窄为 manual+vlm |
| `src/app/api/nana/cases/route.ts` | **修改** | GET 列表扩展返回真实 tagCount/tagStatus/transcriptReady |
| `src/lib/nana/nana-api-client.ts` | **修改** | 加 processCase(id) |
| `src/app/nana/capture/page.tsx` | **修改** | 保存成功后显示"识别中"→调 /process→显示结果 |
| `src/components/nana/capture/transcription-panel.tsx` | **修改** | editable=true 时显示真实转写 + "仅供参考" |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | **修改** | 列表显示 VLM 标签 + 候选标签可手动确认/修正 |
| `.env.example` | **修改** | 追加 VOLCENGINE_* 变量说明（⚠️上游文件，最小增量） |

---

## 2. ASR 管线：audio_note → transcript artifact

### 2.1 数据流

```
audio_note artifact (Base64 webm/mp4)
    │
    ├─ 提取 mime（从 audio_meta artifact 解析 `mime=xxx`）
    │
    ▼
asr-transcribe.ts
    ├─ 构造 OpenAI client（VOLCENGINE_API_KEY + VOLCENGINE_BASE_URL）
    ├─ 调 doubao-seed-2-0-lite-260215（LITE_ENDPOINT_ID 优先）
    │   messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: base64, format: "wav" } }] }]
    │   （豆包 Lite 全模态，支持音频输入，OpenAI 兼容接口）
    ├─ 超时 30s（AbortController）
    └─ 返回 { transcript: string; confidence?: number }
    │
    ▼
更新 transcript artifact content（替换"尚未转写"）
    ├─ prisma.artifact.update({ where: { caseId_type_seq: { caseId, type: "transcript", seq } }, data: { content: transcript } })
    └─ 若无 transcript artifact（边界情况），create 一条
```

### 2.2 ASR lib 契约（`src/lib/nana/asr-transcribe.ts`）

```typescript
export interface AsrInput {
  audioBase64: string;      // 不含 data: 前缀的纯 Base64
  mime: string;             // "audio/webm" | "audio/mp4" | ...
}

export interface AsrResult {
  transcript: string;       // 转写文本
  confidence?: number;      // 模型返回的置信度（如有）
}

export class AsrError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AsrError";
  }
}

export class AsrTimeoutError extends AsrError {
  constructor() {
    super("ASR 转写超时（30s）");
    this.name = "AsrTimeoutError";
  }
}

export class AsrUnsupportedFormatError extends AsrError {
  constructor(mime: string) {
    super(`不支持的音频格式: ${mime}`);
    this.name = "AsrUnsupportedFormatError";
  }
}

/**
 * 调火山方舟豆包 Lite 做音频转写。
 * - 支持 webm/ogg/mp4/wav/m4a
 * - 超时 30s
 * - 失败 throw AsrError（由调用方 catch，不静默）
 */
export async function asrTranscribe(input: AsrInput): Promise<AsrResult>;
```

### 2.3 关键实现决策

**DP-ASR-1：文件式而非流式**
- 采集壳录音 ≤60s，整文件提交一次即可，不需要实时流式
- 豆包 Lite 的 OpenAI 兼容接口支持 `input_audio` 类型，直接塞 Base64

**DP-ASR-2：mime 支持白名单 + 预验证**
- 浏览器 MediaRecorder 探测到的格式：`audio/webm`（Chrome/Firefox）、`audio/mp4`（Safari）
- 白名单：`["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/m4a"]`
- 不在白名单的 → throw `AsrUnsupportedFormatError`，UI 显示"音频格式暂不支持转写"
- **修订 v2（预验证）**：执行前先用真实浏览器录音产物（webm/mp4）验证豆包 Lite 是否支持。
  - 验证方法：用浏览器录一段 5s 音频，导出 webm/mp4 Base64，调豆包 Lite API 看是否正常返回转写。
  - 若 webm **不支持** → v1 明确降级为"语音暂未转写"，ASR 管线直接 skipped，不临时补大范围转码。
  - 若 webm **支持** → 正常走 ASR 管线。
  - 验证结果记录在执行日志中。

**DP-ASR-3：transcript 回写策略（isPlaceholderTranscript helper）**
- 新增 `isPlaceholderTranscript(content: string): boolean` helper，匹配现有占位文案
- 当前占位文案为 `"尚未转写"`（见 `capture/page.tsx` 第 149 行），helper 检查 `content.trim() === "尚未转写"`
- 找到该 case 的 `type="transcript"` artifact（seq 最小那条），仅当 `isPlaceholderTranscript(content)` 为 true 时才覆盖
- 若已有人工内容（非占位）→ 跳过（守 P1：人 > AI）
- **ASR 返回空字符串 → 不覆盖**：保留占位文案，`asrStatus` 仍为 `success`，但 `transcript` 字段不返回、`transcriptReady` 不置 true
- 若不存在 transcript artifact（理论上不会，createCase 恒创建），`create` 一条

### 2.4 豆包 Lite 音频调用格式

豆包 Seed 2.0 Lite 支持 OpenAI 兼容接口的音频输入。参考 `scripts/vlm-transcribe.ts` 的 audio 任务模式：

```typescript
const client = new OpenAI({
  apiKey: process.env.VOLCENGINE_API_KEY,
  baseURL: process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
});

const response = await client.chat.completions.create({
  model: process.env.LITE_ENDPOINT_ID || process.env.LITE_MODEL_NAME || "doubao-seed-2-0-lite-260215",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "请把这段语音转写成文字，只输出转写结果，不要加任何解释。" },
      { type: "input_audio", input_audio: { data: audioBase64, format: "wav" } },
    ],
  }],
  max_tokens: 2048,
});
```

> **注意**：豆包 Lite 的 `input_audio.format` 字段接受 `wav`/`mp3`/`flac`/`ogg`/`m4a`/`aac` 等格式。webm 是否支持需预验证（见 DP-ASR-2）。**v1 不临时补转码**——若 webm 不支持，ASR 管线降级为 skipped，UI 显示"语音暂未转写"。

---

## 3. VLM/LLM 管线：question_image → 候选 KnowledgeNode

### 3.1 数据流

```
question_image artifact (Base64 JPEG/PNG)
    │
    ▼
vlm-classify.ts
    ├─ 构造 OpenAI client（VOLCENGINE_API_KEY + VOLCENGINE_BASE_URL）
    ├─ 调 doubao-seed-2-0-pro-260215（PRO_ENDPOINT_ID 优先）
    │   messages: [{
    │     role: "user",
    │     content: [
    │       { type: "text", text: CLASSIFY_PROMPT },
    │       { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }
    │     ]
    │   }]
    ├   提示词约束：只做轻分类（DP6），输出 JSON
    ├─ 超时 30s
    └─ 返回 { candidates: [{ nodeId, confidence, reason }], rawHint }
    │
    ▼
写入 CaseKnowledgeTag（source="vlm", confidence, note=reason）
    ├─ confidence >= 0.5 → 自动挂
    ├─ confidence < 0.5 → 不挂，仅在 /process 即时响应中返回（不持久化）
    └─ 失败 → 不写假标签（铁律 6）
```

> **修订 v2**：VLM **只看题图**，不接收 transcript。ASR 和 VLM 两条管线完全独立，互不传参。

### 3.2 VLM 分类提示词（DP6 边界：只做轻分类）

```
你是数学知识图谱分类助手。请看这道数学题的图片，判断它大致属于以下哪些知识点。

【知识点列表】
（从 KnowledgeNode 表拉取 48 个节点的 id + name，注入提示词）

【你的任务】
1. 看图片中的题目，判断它考查的是哪些数学知识点
2. 从上面的列表中选出 1-3 个最相关的知识点
3. 给每个候选一个 0-1 的置信度（你有多确定这题考这个点）
4. 用一句话说明理由

【纪律】
- 只做"大致属于哪几个知识点"的判断
- 不做深度归因（不判断学生为什么做错）
- 不解题、不给答案
- 如果图片不清晰或不是数学题，返回空列表
- 如果题目跨多个知识点，最多给 3 个候选

【输出格式（严格 JSON）】
{
  "candidates": [
    { "nodeId": "M2a-03", "confidence": 0.8, "reason": "题目涉及一次函数图像" },
    { "nodeId": "M2a-05", "confidence": 0.6, "reason": "涉及定义域判断" }
  ]
}
```

### 3.3 VLM lib 契约（`src/lib/nana/vlm-classify.ts`）

```typescript
export interface VlmClassifyInput {
  imageBase64: string;        // 含 data:image/...;base64, 前缀的完整 Data URL
  nodes: { id: string; name: string }[];  // 48 个知识点列表
}

export interface VlmCandidate {
  nodeId: string;
  confidence: number;
  reason: string;
}

export interface VlmClassifyResult {
  candidates: VlmCandidate[];
  rawHint?: string;           // 模型原始输出（调试用）
}

export class VlmError extends Error { ... }
export class VlmTimeoutError extends VlmError { ... }
export class VlmEmptyResultError extends VlmError { ... }

/**
 * 调火山方舟豆包 Pro 做单题轻分类。
 * - 输入：题图 Base64 + 可选 transcript + 48 节点列表
 * - 输出：1-3 个候选知识点 + 置信度 + 理由
 * - 超时 30s
 * - 失败 throw VlmError（不静默）
 */
export async function vlmClassify(input: VlmClassifyInput): Promise<VlmClassifyResult>;
```

### 3.4 关键实现决策

**DP-VLM-1：提示词注入节点列表**
- 每次调用 VLM 前从 KnowledgeNode 表拉取全量 48 节点（id + name），注入提示词
- VLM 只能从列表里选，不能自创 nodeId（防脏挂）
- 返回结果后服务端再校验一遍 nodeId 是否存在于表中（防 VLM 幻觉）

**DP-VLM-2：confidence 阈值**
- `confidence >= 0.5` → 自动挂 `CaseKnowledgeTag(source="vlm")`
- `confidence < 0.5` → **不自动挂，也不持久化**，仅在 /process 即时响应中返回 `vlmCandidates`，前端即时展示后刷新即失
- 阈值 0.5 是初始值，后续根据真实数据调整
- 若需持久化低置信候选，需单独设计（如新增 `CaseVlmCandidate` 表），不混入 v1

**DP-VLM-3：VLM 不接收 transcript**
- VLM **只看题图**，不接收学生口述 transcript
- ASR 和 VLM 两条管线完全独立，互不传参，各自 try/catch
- 理由：v1 最小闭环，避免两条管线产生耦合；transcript 的作用是展示给学生看，不是给 VLM 当输入

**DP-VLM-4：VLM 输出 JSON 解析**
- 豆包 Pro 输出可能带 markdown 代码块包裹（```json ... ```），需 strip
- 解析失败 → throw VlmError，不写假标签
- 候选 nodeId 不在 48 节点列表里 → 过滤掉，不写

---

## 4. 写入策略：CaseKnowledgeTag

### 4.1 source/confidence/note 定义

| source | 含义 | confidence | note | 写入时机 |
|--------|------|-----------|------|----------|
| `manual` | 人工挂载 | 1.0 | 用户备注（可选） | 用户在 UI 手动选知识点（已有，Stage 2） |
| `vlm` | VLM 自动挂 | 模型给的 0-1 | VLM 的理由 | /process 端点 VLM 成功 + confidence >= 0.5 |

> **修订 v2**：source 白名单**只保留 `manual` 和 `vlm`**，移除 `asr`/`rule`/`pending`。
> 需同步修改 `src/lib/nana/case-classify.ts` 的 `ALLOWED_SOURCES` 和 `TagSource` 类型，
> 以及 `prisma/schema.prisma` 中 `CaseKnowledgeTag.source` 字段注释（仅注释，零结构改动）。
> ASR 不挂 tag，只回写 transcript artifact；`pending` 由“无 tag”表达（Stage 2 设计决策不变）。

### 4.2 唯一约束处理

`CaseKnowledgeTag` 有 `@@unique([caseId, nodeId, source])`：
- VLM 挂同一节点：重复 /process 不会报错（upsert 或先查再写）
- VLM 和 manual 挂同一节点：两条记录（source 不同），都保留
- 实现用 `prisma.caseKnowledgeTag.upsert`（where 唯一约束，create + update confidence/note）

### 4.3 回写流程

```
/process 端点内：
  1. VLM 返回 candidates
  2. 过滤：confidence >= 0.5 且 nodeId 在 KnowledgeNode 表存在
  3. 对每个候选：upsert CaseKnowledgeTag(caseId, nodeId, source="vlm", confidence, note=reason)
  4. 返回前端：已挂的 tags + 低置信候选（仅即时响应，不持久化）
```

> **修订 v2**：低置信候选（confidence < 0.5）**不持久化**，仅在 /process 即时响应中返回。
> 前端在保存后的即时结果中可展示“AI 觉得可能属于：XXX”，但**最近题列表/知识地图后续不会展示**
> （因为没写库，刷新后消失）。若需持久化低置信候选，需单独设计（如新增 `CaseVlmCandidate` 表），
> 不混入 v1 最小闭环。

---

## 5. 异步触发方式：POST /api/nana/cases/:id/process

### 5.1 架构选型（DP7 落地）

```
① POST /api/nana/cases  → 保存 artifacts，返回 201 + caseId（不跑 AI）
② 前端保存成功 → 显式调 POST /api/nana/cases/:id/process
③ /process 同步执行 ASR + VLM（两条独立 try/catch，各自 30s 超时）
④ /process 始终返回 200 + { asrStatus, vlmStatus, ... }（无论成功/失败/超时）
⑤ 前端收到结果 → 更新 UI
```

**为什么不用 fire-and-forget**：Next.js API route 在生产容器/serverless 下，响应返回后 handler 可能被终止。显式 /process + 前端等待是最可靠的 v1 方案。

**为什么不用队列/WebSocket**：v1 量级小（单用户），AI 调用 ~10-30s，同步等够用。队列是后续高并发增强。

> **修订 v2**：去掉 202 后台轮询设计。v1 没有队列/任务表/worker，不能承诺返回后后台继续跑。
> /process 始终同步返回 200，超时也返回 200 + `status="timeout"`。用户可重试。
> 两条管线并行执行（`Promise.allSettled`），总等待时间 ≤ 30s（两条同时跑，取最长者）。

### 5.2 /process 端点契约

```
POST /api/nana/cases/:id/process

鉴权: NextAuth session（沿用 G1 归属校验）
归属: findFirst({ where: { id, studentId: session.user.id } })，不满足 → 404

请求体: 无（caseId 从 URL 取，artifacts 从 DB 读）

响应 (200 — 始终返回):
{
  asrStatus: "success" | "failed" | "skipped" | "timeout",
  vlmStatus: "success" | "failed" | "skipped" | "timeout",
  transcript?: string,           // ASR 成功且非空时返回转写文本
  tags: CaseKnowledgeTag[],      // VLM 成功时返回已挂标签
  vlmCandidates?: VlmCandidate[],// VLM 低置信候选（仅即时展示，不持久化）
  error?: {
    asr?: string,                // ASR 失败/超时原因
    vlm?: string,                // VLM 失败/超时原因
  }
}

错误:
  401 — 未授权
  404 — case 不存在或不属于当前用户
  500 — 内部错误

> **修订 v2**：无 202 响应。超时也返回 200 + `status="timeout"`，用户可重试。
> 无 409 幂等保护（v1 允许重复 process）。
```

### 5.3 执行流程

```typescript
// /process 端点核心逻辑伪代码
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;
  const case_ = await prisma.case.findFirst({
    where: { id, studentId: session.user.id },
    include: { artifacts: true },
  });
  if (!case_) return notFound();

  // 幂等检查（可选）：已有 vlm tag 且 transcript 不含"尚未转写"→ 返回已有结果
  // v1 先不做幂等，允许重复 process

  const artifacts = case_.artifacts;
  const audioNote = artifacts.find(a => a.type === "audio_note");
  const audioMeta = artifacts.find(a => a.type === "audio_meta");
  const questionImage = artifacts.find(a => a.type === "question_image");
  const transcriptArt = artifacts.find(a => a.type === "transcript");

  let asrStatus = "skipped";
  let vlmStatus = "skipped";
  let transcript: string | undefined;
  let tags: CaseKnowledgeTag[] = [];
  let vlmCandidates: VlmCandidate[] | undefined;
  const errors: { asr?: string; vlm?: string } = {};

  // ── ASR 管线（独立 try/catch）──
  if (audioNote) {
    try {
      const mime = parseMimeFromMeta(audioMeta?.content);
      const audioBase64 = stripDataPrefix(audioNote.content);
      const result = await withTimeout(asrTranscribe({ audioBase64, mime }), 30000);
      // 回写 transcript artifact（仅当原内容是占位文本，且 ASR 结果非空）
      if (transcriptArt && isPlaceholderTranscript(transcriptArt.content) && result.transcript.trim() !== "") {
        await prisma.artifact.update({
          where: { id: transcriptArt.id },
          data: { content: result.transcript },
        });
      }
      // ASR 返回空字符串 → 不覆盖占位文本，asrStatus 仍为 success 但 transcript 不回写
      transcript = result.transcript.trim() !== "" ? result.transcript : undefined;
      asrStatus = "success";
    } catch (e) {
      asrStatus = e instanceof AsrTimeoutError ? "timeout" : "failed";
      errors.asr = e instanceof Error ? e.message : String(e);
      logger.error({ caseId: id, error: e }, "ASR 失败");
    }
  }

  // ── VLM 管线（独立 try/catch，不接收 transcript）──
  if (questionImage) {
    try {
      const nodes = await prisma.knowledgeNode.findMany({ select: { id: true, name: true } });
      const vlmResult = await withTimeout(
        vlmClassify({
          imageBase64: questionImage.content,
          nodes,
        }),
        30000
      );

      // 挂高置信标签
      const autoTags = vlmResult.candidates.filter(c => c.confidence >= 0.5);
      for (const c of autoTags) {
        await prisma.caseKnowledgeTag.upsert({
          where: { caseId_nodeId_source: { caseId: id, nodeId: c.nodeId, source: "vlm" } },
          create: { caseId: id, nodeId: c.nodeId, source: "vlm", confidence: c.confidence, note: c.reason },
          update: { confidence: c.confidence, note: c.reason },
        });
      }
      tags = await listTagsForCase(id, session.user.id);
      vlmCandidates = vlmResult.candidates.filter(c => c.confidence < 0.5);
      vlmStatus = "success";
    } catch (e) {
      vlmStatus = e instanceof VlmTimeoutError ? "timeout" : "failed";
      errors.vlm = e instanceof Error ? e.message : String(e);
      logger.error({ caseId: id, error: e }, "VLM 失败");
    }
  }

  return NextResponse.json({
    asrStatus, vlmStatus, transcript, tags, vlmCandidates,
    error: Object.keys(errors).length > 0 ? errors : undefined,
  });
}
```

### 5.4 超时与重试

- 每条管线独立 30s 超时（`AbortController` + `setTimeout`）
- 两条管线并行执行（`Promise.allSettled`），总等待时间 ≤ 30s（取最长者）
- 超时返回 200 + `status="timeout"`，用户可重试（/process 允许重复调用）
- **无轮询**：v1 不承诺后台继续跑，超时即结束，用户手动重试

---

## 6. 前端状态

### 6.1 采集页状态机扩展

当前 saveState: `idle → saving → saved → error`

Stage 3 扩展为：

```
idle
  → saving (POST /cases)
  → saved (201，caseId 返回)
  → processing (调 POST /cases/:id/process，同步等待)
  → processed (收到 200 结果)
    ├─ asr_success + vlm_success → "转写好了 · 可能属于：XXX"
    ├─ asr_success + vlm_failed → "转写好了 · 分类没接上，可以手动挂"
    ├─ asr_failed + vlm_success → "转写没接上 · 可能属于：XXX"
    ├─ asr_failed + vlm_failed → "识别没接上，可以手动整理"（不假装，铁律 6）
    ├─ asr_timeout / vlm_timeout → "识别超时了，可以重试或手动整理"
    └─ 无音频 + vlm_success → "可能属于：XXX"（无 ASR）
  → error (/process 调用失败)
```

### 6.2 UI 文案（守 OPS §4 措辞铁律）

| 状态 | 文案 | 备注 |
|------|------|------|
| saving | "正在收…" | 已有 |
| processing | "正在看看这题大致属于哪…" | 不说"正在诊断" |
| asr+vlm 成功 | "转写好了 · 可能属于：一次函数图像" | "可能"留余地 |
| 仅 ASR 成功 | "转写好了 · 分类没接上，可以手动挂" | 不假装 |
| 仅 VLM 成功 | "可能属于：一次函数图像" | 无转写不提 |
| 均失败 | "识别没接上，可以手动整理" | 不假装 |
| 超时 | "识别超时了，可以重试或手动整理" | 不阻塞用户，可重试 |
| 低置信 | "不太确定，先放未分类" | 不硬塞，即时展示后刷新即失 |

**禁用词**：诊断/已诊断/薄弱/得分/掌握/失败（用"没接上"代替"失败"）

### 6.3 "我的话" tab 升级

- `transcript` artifact content 不再是"尚未转写" → `TranscriptionPanel` 切到 `editable=true`
- 显示真实转写文本 + 底部标注"转写仅供参考，原音为准"（守 P1：音为真相源）
- 原音回放：在转录面板下方加 `<audio controls>` 标签，src 用 audio_note 的 Base64

### 6.4 知识地图列表升级

`recent-cases-list.tsx` 的 `CaseTagPanel`：
- 已有 VLM 标签（source="vlm"）→ 显示节点名 chip + "AI 候选"小角标
- 已有 manual 标签（source="manual"）→ 显示节点名 chip + "手动"小角标（已有）
- 用户可手动修正：挂 manual 标签（与 VLM 标签并存，source 不同不冲突）
- **低置信候选不在此展示**（未持久化，仅 /process 即时响应中有）

### 6.5 列表 API 扩展

`GET /api/nana/cases` 列表端点扩展返回真实值：

```typescript
// 当前恒 0/untagged/false，Stage 3 改为真实查询
const result = cases.map(c => {
  const types = new Set(c.artifacts.map(a => a.type));
  // 查 CaseKnowledgeTag count
  const tagCount = await prisma.caseKnowledgeTag.count({ where: { caseId: c.id } });
  // 查 transcript 是否已转写（用 isPlaceholderTranscript helper 判断）
  const transcriptArt = c.artifacts.find(a => a.type === "transcript");
  const transcriptReady = transcriptArt ? !isPlaceholderTranscript(transcriptArt.content) : false;
  return {
    ...c,
    tagCount,
    tagStatus: tagCount > 0 ? 'tagged' : 'untagged',
    transcriptReady,
  };
});
```

> **修订 v2**：`transcriptReady` 使用 `isPlaceholderTranscript` helper 判断，而非硬编码 `!== "尚未转写"`。
> ASR 返回空字符串时不覆盖占位文本，所以 `transcriptReady` 仍为 false。

> **注意**：当前列表 API 不 include artifacts content（防爆体积），Stage 3 需 select transcript content 做判断。可以只 `select: { type: true, content: true }` 且只取 transcript 那条，不取 question_image/audio_note 的大字段。

---

## 7. 失败处理

### 7.1 失败矩阵

| 场景 | ASR 行为 | VLM 行为 | UI 文案 | 数据写入 |
|------|----------|----------|---------|----------|
| 正常完成 | 返回 transcript | 返回候选 | "转写好了 · 可能属于：XXX" | transcript 回写 + vlm tag |
| ASR 超时 | throw AsrTimeoutError | 正常 | "转写超时了 · 可能属于：XXX" | 仅 vlm tag |
| VLM 超时 | 正常 | throw VlmTimeoutError | "转写好了 · 分类超时了" | 仅 transcript |
| 双超时 | throw | throw | "识别超时了，可以重试或手动整理" | 无写入 |
| 空结果（ASR 返回空） | 返回空 string | 正常 | "录音没听清 · 可能属于：XXX" | transcript 不回写（保留占位）+ vlm tag |
| 空结果（VLM 返回空候选） | 正常 | 返回空数组 | "转写好了 · 这题不太好分类" | 仅 transcript |
| 模型报错（4xx/5xx） | throw AsrError | throw VlmError | "识别没接上，可以手动整理" | 无写入 |
| 音频格式不支持 | throw AsrUnsupportedFormatError | 正常 | "音频格式暂不支持 · 可能属于：XXX" | 仅 vlm tag |
| 无音频 | skipped | 正常 | "可能属于：XXX" | 仅 vlm tag |
| 无题图 | 正常 | skipped | "转写好了" | 仅 transcript |

### 7.2 失败处理原则

1. **不静默**（铁律 6）：每条管线失败都有日志 + 返回 error 原因
2. **不假装**（铁律 6）：失败时 UI 明确说"没接上"，不说"已完成"
3. **不阻塞**：ASR 失败不影响 VLM，反之亦然（独立 try/catch）
4. **可重试**：/process 端点不做幂等锁（v1），用户可重试
5. **可手动修正**：失败后用户仍可手动挂知识点（Stage 2 已有）

---

## 8. 密钥和环境变量清单

### 8.1 新增环境变量

```env
# ── 火山方舟（豆包）AI 配置 ──
# API Key（火山方舟控制台获取）
VOLCENGINE_API_KEY=""

# Base URL（默认火山方舟北京区）
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"

# VLM 视觉模型（豆包 Pro，用于题图分类）
# 推荐用 endpoint ID（方舟控制台创建推理接入点）
PRO_ENDPOINT_ID=""
# 或用模型名（fallback）
PRO_MODEL_NAME="doubao-seed-2-0-pro-260215"

# ASR 语音模型（豆包 Lite，用于音频转写）
LITE_ENDPOINT_ID=""
# 或用模型名（fallback）
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"

# ── AI 调用配置 ──
# ASR 超时（毫秒），默认 30000
ASR_TIMEOUT_MS="30000"
# VLM 超时（毫秒），默认 30000
VLM_TIMEOUT_MS="30000"
# VLM 自动挂标签的置信度阈值，默认 0.5
VLM_CONFIDENCE_THRESHOLD="0.5"
```

### 8.2 安全要求（铁律 4）

- 所有 Key 只放 `.env` 文件，**绝不写入代码、commit message、文档**
- `.env` 已在 `.gitignore` 中（确认：`git status` 无 .env）
- `.env.example` 只写变量名和空值/默认值，不写真 Key
- 提交前检查：`git status` 确认没有 .env 被 staged
- 生产环境通过服务器 `.env` 或 Docker 环境变量注入

### 8.3 .env.example 修改（⚠️上游文件，最小增量）

在 `.env.example` 末尾追加火山方舟配置段，标注 `# Stage 3 新增`。**只追加，不修改已有行**。

---

## 9. 测试方案

### 9.1 测试分层

| 层级 | 范围 | 工具 | 必需性 |
|------|------|------|--------|
| 单元测试 | asr-transcribe.ts / vlm-classify.ts | vitest + mock fetch | **v1 必需** |
| 集成测试 | /process 端点 | vitest + mock provider | **v1 必需** |
| Smoke test | 真实 provider | 手动/脚本 | 加分项 |

### 9.2 Fixture

```
src/__tests__/fixtures/
  ├── audio/
  │   ├── sample-webm-5s.txt      # 5 秒 webm 音频的 Base64（测试用，不入 git 大文件）
  │   └── sample-mp4-3s.txt
  ├── images/
  │   ├── sample-quadratic.txt     # 一道二次函数题图的 Base64
  │   └── sample-trig.txt          # 一道三角函数题图的 Base64
  └── responses/
      ├── asr-success.json          # 豆包 Lite 成功响应 mock
      ├── asr-empty.json            # 空转写 mock
      ├── vlm-success.json          # 豆包 Pro 成功响应 mock（含候选）
      ├── vlm-empty.json            # 空候选 mock
      └── vlm-malformed.json        # 格式错误的响应（测 JSON 解析容错）
```

> **注意**：Base64 fixture 文件可能较大，放入 `__tests__/fixtures/` 并在 `.gitignore` 中排除 `.txt` 大文件，或改用小尺寸测试素材。

### 9.3 Mock Provider 测试

**ASR mock 测试**（`asr-transcribe.test.ts`）：
```typescript
// mock OpenAI client.chat.completions.create
// 验证：
// 1. 正常返回 → 解析出 transcript
// 2. 空返回 → transcript = ""
// 3. 模型 4xx → throw AsrError
// 4. 超时 → throw AsrTimeoutError
// 5. 不支持的 mime → throw AsrUnsupportedFormatError
```

**VLM mock 测试**（`vlm-classify.test.ts`）：
```typescript
// mock OpenAI client.chat.completions.create
// 验证：
// 1. 正常返回 JSON → 解析出 candidates
// 2. markdown 包裹的 JSON → strip 后解析
// 3. 候选 nodeId 不在 48 节点列表 → 过滤掉
// 4. 空候选 → 返回空数组
// 5. 模型 5xx → throw VlmError
// 6. 超时 → throw VlmTimeoutError
```

**/process 端点集成测试**（`process-api.test.ts`）：
```typescript
// mock asrTranscribe + vlmClassify
// 验证：
// 1. 有音频+题图 → 两条管线都跑，transcript 回写 + vlm tag 落库
// 2. ASR 失败 + VLM 成功 → 仅 vlm tag，asrStatus="failed"
// 3. VLM 失败 + ASR 成功 → 仅 transcript，vlmStatus="failed"
// 4. 无音频 → asrStatus="skipped"
// 5. 跨用户 → 404
// 6. 低置信候选 → 不自动挂，返回 vlmCandidates
```

### 9.4 真实 Provider Smoke Test（加分项）

```bash
# 手动脚本（不入 CI，本地开发用）
npx tsx scripts/stage3-smoke-test.ts --caseId=<test-case-id>
# 调真实 /process 端点，打印 ASR/VLM 结果，验证端到端
```

---

## 10. 成本和限流策略

### 10.1 豆包定价（¥/百万 tokens）

| 模型 | 输入 | 输出 | 用途 |
|------|------|------|------|
| doubao-seed-2-0-pro-260215 | ¥3.2 | ¥16 | VLM 题图分类 |
| doubao-seed-2-0-lite-260215 | ¥0.6 | ¥3.6 | ASR 音频转写 |

### 10.2 单次调用成本估算

**VLM 题图分类**：
- 输入：~1MB Base64 图 ≈ 750K tokens（图片 token 计算复杂，粗估）+ 48 节点列表 ~2K tokens + 提示词 ~1K tokens
- 输出：~200 tokens（JSON 候选）
- 估算：¥(753K/1M × 3.2 + 200/1M × 16) ≈ ¥2.41/次

**ASR 音频转写**：
- 输入：~60s 音频 ≈ 150K tokens（音频 token 估算）+ 提示词 ~500 tokens
- 输出：~500 tokens（转写文本）
- 估算：¥(150.5K/1M × 0.6 + 500/1M × 3.6) ≈ ¥0.09/次

**单题总成本**：约 ¥2.5/次（VLM 是大头）

> **注意**：以上 token 估算是粗略值，实际计费以火山方舟账单为准。建议首次真实调用后查看 `response.usage` 记录真实 token 数。

### 10.3 限流策略

**v1（单用户，无限流）**：
- 单用户错题采集频率低（每天几道题），不需要限流
- /process 端点不做 rate limit

**v2+（多用户，需限流）**：
- 每用户每小时最多 20 次 /process（防止误调爆量）
- 每天总调用上限 200 次（月成本 ~¥15000，可接受）
- 超限返回 429 + "今天识别额度用完了，明天再来"

**成本监控**：
- 每次 /process 记录 `response.usage`（prompt_tokens + completion_tokens）到日志
- 后续可加到 CaseKnowledgeTag.note 或独立日志表做成本追踪

---

## 11. 明确不写 StudentNodeState，不让节点变绿

### 11.1 为什么不写

`StudentNodeState` 表记录学生的知识掌握状态（untested → uncertain → gap → stable），只有经过正式诊断 session（做题 → 判对错 → BKT 更新）才能改变。

Stage 3 只做"拍照 + 录音 → AI 轻分类"，**不是诊断**：
- 没有做题、没有判对错
- VLM 只判断"这题考什么知识点"，不判断"学生会不会"
- 挂 CaseKnowledgeTag 是弱证据（"收过题"），不是强证据（"掌握了"）

### 11.2 知识地图上的效果

VLM 写 CaseKnowledgeTag 后，知识地图 API 的 `caseEvidenceCount` 会自动 +1。

> **修订 v2（distinct caseId 计数）**：当前 map API 的 `caseEvidenceCount` 用 `groupBy + _count: { nodeId: true }`
> 统计 CaseKnowledgeTag 行数。但同一 case 可能同时有 `manual` + `vlm` 两个 source 的 tag 指向同一 nodeId，
> 这算 2 行但实际只收过 1 道题。**必须改为按 distinct caseId 计数**。
>
> 修改方案（`src/app/api/diagnosis/map/route.ts`）：
> ```typescript
> // 旧（行数计数，会算重）：
> // const evidenceRows = await prisma.caseKnowledgeTag.groupBy({
> //   by: ['nodeId'], where: { case: { studentId } }, _count: { nodeId: true },
> // });
>
> // 新（distinct caseId 计数）：
> const evidenceRows = await prisma.caseKnowledgeTag.findMany({
>   where: { case: { studentId } },
>   select: { nodeId: true, caseId: true },
>   distinct: ['nodeId', 'caseId'],
> });
> const evidenceMap = new Map<string, number>();
> for (const r of evidenceRows) {
>   evidenceMap.set(r.nodeId, (evidenceMap.get(r.nodeId) ?? 0) + 1);
> }
> ```
> 这样同一 case 的 manual+vlm 双 source 只算 1 道。

前端效果：
- 节点出现在"收过题"琥珀色分组（已有逻辑，`caseEvidenceCount > 0` → collected 组）
- **不出现绿色**（`status` 仍是 `untested`，不进 `stable` 组）
- **不进学习前沿**（前沿只取 tier=A 且 status≠stable 的节点，caseEvidenceCount 不影响前沿计算）

这完全符合需求：用户能看到"琥珀色收过题反馈"，但节点不会变绿。

### 11.3 数据隔离示意

```
Stage 3 写入：           Stage 3 不碰：
┌──────────────────┐     ┌──────────────────────┐
│ CaseKnowledgeTag │     │ StudentNodeState     │
│ (caseId, nodeId, │     │ (studentId, nodeId,  │
│  source="vlm",   │     │  status="untested",  │
│  confidence)     │     │  masteryProb=0.0)    │
└──────────────────┘     └──────────────────────┘
        │                          │
        ▼                          ▼
  caseEvidenceCount            status / masteryProb
  (弱标记，琥珀色)            (强状态，绿色)
```

---

## 12. 文件变更清单

| 文件 | 操作 | 说明 | 风险 |
|------|------|------|:--:|
| `src/lib/nana/transcript-utils.ts` | 新增 | `isPlaceholderTranscript` helper | 低 |
| `src/lib/nana/asr-transcribe.ts` | 新增 | ASR 薄封装 | 低 |
| `src/lib/nana/vlm-classify.ts` | 新增 | VLM 轻分类封装 | 低 |
| `src/app/api/nana/cases/[id]/process/route.ts` | 新增 | /process 端点 | 中 |
| `src/app/api/diagnosis/map/route.ts` | **修改** | caseEvidenceCount 改为 distinct caseId 计数（防 manual+vlm 算重） | 低 |
| `src/lib/nana/case-classify.ts` | 修改 | classifyCase 接真 VLM + source 白名单收窄为 manual+vlm | 低 |
| `prisma/schema.prisma` | 修改（仅注释） | `CaseKnowledgeTag.source` 注释收窄为 manual+vlm | 低 |
| `src/app/api/nana/cases/route.ts` | 修改 | GET 列表扩展返回真实 tagCount/tagStatus/transcriptReady | 低 |
| `src/lib/nana/nana-api-client.ts` | 修改 | 加 processCase(id) | 低 |
| `src/app/nana/capture/page.tsx` | 修改 | 保存后调 /process + 识别中状态 | 中 |
| `src/components/nana/capture/transcription-panel.tsx` | 修改 | editable=true 显示真实转写 | 低 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | 显示 VLM 标签 + 候选确认 | 低 |
| `.env.example` | 修改（⚠️上游文件） | 追加 VOLCENGINE_* 变量 | 低 |
| `src/__tests__/unit/nana/asr-transcribe.test.ts` | 新增 | mock ASR 测试 | 低 |
| `src/__tests__/unit/nana/vlm-classify.test.ts` | 新增 | mock VLM 测试 | 低 |
| `src/__tests__/integration/nana/process-api.test.ts` | 新增 | /process 端点集成测试 | 低 |

**不涉及 Prisma schema 结构改动**——CaseKnowledgeTag 表在 Stage 2 已建。Stage 3 只写入数据，不改结构。
`prisma/schema.prisma` 中 `CaseKnowledgeTag.source` 字段注释从 `"manual" | "vlm" | "asr" | "rule" | "pending"` 收窄为 `"manual" | "vlm"`，**仅注释，零结构改动**。

**不涉及上游文件修改**——除 `.env.example` 追加变量（最小增量，标注 ⚠️上游文件修改）。

---

## 13. 验收标准

### 13.1 第一版验收清单

| # | 验收项 | 操作步骤 | 预期结果 |
|---|--------|----------|----------|
| 1 | 保存题图和录音后能触发识别 | 拍题 + 录音 → 收好 → 等待 | 自动调 /process，显示"正在看看这题大致属于哪…" |
| 2 | 录音能生成文字 | 录一段话 → 保存 → 等 /process 完成 → 切"我的话" tab | 显示真实转写文本 + "转写仅供参考，原音为准" |
| 3 | 题图能产生候选知识点 | 拍一道题 → 保存 → 等 /process 完成 | 显示"可能属于：XXX"（1-3 个候选） |
| 4 | 知识地图出现琥珀色收过题反馈 | 拍题 + /process 完成 → 去知识地图 | 对应知识点出现在"收过题"琥珀色分组 |
| 5 | 用户能看到初步整理结果 | 知识地图 → "最近拍过的题" → 点开 case | 看到题图 + 转写 + VLM 标签 |
| 6 | 用户能手动改 | 点 VLM 标签 → 手动选另一个知识点 | 可挂 manual 标签，VLM 标签可删除或共存 |
| 7 | ASR 失败不阻塞 VLM | mock ASR 报错 → /process | vlmStatus=success，asrStatus=failed |
| 8 | VLM 失败不阻塞 ASR | mock VLM 报错 → /process | asrStatus=success，vlmStatus=failed |
| 9 | 双失败不假装 | mock 双报错 → /process | UI 显示"识别没接上，可以手动整理" |
| 10 | 低置信不硬塞 | VLM 返回 confidence=0.3 → /process | 不自动挂，即时响应返回"AI 觉得可能属于：XXX"，刷新后消失（未持久化） |
| 11 | 无录音不报错 | 只拍题不录音 → /process | asrStatus=skipped，vlm 正常 |
| 12 | 节点不变绿 | /process 完成后看知识地图 | 节点在"收过题"琥珀色组，不在"已点亮"绿色组 |

### 13.2 构建验收

- [ ] `npm.cmd run build` 通过，无错误
- [ ] 单元测试全部通过（asr-transcribe + vlm-classify + process-api）
- [ ] `git status` 干净

### 13.3 Git 收口

- commit 1: `feat(nana): ASR 转写薄封装 + 测试`（asr-transcribe.ts + test）
- commit 2: `feat(nana): VLM 轻分类薄封装 + 测试`（vlm-classify.ts + test）
- commit 3: `feat(nana): /process 端点 + 集成测试`（process/route.ts + case-classify 改 + test）
- commit 4: `feat(nana): 前端识别状态 + 转写展示 + 候选确认`（capture page + transcription-panel + recent-cases-list + nana-api-client）
- commit 5: `feat(nana): 列表 API 扩展 + .env.example 更新`（cases route GET + .env.example）

---

## 14. 风险与注意事项

### 14.1 中风险

**VLM 手持拍照准确率未验证**
- `scripts/vlm-transcribe.ts` 验收数据来自干净印刷 PDF，真实手持拍照（倾斜/阴影/手写批注）准确率未知
- **缓解**：Stage 3 上线后先小范围试（外甥女拍几道题），观察 VLM 候选准确率，必要时调提示词或加预处理
- **降级**：准确率差 → UI 强调"AI 候选仅供参考"，引导用户手动修正

**豆包 Lite 音频格式兼容性**
- 浏览器 MediaRecorder 产出 webm/mp4，豆包 Lite 是否直接支持待验证
- **缓解**：执行前先用真实浏览器录音产物验证（见 DP-ASR-2 预验证）
- **降级**：webm 不支持 → v1 明确降级为“语音暂未转写”，ASR 管线 skipped，**不临时补大范围转码**，不阻塞 VLM

**/process 同步等待时间**
- 两条管线并行，各 30s 超时，总等待 ≤ 30s（取最长者）
- **缓解**：前端显示进度（“正在转写…”→“正在看题…”），超时后显示“识别超时了，可以重试”
- **降级**：用户可重试或手动整理（Stage 2 手动挂载仍可用）

### 14.2 低风险

- **Prisma schema 无改动**：Stage 2 已建表，Stage 3 只写数据
- **上游文件仅 .env.example 追加**：不修改已有行，commit message 标注 ⚠️上游文件修改
- **前端状态机扩展**：在已有 saveState 基础上追加 processing/processed 态，不破坏已有流程
- **知识地图琥珀色已有逻辑**：caseEvidenceCount > 0 自动生效，不需改前端

---

## 15. 实施顺序

```
Round 0: 预验证（执行前必做）
  ├─ 用浏览器录一段 5s 音频，导出 webm Base64
  ├─ 调豆包 Lite API 验证 webm 是否支持
  └─ 记录验证结果 → 决定 ASR 管线走 skipped 还是正常

Round 1: ASR + VLM 薄封装 + mock 单测（低风险，可并行，不碰前端）
  ├─ asr-transcribe.ts + test
  ├─ vlm-classify.ts + test
  ├─ isPlaceholderTranscript helper + test
  └─ case-classify.ts source 白名单收窄 + test

Round 2: /process 端点 + map API 修复 + 集成测试（中风险，依赖 Round 1）
  ├─ process/route.ts
  ├─ case-classify.ts 改（接真 VLM）
  ├─ map/route.ts 改（distinct caseId 计数）
  └─ process-api.test.ts

Round 3: 前端编排 + UI 升级（中风险，依赖 Round 2）
  ├─ nana-api-client.ts 加 processCase
  ├─ capture/page.tsx 识别状态
  ├─ transcription-panel.tsx editable
  └─ recent-cases-list.tsx VLM 标签

Round 4: 列表 API + .env.example + 验收（低风险，收尾）
  ├─ cases/route.ts GET 扩展
  ├─ .env.example 追加
  └─ npm.cmd run build + test
```

> **修订 v2**：建议第一轮（Round 1）只做 ASR/VLM lib + mock 单测 + isPlaceholderTranscript helper + source 白名单收窄，**不碰前端**。

---

## 16. 前置确认项（需用户拍板）

> 以下项在 execute-agent 执行前需要用户确认：

1. **VOLCENGINE_API_KEY 是否已有**：scripts/vlm-transcribe.ts 已用过，确认 Key 仍有效
2. **PRO_ENDPOINT_ID / LITE_ENDPOINT_ID 是否创建**：方舟控制台的推理接入点，还是直接用模型名
3. **webm 预验证结果**：豆包 Lite 是否支持浏览器 webm 录音格式（决定 ASR 管线是否启用）
4. **测试 fixture 策略**：Base64 大文件入 git 还是改用小素材
5. **幂等保护**：/process 允许重复调用（v1 建议允许，简单）
