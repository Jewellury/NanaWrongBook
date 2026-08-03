/**
 * nana-sequential-capture.spec.ts — r3.1 §3 任务 2.5b 连续拍题竞态验证（R1a）
 *
 * 覆盖 FREEZE-001 §9.1 已冻结条款 CL-15（场景 S7）：
 *   - CL-04 保存不等待 AI（3 题各自"已收好"先于 AI 整理）
 *   - CL-15 连续拍题不存在前一道 AI 结果覆盖后一道的竞态
 *
 * @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
 *   - 需要 set-theory.jpg / inequality.jpg / function-graph.jpg 三张真实题图
 *   - 详见 tests/fixtures/nana/cases/PLACEHOLDER.md
 *   - 在 fixture 提供前，核心 test 用 test.fixme() 标注（不执行，但显示为待办）
 *   - fixture 提供后：删除 .fixme + 删除 @fixture-blocked 注释即可完整跑通
 *
 * r3.1 §3 任务 2.5b 核心要求（fixture 就绪后应验证）：
 *   1. 连续拍 3 道题（不等前一道 AI 整理完成）：
 *      - Q1 set-theory  → 假 Provider 注册延迟 2000ms（最慢，最晚返回）
 *      - Q2 inequality  → 假 Provider 注册延迟 500ms（中等）
 *      - Q3 function-graph → 假 Provider 注册延迟 50ms（最快，最先返回）
 *   2. 竞态验证核心：
 *      - Q3 最先返回（50ms），Q2 次之（500ms），Q1 最晚（2000ms）
 *      - Q1 的晚到结果不能覆盖 Q3 的已显示状态（前端 currentCaseIdRef 保护）
 *      - Q2 的结果不能覆盖 Q3 的状态
 *   3. 硬门禁断言（CL-04 + CL-15）：
 *      - 每道题保存"已收好"≤10s（CI）/ ≤5s（本地）
 *      - 最终页面显示的是 Q3（function-graph）的 AI 结果
 *      - 3 道 Case 各有独立 CaseAiResult，caseId 互不串
 *      - 进入汇总页，3 道题各自归入正确章节（TB-003/TB-008/TB-010）
 *
 * 测试基础设施：
 *   - e2e/helpers/fake-provider-server.ts：delayMs 参数支持
 *   - e2e/helpers/register-fixture.ts：setupFixtureRegistration 第 4 参数 = delayMs
 *   - e2e/helpers/db-verifier.ts
 *
 * mock 响应映射（fake-provider-server.ts MOCK_RESULTS 素材组 B）：
 *   - set-theory      → TB-003 集合的基本运算 + M1a-01 集合运算
 *   - inequality      → TB-008 一元二次不等式 + M2a-05 解法
 *   - function-graph  → TB-010 函数的基本性质 + M2a-13 图象法判断单调性
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
    startFakeProvider,
    stopFakeProvider,
    type StartedFakeProvider,
} from '../helpers/fake-provider-server';
import { setupFixtureRegistration } from '../helpers/register-fixture';
// db-verifier 未引入：本 spec 直接用 prisma 查询做断言（fixture 解除 fixme 后可视情况切换）

// ─── 常量 ──────────────────────────────────────────────────

const FAKE_PROVIDER_PORT = 3999;
const FAKE_PROVIDER_BASE_URL = `http://127.0.0.1:${FAKE_PROVIDER_PORT}`;

const SAVE_TOAST_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
const NAV_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
const AI_PROCESS_TIMEOUT_MS = 30_000;

// @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
const SET_THEORY_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/set-theory.jpg',
);
const INEQUALITY_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/inequality.jpg',
);
const FUNCTION_GRAPH_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/function-graph.jpg',
);

// r3.1 §3 任务 2.5b：三种不同延迟触发真实竞态
const Q1_DELAY_MS = 2000; // set-theory 最慢返回
const Q2_DELAY_MS = 500; // inequality 中等
const Q3_DELAY_MS = 50; // function-graph 最快返回

// mock 响应中明确的章节（fake-provider-server.ts 素材组 B MOCK_RESULTS）
const Q1_TB_ID = 'TB-003';
const Q2_TB_ID = 'TB-008';
const Q3_TB_ID = 'TB-010';

// Q3 mock 中的 questionSummary（用于断言"最终显示的是 Q3 而非 Q1/Q2"）
const Q3_QUESTION_SUMMARY = '根据函数图象判断单调递增和递减区间';

// ─── 共享资源 ─────────────────────────────────────────────

let fakeProvider: StartedFakeProvider | null = null;
let prisma: PrismaClient | null = null;

let seqUserId: string | null = null;
let seqEmail: string | null = null;
const SEQ_PASSWORD = '123456';

// 累积 3 题 caseId 供汇总验证
const createdCaseIds: string[] = [];

// ─── 辅助：注册 + 登录 ─────────────────────────────────────

async function registerAndLoginOnce(
    page: Page,
): Promise<{ userId: string; email: string }> {
    const email = `e2e_seq_${Date.now()}@test.local`;
    const password = SEQ_PASSWORD;
    const name = `e2e_seq_user`;

    await page.goto('/register');
    await expect(page.locator('body')).toContainText(/注册|Register/, { timeout: 15_000 });

    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(password);
    await page.locator('select[name="educationStage"]').selectOption('senior_high');
    await page.locator('input[name="enrollmentYear"]').fill('2024');

    page.once('dialog', (d) => d.accept());
    await page.locator('button[type="submit"]').click();

    try {
        await page.waitForURL('**/login', { timeout: 5_000 });
    } catch {
        await page.goto('/login');
    }

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/nana', { timeout: 10_000 });

    if (!prisma) throw new Error('prisma 未初始化');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`测试用户未找到: ${email}`);
    return { userId: user.id, email };
}

async function loginExisting(page: Page, email: string): Promise<void> {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(SEQ_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/nana', { timeout: 10_000 });
}

async function cleanupUserData(userId: string): Promise<void> {
    if (!prisma) return;
    await prisma.caseKnowledgeTag
        .deleteMany({ where: { case: { studentId: userId } } })
        .catch(() => {});
    await prisma.caseTextbookTopicTag
        .deleteMany({ where: { case: { studentId: userId } } })
        .catch(() => {});
    await prisma.caseAiResult
        .deleteMany({ where: { case: { studentId: userId } } })
        .catch(() => {});
    await prisma.artifact
        .deleteMany({ where: { case: { studentId: userId } } })
        .catch(() => {});
    await prisma.case.deleteMany({ where: { studentId: userId } }).catch(() => {});
    await prisma.studentNodeState
        .deleteMany({ where: { studentId: userId } })
        .catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
}

async function getLatestCaseId(userId: string): Promise<string> {
    if (!prisma) throw new Error('prisma 未初始化');
    const recent = await prisma.case.findFirst({
        where: { studentId: userId },
        orderBy: { createdAt: 'desc' },
    });
    if (!recent) throw new Error('未找到测试创建的 Case');
    return recent.id;
}

async function uploadImageAndExpectPreview(page: Page, fixturePath: string): Promise<void> {
    await page.setInputFiles('input[type="file"]', fixturePath);
    await expect(page.getByRole('img', { name: '刚拍的题图' })).toBeVisible({
        timeout: 10_000,
    });
}

async function saveCaseAndExpectToast(page: Page): Promise<void> {
    // CL-04：保存不等待 AI（process 触发即认为成功）
    const processRequestPromise = page.waitForRequest(
        (req) =>
            req.method() === 'POST' &&
            /\/api\/nana\/cases\/[^/]+\/process$/.test(req.url()),
        { timeout: AI_PROCESS_TIMEOUT_MS },
    );
    await page.getByRole('button', { name: '收好这道题' }).click();
    await expect(page.getByText('已收好').first()).toBeVisible({
        timeout: SAVE_TOAST_TIMEOUT_MS,
    });
    await processRequestPromise;
}

// ═══════════════════════════════════════════════════════════════
// S7 连续拍题竞态验证（CL-15）
// @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
// ═══════════════════════════════════════════════════════════════

test.describe.serial('nana-sequential-capture: S7 连续拍题竞态（CL-15）', () => {

    test.beforeAll(async () => {
        // 端口检测：CI 已在 out-of-process 启动 → 跳过；本地未占用 → 自起
        if (!fakeProvider) {
            const portInUse = await fetch(`http://127.0.0.1:${FAKE_PROVIDER_PORT}/`)
                .then(() => true)
                .catch(() => false);
            if (!portInUse) {
                fakeProvider = await startFakeProvider(FAKE_PROVIDER_PORT);
            }
        }
        if (!prisma) {
            prisma = new PrismaClient();
        }
    });

    test.afterAll(async () => {
        if (seqUserId) {
            await cleanupUserData(seqUserId);
            seqUserId = null;
        }
        if (prisma) {
            await prisma.$disconnect().catch(() => {});
            prisma = null;
        }
        if (fakeProvider) {
            await stopFakeProvider(fakeProvider.server).catch(() => {});
            fakeProvider = null;
        }
    });

    // ─── Q1 set-theory（最慢返回 2000ms）─────────────────────
    // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
    test.fixme('Q1 set-theory: 注册 + 拍题（延迟 2000ms 最慢返回）', async ({ page }) => {
        test.setTimeout(120_000);

        const reg = await registerAndLoginOnce(page);
        seqUserId = reg.userId;
        seqEmail = reg.email;

        // 关键：第 4 参数 delayMs = 2000（触发真实竞态）
        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'set-theory',
            Q1_DELAY_MS,
        );

        try {
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });
            await expect(page.getByText('点这里拍照，或从相册选')).toBeVisible({
                timeout: 5_000,
            });

            // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
            await uploadImageAndExpectPreview(page, SET_THEORY_FIXTURE);

            // CL-04：保存不等待 AI
            await saveCaseAndExpectToast(page);

            const caseId = await getLatestCaseId(seqUserId);
            createdCaseIds.push(caseId);
        } finally {
            disposeReg();
        }
    });

    // ─── Q2 inequality（中等延迟 500ms）──────────────────────
    // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
    test.fixme('Q2 inequality: 连续拍第二题（延迟 500ms 中等）', async ({ page }) => {
        test.setTimeout(120_000);

        if (!seqEmail || !seqUserId) {
            throw new Error('Q1 必须先跑通');
        }

        await loginExisting(page, seqEmail);

        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'inequality',
            Q2_DELAY_MS,
        );

        try {
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });

            // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
            await uploadImageAndExpectPreview(page, INEQUALITY_FIXTURE);

            await saveCaseAndExpectToast(page);

            const caseId = await getLatestCaseId(seqUserId);
            createdCaseIds.push(caseId);
        } finally {
            disposeReg();
        }
    });

    // ─── Q3 function-graph（最快返回 50ms）──────────────────
    // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
    test.fixme('Q3 function-graph: 连续拍第三题（延迟 50ms 最快返回）+ 竞态核心验证', async ({ page }) => {
        test.setTimeout(120_000);

        if (!seqEmail || !seqUserId) {
            throw new Error('Q1+Q2 必须先跑通');
        }

        await loginExisting(page, seqEmail);

        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'function-graph',
            Q3_DELAY_MS,
        );

        try {
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });

            // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
            await uploadImageAndExpectPreview(page, FUNCTION_GRAPH_FIXTURE);

            await saveCaseAndExpectToast(page);

            // CL-15 核心断言：最终显示 Q3 结果（不被 Q1/Q2 晚到结果覆盖）
            // 等 AI 结果卡渲染
            await expect(page.getByText('AI 摘要')).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });

            // Q3 的 questionSummary 应该出现（function-graph mock）
            await expect(page.getByText(Q3_QUESTION_SUMMARY)).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });

            const caseId = await getLatestCaseId(seqUserId);
            createdCaseIds.push(caseId);

            // DB 验证：3 个 Case 各自独立 CaseAiResult
            await expect.poll(
                async () => {
                    const r = await prisma!.caseAiResult.findUnique({
                        where: { caseId },
                    });
                    return r?.processingStatus;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe('success');

            // 等待所有 3 题 AI 结果都落库（Q1 2000ms + 网络开销）
            await expect.poll(
                async () => {
                    const results = await prisma!.caseAiResult.findMany({
                        where: { caseId: { in: createdCaseIds } },
                    });
                    return results.length;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe(3);
        } finally {
            disposeReg();
        }
    });

    // ─── 汇总页验证（3 题各自归入正确章节）─────────────────
    // @fixture-blocked: 待真实脱敏数学题图（r3.1 任务 2.7 素材组 B）
    test.fixme('汇总页 3 题各自归入正确章节（TB-003/TB-008/TB-010）', async ({ page }) => {
        test.setTimeout(120_000);

        if (!seqUserId || !seqEmail || createdCaseIds.length !== 3) {
            throw new Error('Q1+Q2+Q3 必须先跑通');
        }

        await loginExisting(page, seqEmail);

        await page.goto('/nana/knowledge-map');
        await expect(page.getByRole('heading', { name: '我的知识地图' })).toBeVisible({
            timeout: 10_000,
        });

        // DB 维度精确断言 3 题分组（避免 UI 计数 flaky）
        const cases = await prisma!.case.findMany({
            where: { studentId: seqUserId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                textbookTopicTags: {
                    where: { source: 'vlm' },
                    select: { textbookTopicId: true },
                },
            },
        });

        // 3 题全部落库
        expect(cases.length).toBe(3);
        createdCaseIds.forEach((cid) => {
            const found = cases.find((c) => c.id === cid);
            if (!found) throw new Error(`Case ${cid} 未在汇总中找到`);
        });

        // 3 题各自归入正确章节（CL-11 跨章节分组）
        const tb003Case = cases.find((c) =>
            c.textbookTopicTags.some((t) => t.textbookTopicId === Q1_TB_ID),
        );
        expect(tb003Case).toBeTruthy();

        const tb008Case = cases.find((c) =>
            c.textbookTopicTags.some((t) => t.textbookTopicId === Q2_TB_ID),
        );
        expect(tb008Case).toBeTruthy();

        const tb010Case = cases.find((c) =>
            c.textbookTopicTags.some((t) => t.textbookTopicId === Q3_TB_ID),
        );
        expect(tb010Case).toBeTruthy();
    });
});
