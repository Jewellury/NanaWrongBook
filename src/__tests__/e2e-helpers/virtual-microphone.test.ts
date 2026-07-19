/**
 * virtual-microphone 单元测试（r3.1 任务 2.2）
 *
 * 测试范围：配置正确性（flags 数组、路径解析、export 形状）
 * 不启动 Chromium——那需要完整 Playwright 环境，本地 Docker 可能不可用，
 * 由 CI 的 docker-compose.test.yml 验证完整链路。
 *
 * 运行：npm.cmd run test -- src/__tests__/e2e-helpers/virtual-microphone.test.ts --run
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  VIRTUAL_MIC_BASE_FLAGS,
  getVirtualMicFlags,
  getVirtualMicLaunchOptions,
  getFakeAudioFilePath,
  FAKE_AUDIO_FILE_REL,
  injectFakeUserMedia,
} from '../../../e2e/helpers/virtual-microphone';

describe('virtual-microphone', () => {
  it('VIRTUAL_MIC_BASE_FLAGS 包含 Chromium 官方 fake-media 两个 flags', () => {
    expect(VIRTUAL_MIC_BASE_FLAGS).toContain('--use-fake-device-for-media-stream');
    expect(VIRTUAL_MIC_BASE_FLAGS).toContain('--use-fake-ui-for-media-stream');
  });

  it('getVirtualMicFlags 默认包含 fake-device + fake-ui + 静态音频文件', () => {
    const flags = getVirtualMicFlags();
    expect(flags).toContain('--use-fake-device-for-media-stream');
    expect(flags).toContain('--use-fake-ui-for-media-stream');
    // 第三个 flag 必须指向静态 WAV 文件
    const audioFlag = flags.find((f) => f.startsWith('--use-file-for-fake-audio-capture='));
    expect(audioFlag).toBeTruthy();
    expect(audioFlag!).toContain('math-voice-sample.wav');
  });

  it('getVirtualMicFlags 接受自定义 audioFilePath', () => {
    const flags = getVirtualMicFlags('/custom/path.wav');
    const audioFlag = flags.find((f) => f.startsWith('--use-file-for-fake-audio-capture='));
    expect(audioFlag).toBe('--use-file-for-fake-audio-capture=/custom/path.wav');
  });

  it('Windows 路径反斜杠被转换为正斜杠（Chromium 兼容）', () => {
    const flags = getVirtualMicFlags('C:\\foo\\bar.wav');
    const audioFlag = flags.find((f) => f.startsWith('--use-file-for-fake-audio-capture='));
    expect(audioFlag).toBe('--use-file-for-fake-audio-capture=C:/foo/bar.wav');
  });

  it('getVirtualMicLaunchOptions 返回 { args: [...] } 形状', () => {
    const opts = getVirtualMicLaunchOptions();
    expect(Array.isArray(opts.args)).toBe(true);
    expect(opts.args.length).toBeGreaterThanOrEqual(3);
  });

  it('静态 WAV 文件实际存在（占位文件应已生成）', () => {
    const filePath = getFakeAudioFilePath();
    expect(fs.existsSync(filePath)).toBe(true);
    // 至少 1KB（WAV 头 + 静默 PCM 数据）
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(1000);
  });

  it('FAKE_AUDIO_FILE_REL 指向 tests/fixtures/nana/audio/', () => {
    expect(FAKE_AUDIO_FILE_REL).toBe('tests/fixtures/nana/audio/math-voice-sample.wav');
  });

  it('injectFakeUserMedia 是可序列化的函数（page.addInitScript 用）', () => {
    expect(typeof injectFakeUserMedia).toBe('function');
    // 不引用 Node 上下文（addInitScript 在浏览器执行）
    // 简单检查函数体不包含 require/process 等 Node 全局
    const src = injectFakeUserMedia.toString();
    expect(src).not.toMatch(/\brequire\(/);
    expect(src).not.toMatch(/\bprocess\.env\b/);
  });
});
