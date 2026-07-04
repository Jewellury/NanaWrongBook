/**
 * Stage 3 Round 0：豆包 Lite 音频格式预验证脚本（程序生成 WAV 测试）
 *
 * 本脚本：
 * 1. 生成一个 1 秒 440Hz 正弦波 WAV 文件
 * 2. 用 format="wav" 发给豆包 Lite → 验证 API 连通性
 * 3. 用 format="webm" 发给豆包 Lite → 验证 webm 格式标签是否被接受
 * 4. 输出验证结论
 *
 * 用法: npx tsx scripts/stage3-asr-format-check.ts
 * 安全: API Key 从 process.env.VOLCENGINE_API_KEY 读取
 *
 * 注意: 本脚本为手动验证工具，不进 CI。
 */

import 'dotenv/config';
import OpenAI from 'openai';

// ── 生成最小 WAV 文件（1 秒 440Hz 正弦波，16kHz 16bit mono）──
function generateWavBase64(): string {
  const sampleRate = 16000;
  const durationSec = 1;
  const frequency = 440;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2; // 16bit = 2 bytes per sample
  const bufferSize = 44 + dataSize; // WAV header (44 bytes) + data

  const buf = Buffer.alloc(bufferSize);
  let offset = 0;

  // RIFF header
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(bufferSize - 8, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;

  // fmt chunk
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4; // chunk size
  buf.writeUInt16LE(1, offset); offset += 2;  // PCM format
  buf.writeUInt16LE(1, offset); offset += 2;  // mono
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4; // byte rate
  buf.writeUInt16LE(2, offset); offset += 2;  // block align
  buf.writeUInt16LE(16, offset); offset += 2; // bits per sample

  // data chunk
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  // Write sine wave samples
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3 * 32767;
    buf.writeInt16LE(Math.round(sample), offset);
    offset += 2;
  }

  return buf.toString('base64');
}

async function testFormat(
  client: OpenAI,
  model: string,
  audioBase64: string,
  format: string,
): Promise<{ success: boolean; transcript?: string; error?: string; usage?: unknown }> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '请把这段语音转写成文字，只输出转写结果，不要加任何解释。' },
          { type: 'input_audio', input_audio: { data: audioBase64, format: format as 'wav' | 'mp3' | 'flac' | 'ogg' | 'm4a' | 'aac' } },
        ],
      }],
      max_tokens: 2048,
    });

    return {
      success: true,
      transcript: response.choices[0]?.message?.content || '(空返回)',
      usage: response.usage,
    };
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return {
      success: false,
      error: `${error.status || '?'}: ${error.message || String(err)}`,
    };
  }
}

async function main() {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.error('❌ 未设置 VOLCENGINE_API_KEY 环境变量');
    process.exit(1);
  }

  const baseURL = process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = process.env.LITE_ENDPOINT_ID || process.env.LITE_MODEL_NAME || 'doubao-seed-2-0-lite-260215';

  console.log('========================================');
  console.log('Stage 3 Round 0: 豆包 Lite 音频格式预验证');
  console.log('========================================');
  console.log(`  模型: ${model}`);
  console.log(`  Base URL: ${baseURL}`);
  console.log('========================================\n');

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { 'User-Agent': 'nana-stage3-format-check/1.0' },
  });

  // 生成 WAV 测试音频
  const wavBase64 = generateWavBase64();
  console.log(`  生成 WAV 测试音频: ${wavBase64.length} bytes Base64 (${(wavBase64.length / 1024).toFixed(0)} KB)\n`);

  // 测试 1: WAV 格式（验证 API 连通性）
  console.log('── 测试 1: format="wav"（验证 API 连通性）──');
  const wavResult = await testFormat(client, model, wavBase64, 'wav');
  if (wavResult.success) {
    console.log(`  ✅ WAV 成功`);
    console.log(`  转写结果: ${wavResult.transcript}`);
    if (wavResult.usage) {
      const u = wavResult.usage as { prompt_tokens?: number; completion_tokens?: number };
      console.log(`  tokens: ${u.prompt_tokens} in / ${u.completion_tokens} out`);
    }
  } else {
    console.log(`  ❌ WAV 失败: ${wavResult.error}`);
    console.log('  → API 连通性问题，需检查 API Key 和模型配置');
    process.exit(1);
  }

  console.log();

  // 测试 2: 用 WAV 数据但标签为 "webm"
  // 这验证的是 API 是否接受 "webm" 作为 format 值
  console.log('── 测试 2: format="webm"（验证 webm 格式标签是否被接受）──');
  console.log('  注意: 用 WAV 数据但标签为 webm，验证 API 是否接受该 format 值');
  const webmResult = await testFormat(client, model, wavBase64, 'webm');
  if (webmResult.success) {
    console.log(`  ✅ webm 格式标签被接受`);
    console.log(`  转写结果: ${webmResult.transcript}`);
    console.log('  → 浏览器 webm 录音可以直接传给豆包 Lite');
  } else {
    console.log(`  ❌ webm 格式标签被拒绝: ${webmResult.error}`);
    console.log('  → webm 格式不被豆包 Lite 支持');
    console.log('  → ASR 管线对 audio/webm 降级为 skipped');
  }

  console.log();

  // 测试 3: 用 WAV 数据但标签为 "mp4"
  console.log('── 测试 3: format="mp4"（验证 mp4 格式标签是否被接受）──');
  const mp4Result = await testFormat(client, model, wavBase64, 'mp4');
  if (mp4Result.success) {
    console.log(`  ✅ mp4 格式标签被接受`);
    console.log(`  转写结果: ${mp4Result.transcript}`);
    console.log('  → Safari mp4 录音可能可以直接传给豆包 Lite');
  } else {
    console.log(`  ❌ mp4 格式标签被拒绝: ${mp4Result.error}`);
    console.log('  → mp4 格式不被豆包 Lite 支持');
    console.log('  → ASR 管线对 audio/mp4 降级为 skipped');
  }

  console.log('\n========================================');
  console.log('验证结论汇总');
  console.log('========================================');
  console.log(`  WAV:  ${wavResult.success ? '✅ 支持' : '❌ 不支持'}`);
  console.log(`  webm: ${webmResult.success ? '✅ 支持' : '❌ 不支持'}`);
  console.log(`  mp4:  ${mp4Result.success ? '✅ 支持' : '❌ 不支持'}`);
  console.log('========================================');
  console.log('\n请将以上结论记录到执行日志。');
}

main().catch((err) => {
  console.error('❌ 脚本异常:', err);
  process.exit(1);
});
