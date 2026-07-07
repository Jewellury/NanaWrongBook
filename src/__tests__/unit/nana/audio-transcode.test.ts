/**
 * audio-transcode · 单元测试
 *
 * mock util.promisify + fs，验证转码逻辑：
 * 1. 转码成功 → 返回 WAV base64
 * 2. ffmpeg 不可用 → 返回失败
 * 3. ffmpeg 超时 → 返回失败
 * 4. 临时文件清理（无论成功失败）
 *
 * 不依赖本地 ffmpeg 安装。
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── mock execFileAsync (via util.promisify) ──────────

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock('util', () => ({
  default: { promisify: () => mockExecFileAsync },
  promisify: () => mockExecFileAsync,
}));

// ─── mock child_process (execFile 本身不被调用，promisify 已 mock) ──

vi.mock('child_process', () => ({
  default: { execFile: vi.fn() },
  execFile: vi.fn(),
}));

// ─── mock fs ──────────────────────────────────────────

const { mockWriteFileSync, mockReadFileSync, mockUnlinkSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
  },
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
}));

// ─── mock logger ──────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { transcodeAudio } from '@/lib/nana/audio-transcode';

// ─── 测试数据 ──────────────────────────────────────────

const FAKE_AUDIO_BASE64 = 'dGVzdC1hdWRpbw==';
// 大于 1024 bytes，确保 wavSizeKB > 0
const FAKE_WAV_BUFFER = Buffer.alloc(2048, 0);
FAKE_WAV_BUFFER.write('RIFF', 0);
FAKE_WAV_BUFFER.write('WAVE', 8);
const FAKE_WAV_BASE64 = FAKE_WAV_BUFFER.toString('base64');

// ─── 环境设置 ──────────────────────────────────────────

beforeEach(() => {
  // resetAllMocks 清除 calls 和 implementation（clearAllMocks 不重置 impl）
  vi.resetAllMocks();
  // 重新设置默认 mock 实现
  mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
  mockReadFileSync.mockReturnValue(FAKE_WAV_BUFFER);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── 1. 转码成功 ───────────────────────────────────────

describe('transcodeAudio: 成功', () => {
  test('ffmpeg 成功 → 返回 WAV base64', async () => {
    const result = await transcodeAudio(FAKE_AUDIO_BASE64);

    expect(result.success).toBe(true);
    expect(result.wavBase64).toBe(FAKE_WAV_BASE64);
    expect(result.wavSizeKB).toBeGreaterThan(0);
    expect(result.transcodeMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  test('调用了 writeFileSync 写入输入文件', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const writeArg = mockWriteFileSync.mock.calls[0];
    expect(writeArg[0]).toContain('nana-audio-in-');
    expect(Buffer.isBuffer(writeArg[1])).toBe(true);
  });

  test('调用了 readFileSync 读取输出 WAV', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    const readArg = mockReadFileSync.mock.calls[0];
    expect(readArg[0]).toContain('nana-audio-out-');
    expect(readArg[0]).toMatch(/\.wav$/);
  });

  test('清理了临时文件（unlinkSync 调用 2 次）', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
  });
});

// ─── 2. ffmpeg 失败 ────────────────────────────────────

describe('transcodeAudio: ffmpeg 失败', () => {
  test('ffmpeg 报错 → 返回失败，不 throw', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('ffmpeg error: Invalid data found'));

    const result = await transcodeAudio(FAKE_AUDIO_BASE64);

    expect(result.success).toBe(false);
    expect(result.wavBase64).toBeUndefined();
    expect(result.error).toContain('ffmpeg 转码失败');
    expect(result.error).toContain('Invalid data found');
  });

  test('ffmpeg 不可用 (ENOENT) → 返回失败', async () => {
    const err = new Error('spawn ffmpeg ENOENT') as Error & { code: string };
    err.code = 'ENOENT';
    mockExecFileAsync.mockRejectedValueOnce(err);

    const result = await transcodeAudio(FAKE_AUDIO_BASE64);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ffmpeg 转码失败');
  });

  test('失败时仍清理临时文件', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('failed'));

    await transcodeAudio(FAKE_AUDIO_BASE64);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
  });
});

// ─── 3. 超时 ──────────────────────────────────────────

describe('transcodeAudio: 超时', () => {
  test('ETIMEDOUT → 返回超时错误', async () => {
    const err = new Error('Timed out') as Error & { code: string };
    err.code = 'ETIMEDOUT';
    mockExecFileAsync.mockRejectedValueOnce(err);

    const result = await transcodeAudio(FAKE_AUDIO_BASE64);

    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
  });
});

// ─── 4. 永不 throw ──────────────────────────────────────

describe('transcodeAudio: 永不 throw', () => {
  test('readFileSync 抛异常 → 不 throw，返回失败', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('read file error');
    });

    const result = await transcodeAudio(FAKE_AUDIO_BASE64);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('writeFileSync 抛异常 → 不 throw，返回失败', async () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('write file error');
    });

    const result = await transcodeAudio(FAKE_AUDIO_BASE64);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── 5. ffmpeg 调用参数验证 ────────────────────────────

describe('transcodeAudio: ffmpeg 调用参数', () => {
  test('包含 -bitexact 标志', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    const callArgs = mockExecFileAsync.mock.calls[0][1] as string[];
    expect(callArgs).toContain('-bitexact');
    expect(callArgs).toContain('+bitexact');
  });

  test('包含 -ar 16000 采样率', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    const callArgs = mockExecFileAsync.mock.calls[0][1] as string[];
    const arIndex = callArgs.indexOf('-ar');
    expect(arIndex).toBeGreaterThan(-1);
    expect(callArgs[arIndex + 1]).toBe('16000');
  });

  test('包含 -ac 1 单声道', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    const callArgs = mockExecFileAsync.mock.calls[0][1] as string[];
    const acIndex = callArgs.indexOf('-ac');
    expect(acIndex).toBeGreaterThan(-1);
    expect(callArgs[acIndex + 1]).toBe('1');
  });

  test('包含 -c:a pcm_s16le', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    const callArgs = mockExecFileAsync.mock.calls[0][1] as string[];
    const caIndex = callArgs.indexOf('-c:a');
    expect(caIndex).toBeGreaterThan(-1);
    expect(callArgs[caIndex + 1]).toBe('pcm_s16le');
  });

  test('输出路径是 .wav 文件（非 pipe:1）', async () => {
    await transcodeAudio(FAKE_AUDIO_BASE64);
    const callArgs = mockExecFileAsync.mock.calls[0][1] as string[];
    const yIndex = callArgs.indexOf('-y');
    expect(yIndex).toBeGreaterThan(-1);
    expect(callArgs[yIndex + 1]).toMatch(/\.wav$/);
    expect(callArgs).not.toContain('pipe:1');
  });
});
