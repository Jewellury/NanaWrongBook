/**
 * 诊断 spec：虚拟麦克风录音在 CI headless 失败根因采集（plan v2 任务 F）
 *
 * 目的：采集点"说说看"后的页面状态，确认是
 *   - getUserMedia 永久 pending（fake-media flags 失效）
 *   - getUserMedia reject（权限/设备不可用）
 *   - MediaRecorder 创建失败
 *   - 还是 state 切换逻辑问题
 *
 * 不跑完整 golden path，只采集录音失败现场。
 * 诊断完成后此 spec 应删除或标记 .skip。
 *
 * 关联：doc/plan/nana-test-framework-ci-fix-plan.md 修订 v2 任务 F
 */
import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test.describe.serial('诊断：虚拟麦克风录音 CI 失败根因', () => {
    let prisma: PrismaClient | null = null;
    let testUserId: string | null = null;

    test.afterAll(async () => {
        if (testUserId && prisma) {
            try {
                await prisma.case.deleteMany({ where: { studentId: testUserId } });
                await prisma.user.delete({ where: { id: testUserId } });
            } catch { /* best effort */ }
        }
        if (prisma) await prisma.$disconnect().catch(() => {});
    });

    test('采集点"说说看"后页面状态', async ({ page }) => {
        // 收集 console 消息（getUserMedia/MediaRecorder 错误会出现在这里）
        const consoleMessages: { type: string; text: string }[] = [];
        const pageErrors: string[] = [];
        page.on('console', (msg) => {
            consoleMessages.push({ type: msg.type(), text: msg.text() });
        });
        page.on('pageerror', (err) => {
            pageErrors.push(err.message);
        });

        // 注册临时用户
        const suffix = `diag_${Date.now()}`;
        const email = `e2e_diag_${suffix}@test.local`;
        await page.goto('/register');
        await expect(page.locator('body')).toContainText(/注册|Register/);
        await page.locator('input[name="name"]').fill(`diag_${suffix}`);
        await page.locator('input[name="email"]').fill(email);
        await page.locator('input[name="password"]').fill('123456');
        await page.locator('button[type="submit"]').click();
        await page.waitForURL('**/nana', { timeout: 15_000 });

        prisma = new PrismaClient();
        const user = await prisma.user.findUnique({ where: { email } });
        testUserId = user?.id ?? null;

        // 进入 capture 页
        await page.getByText('拍一道题').click();
        await page.waitForURL('**/nana/capture', { timeout: 10_000 });
        await expect(page.getByRole('button', { name: '说说看' })).toBeVisible({ timeout: 5_000 });

        // 在点击前注入诊断 hook：拦截 getUserMedia 调用并记录
        await page.addInitScript(() => {
            if (typeof window === 'undefined') return;
            const w = window as unknown as Record<string, unknown>;
            const nav = navigator as unknown as {
                mediaDevices?: {
                    getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
                };
            };
            const orig = nav.mediaDevices?.getUserMedia?.bind(nav.mediaDevices);
            if (!orig) {
                w.__diagGetUserMedia = 'UNAVAILABLE: navigator.mediaDevices.getUserMedia undefined';
                return;
            }
            w.__diagGetUserMedia = 'EXISTS';
            nav.mediaDevices!.getUserMedia = async (constraints: MediaStreamConstraints) => {
                w.__diagGetUserMediaCalled = true;
                w.__diagGetUserMediaConstraints = JSON.stringify(constraints);
                try {
                    const stream = await orig(constraints);
                    w.__diagGetUserMediaResult = `OK: ${stream.getTracks().length} tracks, audio=${stream.getAudioTracks().length}, video=${stream.getVideoTracks().length}`;
                    return stream;
                } catch (e: unknown) {
                    const err = e as { name?: string; message?: string };
                    w.__diagGetUserMediaResult = `ERROR: ${err?.name || 'unknown'}: ${err?.message || ''}`;
                    throw e;
                }
            };
        });
        // 重新加载让 init script 生效
        await page.reload();
        await page.waitForURL('**/nana/capture', { timeout: 10_000 });
        await expect(page.getByRole('button', { name: '说说看' })).toBeVisible({ timeout: 5_000 });

        // 检查 MediaRecorder 是否存在
        const mrStatus = await page.evaluate(() => {
            const w = window as unknown as Record<string, unknown>;
            const W = window as unknown as {
                MediaRecorder?: { isTypeSupported?: (m: string) => boolean };
            };
            return {
                mediaRecorderExists: typeof W.MediaRecorder !== 'undefined',
                mrIsTypeSupportedWebm: W.MediaRecorder?.isTypeSupported
                    ? W.MediaRecorder.isTypeSupported('audio/webm')
                    : null,
                diagGumHook: w.__diagGetUserMedia,
                chromeVersion: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown',
                isHeadless: /HeadlessChrome/.test(navigator.userAgent),
            };
        });

        // 点击"说说看"触发 getUserMedia
        await page.getByRole('button', { name: '说说看' }).click();

        // 等 5 秒让 getUserMedia 完成（成功或失败）
        await page.waitForTimeout(5000);

        // 采集页面状态
        const pageState = await page.evaluate(() => {
            const w = window as unknown as Record<string, unknown>;
            const buttons = Array.from(document.querySelectorAll('button')).map((b) => ({
                text: b.textContent?.trim().slice(0, 50),
                ariaLabel: b.getAttribute('aria-label'),
                disabled: b.disabled,
            }));
            const bodyText = document.body.textContent?.slice(0, 500);
            return {
                buttons,
                bodyText,
                diagGumCalled: w.__diagGetUserMediaCalled,
                diagGumResult: w.__diagGetUserMediaResult,
                diagGumConstraints: w.__diagGetUserMediaConstraints,
            };
        });

        // 截图
        await page.screenshot({
            path: 'test-results/diag-audio-after-click.png',
            fullPage: true,
        });

        // 输出诊断结果到 CI 日志（用 console.log + test.info.attach）
        console.log('=== DIAG AUDIO RESULT ===');
        console.log('MediaRecorder status:', JSON.stringify(mrStatus, null, 2));
        console.log('Page state after click:', JSON.stringify(pageState, null, 2));
        console.log('Console messages count:', consoleMessages.length);
        console.log('Page errors:', JSON.stringify(pageErrors, null, 2));
        const relevantConsole = consoleMessages.filter(
            (m) => /audio|media|recorder|microphone|permission|gum|track/i.test(m.text),
        );
        console.log('Relevant console messages:', JSON.stringify(relevantConsole, null, 2));
        console.log('=== END DIAG ===');

        // 附加到测试报告
        test.info().attach('diag-audio-result.json', {
            body: JSON.stringify({
                mediaRecorder: mrStatus,
                pageState,
                pageErrors,
                relevantConsole,
                allConsoleCount: consoleMessages.length,
            }, null, 2),
            contentType: 'application/json',
        });

        // 这个 spec 不做断言（诊断目的）
        expect(true).toBe(true);
    });
});
