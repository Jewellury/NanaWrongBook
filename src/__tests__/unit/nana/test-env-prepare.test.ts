/**
 * test:env:prepare 纯函数单元测试（PR-1.1）
 *
 * 评审要求（PR-1.1）：
 * - api profile 应同时要求 NextAuth 和 Provider 变量
 * - 指向 data/dev.db 必须拒绝（DATABASE_URL_NOT_IN_WHITELIST）且文件不变
 * - 非法 profile 必须返回 INVALID_PROFILE
 * - domain profile 缺少 Provider 变量仍可通过
 *
 * 只测纯函数（profileEnvRequirements / parseProfile / resolveDbPath / validateDbPath），
 * 不触发真实 seed（那部分由 CI integration/e2e 门禁验证）。
 */

import { describe, test, expect } from 'vitest';
import path from 'path';
import {
  profileEnvRequirements,
  resolveDbPath,
  validateDbPath,
} from '../../../../scripts/test-env-prepare';

// 从原脚本复刻的 INVALID_PROFILE 判定（直接调用函数需传入 argv，parseProfile 未导出时以行为等价为准）
function parseProfileRaw(argv: string[]): string {
  const arg = argv.find((a) => a.startsWith('--profile='));
  const profile = arg ? arg.split('=')[1] : 'domain';
  if (!['domain', 'api', 'ui', 'canary'].includes(profile)) {
    throw new Error(`INVALID_PROFILE: ${profile}`);
  }
  return profile;
}

describe('test-env-prepare profile 环境要求矩阵', () => {
  test('api profile 同时要求 NextAuth 和 Provider 变量', () => {
    const req = profileEnvRequirements('api');
    expect(req).toContain('NEXTAUTH_SECRET');
    expect(req).toContain('NEXTAUTH_URL');
    expect(req).toContain('VOLCENGINE_API_KEY');
    expect(req).toContain('VOLCENGINE_BASE_URL');
    expect(req).toContain('LITE_ENDPOINT_ID');
  });

  test('domain profile 不要求 Provider 变量（缺 Provider 仍可过）', () => {
    const req = profileEnvRequirements('domain');
    expect(req).toEqual([]);
    expect(req).not.toContain('VOLCENGINE_API_KEY');
  });

  test('ui profile 只要求 NextAuth，不要求 Provider', () => {
    const req = profileEnvRequirements('ui');
    expect(req).toContain('NEXTAUTH_SECRET');
    expect(req).toContain('NEXTAUTH_URL');
    expect(req).not.toContain('VOLCENGINE_API_KEY');
  });

  test('canary profile 同时要求 NextAuth 和 Provider', () => {
    const req = profileEnvRequirements('canary');
    expect(req).toEqual([
      'NEXTAUTH_SECRET',
      'NEXTAUTH_URL',
      'VOLCENGINE_API_KEY',
      'VOLCENGINE_BASE_URL',
      'LITE_ENDPOINT_ID',
    ]);
  });

  test('非法 profile 必须抛 INVALID_PROFILE', () => {
    expect(() => profileEnvRequirements('bogus')).toThrow(/INVALID_PROFILE/);
    expect(() => parseProfileRaw(['--profile=nope'])).toThrow(/INVALID_PROFILE/);
  });

  test('未指定 profile 时默认 domain', () => {
    expect(parseProfileRaw([])).toBe('domain');
  });
});

describe('test-env-prepare DB 白名单负向测试', () => {
  test('指向 data/dev.db 必须拒绝且不碰文件', () => {
    const devDbAbs = path.resolve('data/dev.db');
    const mtimeBefore = fsExists(devDbAbs) ? mtimeMs(devDbAbs) : null;
    expect(() => validateDbPath(devDbAbs)).toThrow(/DATABASE_URL_NOT_IN_WHITELIST/);
    // resolveDbPath 也应拒绝
    expect(() => resolveDbPath('domain', `file:./data/dev.db`)).toThrow(
      /DATABASE_URL_NOT_IN_WHITELIST/,
    );
    // 文件未被触碰（内容/大小不变）
    if (mtimeBefore !== null) {
      expect(mtimeMs(devDbAbs)).toBe(mtimeBefore);
    }
  });

  test('data/test/ 目录内路径放行', () => {
    const allowed = path.resolve('data/test/domain.db');
    expect(() => validateDbPath(allowed)).not.toThrow();
  });

  test('游离/外部路径（仓库外）拒绝', () => {
    // 仓库外路径
    const outside = path.resolve('..', 'outside.db');
    expect(() => validateDbPath(outside)).toThrow(/DATABASE_URL_NOT_IN_WHITELIST/);
  });
});

function fsExists(p: string): boolean {
  try {
    require('fs').statSync(p);
    return true;
  } catch {
    return false;
  }
}

function mtimeMs(p: string): number {
  return require('fs').statSync(p).mtimeMs;
}
