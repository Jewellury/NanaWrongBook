/**
 * AiResultCard · 单元测试
 *
 * 覆盖 FREEZE-001 标注 A-1 补齐项：
 *   - CL-06：textbookTopic=null 时显示"暂未覆盖"占位（不隐藏分类区）
 *   - CL-14：audioStatus=failed 时显示"再试转一次"重试按钮
 *
 * 还覆盖既有契约（防回归）：
 *   - 成功状态显示各字段
 *   - 失败状态显示重试文案
 *   - 空值字段（possibleMistakeReason=null）隐藏对应区块
 */

// React act() 环境标记
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AiResultCard } from '@/components/nana/capture/ai-result-card';
import type { CaseProcessResult } from '@/lib/nana/nana-api-client';

// ─── 工厂 ─────────────────────────────────────────

function makeSuccessResult(
  overrides: Partial<CaseProcessResult> = {},
): CaseProcessResult {
  return {
    status: 'success',
    audioStatus: 'skipped',
    questionSummary: '判断 f(x)=x²-2x 在 [0,3] 上的单调性',
    textbookTopic: { id: 'TB-010', name: '函数的基本性质', confidence: 0.85 },
    feedback: '你把题目条件理清楚了',
    possibleMistakeReason: '可能在符号变换时出了差错',
    nextActionSuggestion: '回看 3.2 节相关内容',
    transcript: null,
    error: null,
    ...overrides,
  };
}

function makeFailedResult(
  overrides: Partial<CaseProcessResult> = {},
): CaseProcessResult {
  return {
    status: 'failed',
    audioStatus: 'skipped',
    questionSummary: null,
    textbookTopic: null,
    feedback: null,
    possibleMistakeReason: null,
    nextActionSuggestion: null,
    transcript: null,
    error: 'AI 整理失败',
    ...overrides,
  };
}

// ─── 渲染辅助 ─────────────────────────────────────

function renderToDOM(component: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    flushSync(() => {
      root.render(component);
    });
  });
  return container;
}

function cleanup(container: HTMLElement) {
  act(() => {
    container.remove();
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ============================================================
// CL-06：textbookTopic=null 占位（A-1 补齐）
// ============================================================

describe('CL-06: textbookTopic=null 占位', () => {
  test('textbookTopic=null 时仍显示"可能属于"分类区，并展示"暂未覆盖"占位', () => {
    const result = makeSuccessResult({ textbookTopic: null });
    const container = renderToDOM(<AiResultCard result={result} />);
    // "可能属于" 标签必须存在
    expect(container.textContent).toContain('可能属于');
    // 占位文案必须存在
    expect(container.textContent).toContain('暂未覆盖');
    // 不应渲染原本的章节胶囊
    expect(container.textContent).not.toContain('函数的基本性质');
    cleanup(container);
  });

  test('textbookTopic 有值时显示具体章节名（不显示占位）', () => {
    const result = makeSuccessResult();
    const container = renderToDOM(<AiResultCard result={result} />);
    expect(container.textContent).toContain('函数的基本性质');
    expect(container.textContent).not.toContain('暂未覆盖');
    cleanup(container);
  });
});

// ============================================================
// CL-14：audioStatus=failed 重试按钮（A-1 补齐）
// ============================================================

describe('CL-14: audioStatus=failed 重试按钮', () => {
  test('audioStatus=failed 且未传 onRetryAudioTranscribe 时不显示重试按钮（保持静态提示）', () => {
    const result = makeSuccessResult({
      audioStatus: 'failed',
      transcript: null,
    });
    const container = renderToDOM(<AiResultCard result={result} />);
    // 保留静态提示
    expect(container.textContent).toContain('语音没转成功');
    // 无 onRetryAudioTranscribe 时不应出现重试按钮
    expect(container.textContent).not.toContain('再试转一次');
    cleanup(container);
  });

  test('audioStatus=failed 且传入 onRetryAudioTranscribe 时显示"再试转一次"按钮', () => {
    const result = makeSuccessResult({
      audioStatus: 'failed',
      transcript: null,
    });
    const onRetryAudioTranscribe = vi.fn();
    const container = renderToDOM(
      <AiResultCard
        result={result}
        onRetryAudioTranscribe={onRetryAudioTranscribe}
      />,
    );
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toContain('再试转一次');
    cleanup(container);
  });

  test('点击"再试转一次"调用 onRetryAudioTranscribe（不调用 onRetry）', () => {
    const result = makeSuccessResult({
      audioStatus: 'failed',
      transcript: null,
    });
    const onRetry = vi.fn(); // 整体失败重试，不应被调用
    const onRetryAudioTranscribe = vi.fn();
    const container = renderToDOM(
      <AiResultCard
        result={result}
        onRetry={onRetry}
        onRetryAudioTranscribe={onRetryAudioTranscribe}
      />,
    );
    const btn = container.querySelector('button')!;
    act(() => {
      btn.click();
    });
    expect(onRetryAudioTranscribe).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    cleanup(container);
  });

  test('audioStatus=success 时不显示音频重试按钮（即使传了 onRetryAudioTranscribe）', () => {
    const result = makeSuccessResult({
      audioStatus: 'success',
      transcript: '我先用导数算的',
    });
    const onRetryAudioTranscribe = vi.fn();
    const container = renderToDOM(
      <AiResultCard
        result={result}
        onRetryAudioTranscribe={onRetryAudioTranscribe}
      />,
    );
    expect(container.textContent).not.toContain('再试转一次');
    expect(container.textContent).toContain('我先用导数算的');
    cleanup(container);
  });
});

// ============================================================
// 既有契约防回归
// ============================================================

describe('AiResultCard 既有契约', () => {
  test('失败状态显示"没整理成功，可以再试一次"和重试按钮（onRetry）', () => {
    const result = makeFailedResult();
    const onRetry = vi.fn();
    const container = renderToDOM(
      <AiResultCard result={result} onRetry={onRetry} />,
    );
    expect(container.textContent).toContain('没整理成功，可以再试一次');
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toContain('再试一次');
    act(() => {
      btn!.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup(container);
  });

  test('possibleMistakeReason=null 时隐藏"可能的方向"区块', () => {
    const result = makeSuccessResult({ possibleMistakeReason: null });
    const container = renderToDOM(<AiResultCard result={result} />);
    expect(container.textContent).not.toContain('可能的方向');
    cleanup(container);
  });

  test('成功状态显示完整 5 区块', () => {
    const result = makeSuccessResult();
    const container = renderToDOM(<AiResultCard result={result} />);
    expect(container.textContent).toContain('AI 摘要');
    expect(container.textContent).toContain('可能属于');
    expect(container.textContent).toContain('函数的基本性质');
    expect(container.textContent).toContain('你把题目条件理清楚了');
    expect(container.textContent).toContain('可能的方向');
    expect(container.textContent).toContain('下一步可以');
    cleanup(container);
  });
});
