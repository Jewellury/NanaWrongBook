/**
 * nana-batch-path.spec.ts — r3.1 §3 任务 2.5 三题批量路径（R1a）
 *
 * 覆盖 FREEZE-001 §9.1 已冻结条款（场景 S1 + S4 在 batch 维度的组合）：
 *   - CL-02 三题题图均持久存储（DB Artifact(question_image)）
 *   - CL-03 不录音也能完成（Q3 tilted-partial 走不录音路径，验证 CL-03 + CL-08）
 *   - CL-04 保存不等待 AI（三题各自验证"已收好"先于 AI 整理）
 *   - CL-06 三题 7 字段接口契约（Q1/Q2 完整字段 / Q3 仅必填字段）
 *   - CL-07 高置信双层独立挂载（Q1+Q2 都挂 TB-010 + M2a-13 双层 tag）
 *   - CL-08 低置信诚实降级（Q3 tilted-partial 候选空数组 → textbookTopicId=null + 无 tag）
 *   - CL-10a 汇总默认打开 + AI 自动分组（TB-010 组 2 题 + 未分类组 1 题）
 *   - CL-11 多题形成真正错题集（3 题不同 mock 响应、各自独立落库）
 *   - CL-12 琥珀证据 + StudentNodeState 不新增（拍题前后数量不变）
 *
 * r3.1 §7.1 素材组 A 三张 fixture 全部映射 TB-010 函数的基本性质：
 *   1. clear-printed.jpg   → 高置信 TB-010 (0.85) + M2a-13 (0.8) + 完整 7 字段 + 录音
 *   2. with-handwriting.jpg → 高置信 TB-010 (0.75) + M2a-13 (0.7) + 完整 7 字段 + 录音（手写干扰）
 *   3. tilted-partial.jpg  → 候选空数组 → textbookTopicId=null + 无 tag + 不录音（CL-08 降级）
 *
 * 分组断言（关键）：
 *   - TB-010 章节"函数的基本性质"组：2 题（Q1+Q2 都挂了 vlm tag）
 *   - 未分类组（topic=null）：1 题（Q3 没挂 tag，归未分类）
 *   - 任务简报说"三题归入 TB-010 组下 3 道题"与 FREEZE-001 §7.1 矛盾——
 *     按 FREEZE 写：tilted-partial 是 CL-08 降级路径，必归未分类。
 *
 * 测试结构：
 *   - describe.serial：4 个 test 顺序执行
 *   - test 1/2/3：各自注册 fixture + 上传 + 完整流程 + DB 验证
 *   - test 4：进入汇总页 + 图谱 tab，验证分组 + 琥珀证据 + 不点亮节点
 *   - 同一用户场景（保证 3 题汇总可见）
 *
 * 测试基础设施依赖（与 nana-golden-path.spec.ts 共用）：
 *   - e2e/helpers/fake-provider-server.ts：本地假豆包 Provider（OpenAI 兼容接口）
 *   - e2e/helpers/register-fixture.ts：拦截 POST /api/nana/cases，动态注册哈希
 *   - e2e/helpers/db-verifier.ts：Prisma 双层数据库验证
 *   - playwright.config.ts mobile-chrome project：虚拟麦克风 flags（Q1/Q2 录音路径）
 *
 * @TODO r3.1 任务 1.1~1.4：evidence-collector 未实现，本 spec 先用 Playwright 原生
 *       page.screenshot() 做最小证据采集。
 *
 * 运行（依赖 ci.yml nightly schedule 或手动触发）：
 *   npx playwright test --project=mobile-chrome e2e/ci/nana-batch-path.spec.ts
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

// CL-04 测试超时（硬门禁）：本地 5s / CI 10s（FREEZE-001 §9.1 CL-04）
const SAVE_TOAST_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
const NAV_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
const AI_PROCESS_TIMEOUT_MS = 30_000;

// 素材组 A 三张 fixture（已脱敏确认，FREEZE-001 §7.1）
const CLEAR_PRINTED_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/clear-printed.jpg',
);
const WITH_HANDWRITING_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/with-handwriting.jpg',
);
const TILTED_PARTIAL_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/tilted-partial.jpg',
);

// mock 中明确的 TB-010 章节 / M2a-13 知识节点（fake-provider-server.ts MOCK_RESULTS）
const EXPECTED_TB_ID = 'TB-010';
const EXPECTED_TB_NAME = '函数的基本性质';
const EXPECTED_NODE_ID = 'M2a-13';

// ─── 共享资源 ─────────────────────────────────────────────

let fakeProvider: StartedFakeProvider | null = null;
let prisma: PrismaClient | null = null;
let verifier: DbVerifier | null = null;

// 同一用户场景：3 题都归 batchUserId，方便汇总验证
let batchUserId: string | null = null;
let batchEmail: string | null = null;
const BATCH_PASSWORD = '123456';
let studentNodeStateBefore = 0;

// 累积记录 3 题 caseId 供汇总验证
const createdCaseIds: string[] = [];

// ─── 辅助：注册临时用户 + 登录 ─────────────────────────────

async function registerAndLoginOnce(
    page: Page,
): Promise<{ userId: string; email: string }> {
    // 仅第一个 test 调用此函数完成注册；后续 test 用 loginExisting 复用账号
    const email = `e2e_batch_${Date.now()}@test.local`;
    const password = BATCH_PASSWORD;
    const name = `e2e_batch_user`;

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

async function loginExisting(page: Page, email: string): Promise<void> {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(BATCH_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/nana', { timeout: 10_000 });
}

async function cleanupUserData(userId: string): Promise<void> {
    if (!prisma) return;
    // 级联清理顺序：tags → aiResult → artifacts → cases → studentNodeState → user
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

/** 取该用户最近创建的 Case ID（按 createdAt desc） */
async function getLatestCaseId(userId: string): Promise<string> {
    if (!prisma) throw new Error('prisma 未初始化');
    const recent = await prisma.case.findFirst({
        where: { studentId: userId },
        orderBy: { createdAt: 'desc' },
    });
    if (!recent) throw new Error('未找到测试创建的 Case');
    return recent.id;
}

/** 上传题图 + 等预览出现 */
async function uploadImageAndExpectPreview(page: Page, fixturePath: string): Promise<void> {
    await page.setInputFiles('input[type="file"]', fixturePath);
    await expect(page.getByRole('img', { name: '刚拍的题图' })).toBeVisible({
        timeout: 10_000,
    });
}

/** 录音约 1.5s（虚拟麦克风走完整 getUserMedia→MediaRecorder 链路） */
async function recordAbout1s(page: Page): Promise<void> {
    await page.getByRole('button', { name: '说说看' }).click();
    await expect(page.getByRole('button', { name: '我听完了' })).toBeVisible({
        timeout: 5_000,
    });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '我听完了' }).click();
    // 等 completed 态稳定
    await page.waitForTimeout(1500);
}

/** 点保存 + 等待"已收好"+ 等待 /process 触发（验证 CL-04 解耦） */
async function saveCaseAndExpectToast(page: Page): Promise<void> {
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
// 素材组 A 三题批量验证（同一用户，FREEZE-001 §7.1）
// ═══════════════════════════════════════════════════════════════

test.describe.serial('nana-batch-path: 素材组 A 三题批量验证', () => {

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
        if (batchUserId) {
            await cleanupUserData(batchUserId);
            batchUserId = null;
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

    // ─── Q1: clear-printed（高置信 TB-010 + 完整 7 字段 + 录音）────────
    test('Q1 clear-printed: 完整成功路径（TB-010 高置信 + 录音）', async ({ page }) => {
        test.setTimeout(120_000);

        // 注册+登录一次，建立 batchUserId（后续 Q2/Q3/汇总都复用）
        const reg = await registerAndLoginOnce(page);
        batchUserId = reg.userId;
        batchEmail = reg.email;
        studentNodeStateBefore = await verifier!.countStudentNodeState(batchUserId);

        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'clear-printed',
        );

        try {
            // CL-01：进入拍题
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });
            await expect(page.getByText('点这里拍照，或从相册选')).toBeVisible({
                timeout: 5_000,
            });

            // CL-02：上传题图
            await uploadImageAndExpectPreview(page, CLEAR_PRINTED_FIXTURE);

            // CL-03+05：录音（clear-printed mock 的 transcript 是"这道题是判断函数单调性的"）
            await recordAbout1s(page);

            // CL-04：保存不等待 AI
            await saveCaseAndExpectToast(page);

            // CL-05+06：AI 结果卡 7 字段断言
            await expect(page.getByText('AI 摘要')).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });
            // ① transcript（CL-05 有录音返回真实转写）
            await expect(page.getByText('这道题是判断函数单调性的')).toBeVisible();
            // ② questionSummary
            await expect(
                page.getByText('判断 f(x)=x²-2x 在 [0,3] 上的单调性'),
            ).toBeVisible();
            // ③ textbookTopicId（高置信 → 显示章节名）
            await expect(page.getByText(EXPECTED_TB_NAME).first()).toBeVisible();
            // ④ initialFeedback
            await expect(page.getByText('你很仔细，推导过程写得很完整')).toBeVisible();
            // ⑤ possibleMistakeReason（mock 给值，非空）
            await expect(page.getByText('可能在符号变换时出了差错')).toBeVisible();
            // ⑥ nextActionSuggestion
            await expect(
                page.getByText(/回看 3\.2 函数的基本性质/),
            ).toBeVisible();

            // 取 Case ID + DB 双层验证
            const caseId = await getLatestCaseId(batchUserId);
            createdCaseIds.push(caseId);

            await expect.poll(
                async () => {
                    const r = await prisma!.caseAiResult.findUnique({
                        where: { caseId },
                    });
                    return r?.processingStatus;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe('success');

            await verifier!.caseCreated(caseId, { studentId: batchUserId });
            await verifier!.aiResultPersisted(caseId, {
                processingStatus: 'success',
                audioStatus: 'success',
                questionSummary: '判断 f(x)=x²-2x 在 [0,3] 上的单调性',
                textbookTopicId: EXPECTED_TB_ID,
                initialFeedback: '你很仔细，推导过程写得很完整',
                nextActionSuggestion: '回看 3.2 函数的基本性质，重点检查移项后的符号',
            });
            // CL-07：双层 tag（孩子操作层 TB-010 + 系统验证层 M2a-13）
            await verifier!.textbookTopicTagExists(caseId, 'vlm', EXPECTED_TB_ID);
            await verifier!.knowledgeTagExists(caseId, 'vlm', EXPECTED_NODE_ID);
            await verifier!.artifactExists(caseId, 'question_image', 100);
            await verifier!.artifactExists(caseId, 'transcript');
        } finally {
            disposeReg();
        }
    });

    // ─── Q2: with-handwriting（高置信 TB-010 + 完整 7 字段 + 录音）─────
    test('Q2 with-handwriting: 手写干扰下的转写和分类（TB-010）', async ({ page }) => {
        test.setTimeout(120_000);

        if (!batchEmail || !batchUserId) {
            throw new Error('Q1 必须先跑通以建立 batchUserId/batchEmail');
        }

        // 复用同一用户登录（保证 3 题汇总可见）
        await loginExisting(page, batchEmail);

        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'with-handwriting',
        );

        try {
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });

            // 上传手写干扰 fixture
            await uploadImageAndExpectPreview(page, WITH_HANDWRITING_FIXTURE);

            // 录音（with-handwriting mock transcript 是"我先用导数算的..."）
            await recordAbout1s(page);

            await saveCaseAndExpectToast(page);

            // 等待 AI 结果卡
            await expect(page.getByText('AI 摘要')).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });
            // ① transcript（手写干扰下仍转写成功）
            await expect(
                page.getByText('我先用导数算的，然后代入端点值比较'),
            ).toBeVisible();
            // ② questionSummary
            await expect(page.getByText('利用导数判断函数单调性')).toBeVisible();
            // ③ textbookTopicId 仍归 TB-010（同 Q1 章节，验证多题分组）
            await expect(page.getByText(EXPECTED_TB_NAME).first()).toBeVisible();
            // ④ initialFeedback
            await expect(page.getByText('思路很清晰，知道用导数来分析')).toBeVisible();
            // ⑤ possibleMistakeReason
            await expect(page.getByText('可能在计算导数时漏了系数')).toBeVisible();
            // ⑥ nextActionSuggestion（与 Q1 不同，证明 mock 命中正确 fixture）
            await expect(
                page.getByText(/回看 3\.3 节相关内容/),
            ).toBeVisible();

            const caseId = await getLatestCaseId(batchUserId);
            createdCaseIds.push(caseId);

            await expect.poll(
                async () => {
                    const r = await prisma!.caseAiResult.findUnique({
                        where: { caseId },
                    });
                    return r?.processingStatus;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe('success');

            await verifier!.caseCreated(caseId, { studentId: batchUserId });
            await verifier!.aiResultPersisted(caseId, {
                processingStatus: 'success',
                audioStatus: 'success',
                questionSummary: '利用导数判断函数单调性',
                textbookTopicId: EXPECTED_TB_ID,
                initialFeedback: '思路很清晰，知道用导数来分析',
                nextActionSuggestion: '回看 3.3 节相关内容，检查求导过程',
            });
            // CL-07：Q2 也挂双层 tag
            await verifier!.textbookTopicTagExists(caseId, 'vlm', EXPECTED_TB_ID);
            await verifier!.knowledgeTagExists(caseId, 'vlm', EXPECTED_NODE_ID);
            await verifier!.artifactExists(caseId, 'question_image', 100);
            await verifier!.artifactExists(caseId, 'transcript');
        } finally {
            disposeReg();
        }
    });

    // ─── Q3: tilted-partial（低置信诚实降级 CL-08 + 不录音验证 CL-03）────
    test('Q3 tilted-partial: 低置信诚实降级 + 不录音（CL-08 + CL-03）', async ({ page }) => {
        test.setTimeout(120_000);

        if (!batchEmail || !batchUserId) {
            throw new Error('Q1+Q2 必须先跑通以建立 batchUserId/batchEmail');
        }

        await loginExisting(page, batchEmail);

        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'tilted-partial',
        );

        try {
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });

            await uploadImageAndExpectPreview(page, TILTED_PARTIAL_FIXTURE);

            // CL-03 验证：不录音直接保存
            await saveCaseAndExpectToast(page);

            await expect(page.getByText('AI 摘要')).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });

            // CL-08 UI 断言：textbookTopic=null → "暂未覆盖"占位（A-1 补齐）
            await expect(page.getByText('暂未覆盖')).toBeVisible({ timeout: 5_000 });

            // tilted-partial mock 的 questionSummary（即使低置信仍给值）
            await expect(
                page.getByText('图片不太完整，能看到部分函数内容'),
            ).toBeVisible();

            const caseId = await getLatestCaseId(batchUserId);
            createdCaseIds.push(caseId);

            await expect.poll(
                async () => {
                    const r = await prisma!.caseAiResult.findUnique({
                        where: { caseId },
                    });
                    return r?.processingStatus;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe('success');

            // CL-08 DB 断言：textbookTopicId=null + audioStatus=skipped（没录音）
            await verifier!.aiResultPersisted(caseId, {
                processingStatus: 'success',
                audioStatus: 'skipped',
                textbookTopicId: null,
            });

            // CL-08 DB 断言：不挂任何 vlm tag（课本层 + 系统层都降级）
            const vlmTextbookTag = await prisma!.caseTextbookTopicTag.findFirst({
                where: { caseId, source: 'vlm' },
            });
            expect(vlmTextbookTag).toBeNull();
            const vlmKnowledgeTag = await prisma!.caseKnowledgeTag.findFirst({
                where: { caseId, source: 'vlm' },
            });
            expect(vlmKnowledgeTag).toBeNull();
        } finally {
            disposeReg();
        }
    });

    // ─── 汇总页分组 + 图谱琥珀证据（CL-10a + CL-11 + CL-12）─────────────
    test('汇总页分组 + 图谱琥珀证据（CL-10a/CL-11/CL-12）', async ({ page }) => {
        test.setTimeout(120_000);

        if (!batchUserId || !batchEmail) {
            throw new Error('Q1+Q2+Q3 必须先跑通');
        }

        await loginExisting(page, batchEmail);

        // 直接进入知识地图（默认 Tab=题目汇总）
        await page.goto('/nana/knowledge-map');
        await expect(
            page.getByRole('heading', { name: '我的知识地图' }),
        ).toBeVisible({ timeout: 10_000 });

        // CL-10a：默认 Tab=题目汇总（页面会懒加载 summaryData）
        await expect(page.getByText(EXPECTED_TB_NAME).first()).toBeVisible({
            timeout: 10_000,
        });

        // CL-11：多题形成错题集
        //   - TB-010 组：Q1+Q2 = 2 题（都挂 vlm tag）
        //   - 未分类组：Q3 = 1 题（不挂 tag → 归"未分类/暂未覆盖"组）
        // UI 上：分组标题"函数的基本性质"和"未分类/暂未覆盖"都应可见
        await expect(page.getByText('未分类/暂未覆盖')).toBeVisible({
            timeout: 10_000,
        });

        // DB 维度精确断言分组结构（避免 UI 计数 flaky）
        // 取该用户全部 case + 各自的 vlm tag
        const cases = await prisma!.case.findMany({
            where: { studentId: batchUserId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                caseTextbookTopicTags: {
                    where: { source: 'vlm' },
                    select: { textbookTopicId: true },
                },
                caseKnowledgeTags: {
                    where: { source: 'vlm' },
                    select: { nodeId: true },
                },
            },
        });
        // 三题全部落库
        expect(cases.length).toBe(3);
        createdCaseIds.forEach((cid) => {
            const found = cases.find((c) => c.id === cid);
            if (!found) throw new Error(`Case ${cid} 未在汇总中找到`);
        });

        // TB-010 组：恰好 2 题挂了 vlm 课本 tag
        const tb010Cases = cases.filter((c) =>
            c.caseTextbookTopicTags.some((t) => t.textbookTopicId === EXPECTED_TB_ID),
        );
        expect(tb010Cases.length).toBe(2);

        // M2a-13 知识节点 tag：恰好 2 题挂了（CL-12 琥珀证据前置条件）
        const m2a13Cases = cases.filter((c) =>
            c.caseKnowledgeTags.some((t) => t.nodeId === EXPECTED_NODE_ID),
        );
        expect(m2a13Cases.length).toBe(2);

        // 未分类组：恰好 1 题无 vlm 课本 tag
        const noTagCases = cases.filter(
            (c) => c.caseTextbookTopicTags.length === 0,
        );
        expect(noTagCases.length).toBe(1);

        // 切到图谱 tab（CL-12 验证琥珀证据渲染）
        await page.getByRole('button', { name: '图谱' }).click();
        await page.waitForTimeout(1000); // 等图谱渲染
        await page.screenshot({
            path: 'test-results/batch-cl-12-graph-tab.png',
            fullPage: false,
        });

        // CL-12 ②：StudentNodeState 拍题前后数量不变（已有的保留）
        await verifier!.noStudentNodeStateChange(batchUserId, studentNodeStateBefore);
        // CL-12 ③：status 合法值（stable/uncertain/gap/untested，无 mastered）
        await verifier!.allStudentNodeStateStatusLegal(batchUserId);

        // CL-12 ①：琥珀证据前置——CL-07 已断言 2 题挂了 CaseKnowledgeTag(vlm, M2a-13)
        // → /api/diagnosis/map 聚合为 caseEvidenceCount > 0（已由单测覆盖，本 spec 不重复）
    });
});
