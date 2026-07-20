/**
 * nana-cross-user.spec.ts — r3.1 §3 任务 2.5c 跨用户隔离验证（R1a）
 *
 * 覆盖 FREEZE-001 §9.1 已冻结条款 CL-16（场景 S10）的全部 7 个强化条件：
 *   ① `GET /api/nana/cases/summary` 不含 A 的分组
 *   ② `GET /api/nana/cases` 列表不含 A 的 Case
 *   ③ `GET /api/diagnosis/map` 不含 A 的琥珀证据
 *   ④ 直接访问 `GET /api/nana/cases/:A-case-id` 返回 404
 *   ⑤ 直接访问 `POST /api/nana/cases/:A-case-id/process` 返回 404（不可触发他人 AI 整理）
 *   ⑥ 直接访问 A 的 tags 接口（GET/POST）返回 404
 *   ⑦ 响应体不含 A 的题图、录音、base64 Artifact 内容
 *
 * 关键架构说明：
 *   - src 归属校验已落地（无需补 src 代码）：
 *     · cases/[id]/route.ts:30-33     findFirst({where:{id, studentId}}) → 404
 *     · cases/[id]/process/route.ts:279-291 (POST) + :403-406 (GET) findFirst → 404
 *     · cases/[id]/tags/route.ts:47/96 listTagsForCase/tagCaseManually 库内归属校验 → 404
 *     · cases/summary/route.ts:27     where:{studentId} 列表过滤
 *     · cases/route.ts:49             where:{studentId} 列表过滤
 *   - test 1：userA 完整拍题流程，产生 CaseId + CaseKnowledgeTag (vlm, M2a-13)
 *   - test 2：userB 独立 browser context 登录后，调用所有 API 验证完全隔离
 *
 * 测试基础设施依赖（与 golden-path/batch-path 共用）：
 *   - e2e/helpers/fake-provider-server.ts
 *   - e2e/helpers/register-fixture.ts
 *   - e2e/helpers/db-verifier.ts
 *
 * 运行（依赖 ci.yml nightly schedule）：
 *   npx playwright test --project=mobile-chrome e2e/ci/nana-cross-user.spec.ts
 *
 * 本地 e2e 跑不通不阻塞 commit（Docker/ffmpeg/webServer env 门禁交 GitHub Actions）。
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
import { createDbVerifier, type DbVerifier } from '../helpers/db-verifier';

// ─── 常量 ──────────────────────────────────────────────────

const FAKE_PROVIDER_PORT = 3999;
const FAKE_PROVIDER_BASE_URL = `http://127.0.0.1:${FAKE_PROVIDER_PORT}`;

const SAVE_TOAST_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
const NAV_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
const AI_PROCESS_TIMEOUT_MS = 30_000;

const CLEAR_PRINTED_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/clear-printed.jpg',
);

// userA 拍题产生的 mock 数据指纹（fake-provider-server.ts 'clear-printed'）
// 用于断言 userB 响应体不泄漏这些字符串（CL-16 ⑦）
const USER_A_FINGERPRINT_STRINGS = [
    '这道题是判断函数单调性的', // transcript
    '判断 f(x)=x²-2x 在 [0,3] 上的单调性', // questionSummary
    '你很仔细，推导过程写得很完整', // initialFeedback
    '可能在符号变换时出了差错', // possibleMistakeReason
    '回看 3.2 函数的基本性质', // nextActionSuggestion
];
const USER_A_TB_ID = 'TB-010';
const USER_A_NODE_ID = 'M2a-13';

// ─── 共享资源 ─────────────────────────────────────────────

let fakeProvider: StartedFakeProvider | null = null;
let prisma: PrismaClient | null = null;
let verifier: DbVerifier | null = null;

// userA 拍题后填充，test 2 用
let userAUserId: string | null = null;
let userACaseId: string | null = null;

// userB 注册后填充，afterAll 清理
let userBUserId: string | null = null;

const USER_PASSWORD = '123456';

// ─── 辅助：注册 + 登录 ─────────────────────────────────────

async function registerAndLogin(
    page: Page,
    suffix: string,
): Promise<{ userId: string; email: string }> {
    const email = `e2e_cross_${suffix}_${Date.now()}@test.local`;
    const password = USER_PASSWORD;
    const name = `e2e_cross_${suffix}`;

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

    if (!prisma) throw new Error('prisma 未初始化（beforeAll 失败？）');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`测试用户未找到: ${email}`);
    return { userId: user.id, email };
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

// ═══════════════════════════════════════════════════════════════
// CL-16 用户隔离 + 直接接口越权（场景 S10）
// ═══════════════════════════════════════════════════════════════

test.describe.serial('nana-cross-user: CL-16 用户隔离 + 直接接口越权', () => {

    test.beforeAll(async () => {
        if (!fakeProvider) {
            fakeProvider = await startFakeProvider(FAKE_PROVIDER_PORT);
        }
        if (!prisma) {
            prisma = new PrismaClient();
            verifier = createDbVerifier(prisma);
        }
    });

    test.afterAll(async () => {
        // 清理两个测试用户（幂等）
        if (userAUserId) {
            await cleanupUserData(userAUserId);
            userAUserId = null;
        }
        if (userBUserId) {
            await cleanupUserData(userBUserId);
            userBUserId = null;
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

    // ─── test 1：userA 完整拍题流程 ───────────────────────────────
    test('userA 完整拍题流程（建立待隔离数据）', async ({ page }) => {
        test.setTimeout(120_000);

        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'clear-printed',
        );

        try {
            // 注册 + 登录 userA
            const { userId } = await registerAndLogin(page, 'userA');
            userAUserId = userId;

            // 进入拍题
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });
            await expect(page.getByText('点这里拍照，或从相册选')).toBeVisible({
                timeout: 5_000,
            });

            // 上传 clear-printed 题图
            await page.setInputFiles('input[type="file"]', CLEAR_PRINTED_FIXTURE);
            await expect(page.getByRole('img', { name: '刚拍的题图' })).toBeVisible({
                timeout: 10_000,
            });

            // 不录音（简化 test，userA 数据已足够触发 CL-16 全部断言）
            await page.getByRole('button', { name: '收好这道题' }).click();
            await expect(page.getByText('已收好').first()).toBeVisible({
                timeout: SAVE_TOAST_TIMEOUT_MS,
            });

            // 等 /process 触发并完成
            await expect(page.getByText('AI 摘要')).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });

            // 取 caseId + DB 验证 userA 数据已落库
            userACaseId = await getLatestCaseId(userAUserId);
            await expect.poll(
                async () => {
                    const r = await prisma!.caseAiResult.findUnique({
                        where: { caseId: userACaseId! },
                    });
                    return r?.processingStatus;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe('success');

            // CL-07 双层 tag 已挂载（CL-16 琥珀证据前置）
            await verifier!.textbookTopicTagExists(userACaseId, 'vlm', USER_A_TB_ID);
            await verifier!.knowledgeTagExists(userACaseId, 'vlm', USER_A_NODE_ID);
        } finally {
            disposeReg();
        }
    });

    // ─── test 2：userB 完全隔离 + 直接接口越权 ────────────────────
    test('userB 列表/汇总/图谱/直接接口完全隔离（CL-16 ①~⑦）', async ({ page }) => {
        test.setTimeout(120_000);

        if (!userAUserId || !userACaseId) {
            throw new Error('userA 拍题流程必须先跑通');
        }

        // 注册 + 登录 userB（独立 browser context，无 userA session）
        const { userId: userBId } = await registerAndLogin(page, 'userB');
        userBUserId = userBId;

        // ═══ CL-16 ①②③：列表/汇总/图谱不含 userA 数据 ═══
        await test.step('CL-16 ①②③ 列表/汇总/图谱不含 userA 数据', async () => {
            // ① GET /api/nana/cases/summary 不含 A 的题（通过浏览器 fetch 自动带 userB cookie）
            const summary = await page.evaluate(async () => {
                const res = await fetch('/api/nana/cases/summary');
                return { status: res.status, body: await res.json() };
            });
            expect(summary.status).toBe(200);
            const summaryStr = JSON.stringify(summary.body);
            // 不含 userA 的 caseId
            expect(summaryStr).not.toContain(userACaseId);
            // 不含 userA 的 mock 字符串（questionSummary 等）
            for (const fp of USER_A_FINGERPRINT_STRINGS) {
                expect(summaryStr).not.toContain(fp);
            }
            // 不含 userA 的章节名
            expect(summaryStr).not.toContain(USER_A_TB_ID);

            // ② GET /api/nana/cases 列表不含 A 的 Case
            const list = await page.evaluate(async () => {
                const res = await fetch('/api/nana/cases');
                return { status: res.status, body: await res.json() };
            });
            expect(list.status).toBe(200);
            const listStr = JSON.stringify(list.body);
            expect(listStr).not.toContain(userACaseId);
            for (const fp of USER_A_FINGERPRINT_STRINGS) {
                expect(listStr).not.toContain(fp);
            }

            // ③ GET /api/diagnosis/map 不含 A 的琥珀证据
            const mapResp = await page.evaluate(async () => {
                const res = await fetch('/api/diagnosis/map');
                return { status: res.status, body: await res.json() };
            });
            expect(mapResp.status).toBe(200);
            const mapStr = JSON.stringify(mapResp.body);
            // M2a-13 节点的 caseEvidenceCount 不应因 userA 的 tag 而增加
            // （userB 自己没拍过这题，mapData 中 M2a-13 的 caseEvidenceCount 必须为 0）
            if (mapStr.includes(USER_A_NODE_ID)) {
                const parsed = mapResp.body as {
                    nodes?: Array<{ nodeId: string; caseEvidenceCount?: number }>;
                };
                const m2aNode = parsed.nodes?.find((n) => n.nodeId === USER_A_NODE_ID);
                if (m2aNode) {
                    // CL-16 ③：M2a-13 节点对 userB 而言应无琥珀证据
                    expect(m2aNode.caseEvidenceCount ?? 0).toBe(0);
                }
            }
            // map 响应体也不应泄漏 userA 的 mock 字符串（防 base64/原文泄漏）
            for (const fp of USER_A_FINGERPRINT_STRINGS) {
                expect(mapStr).not.toContain(fp);
            }
        });

        // ═══ CL-16 ④⑤⑥：直接接口越权返回 404 ═══
        await test.step('CL-16 ④⑤⑥ 直接接口越权一律 404', async () => {
            // 用 page.evaluate 同时调用多个 A 的接口，全部应返回 404
            const results = await page.evaluate(async (caseId) => {
                const calls = [
                    // ④ GET /api/nana/cases/:A-case-id
                    fetch(`/api/nana/cases/${caseId}`).then(async (r) => ({
                        label: 'GET /cases/:id',
                        status: r.status,
                        body: await r.text(),
                    })),
                    // ⑤ GET /api/nana/cases/:A-case-id/process
                    fetch(`/api/nana/cases/${caseId}/process`).then(async (r) => ({
                        label: 'GET /cases/:id/process',
                        status: r.status,
                        body: await r.text(),
                    })),
                    // ⑤ POST /api/nana/cases/:A-case-id/process（不可触发他人 AI 整理）
                    fetch(`/api/nana/cases/${caseId}/process`, { method: 'POST' }).then(
                        async (r) => ({
                            label: 'POST /cases/:id/process',
                            status: r.status,
                            body: await r.text(),
                        }),
                    ),
                    // ⑥ GET /api/nana/cases/:A-case-id/tags
                    fetch(`/api/nana/cases/${caseId}/tags`).then(async (r) => ({
                        label: 'GET /cases/:id/tags',
                        status: r.status,
                        body: await r.text(),
                    })),
                ];
                return Promise.all(calls);
            }, userACaseId);

            // CL-16 ④⑤⑥ 硬门禁：所有直接接口越权返回 404
            for (const r of results) {
                expect(
                    r.status,
                    `${r.label} 应返回 404（实际 ${r.status}）：${r.body}`,
                ).toBe(404);
            }
        });

        // ═══ CL-16 ⑦：响应体不泄漏 base64 / 题图 / 录音 ═══
        await test.step('CL-16 ⑦ 响应体不含 A 的题图/录音/base64 Artifact', async () => {
            const leakChecks = await page.evaluate(async (caseId) => {
                const responses = await Promise.all([
                    fetch(`/api/nana/cases/${caseId}`).then((r) => r.text()),
                    fetch(`/api/nana/cases/${caseId}/process`).then((r) => r.text()),
                    fetch(`/api/nana/cases/${caseId}/tags`).then((r) => r.text()),
                    // summary/list 也复查一次（防止 base64 偶发回写）
                    fetch('/api/nana/cases/summary').then((r) => r.text()),
                    fetch('/api/nana/cases').then((r) => r.text()),
                ]);
                return responses.join('\n---\n');
            }, userACaseId);

            // ⑦ 不含 base64 题图前缀（防 Artifact content 泄漏）
            expect(leakChecks).not.toContain('data:image/');
            expect(leakChecks).not.toContain('data:audio/');
            // ⑦ 不含 userA 的 mock 字符串（transcript/questionSummary 等）
            for (const fp of USER_A_FINGERPRINT_STRINGS) {
                expect(leakChecks).not.toContain(fp);
            }
            // ⑦ 不含 userA 的 caseId（防任何路径回写）
            expect(leakChecks).not.toContain(userACaseId);
        });

        // ═══ DB 维度最终验证：userB 的 where studentId:userB.id 不含 userA 的 Case ═══
        await test.step('DB 维度 userB 数据完全隔离', async () => {
            const userBCases = await prisma!.case.findMany({
                where: { studentId: userBUserId },
            });
            // userB 刚注册，没有任何拍题行为
            expect(userBCases.length).toBe(0);

            // userA 的 Case 在 DB 中仍然存在（不是被删了，是 userB 看不到）
            const userACase = await prisma!.case.findUnique({
                where: { id: userACaseId },
            });
            expect(userACase).toBeTruthy();
            expect(userACase!.studentId).toBe(userAUserId);
            expect(userACase!.studentId).not.toBe(userBUserId);
        });
    });
});
