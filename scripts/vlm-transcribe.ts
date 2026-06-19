/**
 * VLM 识图转写脚本 — 火山方舟豆包 Seed 2.0（OpenAI 兼容接口）
 *
 * 用法:
 *   # 拍照识题（vision 任务，默认用 Pro）
 *   npx tsx scripts/vlm-transcribe.ts --task=vision --year=2024 --pages=1-2
 *   npx tsx scripts/vlm-transcribe.ts --task=vision --year=2025 --pages=all
 *
 *   # 录音转笔记（audio 任务，用 Lite——唯一支持音频的 Seed 2.0）
 *   npx tsx scripts/vlm-transcribe.ts --task=audio --year=2025 --pages=all
 *
 *   # 手动指定模型
 *   npx tsx scripts/vlm-transcribe.ts --task=vision --model=doubao-seed-2-0-pro-260215 --year=2024 --pages=1-2
 *
 * 任务→模型自动路由:
 *   vision → doubao-seed-2-0-pro-260215（视觉精度最高，图表/公式理解 SOTA）
 *   audio  → doubao-seed-2-0-lite-260215（全模态：文本+图片+语音+视频）
 *
 * 输入: doc/research/extracted/<year>/pages/*.jpg
 * 输出: doc/research/transcripts/<year>-vlm-draft.md
 *
 * 安全: API Key 从 process.env.VOLCENGINE_API_KEY 读取，绝不硬编
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ============================================================
// 提示词 A：真题逐题解析（修订版）
// 来源: doc/reference/M3_content_prompts.md
// ============================================================
const SYSTEM_PROMPT = `我有新高考全国 I 卷数学真题的整页图片（page-01.jpg ... page-NN.jpg，由真题解析版 docx
转 PDF 再按 150DPI 导出，公式清晰可读）。请逐页看图，把整张试卷完整、忠实地转写成结构化文本。

【这是第一阶段：忠实转写】
你的唯一任务是"把图上的题一字不差变成文本"。不要判断这题考哪个知识点编码、不要分难度等级、
不要分类——那是后面单独一步的事。你只管转写准确、完整。

【重要】文档里的公式、根号、分式、几何图形原本都是图片，必须【看图转写】，
不要假设有现成文本可抓。每道题都要转写完整，一题都不能漏。

每道题输出以下字段（YAML 或 Markdown 表，逐题一条）：
- qid: 年份-题号（如 2024-T3，做来源追溯用）
- year: 年份
- number: 题号
- type: 单选/多选/填空/解答
- score: 分值
- stem: 完整题面，数学符号一律 LaTeX（如 \`$A=\\{x\\mid -5<x^3<5\\}$\`），几何图形用文字描述要素
- options: 选择题四个选项（LaTeX），非选择题留空
- answer: 答案
- analysis_brief: 解析要点（基础题和大题第一问写出标准解法步骤；压轴题只写思路一两句）
- has_figure: 是否含几何图形（true/false）
- 考点关键词: 用大白话写这题大致考什么（2-5 个词，如"集合交集、区间开闭"或"函数单调性、定义域"）。
  这只是给人看的线索，不要套任何编码体系。

【转写纪律】
1. 数字、正负号、上下标、根号范围、集合区间开闭，最容易看错，逐字核对原图。
2. 看不清/不确定的地方不要猜，在该字段后标 [存疑] 并说明哪里看不清。
3. 几何图无法用 LaTeX 表达的，用文字尽量描述清楚已知条件，标 has_figure: true 提示人工补图。
4. 不改写、不简化、不"优化"题目，保持原题措辞。

先做完一整年（如 2024）全部题目，再做下一年。每年做完停一下，等我确认格式再继续。`;

// ============================================================
// 任务 → 模型路由
// ============================================================
type Task = 'vision' | 'audio';

// 从环境变量读取 endpoint ID，无则回退到模型名
const TASK_ENDPOINT: Record<Task, { envEndpoint: string; envModel: string; defaultModel: string }> = {
  vision: {
    envEndpoint: 'PRO_ENDPOINT_ID',
    envModel: 'PRO_MODEL_NAME',
    defaultModel: 'doubao-seed-2-0-pro-260215',
  },
  audio: {
    envEndpoint: 'LITE_ENDPOINT_ID',
    envModel: 'LITE_MODEL_NAME',
    defaultModel: 'doubao-seed-2-0-lite-260215',
  },
};

function resolveModel(task: Task): string {
  const cfg = TASK_ENDPOINT[task];
  // 优先用 endpoint ID（推荐，路由到具体推理接入点），其次模型名
  return process.env[cfg.envEndpoint] || process.env[cfg.envModel] || cfg.defaultModel;
}

// Seed 2.0 系列定价（¥/百万 tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'doubao-seed-2-0-pro-260215':  { input: 3.2, output: 16 },
  'doubao-seed-2-0-lite-260215': { input: 0.6, output: 3.6 },
  'doubao-seed-2-0-mini-260215': { input: 0.2, output: 2 },
};

// ============================================================
// 配置
// ============================================================
interface Config {
  apiKey: string;
  baseURL: string;
  model: string;
  task: Task;
  year: string;
  pageRange: [number, number] | 'all';
}

function parseArgs(): { task: Task; year: string; pages: string; model?: string } {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};
  for (const arg of args) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (m) params[m[1]] = m[2];
  }
  if (!params.year) {
    console.error('用法: npx tsx scripts/vlm-transcribe.ts --task=<vision|audio> --year=<year> --pages=<range|all> [--model=<id>]');
    console.error('示例: npx tsx scripts/vlm-transcribe.ts --task=vision --year=2024 --pages=1-2');
    console.error('示例: npx tsx scripts/vlm-transcribe.ts --task=vision --year=2024 --pages=all');
    console.error('示例: npx tsx scripts/vlm-transcribe.ts --task=audio  --year=2025 --pages=all');
    process.exit(1);
  }
  const task = (params.task || 'vision') as Task;
  if (task !== 'vision' && task !== 'audio') {
    console.error(`无效的 task: ${task}（可选: vision, audio）`);
    process.exit(1);
  }
  return { task, year: params.year, pages: params.pages || 'all', model: params.model };
}

function parsePageRange(raw: string, total: number): number[] {
  if (raw === 'all') return Array.from({ length: total }, (_, i) => i + 1);
  const match = raw.match(/^(\d+)-(\d+)$/);
  if (!match) {
    // Try single page
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 1 && n <= total) return [n];
    console.error(`无效的页范围: ${raw}（可用格式: 1-2, 5, all）`);
    process.exit(1);
  }
  const start = parseInt(match[1]);
  const end = parseInt(match[2]);
  if (start > end || start < 1 || end > total) {
    console.error(`无效的页范围: ${raw}（共 ${total} 页）`);
    process.exit(1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function getImageBase64(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

// ============================================================
// 核心逻辑
// ============================================================
async function processPage(
  client: OpenAI,
  config: Config,
  pageNum: number,
  pagesDir: string
): Promise<{ pageNum: number; text: string; usage: any }> {
  const imgPath = path.join(pagesDir, `page-${String(pageNum).padStart(2, '0')}.jpg`);

  if (!fs.existsSync(imgPath)) {
    console.error(`  ⚠️ 图片不存在: ${imgPath}，跳过`);
    return { pageNum, text: '', usage: null };
  }

  const base64 = getImageBase64(imgPath);
  console.log(`  📷 ${path.basename(imgPath)} (${(base64.length / 1024).toFixed(0)}KB base64)`);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: SYSTEM_PROMPT + `\n\n请转写这张试卷图片（第 ${pageNum} 页）。每道题按要求的 YAML 格式逐题输出。`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 8192,
  });

  const text = response.choices[0]?.message?.content || '';
  const usage = response.usage;

  if (usage) {
    console.log(`  ✅ tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out (total ${usage.total_tokens})`);
  }

  return { pageNum, text, usage };
}

async function main() {
  const { task, year, pages, model: modelOverride } = parseArgs();

  // --- 读取配置 ---
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.error('❌ 未设置 VOLCENGINE_API_KEY 环境变量');
    console.error('   请在 .env 中添加: VOLCENGINE_API_KEY="your-key"');
    process.exit(1);
  }

  const resolvedModel = modelOverride || resolveModel(task);
  const pricing = PRICING[resolvedModel] || { input: 3, output: 9 };  // fallback pricing

  const config: Config = {
    apiKey,
    baseURL: process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    model: resolvedModel,
    task,
    year,
    pageRange: 'all',
  };

  // 脱敏打印配置
  const keyPreview = apiKey.length > 12
    ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
    : '***';
  const taskLabel = task === 'vision' ? '📷 拍照识题' : '🎙️ 录音转笔记';
  const modelLabel = modelOverride ? `${resolvedModel}（手动指定）` : `${resolvedModel}（自动路由）`;

  console.log('========================================');
  console.log(`VLM 识图转写 — ${taskLabel}`);
  console.log('========================================');
  console.log(`  任务: ${task}`);
  console.log(`  模型: ${modelLabel}`);
  console.log(`  年份: ${config.year}`);
  console.log(`  Base URL: ${config.baseURL}`);
  console.log(`  API Key: ${keyPreview}`);
  console.log(`  定价: ¥${pricing.input}/¥${pricing.output} 每百万 tokens`);
  console.log('========================================');

  // --- 初始化 OpenAI client ---
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
      'User-Agent': 'nana-vlm-transcribe/1.0',
    },
  });

  // --- 扫描页面 ---
  const pagesDir = path.resolve(`doc/research/extracted/${year}/pages`);
  if (!fs.existsSync(pagesDir)) {
    console.error(`❌ 页面目录不存在: ${pagesDir}`);
    console.error('   请先运行 DOCX → PDF → JPG 转换');
    process.exit(1);
  }

  const allFiles = fs.readdirSync(pagesDir).filter(f => f.match(/^page-\d+\.jpg$/));
  const totalPages = allFiles.length;
  if (totalPages === 0) {
    console.error(`❌ 目录下无 page-*.jpg 文件: ${pagesDir}`);
    process.exit(1);
  }

  const pagesToProcess = parsePageRange(pages, totalPages);
  console.log(`  总页数: ${totalPages}，待处理: ${pagesToProcess.length} 页 (${pagesToProcess.join(', ')})`);
  console.log('========================================\n');

  // --- 逐页处理 ---
  const results: Array<{ pageNum: number; text: string; usage: any }> = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const startTime = Date.now();

  for (const pageNum of pagesToProcess) {
    console.log(`📄 第 ${pageNum}/${totalPages} 页`);
    try {
      const result = await processPage(client, config, pageNum, pagesDir);
      results.push(result);
      if (result.usage) {
        totalPromptTokens += result.usage.prompt_tokens || 0;
        totalCompletionTokens += result.usage.completion_tokens || 0;
      }
    } catch (err: any) {
      console.error(`  ❌ 失败: ${err.message}`);
      if (err.status) console.error(`     HTTP ${err.status}: ${err.body || ''}`);
      // 不中断，继续下一页
    }
    console.log();
  }

  // --- 汇总输出 ---
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('========================================');
  console.log('汇总');
  console.log('========================================');
  console.log(`  处理页数: ${results.length}/${pagesToProcess.length}`);
  console.log(`  总耗时: ${elapsed}s`);
  console.log(`  Prompt tokens: ${totalPromptTokens}`);
  console.log(`  Completion tokens: ${totalCompletionTokens}`);
  console.log(`  Total tokens: ${totalPromptTokens + totalCompletionTokens}`);
  // 费用估算（使用实际定价）
  const estCost = (totalPromptTokens / 1_000_000 * pricing.input + totalCompletionTokens / 1_000_000 * pricing.output).toFixed(4);
  console.log(`  估算费用: ¥${estCost}`);
  console.log('========================================\n');

  // --- 写入输出文件 ---
  const outDir = path.resolve('doc/research/transcripts');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${year}-vlm-draft.md`);

  const outLines: string[] = [];
  outLines.push(`# ${year} 新课标 I 卷 数学 · VLM 识图转写 draft\n`);
  outLines.push(`> 生成方式: 火山方舟豆包 VLM（${config.model}）逐页看图转写`);
  outLines.push(`> 生成时间: ${new Date().toISOString()}`);
  outLines.push(`> 页数: ${results.length} 页`);
  outLines.push(`> 状态: 待参谋长人工复核\n`);
  outLines.push('---\n');

  for (const r of results) {
    outLines.push(`## 第 ${r.pageNum} 页\n`);
    if (r.text) {
      outLines.push(r.text.trim());
    } else {
      outLines.push('（本页无转写内容）');
    }
    outLines.push('\n---\n');
  }

  fs.writeFileSync(outPath, outLines.join('\n'), 'utf-8');
  console.log(`📝 输出: ${outPath}`);
  console.log('✅ 完成。请对照 doc/research/transcripts/2024-verified.md 逐字复核。');
}

main().catch((err) => {
  console.error('❌ 脚本异常:', err.message);
  process.exit(1);
});
