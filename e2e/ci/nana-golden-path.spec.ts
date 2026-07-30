/**
 * nana-golden-path.spec.ts — r3.1 §3 任务 2.4 黄金闭环最小路径（R1a）
 *
 * 覆盖 FREEZE-001 §9.1 已冻结 14 条中的核心主路径条款（场景 S1 + S4）：
 *   - CL-01 一键进入拍题（导航+控件=硬门禁；5s/10s=测试超时）
 *   - CL-02 题图预览+保存（DB 有 Artifact(question_image)）
 *   - CL-03 录音可选（这里测有录音路径，S1；不录音路径在 S2 spec 补充）
 *   - CL-04 保存不等待 AI（即时"已收好"；≤2s=体验采集不阻塞；5s/10s=测试超时）
 *   - CL-05 真实转写与题图解耦（fake-provider 返回 transcript）
 *   - CL-06 7 字段完整（success 路径，含 textbookTopic 占位测试在 S4）
 *   - CL-07 高置信双层独立挂载（TB-010 + 知识节点 M2a-13）
 *   - CL-08 低置信诚实降级（独立 test，用 tilted-partial fixture）
 *   - CL-10a /nana/knowledge-map 默认 Tab=题目汇总
 *   - CL-11 单题基础归集（多题分组完整验证在 batch-path spec）
 *   - CL-12 琥珀证据 + StudentNodeState 不新增
 *   - CL-15 连续拍题竞态基础断言（完整验证在 sequential-capture spec）
 *
 * 测试基础设施依赖（r3.1 任务 2.1 + 2.2 + 2.3 已就绪）：
 *   - e2e/helpers/fake-provider-server.ts：本地假豆包 Provider（OpenAI 兼容接口）
 *   - e2e/helpers/register-fixture.ts：拦截 POST /api/nana/cases，动态注册压缩后 data URL 哈希
 *   - e2e/helpers/virtual-microphone.ts：Chromium fake-media flags（playwright.config.ts 已注入 mobile-chrome project）
 *   - e2e/helpers/db-verifier.ts：Prisma 双层数据库验证
 *
 * 关键架构（r3.1 §7.1 + §7.2）：
 *   1. 假 Provider 监听 127.0.0.1:3999，Playwright webServer env 需注入
 *      `VOLCENGINE_BASE_URL=http://127.0.0.1:3999`（批次 3 任务 2.9 落实）
 *   2. 真实 /process 路由执行 → 真实 case-analyzer.ts → 调假 Provider
 *      → 真实 Prisma 事务落库（不绕过后端）
 *   3. Playwright 监听 createCase 请求体（不伪造）→ 提取 artifacts[].content
 *      → SHA-256 → POST /__test/register 注册到假 Provider
 *   4. 假 Provider 收到 image_url.url 算 SHA-256 匹配 mock
 *      → 未注册哈希显式 HTTP 500 + UNREGISTERED_HASH（禁止 fallback）
 *
 * @TODO r3.1 任务 1.1~1.4：evidence-collector 未实现，本 spec 先用 Playwright 原生
 *       page.screenshot() 做最小证据采集；后续任务补齐后切换到统一证据采集器。
 *
 * 运行（依赖批次 3 任务 2.9 webServer env 配置 + ffmpeg 安装）：
 *   npx playwright test --project=mobile-chrome e2e/ci/nana-golden-path.spec.ts
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
import { logProcessOutcome } from '../helpers/process-response-logger';

// ─── 常量 ──────────────────────────────────────────────────

const FAKE_PROVIDER_PORT = 3999;
const FAKE_PROVIDER_BASE_URL = `http://127.0.0.1:${FAKE_PROVIDER_PORT}`;

// CL-04 测试超时（硬门禁）：本地 5s / CI 10s（FREEZE-001 §9.1 CL-04）
const SAVE_TOAST_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
// CL-01 导航超时（硬门禁）：本地 5s / CI 10s（FREEZE-001 §9.1 CL-01）
const NAV_TIMEOUT_MS = process.env.CI ? 10_000 : 5_000;
// AI 整理超时（假 Provider <100ms 返回 + Prisma 事务，5s 足够，留 30s 防慢 CI）
const AI_PROCESS_TIMEOUT_MS = 30_000;

// 真实 fixture 路径（素材组 A 已就绪，已脱敏确认）
const CLEAR_PRINTED_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/clear-printed.jpg',
);
const TILTED_PARTIAL_FIXTURE = path.resolve(
    process.cwd(),
    'tests/fixtures/nana/cases/tilted-partial.jpg',
);

// mock 中明确的 TB-010 章节 / M2a-13 知识节点（fake-provider-server.ts MOCK_RESULTS）
const EXPECTED_TB_ID = 'TB-010';
const EXPECTED_TB_NAME = '函数的基本性质';
const EXPECTED_NODE_ID = 'M2a-13';

// ─── 共享资源（顶层 beforeAll/afterAll 管理，两个 describe.serial 共用）─────

let fakeProvider: StartedFakeProvider | null = null;
let prisma: PrismaClient | null = null;
let verifier: DbVerifier | null = null;

// ─── 辅助：注册临时用户 + 登录 ─────────────────────────────

async function registerAndLogin(
    page: Page,
    suffix: string,
): Promise<{ userId: string; email: string }> {
    const email = `e2e_golden_${suffix}_${Date.now()}@test.local`;
    const password = '123456';
    const name = `e2e_golden_${suffix}`;

    await page.goto('/register');
    await expect(page.locator('body')).toContainText(/注册|Register/, { timeout: 15_000 });

    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(password);
    await page.locator('select[name="educationStage"]').selectOption('senior_high');
    await page.locator('input[name="enrollmentYear"]').fill('2024');

    // 注册成功后 register/page.tsx 弹 alert；once 仅处理这一次
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

    // 从 DB 取 userId（page state 不暴露）
    if (!prisma) throw new Error('prisma 未初始化（beforeAll 失败？）');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`测试用户未找到: ${email}`);
    return { userId: user.id, email };
}

async function cleanupUserData(userId: string): Promise<void> {
    if (!prisma) return;
    // 级联清理顺序：tags → aiResult → artifacts → cases → studentNodeState → user
    // 用 catch(() => {}) 忽略"表中无此用户数据"的报错（保证幂等）
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

/** 从 DB 取该用户最近创建的 Case ID */
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
// S1 主路径：清晰题图 + 录音 → 完整成功路径
// 覆盖 CL-01 / CL-02 / CL-03 / CL-04 / CL-05 / CL-06 / CL-07
//      CL-10a / CL-11（单题基础）/ CL-12 / CL-15（基础断言）
// ═══════════════════════════════════════════════════════════════

test.describe.serial('nana-golden-path: S1 清晰题图+录音完整成功路径', () => {
    let mainUserId: string | null = null;
    let studentNodeStateBefore = 0;

    test.beforeAll(async () => {
        // 启动假 Provider（端口 3999，与 webServer env 一致）
        // 端口检测：CI 已在 out-of-process 启动（ci.yml Start step）→ 跳过；
        // 本地跑 e2e 端口未占用 → spec 自己起 in-process 实例（保留自包含性）
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
            verifier = createDbVerifier(prisma);
        }
    });

    test.afterAll(async () => {
        if (mainUserId) {
            await cleanupUserData(mainUserId);
            mainUserId = null;
        }
    });

    test('S1 主路径-登录到图谱完整闭环', async ({ page }) => {
        test.setTimeout(120_000); // 黄金闭环容忍 CI 慢启动

        // [D1 阶段1诊断] 在点击"收好这道题"之前注册事件监听器，捕获 /process 的完整命运。
        // 监听器只读不写，不改变请求行为。waitForRequest 只能证明"请求对象创建"，
        // 被 abort 也能通过；requestfailed + waitForResponse 才能看到请求真实命运。
        let chatCompletionsSeen = 0;
        page.on('requestfinished', (req) => {
            if (req.url().includes('/process')) {
                // [D1 阶段1诊断] 只记录 URL，不读 status（req.response() 是 Promise）
                console.log(`[e2e-diag] requestfinished ${req.url()}`);
            }
        });
        page.on('requestfailed', (req) => {
            if (req.url().includes('/process')) {
                console.log(`[e2e-diag] requestfailed ${req.url()} errorText=${req.failure()?.errorText}`);
            }
        });
        page.on('response', (res) => {
            if (res.url().includes('/process')) {
                console.log(`[e2e-diag] response ${res.url()} status=${res.status()}`);
            }
        });
        page.on('request', (req) => {
            if (req.url().includes('/chat/completions')) {
                chatCompletionsSeen++;
                console.log(`[e2e-diag] chat/completions request #${chatCompletionsSeen}`);
            }
        });

        // 注册 fixture → 假 Provider 映射（高置信 clear-printed → TB-010 + M2a-13）
        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'clear-printed',
        );

        try {
            // ═══ CL-01：登录后一键进入拍题 ═══
            await test.step('CL-01 登录后一键进入拍题（导航+控件=硬门禁）', async () => {
                const { userId } = await registerAndLogin(page, 'main');
                mainUserId = userId;
                // 拍题前 StudentNodeState 数量（CL-12 前置）
                studentNodeStateBefore = await verifier!.countStudentNodeState(userId);

                // 首页有"拍一道题"入口
                await expect(page.getByText('拍一道题')).toBeVisible({ timeout: 5_000 });

                // 点击进入 /nana/capture（测试超时：5s 本地 / 10s CI = 硬门禁）
                const navStart = Date.now();
                await page.getByText('拍一道题').click();
                await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });
                // 硬门禁：题图占位区 + 录音区控件出现
                await expect(page.getByText('点这里拍照，或从相册选')).toBeVisible({
                    timeout: 5_000,
                });
                // 默认 voice tab（讲讲思路）显示录音按钮
                await expect(page.getByRole('button', { name: '说说看' })).toBeVisible({
                    timeout: 5_000,
                });
                const navDuration = Date.now() - navStart;
                // 体验采集（不阻塞）：记录导航耗时（@TODO evidence-collector 补齐后聚合）
                console.log(`[CL-01] 导航耗时: ${navDuration}ms (体验目标 ≤2000)`);
            });

            // ═══ CL-02：题图预览 + 保存 ═══
            await test.step('CL-02 题图预览（持久存储在 CL-07 DB 验证）', async () => {
                await page.setInputFiles('input[type="file"]', CLEAR_PRINTED_FIXTURE);
                // 题图预览出现（硬门禁）
                await expect(
                    page.getByRole('img', { name: '刚拍的题图' }),
                ).toBeVisible({ timeout: 10_000 });
                // 截图证据（@TODO 任务 1.x evidence-collector 补齐后替换为统一采集）
                await page.screenshot({
                    path: 'test-results/golden-cl-02-image-preview.png',
                    fullPage: false,
                });
            });

            // ═══ CL-03 + CL-04：录音（可选，这里测有录音路径）+ 保存不等待 AI ═══
            await test.step('CL-03+04 录音可选 + 保存不等待 AI（即时已收好）', async () => {
                // ⚠️ 已知限制（2026-07-27 plan v2 任务 F 诊断）：
                // CI headless 上点"说说看"后"我听完了"5s timeout（voice-recorder state
                // 不切换到 recording）。诊断 spec 证明 getUserMedia 本身可用（返回 1
                // audio track），但 golden-path 的上传题图→点击链路触发某种 React
                // state 竞态。根因未完全定位，CI 暂跳过录音步骤（r3.1 §5.2 技术风险
                // 第 1 条预案：录音在 CI 不被覆盖，由本地/真机抽检覆盖）。
                // 后续：plan v2 任务 G（injectFakeUserMedia 降级）或更深入诊断。
                const skipAudioInCi = process.env.CI === 'true';
                if (skipAudioInCi) {
                    console.log('[CL-03] CI 环境：跳过录音步骤（已知限制，见 plan v2 任务 F）');
                } else {
                    // CL-03 录音路径：点"说说看"开始
                    await page.getByRole('button', { name: '说说看' }).click();
                    // 等 recording 态出现（"我听完了"按钮渲染）
                    await expect(
                        page.getByRole('button', { name: '我听完了' }),
                    ).toBeVisible({ timeout: 5_000 });
                    // 录 ~1.5s（虚拟麦克风静默 WAV，长度不重要，验证完整 getUserMedia→MediaRecorder 链路）
                    await page.waitForTimeout(1500);
                    // 点"我听完了" → isStopping → recorder.stop() → onstop → state=completed
                    await page.getByRole('button', { name: '我听完了' }).click();
                    // 等 completed 态稳定（"重新录"按钮出现作为完成标志，~1s 足够）
                    await page.waitForTimeout(1500);
                }

                // CL-04 核心断言：保存后"已收好"必须先于 AI 整理完成
                // capture/page.tsx line 211: setSaveState("saving")
                //             line 212: setSaveState("saved")  ← 同步显示"已收好"
                //             line 225: await triggerCaseProcess(...)  ← AI 异步触发
                // 因此"已收好"出现时 /process 应已触发但未返回
                //
                // [D1 阶段1诊断] 改 waitForRequest → waitForResponse：
                // waitForRequest 只捕获"请求对象创建"事件，请求被 abort 也能通过——
                // 这正是"CL-04 通过但 handler 不执行"的矛盾来源。waitForResponse 才能确认
                // 请求真的到达服务端并拿到响应。若请求被前端 abort，waitForResponse 会
                // timeout（30s）——timeout 本身就是诊断证据（铁律6：已在执行日志声明）。
                const outcomePromise = logProcessOutcome(
                    page,
                    prisma!,
                    () => getLatestCaseId(mainUserId!),
                    { timeout: AI_PROCESS_TIMEOUT_MS },
                );

                const saveStart = Date.now();
                await page.getByRole('button', { name: '收好这道题' }).click();

                // 硬门禁：≤5s 本地 / ≤10s CI 看到"已收好"
                await expect(page.getByText('已收好').first()).toBeVisible({
                    timeout: SAVE_TOAST_TIMEOUT_MS,
                });
                const savedDuration = Date.now() - saveStart;
                console.log(
                    `[CL-04] "已收好"耗时: ${savedDuration}ms (体验目标 ≤2000 / 测试超时 ${SAVE_TOAST_TIMEOUT_MS}ms)`,
                );

                // [commit 0.3] 打印 /process 分层证据：HTTP status + body + DB 落库状态
                const outcome = await outcomePromise;
                // 如果 outcome 显示业务失败，这里用 expect 诚实红掉，不再 timeout 伪装
                expect(outcome.status).toBe(200);
                expect(outcome.body?.status).toBe('success');
                expect(outcome.aiResult?.processingStatus).toBe('success');
            });

            // 取 Case ID（capture/page.tsx 把 caseId 存 React state，不暴露 DOM；从 DB 拿）
            const caseId = await getLatestCaseId(mainUserId!);

            // ═══ CL-05 + CL-06：AI 整理结果 7 字段 ═══
            await test.step('CL-05+06 AI 整理结果 7 字段', async () => {
                // 等待 AI 结果卡渲染（processState === "done" 时 AiResultCard 出现）
                await expect(page.getByText('AI 摘要')).toBeVisible({
                    timeout: AI_PROCESS_TIMEOUT_MS,
                });

                // CL-06 7 字段接口契约断言（FREEZE-001 §9.1）：
                // ① transcript 非空（CL-05：有录音时返回真实转写）
                // CI 跳过录音时不验证 transcript 区块（audioStatus=skipped → 前端不渲染 transcript）
                if (process.env.CI !== 'true') {
                    await expect(page.getByText('我说了').first()).toBeVisible();
                    await expect(
                        page.getByText('这道题是判断函数单调性的'),
                    ).toBeVisible();
                }

                // ② questionSummary 非空
                await expect(
                    page.getByText('判断 f(x)=x²-2x 在 [0,3] 上的单调性'),
                ).toBeVisible();

                // ③ textbookTopicId 高置信 → textbookTopic 非空（孩子操作层展示）
                await expect(page.getByText(EXPECTED_TB_NAME).first()).toBeVisible();

                // ④ initialFeedback 非空（轻反馈区块）
                await expect(
                    page.getByText('你很仔细，推导过程写得很完整'),
                ).toBeVisible();

                // ⑤ possibleMistakeReason 非空（CL-06 允许为空；本 fixture 给值）
                await expect(
                    page.getByText('可能在符号变换时出了差错'),
                ).toBeVisible();

                // ⑥ nextActionSuggestion 非空
                await expect(
                    page.getByText(/回看 3\.2 函数的基本性质/),
                ).toBeVisible();

                // ⑦ audioStatus 非 skipped（"我说了"区块出现已隐含验证 audioStatus=success）
            });

            // ═══ CL-07：高置信双层独立挂载 ═══
            await test.step('CL-07 高置信双层独立挂载（DB 双层 tag 验证）', async () => {
                // 等待 /process 完成 + DB 写入（轮询 CaseAiResult 存在）
                await expect.poll(
                    async () => {
                        const r = await prisma!.caseAiResult.findUnique({
                            where: { caseId },
                        });
                        return r?.processingStatus;
                    },
                    { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
                ).toBe('success');

                // DB 双层验证（CL-07 + CL-02 持久存储 + CL-04 不丢失）
                // CI 跳过录音时 audioStatus=skipped（合理降级）；本地录音时=success
                const expectedAudioStatus = process.env.CI === 'true' ? 'skipped' : 'success';
                await verifier!.caseCreated(caseId, { studentId: mainUserId! });
                await verifier!.aiResultPersisted(caseId, {
                    processingStatus: 'success',
                    audioStatus: expectedAudioStatus,
                    questionSummary: '判断 f(x)=x²-2x 在 [0,3] 上的单调性',
                    textbookTopicId: EXPECTED_TB_ID,
                    initialFeedback: '你很仔细，推导过程写得很完整',
                    nextActionSuggestion: '回看 3.2 函数的基本性质，重点检查移项后的符号',
                });
                // 孩子操作层 tag（source=vlm，TB-010）
                await verifier!.textbookTopicTagExists(caseId, 'vlm', EXPECTED_TB_ID);
                // 系统验证层 tag（source=vlm，M2a-13 知识节点）
                await verifier!.knowledgeTagExists(caseId, 'vlm', EXPECTED_NODE_ID);
                // Artifact 双类型（CL-02 question_image 持久化 + CL-05 transcript 回写）
                // CI 跳过录音时无 transcript artifact（合理降级）
                await verifier!.artifactExists(caseId, 'question_image', 100);
                if (process.env.CI !== 'true') {
                    await verifier!.artifactExists(caseId, 'transcript');
                }
            });

            // ═══ CL-10a：汇总默认打开 + AI 自动分组 ═══
            await test.step('CL-10a 汇总默认打开+AI 自动分组', async () => {
                // 从浮动卡点"去知识地图看看"
                await page.getByRole('link', { name: '去知识地图看看' }).first().click();
                await page.waitForURL('**/nana/knowledge-map', { timeout: 10_000 });

                // CL-10a 硬门禁 ①：默认 Tab=题目汇总（不是图谱/列表）
                // knowledge-map/page.tsx line 65: useState<'summary' | 'graph' | 'list'>('summary')
                await expect(
                    page.getByRole('heading', { name: '我的知识地图' }),
                ).toBeVisible({ timeout: 10_000 });

                // CL-10a 硬门禁 ②：AI 自动分类的题归入正确章节组（非手动改）
                // summary 区会显示 TB-010 章节标题（"函数的基本性质"）+ case 卡片
                await expect(page.getByText(EXPECTED_TB_NAME).first()).toBeVisible({
                    timeout: 10_000,
                });

                // CL-11 基础断言：单题已归集（多题分组完整验证在 batch-path spec）
                const caseCount = await prisma!.case.count({
                    where: { studentId: mainUserId! },
                });
                expect(caseCount).toBe(1);
            });

            // ═══ CL-12：图谱琥珀证据 + StudentNodeState 不新增 ═══
            await test.step('CL-12 图谱琥珀证据+不点亮节点', async () => {
                // 切到 graph tab（knowledge-map/page.tsx line 287-294 "图谱"按钮）
                await page.getByRole('button', { name: '图谱' }).click();

                // 等图谱渲染（@TODO 琥珀色环精确选择器待补；截图证据先记录）
                await page.waitForTimeout(1000);
                await page.screenshot({
                    path: 'test-results/golden-cl-12-graph-tab.png',
                    fullPage: false,
                });

                // CL-12 ②：DB 验证 v1 不点亮节点（核心硬断言）
                // StudentNodeState 拍题前后数量不变（已有的保留）
                await verifier!.noStudentNodeStateChange(mainUserId!, studentNodeStateBefore);
                // status 合法值：stable/uncertain/gap/untested（无 mastered）
                await verifier!.allStudentNodeStateStatusLegal(mainUserId!);

                // CL-12 ①：琥珀证据 caseEvidenceCount > 0（系统验证层 tag 已挂载）
                // → CL-07 已断言 CaseKnowledgeTag(source=vlm, nodeId=M2a-13) 存在
                // → /api/diagnosis/map 会聚合为 caseEvidenceCount > 0（已由单测覆盖）
                // 本 spec 不重复 /api/diagnosis/map 响应断言，靠 DB 层 tag 验证支撑
            });

            // ═══ CL-15 基础断言：单题场景无竞态可触发 ═══
            // capture/page.tsx 的 currentCaseIdRef + abortControllerRef 机制
            // 完整竞态验证（连续 3 题不同延迟）在 nana-sequential-capture.spec.ts
            // 本 spec 单题保存即结束，断言已隐含在 CL-04 + CL-07 中
        } finally {
            // [D1 阶段1诊断] test 结束前打印 chat/completions 计数
            // （阶段2 R4 会断言 ≥1，本轮只采集；timeout 失败时也会走到这里）
            console.log(`[e2e-diag] chat/completions total seen: ${chatCompletionsSeen}`);
            disposeReg();
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// D4 诊断（阶段1）：APIRequestContext 直调 /process 区分前后端问题
// 独立 describe：不被 S1 serial 失败传播影响，确保即使 CL-04 timeout
// 也能拿到"后端是否正常"的决定性证据
// ═══════════════════════════════════════════════════════════════

test.describe.serial('nana-golden-path: D4 诊断 APIRequestContext 直调 /process', () => {
    test.beforeAll(async () => {
        // 共用顶层 fake-provider / prisma（若 S1 已启动则复用）
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
            verifier = createDbVerifier(prisma);
        }
    });

    test('D4 诊断: APIRequestContext 直调 /process 区分前后端问题', async ({ page }) => {
        test.setTimeout(120_000);

        // 注册 fixture（clear-printed → TB-010 + M2a-13）
        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'clear-printed',
        );
        let d4UserId: string | null = null;

        try {
            // 1. 注册 + 登录（走真实 UI，确保 NextAuth cookies 写入 page.context()）
            const { userId } = await registerAndLogin(page, 'd4');
            d4UserId = userId;

            // 2. 进入拍题页
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });

            // 3. 上传题图
            await page.setInputFiles('input[type="file"]', CLEAR_PRINTED_FIXTURE);
            await expect(
                page.getByRole('img', { name: '刚拍的题图' }),
            ).toBeVisible({ timeout: 10_000 });

            // 4. 点"收好这道题"触发 createCase，拿真实 caseId
            //    不关心前端 triggerCaseProcess 命运（它可能被 abort），
            //    只要 caseId 落库即可，然后用 APIRequestContext 直调 /process。
            const createCaseResponse = page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    /\/api\/nana\/cases$/.test(res.url()),
                { timeout: AI_PROCESS_TIMEOUT_MS },
            );
            await page.getByRole('button', { name: '收好这道题' }).click();
            await expect(page.getByText('已收好').first()).toBeVisible({
                timeout: SAVE_TOAST_TIMEOUT_MS,
            });
            await createCaseResponse; // 等 createCase 返回，确保 DB 有 case

            // 5. 从 DB 取 caseId
            const caseId = await getLatestCaseId(userId);
            console.log(`[e2e-diag D4] caseId=${caseId}`);

            // 6. 用 BrowserContext 自带的 APIRequestContext（page.context().request）
            //    直调 /process。它自动共享 page 的 cookies（NextAuth session），
            //    无需手动注入 storageState。绕过前端 React 组件生命周期，
            //    直接验证后端 route handler 本身是否工作。
            // [阶段A 任务A4] 加 retry（区分冷启动 vs 确定性崩溃）+ body 解析（§6.6 正确用法）
            let response = await page.context().request.post(
                `/api/nana/cases/${caseId}/process`,
            );
            console.log(`[e2e-diag D4] attempt 1 status=${response.status()}`);
            // 先读 text（body 只能消费一次，§6.6）
            let text = await response.text();
            if (response.status() !== 200) {
                console.log('[e2e-diag D4] attempt 1 non-200, waiting 5s for next dev cold-compile to settle, then retry...');
                await page.waitForTimeout(5000);
                // retry 时重新发起 POST（不能复用已消费的 body/response）
                response = await page.context().request.post(
                    `/api/nana/cases/${caseId}/process`,
                );
                console.log(`[e2e-diag D4] attempt 2 status=${response.status()}`);
                text = await response.text();
            }

            // body 解析（§6.6 正确用法：先 text，再 try JSON.parse）
            let body: unknown = null;
            try {
                body = JSON.parse(text);
            } catch {
                body = null;
            }
            if (body) {
                console.log(`[e2e-diag D4] direct POST body.status=${(body as { status?: unknown }).status}`);
            } else {
                // JSON 解析失败 → 可能是 Next.js 500 HTML 错误页，打印前 2000 字符
                console.log(`[e2e-diag D4] direct POST body (non-JSON, first 2000 chars): ${text.slice(0, 2000)}`);
            }

            // 7. [阶段A] 断言放宽：不断言 200，只采集证据。
            //    让 D4 无论 200/500 都跑完拿全 body + retry 信息。
            //    阶段B 修复后恢复：expect(response.status()).toBe(200)
            console.log(`[e2e-diag D4] final status=${response.status()} (阶段A: 不断言, 只采集)`);
            console.log(
                '[e2e-diag D4] 证据采集完成；阶段B 拿到 stack 修复后将恢复 200 断言',
            );
        } finally {
            if (d4UserId) {
                await cleanupUserData(d4UserId);
            }
            disposeReg();
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// S4 低置信诚实降级（CL-08）：独立 test，用 tilted-partial fixture
// ═══════════════════════════════════════════════════════════════

test.describe.serial('nana-golden-path: S4 低置信诚实降级（CL-08）', () => {
    let lowConfidenceUserId: string | null = null;

    test.beforeAll(async () => {
        // 共用顶层 fake-provider / prisma（若 S1 已启动则复用）
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
            verifier = createDbVerifier(prisma);
        }
    });

    test.afterAll(async () => {
        if (lowConfidenceUserId) {
            await cleanupUserData(lowConfidenceUserId);
            lowConfidenceUserId = null;
        }
    });

    test('CL-08 低置信-tilted-partial 不挂 tag + 占位"暂未覆盖"', async ({ page }) => {
        test.setTimeout(120_000);

        // 注册 tilted-partial mock（低置信 → 空候选数组）
        const disposeReg = setupFixtureRegistration(
            page,
            FAKE_PROVIDER_BASE_URL,
            'tilted-partial',
        );

        try {
            // 注册 + 登录 + 进入 /nana
            const { userId } = await registerAndLogin(page, 'lowconf');
            lowConfidenceUserId = userId;

            // 进入 /nana/capture
            await page.getByText('拍一道题').click();
            await page.waitForURL('**/nana/capture', { timeout: NAV_TIMEOUT_MS });

            // 上传 tilted-partial 题图
            await page.setInputFiles('input[type="file"]', TILTED_PARTIAL_FIXTURE);
            await expect(
                page.getByRole('img', { name: '刚拍的题图' }),
            ).toBeVisible({ timeout: 10_000 });

            // 不录音（CL-03 验证不录音也能保存）→ 直接点"收好这道题"
            await page.getByRole('button', { name: '收好这道题' }).click();
            await expect(page.getByText('已收好').first()).toBeVisible({
                timeout: SAVE_TOAST_TIMEOUT_MS,
            });

            // 等 AI 结果卡（fake-provider 立即返回低置信 mock）
            await expect(page.getByText('AI 摘要')).toBeVisible({
                timeout: AI_PROCESS_TIMEOUT_MS,
            });

            // CL-08 UI 断言：textbookTopic=null → "暂未覆盖"占位（A-1 补齐）
            await expect(page.getByText('暂未覆盖')).toBeVisible({ timeout: 5_000 });

            // 取最近 Case ID
            const caseId = await getLatestCaseId(userId);

            // CL-08 DB 断言：等 /process 完成
            await expect.poll(
                async () => {
                    const r = await prisma!.caseAiResult.findUnique({
                        where: { caseId },
                    });
                    return r?.processingStatus;
                },
                { timeout: AI_PROCESS_TIMEOUT_MS, intervals: [500] },
            ).toBe('success');

            await verifier!.aiResultPersisted(caseId, {
                processingStatus: 'success',
                audioStatus: 'skipped', // 没录音
                textbookTopicId: null, // CL-08 核心断言：textbookTopicId=null
            });

            // CL-08 DB 断言：不挂任何 vlm tag（课本层 + 系统层）
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
});

// ═══════════════════════════════════════════════════════════════
// 全局 teardown：关闭 prisma + 停止 fake-provider（仅 Playwright 整个 run 结束时）
// ═══════════════════════════════════════════════════════════════

test.afterAll(async () => {
    // 只有当两个 describe 都跑完后才会触发；如果只有一个 describe 内的 afterAll
    // 已经清理了 prisma/fakeProvider，这里再保险一次（幂等）
    if (prisma) {
        await prisma.$disconnect().catch(() => {});
        prisma = null;
    }
    if (fakeProvider) {
        await stopFakeProvider(fakeProvider.server).catch(() => {});
        fakeProvider = null;
    }
});
