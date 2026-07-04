/**
 * transcript-utils · 单元测试
 *
 * 验证 isPlaceholderTranscript helper：
 * - 占位文案 "尚未转写" → true
 * - 真实转写文本 → false
 * - null/undefined → true
 * - 带空格的占位文案 → true（trim 处理）
 * - 空字符串 → false（不是占位文案，但也不是有效转写）
 */

import { describe, test, expect } from 'vitest';
import { isPlaceholderTranscript, PLACEHOLDER_TRANSCRIPT } from '@/lib/nana/transcript-utils';

describe('isPlaceholderTranscript', () => {
  test('占位文案 "尚未转写" → true', () => {
    expect(isPlaceholderTranscript('尚未转写')).toBe(true);
  });

  test('PLACEHOLDER_TRANSCRIPT 常量等于 "尚未转写"', () => {
    expect(PLACEHOLDER_TRANSCRIPT).toBe('尚未转写');
  });

  test('带前后空格的占位文案 → true（trim 处理）', () => {
    expect(isPlaceholderTranscript('  尚未转写  ')).toBe(true);
    expect(isPlaceholderTranscript('\t尚未转写\n')).toBe(true);
  });

  test('真实转写文本 → false', () => {
    expect(isPlaceholderTranscript('这道题考的是一次函数的图像')).toBe(false);
    expect(isPlaceholderTranscript('hello world')).toBe(false);
  });

  test('null → true', () => {
    expect(isPlaceholderTranscript(null)).toBe(true);
  });

  test('undefined → true', () => {
    expect(isPlaceholderTranscript(undefined)).toBe(true);
  });

  test('空字符串 → false（不是占位文案）', () => {
    // 空字符串不是占位文案，但也不是有效转写
    // 调用方需自行判断空字符串（ASR 返回空时不覆盖占位）
    expect(isPlaceholderTranscript('')).toBe(false);
  });

  test('仅空格 → false（trim 后为空，不等于占位文案）', () => {
    expect(isPlaceholderTranscript('   ')).toBe(false);
    expect(isPlaceholderTranscript('\n\t')).toBe(false);
  });
});
