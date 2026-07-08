/**
 * audio-utils — 音频元数据解析与格式工具
 *
 * 提供：
 * - parseAudioMeta：三层兼容解析 audio_meta artifact 内容
 * - needsTranscode：判断 MIME 是否需要 ffmpeg 转码
 *
 * 设计原则：
 * - 纯函数，无副作用，易于单元测试
 * - 兼容旧数据（分号格式）和新数据（JSON 格式）
 * - 不修改已有接口
 */

// ─── 类型定义 ──────────────────────────────────────────

export interface AudioMeta {
  mime?: string;
  durationSec?: number;
  sizeBytes?: number;
}

// ─── audio_meta 三层解析 ────────────────────────────────

/**
 * 解析 audio_meta artifact 内容，三层兼容：
 *
 * 1. 分号格式（当前生产格式）：
 *    "durationSec=10;mime=audio/webm;sizeBytes=12345"
 * 2. JSON 格式（未来可能）：
 *    '{"mime":"audio/webm","durationSec":10,"sizeBytes":12345}'
 * 3. 无法解析 → 返回空对象（调用方 fallback 到 Data URL MIME）
 *
 * 不抛异常，任何解析失败都安全降级为空对象。
 */
export function parseAudioMeta(content: string | null | undefined): AudioMeta {
  if (!content || typeof content !== "string") {
    return {};
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return {};
  }

  // 层 1：分号格式 key=val 或 key=val;key=val
  if (trimmed.includes("=") && !trimmed.startsWith("{")) {
    return parseSemicolonFormat(trimmed);
  }

  // 层 2：JSON 格式
  if (trimmed.startsWith("{")) {
    return parseJsonFormat(trimmed);
  }

  // 层 3：无法识别 → 空对象
  return {};
}

/**
 * 解析分号格式：key=val;key=val;...
 * 容错：单个 key=val 解析失败不影响其他字段。
 */
function parseSemicolonFormat(content: string): AudioMeta {
  const result: AudioMeta = {};
  const pairs = content.split(";");

  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;

    const key = pair.slice(0, eqIndex).trim();
    const val = pair.slice(eqIndex + 1).trim();
    if (!key || !val) continue;

    if (key === "mime") {
      result.mime = val;
    } else if (key === "durationSec") {
      const num = parseInt(val, 10);
      if (!isNaN(num)) result.durationSec = num;
    } else if (key === "sizeBytes") {
      const num = parseInt(val, 10);
      if (!isNaN(num)) result.sizeBytes = num;
    }
  }

  return result;
}

/**
 * 解析 JSON 格式。
 * 容错：JSON.parse 失败 → 返回空对象。
 */
function parseJsonFormat(content: string): AudioMeta {
  try {
    const parsed = JSON.parse(content);
    const result: AudioMeta = {};

    if (typeof parsed?.mime === "string") {
      result.mime = parsed.mime;
    }
    if (typeof parsed?.durationSec === "number") {
      result.durationSec = parsed.durationSec;
    }
    if (typeof parsed?.sizeBytes === "number") {
      result.sizeBytes = parsed.sizeBytes;
    }

    return result;
  } catch {
    return {};
  }
}

// ─── 转码需求判断 ──────────────────────────────────────

/**
 * 豆包 Lite 原生支持的音频 MIME 类型。
 * 这些格式可以直接发送给 Lite，不需要转码。
 *
 * 来源：Round 0 Spike 验证（m4a 实测可用）+ 官方文档。
 */
const LITE_NATIVE_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp3",
  "audio/mpeg",
  "audio/flac",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
]);

/**
 * 判断给定 MIME 是否需要 ffmpeg 转码。
 *
 * - Lite 原生支持 → false（不需要转码，直送）
 * - webm/mp4 等 Lite 不支持 → true（需要转码）
 * - 未知 MIME → true（保守策略，尝试转码）
 */
export function needsTranscode(mime: string | undefined | null): boolean {
  if (!mime) return true;
  return !LITE_NATIVE_MIME_TYPES.has(mime.toLowerCase());
}

// ─── 豆包 Lite 音频格式映射（单一数据源）─────────────────

/**
 * 豆包 Lite input_audio.format 支持的格式标签。
 *
 * 注意：Round 0 预验证只实测了 WAV 确认可用、webm/mp4 确认拒绝。
 * mp3/flac/ogg/m4a/aac 是官方文档列出但未全部实测，
 * 真实手机音频场景可能遇到“看起来支持，其实失败”。
 * v1 暂全部允许，失败时由调用方 catch 走 failed 状态。
 *
 * 来源：Round 0 预验证脚本 + asr-transcribe.ts（TD-5）参考
 */
export const SUPPORTED_AUDIO_FORMATS = new Set([
  "wav",     // ✅ 实测可用
  "mp3",     // ⚠️ 未实测
  "flac",    // ⚠️ 未实测
  "ogg",     // ⚠️ 未实测
  "m4a",     // ⚠️ 未实测
  "aac",     // ⚠️ 未实测
]);

/**
 * MIME → 豆包 format 标签映射。
 * 只有映射后格式在 SUPPORTED_AUDIO_FORMATS 中的才被接受。
 * webm 和 mp4 不映射（Round 0 验证不支持，需转码）。
 */
export const MIME_TO_FORMAT: Record<string, string> = {
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
};

/**
 * 获取豆包支持的 format 标签。
 * 不支持的 mime 返回 null（调用方据此判断是否需要转码）。
 */
export function getAudioApiFormat(mime: string): string | null {
  const format = MIME_TO_FORMAT[mime.toLowerCase()];
  if (format && SUPPORTED_AUDIO_FORMATS.has(format)) {
    return format;
  }
  return null;
}
