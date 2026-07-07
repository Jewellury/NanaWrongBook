/**
 * audio-utils · 单元测试
 *
 * 测试 parseAudioMeta 三层解析 + needsTranscode 判断
 */

import { describe, test, expect } from 'vitest';
import { parseAudioMeta, needsTranscode } from '@/lib/nana/audio-utils';

// ─── parseAudioMeta ───────────────────────────────────

describe('parseAudioMeta: 分号格式（当前生产格式）', () => {
  test('完整分号格式 → 正确解析所有字段', () => {
    const result = parseAudioMeta('durationSec=10;mime=audio/webm;sizeBytes=12345');
    expect(result.mime).toBe('audio/webm');
    expect(result.durationSec).toBe(10);
    expect(result.sizeBytes).toBe(12345);
  });

  test('只有 mime 字段 → 正确解析', () => {
    const result = parseAudioMeta('mime=audio/mp4');
    expect(result.mime).toBe('audio/mp4');
    expect(result.durationSec).toBeUndefined();
    expect(result.sizeBytes).toBeUndefined();
  });

  test('字段顺序不同 → 正确解析', () => {
    const result = parseAudioMeta('mime=audio/webm;durationSec=5;sizeBytes=100');
    expect(result.mime).toBe('audio/webm');
    expect(result.durationSec).toBe(5);
    expect(result.sizeBytes).toBe(100);
  });

  test('有多余空格 → trim 后正确解析', () => {
    const result = parseAudioMeta('durationSec = 10 ; mime = audio/webm ; sizeBytes = 12345');
    expect(result.mime).toBe('audio/webm');
    expect(result.durationSec).toBe(10);
    expect(result.sizeBytes).toBe(12345);
  });

  test('durationSec 非数字 → 跳过该字段，其他正常', () => {
    const result = parseAudioMeta('durationSec=abc;mime=audio/webm;sizeBytes=100');
    expect(result.mime).toBe('audio/webm');
    expect(result.durationSec).toBeUndefined();
    expect(result.sizeBytes).toBe(100);
  });

  test('多余的分号 → 不影响解析', () => {
    const result = parseAudioMeta('mime=audio/webm;;sizeBytes=100;');
    expect(result.mime).toBe('audio/webm');
    expect(result.sizeBytes).toBe(100);
  });
});

describe('parseAudioMeta: JSON 格式', () => {
  test('完整 JSON → 正确解析', () => {
    const result = parseAudioMeta('{"mime":"audio/webm","durationSec":10,"sizeBytes":12345}');
    expect(result.mime).toBe('audio/webm');
    expect(result.durationSec).toBe(10);
    expect(result.sizeBytes).toBe(12345);
  });

  test('部分字段 JSON → 只解析存在的字段', () => {
    const result = parseAudioMeta('{"mime":"audio/mp4"}');
    expect(result.mime).toBe('audio/mp4');
    expect(result.durationSec).toBeUndefined();
  });

  test('JSON 格式错误 → 返回空对象', () => {
    const result = parseAudioMeta('{invalid json}');
    expect(result).toEqual({});
  });

  test('JSON 中 mime 不是字符串 → 跳过', () => {
    const result = parseAudioMeta('{"mime":123,"durationSec":10}');
    expect(result.mime).toBeUndefined();
    expect(result.durationSec).toBe(10);
  });
});

describe('parseAudioMeta: 边界情况', () => {
  test('null → 空对象', () => {
    expect(parseAudioMeta(null)).toEqual({});
  });

  test('undefined → 空对象', () => {
    expect(parseAudioMeta(undefined)).toEqual({});
  });

  test('空字符串 → 空对象', () => {
    expect(parseAudioMeta('')).toEqual({});
  });

  test('纯空格 → 空对象', () => {
    expect(parseAudioMeta('   ')).toEqual({});
  });

  test('无法识别的格式 → 空对象', () => {
    expect(parseAudioMeta('some random text')).toEqual({});
  });
});

// ─── needsTranscode ───────────────────────────────────

describe('needsTranscode', () => {
  test('webm → true（需要转码）', () => {
    expect(needsTranscode('audio/webm')).toBe(true);
  });

  test('mp4 → true（需要转码）', () => {
    expect(needsTranscode('audio/mp4')).toBe(true);
  });

  test('wav → false（Lite 原生支持）', () => {
    expect(needsTranscode('audio/wav')).toBe(false);
  });

  test('m4a → false（Round 0 实测可用）', () => {
    expect(needsTranscode('audio/m4a')).toBe(false);
  });

  test('mp3 → false（Lite 原生支持）', () => {
    expect(needsTranscode('audio/mp3')).toBe(false);
  });

  test('aac → false（Lite 原生支持）', () => {
    expect(needsTranscode('audio/aac')).toBe(false);
  });

  test('大写 MIME → false（不区分大小写）', () => {
    expect(needsTranscode('AUDIO/WAV')).toBe(false);
  });

  test('undefined → true（保守策略）', () => {
    expect(needsTranscode(undefined)).toBe(true);
  });

  test('null → true（保守策略）', () => {
    expect(needsTranscode(null)).toBe(true);
  });

  test('空字符串 → true（保守策略）', () => {
    expect(needsTranscode('')).toBe(true);
  });

  test('未知 MIME → true（保守策略，尝试转码）', () => {
    expect(needsTranscode('audio/unknown')).toBe(true);
  });
});
