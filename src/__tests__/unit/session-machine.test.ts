/**
 * 会话状态机 · 纯单元测试
 */

import { describe, test, expect } from 'vitest';
import { SessionMachine, SessionStep, getAllSteps, isOptionalStep } from '../../lib/session-machine';

describe('SessionMachine（正常流程）', () => {
  test('默认从 batch_photo 开始', () => {
    const sm = new SessionMachine();
    expect(sm.step).toBe('batch_photo');
    expect(sm.isComplete()).toBe(false);
  });

  test('完整 8 步流程走通', () => {
    const sm = new SessionMachine();
    const path: SessionStep[] = [
      'batch_photo', 'question_review', 'auto_triage', 'redo_oral',
      'newman_inquiry', 'probe_drill', 'map_update', 'weekly_pdf',
    ];

    for (let i = 1; i < path.length; i++) {
      expect(sm.canTransitionTo(path[i])).toBe(true);
      sm.advance(path[i]);
    }

    expect(sm.step).toBe('weekly_pdf');
    expect(sm.isComplete()).toBe(true);
  });

  test('newman_inquiry 可跳过 probe_drill 直达 map_update', () => {
    const sm = new SessionMachine();
    sm.advance('question_review');
    sm.advance('auto_triage');
    sm.advance('redo_oral');
    sm.advance('newman_inquiry');
    sm.advance('map_update'); // 跳过了 probe_drill
    expect(sm.step).toBe('map_update');
  });

  test('newman_inquiry 也可选择 probe_drill', () => {
    const sm = new SessionMachine();
    sm.advance('question_review');
    sm.advance('auto_triage');
    sm.advance('redo_oral');
    sm.advance('newman_inquiry');
    sm.advance('probe_drill'); // 走探针
    expect(sm.step).toBe('probe_drill');
    sm.advance('map_update');
    expect(sm.step).toBe('map_update');
  });

  test('getAllowedNext 返回正确的选项列表', () => {
    const sm = new SessionMachine();
    expect(sm.getAllowedNext()).toEqual(['question_review']);

    sm.advance('question_review');
    sm.advance('auto_triage');
    sm.advance('redo_oral');
    sm.advance('newman_inquiry');
    expect(sm.getAllowedNext().sort()).toEqual(['map_update', 'probe_drill'].sort());
  });

  test('终态 getAllowedNext 返回空数组', () => {
    const sm = new SessionMachine('weekly_pdf');
    expect(sm.getAllowedNext()).toEqual([]);
  });

  test('isResumable 正确判断', () => {
    const sm = new SessionMachine();
    expect(sm.isResumable()).toBe(true);

    sm.advance('question_review');
    expect(sm.isResumable()).toBe(true);

    // 走到终态
    sm.advance('auto_triage');
    sm.advance('redo_oral');
    sm.advance('newman_inquiry');
    sm.advance('map_update');
    sm.advance('weekly_pdf');
    expect(sm.isComplete()).toBe(true);
    expect(sm.isResumable()).toBe(false);
  });
});

describe('SessionMachine（非法跳转）', () => {
  test('非法跳转抛 Error', () => {
    const sm = new SessionMachine();
    expect(() => sm.advance('map_update')).toThrow('非法状态跳转');
  });

  test('终态不可继续跳转', () => {
    const sm = new SessionMachine('weekly_pdf');
    expect(() => sm.advance('batch_photo')).toThrow('非法状态跳转');
  });

  test('跳步抛 Error', () => {
    const sm = new SessionMachine();
    expect(() => sm.advance('auto_triage')).toThrow('非法状态跳转');
  });

  test('canTransitionTo 返回 false 而非抛错', () => {
    const sm = new SessionMachine();
    expect(sm.canTransitionTo('map_update')).toBe(false);
    expect(sm.canTransitionTo('question_review')).toBe(true);
  });
});

describe('SessionMachine（辅助函数）', () => {
  test('getAllSteps 返回 8 个步骤', () => {
    expect(getAllSteps()).toHaveLength(8);
  });

  test('只有 probe_drill 被标记为可选', () => {
    const steps = getAllSteps();
    for (const step of steps) {
      if (step === 'probe_drill') {
        expect(isOptionalStep(step)).toBe(true);
      } else {
        expect(isOptionalStep(step)).toBe(false);
      }
    }
  });

  test('reset 可重置到任意步骤', () => {
    const sm = new SessionMachine();
    sm.advance('question_review');
    sm.advance('auto_triage');
    sm.reset('newman_inquiry');
    expect(sm.step).toBe('newman_inquiry');
  });

  test('可指定起始步骤', () => {
    const sm = new SessionMachine('map_update');
    expect(sm.step).toBe('map_update');
  });
});
