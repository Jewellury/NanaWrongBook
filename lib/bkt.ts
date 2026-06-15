/**
 * BKT 贝叶斯知识追踪
 *
 * 对应 TECH_PLAN_v2 §4.4。
 * 首版不学习参数，全部用专家组默认值。
 *
 * 决策④：T = 学习转移概率 P(T)，非遗忘。
 * 同场初诊内 crossSessionT = 0，跨 session 时才 = 0.15。
 *
 * 标准 BKT 公式：
 *   答对: P(L|correct) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
 *   答错: P(L|wrong)   = P(L)S     / [P(L)S     + (1-P(L))(1-G)]
 *   P(L) ← posterior + (1-posterior) * T
 */

export interface BKTParams {
  pLearn0: number;        // 初始掌握概率 P(L₀)
  T: number;              // 学习转移概率 P(T) = 0.15（跨 session）
  G: number;              // 猜测概率 = 0.20（选择题 0.25）
  S: number;              // 失误概率 = 0.10
  crossSessionT: number;  // 实际施加的 T：同场 = 0，跨 session = 0.15
}

export interface BKTResult {
  posteriorPLearn: number;   // 后验 P(L|evidence)，不含 T
  updatedPLearn: number;     // posterior + (1-posterior) * crossSessionT
  slipFlag: boolean;         // P(L)≥0.7 且答错 → true
}

export function bktUpdate(params: BKTParams, correct: boolean): BKTResult {
  const { pLearn0, G, S, crossSessionT } = params;
  const pL = pLearn0;
  const pNotL = 1 - pL;

  let posterior: number;

  if (correct) {
    // P(L|correct) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
    const num = pL * (1 - S);
    const denom = num + pNotL * G;
    posterior = denom > 0 ? num / denom : pL;
  } else {
    // P(L|wrong) = P(L)S / [P(L)S + (1-P(L))(1-G)]
    const num = pL * S;
    const denom = num + pNotL * (1 - G);
    posterior = denom > 0 ? num / denom : pL;
  }

  // 学习转移：向掌握方向移动
  const updated = posterior + (1 - posterior) * crossSessionT;

  // slip 判定：P(L)≥0.7 且答错 → 认为是失误
  const slipFlag = pL >= 0.7 && !correct;

  return {
    posteriorPLearn: posterior,
    updatedPLearn: Math.min(1, Math.max(0, updated)),
    slipFlag,
  };
}

/**
 * 连续两次 slipFlag → 强制改判 gap（防滥用粗心标签）
 */
export function checkSlipAbuse(slipHistory: boolean[]): boolean {
  if (slipHistory.length < 2) return false;
  const recent = slipHistory.slice(-2);
  return recent[0] && recent[1];
}
