/**
 * 周末诊断会话状态机
 *
 * 对应 TECH_PLAN_v2 §6.2 周末 session 状态机（≤90 分钟）的 8 个阶段。
 * 不持久化 currentStep——状态由调用的先后顺序自然决定（决策③）。
 *
 * 合法跳转：
 *   batch_photo → question_review → auto_triage → redo_oral
 *   → newman_inquiry → [probe_drill] → map_update → weekly_pdf
 */

// ---- 类型定义 ----

/** 周末 session 的 8 个阶段 */
export type SessionStep =
  | 'batch_photo'      // 批量拍照（题目+过程+标记整页拍）
  | 'question_review'  // 题面确认（逐题确认/修正）
  | 'auto_triage'      // 自动分诊（挑 2-3 道深诊，其余静默入库打标）
  | 'redo_oral'        // 重做口述（深诊题逐道重做+录音）
  | 'newman_inquiry'   // Newman 追问
  | 'probe_drill'      // 探针下探（必要时，可选）
  | 'map_update'       // 地图更新（只报增量，P4）
  | 'weekly_pdf';      // 生成下周纸质包 PDF 并打印

// ---- 跳转规则 ----

/**
 * 每个阶段允许的下一步列表
 * probe_drill 是可选的：newman_inquiry 可以直接跳到 map_update
 */
const NEXT_STEPS: Record<SessionStep, SessionStep[]> = {
  batch_photo:      ['question_review'],
  question_review:  ['auto_triage'],
  auto_triage:      ['redo_oral'],
  redo_oral:        ['newman_inquiry'],
  newman_inquiry:   ['probe_drill', 'map_update'],
  probe_drill:      ['map_update'],
  map_update:       ['weekly_pdf'],
  weekly_pdf:       [], // 终态
};

/** 终态步骤集合 */
const TERMINAL_STEPS: Set<SessionStep> = new Set(['weekly_pdf']);

// ---- 状态机 ----

export class SessionMachine {
  private current: SessionStep;

  /**
   * @param startAt 起始步骤，默认 'batch_photo'
   */
  constructor(startAt: SessionStep = 'batch_photo') {
    this.current = startAt;
  }

  /** 当前所在步骤 */
  get step(): SessionStep {
    return this.current;
  }

  /** 检查是否可以跳转到目标步骤 */
  canTransitionTo(next: SessionStep): boolean {
    return NEXT_STEPS[this.current]?.includes(next) ?? false;
  }

  /** 获取当前步骤允许的下一步列表 */
  getAllowedNext(): SessionStep[] {
    return NEXT_STEPS[this.current] ?? [];
  }

  /**
   * 推进到下一个步骤
   * @throws 非法跳转时抛出 Error
   */
  advance(next: SessionStep): void {
    if (!this.canTransitionTo(next)) {
      const allowed = this.getAllowedNext();
      throw new Error(
        `非法状态跳转: "${this.current}" → "${next}"。` +
        `允许的下一步: ${allowed.length > 0 ? allowed.join(', ') : '无（终态）'}`
      );
    }
    this.current = next;
  }

  /** 是否已到达终态 */
  isComplete(): boolean {
    return TERMINAL_STEPS.has(this.current);
  }

  /** 是否可从中断处恢复（非终态即可恢复） */
  isResumable(): boolean {
    return !this.isComplete();
  }

  /**
   * 重置到起始步骤
   * @param step 目标步骤，默认 'batch_photo'
   */
  reset(step: SessionStep = 'batch_photo'): void {
    this.current = step;
  }
}

// ---- 工具函数 ----

/** 获取完整的 8 步序列（供 UI/日志展示用） */
export function getAllSteps(): SessionStep[] {
  return [
    'batch_photo',
    'question_review',
    'auto_triage',
    'redo_oral',
    'newman_inquiry',
    'probe_drill',
    'map_update',
    'weekly_pdf',
  ];
}

/** 判断某步骤是否为可选步骤 */
export function isOptionalStep(step: SessionStep): boolean {
  return step === 'probe_drill';
}
