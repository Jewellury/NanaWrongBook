/**
 * BKT 追踪算法 · 单元测试（测试先行）
 *
 * 测：答对概率涨 / 答错概率跌 / slip 标志 / 连续两 slip → 强制 gap / 同场不衰减
 */

import { describe, test, expect } from 'vitest';
import { bktUpdate, checkSlipAbuse, BKTParams } from '../../../lib/bkt';

// ---- 默认参数（TECH_PLAN_v2 专家组设定）----
const defaults: BKTParams = {
  pLearn0: 0.5,
  T: 0.15,      // 学习转移 P(T)
  G: 0.20,      // 猜测概率
  S: 0.10,      // 失误概率
  crossSessionT: 0,  // 同场初诊 = 0，跨 session 时才 = 0.15
};

describe('BKT（基本计算）', () => {

  test('答对 → 掌握概率上升', () => {
    const r = bktUpdate(defaults, true);
    expect(r.updatedPLearn).toBeGreaterThan(defaults.pLearn0);
  });

  test('答错 → 掌握概率下降', () => {
    const r = bktUpdate(defaults, false);
    expect(r.updatedPLearn).toBeLessThan(defaults.pLearn0);
  });

  test('连续答对 3 次 → masteryProb ≥ 0.85', () => {
    let p = 0.5;
    const params = { ...defaults, pLearn0: 0.5 };
    for (let i = 0; i < 3; i++) {
      const r = bktUpdate({ ...params, pLearn0: p }, true);
      p = r.updatedPLearn;
    }
    expect(p).toBeGreaterThanOrEqual(0.85);
  });

  test('连续答错 3 次 → masteryProb ≤ 0.30', () => {
    let p = 0.5;
    const params = { ...defaults, pLearn0: 0.5 };
    for (let i = 0; i < 3; i++) {
      const r = bktUpdate({ ...params, pLearn0: p }, false);
      p = r.updatedPLearn;
    }
    expect(p).toBeLessThanOrEqual(0.30);
  });

  test('P(L)=0.85 时答错 → slipFlag = true', () => {
    const r = bktUpdate({ ...defaults, pLearn0: 0.85 }, false);
    expect(r.slipFlag).toBe(true);
  });

  test('P(L)=0.15 时答错 → slipFlag = false（不是 slip，是真不会）', () => {
    const r = bktUpdate({ ...defaults, pLearn0: 0.15 }, false);
    expect(r.slipFlag).toBe(false);
  });

  test('P(L)=0.85 时答对 → slipFlag = false', () => {
    const r = bktUpdate({ ...defaults, pLearn0: 0.85 }, true);
    expect(r.slipFlag).toBe(false);
  });

  test('连续两次 slip → checkSlipAbuse 返回 true（强制改判 gap）', () => {
    expect(checkSlipAbuse([true, true])).toBe(true);
  });

  test('只有一次 slip → checkSlipAbuse 返回 false', () => {
    expect(checkSlipAbuse([true, false])).toBe(false);
    expect(checkSlipAbuse([false, true])).toBe(false);
  });

  test('同场初诊 crossSessionT=0 → 无跨时间衰减', () => {
    // 答对后，因为 T=0，posterior = updated
    const r = bktUpdate({ ...defaults, crossSessionT: 0 }, true);
    expect(r.updatedPLearn).toBe(r.posteriorPLearn);
  });

  test('跨 session T=0.15 → 有学习转移', () => {
    const r = bktUpdate({ ...defaults, crossSessionT: 0.15 }, true);
    // 有 T 时，updated > posterior（向掌握方向移动）
    expect(r.updatedPLearn).toBeGreaterThan(r.posteriorPLearn);
  });

  test('稳定掌握者连续答对 → 趋近 1.0', () => {
    let p = 0.85;
    const params = { ...defaults, pLearn0: 0.85 };
    for (let i = 0; i < 5; i++) {
      const r = bktUpdate({ ...params, pLearn0: p }, true);
      p = r.updatedPLearn;
    }
    expect(p).toBeGreaterThanOrEqual(0.95);
  });
});
