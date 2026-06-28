/**
 * 单题轻反馈 · 关键词匹配规则
 *
 * 纯逻辑，不调 LLM。遍历 KEYWORD_RULES，先匹配到的返回对应 hint + relatedTags。
 * 无匹配返回默认 hint。
 *
 * 本模块可脱离 Next.js 环境独立测试。
 */

export interface Rule {
  keywords: string[];
  hint: string;
  tags: string[];
}

export const KEYWORD_RULES: Rule[] = [
  {
    keywords: ["完全平方", "配方", "平方"],
    hint: "你提到配方法——可能和完全平方公式的灵活运用有关。这只是初步线索，不是最终判断。",
    tags: ["配方法"],
  },
  {
    keywords: ["定义域", "值域"],
    hint: "你谈到定义域/值域相关的判断——可能和函数的定义域优先意识有关。这只是初步线索，不是最终判断。",
    tags: ["定义域与值域"],
  },
  {
    keywords: ["算错", "算不对", "算不出来"],
    hint: "没关系，这反而帮我们找到了需要关注的地方。再拍几道后我们一起看看。",
    tags: ["计算习惯"],
  },
];

export const DEFAULT_HINT =
  "收到这道题。你谈到的这些都帮你记下来了，再拍几道后我们一起看看有没有规律。";

export const DEFAULT_TAGS: string[] = [];

/**
 * 匹配给定 transcript 中是否包含任意关键词。
 * 返回第一个匹配的规则；无匹配则返回 null。
 */
export function matchTranscript(transcript: string): Rule | null {
  if (!transcript) return null;

  const lower = transcript.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return rule;
      }
    }
  }

  return null;
}

export interface FeedbackResult {
  hint: string;
  relatedTags: string[];
  isPreliminary: true;
}

/**
 * 核心函数：输入 transcript，输出轻反馈结果。
 */
export function getFeedback(transcript: string): FeedbackResult {
  const matched = matchTranscript(transcript);

  if (matched) {
    return {
      hint: matched.hint,
      relatedTags: matched.tags,
      isPreliminary: true,
    };
  }

  return {
    hint: DEFAULT_HINT,
    relatedTags: DEFAULT_TAGS,
    isPreliminary: true,
  };
}
