/**
 * 虚拟麦克风配置（r3.1 任务 2.2）
 *
 * 优先使用 Chromium 官方 fake-media 参数，不改写 MediaRecorder。
 * 让浏览器真实录制成 webm，再经过 ffmpeg 和 /process 完整音频链路。
 *
 * 工作流程：
 * 1. getUserMedia({ audio: true }) → 自动授权（--use-fake-ui-for-media-stream）
 * 2. 返回虚拟音频流（--use-fake-device-for-media-stream）
 * 3. 可选：用静态 WAV 文件喂给虚拟设备（--use-file-for-fake-audio-capture）
 * 4. MediaRecorder 真实录制虚拟流 → 生成 webm Blob
 * 5. webm Blob 经过 ffmpeg 转码 → 喂给 /process → case-analyzer.ts 调用 Provider
 *
 * 完整音频链路被验证（不跳过录音组件）。
 *
 * 降级方案（r3.1 §3 任务 2.2）：
 * 如果 Chromium fake-media 在 headless 中不工作，
 * 改用 page.addInitScript 注入 fake getUserMedia 返回预制 Blob，
 * 但仍不替换 MediaRecorder，让真实 MediaRecorder 处理 fake stream。
 * （降级 helper 单独 export，spec 按需使用）
 */

import path from 'path';

// ─── 静态 WAV 文件路径 ─────────────────────────────────
// 当前为 ffmpeg 生成的静默占位（@TODO 真实数学口述）
// 替换文件后所有配置自动指向新文件

export const FAKE_AUDIO_FILE_REL = 'tests/fixtures/nana/audio/math-voice-sample.wav';

/** 返回绝对路径，相对于 cwd（Playwright 通常在仓库根目录执行） */
export function getFakeAudioFilePath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, FAKE_AUDIO_FILE_REL);
}

// ─── Chromium fake-media flags ─────────────────────────

/**
 * 基础虚拟麦克风 flags（不带音频文件）：
 * - --use-fake-device-for-media-stream：使用虚拟音频/视频设备
 * - --use-fake-ui-for-media-stream：自动授权，不弹权限对话框
 */
export const VIRTUAL_MIC_BASE_FLAGS = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
] as const;

/**
 * 完整虚拟麦克风 launch args（含静态音频文件）。
 *
 * @param audioFilePath 静态 WAV 文件绝对路径，默认指向 FAKE_AUDIO_FILE_REL
 * @returns Playwright launchOptions.args 数组
 */
export function getVirtualMicFlags(audioFilePath?: string): string[] {
  const flags: string[] = [...VIRTUAL_MIC_BASE_FLAGS];
  const audioPath = audioFilePath ?? getFakeAudioFilePath();
  // 注意：Windows 路径反斜杠需要转义或改用正斜杠；Chromium 接受两种
  flags.push(`--use-file-for-fake-audio-capture=${audioPath.replace(/\\/g, '/')}`);
  return flags;
}

/**
 * 完整 Playwright launchOptions（虚拟麦克风）。
 * spec / project config 中可直接 spread 使用：
 *
 *   launchOptions: { args: getVirtualMicLaunchOptions().args }
 *
 * 或 mobile-chrome project：
 *
 *   use: {
 *     ...devices['Pixel 7'],
 *     launchOptions: { args: getVirtualMicLaunchOptions().args },
 *   }
 */
export function getVirtualMicLaunchOptions(audioFilePath?: string): {
  args: string[];
} {
  return { args: getVirtualMicFlags(audioFilePath) };
}

// ─── 降级方案：page.addInitScript fake getUserMedia ───────────────────
//
// 仅在 Chromium fake-media 在 headless 中不工作时使用。
// 注入 fake getUserMedia 返回预制 Blob 流，但不替换 MediaRecorder。
//
// 使用方式（在 spec beforeEach 中）：
//   await page.addInitScript(injectFakeUserMedia);
//
// 注意：这是 plan 中提到的降级路径，非默认方式。优先使用 launchOptions.flags。

/**
 * 注入 fake getUserMedia（返回空音频流）。
 * 当 Chromium fake-media flags 在 CI headless 不工作时降级使用。
 *
 * 注入后浏览器中：
 * - navigator.mediaDevices.getUserMedia → 返回包含空 AudioTrack 的 MediaStream
 * - MediaRecorder 不替换 → 真实 MediaRecorder 录制空音频流 → 生成 webm Blob
 * - 完整链路（getUserMedia → MediaRecorder → webm → ffmpeg → /process）仍被验证
 */
export function injectFakeUserMedia(): void {
  // 此函数体会被 page.addInitScript 序列化后在浏览器执行
  // 不引用任何 Node 上下文（无 require / process 等）
  if (typeof window === 'undefined') return;

  const audioCtxCtor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audioCtxCtor) return;

  const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!original) return;

  navigator.mediaDevices.getUserMedia = async (constraints: MediaStreamConstraints) => {
    if (constraints?.audio) {
      // 生成 3 秒静默 AudioTrack（虚拟麦克风占位）
      const ctx = new audioCtxCtor();
      const oscillator = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      oscillator.connect(dest);
      // 静默：频率 0 + gain 0
      oscillator.frequency.value = 0;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(dest);
      oscillator.start();
      return dest.stream;
    }
    // 视频或其他约束走原始实现
    return original(constraints);
  };
}
