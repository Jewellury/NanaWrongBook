/**
 * Nana 主链路 E2E（CI 移动端）
 *
 * 降阶版第一轮：1 条主链路覆盖核心路径。
 * 后续稳定后再加 handwriting/tilted fixture 和挂知识点流程。
 *
 * 主链路：
 *   注册/登录 → /nana → 三入口可见 → 拍题页上传 fixture
 *   → 保存 case → 知识地图 → 最近题浮层 → 题图详情可见
 *
 * 运行：npx playwright test --project=mobile-chrome
 */
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Nana 主链路（移动端）', () => {
  test('登录→拍题→保存→知识地图→最近题→题图详情', async ({ page }) => {
    test.setTimeout(90000);

    // ─── 1. 注册临时用户 ──────────────────────────────
    const user = {
      name: `e2e_${Date.now()}`,
      email: `e2e_${Date.now()}@test.local`,
      password: '123456',
      stage: 'senior_high',
      year: '2024',
    };

    await page.goto('/register');
    await expect(page.locator('body')).toContainText(/注册|Register/, { timeout: 15000 });

    await page.locator('input[name="name"]').fill(user.name);
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator('input[name="confirmPassword"]').fill(user.password);
    await page.locator('select[name="educationStage"]').selectOption(user.stage);
    await page.locator('input[name="enrollmentYear"]').fill(user.year);

    // 注册成功后 register/page.tsx 会弹 alert，用 once 仅处理这一次，
    // 避免吞掉后续流程中可能出现的意外 dialog
    page.once('dialog', (d) => d.accept());
    await page.locator('button[type="submit"]').click();

    // 注册成功跳 login，失败（已存在）也跳 login
    try {
      await page.waitForURL('**/login', { timeout: 5000 });
    } catch {
      // 可能已经在 login 或其他状态，强制跳转
      await page.goto('/login');
    }

    // ─── 2. 登录 ────────────────────────────────────
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator('button[type="submit"]').click();

    // 验证：登录后直跳 /nana
    await page.waitForURL('**/nana', { timeout: 10000 });

    // ─── 3. 首页三入口可见 ────────────────────────────
    await expect(page.getByText('拍一道题')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('看看知识地图')).toBeVisible();
    await expect(page.getByText('周末小检查')).toBeVisible();

    // ─── 4. 进入拍题页 ────────────────────────────────
    await page.getByText('拍一道题').click();
    await page.waitForURL('**/nana/capture', { timeout: 5000 });

    // 验证拍题页空状态——"点这里拍照，或从相册选"是上传区空状态独有文案
    // （页面上有两处"先拍一下这道题"：上传按钮 aria-label + 底部禁用保存按钮文案，
    //  用副标题唯一定位避免 strict mode 歧义）
    await expect(page.getByText('点这里拍照，或从相册选')).toBeVisible({ timeout: 5000 });

    // ─── 5. 上传 fixture 图片 ──────────────────────────
    // 直接对隐藏的 input[type="file"] 设值（Playwright 最佳实践，无需先点击按钮）
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/nana/cases/clear-printed.jpg');
    await page.setInputFiles('input[type="file"]', fixturePath);

    // 验证图片预览出现
    await expect(page.getByRole('img', { name: '刚拍的题图' })).toBeVisible({ timeout: 10000 });

    // ─── 6. 保存 case ────────────────────────────────
    await page.getByRole('button', { name: '收好这道题' }).click();

    // 验证成功提示
    await expect(page.getByText('已收好')).toBeVisible({ timeout: 15000 });

    // ─── 7. 进入知识地图 ───────────────────────────────
    // 点击浮动卡上的"去知识地图看看"
    await page.getByRole('link', { name: '去知识地图看看' }).click();
    await page.waitForURL('**/nana/knowledge-map', { timeout: 10000 });

    // 验证知识地图加载完成
    await expect(page.getByRole('heading', { name: '我的知识地图' })).toBeVisible({ timeout: 10000 });

    // ─── 8. 打开最近题浮层 ─────────────────────────────
    // 用 ?openCases=1 直接跳转确保浮层展开
    await page.goto('/nana/knowledge-map?openCases=1');

    // 等待地图重新加载
    await expect(page.getByRole('heading', { name: '我的知识地图' })).toBeVisible({ timeout: 10000 });

    // 验证最近题浮层出现——抽屉标题
    // "最近拍过的题"在页面上多处出现（空状态按钮 + 抽屉标题 h2 + 列表标题 h2），
    // 用 heading 角色排除按钮，.first() 定位抽屉标题（DOM 中最先出现）
    await expect(page.getByRole('heading', { name: '最近拍过的题' }).first()).toBeVisible({ timeout: 10000 });

    // ─── 9. 题图详情可见 ───────────────────────────────
    // 点击第一个 case 卡片（按钮内含日期文本如"7月4日"）
    const caseCard = page.locator('button').filter({ hasText: /\d+月\d+日/ }).first();
    await expect(caseCard).toBeVisible({ timeout: 5000 });
    await caseCard.click();

    // 验证详情面板加载——题图 alt="这道题的原图"
    await expect(page.getByAltText('这道题的原图')).toBeVisible({ timeout: 15000 });
  });
});
