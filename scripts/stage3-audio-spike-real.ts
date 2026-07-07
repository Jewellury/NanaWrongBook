/**
 * Stage 3 Round 0 Spike：真实手机录音 → ffmpeg 转码 → 豆包 Lite 转写验证
 *
 * 验证目标：
 * 1. 真实手机录音（webm/mp4）能否通过 ffmpeg 转成 WAV
 * 2. 转码后的 WAV 能否被豆包 Lite 接收
 * 3. Lite 返回的 transcript 是否非空、非乱码、人工判断可用
 *
 * 安全：
 * - API Key 从 .env 读取，绝不硬编
 * - 不 import Prisma，不写任何数据库
 * - 报告不含 API Key
 * - 报告不含完整口述原文（只保留前 80 字符做质量判断）
 * - 不改任何生产代码
 *
 * 用法：
 *   npx tsx scripts/stage3-audio-spike-real.ts
 *
 * 前置条件：
 * - .env 中配置了 VOLCENGINE_API_KEY、LITE_ENDPOINT_ID
 * - 本地安装了 ffmpeg（在 PATH 中可用）
 * - tests/fixtures/nana/audio/ 目录下有真实手机录音文件
 *   支持 .webm / .mp4 / .m4a / .mp3 / .wav 格式
 *   文件名建议包含设备信息，如 android-webm-01.webm、ios-mp4-01.mp4
 *
 * 输出：
 *   - 控制台汇总
 *   - doc/research/spike-audio-real-results.json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);

// ─── 类型定义 ──────────────────────────────────────────

interface AudioSample {
  fileName: string;
  format: string;      // 文件扩展名：webm / mp4 / m4a / mp3 / wav
  fileSizeKB: number;
  base64Length: number;
}

interface TranscodeResult {
  success: boolean;
  wavBase64?: string;
  wavSizeKB: number;
  transcodeMs: number;
  error?: string;
}

interface ApiTestResult {
  testName: string;
  audioSent: boolean;
  apiAccepted: boolean;
  transcriptReceived: boolean;
  transcriptPreview: string;   // 前 80 字符，用于质量判断
  transcriptLength: number;
  latencyMs: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

interface TestEntry {
  sample: AudioSample;
  directSend: ApiTestResult;
  transcode: TranscodeResult;
  transcodeSend: ApiTestResult;
}

// ─── 配置 ──────────────────────────────────────────────

const AUDIO_DIR = path.resolve('tests/fixtures/nana/audio');
const REPORT_DIR = path.resolve('doc/research');
const REPORT_PATH = path.join(REPORT_DIR, 'spike-audio-real-results.json');

const SUPPORTED_EXTENSIONS = new Set(['webm', 'mp4', 'm4a', 'mp3', 'wav', 'aac', 'flac', 'ogg']);

// Lite API 的 input_audio format 标签映射
const EXT_TO_API_FORMAT: Record<string, string> = {
  wav: 'wav',
  mp3: 'mp3',
  m4a: 'm4a',
  aac: 'aac',
  flac: 'flac',
  ogg: 'ogg',
  // webm 和 mp4 不支持（Round 0 已验证）
};

// ─── ffmpeg 检查 ────────────────────────────────────────

async function checkFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ─── ffmpeg 转码 ────────────────────────────────────────

/**
 * 用 ffmpeg 将音频文件转码为 16kHz 单声道 16bit PCM WAV。
 *
 * 实现方式：输出到临时文件（非 pipe），因为 pipe 输出时 RIFF/data
 * chunk 大小为 0xFFFFFFFF 占位符，Lite 会拒绝这种 WAV。
 * 文件输出时 ffmpeg 能正确回填 chunk 大小。
 *
 * @param filePath 音频文件路径
 * @returns TranscodeResult
 */
async function transcodeToWav(filePath: string): Promise<TranscodeResult> {
  const startTime = Date.now();
  const result: TranscodeResult = {
    success: false,
    wavSizeKB: 0,
    transcodeMs: 0,
  };

  // 临时输出文件
  const tmpPath = path.join(
    path.dirname(filePath),
    `.transcode-tmp-${Date.now()}.wav`,
  );

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-i', filePath,           // 输入文件
        '-ar', '16000',           // 采样率 16kHz（ASR 最佳）
        '-ac', '1',               // 单声道
        '-c:a', 'pcm_s16le',     // 16bit PCM
        '-f', 'wav',              // 输出 WAV 容器
        '-bitexact',              // 去掉元数据 chunk（LIST/INFO），Lite 不接受带元数据的 WAV
        '-fflags', '+bitexact',
        '-flags', '+bitexact',
        '-y',                     // 覆盖输出文件
        tmpPath,                  // 输出到临时文件（非 pipe，确保 chunk 大小正确）
        '-hide_banner',
        '-loglevel', 'error',
      ],
      {
        timeout: 10000,           // 10s 超时
      },
    );

    const wavBuffer = fs.readFileSync(tmpPath);
    result.wavBase64 = wavBuffer.toString('base64');
    result.wavSizeKB = Math.round(wavBuffer.length / 1024);
    result.success = true;
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string };
    result.error = error.code === 'ETIMEDOUT'
      ? 'ffmpeg 转码超时（10s）'
      : `ffmpeg 转码失败: ${error.message || String(err)}`;
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  result.transcodeMs = Date.now() - startTime;
  return result;
}

// ─── 程序生成 WAV（基线）────────────────────────────────

/**
 * 生成 1 秒 440Hz 正弦波 WAV（与 stage3-spike-v3.ts 一致），作为基线测试。
 */
function generateWavBase64(): string {
  const sampleRate = 16000;
  const durationSec = 1;
  const frequency = 440;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const bufferSize = 44 + dataSize;
  const buf = Buffer.alloc(bufferSize);
  let offset = 0;
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(bufferSize - 8, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4;
  buf.writeUInt16LE(2, offset); offset += 2;
  buf.writeUInt16LE(16, offset); offset += 2;
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3 * 32767;
    buf.writeInt16LE(Math.round(sample), offset);
    offset += 2;
  }
  return buf.toString('base64');
}

// ─── 豆包 Lite API 调用 ─────────────────────────────────

/**
 * 发送音频到豆包 Lite，请求转写。
 *
 * @param client OpenAI client
 * @param model 模型 ID
 * @param audioBase64 纯 base64 音频数据（不含 data: 前缀）
 * @param apiFormat Lite input_audio format 标签（如 "wav"、"mp3"）
 * @param testName 测试名称（用于结果标识）
 * @returns ApiTestResult
 */
async function sendAudioToLite(
  client: OpenAI,
  model: string,
  audioBase64: string,
  apiFormat: string,
  testName: string,
): Promise<ApiTestResult> {
  const startTime = Date.now();
  const result: ApiTestResult = {
    testName,
    audioSent: true,
    apiAccepted: false,
    transcriptReceived: false,
    transcriptPreview: '',
    transcriptLength: 0,
    latencyMs: 0,
  };

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请把这段语音转写成文字，只输出转写结果，不要加任何解释。如果没有语音内容，输出空字符串。',
            },
            {
              type: 'input_audio',
              input_audio: {
                data: audioBase64,
                // OpenAI SDK 类型只允许 "wav"|"mp3"，豆包实际支持更多
                format: apiFormat as any,
              },
            },
          ],
        },
      ],
      max_tokens: 2048,
    });

    result.latencyMs = Date.now() - startTime;
    result.apiAccepted = true;

    const transcript = response.choices[0]?.message?.content || '';
    result.transcriptLength = transcript.length;
    result.transcriptReceived = transcript.trim().length > 0;
    // 只保留前 80 字符做质量判断，不保留完整原文
    result.transcriptPreview = transcript.substring(0, 80);

    result.usage = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined;
  } catch (err: unknown) {
    result.latencyMs = Date.now() - startTime;
    const error = err as { message?: string; status?: number };
    result.error = `${error.status || '?'}: ${error.message || String(err)}`;
    result.apiAccepted = false;
  }

  return result;
}

// ─── 加载音频样本 ───────────────────────────────────────

function loadAudioSamples(): AudioSample[] {
  if (!fs.existsSync(AUDIO_DIR)) {
    return [];
  }

  const files = fs.readdirSync(AUDIO_DIR);
  const samples: AudioSample[] = [];

  for (const file of files) {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const filePath = path.join(AUDIO_DIR, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    samples.push({
      fileName: file,
      format: ext,
      fileSizeKB: Math.round(stat.size / 1024),
      base64Length: Math.round(stat.size * 1.37), // base64 膨胀约 37%
    });
  }

  return samples.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log('Stage 3 Round 0 Spike: 真实录音转写验证');
  console.log('========================================\n');

  // 1. 检查环境变量
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.error('❌ 未设置 VOLCENGINE_API_KEY');
    process.exit(1);
  }

  const baseURL =
    process.env.VOLCENGINE_BASE_URL ||
    'https://ark.cn-beijing.volces.com/api/v3';
  const model =
    process.env.LITE_ENDPOINT_ID ||
    process.env.LITE_MODEL_NAME ||
    'doubao-seed-2-0-lite-260215';

  // 脱敏打印
  const keyPreview =
    apiKey.length > 12
      ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
      : '***';

  console.log(`  API Key:  ${keyPreview}`);
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  Model:    ${model}`);
  console.log(`  音频目录: ${AUDIO_DIR}`);
  console.log('========================================\n');

  // 2. 检查 ffmpeg
  console.log('检查 ffmpeg...');
  const ffmpegOk = await checkFfmpeg();
  if (!ffmpegOk) {
    console.error('❌ ffmpeg 不可用。请先安装 ffmpeg 并确保在 PATH 中。');
    console.error('   Windows: 下载 https://ffmpeg.org/download.html 或 winget install ffmpeg');
    console.error('   macOS:   brew install ffmpeg');
    console.error('   Linux:   apt-get install ffmpeg');
    process.exit(1);
  }
  console.log('  ✅ ffmpeg 可用\n');

  // 3. 加载音频样本
  const samples = loadAudioSamples();
  if (samples.length === 0) {
    console.error('❌ 未找到音频样本文件。');
    console.error(`   请将真实手机录音文件放到: ${AUDIO_DIR}/`);
    console.error('   支持格式: .webm / .mp4 / .m4a / .mp3 / .wav');
    console.error('   文件名建议包含设备信息，如 android-webm-01.webm');
    process.exit(1);
  }

  console.log(`找到 ${samples.length} 个音频样本:`);
  for (const s of samples) {
    console.log(`  🎵 ${s.fileName} (${s.format}, ${s.fileSizeKB} KB)`);
  }
  console.log('');

  // 4. 初始化 OpenAI client
  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { 'User-Agent': 'nana-audio-spike/1.0' },
  });

  // 5. 基线测试：程序生成 WAV
  console.log('── 基线测试：程序生成 WAV ──');
  const baselineWav = generateWavBase64();
  const baselineResult = await sendAudioToLite(
    client,
    model,
    baselineWav,
    'wav',
    'baseline-generated-wav',
  );
  console.log(`  ${baselineResult.apiAccepted ? '✅' : '❌'} API 接受: ${baselineResult.apiAccepted}`);
  console.log(`  transcript: "${baselineResult.transcriptPreview}" (${baselineResult.transcriptLength} chars)`);
  console.log(`  耗时: ${(baselineResult.latencyMs / 1000).toFixed(1)}s`);
  if (baselineResult.error) console.log(`  错误: ${baselineResult.error}`);
  if (baselineResult.usage) {
    console.log(`  tokens: ${baselineResult.usage.prompt_tokens} in / ${baselineResult.usage.completion_tokens} out`);
  }
  console.log('');

  // 6. 逐样本测试
  const testEntries: TestEntry[] = [];

  for (const sample of samples) {
    console.log(`── ${sample.fileName} (${sample.format}, ${sample.fileSizeKB} KB) ──`);

    const filePath = path.join(AUDIO_DIR, sample.fileName);
    const fileBase64 = fs.readFileSync(filePath).toString('base64');

    // 6a. 直送 Lite（不转码）
    const apiFormat = EXT_TO_API_FORMAT[sample.format];
    let directSend: ApiTestResult;

    if (apiFormat) {
      // 格式被 Lite 支持，直接送
      console.log('  [直送] 发送到 Lite...');
      directSend = await sendAudioToLite(
        client,
        model,
        fileBase64,
        apiFormat,
        `${sample.fileName}-direct`,
      );
    } else {
      // 格式不被 Lite 支持（webm/mp4），跳过直送，记录为已知拒绝
      console.log(`  [直送] 跳过（${sample.format} 已知不被 Lite 支持）`);
      directSend = {
        testName: `${sample.fileName}-direct`,
        audioSent: false,
        apiAccepted: false,
        transcriptReceived: false,
        transcriptPreview: '',
        transcriptLength: 0,
        latencyMs: 0,
        error: `格式 ${sample.format} 不被 Lite 支持（已知），跳过直送`,
      };
    }

    console.log(`  [直送] ${directSend.apiAccepted ? '✅' : '❌'} 接受: ${directSend.apiAccepted}`);
    if (directSend.transcriptReceived) {
      console.log(`  [直送] transcript: "${directSend.transcriptPreview}" (${directSend.transcriptLength} chars)`);
    }
    if (directSend.error) console.log(`  [直送] 错误: ${directSend.error}`);
    if (directSend.usage) {
      console.log(`  [直送] tokens: ${directSend.usage.prompt_tokens} in / ${directSend.usage.completion_tokens} out`);
    }
    console.log(`  [直送] 耗时: ${(directSend.latencyMs / 1000).toFixed(1)}s`);

    // 6b. ffmpeg 转码为 WAV
    console.log('  [转码] ffmpeg → WAV...');
    const transcode = await transcodeToWav(filePath);
    console.log(`  [转码] ${transcode.success ? '✅' : '❌'} 成功: ${transcode.success}`);
    if (transcode.success) {
      console.log(`  [转码] WAV 大小: ${transcode.wavSizeKB} KB (base64: ${Math.round((transcode.wavBase64!.length / 1024))} KB)`);
    } else {
      console.log(`  [转码] 错误: ${transcode.error}`);
    }
    console.log(`  [转码] 耗时: ${(transcode.transcodeMs / 1000).toFixed(1)}s`);

    // 6c. 转码后送 Lite
    let transcodeSend: ApiTestResult;
    if (transcode.success && transcode.wavBase64) {
      console.log('  [转码后送] 发送到 Lite...');
      transcodeSend = await sendAudioToLite(
        client,
        model,
        transcode.wavBase64,
        'wav',
        `${sample.fileName}-transcoded-wav`,
      );
    } else {
      transcodeSend = {
        testName: `${sample.fileName}-transcoded-wav`,
        audioSent: false,
        apiAccepted: false,
        transcriptReceived: false,
        transcriptPreview: '',
        transcriptLength: 0,
        latencyMs: 0,
        error: '转码失败，无法发送',
      };
    }

    console.log(`  [转码后送] ${transcodeSend.apiAccepted ? '✅' : '❌'} 接受: ${transcodeSend.apiAccepted}`);
    if (transcodeSend.transcriptReceived) {
      console.log(`  [转码后送] transcript: "${transcodeSend.transcriptPreview}" (${transcodeSend.transcriptLength} chars)`);
    }
    if (transcodeSend.error) console.log(`  [转码后送] 错误: ${transcodeSend.error}`);
    if (transcodeSend.usage) {
      console.log(`  [转码后送] tokens: ${transcodeSend.usage.prompt_tokens} in / ${transcodeSend.usage.completion_tokens} out`);
    }
    console.log(`  [转码后送] 耗时: ${(transcodeSend.latencyMs / 1000).toFixed(1)}s`);
    console.log('');

    testEntries.push({
      sample,
      directSend,
      transcode,
      transcodeSend,
    });
  }

  // 7. 汇总
  console.log('========================================');
  console.log('Spike 汇总');
  console.log('========================================');
  console.log(`  音频样本数: ${testEntries.length}`);
  console.log(`  基线（程序 WAV）: ${baselineResult.apiAccepted ? '✅' : '❌'} ${baselineResult.transcriptReceived ? '有 transcript' : '无 transcript'}`);
  console.log('');

  let passCount = 0;
  for (const entry of testEntries) {
    const transcodeOk = entry.transcode.success;
    const liteAccepted = entry.transcodeSend.apiAccepted;
    const hasTranscript = entry.transcodeSend.transcriptReceived;
    const passed = transcodeOk && liteAccepted && hasTranscript;

    if (passed) passCount++;

    const status = passed
      ? '✅ 通过'
      : transcodeOk && liteAccepted && !hasTranscript
        ? '⚠️ API 接受但 transcript 为空'
        : !transcodeOk
          ? '❌ 转码失败'
          : !liteAccepted
            ? '❌ API 拒绝'
            : '❌ 未知';

    console.log(`  ${entry.sample.fileName} (${entry.format}):`);
    console.log(`    直送: ${entry.directSend.apiAccepted ? '✅' : '❌'} ${entry.directSend.error ? entry.directSend.error.substring(0, 60) : ''}`);
    console.log(`    转码: ${entry.transcode.success ? '✅' : '❌'} ${entry.transcode.wavSizeKB} KB ${(entry.transcode.transcodeMs / 1000).toFixed(1)}s`);
    console.log(`    转码后送: ${entry.transcodeSend.apiAccepted ? '✅' : '❌'} transcript=${entry.transcodeSend.transcriptLength} chars`);
    console.log(`    结论: ${status}`);
    console.log('');
  }

  // Gate 判定
  console.log('========================================');
  console.log('Gate 判定');
  console.log('========================================');
  console.log(`  通过样本数: ${passCount} / ${testEntries.length}`);
  if (passCount >= 1) {
    console.log('  ✅ Gate 通过：至少 1 种真实手机录音格式转 WAV 后可被 Lite 稳定转写');
    console.log('     可进入 Round 1 开发');
  } else {
    console.log('  ❌ Gate 未通过：没有真实手机录音格式能通过转码 + Lite 转写');
    console.log('     结论：暂时维持 image-only，语音仅保存不转写');
  }
  console.log('========================================\n');

  // 8. 保存详细报告
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const reportData = {
    generatedAt: new Date().toISOString(),
    model,
    baseURL,
    api_key_preview: keyPreview,
    audio_dir: AUDIO_DIR,
    ffmpeg_available: ffmpegOk,
    baseline: {
      testName: baselineResult.testName,
      apiAccepted: baselineResult.apiAccepted,
      transcriptReceived: baselineResult.transcriptReceived,
      transcriptPreview: baselineResult.transcriptPreview,
      transcriptLength: baselineResult.transcriptLength,
      latencyMs: baselineResult.latencyMs,
      usage: baselineResult.usage,
      error: baselineResult.error,
    },
    samples: testEntries.map((entry) => ({
      fileName: entry.sample.fileName,
      format: entry.sample.format,
      fileSizeKB: entry.sample.fileSizeKB,
      directSend: {
        testName: entry.directSend.testName,
        audioSent: entry.directSend.audioSent,
        apiAccepted: entry.directSend.apiAccepted,
        transcriptReceived: entry.directSend.transcriptReceived,
        transcriptPreview: entry.directSend.transcriptPreview,
        transcriptLength: entry.directSend.transcriptLength,
        latencyMs: entry.directSend.latencyMs,
        usage: entry.directSend.usage,
        error: entry.directSend.error,
      },
      transcode: {
        success: entry.transcode.success,
        wavSizeKB: entry.transcode.wavSizeKB,
        transcodeMs: entry.transcode.transcodeMs,
        error: entry.transcode.error,
      },
      transcodeSend: {
        testName: entry.transcodeSend.testName,
        audioSent: entry.transcodeSend.audioSent,
        apiAccepted: entry.transcodeSend.apiAccepted,
        transcriptReceived: entry.transcodeSend.transcriptReceived,
        transcriptPreview: entry.transcodeSend.transcriptPreview,
        transcriptLength: entry.transcodeSend.transcriptLength,
        latencyMs: entry.transcodeSend.latencyMs,
        usage: entry.transcodeSend.usage,
        error: entry.transcodeSend.error,
      },
    })),
    summary: {
      totalSamples: testEntries.length,
      passed: passCount,
      gatePassed: passCount >= 1,
      gateCriteria: '至少 1 种真实手机录音格式转 WAV 后可被 Lite 稳定转写（非空、非乱码）',
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`📄 详细报告已保存到: ${REPORT_PATH}`);
  console.log('✅ Spike 完成。请人工审阅报告中的 transcript 质量。');
}

main().catch((err) => {
  console.error('❌ 脚本异常:', err);
  process.exit(1);
});
