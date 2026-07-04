/**
 * 生产 Smoke Test（只读版 v1）
 *
 * 降阶版第一轮：只验证关键页面可达，不产生任何写操作。
 * 后续 DELETE API 审计通过后，再加上传+保存+清理。
 *
 * 凭证从环境变量读取（GitHub Secrets 或 .env.e2e.local），不硬编码。
 *
 * 运行：E2E_MODE=smoke npx playwright test --project=smoke
 */
import { test, expect } from '@playwright/test';

// ─── 凭证读取（不硬编码） ──────────────────────────────
const SMOKE_EMAIL = process.env.E2E_SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.E2E_SMOKE_PASSWORD;

test.skip(!SMOKE_EMAIL || !SMOKE_PASSWORD,
  '缺少 E2E_SMOKE_EMAIL 或 E2E_SMOKE_PASSWORD（配置在 GitHub Secrets 或 .env.e2e.local）'
);

test.describe('生产 Smoke（只读 v1）', () => {
  test('登录→/nana→三入口→知识地图', async ({ page }) => {
    test.setTimeout(60000);

    // ─── 1. 登录 ────────────────────────────────────
    await page.goto('/login');
    await expect(page.locator('body')).toContainText(/登录|Login/, { timeout: 15000 });

    await page.locator('input[name="email"]').fill(SMOKE_EMAIL!);
    await page.locator('input[name="password"]').fill(SMOKE_PASSWORD!);
    await page.locator('button[type="submit"]').click();

    // 验证：登录后直跳 /nana
    await page.waitForURL('**/nana', { timeout: 15000 });

    // ─── 2. 首页三入口可见 ────────────────────────────
    await expect(page.getByText('拍一道题')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('看看知识地图')).toBeVisible();
    await expect(page.getByText('周末小检查')).toBeVisible();

    // ─── 3. 知识地图可打开 ─────────────────────────────
    await page.getByText('看看知识地图').click();
    await page.waitForURL('**/nana/knowledge-map', { timeout: 10000 });

    // 验证知识地图加载完成
    await expect(page.getByRole('heading', { name: '我的知识地图' })).toBeVisible({ timeout: 15000 });
  });
});
