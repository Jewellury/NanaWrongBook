# Stage 3：真实 AI 接入最小闭环 · 开发计划 v3

> 关联规格: [doc/plan/capture-map-v1-plan.md](capture-map-v1-plan.md)（§4 Stage 3）
> 关联参考: [doc/reference/TECH_PLAN_v2.md](../reference/TECH_PLAN_v2.md)（§AI 管线、P1-P5）、[doc/reference/OPS_handbook.md](../reference/OPS_handbook.md)（§4 措辞铁律）
> Spike 结果: [doc/research/spike-v3-report.md](../research/spike-v3-report.md)（7 次真实 API 验证）
> 产品手册: [doc/product/nana-user-manual-v1-draft.md](../product/nana-user-manual-v1-draft.md) + [doc/product/nana-product-behavior-manual-v1.md](../product/nana-product-behavior-manual-v1.md)
> 计划日期: 2026-07-04
> 计划者: plan-agent
> 版本: **v3（替代 v2 双管线方案）**
> 边界: **最小闭环**——一体化 Case Analyzer 轻分类 + 转写 + 初步反馈。**不做深度诊断、不做 Newman 归因、不写 StudentNodeState、不让节点变绿。**

---

## 0. v3 核心变更（与 v2 对比）

| 维度 | v2 双管线 | v3 一体化（本方案） |
|------|----------|-------------------|
| API 调用 | 2 次（Lite ASR + Pro VLM） | **1 次**（Lite 一体化） |
| 模型 | ASR=Lite, VLM=Pro | **统一 Lite**（Pro 不支持音频） |
| 成本 | ~¥2.5/次（Pro 大头） | **~¥0.006/次**（Lite 单次，Spike 实测 2367入/1354出 tokens） |
| 延迟 | ~30s（并行取最长） | **~30s**（单次） |
| JSON 稳定性 | 需分别解析 | **100% 稳定**（Spike 7/7 zod 通过） |
| 额外输出 | 无 | questionSummary + studentFacingFeedback |
| 音频支持 | Lite 支持 WAV | 同（Lite 一体化中 WAV 同请求） |

**v3 判定依据**（Spike 报告）：
- Lite 支持图+音频同请求（测试 4 验证）
- Pro **不支持**音频输入（测试 2 明确拒绝）
- JSON 7/7 = 100% zod 校验通过，0 nodeId 幻觉
- 3 张不同图产生 3 组不同候选，准确性够用

---

## 1. 大白话概述

**要做什么**：用户拍题 + 录音保存后，点一下触发识别，后台调一次豆包 Lite：
1. **一次请求**同时处理题图 + 可用音频 + 知识点清单
2. 返回结构化 JSON：转写文字 + 题目摘要 + 候选知识点 + 鼓励文案

结果回写数据库：
- 转写文字替换 transcript artifact 的"尚未转写"（仅 WAV 格式且有内容时）
- 候选知识点（confidence ≥ 0.5）写入 CaseKnowledgeTag（source="vlm"）
- 知识地图对应节点出现"收过题"琥珀色反馈（caseEvidenceCount > 0）

**不做什么**：
- 不做深度诊断（Newman 归因、探针下探、BKT 更新）
- **不写 StudentNodeState**——节点状态不变，不会从"未探索"变绿
- 不做流式 ASR（文件式够用）
- 不做整卷转写（单题轻分类）
- 不阻塞 `POST /cases`（createCase 只保存，AI 由显式 `/process` 触发）
- **v1 不引入 ffmpeg 转码**（webm/mp4 降级 skipped）

---

## 2. 现有代码盘点

### 2.1 已就绪（不动）

| 组件 | 文件 | 状态 | 说明 |
|------|------|:--:|------|
| Case 创建 | `src/app/api/nana/cases/route.ts` | ✅ | POST 保存 artifacts，返回 201+caseId。**不改动** |
| Case 读取 | `src/app/api/nana/cases/[id]/route.ts` | ✅ | findFirst 归属校验。**不改动** |
| Tags API | `src/app/api/nana/cases/[id]/tags/route.ts` | ✅ | GET/POST tags，source 恒 manual。**不改动** |
| 分类骨架 | `src/lib/nana/case-classify.ts` | ✅ | source 白名单已收窄为 manual+vlm（v2 Round 1 完成） |
| 知识地图 API | `src/app/api/diagnosis/map/route.ts` | ⚠️ | 需改 caseEvidenceCount 为 distinct caseId 计数 |
| 知识地图 UI | `knowledge-map-list-view.tsx` | ✅ | 已有琥珀色分组，VLM 写 tag 后自动出现 |
| 前端 API 客户端 | `src/lib/nana/nana-api-client.ts` | ✅ | Stage 3 加 processCase |
| transcript-utils | `src/lib/nana/transcript-utils.ts` | ✅ | isPlaceholderTranscript helper（v2 Round 1 完成） |

### 2.2 v2 已创建但 v3 废弃的文件

| 文件 | v3 处置 | 理由 |
|------|---------|------|
| `src/lib/nana/asr-transcribe.ts` | **废弃** | v3 不再需要独立 ASR 管线，Lite 一体化同时处理音频 |
| `src/lib/nana/vlm-classify.ts` | **废弃** | v3 不再需要独立 VLM 管线，Lite 一体化同时处理图片 |
| `src/__tests__/unit/nana/asr-transcribe.test.ts` | **废弃** | 对应 lib 已废弃 |
| `scripts/stage3-asr-format-check.ts` | **保留** | 格式预验证结论仍有参考价值 |

### 2.3 v3 需新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/nana/case-analyzer.ts` | **新增** | 一体化 Case Analyzer：题图+音频 → 结构化 JSON |
| `src/app/api/nana/cases/[id]/process/route.ts` | **新增** | /process 端点，同步调 Case Analyzer |
| `src/app/api/diagnosis/map/route.ts` | **修改** | caseEvidenceCount 改为 distinct caseId 计数 |
| `src/lib/nana/nana-api-client.ts` | **修改** | 加 processCase(id) |
| `src/app/nana/capture/page.tsx` | **修改** | 保存后调 /process + 识别中状态 |
| `src/components/nana/capture/transcription-panel.tsx` | **修改** | editable=true 显示真实转写 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | **修改** | 显示 VLM 标签 + 候选确认 |
| `src/app/api/nana/cases/route.ts` | **修改** | GET 列表扩展返回真实 tagCount/tagStatus/transcriptReady |
| `.env.example` | **修改（⚠️上游文件）** | 追加 VOLCENGINE_* 变量（最小增量） |
| `src/__tests__/unit/nana/case-analyzer.test.ts` | **新增** | mock Case Analyzer 测试 |
| `src/__tests__/integration/nana/process-api.test.ts` | **新增** | /process 端点集成测试 |

---

## 3. Case Analyzer lib 契约

### 3.1 数据流

```
question_image artifact (Data URL Base64)
    │
    ├─ audio_note artifact (可选，仅 WAV 格式)
    │   ├─ 从 audio_meta artifact 解析 mime
    │   ├─ mime 不是 WAV/MP3/FLAC/OGG/M4A/AAC → 音频 skipped（不传给 API）
    │   └─ 提取纯 Base64（去 data: 前缀）
    │
    ▼
case-analyzer.ts
    ├─ 构造 OpenAI client（VOLCENGINE_API_KEY + VOLCENGINE_BASE_URL）
    ├─ 调 doubao-seed-2-0-lite（LITE_ENDPOINT_ID 优先）
    │   messages: [{
    │     role: "user",
    │     content: [
    │       { type: "text", text: CASE_ANALYZER_PROMPT(48节点) },
    │       { type: "image_url", image_url: { url: dataUrl } },
    │       { type: "input_audio", input_audio: { data, format } }  ← 仅 WAV 时
    │     ]
    │   }]
    ├─ 超时 60s（AbortController，Lite 实测平均 30s，留余量）
    ├─ jsonrepair 兜底解析 + zod 校验
    ├─ nodeId 白名单过滤（48 节点）
    └─ 返回 CaseAnalyzerResult
    │
    ▼
/process 端点落库
    ├─ transcript → 回写 artifact（仅占位时覆盖 + 非空）
    ├─ knowledgeCandidates(confidence≥0.5) → upsert CaseKnowledgeTag(source="vlm")
    ├─ knowledgeCandidates(confidence<0.5) → 仅即时返回，不持久化
    ├─ questionSummary → 仅即时返回（v1 不持久化）
    └─ studentFacingFeedback → 仅即时返回（v1 不持久化）
```

### 3.2 lib 接口定义

```typescript
// src/lib/nana/case-analyzer.ts

export interface CaseAnalyzerInput {
  /** 题图 Data URL（含 data:image/...;base64, 前缀） */
  imageDataUrl: string;
  /** 音频纯 Base64（不含 data: 前缀），可选 */
  audioBase64?: string;
  /** 音频格式标签（豆包 input_audio.format），如 "wav"。无音频则不传 */
  audioFormat?: string;
  /** 48 个知识点列表（id + name），从 DB 拉取 */
  nodes: { id: string; name: string }[];
}

export interface CaseAnalyzerCandidate {
  nodeId: string;
  confidence: number;      // 0-1
  reason: string;
}

export interface CaseAnalyzerResult {
  transcript: string;                // 转写文本（无音频或格式不支持时为空字符串）
  questionSummary: string;           // 题目一句话摘要
  knowledgeCandidates: CaseAnalyzerCandidate[];  // 0-3 个候选
  studentFacingFeedback: string;     // 鼓励文案
  /** 模型返回的 token 用量（成本追踪用） */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ─── 错误类型 ───

export class CaseAnalyzerError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "CaseAnalyzerError";
  }
}

export class CaseAnalyzerTimeoutError extends CaseAnalyzerError {
  constructor() {
    super("Case Analyzer 超时（60s）");
    this.name = "CaseAnalyzerTimeoutError";
  }
}

export class CaseAnalyzerJsonError extends CaseAnalyzerError {
  constructor(raw: string) {
    super(`Case Analyzer JSON 解析失败（含 repair 兜底）: ${raw.substring(0, 200)}`);
    this.name = "CaseAnalyzerJsonError";
  }
}

/**
 * 调豆包 Lite 做一体化多模态 Case 分析。
 *
 * - 一次请求同时处理题图 + 可选音频 + 知识点清单
 * - 返回结构化 JSON（zod 校验 + nodeId 白名单过滤）
 * - 超时 60s → throw CaseAnalyzerTimeoutError
 * - JSON 解析失败（含 repair 兜底）→ throw CaseAnalyzerJsonError
 * - 其他失败 → throw CaseAnalyzerError（不静默）
 *
 * Spike 验证：7/7 zod 通过，0 nodeId 幻觉，平均 30s
 */
export async function analyzeCase(input: CaseAnalyzerInput): Promise<CaseAnalyzerResult>;
```

### 3.3 提示词

```
你是高中数学错题采集助手。请看这道数学题的图片{若有音频则为学生口述思路}, 返回结构化 JSON。

【你的任务】
1. 如果有音频，转写学生语音为 transcript（口语，保留"嗯/然后"等）。无音频则 transcript 留空字符串。
2. 用一句话概括题目大意 questionSummary（若公式看不清就描述可见部分，不要编造）。
3. 从下面的知识点清单里选出最多 3 个相关知识点，禁止发明清单外的 nodeId：
<48 节点列表动态注入>
   每个给 confidence(0~1) 和一句 reason。
4. 给一句温和、鼓励式的 studentFacingFeedback（面向学生，不透露答案对错，不批评）。

【纪律】
- 只做"大致属于哪几个知识点"的判断，不做深度归因
- 不解题、不给答案
- nodeId 必须从上面的清单中选，不能自创
- 如果图片不清晰或不是数学题，knowledgeCandidates 返回空数组

【输出格式（严格 JSON，不要 markdown 代码块）】
{
  "transcript": "",
  "questionSummary": "",
  "knowledgeCandidates": [{"nodeId": "M2a-03", "confidence": 0.8, "reason": "题目涉及一次函数图像"}],
  "studentFacingFeedback": ""
}
```

### 3.4 JSON Schema（Zod）

```typescript
const CandidateSchema = z.object({
  nodeId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const CaseAnalyzerSchema = z.object({
  transcript: z.string(),
  questionSummary: z.string(),
  knowledgeCandidates: z.array(CandidateSchema).max(3),
  studentFacingFeedback: z.string(),
});
```

### 3.5 JSON 解析流程

```
模型原始输出
    │
    ├─ strip markdown 代码块（```json ... ```）
    ├─ JSON.parse
    │   ├─ 成功 → zod 校验
    │   └─ 失败 → jsonrepair 兜底 → JSON.parse → zod 校验
    │       └─ 仍失败 → throw CaseAnalyzerJsonError
    ├─ zod 校验通过 → 提取 candidates
    └─ nodeId 白名单过滤（不在 48 节点中的候选丢弃，记 warn 日志）
```

### 3.6 关键实现决策

**DP-CA-1：统一用 Lite，不用 Pro**
- Spike 证实 Pro 不支持音频输入（API 直接拒绝）
- Lite 图+音频同请求成功，候选准确率够用（3 张图 3 组不同候选）
- Pro 作为后续提升图片理解质量的备选，v1 不进主路径

**DP-CA-2：超时 60s（不是 30s）**
- Spike 实测 Lite 平均 29.7s，最高 37.3s
- 30s 超时会有误杀风险，v1 放宽到 60s
- 前端 UI 文案适配"正在整理这题…"，不承诺秒出

**DP-CA-3：jsonrepair 兜底**
- 虽然 Spike 7/7 JSON 稳定，但真实环境可能有波动
- 解析链：strip markdown → JSON.parse → 失败则 jsonrepair → JSON.parse → zod 校验
- 最终失败 throw CaseAnalyzerJsonError，不写假数据

**DP-CA-4：nodeId 白名单双重过滤**
- 提示词约束"只能从清单中选"（第一道）
- 服务端 zod 校验后再过一遍 nodeId 是否在 48 节点中（第二道）
- 不在的候选丢弃 + warn 日志，不 throw（部分可用比全废好）

---

## 4. 音频 skipped 规则

### 4.1 格式判定流程

```
audio_note artifact 存在？
  ├─ 否 → audioStatus = "skipped"（无音频），Case Analyzer 不传音频
  └─ 是 → 从 audio_meta artifact 解析 mime
      ├─ mime 映射到豆包 format 标签
      │   ├─ wav → 格式支持（Spike 已验证），传给 API
      │   ├─ mp3/flac/ogg/m4a/aac → 格式支持（官方文档列出，未实测），传给 API
      │   └─ webm/mp4/其他 → 格式不支持（Round 0 验证拒绝）
      │       ├─ audioStatus = "skipped"（格式不支持）
      │       └─ Case Analyzer 仍跑图片分析（不传音频）
      └─ 无 audio_meta → mime 未知
          ├─ audioStatus = "skipped"（格式未知）
          └─ Case Analyzer 仍跑图片分析
```

### 4.2 格式支持表

> **区分**："Spike 已验证"= 用真实 API 调用确认过；"官方支持但未实测"= 豆包文档列出但 Spike 未测

| 格式 | 验证状态 | 豆包 Lite | 浏览器来源 | v1 策略 |
|------|---------|:---------:|-----------|---------|
| WAV | ✅ Spike 已验证 | 支持 | — | 支持 |
| webm | ❌ Round 0 验证拒绝 | 不支持 | Chrome/Firefox | **skipped** |
| mp4 | ❌ Round 0 验证拒绝 | 不支持 | Safari | **skipped** |
| mp3 | ⚠️ 官方支持但未实测 | 支持（文档） | — | 支持 |
| flac | ⚠️ 官方支持但未实测 | 支持（文档） | — | 支持 |
| ogg | ⚠️ 官方支持但未实测 | 支持（文档） | — | 支持 |
| m4a | ⚠️ 官方支持但未实测 | 支持（文档） | — | 支持 |
| aac | ⚠️ 官方支持但未实测 | 支持（文档） | — | 支持 |

> **注意**：浏览器 MediaRecorder 主流产出 webm（Chrome/Firefox）和 mp4（Safari），两者均被豆包 Lite 拒绝。因此**大多数浏览器录音在 v1 会被 skipped**，只有手动提供 WAV 格式音频才能转写。

### 4.3 v1 不引入转码

- webm/mp4 是浏览器 MediaRecorder 的主流产出格式
- v1 **不引入 ffmpeg/wasm 转码**（大范围改动、增加包体积）
- 浏览器录音若产出 webm/mp4 → audioStatus = "skipped" → UI 显示"语音暂未转写"
- Case Analyzer 仍跑图片分析，不因音频格式阻塞

### 4.4 audioStatus 定义

```
audioStatus: "success" | "skipped" | "failed" | "timeout"
```

| 值 | 含义 | Case Analyzer 音频 | transcript |
|----|------|-------------------|------------|
| `success` | 音频格式支持 + Lite 返回了 transcript | 传入 API | 有内容时回写 |
| `skipped` | 无音频 / 格式不支持 / 格式未知 | 不传 API | 留占位 |
| `failed` | Case Analyzer 整体失败（含音频部分） | — | 不回写 |
| `timeout` | Case Analyzer 整体超时 | — | 不回写 |

> **注意**：v3 不再有独立的 ASR 管线，audioStatus 是从 Case Analyzer 整体结果中推导的。Case Analyzer 成功但 transcript 为空（如正弦波测试）→ audioStatus = "success" 但不回写（空字符串不覆盖占位）。

---

## 5. /process 端点设计

### 5.1 架构

```
① POST /api/nana/cases  → 保存 artifacts，返回 201 + caseId（不跑 AI）
② 前端保存成功 → 显式调 POST /api/nana/cases/:id/process
③ /process 同步调 Case Analyzer（一次 API 调用，60s 超时）
④ /process 始终返回 200 + { status, audioStatus, ... }（无论成功/失败/超时）
⑤ 前端收到结果 → 更新 UI
```

**为什么不用 fire-and-forget**：Next.js API route 在响应返回后 handler 可能被终止。显式 /process + 前端等待是最可靠的 v1 方案。

**为什么不用队列/WebSocket**：v1 量级小（单用户），AI 调用 ~30s，同步等够用。

### 5.2 端点契约

```
POST /api/nana/cases/:id/process

鉴权: NextAuth session（沿用 G1 归属校验）
归属: findFirst({ where: { id, studentId: session.user.id } })，不满足 → 404

请求体: 无（caseId 从 URL 取，artifacts 从 DB 读）

响应 (200 — 始终返回):
{
  status: "success" | "failed" | "timeout",
  audioStatus: "success" | "skipped" | "failed" | "timeout",
  transcript?: string,           // Case Analyzer 成功且 transcript 非空时返回
  questionSummary?: string,      // Case Analyzer 成功时返回（即时展示，不持久化）
  feedback?: string,             // studentFacingFeedback（即时展示，不持久化）
  tags: CaseKnowledgeTag[],      // 当前 case 的全部标签（含已有 manual + 新写 vlm）
  lowConfidenceCandidates?: CaseAnalyzerCandidate[],  // confidence < 0.5（仅即时展示）
  error?: string,                // 失败/超时原因
}

错误:
  401 — 未授权
  404 — case 不存在或不属于当前用户
  500 — 内部错误
```

### 5.3 执行流程（伪代码）

```typescript
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;
  const case_ = await prisma.case.findFirst({
    where: { id, studentId: session.user.id },
    include: { artifacts: true },
  });
  if (!case_) return notFound();

  const artifacts = case_.artifacts;
  const questionImage = artifacts.find(a => a.type === "question_image");
  const audioNote = artifacts.find(a => a.type === "audio_note");
  const audioMeta = artifacts.find(a => a.type === "audio_meta");
  const transcriptArt = artifacts.find(a => a.type === "transcript");

  // 无题图 → 无法分析
  if (!questionImage) {
    return NextResponse.json({
      status: "failed",
      audioStatus: "skipped",
      tags: await listTagsForCase(id, session.user.id),
      error: "缺少题图，无法分析",
    });
  }

  // ── 音频格式判定 ──
  let audioBase64: string | undefined;
  let audioFormat: string | undefined;
  let audioSkipped = true;

  if (audioNote) {
    const mime = parseMimeFromMeta(audioMeta?.content);
    const format = mimeToApiFormat(mime);  // wav→"wav", webm→null
    if (format) {
      audioBase64 = stripDataPrefix(audioNote.content);
      audioFormat = format;
      audioSkipped = false;
    }
    // format === null → audioSkipped = true，不传音频给 API
  }

  // ── 拉取 48 节点 ──
  const nodes = await prisma.knowledgeNode.findMany({
    select: { id: true, name: true },
  });

  // ── 调 Case Analyzer ──
  try {
    const result = await withTimeout(
      analyzeCase({
        imageDataUrl: questionImage.content,
        audioBase64,
        audioFormat,
        nodes,
      }),
      60000  // 60s 超时
    );

    // ── transcript 回写 ──
    // 仅当 transcript artifact 内容是占位文本 且 Case Analyzer 返回非空 transcript 时覆盖
    if (transcriptArt
        && isPlaceholderTranscript(transcriptArt.content)
        && result.transcript.trim() !== "") {
      await prisma.artifact.update({
        where: { id: transcriptArt.id },
        data: { content: result.transcript },
      });
    }

    // ── 知识点标签落库 ──
    // confidence >= 0.5 → upsert CaseKnowledgeTag(source="vlm")
    const autoTags = result.knowledgeCandidates.filter(c => c.confidence >= 0.5);
    for (const c of autoTags) {
      await prisma.caseKnowledgeTag.upsert({
        where: { caseId_nodeId_source: { caseId: id, nodeId: c.nodeId, source: "vlm" } },
        create: { caseId: id, nodeId: c.nodeId, source: "vlm", confidence: c.confidence, note: c.reason },
        update: { confidence: c.confidence, note: c.reason },
      });
    }

    // ── 返回 ──
    const tags = await listTagsForCase(id, session.user.id);
    const lowConfidence = result.knowledgeCandidates.filter(c => c.confidence < 0.5);

    return NextResponse.json({
      status: "success",
      audioStatus: audioSkipped ? "skipped" : "success",
      transcript: result.transcript.trim() !== "" ? result.transcript : undefined,
      questionSummary: result.questionSummary,
      feedback: result.studentFacingFeedback,
      tags,
      lowConfidenceCandidates: lowConfidence.length > 0 ? lowConfidence : undefined,
    });

  } catch (e) {
    const isTimeout = e instanceof CaseAnalyzerTimeoutError
      || (e instanceof Error && e.name === "AbortError");

    return NextResponse.json({
      status: isTimeout ? "timeout" : "failed",
      audioStatus: isTimeout ? "timeout" : "failed",
      tags: await listTagsForCase(id, session.user.id),
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
```

### 5.4 超时与重试

- Case Analyzer 统一 60s 超时（`AbortController` + `setTimeout`）
- 超时返回 200 + `status="timeout"`，用户可重试
- /process 允许重复调用（v1 无幂等锁）
- **无轮询**：v1 不承诺后台继续跑，超时即结束

---

## 6. 落库策略

### 6.1 写入边界

| 写入目标 | 何时写 | 写什么 | 不写什么 |
|---------|--------|--------|---------|
| `Artifact` (transcript) | Case Analyzer 成功 + transcript 非空 + 原内容是占位 | `content = result.transcript` | 空字符串不覆盖；非占位不覆盖（人>AI） |
| `CaseKnowledgeTag` | Case Analyzer 成功 + confidence ≥ 0.5 | `source="vlm"`, `confidence`, `note=reason` | confidence < 0.5 不持久化 |
| `StudentNodeState` | **永不写** | — | 节点状态不变，不变绿 |

### 6.2 source 定义

| source | 含义 | confidence | note | 写入时机 |
|--------|------|-----------|------|----------|
| `manual` | 人工挂载 | 1.0 | 用户备注 | 用户在 UI 手动选（已有） |
| `vlm` | AI 自动挂 | 模型给的 0-1 | AI 的理由 | /process 成功 + confidence ≥ 0.5 |

> source 白名单只有 `manual` + `vlm`（v2 Round 1 已完成收窄）。

### 6.3 唯一约束处理

`CaseKnowledgeTag` 有 `@@unique([caseId, nodeId, source])`：
- 重复 /process：upsert 更新 confidence/note，不报错
- VLM 和 manual 挂同一节点：两条记录（source 不同），都保留

### 6.4 transcript 回写守则

1. **人 > AI**：只有 `isPlaceholderTranscript(content) === true` 时才覆盖
2. **空不覆盖**：Case Analyzer 返回空字符串 → 保留占位，`transcript` 字段不返回
3. **无占位不创建**：transcript artifact 由 createCase 恒创建，理论上不会缺失

### 6.5 caseEvidenceCount 修复（distinct caseId 计数）

当前 map API 用 `groupBy + _count` 统计 tag 行数。同一 case 的 manual+vlm 双 source 会算 2 行但实际只 1 道题。

```typescript
// 旧（行数计数，会算重）：
const evidenceRows = await prisma.caseKnowledgeTag.groupBy({
  by: ['nodeId'], where: { case: { studentId } }, _count: { nodeId: true },
});

// 新（distinct caseId 计数）：
const evidenceRows = await prisma.caseKnowledgeTag.findMany({
  where: { case: { studentId } },
  select: { nodeId: true, caseId: true },
  distinct: ['nodeId', 'caseId'],
});
const evidenceMap = new Map<string, number>();
for (const r of evidenceRows) {
  evidenceMap.set(r.nodeId, (evidenceMap.get(r.nodeId) ?? 0) + 1);
}
```

---

## 7. 前端状态和文案

### 7.1 采集页状态机

```
idle
  → saving (POST /cases)
  → saved (201，caseId 返回)
  → processing (调 POST /cases/:id/process，同步等待，平均 30s)
  → processed (收到 200 结果)
    ├─ success + 有 transcript + 有 tags → "转写好了 · 可能属于：XXX"
    ├─ success + 无 transcript + 有 tags → "可能属于：XXX"（音频 skipped 或空转写）
    ├─ success + 有 transcript + 无 tags → "转写好了 · 这题不太好分类"
    ├─ success + 无 transcript + 无 tags → "整理好了，但不太好分类，可以手动挂"
    ├─ failed → "识别没接上，可以手动整理"
    └─ timeout → "整理超时了，可以重试或手动整理"
  → error (/process 调用失败)
```

### 7.2 UI 文案（守 OPS §4 措辞铁律）

| 状态 | 文案 | 备注 |
|------|------|------|
| saving | "正在收…" | 已有 |
| processing | "正在整理这题…" | 不说"诊断"，30s 不是秒出 |
| success + 转写 + 标签 | "转写好了 · 可能属于：一次函数图像" | "可能"留余地 |
| success + 仅标签 | "可能属于：一次函数图像" | 音频 skipped 不提 |
| success + 仅转写 | "转写好了 · 这题不太好分类" | |
| success + 都无 | "整理好了，但不太好分类，可以手动挂" | |
| failed | "识别没接上，可以手动整理" | 不假装 |
| timeout | "整理超时了，可以重试或手动整理" | 可重试 |

**禁用词**：诊断/已诊断/薄弱/得分/掌握/失败（用"没接上"代替"失败"）

### 7.3 "我的话" tab 升级

- transcript artifact content 不再是"尚未转写" → `TranscriptionPanel` 切到 `editable=true`
- 显示真实转写文本 + 底部标注"转写仅供参考，原音为准"
- 原音回放：`<audio controls>` 标签，src 用 audio_note 的 Base64
- 音频 skipped 时保留"尚未转写"占位 + 提示"语音暂未转写"

### 7.4 知识地图列表升级

- VLM 标签（source="vlm"）→ 节点名 chip + "AI 候选"小角标
- manual 标签 → 节点名 chip + "手动"小角标（已有）
- 用户可手动修正：挂 manual 标签（与 VLM 共存，source 不同不冲突）
- **低置信候选不在此展示**（未持久化，仅 /process 即时响应中有）

### 7.5 列表 API 扩展

`GET /api/nana/cases` 扩展返回真实值：

```typescript
const tagCount = await prisma.caseKnowledgeTag.count({ where: { caseId: c.id } });
const transcriptArt = c.artifacts.find(a => a.type === "transcript");
const transcriptReady = transcriptArt ? !isPlaceholderTranscript(transcriptArt.content) : false;
// tagCount, tagStatus: tagCount > 0 ? 'tagged' : 'untagged', transcriptReady
```

> 只 select transcript 的 `type + content`，不取 question_image/audio_note 大字段。

---

## 8. 失败处理

### 8.1 失败矩阵

| 场景 | status | audioStatus | UI 文案 | 数据写入 |
|------|--------|-------------|---------|----------|
| 正常完成 + 有转写 + 有候选 | success | success | "转写好了 · 可能属于：XXX" | transcript 回写 + vlm tag |
| 正常完成 + 无转写 + 有候选 | success | skipped/success | "可能属于：XXX" | 仅 vlm tag |
| 正常完成 + 有转写 + 无候选 | success | success | "转写好了 · 这题不太好分类" | 仅 transcript |
| 正常完成 + 都空 | success | skipped/success | "整理好了，但不太好分类" | 无写入 |
| Case Analyzer 超时 | timeout | timeout | "整理超时了，可以重试" | 无写入 |
| Case Analyzer 报错 | failed | failed | "识别没接上，可以手动整理" | 无写入 |
| JSON 解析失败 | failed | failed | "识别没接上，可以手动整理" | 无写入 |
| 无题图 | failed | skipped | "缺少题图，无法分析" | 无写入 |
| 无音频 | success | skipped | "可能属于：XXX" | 仅 vlm tag |
| 音频格式不支持 (webm/mp4) | success | skipped | "可能属于：XXX" | 仅 vlm tag |

### 8.2 失败处理原则

1. **不静默**（铁律 6）：失败有日志 + 返回 error 原因
2. **不假装**（铁律 6）：失败时 UI 说"没接上"，不说"已完成"
3. **可重试**：/process 允许重复调用，用户可重试
4. **可手动修正**：失败后用户仍可手动挂知识点（Stage 2 已有）

---

## 9. 环境变量

### 9.1 新增环境变量

```env
# ── 火山方舟（豆包）AI 配置 ──
VOLCENGINE_API_KEY=""
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"

# Lite 模型（一体化 Case Analyzer）
LITE_ENDPOINT_ID=""
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"

# Case Analyzer 超时（毫秒），默认 60000
CASE_ANALYZER_TIMEOUT_MS="60000"

# VLM 自动挂标签的置信度阈值，默认 0.5
VLM_CONFIDENCE_THRESHOLD="0.5"
```

> v3 不再需要 `PRO_ENDPOINT_ID` / `PRO_MODEL_NAME`（Pro 不进 v1 主路径）。
> 如果 `.env.example` 中已有这些变量（v2 追加的），保留但标注"v3 备用，v1 不使用"。

### 9.2 安全要求（铁律 4）

- 所有 Key 只放 `.env`，**绝不写入代码、commit message、文档**
- `.env` 已在 `.gitignore` 中
- `.env.example` 只写变量名和空值/默认值
- 提交前 `git status` 确认没有 .env 被 staged
- **生产环境**：在服务器 `/opt/nana/.env` 手动写入（已确认当前 4 个变量全部 missing）

### 9.3 生产环境前置条件

> **执行前必须确认**：服务器 `/opt/nana/.env` 已配置以下变量：
> - `VOLCENGINE_API_KEY` ← 火山方舟控制台获取
> - `VOLCENGINE_BASE_URL` ← 默认 `https://ark.cn-beijing.volces.com/api/v3`
> - `LITE_ENDPOINT_ID` ← 方舟控制台创建推理接入点（或用 `LITE_MODEL_NAME` fallback）
> - `LITE_MODEL_NAME` ← `doubao-seed-2-0-lite-260215`
>
> 配置后需 `docker compose -f docker-compose.prod.yml up -d` 重启容器生效。

---

## 10. 测试方案

### 10.1 测试分层

| 层级 | 范围 | 工具 | 必需性 | CI |
|------|------|------|--------|:--:|
| 单元测试 | case-analyzer.ts | vitest + mock OpenAI client | **v1 必需** | ✅ |
| 集成测试 | /process 端点 | vitest + mock analyzeCase | **v1 必需** | ✅ |
| Smoke test | 真实 provider | 手动脚本 | 加分项 | ❌ |

### 10.2 Mock 单元测试（`case-analyzer.test.ts`）

```typescript
// mock OpenAI client.chat.completions.create
// 验证：
// 1. 正常返回 JSON → 解析出 transcript + questionSummary + candidates + feedback
// 2. markdown 包裹的 JSON → strip 后解析
// 3. JSON 格式损坏 → jsonrepair 兜底 → 解析成功
// 4. JSON 不可修复 → throw CaseAnalyzerJsonError
// 5. 候选 nodeId 不在 48 节点列表 → 过滤掉
// 6. 空候选 → 返回空数组
// 7. 模型 5xx → throw CaseAnalyzerError
// 8. 超时 → throw CaseAnalyzerTimeoutError
// 9. 有音频 + 有图片 → messages.content 含 input_audio + image_url
// 10. 无音频 → messages.content 只含 image_url（不传 input_audio）
```

### 10.3 /process 端点集成测试（`process-api.test.ts`）

```typescript
// mock analyzeCase
// 验证：
// 1. 有题图+音频(WAV) → Case Analyzer 被调用，transcript 回写 + vlm tag 落库
// 2. 有题图+音频(webm) → audioStatus="skipped"，Case Analyzer 不传音频，仍跑图片分析
// 3. 有题图+无音频 → audioStatus="skipped"，Case Analyzer 正常跑
// 4. 无题图 → status="failed"，不调 Case Analyzer
// 5. Case Analyzer 超时 → status="timeout"，无写入
// 6. Case Analyzer 报错 → status="failed"，无写入
// 7. 低置信候选 → 不落库，返回 lowConfidenceCandidates
// 8. 跨用户 → 404
// 9. transcript 占位覆盖逻辑：非占位不覆盖
// 10. 重复 /process → upsert 更新（不报错）
```

### 10.4 真实 Provider Smoke Test（手动，不进 CI）

```bash
# 前置：.env 已配置 VOLCENGINE_API_KEY + LITE_ENDPOINT_ID
npx tsx scripts/stage3-smoke-test.ts --caseId=<test-case-id>
# 调真实 /process 端点，打印 Case Analyzer 结果，验证端到端
```

> Spike 脚本 `scripts/stage3-spike-v3.ts` 已验证 API 连通性，smoke test 验证端到端集成。

---

## 11. 成本和限流

### 11.1 豆包 Lite 定价

| 模型 | 输入 | 输出 |
|------|------|------|
| doubao-seed-2-0-lite-260215 | ¥0.6/百万 tokens | ¥3.6/百万 tokens |

### 11.2 单次调用成本（Spike 实测）

Spike 7 次真实调用的 token 用量：

| 测试 | 输入 tokens | 输出 tokens | 总 tokens | 成本（¥） |
|------|-----------|-----------|----------|----------|
| Lite + 图 only | 2,355 | 1,190 | 3,545 | 0.0057 |
| Lite + 图 + WAV | 2,365 | 1,269 | 3,634 | 0.0060 |
| clear-printed | 2,371 | 1,357 | 3,728 | 0.0061 |
| with-handwriting | 2,371 | 1,874 | 4,245 | 0.0082 |
| tilted-partial | 2,371 | 1,081 | 3,452 | 0.0054 |
| **平均** | **2,367** | **1,354** | **3,721** | **¥0.006** |

- 输入：~2,367 tokens（图片 + 提示词 + 48 节点列表）
- 输出：~1,354 tokens（结构化 JSON）
- **单次成本 ≈ ¥0.006**

> vs v2 双管线（Pro VLM ~¥2.41/次 + Lite ASR ~¥0.09/次 = ~¥2.5/次），v3 成本降低 **99.8%**。
>
> **注意**：v2 的 ¥2.5/次是粗略估算（图片 token 估算不确定），v3 的 ¥0.006/次是 Spike 实测 token 用量计算。两者口径不同但量级差异巨大，v3 成本优势明确。

### 11.3 限流策略

**v1（单用户，无限流）**：
- 单用户每天几道题，不需要限流
- /process 不做 rate limit

**v2+（多用户）**：
- 每用户每小时最多 20 次 /process
- 超限返回 429

### 11.4 成本监控

- 每次 /process 记录 `result.usage` 到日志
- 后续可加独立成本追踪表

---

## 12. 明确不写 StudentNodeState

### 12.1 为什么不写

Stage 3 只做"拍照 + 录音 → AI 轻分类"，**不是诊断**：
- 没有做题、没有判对错
- Case Analyzer 只判断"这题考什么知识点"，不判断"学生会不会"
- 挂 CaseKnowledgeTag 是弱证据（"收过题"），不是强证据（"掌握了"）

### 12.2 知识地图效果

VLM 写 CaseKnowledgeTag 后，`caseEvidenceCount` 自动 +1（需先修 distinct caseId 计数）：
- 节点出现在"收过题"琥珀色分组（`caseEvidenceCount > 0` → collected 组）
- **不出现绿色**（`status` 仍是 `untested`，不写 StudentNodeState）
- **不进学习前沿**（前沿只取 tier=A 且 status≠stable 的节点）

```
Stage 3 写入：           Stage 3 不碰：
┌──────────────────┐     ┌──────────────────────┐
│ CaseKnowledgeTag │     │ StudentNodeState     │
│ (source="vlm",   │     │ (status="untested",  │
│  confidence)     │     │  masteryProb=0.0)    │
└──────────────────┘     └──────────────────────┘
        │                          │
        ▼                          ▼
  caseEvidenceCount            status / masteryProb
  (弱标记，琥珀色)            (强状态，绿色)
```

---

## 13. 回滚方式

### 13.1 代码回滚

```bash
# 查看当前镜像
docker inspect wrong-notebook --format '{{.Config.Image}}'

# 回滚到 v3 之前的 commit（Stage 2 最后状态）
# 方法一：git revert（安全，不删历史）
git revert <v3-first-commit>..<v3-last-commit>
git push origin main
# 等 CI 构建完成 → 服务器 pull + up

# 方法二：镜像回滚（更快，不改代码）
echo 'NANA_IMAGE=ghcr.io/jewellury/nanawrongbook:sha-<Stage2最后commit>' >> /opt/nana/.env
docker compose -f docker-compose.prod.yml up -d
```

### 13.2 数据回滚

v3 只新增数据（CaseKnowledgeTag source="vlm" + transcript artifact 更新），不改表结构。

```bash
# 如需清除 v3 写入的 vlm 标签（保留 manual 标签）：
sqlite3 /opt/nana/data/dev.db "DELETE FROM CaseKnowledgeTag WHERE source='vlm';"

# 如需恢复 transcript 占位（需逐条处理，谨慎）：
# 不建议批量恢复，人工内容不应被覆盖（isPlaceholderTranscript 守护）
```

### 13.3 功能降级

如果 v3 上线后发现 Lite 候选质量不够：
1. 前端把 VLM 标签改为"仅供参考，需手动确认"（不自动挂，只展示候选）
2. 降低 `VLM_CONFIDENCE_THRESHOLD` 到 0.9（几乎不自动挂）
3. 完全禁用 /process 端点（回退到 Stage 2 纯手动模式）

---

## 14. 文件变更清单

| 文件 | 操作 | 说明 | 风险 |
|------|------|------|:--:|
| `src/lib/nana/case-analyzer.ts` | **新增** | 一体化 Case Analyzer | 低 |
| `src/app/api/nana/cases/[id]/process/route.ts` | **新增** | /process 端点 | 中 |
| `src/app/api/diagnosis/map/route.ts` | **修改** | caseEvidenceCount 改 distinct caseId | 低 |
| `src/lib/nana/nana-api-client.ts` | 修改 | 加 processCase(id) | 低 |
| `src/app/nana/capture/page.tsx` | 修改 | 保存后调 /process | 中 |
| `src/components/nana/capture/transcription-panel.tsx` | 修改 | editable=true | 低 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | VLM 标签展示 | 低 |
| `src/app/api/nana/cases/route.ts` | 修改 | GET 列表扩展 | 低 |
| `.env.example` | 修改（⚠️上游文件） | 追加 VOLCENGINE_* | 低 |
| `src/__tests__/unit/nana/case-analyzer.test.ts` | **新增** | mock 测试 | 低 |
| `src/__tests__/integration/nana/process-api.test.ts` | **新增** | 集成测试 | 低 |
| `src/lib/nana/asr-transcribe.ts` | **废弃**（保留文件，不 import，不进 v3 主路径） | v2 遗留 | 低 |
| `src/lib/nana/vlm-classify.ts` | **废弃**（保留文件，不 import，不进 v3 主路径） | v2 遗留 | 低 |

> **v2 遗留文件说明**：`asr-transcribe.ts` 和 `vlm-classify.ts` 是 v2 双管线方案创建的，v3 一体化方案不再使用。保留文件不删除（避免 git 历史混乱），但 execute-agent 不应 import 或引用它们。详细处置见 [产品行为手册 §9](../product/nana-product-behavior-manual-v1.md)。

**不涉及 Prisma schema 结构改动**。
**不涉及上游文件修改**（除 `.env.example` 追加）。

---

## 15. 验收标准

### 15.1 第一版验收清单

| # | 验收项 | 操作步骤 | 预期结果 |
|---|--------|----------|----------|
| 1 | 保存题图和录音后能触发识别 | 拍题 + 录音 → 收好 → 等待 | 自动调 /process，显示"正在整理这题…" |
| 2 | 录音能生成文字（WAV 格式） | 录一段话 → 保存 → 等 /process 完成 → "我的话" tab | 显示真实转写文本 + "转写仅供参考" |
| 3 | webm 录音跳过转写 | 浏览器录 webm → 保存 → /process | audioStatus=skipped，UI 不提转写，图片分析正常 |
| 4 | 题图能产生候选知识点 | 拍一道题 → 保存 → 等 /process 完成 | 显示"可能属于：XXX"（1-3 个候选） |
| 5 | 知识地图出现琥珀色收过题反馈 | 拍题 + /process 完成 → 知识地图 | 对应知识点出现在"收过题"琥珀色分组 |
| 6 | caseEvidenceCount 不算重 | 同一 case 同节点挂 manual+vlm → 知识地图 | caseEvidenceCount = 1（不是 2） |
| 7 | 用户能看到初步整理结果 | 知识地图 → "最近拍过的题" → 点开 case | 题图 + 转写 + VLM 标签 + 鼓励文案 |
| 8 | 用户能手动改 | 点 VLM 标签 → 手动选另一个知识点 | 可挂 manual 标签，VLM 标签共存 |
| 9 | Case Analyzer 失败不假装 | mock 报错 → /process | UI 显示"识别没接上，可以手动整理" |
| 10 | 超时可重试 | mock 超时 → /process | UI 显示"整理超时了，可以重试" |
| 11 | 低置信不硬塞 | confidence=0.3 → /process | 不自动挂，即时响应返回候选，刷新后消失 |
| 12 | 节点不变绿 | /process 完成后看知识地图 | 节点在"收过题"琥珀色组，不在绿色组 |

### 15.2 构建验收

- [ ] `npm.cmd run build` 通过
- [ ] 单元测试全部通过（case-analyzer + process-api）
- [ ] `git status` 干净

### 15.3 Git 收口

- commit 1: `feat(nana): Case Analyzer 一体化多模态 lib + mock 单测`（case-analyzer.ts + test）
- commit 2: `feat(nana): /process 端点 + 集成测试`（process/route.ts + test）
- commit 3: `fix(nana): caseEvidenceCount 改 distinct caseId 计数`（map/route.ts）
- commit 4: `feat(nana): 前端识别状态 + 转写展示 + 候选确认`（capture page + transcription-panel + recent-cases-list + nana-api-client）
- commit 5: `feat(nana): 列表 API 扩展 + .env.example 更新`（cases route GET + .env.example）

---

## 16. 实施顺序

```
Round 1: Case Analyzer lib + mock 单测（低风险，不碰前端/端点）
  ├─ case-analyzer.ts
  ├─ case-analyzer.test.ts
  ├─ 废弃 asr-transcribe.ts / vlm-classify.ts（保留文件，不引用）
  └─ npm.cmd run build + test 验证

Round 2: /process 端点 + map API 修复 + 集成测试（中风险，依赖 Round 1）
  ├─ process/route.ts
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

> **Round 1 不碰前端、不新增 /process、不改生产流程。**
> **所有真实 provider 调用只在手动 smoke/脚本里跑，不进 CI；CI 只跑 mock。**
> **Round 1 完成后先 audit，再决定是否进入 Round 2。**

---

## 17. 前置确认项

> 以下项在 execute-agent 执行前需要确认：

1. ✅ **Spike 已验证**：Lite 一体化可行（7/7 zod 通过，0 幻觉）
2. ✅ **音频格式已验证**：WAV 支持（Spike 实测），webm/mp4 不支持（Round 0 验证），mp3/flac/ogg/m4a/aac 官方支持但未实测
3. ✅ **source 白名单已收窄**：manual + vlm（v2 Round 1 完成）
4. ✅ **transcript-utils 已就绪**：isPlaceholderTranscript helper（v2 Round 1 完成）
5. ✅ **产品手册已编写**：用户手册 + 行为手册（评审通过后进入 execute）
6. ⬜ **生产环境环境变量**：服务器 `/opt/nana/.env` 需配置 4 个变量（当前全部 missing）
7. ⬜ **.env.example 追加**：Round 4 执行

---

## 18. 即时展示与持久化边界

> 以下明确哪些数据只即时展示、哪些持久化、哪些后续历史可见。详见 [产品行为手册 §7](../product/nana-product-behavior-manual-v1.md)。

| 数据 | 即时展示 | 持久化 | 历史可见 | 说明 |
|------|:--------:|:------:|:--------:|------|
| transcript（转写文字） | ✅ | ✅ | ✅ | 回写 Artifact，后续打开 case 可见 |
| knowledgeCandidates（confidence≥0.5） | ✅ | ✅ | ✅ | 写 CaseKnowledgeTag，知识地图/标签面板可见 |
| knowledgeCandidates（confidence<0.5） | ✅ | ❌ | ❌ | 只在 /process 响应中返回，刷新即失 |
| questionSummary（题目摘要） | ✅ | ❌ | ❌ | v1 只即时展示。**如需历史可见，v2 需新增字段或表** |
| studentFacingFeedback（鼓励文案） | ✅ | ❌ | ❌ | v1 只即时展示。**如需历史可见，v2 需新增字段或表** |
| tags（已有标签列表） | ✅ | ✅ | ✅ | 从 CaseKnowledgeTag 查，含 manual + vlm |

### 设计决策：questionSummary 和 feedback 为什么 v1 不持久化？

1. **最小闭环原则**：v1 只做"转写 + 轻分类"，额外输出是加分项
2. **表结构不变**：不新增字段/表，降低 v1 复杂度
3. **后续路径**：如果产品验证有价值，v2 可在 Case 表加 `questionSummary`/`feedback` 字段，或新增 `CaseAiResult` 表
4. **用户影响**：即时展示时用户能看到，刷新后消失不影响核心功能
