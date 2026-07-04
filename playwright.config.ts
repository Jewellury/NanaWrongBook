import { defineConfig, devices } from '@playwright/test';

// Smoke 模式：测试生产环境，不启动本地 server
const isSmoke = process.env.E2E_MODE === 'smoke';

// 本地端口：3000 常被占用，E2E 用 3025 避免冲突（CI 中仍用 3000）
const E2E_PORT = process.env.CI ? 3000 : 3025;
const E2E_HOST = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html', { host: '0.0.0.0' }]],
    use: {
        baseURL: isSmoke
            ? (process.env.E2E_BASE_URL ?? 'https://nana.nanatop.xyz')
            : E2E_HOST,
        trace: 'on-first-retry',
    },
    // Smoke 模式不启动本地 server（测试生产环境）
    ...(isSmoke ? {} : {
        webServer: {
            command: process.env.CI ? 'npm run start' : `npx next dev -p ${E2E_PORT}`,
            url: E2E_HOST,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
        },
    }),
    projects: isSmoke ? [
        // ─── Smoke（生产环境，只读） ───────────────
        {
            name: 'smoke',
            testDir: './e2e/smoke',
            use: { ...devices['Pixel 7'] },
            retries: 0, // 生产环境不重试，失败即告警
        },
    ] : [
        // ─── 上游已有：桌面 Chrome ──────────────────
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            // 排除 nana 移动端和 smoke 目录，避免重复跑
            testIgnore: ['**/ci/**', '**/smoke/**'],
        },
        // ─── 新增：移动端 Chrome（nana CI E2E）─────
        {
            name: 'mobile-chrome',
            testDir: './e2e/ci',
            use: { ...devices['Pixel 7'] },
        },
    ],
});
