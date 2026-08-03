/**
 * /process 响应分层证据打印器（PR-0 commit 0.3）
 *
 * 在 Playwright 中等待 /process POST 响应，然后一次性打印：
 * - HTTP status
 * - body.status
 * - body.error
 * - body.audioStatus
 * - 对应 caseId 的 CaseAiResult.processingStatus
 * - 对应 caseId 的 CaseAiResult.error
 *
 * 使用方式：
 *   const outcomePromise = logProcessOutcome(page, prisma, () => getLatestCaseId(userId));
 *   await page.getByRole('button', { name: '收好这道题' }).click();
 *   await outcomePromise;
 *
 * 注意：必须在触发 /process 的请求之前开始等待，否则可能错过响应。
 */

import type { Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

export interface ProcessOutcome {
    status: number;
    body: {
        status?: string;
        error?: string;
        audioStatus?: string;
    } | null;
    aiResult: {
        processingStatus: string | null;
        error: string | null;
    } | null;
}

export async function logProcessOutcome(
    page: Page,
    prisma: PrismaClient,
    getCaseId: () => Promise<string>,
    opts?: { timeout?: number },
): Promise<ProcessOutcome> {
    const timeout = opts?.timeout ?? 30_000;
    let status = 0;
    let body: ProcessOutcome['body'] = null;

    try {
        const response = await page.waitForResponse(
            (res) =>
                res.request().method() === 'POST' &&
                /\/api\/nana\/cases\/[^/]+\/process$/.test(res.url()),
            { timeout },
        );

        status = response.status();
        const text = await response.text();
        try {
            body = JSON.parse(text) as ProcessOutcome['body'];
        } catch {
            // 非 JSON 响应（如 HTML 错误页）保留 null，由 status 暴露
        }
    } catch (e) {
        console.log(`[process-outcome] waitForResponse 失败: ${e instanceof Error ? e.message : String(e)}`);
        status = 0; // 0 表示没有拿到响应（超时/网络错误）
    }

    let aiResult: ProcessOutcome['aiResult'] = null;
    try {
        const caseId = await getCaseId();
        aiResult = await prisma.caseAiResult.findUnique({
            where: { caseId },
            select: { processingStatus: true, error: true },
        });
    } catch (e) {
        console.log(`[process-outcome] 查询 CaseAiResult 失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    console.log(`[process-outcome] HTTP status=${status}`);
    console.log(`[process-outcome] body.status=${body?.status ?? '(null)'}`);
    console.log(`[process-outcome] body.error=${body?.error ?? '(null)'}`);
    console.log(`[process-outcome] body.audioStatus=${body?.audioStatus ?? '(null)'}`);
    console.log(`[process-outcome] CaseAiResult.processingStatus=${aiResult?.processingStatus ?? '(null)'}`);
    console.log(`[process-outcome] CaseAiResult.error=${aiResult?.error ?? '(null)'}`);

    return { status, body, aiResult };
}
