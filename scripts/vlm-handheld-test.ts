#!/usr/bin/env tsx
/**
 * VLM 手持拍照先验测试脚本
 *
 * 对 20 张手持拍照照片调用火山方舟 Pro VLM 进行识别测试。
 *
 * 用法:
 *   npx tsx scripts/vlm-handheld-test.ts
 *   npx tsx scripts/vlm-handheld-test.ts --help
 *
 * 环境变量（必须设置，可通过 .env 文件或 shell 环境变量）:
 *   VOLCENGINE_API_KEY  方舟 API Key
 *   VOLCENGINE_BASE_URL 方舟 API Base URL（推荐：https://ark.cn-beijing.volces.com/api/v3）
 *   PRO_ENDPOINT_ID     方舟 Pro 视觉模型 Endpoint ID
 *
 * 输入: doc/research/vision-samples/handheld/*.jpg
 * 输出: doc/research/vision-samples/handheld-report.md
 *
 * 安全: API Key 从 process.env 读取，绝不硬编码
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import sharp from 'sharp';

// ============================================================
// 配置常量
// ============================================================
const HANDHELD_DIR = 'doc/research/vision-samples/handheld';
const OUTPUT_REPORT = 'doc/research/vision-samples/handheld-report.md';
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
const IMAGE_MIN_SIZE_BYTES = 100;
const MAX_TOKENS = 8192;

// 方舟 Pro 定价（¥/百万 tokens）—— 与 vlm-transcribe.ts 保持一致
const PRICING = {
  input: 3.2,
  output: 16,
};

const PROMPT = `你是一个拍照识题助手。用户发来一张手持拍摄的数学/理科题目照片，
请仔细观察图片内容，输出结构化识别结果。

要求：
1. 认真看图片里的所有文字、数字、公式、图形
2. 如果图片模糊或不完整，就如实写"无法识别"
3. 不要猜，看不清就不要写
4. 只做识别提取，不做解题
5. 【目标题锁定】一张照片里若出现多道题，以"含手写作答/批改痕迹"的那道为目标题，完整提取它即可；边缘只有印刷题干、没有手写的残缺邻题，请忽略——不要单独提取、不要报"内容不完整"。

请严格按照以下 XML 格式输出（不要加 markdown 代码块包裹）：

<result>
  <question_text>题目的完整文字内容，公式用 LaTeX 写在 $$ 中</question_text>
  <answer_text>题目的答案或正确选项</answer_text>
  <analysis>解题思路简要分析</analysis>
  <subject>学科（数学/物理/化学/英语/语文/生物/地理/历史/政治/未知）</subject>
  <knowledge_points>涉及的知识点，用逗号分隔</knowledge_points>
</result>`;

// ============================================================
// 类型定义
// ============================================================
interface ExtractedFields {
  questionText: string;
  answerText: string;
  analysis: string;
  subject: string;
  knowledgePoints: string;
}

interface ImageResult {
  index: number;
  fileName: string;
  fileSizeKB: number;
  success: boolean;
  rawResponse: string;
  extracted: ExtractedFields | null;
  error?: string;
  promptTokens: number;
  completionTokens: number;
}

// OpenAI usage typing
interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ApiResponse {
  text: string;
  usage: UsageInfo | null;
}

// ============================================================
// 辅助函数
// ============================================================

/** 打印帮助信息 */
function printHelp(): void {
  console.log(`
用法: npx tsx scripts/vlm-handheld-test.ts [--help]

对手持拍照照片调用火山方舟 Pro VLM 进行识别测试。

环境变量（必须设置）:
  VOLCENGINE_API_KEY  方舟 API Key
  VOLCENGINE_BASE_URL 方舟 API Base URL（推荐：https://ark.cn-beijing.volces.com/api/v3）
  PRO_ENDPOINT_ID     方舟 Pro 视觉模型 Endpoint ID

输入: doc/research/vision-samples/handheld/*.jpg
输出: doc/research/vision-samples/handheld-report.md

示例:
  npx tsx scripts/vlm-handheld-test.ts
  npx tsx scripts/vlm-handheld-test.ts --help
`);
}

/** 扫描并排序图片 */
function scanImages(): string[] {
  const dir = path.resolve(HANDHELD_DIR);
  if (!fs.existsSync(dir)) {
    console.error(`❌ 目录不存在: ${dir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.jpg'))
    .sort();
  if (files.length === 0) {
    console.error(`❌ 目录下无 .jpg 文件: ${dir}`);
    process.exit(1);
  }
  return files;
}

/** 读取图片，自动旋转横图为竖图，然后转为 base64 */
async function imageToBase64(filePath: string): Promise<string> {
  const img = sharp(filePath);
  const metadata = await img.metadata();
  // 如果宽 > 高（横图），旋转 90° 为竖图
  if (metadata.width && metadata.height && metadata.width > metadata.height) {
    const rotated = await img.rotate(90).jpeg({ quality: 90 }).toBuffer();
    return rotated.toString('base64');
  }
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

/** 判断错误是否可重试 */
function isRetryable(err: unknown): boolean {
  const errorObj = err as Record<string, unknown>;
  const msg = String(errorObj.message || '').toLowerCase();
  const status = typeof errorObj.status === 'number' ? errorObj.status : 0;
  return (
    status === 429 ||
    (status >= 500 && status < 600) ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit') ||
    msg.includes('internal server error')
  );
}

/** 带退避重试的 API 调用（每张图超时 120s） */
async function callWithRetry(
  client: OpenAI,
  model: string,
  base64: string,
): Promise<ApiResponse> {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
            ],
          },
        ],
        max_tokens: MAX_TOKENS,
      }, { signal: controller.signal });
      clearTimeout(timeoutId);

      const text = response.choices[0]?.message?.content || '';
      const usage = response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens || 0,
            completion_tokens: response.usage.completion_tokens || 0,
            total_tokens: response.usage.total_tokens || 0,
          }
        : null;
      return { text, usage };
    } catch (err: unknown) {
      if (attempt <= MAX_RETRIES && isRetryable(err)) {
        const delay = RETRY_BASE_DELAY_MS * attempt;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠️ 第 ${attempt} 次失败 (${errMsg})，${delay}ms 后重试...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('重试耗尽（不应到达此处）');
}

/** 从响应文本中提取 XML 标签 */
function extractXMLTags(raw: string): ExtractedFields | null {
  // 先去掉可能的 ```xml ... ``` 或 ``` ... ``` 包裹
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:xml)?\s*\n?([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 提取 <result>...</result>
  const resultMatch = cleaned.match(/<result>([\s\S]*?)<\/result>/);
  if (!resultMatch) return null;
  const inner = resultMatch[1];

  function extractTag(tag: string): string {
    const m = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : '';
  }

  const questionText = extractTag('question_text');
  const answerText = extractTag('answer_text');
  const analysis = extractTag('analysis');
  const subject = extractTag('subject');
  const knowledgePoints = extractTag('knowledge_points');

  // 至少有一个核心字段非空才算有效
  if (!questionText && !answerText && !analysis) return null;

  return { questionText, answerText, analysis, subject, knowledgePoints };
}

/** 估算费用（元） */
function estimateCost(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * PRICING.input +
    (completionTokens / 1_000_000) * PRICING.output
  );
}

/** 生成 Markdown 报告 */
function generateReport(results: ImageResult[]): string {
  const total = results.length;
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalPromptTokens = results.reduce((s, r) => s + r.promptTokens, 0);
  const totalCompletionTokens = results.reduce((s, r) => s + r.completionTokens, 0);
  const totalTokens = totalPromptTokens + totalCompletionTokens;

  const lines: string[] = [];
  lines.push('# VLM 手持拍照先验测试 · 验收报告');
  lines.push('');
  lines.push(`> 生成时间: ${new Date().toISOString()}`);
  lines.push(`> 测试脚本: scripts/vlm-handheld-test.ts`);
  lines.push(`> 样本数量: ${total} 张`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // =====================================
  // Part A：AI 输出逐条记录
  // =====================================
  lines.push('## Part A：AI 输出逐条记录');
  lines.push('');

  for (const r of results) {
    const label = `图片 ${String(r.index).padStart(2, '0')}`;
    lines.push(`### ${label}：${r.fileName}`);
    lines.push('');

    if (r.success) {
      lines.push('**AI 原始响应：**');
      lines.push('');
      lines.push('```xml');
      lines.push(r.rawResponse || '（空响应）');
      lines.push('```');
      lines.push('');
      lines.push(`**Tokens：** prompt=${r.promptTokens} / completion=${r.completionTokens} / total=${r.promptTokens + r.completionTokens}`);
      lines.push('');
    } else {
      lines.push(`**❌ 处理失败：** ${r.error || '未知错误'}`);
      lines.push('');
    }

    // 孩子打分区域（待填写）
    lines.push('**孩子打分区域（待填写）：**');
    lines.push('- [ ] 题面提取正确（/5）');
    lines.push('- [ ] 答案提取正确（/5）');
    lines.push('- [ ] 分析质量达标（/5）');
    lines.push('- [ ] 学科分类正确（/3）');
    lines.push('- [ ] 知识点匹配（/3）');
    lines.push('- **备注：**');
    lines.push('');
  }

  // =====================================
  // Part B：孩子评分表（留空等孩子填）
  // =====================================
  lines.push('---');
  lines.push('');
  lines.push('## Part B：孩子评分表（请孩子逐张填写）');
  lines.push('');
  lines.push('| 图片 | 题面(5) | 答案(5) | 分析(5) | 学科(3) | 知识点(3) | 总分(21) | 备注 |');
  lines.push('|------|:-------:|:-------:|:-------:|:-------:|:---------:|:--------:|------|');
  for (const r of results) {
    lines.push(`| ${String(r.index).padStart(2, '0')} | | | | | | | |`);
  }
  lines.push('| **汇总** | **avg** | **avg** | **avg** | **avg** | **avg** | **x/21** | — |');
  lines.push('');

  // =====================================
  // Part C：总体统计（自动计算）
  // =====================================
  lines.push('---');
  lines.push('');
  lines.push('## Part C：总体统计（自动计算）');
  lines.push('');
  lines.push(`- 总图片数：${total}`);
  lines.push(`- 有效响应数：${succeeded.length}`);
  lines.push(`- 失败数：${failed.length}`);
  if (succeeded.length > 0) {
    const avgTokens = Math.round(totalTokens / total);
    lines.push(`- 平均 tokens/图：${avgTokens}`);
  } else {
    lines.push('- 平均 tokens/图：—');
  }
  lines.push(`- 总 prompt tokens：${totalPromptTokens}`);
  lines.push(`- 总 completion tokens：${totalCompletionTokens}`);
  lines.push(`- 总 tokens 消耗：${totalTokens}`);
  lines.push(`- 估算费用：¥${estimateCost(totalPromptTokens, totalCompletionTokens).toFixed(4)}`);
  lines.push(`- **题面+答案平均准确率：**（待孩子打分后填写）`);

  if (failed.length > 0) {
    lines.push('');
    lines.push('**失败详情：**');
    for (const f of failed) {
      lines.push(`- ${f.fileName}：${f.error}`);
    }
  }

  lines.push('');
  lines.push('**综合判定：** 🟡 待孩子打分后计算');
  lines.push('');
  lines.push('> 判定阈值：');
  lines.push('> - ✅ 通过：题面+答案综合准确率 ≥ 80%');
  lines.push('> - 🟡 暂停：题面+答案综合准确率 60–80%');
  lines.push('> - 🔴 不通过：题面+答案综合准确率 < 60%');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// 主函数
// ============================================================
async function main(): Promise<void> {
  // --- 检测 --help ---
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  console.log('========================================');
  console.log('VLM 手持拍照先验测试');
  console.log('========================================');

  // 1. 检查环境变量
  const apiKey = process.env.VOLCENGINE_API_KEY;
  const baseURL = process.env.VOLCENGINE_BASE_URL;
  const model = process.env.PRO_ENDPOINT_ID;

  const missingVars: string[] = [];
  if (!apiKey) missingVars.push('VOLCENGINE_API_KEY');
  if (!baseURL) missingVars.push('VOLCENGINE_BASE_URL');
  if (!model) missingVars.push('PRO_ENDPOINT_ID');

  if (missingVars.length > 0) {
    console.error(`❌ 缺少以下环境变量：${missingVars.join(', ')}`);
    console.error('');
    console.error('   请在 .env 文件中设置，或通过 Shell 环境变量传递：');
    if (!apiKey) console.error('     VOLCENGINE_API_KEY="your-api-key"');
    if (!baseURL) console.error('     VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"');
    if (!model) console.error('     PRO_ENDPOINT_ID="your-endpoint-id"');
    console.error('');
    console.error('   或使用 --help 查看完整帮助');
    process.exit(1);
  }

  // 脱敏打印配置
  const keyPreview = apiKey.length > 12
    ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
    : '***';

  console.log(`  API Key: ${keyPreview}`);
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  Model: ${model}`);
  console.log(`  Pricing: ¥${PRICING.input}/${PRICING.output} per million tokens`);
  console.log('========================================\n');

  // 2. 初始化 OpenAI client
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 120000, // 每张图 API 调用超时 2 分钟，防止单张卡死
    defaultHeaders: {
      'User-Agent': 'nana-vlm-handheld-test/1.0',
    },
  });

  // 3. 扫描图片目录
  const files = scanImages();
  console.log(`📁 找到 ${files.length} 张图片，开始处理...\n`);

  // 4. 逐张处理（串行）
  const results: ImageResult[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.resolve(HANDHELD_DIR, file);
    const index = i + 1;
    const label = `  ${String(index).padStart(2, '0')}/${String(files.length).padStart(2, '0')}`;

    // 图片合法性校验：文件是否存在、大小是否足够
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      console.log(`  ${label} ${file} | ❌ 文件无法访问，跳过`);
      results.push({
        index,
        fileName: file,
        fileSizeKB: 0,
        success: false,
        rawResponse: '',
        extracted: null,
        error: '文件无法访问',
        promptTokens: 0,
        completionTokens: 0,
      });
      continue;
    }

    if (stat.size < IMAGE_MIN_SIZE_BYTES) {
      console.log(`  ${label} ${file} | ⏭️ 跳过（文件过小: ${stat.size} bytes）`);
      results.push({
        index,
        fileName: file,
        fileSizeKB: Math.round(stat.size / 1024),
        success: false,
        rawResponse: '',
        extracted: null,
        error: `文件过小 (${stat.size} bytes)`,
        promptTokens: 0,
        completionTokens: 0,
      });
      continue;
    }

    const fileSizeKB = Math.round(stat.size / 1024);
    process.stdout.write(`  ${label} 📷 ${file} (${fileSizeKB}KB) ... `);

    try {
      // a. 读取文件 → base64（横图自动旋转）
      const base64 = await imageToBase64(filePath);

      // b. 调用方舟 Pro（带退避重试）
      const { text, usage } = await callWithRetry(client, model, base64);

      // c. 从响应中提取 XML 标签（先 strip ```xml fence 再正则提取）
      const extracted = extractXMLTags(text);
      const promptTokens = usage?.prompt_tokens || 0;
      const completionTokens = usage?.completion_tokens || 0;

      // d. 记录结果
      results.push({
        index,
        fileName: file,
        fileSizeKB,
        success: true,
        rawResponse: text,
        extracted,
        promptTokens,
        completionTokens,
      });

      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;

      if (extracted) {
        console.log(`✅ tokens: ${promptTokens} in / ${completionTokens} out`);
      } else {
        console.log(`✅ tokens: ${promptTokens} in / ${completionTokens} out`);
        console.log(`    ⚠️ XML 解析失败，原始响应已记录`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${errMsg}`);
      results.push({
        index,
        fileName: file,
        fileSizeKB,
        success: false,
        rawResponse: '',
        extracted: null,
        error: errMsg,
        promptTokens: 0,
        completionTokens: 0,
      });
      // continue 到下一张（每张独立 try-catch）
    }
  }

  // 5. 汇总
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n========================================');
  console.log('📊 汇总');
  console.log('========================================');
  console.log(`  总图片数: ${results.length}`);
  console.log(`  有效响应数: ${succeeded.length}`);
  console.log(`  失败数: ${failed.length}`);
  console.log(`  总耗时: ${elapsed}s`);
  console.log(`  总 prompt tokens: ${totalPromptTokens}`);
  console.log(`  总 completion tokens: ${totalCompletionTokens}`);
  console.log(`  总 tokens: ${totalPromptTokens + totalCompletionTokens}`);
  console.log(`  估算费用: ¥${estimateCost(totalPromptTokens, totalCompletionTokens).toFixed(4)}`);
  console.log('========================================\n');

  // 6. 生成报告并写入文件
  const report = generateReport(results);
  const reportPath = path.resolve(OUTPUT_REPORT);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`📝 报告已生成: ${reportPath}`);
  console.log('✅ 测试完成。请让孩子对照原图逐张打分后填写 Part B。\n');
}

main().catch((err: unknown) => {
  const errMsg = err instanceof Error ? err.message : String(err);
  console.error('\n❌ 脚本异常:', errMsg);
  process.exit(1);
});
