/**
 * @deprecated Stage 3 v2 遗留代码（Code Remnant, TD-5）。
 * v3-revised 改用一体化 case-analyzer.ts，本文件不再使用。
 * 不允许新代码 import。v3 case-analyzer + /process 稳定后删除并移除对应测试。
 * 保留期间可参考其 VLM 调用、JSON 解析、节点过滤实现。
 *
 * VLM 题图轻分类薄封装（Stage 3 v2 Round 1）
 *
 * 调火山方舟豆包 Seed 2.0 Pro 做单题轻分类。
 * 使用 OpenAI 兼容接口（image_url 类型）。
 *
 * 设计决策（方案 v2 修订）：
 * - VLM **只看题图**，不接收 transcript（DP-VLM-3）
 * - 提示词注入 48 节点列表，VLM 只能从列表里选（防脏挂）
 * - 超时 30s（AbortController）
 * - 失败 throw VlmError（由调用方 catch，不静默）
 * - 只做轻分类（DP6），不做深度归因、不解题
 */

import OpenAI from "openai";
import { createLogger } from "@/lib/logger";

const logger = createLogger("lib:nana:vlm-classify");

// ─── 类型定义 ──────────────────────────────────────────

export interface VlmClassifyInput {
  /** 含 data:image/...;base64, 前缀的完整 Data URL */
  imageBase64: string;
  /** 48 个知识点列表（id + name） */
  nodes: { id: string; name: string }[];
}

export interface VlmCandidate {
  nodeId: string;
  confidence: number;
  reason: string;
}

export interface VlmClassifyResult {
  candidates: VlmCandidate[];
  /** 模型原始输出（调试用） */
  rawHint?: string;
}

// ─── 错误类型 ──────────────────────────────────────────

export class VlmError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "VlmError";
  }
}

export class VlmTimeoutError extends VlmError {
  constructor() {
    super("VLM 分类超时（30s）");
    this.name = "VlmTimeoutError";
  }
}

export class VlmEmptyResultError extends VlmError {
  constructor(message = "VLM 返回空结果") {
    super(message);
    this.name = "VlmEmptyResultError";
  }
}

// ─── 提示词（DP6 边界：只做轻分类）────────────────────

/**
 * 构造分类提示词。
 * 节点列表动态注入，VLM 只能从列表里选 nodeId。
 */
function buildClassifyPrompt(nodes: { id: string; name: string }[]): string {
  const nodeList = nodes.map((n) => `- ${n.id}: ${n.name}`).join("\n");

  return `你是数学知识图谱分类助手。请看这道数学题的图片，判断它大致属于以下哪些知识点。

【知识点列表】
${nodeList}

【你的任务】
1. 看图片中的题目，判断它考查的是哪些数学知识点
2. 从上面的列表中选出 1-3 个最相关的知识点
3. 给每个候选一个 0-1 的置信度（你有多确定这题考这个点）
4. 用一句话说明理由

【纪律】
- 只做"大致属于哪几个知识点"的判断
- 不做深度归因（不判断学生为什么做错）
- 不解题、不给答案
- 如果图片不清晰或不是数学题，返回空列表
- 如果题目跨多个知识点，最多给 3 个候选
- nodeId 必须从上面的列表中选，不能自创

【输出格式（严格 JSON）】
{
  "candidates": [
    { "nodeId": "M2a-03", "confidence": 0.8, "reason": "题目涉及一次函数图像" },
    { "nodeId": "M2a-05", "confidence": 0.6, "reason": "涉及定义域判断" }
  ]
}`;
}

// ─── JSON 解析辅助 ─────────────────────────────────────

/**
 * 从模型输出中提取 JSON。
 * 处理 markdown 代码块包裹（```json ... ```）的情况。
 */
function extractJson(raw: string): string {
  // 去除 markdown 代码块包裹
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return raw.trim();
}

/**
 * 解析 VLM 输出为候选列表。
 * - 解析失败 → throw VlmError
 * - 候选 nodeId 不在节点列表里 → 过滤掉
 */
function parseCandidates(
  raw: string,
  validNodeIds: Set<string>,
): { candidates: VlmCandidate[]; rawHint: string } {
  let parsed: unknown;
  try {
    const jsonStr = extractJson(raw);
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new VlmError(`VLM 输出 JSON 解析失败: ${raw.substring(0, 200)}`);
  }

  if (!parsed || typeof parsed !== "object" || !("candidates" in parsed)) {
    throw new VlmError(`VLM 输出缺少 candidates 字段: ${raw.substring(0, 200)}`);
  }

  const candidatesRaw = (parsed as { candidates: unknown }).candidates;
  if (!Array.isArray(candidatesRaw)) {
    throw new VlmError(`VLM 输出 candidates 不是数组: ${raw.substring(0, 200)}`);
  }

  // 过滤 + 类型检查
  const candidates: VlmCandidate[] = [];
  for (const c of candidatesRaw) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const nodeId = obj.nodeId;
    const confidence = obj.confidence;
    const reason = obj.reason;

    if (typeof nodeId !== "string" || typeof confidence !== "number" || typeof reason !== "string") {
      continue;
    }

    // nodeId 必须在 48 节点列表中（防 VLM 幻觉）
    if (!validNodeIds.has(nodeId)) {
      logger.warn({ nodeId }, "VLM 候选 nodeId 不在节点列表中，过滤掉");
      continue;
    }

    // confidence 裁剪到 0-1
    const clampedConfidence = Math.max(0, Math.min(1, confidence));
    candidates.push({ nodeId, confidence: clampedConfidence, reason });
  }

  return { candidates, rawHint: raw };
}

// ─── 核心函数 ──────────────────────────────────────────

/**
 * 调火山方舟豆包 Pro 做单题轻分类。
 *
 * - 输入：题图 Data URL + 48 节点列表
 * - 输出：1-3 个候选知识点 + 置信度 + 理由
 * - VLM 只看题图，不接收 transcript（DP-VLM-3）
 * - 超时 30s → throw VlmTimeoutError
 * - 失败 throw VlmError（不静默）
 * - 候选 nodeId 不在节点列表 → 过滤掉（防 VLM 幻觉）
 *
 * @param input.imageBase64 - 含 data:image/...;base64, 前缀的完整 Data URL
 * @param input.nodes - 48 个知识点列表（id + name）
 */
export async function vlmClassify(input: VlmClassifyInput): Promise<VlmClassifyResult> {
  const { imageBase64, nodes } = input;

  if (!imageBase64) {
    throw new VlmError("题图 Base64 为空");
  }
  if (!nodes || nodes.length === 0) {
    throw new VlmError("知识点节点列表为空");
  }

  // 构造 OpenAI client
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    throw new VlmError("未设置 VOLCENGINE_API_KEY 环境变量");
  }
  const baseURL = process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const model =
    process.env.PRO_ENDPOINT_ID ||
    process.env.PRO_MODEL_NAME ||
    "doubao-seed-2-0-pro-260215";

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: { "User-Agent": "nana-vlm/1.0" },
  });

  // 超时控制
  const timeoutMs = parseInt(process.env.VLM_TIMEOUT_MS || "30000", 10);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  // 构造提示词
  const prompt = buildClassifyPrompt(nodes);
  const validNodeIds = new Set(nodes.map((n) => n.id));

  try {
    logger.info({ model, nodeCount: nodes.length, imageBase64Length: imageBase64.length }, "VLM 调用开始");

    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
        max_tokens: 1024,
      },
      { signal: controller.signal },
    );

    const rawOutput = response.choices[0]?.message?.content || "";
    logger.info(
      {
        rawOutputLength: rawOutput.length,
        usage: response.usage,
      },
      "VLM 调用成功",
    );

    if (!rawOutput.trim()) {
      throw new VlmEmptyResultError();
    }

    const { candidates, rawHint } = parseCandidates(rawOutput, validNodeIds);

    logger.info({ candidateCount: candidates.length }, "VLM 候选解析完成");

    return { candidates, rawHint };
  } catch (err: unknown) {
    // 超时
    if (err instanceof Error && err.name === "AbortError") {
      throw new VlmTimeoutError();
    }

    // 已经是 VlmError 的直接抛
    if (err instanceof VlmError) throw err;
    throw new VlmError(
      `VLM 调用失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
