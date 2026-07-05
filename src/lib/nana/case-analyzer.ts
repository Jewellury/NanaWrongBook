/**
 * Case Analyzer — Stage 3 v3-revised 一体化 Case 分析器
 *
 * 单次 API 调用同时处理题图 + 音频（如有），返回 7 字段结构化 JSON。
 * - 题图：image_url 类型
 * - 音频：input_audio 类型（仅支持 wav/mp3/flac/ogg/m4a/aac，webm/mp4 降级为 skipped）
 * - 超时 60s（AbortController）
 * - Zod 校验 7 字段 JSON
 * - 清单外 topicId/nodeId 过滤
 *
 * 设计决策（v3-revised）：
 * - 一体化：单次调用替代 v2 的 ASR + VLM 双管线
 * - 双输出：同时返回 textbookTopicCandidates + knowledgeNodeCandidates
 * - 音频降级：webm/mp4 不转码，直接 skipped
 * - 失败 throw CaseAnalyzerError（由调用方 catch，不静默）
 *
 * 参考 v2 残留代码（TD-5）asr-transcribe.ts / vlm-classify.ts 的实现模式，
 * 但不 import。
 */

import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger("lib:nana:case-analyzer");

// ─── 类型定义 ──────────────────────────────────────────

export interface CaseAnalyzerInput {
  /** 含 data:image/...;base64, 前缀的完整 Data URL */
  imageDataUrl: string;
  /** 不含 data: 前缀的纯 Base64 音频数据（可选） */
  audioBase64?: string;
  /** 音频 MIME 类型，如 "audio/wav"、"audio/webm"（可选） */
  audioFormat?: string;
  /** 48 个知识点列表（id + name） */
  nodes: { id: string; name: string }[];
  /** 16 个课本章节列表（id + name + chapter + section） */
  textbookTopics: { id: string; name: string; chapter: string; section: string }[];
}

export interface TextbookCandidate {
  topicId: string;
  confidence: number;
  reason: string;
}

export interface CaseAnalyzerCandidate {
  nodeId: string;
  confidence: number;
  reason: string;
}

export type AudioStatus = "success" | "skipped" | "failed" | "timeout";

export interface CaseAnalyzerResult {
  transcript: string;
  questionSummary: string;
  textbookTopicCandidates: TextbookCandidate[];
  knowledgeNodeCandidates: CaseAnalyzerCandidate[];
  initialFeedback: string;
  possibleMistakeReason: string;
  nextActionSuggestion: string;
  /** 音频处理状态（成功时为 skipped 或 success；失败/超时由调用方通过 deriveAudioStatus 推导） */
  audioStatus: AudioStatus;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ─── 错误类型 ──────────────────────────────────────────

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

export class CaseAnalyzerParseError extends CaseAnalyzerError {
  /** 保留模型原始输出，便于调试 */
  rawOutput?: string;
  constructor(message: string, rawOutput?: string) {
    super(message);
    this.name = "CaseAnalyzerParseError";
    this.rawOutput = rawOutput;
  }
}

// ─── Zod Schema（§4.4）─────────────────────────────────

const TextbookCandidateSchema = z.object({
  topicId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const NodeCandidateSchema = z.object({
  nodeId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const CaseAnalyzerSchema = z.object({
  transcript: z.string(),
  questionSummary: z.string(),
  textbookTopicCandidates: z.array(TextbookCandidateSchema).max(3),
  knowledgeNodeCandidates: z.array(NodeCandidateSchema).max(3),
  initialFeedback: z.string(),
  possibleMistakeReason: z.string(),
  nextActionSuggestion: z.string(),
});

// ─── 音频格式映射 ──────────────────────────────────────

/**
 * 豆包 input_audio.format 实际支持的格式（Round 0 预验证确认）。
 * webm/mp4 不在列表中（API 明确拒绝）。
 *
 * 来源：Round 0 预验证脚本 + asr-transcribe.ts（TD-5）参考
 */
const SUPPORTED_AUDIO_FORMATS = new Set([
  "wav",
  "mp3",
  "flac",
  "ogg",
  "m4a",
  "aac",
]);

/**
 * MIME → 豆包 format 标签映射。
 * 只有映射后格式在 SUPPORTED_AUDIO_FORMATS 中的才被接受。
 */
const MIME_TO_FORMAT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  // webm 和 mp4 不映射（Round 0 验证不支持）
};

/**
 * 获取豆包支持的 format 标签。
 * 不支持的 mime 返回 null。
 */
function getAudioApiFormat(mime: string): string | null {
  const format = MIME_TO_FORMAT[mime.toLowerCase()];
  if (format && SUPPORTED_AUDIO_FORMATS.has(format)) {
    return format;
  }
  return null;
}

// ─── 音频状态推导 ──────────────────────────────────────

/**
 * 推导音频状态。
 *
 * 供 /process API 在 catch CaseAnalyzerError 时使用，
 * 也供成功路径验证 audioStatus 一致性。
 *
 * - 未提供音频或格式不支持 → "skipped"
 * - 无错误 → "success"
 * - CaseAnalyzerTimeoutError → "timeout"
 * - 其他错误 → "failed"
 */
export function deriveAudioStatus(
  audioProvided: boolean,
  audioFormatSupported: boolean,
  error?: unknown,
): AudioStatus {
  if (!audioProvided || !audioFormatSupported) return "skipped";
  if (!error) return "success";
  if (error instanceof CaseAnalyzerTimeoutError) return "timeout";
  return "failed";
}

// ─── JSON 解析辅助 ─────────────────────────────────────

/**
 * 从模型输出中提取 JSON。
 * 处理 markdown 代码块包裹（```json ... ```）的情况。
 */
function extractJson(raw: string): string {
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return raw.trim();
}

// ─── 提示词构造（§4.3）────────────────────────────────

function buildPrompt(
  nodes: { id: string; name: string }[],
  textbookTopics: { id: string; name: string; chapter: string; section: string }[],
): string {
  const topicList = textbookTopics
    .map((t) => `- ${t.id}: ${t.section} ${t.name}（${t.chapter}）`)
    .join("\n");
  const nodeList = nodes.map((n) => `- ${n.id}: ${n.name}`).join("\n");

  return `你是高中数学错题采集助手。请看这道数学题的图片{若有音频则为学生口述思路}, 返回结构化 JSON。

【你的任务】
1. 如果有音频，转写学生语音为 transcript（口语，保留"嗯/然后"等）。无音频则 transcript 留空字符串。
2. 用一句话概括题目大意 questionSummary（若公式看不清就描述可见部分，不要编造）。
3. 从下面的课本章节清单里选出最多 3 个相关分类 textbookTopicCandidates，禁止发明清单外的 topicId：
${topicList}
   每个给 confidence(0~1) 和一句 reason。
4. 从下面的系统知识点清单里选出最多 3 个相关知识点 knowledgeNodeCandidates，禁止发明清单外的 nodeId：
${nodeList}
   每个给 confidence(0~1) 和一句 reason。
5. 给一句温和、鼓励式的 initialFeedback（面向学生，不透露答案对错，不批评）。
6. possibleMistakeReason：如果从图片或音频中能看到明显的错误痕迹，用一句话提示可能的方向（如"可能在符号变换时出了差错"）。不确定则留空。不做诊断，不给确定性结论。
7. nextActionSuggestion：给一句具体的下一步建议，格式为"回看 XX 课本章节 + 一个小动作"（如"回看 2.3 一元二次不等式，重点检查移项后不等号方向"）。**不要写"看视频"**——v1 没有资源库，不承诺视频链接。不确定则留空。

【纪律】
- 只做"大致属于哪几个知识点"的判断，不做深度归因
- 不解题、不给答案
- topicId 必须从课本章节清单中选，不能自创
- nodeId 必须从系统知识点清单中选，不能自创
- 如果图片不清晰或不是数学题，textbookTopicCandidates 和 knowledgeNodeCandidates 都返回空数组
- possibleMistakeReason 不做确定性诊断，用"可能""也许"等措辞
- 严禁使用"诊断""薄弱""掌握""得分"等词汇

【输出格式（严格 JSON，不要 markdown 代码块）】
{
  "transcript": "",
  "questionSummary": "",
  "textbookTopicCandidates": [{"topicId": "TB-010", "confidence": 0.85, "reason": "题目涉及函数单调性判断"}],
  "knowledgeNodeCandidates": [{"nodeId": "M2a-13", "confidence": 0.85, "reason": "题目涉及用定义判断单调性"}],
  "initialFeedback": "",
  "possibleMistakeReason": "",
  "nextActionSuggestion": ""
}`;
}

// ─── 核心函数 ──────────────────────────────────────────

/**
 * 一体化 Case Analyzer。
 *
 * 单次 API 调用同时处理题图 + 音频（如有），返回 7 字段结构化 JSON。
 *
 * - 题图：image_url 类型
 * - 音频：input_audio 类型（仅支持 wav/mp3/flac/ogg/m4a/aac，webm/mp4 降级为 skipped）
 * - 超时 60s（AbortController）
 * - Zod 校验 7 字段 JSON
 * - 清单外 topicId/nodeId 过滤
 * - 失败 throw CaseAnalyzerError（由调用方 catch，不静默）
 *
 * @param input.imageDataUrl - 含 data:image/...;base64, 前缀的完整 Data URL
 * @param input.audioBase64 - 不含 data: 前缀的纯 Base64 音频数据（可选）
 * @param input.audioFormat - 音频 MIME 类型（可选）
 * @param input.nodes - 48 个知识点列表
 * @param input.textbookTopics - 16 个课本章节列表
 * @returns CaseAnalyzerResult（含 7 字段 + audioStatus + usage）
 * @throws {CaseAnalyzerError} 调用失败（含超时、解析错误）
 */
export async function analyzeCase(input: CaseAnalyzerInput): Promise<CaseAnalyzerResult> {
  const { imageDataUrl, audioBase64, audioFormat, nodes, textbookTopics } = input;

  // ── 输入校验 ──
  if (!imageDataUrl) {
    throw new CaseAnalyzerError("题图 Data URL 为空");
  }
  if (!nodes || nodes.length === 0) {
    throw new CaseAnalyzerError("知识点节点列表为空");
  }
  if (!textbookTopics || textbookTopics.length === 0) {
    throw new CaseAnalyzerError("课本章节列表为空");
  }

  // ── 音频格式检查 ──
  const audioProvided = !!(audioBase64 && audioFormat);
  const audioApiFormat = audioProvided ? getAudioApiFormat(audioFormat!) : null;
  const audioSkipped = !audioProvided || !audioApiFormat;

  if (audioProvided && !audioApiFormat) {
    logger.warn(
      { audioFormat, audioBase64Length: audioBase64?.length },
      "音频格式不被支持，降级为 skipped（v1 不转码）",
    );
  }

  // ── 构造 OpenAI client ──
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    throw new CaseAnalyzerError("未设置 VOLCENGINE_API_KEY 环境变量");
  }
  const baseURL = process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const model =
    process.env.PRO_ENDPOINT_ID ||
    process.env.PRO_MODEL_NAME ||
    "doubao-seed-2-0-pro-260215";

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { "User-Agent": "nana-case-analyzer/1.0" },
  });

  // ── 超时控制（60s，一体化调用比单独 VLM 多给时间）──
  const timeoutMs = parseInt(process.env.CASE_ANALYZER_TIMEOUT_MS || "60000", 10);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  // ── 构造提示词 + 白名单 ──
  const prompt = buildPrompt(nodes, textbookTopics);
  const validTopicIds = new Set(textbookTopics.map((t) => t.id));
  const validNodeIds = new Set(nodes.map((n) => n.id));

  // ── 构造消息内容（text + image + optional audio）──
  const contentParts: ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ];

  if (!audioSkipped && audioBase64) {
    contentParts.push({
      type: "input_audio",
      input_audio: {
        data: audioBase64,
        // OpenAI SDK 类型只允许 "wav"|"mp3"，但火山方舟豆包实际支持更多格式
        // （Round 0 预验证确认），用 as any 绕过 SDK 类型限制
        format: audioApiFormat as any,
      },
    });
  }

  try {
    logger.info(
      {
        model,
        nodeCount: nodes.length,
        topicCount: textbookTopics.length,
        audioSkipped,
        audioFormat: audioSkipped ? null : audioApiFormat,
        imageDataUrlLength: imageDataUrl.length,
      },
      "Case Analyzer 调用开始",
    );

    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          {
            role: "user",
            content: contentParts,
          },
        ],
        max_tokens: 2048,
      },
      { signal: controller.signal },
    );

    const rawOutput = response.choices[0]?.message?.content || "";
    logger.info(
      {
        rawOutputLength: rawOutput.length,
        usage: response.usage,
      },
      "Case Analyzer 调用成功",
    );

    // ── 空结果检查 ──
    if (!rawOutput.trim()) {
      throw new CaseAnalyzerParseError("Case Analyzer 返回空结果", rawOutput);
    }

    // ── 提取 + 解析 JSON ──
    const jsonStr = extractJson(rawOutput);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      throw new CaseAnalyzerParseError(
        `Case Analyzer JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
        rawOutput,
      );
    }

    // ── Zod 校验 ──
    const parseResult = CaseAnalyzerSchema.safeParse(parsed);
    if (!parseResult.success) {
      throw new CaseAnalyzerParseError(
        `Case Analyzer JSON 校验失败: ${parseResult.error.message}`,
        rawOutput,
      );
    }

    const validated = parseResult.data;

    // ── 清单外 topicId/nodeId 过滤（防 AI 幻觉）──
    const filteredTopicCandidates: TextbookCandidate[] = [];
    for (const c of validated.textbookTopicCandidates) {
      if (!validTopicIds.has(c.topicId)) {
        logger.warn({ topicId: c.topicId }, "清单外 topicId，过滤掉");
        continue;
      }
      filteredTopicCandidates.push(c);
    }

    const filteredNodeCandidates: CaseAnalyzerCandidate[] = [];
    for (const c of validated.knowledgeNodeCandidates) {
      if (!validNodeIds.has(c.nodeId)) {
        logger.warn({ nodeId: c.nodeId }, "清单外 nodeId，过滤掉");
        continue;
      }
      filteredNodeCandidates.push(c);
    }

    logger.info(
      {
        topicCandidates: filteredTopicCandidates.length,
        nodeCandidates: filteredNodeCandidates.length,
        audioStatus: audioSkipped ? "skipped" : "success",
      },
      "Case Analyzer 解析完成",
    );

    return {
      transcript: validated.transcript,
      questionSummary: validated.questionSummary,
      textbookTopicCandidates: filteredTopicCandidates,
      knowledgeNodeCandidates: filteredNodeCandidates,
      initialFeedback: validated.initialFeedback,
      possibleMistakeReason: validated.possibleMistakeReason,
      nextActionSuggestion: validated.nextActionSuggestion,
      audioStatus: audioSkipped ? "skipped" : "success",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  } catch (err: unknown) {
    // 超时（AbortError）
    if (err instanceof Error && err.name === "AbortError") {
      throw new CaseAnalyzerTimeoutError();
    }

    // 已经是 CaseAnalyzerError 的直接抛（包括 ParseError、TimeoutError）
    if (err instanceof CaseAnalyzerError) throw err;

    // 其他未知错误
    throw new CaseAnalyzerError(
      `Case Analyzer 调用失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
