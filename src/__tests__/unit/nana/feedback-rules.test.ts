/**
 * 轻反馈规则 · 单元测试
 *
 * 测试关键词匹配逻辑的边界情况：
 * - 匹配"配方法"相关关键词 → 返回配方法 hint
 * - 匹配"定义域"相关关键词 → 返回定义域 hint
 * - 匹配"算错"相关关键词 → 返回计算 hint
 * - 多关键词匹配 → 优先第一个匹配的规则
 * - 无关键词匹配 → 返回默认 hint
 * - 空字符串 → 返回默认 hint
 */

import { describe, test, expect } from 'vitest';
import { matchTranscript, getFeedback, KEYWORD_RULES } from '@/lib/nana/feedback-rules';

describe('matchTranscript', () => {
  test('匹配 "配方" → 配方法规则', () => {
    const result = matchTranscript('我在想怎么配方');
    expect(result).not.toBeNull();
    expect(result!.keywords).toContain('配方');
    expect(result!.hint).toContain('配方法');
  });

  test('匹配 "完全平方" → 配方法规则', () => {
    const result = matchTranscript('我想用完全平方公式');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('配方法');
  });

  test('匹配 "平方" → 配方法规则', () => {
    const result = matchTranscript('平方那里我有点乱');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('配方法');
  });

  test('匹配 "定义域" → 定义域规则', () => {
    const result = matchTranscript('我先看了定义域');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('定义域/值域');
  });

  test('匹配 "值域" → 定义域规则', () => {
    const result = matchTranscript('值域我有点不确定');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('定义域/值域');
  });

  test('匹配 "算错" → 计算规则', () => {
    const result = matchTranscript('我算错了');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('没关系');
  });

  test('匹配 "算不对" → 计算规则', () => {
    const result = matchTranscript('这个题我怎么算不对');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('没关系');
  });

  test('匹配 "算不出来" → 计算规则', () => {
    const result = matchTranscript('这个题我算不出来');
    expect(result).not.toBeNull();
    expect(result!.hint).toContain('没关系');
  });
});

describe('多关键词匹配 — 优先第一个匹配的规则', () => {
  test('同时出现 "定义域" 和 "配方" → 配方法规则优先（KEYWORD_RULES 中排第一）', () => {
    // KEYWORD_RULES 顺序：配方法 > 定义域 > 计算习惯
    const result = matchTranscript('定义域我看了，但配方我配到一半乱了');
    // 第一个规则（配方法）的 keywords 包含 "配方"
    expect(result).not.toBeNull();
    expect(result!.keywords).toContain('配方');
  });

  test('同时出现 "算错" 和 "定义域" → 配方法规则优先（"算错"出现在第三条规则）', () => {
    // 第三规则 "算错" 不在前两条，但 transcript 中如果没有配方法/定义域关键词
    const result = matchTranscript('我算错了定义域');
    // "算错" 在 KEYWORD_RULES[2]（计算习惯）
    // "定义域" 在 KEYWORD_RULES[1]
    // 遍历顺序是规则0→规则1→规则2，所以 "定义域" 规则会先匹配
    expect(result).not.toBeNull();
    expect(result!.keywords).toContain('定义域');
  });
});

describe('无匹配场景', () => {
  test('无关键词匹配 → 返回 null', () => {
    const result = matchTranscript('这道题我看了一下，不太确定怎么做');
    expect(result).toBeNull();
  });

  test('空字符串 → 返回 null', () => {
    const result = matchTranscript('');
    expect(result).toBeNull();
  });

  test('只包含无关文字 → 返回 null', () => {
    const result = matchTranscript('嗯…让我想想啊，这个题好像有点难');
    expect(result).toBeNull();
  });
});

describe('getFeedback（完整输出）', () => {
  test('匹配时返回对应 hint + tags + isPreliminary: true', () => {
    const result = getFeedback('我配方总是算错');

    // "配方" 在 KEYWORD_RULES[0]（配方法）
    // 注意："算错" 在 KEYWORD_RULES[2]，但顺序优先规则0
    expect(result.hint).toContain('配方法');
    expect(result.relatedTags).toEqual(['配方法']);
    expect(result.isPreliminary).toBe(true);
  });

  test('无匹配时返回默认 hint', () => {
    const result = getFeedback('这个题有点难，我再想想');

    expect(result.hint).toContain('再拍几道后我们一起看看有没有规律');
    expect(result.relatedTags).toEqual([]);
    expect(result.isPreliminary).toBe(true);
  });

  test('空字符串返回默认 hint', () => {
    const result = getFeedback('');

    expect(result.hint).toContain('再拍几道后我们一起看看有没有规律');
    expect(result.relatedTags).toEqual([]);
    expect(result.isPreliminary).toBe(true);
  });
});
