/**
 * transcript artifact 辅助工具
 *
 * 提供判断 transcript artifact content 是否为占位文本的 helper。
 * 占位文案 "尚未转写" 在 createCase 时写入（见 capture/page.tsx），
 * ASR 回写时只有占位文本才覆盖（守 P1：人 > AI）。
 *
 * Stage 3 新增（Round 1）。
 */

/**
 * transcript artifact 的占位文案。
 * createCase 恒写入此值（见 src/app/nana/capture/page.tsx 第 149 行）。
 */
export const PLACEHOLDER_TRANSCRIPT = "尚未转写";

/**
 * 判断 transcript content 是否为占位文本。
 *
 * 用途：
 * - ASR 回写前检查：只有占位文本才覆盖，已有人工内容则跳过（P1：人 > AI）
 * - 列表 API 判断 transcriptReady：占位文本 → false，真实转写 → true
 * - ASR 返回空字符串时不覆盖占位文本（保留占位，transcriptReady 仍为 false）
 *
 * @param content - transcript artifact 的 content 字段
 * @returns true 如果 content trim 后等于占位文案 "尚未转写"
 */
export function isPlaceholderTranscript(content: string | null | undefined): boolean {
  if (content == null) return true;
  return content.trim() === PLACEHOLDER_TRANSCRIPT;
}
