/**
 * mock-data.ts — 第 1 阶段采集壳 mock 数据源
 *
 * 本阶段所有数据为硬编码 mock，第 5 阶段接通真实 ASR/VLM 后替换。
 *
 * 措辞合规检查（P4）：
 * - "再拍几道" ✓（禁用"诊断结论""薄弱"）
 * - "初步线索" ✓（禁用"终诊""判断"）
 */

export const MOCK_QUESTION = {
  stem: "已知函数 f(x) = x² − 2x − 3\n(1) 求函数的定义域与值域；\n(2) 求 f(x) 的最小值，并指出此时 x 的取值。",
};

export const MOCK_TRANSCRIPT = [
  "嗯…这道题我先看了定义域，",
  "因为它就是个多项式，x 好像什么都能取，",
  "然后值域我有点不确定，我想配成完全平方但配到一半就乱了…",
];

export const MOCK_FEEDBACK = {
  hint: "你想到先看定义域，也想到配完全平方——方向很对。你说的'配到一半就乱了'可能和配方法的步骤有关。这只是初步线索，再拍几道后我们一起看。",
  relatedTags: ["配方法"],
};

/** 合并逐字稿数组为单段文本 */
export function joinTranscript(lines: string[]): string {
  return lines.join("\n");
}
