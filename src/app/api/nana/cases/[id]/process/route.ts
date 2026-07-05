/**
 * POST /api/nana/cases/:id/process — 触发 AI 整理
 * GET  /api/nana/cases/:id/process — 查询整理状态（轮询用）
 *
 * POST 流程：
 * 1. 登录校验 + Case.studentId 归属校验
 * 2. 从 Artifact 取题图 + 音频
 * 3. 调 analyzeCase()（Lite 一体化）
 * 4. 成功：upsert CaseAiResult + CaseKnowledgeTag(source=vlm) + CaseTextbookTopicTag(source=vlm)
 *    - 低置信（<0.5）候选不自动挂 tag
 *    - 用户已编辑的 questionSummary/textbookTopicId 不被覆盖
 * 5. 失败：写 CaseAiResult(processingStatus=failed) + 返回失败状态
 *
 * GET 流程：
 * 1. 登录校验 + Case.studentId 归属校验
 * 2. CaseAiResult 不存在 → { status: "pending" }
 * 3. CaseAiResult 存在 → 返回 processingStatus + AI 结果字段
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import {
  analyzeCase,
  deriveAudioStatus,
  CaseAnalyzerError,
  CaseAnalyzerTimeoutError,
  type CaseAnalyzerResult,
} from "@/lib/nana/case-analyzer";

const logger = createLogger("api:nana:cases:process");

/** 高置信阈值：>= 0.5 自动挂 tag */
const HIGH_CONFIDENCE_THRESHOLD = 0.5;

// ─── 辅助：从 Artifact 提取题图和音频 ─────────────────

interface ArtifactLike {
  type: string;
  content: string;
  seq: number;
}

function extractImageAndAudio(artifacts: ArtifactLike[]): {
  imageDataUrl: string | null;
  audioBase64: string | null;
  audioFormat: string | null;
} {
  let imageDataUrl: string | null = null;
  let audioBase64: string | null = null;
  let audioFormat: string | null = null;

  for (const a of artifacts) {
    if (a.type === "question_image" && !imageDataUrl) {
      imageDataUrl = a.content;
    }
    if (a.type === "audio_note" && !audioBase64) {
      const match = a.content.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (match) {
        audioFormat = match[1];
        audioBase64 = match[2];
      } else {
        audioBase64 = a.content;
      }
    }
    if (a.type === "audio_meta" && audioBase64 && !audioFormat) {
      try {
        const meta = JSON.parse(a.content);
        if (meta?.mime) audioFormat = meta.mime;
      } catch {
        // ignore
      }
    }
  }

  return { imageDataUrl, audioBase64, audioFormat };
}

// ─── 辅助：加载知识点节点和课本章节列表 ───────────────

async function loadNodesAndTopics() {
  const [nodes, textbookTopics, mappings] = await Promise.all([
    prisma.knowledgeNode.findMany({ select: { id: true, name: true } }),
    prisma.textbookTopic.findMany({
      select: { id: true, name: true, chapter: true, section: true },
      orderBy: { order: "asc" },
    }),
    prisma.textbookNodeMapping.findMany({ select: { textbookTopicId: true, nodeId: true } }),
  ]);

  const mappedNodeIds = new Set(mappings.map((m) => m.nodeId));
  const mappedTopicIds = new Set(mappings.map((m) => m.textbookTopicId));
  const filteredNodes = nodes.filter((n) => mappedNodeIds.has(n.id));
  const filteredTopics = textbookTopics.filter((t) => mappedTopicIds.has(t.id));

  return { nodes: filteredNodes, textbookTopics: filteredTopics };
}

// ─── 辅助：持久化 AI 结果 ─────────────────────────────

interface ExistingAiResult {
  questionSummaryEdited: boolean;
  textbookTopicEdited: boolean;
}

async function persistAiResult(
  caseId: string,
  result: CaseAnalyzerResult,
  existing: ExistingAiResult | null,
) {
  const topTopic = result.textbookTopicCandidates
    .filter((c) => c.confidence >= HIGH_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)[0];

  // 1. upsert CaseAiResult
  const aiResult = await prisma.caseAiResult.upsert({
    where: { caseId },
    create: {
      caseId,
      questionSummary: result.questionSummary,
      transcript: result.transcript || null,
      textbookTopicId: topTopic?.topicId,
      textbookTopicConfidence: topTopic?.confidence ?? 0,
      initialFeedback: result.initialFeedback,
      possibleMistakeReason: result.possibleMistakeReason,
      nextActionSuggestion: result.nextActionSuggestion,
      audioStatus: result.audioStatus,
      processingStatus: "success",
      tokenUsage: result.usage ? JSON.stringify(result.usage) : null,
    },
    update: {
      questionSummary: existing?.questionSummaryEdited
        ? undefined
        : result.questionSummary,
      transcript: result.transcript || null,
      textbookTopicId: existing?.textbookTopicEdited
        ? undefined
        : topTopic?.topicId,
      textbookTopicConfidence: existing?.textbookTopicEdited
        ? undefined
        : (topTopic?.confidence ?? 0),
      initialFeedback: result.initialFeedback,
      possibleMistakeReason: result.possibleMistakeReason,
      nextActionSuggestion: result.nextActionSuggestion,
      audioStatus: result.audioStatus,
      processingStatus: "success",
      tokenUsage: result.usage ? JSON.stringify(result.usage) : null,
    },
  });

  // 2. transcript 回写 Artifact
  if (result.transcript) {
    const existingTranscript = await prisma.artifact.findFirst({
      where: { caseId, type: "transcript" },
      select: { id: true },
    });
    if (existingTranscript) {
      await prisma.artifact.update({
        where: { id: existingTranscript.id },
        data: { content: result.transcript },
      });
    } else {
      await prisma.artifact.create({
        data: { caseId, type: "transcript", content: result.transcript, seq: 0 },
      });
    }
  }

  // 3. 高置信 knowledgeNodeCandidates -> upsert CaseKnowledgeTag(source="vlm")
  for (const c of result.knowledgeNodeCandidates) {
    if (c.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      await prisma.caseKnowledgeTag.upsert({
        where: { caseId_nodeId_source: { caseId, nodeId: c.nodeId, source: "vlm" } },
        create: {
          caseId,
          nodeId: c.nodeId,
          source: "vlm",
          confidence: c.confidence,
          note: c.reason,
        },
        update: { confidence: c.confidence, note: c.reason },
      });
    }
  }

  // 4. 高置信 textbookTopicCandidates -> upsert CaseTextbookTopicTag(source="vlm")
  for (const c of result.textbookTopicCandidates) {
    if (c.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      await prisma.caseTextbookTopicTag.upsert({
        where: {
          caseId_textbookTopicId_source: { caseId, textbookTopicId: c.topicId, source: "vlm" },
        },
        create: {
          caseId,
          textbookTopicId: c.topicId,
          source: "vlm",
          confidence: c.confidence,
          note: c.reason,
        },
        update: { confidence: c.confidence, note: c.reason },
      });
    }
  }

  return aiResult;
}

// ─── 辅助：持久化失败结果 ─────────────────────────────

async function persistFailedResult(
  caseId: string,
  audioStatus: string,
  errorMessage: string,
) {
  await prisma.caseAiResult.upsert({
    where: { caseId },
    create: {
      caseId,
      processingStatus: "failed",
      audioStatus,
      error: errorMessage,
    },
    update: {
      processingStatus: "failed",
      audioStatus,
      error: errorMessage,
    },
  });
}

// ─── POST handler ─────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;

    const caseRecord = await prisma.case.findFirst({
      where: { id, studentId: session.user.id },
      include: {
        artifacts: { orderBy: { seq: "asc" } },
        aiResult: {
          select: {
            questionSummaryEdited: true,
            textbookTopicEdited: true,
          },
        },
      },
    });

    if (!caseRecord) return notFound("case 不存在");

    const { imageDataUrl, audioBase64, audioFormat } = extractImageAndAudio(
      caseRecord.artifacts,
    );

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "case 缺少题图 artifact" },
        { status: 400 },
      );
    }

    const { nodes, textbookTopics } = await loadNodesAndTopics();

    if (nodes.length === 0 || textbookTopics.length === 0) {
      return NextResponse.json(
        { error: "知识点或课本章节数据为空，请检查种子数据" },
        { status: 500 },
      );
    }

    const audioProvided = !!(audioBase64 && audioFormat);

    let result: CaseAnalyzerResult;
    try {
      result = await analyzeCase({
        imageDataUrl,
        audioBase64: audioBase64 || undefined,
        audioFormat: audioFormat || undefined,
        nodes,
        textbookTopics,
      });
    } catch (err) {
      const audioStatus = deriveAudioStatus(audioProvided, audioProvided, err);
      const errorMsg =
        err instanceof CaseAnalyzerTimeoutError
          ? "AI 整理超时"
          : err instanceof CaseAnalyzerError
            ? err.message
            : "AI 整理失败";

      await persistFailedResult(id, audioStatus, errorMsg);

      const status =
        err instanceof CaseAnalyzerTimeoutError ? "timeout" : "failed";

      logger.error({ caseId: id, error: errorMsg }, "Case AI 整理失败");

      return NextResponse.json({
        status,
        audioStatus,
        error: errorMsg,
      });
    }

    await persistAiResult(id, result, caseRecord.aiResult);

    const topTopic = result.textbookTopicCandidates
      .filter((c) => c.confidence >= HIGH_CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence)[0];

    let textbookTopicInfo: { id: string; name: string; confidence: number } | undefined;
    if (topTopic) {
      const topic = await prisma.textbookTopic.findUnique({
        where: { id: topTopic.topicId },
        select: { id: true, name: true },
      });
      if (topic) {
        textbookTopicInfo = {
          id: topic.id,
          name: topic.name,
          confidence: topTopic.confidence,
        };
      }
    }

    const tags = await prisma.caseKnowledgeTag.findMany({
      where: { caseId: id },
      select: { id: true, nodeId: true, source: true, confidence: true, note: true },
    });

    logger.info({ caseId: id }, "Case AI 整理成功");

    return NextResponse.json({
      status: "success",
      audioStatus: result.audioStatus,
      questionSummary: result.questionSummary,
      textbookTopic: textbookTopicInfo,
      feedback: result.initialFeedback,
      possibleMistakeReason: result.possibleMistakeReason,
      nextActionSuggestion: result.nextActionSuggestion,
      transcript: result.transcript || undefined,
      tags,
      textbookTopicCandidates: result.textbookTopicCandidates,
      knowledgeNodeCandidates: result.knowledgeNodeCandidates,
    });
  } catch (error) {
    logger.error({ error }, "POST /process 异常");
    return internalError();
  }
}

// ─── GET handler（状态查询）────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;

    const caseRecord = await prisma.case.findFirst({
      where: { id, studentId: session.user.id },
      select: { id: true },
    });

    if (!caseRecord) return notFound("case 不存在");

    const aiResult = await prisma.caseAiResult.findUnique({
      where: { caseId: id },
      select: {
        processingStatus: true,
        audioStatus: true,
        questionSummary: true,
        transcript: true,
        textbookTopicId: true,
        textbookTopicConfidence: true,
        initialFeedback: true,
        possibleMistakeReason: true,
        nextActionSuggestion: true,
        error: true,
        textbookTopic: { select: { id: true, name: true } },
      },
    });

    if (!aiResult) {
      return NextResponse.json({
        status: "pending",
        audioStatus: "skipped",
      });
    }

    return NextResponse.json({
      status: aiResult.processingStatus,
      audioStatus: aiResult.audioStatus,
      questionSummary: aiResult.questionSummary,
      textbookTopic: aiResult.textbookTopic
        ? {
            id: aiResult.textbookTopic.id,
            name: aiResult.textbookTopic.name,
            confidence: aiResult.textbookTopicConfidence,
          }
        : undefined,
      feedback: aiResult.initialFeedback,
      possibleMistakeReason: aiResult.possibleMistakeReason,
      nextActionSuggestion: aiResult.nextActionSuggestion,
      transcript: aiResult.transcript || undefined,
      error: aiResult.error || undefined,
    });
  } catch (error) {
    logger.error({ error }, "GET /process 异常");
    return internalError();
  }
}
