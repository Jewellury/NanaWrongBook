import { defineConfig, devices } from '@playwright/test';
import { getVirtualMicLaunchOptions } from './e2e/helpers/virtual-microphone';

// Smoke 模式：测试生产环境，不启动本地 server
const isSmoke = process.env.E2E_MODE === 'smoke';

// 本地端口：3000 常被占用，E2E 用 3025 避免冲突（CI 中仍用 3000）
const E2E_PORT = process.env.CI ? 3000 : 3025;
const E2E_HOST = `http://127.0.0.1:${E2E_PORT}`;

// 虚拟麦克风 launchOptions（r3.1 任务 2.2）
// Chromium fake-media flags + 静态 WAV 文件
const virtualMicLaunchOptions = getVirtualMicLaunchOptions();

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    // r3.1 任务 1.2：分层证据采集策略
    // - html：默认报告
    // - json：结构化结果供 CI / AI 评审消费
    reporter: [
        ['html', { host: '0.0.0.0' }],
        ['json', { outputFile: 'test-results/report.json' }],
    ],
    use: {
        baseURL: isSmoke
            ? (process.env.E2E_BASE_URL ?? 'https://nana.nanatop.xyz')
            : E2E_HOST,
        // r3.1 任务 1.2：分层证据采集（不全开 on，避免拖慢和堆积）
        // - screenshot 仅失败时自动截图（每步手动截图在 spec 中做）
        // - trace/video retain-on-failure：失败时保留供排查
        // - Provider Smoke / AI 评审 task 在 project 中覆写为 'on'
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        // r3.1 任务 1.2：超时配置
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
    },
    // Smoke 模式不启动本地 server（测试生产环境）
    ...(isSmoke ? {} : {
        webServer: {
            // CI 修复（2026-07-27）：next.config.ts 配置了 output:'standalone'，
            // Next.js 16 在 standalone 模式下 `next start` 不工作（会警告并行为异常，
            // 导致 case-analyzer.ts 读不到 VOLCENGINE_BASE_URL → fallback 真实豆包 API
            // → fake-key 认证失败 → /process 500）。
            // 正确启动方式：node .next/standalone/server.js
            // 但 standalone 不含静态资源，必须先复制 .next/static 和 public
            command: process.env.CI
                ? 'cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public 2>/dev/null; HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js'
                : `npx next dev -p ${E2E_PORT}`,
            url: E2E_HOST,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
            // r3.1 任务 2.9 CI 修复（2026-07-27）：
            // 显式注入 fake provider env 给 Next.js 子进程（双保险）。
            // Playwright webServer.env 与父进程 env 合并（非替换），不影响其他变量。
            env: {
                VOLCENGINE_API_KEY: process.env.VOLCENGINE_API_KEY || '',
                VOLCENGINE_BASE_URL: process.env.VOLCENGINE_BASE_URL || '',
                LITE_ENDPOINT_ID: process.env.LITE_ENDPOINT_ID || '',
            },
        },
    }),
    projects: isSmoke ? [
        // ─── Smoke（生产环境，只读） ─────────────────────────
        // r3.1 任务 1.2：Smoke 单独覆写 video/trace = 'on'（需要完整证据包供 AI 评审）
        {
            name: 'smoke',
            testDir: './e2e/smoke',
            use: {
                ...devices['Pixel 7'],
                video: 'on',
                trace: 'on',
                launchOptions: virtualMicLaunchOptions,
            },
            retries: 0, // 生产环境不重试，失败即告警
        },
    ] : [
        // ─── 上游已有：桌面 Chrome ──────────────────────────
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            // 排除 nana 移动端和 smoke 目录，避免重复跑
            testIgnore: ['**/ci/**', '**/smoke/**'],
        },
        // ─── 新增：移动端 Chrome（nana CI E2E） ─────────────
        // r3.1 任务 2.2：启用虚拟麦克风（Chromium fake-media + 静态 WAV）
        {
            name: 'mobile-chrome',
            testDir: './e2e/ci',
            use: {
                ...devices['Pixel 7'],
                launchOptions: virtualMicLaunchOptions,
            },
        },
    ],
});
