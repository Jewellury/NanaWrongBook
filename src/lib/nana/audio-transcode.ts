/**
 * audio-transcode — ffmpeg 音频转码模块
 *
 * 将不被豆包 Lite 直接支持的音频格式（webm/mp4）转码为 WAV。
 *
 * Round 0 Spike 验证的两个关键约束：
 * 1. 必须用文件输出，不能用 pipe:1
 *    （pipe 输出时 RIFF/data chunk 大小为 0xFFFFFFFF 占位符，Lite 返回 400）
 * 2. 必须加 -bitexact -fflags +bitexact -flags +bitexact
 *    （默认带 LIST/INFO 元数据 chunk，Lite 也返回 400）
 *
 * 安全设计：
 * - 永远不 throw，所有错误通过返回值传达
 * - 转码失败 → { success: false, error }，调用方降级为 skipped/failed
 * - 不影响图片整理主链路
 * - 临时文件用完即删
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createLogger } from "@/lib/logger";

const execFileAsync = promisify(execFile);
const logger = createLogger("lib:nana:audio-transcode");

// ─── 类型定义 ──────────────────────────────────────────

export interface TranscodeResult {
  success: boolean;
  wavBase64?: string;
  wavSizeKB?: number;
  transcodeMs?: number;
  error?: string;
}

// ─── 核心函数 ──────────────────────────────────────────

/**
 * 将音频 Base64 数据转码为 16kHz 单声道 16bit PCM WAV。
 *
 * 实现步骤：
 * 1. Base64 → Buffer → 写入临时输入文件
 * 2. ffmpeg 转码到临时输出文件（非 pipe）
 * 3. 读取输出文件 → Base64
 * 4. 清理临时文件
 *
 * 永远不 throw。失败时返回 { success: false, error }。
 *
 * @param audioBase64 纯 Base64 音频数据（不含 data: 前缀）
 * @returns TranscodeResult
 */
export async function transcodeAudio(audioBase64: string): Promise<TranscodeResult> {
  const startTime = Date.now();

  // 临时文件路径
  const tmpDir = os.tmpdir();
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(tmpDir, `nana-audio-in-${sessionId}.bin`);
  const outputPath = path.join(tmpDir, `nana-audio-out-${sessionId}.wav`);

  try {
    // 1. Base64 → Buffer → 文件
    const audioBuffer = Buffer.from(audioBase64, "base64");
    fs.writeFileSync(inputPath, audioBuffer);

    // 2. ffmpeg 转码
    await execFileAsync(
      "ffmpeg",
      [
        "-i", inputPath,
        "-ar", "16000",           // 16kHz 采样率（ASR 最佳）
        "-ac", "1",               // 单声道
        "-c:a", "pcm_s16le",     // 16bit PCM
        "-f", "wav",              // WAV 容器
        "-bitexact",              // 去掉元数据 chunk（LIST/INFO），Lite 不接受
        "-fflags", "+bitexact",
        "-flags", "+bitexact",
        "-y",                     // 覆盖输出文件
        outputPath,               // 文件输出（非 pipe，确保 chunk 大小正确）
        "-hide_banner",
        "-loglevel", "error",
      ],
      {
        timeout: 15000,           // 15s 超时
      },
    );

    // 3. 读取输出文件 → Base64
    const wavBuffer = fs.readFileSync(outputPath);
    const wavBase64 = wavBuffer.toString("base64");
    const wavSizeKB = Math.round(wavBuffer.length / 1024);

    const transcodeMs = Date.now() - startTime;
    logger.info({ wavSizeKB, transcodeMs }, "音频转码成功");

    return {
      success: true,
      wavBase64,
      wavSizeKB,
      transcodeMs,
    };
  } catch (err: unknown) {
    const transcodeMs = Date.now() - startTime;
    const error = err as { message?: string; code?: string };

    const errorMsg = error.code === "ETIMEDOUT"
      ? "ffmpeg 转码超时（15s）"
      : `ffmpeg 转码失败: ${error.message || String(err)}`;

    logger.warn({ error: errorMsg, transcodeMs }, "音频转码失败");

    return {
      success: false,
      error: errorMsg,
      transcodeMs,
    };
  } finally {
    // 4. 清理临时文件（无论成功失败）
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
}
