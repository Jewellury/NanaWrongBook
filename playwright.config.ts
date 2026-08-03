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
            // CI 修复（2026-07-27）：统一用 next dev（开发模式）
            // 原因：next.config.ts 配了 output:'standalone'，`next start` 会警告且行为异常
            // （case-analyzer 读不到 env），standalone server.js 需要手动复制静态资源+
            // schema+prisma client+修 CWD，打地鼠式调试已 7 次失败。
            // next dev 不做构建时优化，process.env 运行时读取，行为最可预测。
            // CI 上已先 build（Build application step）满足编译检查门禁，webServer 用 dev 跑测试。
            // 慢一些（dev 模式 on-the-fly 编译），但 CI 容忍慢，稳定性优先。
            command: `echo "[webServer diag] VOLCENGINE_BASE_URL=${process.env.VOLCENGINE_BASE_URL || '(unset)'} VOLCENGINE_API_KEY=${process.env.VOLCENGINE_API_KEY ? '(set)' : '(unset)'} LITE_ENDPOINT_ID=${process.env.LITE_ENDPOINT_ID || '(unset)'}" && npx next dev -p ${E2E_PORT}`,
            url: E2E_HOST,
            reuseExistingServer: !process.env.CI,
            timeout: 180 * 1000, // dev 模式首屏编译慢，给 3 分钟
            // [DEBUG CI 2026-07-28 阶段A 任务A2] 显式声明 stdout/stderr 透传
            // Playwright 1.57 默认即 'pipe'，显式写出排除默认值不确定性 + 文档化诊断意图
            // 若显式 pipe 后仍看不到 next dev stderr，说明问题在 Next.js 框架层（不走 stderr）
            // 届时靠 route.ts 的 fs.appendFileSync 兜底（任务 A1）
            stdout: 'pipe',
            stderr: 'pipe',
            // r3.1 任务 2.9 CI 修复（2026-07-27）：
            // 显式注入 fake provider env 给 Next.js 子进程（双保险）
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
