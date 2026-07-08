/**
 * audio-utils · 单元测试
 *
 * 测试 parseAudioMeta 三层解析 + needsTranscode 判断 + getAudioApiFormat/MIME_TO_FORMAT/SUPPORTED_AUDIO_FORMATS
 */

import { describe, test, expect } from 'vitest';
import { parseAudioMeta, needsTranscode, getAudioApiFormat, MIME_TO_FORMAT, SUPPORTED_AUDIO_FORMATS } from '@/lib/nana/audio-utils';

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

// ─── getAudioApiFormat / MIME_TO_FORMAT / SUPPORTED_AUDIO_FORMATS ──

describe('SUPPORTED_AUDIO_FORMATS', () => {
  test('包含 6 种格式', () => {
    expect(SUPPORTED_AUDIO_FORMATS.size).toBe(6);
    expect(SUPPORTED_AUDIO_FORMATS.has('wav')).toBe(true);
    expect(SUPPORTED_AUDIO_FORMATS.has('mp3')).toBe(true);
    expect(SUPPORTED_AUDIO_FORMATS.has('flac')).toBe(true);
    expect(SUPPORTED_AUDIO_FORMATS.has('ogg')).toBe(true);
    expect(SUPPORTED_AUDIO_FORMATS.has('m4a')).toBe(true);
    expect(SUPPORTED_AUDIO_FORMATS.has('aac')).toBe(true);
  });

  test('不包含 webm 和 mp4（需转码）', () => {
    expect(SUPPORTED_AUDIO_FORMATS.has('webm')).toBe(false);
    expect(SUPPORTED_AUDIO_FORMATS.has('mp4')).toBe(false);
  });
});

describe('MIME_TO_FORMAT', () => {
  test('映射 10 种 MIME 类型', () => {
    expect(Object.keys(MIME_TO_FORMAT).length).toBe(10);
  });

  test('wav 变体映射到 wav', () => {
    expect(MIME_TO_FORMAT['audio/wav']).toBe('wav');
    expect(MIME_TO_FORMAT['audio/x-wav']).toBe('wav');
    expect(MIME_TO_FORMAT['audio/wave']).toBe('wav');
  });

  test('mp3 变体映射到 mp3', () => {
    expect(MIME_TO_FORMAT['audio/mp3']).toBe('mp3');
    expect(MIME_TO_FORMAT['audio/mpeg']).toBe('mp3');
  });

  test('m4a 变体映射到 m4a', () => {
    expect(MIME_TO_FORMAT['audio/m4a']).toBe('m4a');
    expect(MIME_TO_FORMAT['audio/x-m4a']).toBe('m4a');
  });

  test('webm 和 mp4 不在映射表中', () => {
    expect(MIME_TO_FORMAT['audio/webm']).toBeUndefined();
    expect(MIME_TO_FORMAT['audio/mp4']).toBeUndefined();
  });
});

describe('getAudioApiFormat', () => {
  test('wav → wav', () => {
    expect(getAudioApiFormat('audio/wav')).toBe('wav');
  });

  test('m4a → m4a', () => {
    expect(getAudioApiFormat('audio/m4a')).toBe('m4a');
  });

  test('aac → aac', () => {
    expect(getAudioApiFormat('audio/aac')).toBe('aac');
  });

  test('mp3 → mp3', () => {
    expect(getAudioApiFormat('audio/mp3')).toBe('mp3');
  });

  test('flac → flac', () => {
    expect(getAudioApiFormat('audio/flac')).toBe('flac');
  });

  test('ogg → ogg', () => {
    expect(getAudioApiFormat('audio/ogg')).toBe('ogg');
  });

  test('webm → null（不支持，需转码）', () => {
    expect(getAudioApiFormat('audio/webm')).toBeNull();
  });

  test('mp4 → null（不支持，需转码）', () => {
    expect(getAudioApiFormat('audio/mp4')).toBeNull();
  });

  test('大写 MIME → 正确映射（不区分大小写）', () => {
    expect(getAudioApiFormat('AUDIO/WAV')).toBe('wav');
    expect(getAudioApiFormat('AUDIO/M4A')).toBe('m4a');
  });

  test('未知 MIME → null', () => {
    expect(getAudioApiFormat('audio/unknown')).toBeNull();
  });

  test('空字符串 → null', () => {
    expect(getAudioApiFormat('')).toBeNull();
  });
});

describe('needsTranscode 与 getAudioApiFormat 逻辑互逆', () => {
  test('needsTranscode=false 的 MIME → getAudioApiFormat 返回非 null', () => {
    const nativeMimes = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp3', 'audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac'];
    for (const mime of nativeMimes) {
      expect(needsTranscode(mime)).toBe(false);
      expect(getAudioApiFormat(mime)).not.toBeNull();
    }
  });

  test('needsTranscode=true 的 MIME → getAudioApiFormat 返回 null', () => {
    const transcodeMimes = ['audio/webm', 'audio/mp4', 'audio/unknown'];
    for (const mime of transcodeMimes) {
      expect(needsTranscode(mime)).toBe(true);
      expect(getAudioApiFormat(mime)).toBeNull();
    }
  });
});
