/**
 * Stage 3 v3 Spike：一体化多模态 Case Analyzer 验证脚本
 *
 * 验证目标：豆包 Seed 2.0 能否在「一次请求」中同时接收题图 + 语音 + 文本提示词，
 * 返回结构化 JSON（transcript / questionSummary / knowledgeCandidates / studentFacingFeedback）。
 *
 * 测试矩阵：
 *   1. Pro  + 图 only（基线：知识点候选质量）
 *   2. Pro  + 图 + WAV（验证 Pro 是否接受音频）
 *   3. Lite + 图 only（基线：知识点候选质量）
 *   4. Lite + 图 + WAV（验证 Lite 是否接受音频 + 图）
 *
 * 音频说明：用程序生成的 1 秒 440Hz WAV（验证 API 接受度，非语音质量测试）。
 * 真实手机录音需后续补充，但 API 连通性 + 格式接受度可先回答。
 *
 * 知识点候选：从 seed_graph_batch1.ts 硬编码 48 个节点（M1:30 + M2a:13 + BG100-104:5）。
 *
 * 安全：API Key 从 .env 读取，绝不硬编。
 * 注意：本脚本为手动 Spike，不进 CI。
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';

// ─── 48 个 KnowledgeNode（从 seed_graph_batch1.ts 提取）──

const KNOWLEDGE_NODES: { id: string; name: string }[] = [
  // BG100-104 (5)
  { id: "BG100", name: "韦达定理（根与系数关系）" },
  { id: "BG101", name: "解一元二次不等式（图象法）" },
  { id: "BG102", name: "区间表示法与集合互化" },
  { id: "BG103", name: "整体换元意识" },
  { id: "BG104", name: "二次函数闭区间最值（轴定区间定）" },
  // M1-04 ~ M1-33 (30)
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
  // M2a (13)
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

const VALID_NODE_IDS = new Set(KNOWLEDGE_NODES.map(n => n.id));

// ─── Zod Schema ────────────────────────────────────────

const CandidateSchema = z.object({
  nodeId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const CaseAnalyzerSchema = z.object({
  transcript: z.string(),
  questionSummary: z.string(),
  knowledgeCandidates: z.array(CandidateSchema).max(3),
  studentFacingFeedback: z.string(),
});

type CaseAnalyzerOutput = z.infer<typeof CaseAnalyzerSchema>;

// ─── 提示词 ────────────────────────────────────────────

function buildPrompt(nodes: { id: string; name: string }[]): string {
  const nodeList = nodes.map(n => `- ${n.id}: ${n.name}`).join('\n');
  return `你是高中数学错题采集助手。请看这道数学题的图片${'{若有音频则为学生口述思路}'}, 返回结构化 JSON。

【你的任务】
1. 如果有音频，转写学生语音为 transcript（口语，保留"嗯/然后"等）。无音频则 transcript 留空字符串。
2. 用一句话概括题目大意 questionSummary（若公式看不清就描述可见部分，不要编造）。
3. 从下面的知识点清单里选出最多 3 个相关知识点，禁止发明清单外的 nodeId：
${nodeList}
   每个给 confidence(0~1) 和一句 reason。
4. 给一句温和、鼓励式的 studentFacingFeedback（面向学生，不透露答案对错，不批评）。

【纪律】
- 只做"大致属于哪几个知识点"的判断，不做深度归因
- 不解题、不给答案
- nodeId 必须从上面的清单中选，不能自创
- 如果图片不清晰或不是数学题，knowledgeCandidates 返回空数组

【输出格式（严格 JSON，不要 markdown 代码块）】
{
  "transcript": "",
  "questionSummary": "",
  "knowledgeCandidates": [{"nodeId": "M2a-03", "confidence": 0.8, "reason": "题目涉及一次函数图像"}],
  "studentFacingFeedback": ""
}`;
}

// ─── 生成测试 WAV（1 秒 440Hz 正弦波）────────────────

function generateWavBase64(): string {
  const sampleRate = 16000;
  const durationSec = 1;
  const frequency = 440;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const bufferSize = 44 + dataSize;
  const buf = Buffer.alloc(bufferSize);
  let offset = 0;
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(bufferSize - 8, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4;
  buf.writeUInt16LE(2, offset); offset += 2;
  buf.writeUInt16LE(16, offset); offset += 2;
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3 * 32767;
    buf.writeInt16LE(Math.round(sample), offset);
    offset += 2;
  }
  return buf.toString('base64');
}

// ─── JSON 解析（含 jsonrepair 兜底）────────────────────

function parseJson(raw: string): unknown {
  // strip markdown code fence
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      throw new Error(`JSON 解析失败（含 repair 兜底）: ${jsonStr.substring(0, 200)}`);
    }
  }
}

// ─── 单次测试 ──────────────────────────────────────────

interface TestConfig {
  name: string;
  model: string;
  imageBase64: string;
  audioBase64?: string;
  audioFormat?: string;
}

interface TestResult {
  name: string;
  success: boolean;
  latencyMs: number;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  rawOutput?: string;
  parsed?: CaseAnalyzerOutput;
  zodValid: boolean;
  zodErrors?: string[];
  nodeIdHallucinations: string[];
  error?: string;
}

async function runTest(client: OpenAI, config: TestConfig, prompt: string): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    name: config.name,
    success: false,
    latencyMs: 0,
    zodValid: false,
    nodeIdHallucinations: [],
  };

  try {
    // 构造 messages
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: config.imageBase64 } },
    ];

    if (config.audioBase64 && config.audioFormat) {
      content.push({
        type: 'input_audio',
        input_audio: { data: config.audioBase64, format: config.audioFormat },
      });
    }

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content }],
      max_tokens: 2048,
      temperature: 0.2,
    });

    result.latencyMs = Date.now() - startTime;
    result.rawOutput = response.choices[0]?.message?.content || '';
    result.usage = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
    } : undefined;

    // 解析 JSON
    const parsed = parseJson(result.rawOutput);
    result.success = true;

    // Zod 校验
    const zodResult = CaseAnalyzerSchema.safeParse(parsed);
    result.zodValid = zodResult.success;
    if (zodResult.success) {
      result.parsed = zodResult.data;
      // 检查 nodeId 幻觉
      result.nodeIdHallucinations = zodResult.data.knowledgeCandidates
        .filter(c => !VALID_NODE_IDS.has(c.nodeId))
        .map(c => c.nodeId);
    } else {
      result.zodErrors = zodResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    }

  } catch (err: unknown) {
    result.latencyMs = Date.now() - startTime;
    const error = err as { message?: string; status?: number };
    result.error = `${error.status || '?'}: ${error.message || String(err)}`;
  }

  return result;
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.error('❌ 未设置 VOLCENGINE_API_KEY');
    process.exit(1);
  }

  const baseURL = process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const proModel = process.env.PRO_ENDPOINT_ID || process.env.PRO_MODEL_NAME || 'doubao-seed-2-0-pro-260215';
  const liteModel = process.env.LITE_ENDPOINT_ID || process.env.LITE_MODEL_NAME || 'doubao-seed-2-0-lite-260215';

  console.log('========================================');
  console.log('Stage 3 v3 Spike: 一体化多模态 Case Analyzer');
  console.log('========================================');
  console.log(`  Pro:  ${proModel}`);
  console.log(`  Lite: ${liteModel}`);
  console.log(`  节点数: ${KNOWLEDGE_NODES.length}`);
  console.log(`  Base URL: ${baseURL}`);
  console.log('========================================\n');

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { 'User-Agent': 'nana-spike-v3/1.0' },
  });

  // 加载 fixture 图片
  const fixturesDir = path.resolve('tests/fixtures/nana/cases');
  const images: { name: string; base64: string }[] = [];
  for (const file of ['clear-printed.jpg', 'with-handwriting.jpg', 'tilted-partial.jpg']) {
    const filePath = path.join(fixturesDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ fixture 图片不存在: ${filePath}`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const base64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
    images.push({ name: file.replace('.jpg', ''), base64 });
    console.log(`  📷 ${file}: ${(buf.length / 1024).toFixed(0)} KB → ${(base64.length / 1024).toFixed(0)} KB Base64`);
  }
  console.log('');

  // 生成测试 WAV
  const wavBase64 = generateWavBase64();
  console.log(`  🎵 测试 WAV: ${wavBase64.length} bytes Base64 (${(wavBase64.length / 1024).toFixed(0)} KB)\n`);

  const prompt = buildPrompt(KNOWLEDGE_NODES);

  // ── 测试矩阵 ──
  // 用第 1 张图（clear-printed）做主要测试
  const testImage = images[0];
  if (!testImage) {
    console.error('❌ 无可用 fixture 图片');
    process.exit(1);
  }

  const tests: TestConfig[] = [
    { name: 'Pro + 图 only', model: proModel, imageBase64: testImage.base64 },
    { name: 'Pro + 图 + WAV', model: proModel, imageBase64: testImage.base64, audioBase64: wavBase64, audioFormat: 'wav' },
    { name: 'Lite + 图 only', model: liteModel, imageBase64: testImage.base64 },
    { name: 'Lite + 图 + WAV', model: liteModel, imageBase64: testImage.base64, audioBase64: wavBase64, audioFormat: 'wav' },
  ];

  const allResults: TestResult[] = [];

  for (const test of tests) {
    console.log(`── ${test.name} ──`);
    const result = await runTest(client, test, prompt);
    allResults.push(result);

    console.log(`  ${result.success ? '✅' : '❌'} 耗时: ${(result.latencyMs / 1000).toFixed(1)}s`);
    if (result.usage) {
      console.log(`  tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out (total ${result.usage.total_tokens})`);
    }
    if (result.error) {
      console.log(`  错误: ${result.error}`);
    }
    if (result.parsed) {
      console.log(`  zod: ${result.zodValid ? '✅' : '❌'}`);
      console.log(`  questionSummary: ${result.parsed.questionSummary.substring(0, 100)}`);
      console.log(`  候选数: ${result.parsed.knowledgeCandidates.length}`);
      for (const c of result.parsed.knowledgeCandidates) {
        const hallucination = !VALID_NODE_IDS.has(c.nodeId) ? ' ⚠️幻觉' : '';
        console.log(`    ${c.nodeId} (${c.confidence}) - ${c.reason}${hallucination}`);
      }
      console.log(`  transcript: "${result.parsed.transcript.substring(0, 80)}"`);
      console.log(`  feedback: ${result.parsed.studentFacingFeedback.substring(0, 80)}`);
    }
    if (result.zodErrors) {
      console.log(`  zod 错误: ${result.zodErrors.join('; ')}`);
    }
    if (result.nodeIdHallucinations.length > 0) {
      console.log(`  ⚠️ nodeId 幻觉: ${result.nodeIdHallucinations.join(', ')}`);
    }
    console.log('');
  }

  // ── 对 3 张图都跑一遍（用支持音频的模型）──
  console.log('── 全图测试（使用最稳定的模型）──\n');
  const bestModel = allResults.find(r => r.success && r.zodValid)?.name.includes('Pro')
    ? proModel : liteModel;

  for (const img of images) {
    const testName = `${img.name} (图 only)`;
    console.log(`── ${testName} ──`);
    const result = await runTest(client, { name: testName, model: bestModel, imageBase64: img.base64 }, prompt);
    allResults.push(result);

    console.log(`  ${result.success ? '✅' : '❌'} 耗时: ${(result.latencyMs / 1000).toFixed(1)}s`);
    if (result.usage) {
      console.log(`  tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out`);
    }
    if (result.parsed) {
      console.log(`  zod: ${result.zodValid ? '✅' : '❌'}`);
      console.log(`  questionSummary: ${result.parsed.questionSummary.substring(0, 100)}`);
      console.log(`  候选: ${result.parsed.knowledgeCandidates.map(c => `${c.nodeId}(${c.confidence})`).join(', ')}`);
    }
    if (result.error) {
      console.log(`  错误: ${result.error}`);
    }
    console.log('');
  }

  // ── 汇总 ──
  console.log('========================================');
  console.log('Spike 汇总');
  console.log('========================================');
  console.log(`  总测试数: ${allResults.length}`);
  console.log(`  成功: ${allResults.filter(r => r.success).length}`);
  console.log(`  zod 校验通过: ${allResults.filter(r => r.zodValid).length}`);
  console.log(`  nodeId 幻觉: ${allResults.filter(r => r.nodeIdHallucinations.length > 0).length}`);
  console.log(`  平均耗时: ${(allResults.filter(r => r.success).reduce((s, r) => s + r.latencyMs, 0) / (allResults.filter(r => r.success).length || 1) / 1000).toFixed(1)}s`);

  console.log('\n明细:');
  for (const r of allResults) {
    const status = !r.success ? '❌失败' : r.zodValid ? '✅通过' : '⚠️JSON不稳';
    const hallucination = r.nodeIdHallucinations.length > 0 ? ` 幻觉:${r.nodeIdHallucinations.join(',')}` : '';
    console.log(`  ${r.name}: ${status} ${(r.latencyMs / 1000).toFixed(1)}s${hallucination}`);
  }
  console.log('========================================');

  // 保存详细结果到文件
  const outPath = path.resolve('doc/research/spike-v3-results.json');
  const outputData = allResults.map(r => ({
    name: r.name,
    success: r.success,
    latencyMs: r.latencyMs,
    usage: r.usage,
    zodValid: r.zodValid,
    zodErrors: r.zodErrors,
    nodeIdHallucinations: r.nodeIdHallucinations,
    error: r.error,
    rawOutput: r.rawOutput?.substring(0, 2000),
    parsed: r.parsed,
  }));
  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n详细结果已保存到: ${outPath}`);
}

main().catch((err) => {
  console.error('❌ 脚本异常:', err);
  process.exit(1);
});
