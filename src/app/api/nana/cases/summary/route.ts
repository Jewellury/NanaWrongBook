/**
 * GET /api/nana/cases/summary — 题目汇总（按 TextbookTopic 分组）
 *
 * 按 TextbookTopic 分组返回当前用户的错题卡片轻量字段。
 * - 归属过滤：只返回 session.user.id 自己的 case
 * - 不返回 artifact.content（base64 原图）
 * - CaseAiResult 不存在时 processStatus=pending
 * - 无 textbookTopicTag 的 case 归入 topic=null 组（未分类/暂未覆盖）
 *
 * 响应结构见 doc/plan/stage3-revised-round3-plan.md §2.3
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:nana:cases:summary');

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    // 查当前用户所有 Case，关联 aiResult + textbookTopicTags + artifacts(仅 type)
    const cases = await prisma.case.findMany({
      where: { studentId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        artifacts: { select: { type: true } },
        aiResult: {
          select: {
            questionSummary: true,
            processingStatus: true,
          },
        },
        textbookTopicTags: {
          select: {
            textbookTopicId: true,
            confidence: true,
            textbookTopic: {
              select: { id: true, name: true, chapter: true, section: true },
            },
          },
          orderBy: { confidence: 'desc' },
          take: 1, // 取最高置信的一个
        },
      },
    });

    // 构建 case 轻量项
    type ProcessStatus = "pending" | "success" | "failed";

    interface CaseItem {
      id: string;
      createdAt: string;
      hasImage: boolean;
      processStatus: ProcessStatus;
      aiSummary: string | null;
      textbookChapter: string | null;
    }

    interface TopicInfo {
      id: string;
      name: string;
      chapter: string;
      section: string;
    }

    // 按 topic 分组
    const groupMap = new Map<string, { topic: TopicInfo | null; cases: CaseItem[] }>();

    for (const c of cases) {
      const hasImage = c.artifacts.some((a) => a.type === 'question_image');

      // processStatus 映射
      let processStatus: ProcessStatus = "pending";
      if (c.aiResult) {
        const ps = c.aiResult.processingStatus;
        if (ps === "success") processStatus = "success";
        else if (ps === "failed" || ps === "timeout") processStatus = "failed";
        else processStatus = "pending";
      }

      // 取最高置信 textbookTopic
      const topTag = c.textbookTopicTags[0];
      const topic = topTag?.textbookTopic ?? null;
      const textbookChapter = topic?.chapter ?? null;

      const caseItem: CaseItem = {
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        hasImage,
        processStatus,
        aiSummary: c.aiResult?.questionSummary ?? null,
        textbookChapter,
      };

      // 分组 key：有 topic 用 topic.id，无 topic 用 "__null__"
      const groupKey = topic?.id ?? "__null__";

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          topic: topic ? { id: topic.id, name: topic.name, chapter: topic.chapter, section: topic.section } : null,
          cases: [],
        });
      }
      groupMap.get(groupKey)!.cases.push(caseItem);
    }

    // 转为数组，未分类组放最后
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.topic === null) return 1;  // 未分类放最后
      if (b.topic === null) return -1;
      return 0;
    });

    return NextResponse.json({ groups, total: cases.length });
  } catch (error) {
    logger.error({ error }, '题目汇总查询失败');
    return internalError();
  }
}
