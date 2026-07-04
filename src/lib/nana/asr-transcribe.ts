/**
 * ASR 音频转写薄封装（Stage 3 Round 1）
 *
 * 调火山方舟豆包 Seed 2.0 Lite 做音频转写。
 * 使用 OpenAI 兼容接口（input_audio 类型）。
 *
 * 设计决策：
 * - 文件式而非流式（采集壳录音 ≤60s，整文件提交一次）
 * - 超时 30s（AbortController）
 * - 失败 throw AsrError（由调用方 catch，不静默）
 *
 * Round 0 预验证结论（2026-07-04）：
 * - WAV: ✅ 豆包 Lite 支持
 * - webm: ❌ 不支持（API 报错 "audio format 'webm' is not supported"）
 * - mp4: ❌ 不支持（API 报错 "audio format 'mp4' is not supported"）
 *
 * 因此浏览器 MediaRecorder 产出的 webm/mp4 在 v1 降级为 skipped，
 * 不引入转码。ASR 只接受 API 实际支持的格式。
 */

import OpenAI from "openai";
import { createLogger } from "@/lib/logger";

const logger = createLogger("lib:nana:asr-transcribe");

// ─── 类型定义 ──────────────────────────────────────────

export interface AsrInput {
  /** 不含 data: 前缀的纯 Base64 音频数据 */
  audioBase64: string;
  /** MIME 类型，如 "audio/wav"、"audio/webm"、"audio/mp4" */
  mime: string;
}

export interface AsrResult {
  /** 转写文本（可能为空字符串） */
  transcript: string;
  /** 模型返回的置信度（如有） */
  confidence?: number;
}

// ─── 错误类型 ──────────────────────────────────────────

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
    super(`不支持的音频格式: ${mime}（豆包 Lite 不支持 webm/mp4，v1 降级为 skipped）`);
    this.name = "AsrUnsupportedFormatError";
  }
}

// ─── 格式映射 ──────────────────────────────────────────

/**
 * 豆包 Lite input_audio.format 实际支持的格式（Round 0 预验证确认）。
 * webm/mp4 不在列表中（API 明确拒绝）。
 *
 * 来源：Round 0 预验证脚本 scripts/stage3-asr-format-check.ts
 * 验证日期：2026-07-04
 */
const SUPPORTED_FORMATS = new Set([
  "wav",
  "mp3",
  "flac",
  "ogg",
  "m4a",
  "aac",
]);

/**
 * MIME → 豆包 format 标签映射。
 * 只有映射后格式在 SUPPORTED_FORMATS 中的才被接受。
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
  // "audio/webm": "webm",  // ❌ 不支持
  // "audio/mp4": "mp4",    // ❌ 不支持
};

/**
 * 获取豆包 Lite 支持的 format 标签。
 * 不支持的 mime 返回 null。
 */
function getApiFormat(mime: string): string | null {
  const format = MIME_TO_FORMAT[mime.toLowerCase()];
  if (format && SUPPORTED_FORMATS.has(format)) {
    return format;
  }
  return null;
}

// ─── 核心函数 ──────────────────────────────────────────

/**
 * 调火山方舟豆包 Lite 做音频转写。
 *
 * - 支持 wav/mp3/flac/ogg/m4a/aac（豆包 Lite 实际支持的格式）
 * - webm/mp4 不支持 → throw AsrUnsupportedFormatError（v1 降级，不转码）
 * - 超时 30s → throw AsrTimeoutError
 * - 失败 throw AsrError（由调用方 catch，不静默）
 *
 * @param input.audioBase64 - 不含 data: 前缀的纯 Base64 音频数据
 * @param input.mime - MIME 类型
 * @returns 转写结果（transcript 可能为空字符串）
 */
export async function asrTranscribe(input: AsrInput): Promise<AsrResult> {
  const { audioBase64, mime } = input;

  // 格式检查
  const format = getApiFormat(mime);
  if (!format) {
    throw new AsrUnsupportedFormatError(mime);
  }

  // 构造 OpenAI client
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    throw new AsrError("未设置 VOLCENGINE_API_KEY 环境变量");
  }
  const baseURL = process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const model =
    process.env.LITE_ENDPOINT_ID ||
    process.env.LITE_MODEL_NAME ||
    "doubao-seed-2-0-lite-260215";

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { "User-Agent": "nana-asr/1.0" },
  });

  // 超时控制
  const timeoutMs = parseInt(process.env.ASR_TIMEOUT_MS || "30000", 10);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logger.info({ mime, format, model, audioBase64Length: audioBase64.length }, "ASR 调用开始");

    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请把这段语音转写成文字，只输出转写结果，不要加任何解释。",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: format as "wav" | "mp3" | "flac" | "ogg" | "m4a" | "aac",
                },
              },
            ],
          },
        ],
        max_tokens: 2048,
      },
      { signal: controller.signal },
    );

    const transcript = response.choices[0]?.message?.content || "";
    logger.info(
      {
        transcriptLength: transcript.length,
        usage: response.usage,
      },
      "ASR 调用成功",
    );

    return { transcript };
  } catch (err: unknown) {
    // 超时
    if (err instanceof Error && err.name === "AbortError") {
      throw new AsrTimeoutError();
    }

    // OpenAI SDK 错误
    if (err instanceof AsrError) throw err;
    throw new AsrError(
      `ASR 调用失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
