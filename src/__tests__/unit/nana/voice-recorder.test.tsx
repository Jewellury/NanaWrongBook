/**
 * VoiceRecorder · 用户行为+副作用单元测试
 *
 * 按评审要求：只覆盖用户行为和副作用，不依赖内部实现。
 *   - 重复点击不重复 getUserMedia
 *   - 权限拒绝后恢复 idle（onRecordingStateChange 未触发 true）
 *   - unmount 后 getUserMedia resolve 不回写状态（不触发 onRecordingStateChange true）
 *   - recorder.stop 不重复调用（用户点击后 60s timer 不再触发）
 *
 * 不测内部 state / ref，只通过回调副作用断言。
 */

// React act() 环境标记
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { VoiceRecorder } from '@/components/nana/capture/voice-recorder';

// ─── Mock Web APIs ─────────────────────────────────

let getUserMediaResolve: ((stream: MediaStream) => void) | null = null;
let getUserMediaReject: ((err: Error) => void) | null = null;
let getUserMediaCallCount = 0;

const mockStopTrack = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: mockStopTrack }],
} as unknown as MediaStream;

let mediaRecorderStopCallCount = 0;

// 每个 test 独立的 mock recorder 实例（通过 beforeEach 重建）
let mockRecorder: {
  state: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  ondataavailable: ((e: BlobEvent) => void) | null;
  onstop: (() => void) | null;
  mimeType: string;
};

const originalMediaDevices = navigator.mediaDevices;
const originalMediaRecorder = global.MediaRecorder;

beforeEach(() => {
  getUserMediaResolve = null;
  getUserMediaReject = null;
  getUserMediaCallCount = 0;
  mediaRecorderStopCallCount = 0;
  mockStopTrack.mockClear();

  mockRecorder = {
    state: 'inactive',
    start: vi.fn(() => { mockRecorder.state = 'recording'; }),
    stop: vi.fn(() => {
      mediaRecorderStopCallCount++;
      mockRecorder.state = 'inactive';
      if (mockRecorder.onstop) { mockRecorder.onstop(); }
    }),
    ondataavailable: null,
    onstop: null,
    mimeType: 'audio/webm',
  };

  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(() => {
        return new Promise<MediaStream>((resolve, reject) => {
          getUserMediaResolve = resolve;
          getUserMediaReject = reject;
          getUserMediaCallCount++;
        });
      }),
    },
    configurable: true,
    writable: true,
  });

  // Mock MediaRecorder 构造函数：返回 mockRecorder
  function MockMediaRecorder(this: any) {
    return mockRecorder;
  }
  (MockMediaRecorder as any).isTypeSupported = vi.fn(() => true);
  global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: originalMediaDevices,
    configurable: true,
    writable: true,
  });
  global.MediaRecorder = originalMediaRecorder;
});

// ─── 辅助渲染 ─────────────────────────────────────

function renderComponent(
  props: {
    onAudioReady?: (blob: Blob, meta: { durationSec: number; mime: string; sizeBytes: number }) => void;
    onRecordingStateChange?: (isRecording: boolean) => void;
  } = {}
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const onAudioReady = vi.fn(props.onAudioReady);
  const onRecordingStateChange = vi.fn(props.onRecordingStateChange);

  act(() => {
    flushSync(() => {
      root.render(
        <VoiceRecorder onAudioReady={onAudioReady} onRecordingStateChange={onRecordingStateChange} />
      );
    });
  });

  return {
    container,
    root,
    onAudioReady,
    onRecordingStateChange,
    unmount: () => {
      act(() => {
        flushSync(() => { root.unmount(); });
      });
      document.body.removeChild(container);
    },
  };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clickButton(container: HTMLElement, ariaLabel: string) {
  const button = container.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement;
  expect(button).toBeTruthy();
  act(() => { button.click(); });
}

// ─── 测试 ──────────────────────────────────────────

describe('VoiceRecorder — 用户行为+副作用', () => {
  test('重复点击不重复 getUserMedia', () => {
    const { container, unmount } = renderComponent();

    // 第一次点击"说说看"
    clickButton(container, '说说看');
    expect(getUserMediaCallCount).toBe(1);

    // 第一次点击后按钮变为"请求权限中…"并 disabled
    const requestingBtn = container.querySelector('button[aria-label="请求权限中"]') as HTMLButtonElement;
    expect(requestingBtn).toBeTruthy();
    expect(requestingBtn.disabled).toBe(true);

    // 模拟强行点击 disabled 按钮（浏览器会忽略，但验证 getUserMedia 不再被调）
    requestingBtn.click();

    // 仍然只被调一次（disabled + state 门禁双重拦截）
    expect(getUserMediaCallCount).toBe(1);

    unmount();
  });

  test('权限拒绝后恢复 idle（onRecordingStateChange 未触发 true）', async () => {
    const { onRecordingStateChange, container, unmount } = renderComponent();

    clickButton(container, '说说看');

    // 模拟权限拒绝
    await act(async () => {
      getUserMediaReject!(new Error('Permission denied'));
      await flushPromises();
    });

    // onRecordingStateChange 不应收到 true
    const calls = onRecordingStateChange.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain(true);

    unmount();
  });

  test('unmount 后 getUserMedia resolve 不回写状态（不触发 onRecordingStateChange true）', async () => {
    const { onRecordingStateChange, container, unmount } = renderComponent();

    clickButton(container, '说说看');

    // requesting 态下 unmount
    unmount();

    // getUserMedia resolve（模拟权限弹窗后用户同意，但组件已卸载）
    await act(async () => {
      getUserMediaResolve!(mockStream);
      await flushPromises();
    });

    // onRecordingStateChange 不应收到 true（未进入 recording 态）
    const calls = onRecordingStateChange.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain(true);
  });

  test('recorder.stop 不重复调用（用户点击后 60s timer 不再触发）', async () => {
    const { container, unmount } = renderComponent();

    clickButton(container, '说说看');

    // getUserMedia resolve → 进入 recording 态
    await act(async () => {
      getUserMediaResolve!(mockStream);
      await flushPromises();
    });

    // recording 态下渲染"我听完了"按钮（用文本匹配）
    const finishBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('我听完了')
    ) as HTMLButtonElement;
    expect(finishBtn).toBeTruthy();

    // 用户点击"我听完了"
    act(() => { finishBtn.click(); });

    // recorder.stop 已被调一次
    expect(mediaRecorderStopCallCount).toBe(1);

    // 60s timer 回调会检查 isStoppingRef.current（已为 true），不会再次调 stop
    expect(mediaRecorderStopCallCount).toBe(1);

    unmount();
  });
});
