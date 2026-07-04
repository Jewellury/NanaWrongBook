/**
 * asr-transcribe lib · 单元测试
 *
 * mock OpenAI SDK 验证 ASR 薄封装逻辑：
 * - 正常返回 → 解析出 transcript
 * - 空返回 → transcript = ""
 * - 模型 4xx/5xx → throw AsrError
 * - 超时 → throw AsrTimeoutError
 * - 不支持的 mime (webm/mp4) → throw AsrUnsupportedFormatError
 * - 支持的 mime (wav/mp3/ogg/m4a/aac) → 正常调用
 *
 * Round 0 预验证结论：webm/mp4 不被豆包 Lite 支持。
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── mock OpenAI 构造函数和 create 方法 ──────────────
const { mockChatCompletionsCreate } = vi.hoisted(() => ({
  mockChatCompletionsCreate: vi.fn(),
}));

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockChatCompletionsCreate,
        },
      };
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  asrTranscribe,
  AsrError,
  AsrTimeoutError,
  AsrUnsupportedFormatError,
} from '@/lib/nana/asr-transcribe';

// ─── 环境变量设置 ──────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VOLCENGINE_API_KEY = 'test-key';
  process.env.VOLCENGINE_BASE_URL = 'https://test.example.com/api/v3';
  process.env.LITE_MODEL_NAME = 'test-lite-model';
  process.env.ASR_TIMEOUT_MS = '5000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 格式支持测试 ──────────────────────────────────────

describe('asrTranscribe: 格式支持', () => {
  test('webm → throw AsrUnsupportedFormatError', async () => {
    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/webm' }),
    ).rejects.toBeInstanceOf(AsrUnsupportedFormatError);
  });

  test('mp4 → throw AsrUnsupportedFormatError', async () => {
    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/mp4' }),
    ).rejects.toBeInstanceOf(AsrUnsupportedFormatError);
  });

  test('wav → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '测试转写结果' } }],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });
    expect(result.transcript).toBe('测试转写结果');
  });

  test('mp3 → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'mp3 测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/mp3' });
    expect(result.transcript).toBe('mp3 测试');
  });

  test('ogg → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ogg 测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/ogg' });
    expect(result.transcript).toBe('ogg 测试');
  });

  test('m4a → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'm4a 测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/m4a' });
    expect(result.transcript).toBe('m4a 测试');
  });

  test('x-m4a → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'x-m4a 测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/x-m4a' });
    expect(result.transcript).toBe('x-m4a 测试');
  });

  test('aac → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'aac 测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/aac' });
    expect(result.transcript).toBe('aac 测试');
  });

  test('flac → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'flac 测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/flac' });
    expect(result.transcript).toBe('flac 测试');
  });

  test('未知 mime → throw AsrUnsupportedFormatError', async () => {
    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/xyz' }),
    ).rejects.toBeInstanceOf(AsrUnsupportedFormatError);
  });

  test('大小写不敏感：AUDIO/WAV → 正常调用', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '大小写测试' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'AUDIO/WAV' });
    expect(result.transcript).toBe('大小写测试');
  });
});

// ─── 正常返回测试 ──────────────────────────────────────

describe('asrTranscribe: 正常返回', () => {
  test('正常返回 → 解析出 transcript', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '这道题考的是二次函数' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });
    expect(result.transcript).toBe('这道题考的是二次函数');
  });

  test('空返回（content 为空）→ transcript = ""', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });
    expect(result.transcript).toBe('');
  });

  test('空返回（content 为 null）→ transcript = ""', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });
    expect(result.transcript).toBe('');
  });

  test('空返回（choices 为空数组）→ transcript = ""', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [],
    });
    const result = await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });
    expect(result.transcript).toBe('');
  });
});

// ─── 错误处理测试 ──────────────────────────────────────

describe('asrTranscribe: 错误处理', () => {
  test('模型 4xx → throw AsrError', async () => {
    const apiError = Object.assign(new Error('Bad request'), {
      status: 400,
      body: { error: { message: 'Invalid audio' } },
    });
    mockChatCompletionsCreate.mockRejectedValueOnce(apiError);

    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' }),
    ).rejects.toBeInstanceOf(AsrError);
  });

  test('模型 5xx → throw AsrError', async () => {
    const apiError = Object.assign(new Error('Internal error'), {
      status: 500,
    });
    mockChatCompletionsCreate.mockRejectedValueOnce(apiError);

    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' }),
    ).rejects.toBeInstanceOf(AsrError);
  });

  test('网络错误 → throw AsrError', async () => {
    mockChatCompletionsCreate.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' }),
    ).rejects.toBeInstanceOf(AsrError);
  });

  test('超时（AbortError）→ throw AsrTimeoutError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockChatCompletionsCreate.mockRejectedValueOnce(abortError);

    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' }),
    ).rejects.toBeInstanceOf(AsrTimeoutError);
  });

  test('未设置 VOLCENGINE_API_KEY → throw AsrError', async () => {
    delete process.env.VOLCENGINE_API_KEY;
    await expect(
      asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' }),
    ).rejects.toBeInstanceOf(AsrError);
  });
});

// ─── API 调用参数验证 ──────────────────────────────────

describe('asrTranscribe: API 调用参数', () => {
  test('调用参数包含正确的 format 映射', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '测试' } }],
    });

    await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });

    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    const audioContent = callArg.messages[0].content.find(
      (c: { type: string }) => c.type === 'input_audio',
    );
    expect(audioContent.input_audio.format).toBe('wav');
    expect(audioContent.input_audio.data).toBe('dGVzdA==');
  });

  test('调用参数包含转写提示词', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '测试' } }],
    });

    await asrTranscribe({ audioBase64: 'dGVzdA==', mime: 'audio/wav' });

    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    const textContent = callArg.messages[0].content.find(
      (c: { type: string }) => c.type === 'text',
    );
    expect(textContent.text).toContain('转写');
  });
});
