/**
 * Stage 3 Provider Smoke — 真实 Lite API 质量验证脚本
 *
 * 目标：在不改生产代码、不写数据库的前提下，用 3 张 fixture 图片
 * 验证真实豆包 Lite 的 7 字段 JSON 返回质量。
 *
 * 安全：
 * - API Key 从 .env 读取，绝不硬编码
 * - 不 import Prisma，不写任何数据库
 * - 报告不含 API Key
 *
 * 用法：
 *   npx tsx scripts/stage3-provider-smoke.ts
 *
 * 输出：
 *   - 控制台汇总
 *   - doc/research/provider-smoke-report.json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';

// ─── 48 个 KnowledgeNode（与 seed_graph.ts / case-analyzer.ts 一致）──

const KNOWLEDGE_NODES: { id: string; name: string }[] = [
  { id: "BG100", name: "韦达定理（根与系数关系）" },
  { id: "BG101", name: "解一元二次不等式（图象法）" },
  { id: "BG102", name: "区间表示法与集合互化" },
  { id: "BG103", name: "整体换元意识" },
  { id: "BG104", name: "二次函数闭区间最值（轴定区间定）" },
  { id: "M1-04", name: "元素与常用数集关系判断" },
  { id: "M1-05", name: "判断集合元素的三特性" },
  { id: "M1-06", name: "列举法表示集合" },
  { id: "M1-07", name: "描述法表示集合" },
  { id: "M1-08", name: "集合表示法互化" },
  { id: "M1-09", name: "判断子集关系" },
  { id: "M1-10", name: "判断集合相等" },
  { id: "M1-11", name: "求交集" },
  { id: "M1-12", name: "求并集" },
  { id: "M1-13", name: "求补集" },
  { id: "M1-14", name: "Venn图/数轴表示集合运算" },
  { id: "M1-15", name: "充分/必要/充要条件判定" },
  { id: "M1-16", name: "识别全称量词命题" },
  { id: "M1-17", name: "识别存在量词命题" },
  { id: "M1-18", name: "含一个量词命题的否定" },
  { id: "M1-19", name: "用反例判定量词命题真假" },
  { id: "M1-20", name: "作差法比较大小" },
  { id: "M1-21", name: "作商法比较正数大小" },
  { id: "M1-22", name: "直接套用基本不等式求最值" },
  { id: "M1-23", name: "基本不等式取等条件检查" },
  { id: "M1-24", name: "由图象判定一元二次不等式解集" },
  { id: "M1-25", name: "由根与开口快速写解集" },
  { id: "M1-26", name: "识别复数实部虚部与分类" },
  { id: "M1-27", name: "复数相等求参数" },
  { id: "M1-28", name: "复平面点/向量与复数互译" },
  { id: "M1-29", name: "复数加减及几何意义" },
  { id: "M1-30", name: "复数乘除与共轭化简" },
  { id: "M1-31", name: "空集陷阱：含参子集检验空集" },
  { id: "M1-32", name: "含参二次不等式按开口分类" },
  { id: "M1-33", name: "基本不等式 1 的代换配凑" },
  { id: "M2a-01", name: "定义域优先" },
  { id: "M2a-03", name: "求函数定义域" },
  { id: "M2a-04", name: "求函数值 f(a)" },
  { id: "M2a-09", name: "分段函数先判区间再求值" },
  { id: "M2a-13", name: "用定义判断单调性" },
  { id: "M2a-17", name: "按定义判断奇偶性" },
  { id: "M2a-32", name: "指数函数单调性比较大小" },
  { id: "M2a-33", name: "异底指数比较的中间量法" },
  { id: "M2a-38", name: "对数运算法则化简求值" },
  { id: "M2a-42", name: "对数函数单调性比较大小" },
  { id: "M2a-48", name: "函数零点与方程根对应" },
  { id: "M2a-49", name: "零点存在性区间验证" },
  { id: "M2a-51", name: "抽象函数 f(变量) 整体代换" },
];

const VALID_NODE_IDS = new Set(KNOWLEDGE_NODES.map((n) => n.id));

// ─── 16 个 TextbookTopic（与 seed_textbook_topics.ts 一致）──

const TEXTBOOK_TOPICS: {
  id: string;
  name: string;
  chapter: string;
  section: string;
}[] = [
  { id: "TB-001", name: "集合的概念", chapter: "第一章 集合与常用逻辑用语", section: "1.1 集合的概念" },
  { id: "TB-002", name: "集合间的基本关系", chapter: "第一章 集合与常用逻辑用语", section: "1.2 集合间的基本关系" },
  { id: "TB-003", name: "集合的基本运算", chapter: "第一章 集合与常用逻辑用语", section: "1.3 集合的基本运算" },
  { id: "TB-004", name: "充分条件与必要条件", chapter: "第一章 集合与常用逻辑用语", section: "1.4 充分条件与必要条件" },
  { id: "TB-005", name: "全称量词与存在量词", chapter: "第一章 集合与常用逻辑用语", section: "1.5 全称量词与存在量词" },
  { id: "TB-006", name: "等式性质与不等式性质", chapter: "第二章 一元二次函数、方程和不等式", section: "2.1 等式性质与不等式性质" },
  { id: "TB-007", name: "基本不等式", chapter: "第二章 一元二次函数、方程和不等式", section: "2.2 基本不等式" },
  { id: "TB-008", name: "一元二次不等式", chapter: "第二章 一元二次函数、方程和不等式", section: "2.3 一元二次不等式" },
  { id: "TB-009", name: "函数的概念及其表示", chapter: "第三章 函数的概念与性质", section: "3.1 函数的概念及其表示" },
  { id: "TB-010", name: "函数的基本性质", chapter: "第三章 函数的概念与性质", section: "3.2 函数的基本性质" },
  { id: "TB-011", name: "指数函数", chapter: "第四章 指数函数与对数函数", section: "4.2 指数函数" },
  { id: "TB-012", name: "对数", chapter: "第四章 指数函数与对数函数", section: "4.3 对数" },
  { id: "TB-013", name: "对数函数", chapter: "第四章 指数函数与对数函数", section: "4.4 对数函数" },
  { id: "TB-014", name: "函数的应用（零点）", chapter: "第四章 指数函数与对数函数", section: "4.5 函数的应用（零点）" },
  { id: "TB-015", name: "复数的概念", chapter: "第七章 复数", section: "7.1 复数的概念" },
  { id: "TB-016", name: "复数的四则运算", chapter: "第七章 复数", section: "7.2 复数的四则运算" },
];

const VALID_TOPIC_IDS = new Set(TEXTBOOK_TOPICS.map((t) => t.id));

// ─── 禁用词清单（OPS_handbook 措辞铁律）──

const BANNED_WORDS = [
  "诊断",
  "薄弱",
  "掌握",
  "得分",
  "解析",
  "答案",
  "解题",
  "正确答案",
  "错误答案",
  "完整识别",
];

// ─── Zod Schema（与 case-analyzer.ts 一致）──

const TextbookCandidateSchema = z.object({
  topicId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const NodeCandidateSchema = z.object({
  nodeId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const CaseAnalyzerSchema = z.object({
  transcript: z.string(),
  questionSummary: z.string(),
  textbookTopicCandidates: z.array(TextbookCandidateSchema).max(3),
  knowledgeNodeCandidates: z.array(NodeCandidateSchema).max(3),
  initialFeedback: z.string(),
  possibleMistakeReason: z.string(),
  nextActionSuggestion: z.string(),
});

type CaseAnalyzerOutput = z.infer<typeof CaseAnalyzerSchema>;

// ─── 提示词（与 case-analyzer.ts buildPrompt 完全一致）──

function buildPrompt(
  nodes: { id: string; name: string }[],
  textbookTopics: { id: string; name: string; chapter: string; section: string }[],
): string {
  const topicList = textbookTopics
    .map((t) => `- ${t.id}: ${t.section} ${t.name}（${t.chapter}）`)
    .join("\n");
  const nodeList = nodes.map((n) => `- ${n.id}: ${n.name}`).join("\n");

  return `你是高中数学错题采集助手。请看这道数学题的图片{若有音频则为学生口述思路}, 返回结构化 JSON。

【你的任务】
1. 如果有音频，转写学生语音为 transcript（口语，保留"嗯/然后"等）。无音频则 transcript 留空字符串。
2. 用一句话概括题目大意 questionSummary（若公式看不清就描述可见部分，不要编造）。
3. 从下面的课本章节清单里选出最多 3 个相关分类 textbookTopicCandidates，禁止发明清单外的 topicId：
${topicList}
   每个给 confidence(0~1) 和一句 reason。
4. 从下面的系统知识点清单里选出最多 3 个相关知识点 knowledgeNodeCandidates，禁止发明清单外的 nodeId：
${nodeList}
   每个给 confidence(0~1) 和一句 reason。
5. 给一句温和、鼓励式的 initialFeedback（面向学生，不透露答案对错，不批评）。
6. possibleMistakeReason：如果从图片或音频中能看到明显的错误痕迹，用一句话提示可能的方向（如"可能在符号变换时出了差错"）。不确定则留空。不做诊断，不给确定性结论。
7. nextActionSuggestion：给一句具体的下一步建议，格式为"回看 XX 课本章节 + 一个小动作"（如"回看 2.3 一元二次不等式，重点检查移项后不等号方向"）。**不要写"看视频"**——v1 没有资源库，不承诺视频链接。不确定则留空。

【纪律】
- 只做"大致属于哪几个知识点"的判断，不做深度归因
- 不解题、不给答案
- topicId 必须从课本章节清单中选，不能自创
- nodeId 必须从系统知识点清单中选，不能自创
- 如果图片不清晰或不是数学题，textbookTopicCandidates 和 knowledgeNodeCandidates 都返回空数组
- possibleMistakeReason 不做确定性诊断，用"可能""也许"等措辞
- 严禁使用"诊断""薄弱""掌握""得分"等词汇

【输出格式（严格 JSON，不要 markdown 代码块）】
{
  "transcript": "",
  "questionSummary": "",
  "textbookTopicCandidates": [{"topicId": "TB-010", "confidence": 0.85, "reason": "题目涉及函数单调性判断"}],
  "knowledgeNodeCandidates": [{"nodeId": "M2a-13", "confidence": 0.85, "reason": "题目涉及用定义判断单调性"}],
  "initialFeedback": "",
  "possibleMistakeReason": "",
  "nextActionSuggestion": ""
}`;
}

// ─── JSON 解析（含 jsonrepair 兜底）──

function parseJson(raw: string): unknown {
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      throw new Error(
        `JSON 解析失败（含 repair 兜底）: ${jsonStr.substring(0, 200)}`,
      );
    }
  }
}

// ─── 禁用词扫描 ──

function scanBannedWords(text: string): string[] {
  const found: string[] = [];
  for (const word of BANNED_WORDS) {
    if (text.includes(word)) {
      found.push(word);
    }
  }
  return found;
}

// ─── 单张图片测试 ──

interface FixtureResult {
  fixtureName: string;
  fileSizeKB: number;
  success: boolean;
  latencyMs: number;
  zodValid: boolean;
  zodErrors?: string[];
  parsed?: CaseAnalyzerOutput;
  topicIdHallucinations: string[];
  nodeIdHallucinations: string[];
  bannedWordsFound: string[];
  emptyFields: string[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  rawOutput?: string;
  error?: string;
}

async function runFixture(
  client: OpenAI,
  model: string,
  prompt: string,
  fixtureName: string,
  imageDataUrl: string,
  fileSizeKB: number,
): Promise<FixtureResult> {
  const startTime = Date.now();
  const result: FixtureResult = {
    fixtureName,
    fileSizeKB,
    success: false,
    latencyMs: 0,
    zodValid: false,
    topicIdHallucinations: [],
    nodeIdHallucinations: [],
    bannedWordsFound: [],
    emptyFields: [],
  };

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    });

    result.latencyMs = Date.now() - startTime;
    result.rawOutput = response.choices[0]?.message?.content || "";
    result.usage = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined;

    if (!result.rawOutput.trim()) {
      result.error = "API 返回空结果";
      return result;
    }

    // 解析 JSON
    const parsed = parseJson(result.rawOutput);
    result.success = true;

    // Zod 校验
    const zodResult = CaseAnalyzerSchema.safeParse(parsed);
    result.zodValid = zodResult.success;
    if (!zodResult.success) {
      result.zodErrors = zodResult.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      return result;
    }

    result.parsed = zodResult.data;

    // topicId 幻觉检查
    result.topicIdHallucinations = zodResult.data.textbookTopicCandidates
      .filter((c) => !VALID_TOPIC_IDS.has(c.topicId))
      .map((c) => c.topicId);

    // nodeId 幻觉检查
    result.nodeIdHallucinations = zodResult.data.knowledgeNodeCandidates
      .filter((c) => !VALID_NODE_IDS.has(c.nodeId))
      .map((c) => c.nodeId);

    // 禁用词扫描（扫描所有文本字段）
    const allText = [
      zodResult.data.transcript,
      zodResult.data.questionSummary,
      zodResult.data.initialFeedback,
      zodResult.data.possibleMistakeReason,
      zodResult.data.nextActionSuggestion,
      ...zodResult.data.textbookTopicCandidates.map((c) => c.reason),
      ...zodResult.data.knowledgeNodeCandidates.map((c) => c.reason),
    ].join(" ");
    result.bannedWordsFound = scanBannedWords(allText);

    // 空字段检查
    const fields = [
      ["transcript", zodResult.data.transcript],
      ["questionSummary", zodResult.data.questionSummary],
      ["initialFeedback", zodResult.data.initialFeedback],
      ["possibleMistakeReason", zodResult.data.possibleMistakeReason],
      ["nextActionSuggestion", zodResult.data.nextActionSuggestion],
    ] as const;
    for (const [name, value] of fields) {
      if (!value || value.trim() === "") {
        result.emptyFields.push(name);
      }
    }
  } catch (err: unknown) {
    result.latencyMs = Date.now() - startTime;
    const error = err as { message?: string; status?: number };
    result.error = `${error.status || "?"}: ${error.message || String(err)}`;
  }

  return result;
}

// ─── 主流程 ──

async function main() {
  console.log("========================================");
  console.log("Stage 3 Provider Smoke: 真实 Lite API 质量验证");
  console.log("========================================\n");

  // 1. 检查环境变量
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.error("❌ 未设置 VOLCENGINE_API_KEY");
    process.exit(1);
  }

  const baseURL =
    process.env.VOLCENGINE_BASE_URL ||
    "https://ark.cn-beijing.volces.com/api/v3";
  const model =
    process.env.LITE_ENDPOINT_ID ||
    process.env.LITE_MODEL_NAME ||
    "doubao-seed-2-0-lite-260215";

  // 脱敏打印
  const keyPreview =
    apiKey.length > 12
      ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
      : "***";

  console.log(`  API Key:  ${keyPreview}`);
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  Model:    ${model}`);
  console.log(`  节点数:   ${KNOWLEDGE_NODES.length}`);
  console.log(`  章节数:   ${TEXTBOOK_TOPICS.length}`);
  console.log("========================================\n");

  // 2. 初始化 client
  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { "User-Agent": "nana-provider-smoke/1.0" },
  });

  // 3. 加载 fixture 图片
  const fixturesDir = path.resolve("tests/fixtures/nana/cases");
  const fixtureFiles = [
    "clear-printed.jpg",
    "with-handwriting.jpg",
    "tilted-partial.jpg",
  ];

  const images: { name: string; dataUrl: string; fileSizeKB: number }[] = [];
  for (const file of fixtureFiles) {
    const filePath = path.join(fixturesDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ fixture 图片不存在: ${filePath}`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
    const fileSizeKB = Math.round(buf.length / 1024);
    images.push({
      name: file.replace(".jpg", ""),
      dataUrl,
      fileSizeKB,
    });
    console.log(
      `  📷 ${file}: ${fileSizeKB} KB → ${Math.round(dataUrl.length / 1024)} KB Base64`,
    );
  }
  console.log("");

  if (images.length === 0) {
    console.error("❌ 无可用 fixture 图片");
    process.exit(1);
  }

  // 4. 构造 prompt
  const prompt = buildPrompt(KNOWLEDGE_NODES, TEXTBOOK_TOPICS);

  // 5. 逐张测试
  const results: FixtureResult[] = [];

  for (const img of images) {
    console.log(`── ${img.name} (${img.fileSizeKB} KB) ──`);
    const result = await runFixture(
      client,
      model,
      prompt,
      img.name,
      img.dataUrl,
      img.fileSizeKB,
    );
    results.push(result);

    // 打印单张结果
    console.log(
      `  ${result.success ? "✅" : "❌"} 耗时: ${(result.latencyMs / 1000).toFixed(1)}s`,
    );
    if (result.usage) {
      console.log(
        `  tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out (total ${result.usage.total_tokens})`,
      );
    }
    if (result.error) {
      console.log(`  错误: ${result.error}`);
    }
    if (result.parsed) {
      console.log(`  Zod 校验: ${result.zodValid ? "✅" : "❌"}`);
      console.log(
        `  questionSummary: ${result.parsed.questionSummary.substring(0, 120)}`,
      );
      console.log(`  课本分类候选:`);
      for (const c of result.parsed.textbookTopicCandidates) {
        const halluc = !VALID_TOPIC_IDS.has(c.topicId) ? " ⚠️幻觉" : "";
        console.log(
          `    ${c.topicId} (${c.confidence}) - ${c.reason}${halluc}`,
        );
      }
      console.log(`  知识点候选:`);
      for (const c of result.parsed.knowledgeNodeCandidates) {
        const halluc = !VALID_NODE_IDS.has(c.nodeId) ? " ⚠️幻觉" : "";
        console.log(
          `    ${c.nodeId} (${c.confidence}) - ${c.reason}${halluc}`,
        );
      }
      console.log(`  initialFeedback: ${result.parsed.initialFeedback.substring(0, 120)}`);
      console.log(
        `  possibleMistakeReason: ${result.parsed.possibleMistakeReason.substring(0, 120) || "（空）"}`,
      );
      console.log(
        `  nextActionSuggestion: ${result.parsed.nextActionSuggestion.substring(0, 120) || "（空）"}`,
      );

      if (result.topicIdHallucinations.length > 0) {
        console.log(`  ⚠️ topicId 幻觉: ${result.topicIdHallucinations.join(", ")}`);
      }
      if (result.nodeIdHallucinations.length > 0) {
        console.log(`  ⚠️ nodeId 幻觉: ${result.nodeIdHallucinations.join(", ")}`);
      }
      if (result.bannedWordsFound.length > 0) {
        console.log(`  ⚠️ 禁用词: ${result.bannedWordsFound.join(", ")}`);
      }
      if (result.emptyFields.length > 0) {
        console.log(`  📝 空字段: ${result.emptyFields.join(", ")}`);
      }
    }
    if (result.zodErrors) {
      console.log(`  Zod 错误: ${result.zodErrors.join("; ")}`);
    }
    console.log("");
  }

  // 6. 汇总
  console.log("========================================");
  console.log("Smoke 汇总");
  console.log("========================================");
  console.log(`  总测试数: ${results.length}`);
  console.log(`  成功: ${results.filter((r) => r.success).length}`);
  console.log(`  Zod 校验通过: ${results.filter((r) => r.zodValid).length}`);
  console.log(
    `  topicId 幻觉: ${results.filter((r) => r.topicIdHallucinations.length > 0).length}`,
  );
  console.log(
    `  nodeId 幻觉: ${results.filter((r) => r.nodeIdHallucinations.length > 0).length}`,
  );
  console.log(
    `  禁用词违规: ${results.filter((r) => r.bannedWordsFound.length > 0).length}`,
  );

  const successCount = results.filter((r) => r.success).length;
  if (successCount > 0) {
    const avgLatency =
      results.filter((r) => r.success).reduce((s, r) => s + r.latencyMs, 0) /
      successCount;
    console.log(`  平均耗时: ${(avgLatency / 1000).toFixed(1)}s`);
  }

  console.log("\n明细:");
  for (const r of results) {
    const status = !r.success
      ? "❌失败"
      : r.zodValid
        ? "✅通过"
        : "⚠️JSON不稳";
    const halluc =
      r.topicIdHallucinations.length > 0 || r.nodeIdHallucinations.length > 0
        ? ` 幻觉:T${r.topicIdHallucinations.join(",")}/N${r.nodeIdHallucinations.join(",")}`
        : "";
    const banned =
      r.bannedWordsFound.length > 0
        ? ` 禁用词:${r.bannedWordsFound.join(",")}`
        : "";
    console.log(
      `  ${r.fixtureName}: ${status} ${(r.latencyMs / 1000).toFixed(1)}s${halluc}${banned}`,
    );
  }
  console.log("========================================\n");

  // 7. 保存详细报告
  const reportDir = path.resolve("doc/research");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "provider-smoke-report.json");

  const reportData = {
    generatedAt: new Date().toISOString(),
    model,
    baseURL,
    api_key_preview: keyPreview,
    knowledge_node_count: KNOWLEDGE_NODES.length,
    textbook_topic_count: TEXTBOOK_TOPICS.length,
    banned_words_list: BANNED_WORDS,
    results: results.map((r) => ({
      fixtureName: r.fixtureName,
      fileSizeKB: r.fileSizeKB,
      success: r.success,
      latencyMs: r.latencyMs,
      zodValid: r.zodValid,
      zodErrors: r.zodErrors,
      topicIdHallucinations: r.topicIdHallucinations,
      nodeIdHallucinations: r.nodeIdHallucinations,
      bannedWordsFound: r.bannedWordsFound,
      emptyFields: r.emptyFields,
      usage: r.usage,
      error: r.error,
      rawOutput: r.rawOutput?.substring(0, 3000),
      parsed: r.parsed,
    })),
    summary: {
      total: results.length,
      success: results.filter((r) => r.success).length,
      zodValid: results.filter((r) => r.zodValid).length,
      topicIdHallucinations: results.filter(
        (r) => r.topicIdHallucinations.length > 0,
      ).length,
      nodeIdHallucinations: results.filter(
        (r) => r.nodeIdHallucinations.length > 0,
      ).length,
      bannedWordsViolations: results.filter(
        (r) => r.bannedWordsFound.length > 0,
      ).length,
      avgLatencyMs:
        successCount > 0
          ? Math.round(
              results.filter((r) => r.success).reduce((s, r) => s + r.latencyMs, 0) /
                successCount,
            )
          : null,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf-8");
  console.log(`📄 详细报告已保存到: ${reportPath}`);
  console.log("✅ Smoke 完成。请人工审阅报告中的反馈质量。\n");
}

main().catch((err) => {
  console.error("❌ 脚本异常:", err);
  process.exit(1);
});
