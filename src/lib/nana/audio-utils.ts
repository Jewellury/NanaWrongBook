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
