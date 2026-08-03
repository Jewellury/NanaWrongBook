/**
 * Playwright 拦截 createCase 请求 + 动态注册假 Provider 哈希（r3.1 任务 2.1）
 *
 * r3.1 关键修正：不预计算 fixture 文件哈希
 * 前端 processImageFile() 会通过 Canvas 压缩重新编码（maxWidth 1280 / quality 0.7），
 * fixture 原始 data URL ≠ 压缩后 data URL ≠ Provider 收到的 image_url.url
 *
 * 工作流程：
 * 1. 测试调 setupFixtureRegistration(page, fakeProviderUrl, 'clear-printed')
 * 2. Playwright 监听（不伪造）POST /api/nana/cases，从请求体提取 artifacts[].content
 * 3. content 就是经过 processImageFile 压缩后的 data URL，与 case-analyzer.ts
 *    最终发给 Provider 的 image_url.url 完全一致
 * 4. POST /__test/register 把哈希→mock 映射写入假 Provider
 * 5. 之后真实 /process 走真实 route handler → case-analyzer → 假 Provider 命中 mock
 *
 * 关联：spec 文件（任务 2.4）会在 beforeEach 调用此函数。
 */

import type { Page } from '@playwright/test';

interface CaseRequestBody {
  artifacts?: Array<{ type: string; content: string; seq?: number }>;
}

/** 是否为 createCase 请求（POST /api/nana/cases，不带 id 子路径） */
function isCreateCaseRequest(url: string, method: string): boolean {
  if (method !== 'POST') return false;
  // 匹配 /api/nana/cases 结尾或后跟 ?query，排除 /api/nana/cases/:id/process 等
  const u = new URL(url, 'http://placeholder.local');
  return (
    u.pathname.replace(/\/$/, '') === '/api/nana/cases'
  );
}

/**
 * 注册 fixture → 假 Provider 映射。
 *
 * 在 page 上挂监听器，每次匹配 createCase 请求时提取压缩后 data URL 并注册。
 * 返回一个卸载函数，spec 在 afterEach 调用以移除监听器。
 *
 * @param page Playwright Page 实例
 * @param fakeProviderUrl 假 Provider 基地址（如 http://127.0.0.1:3999）
 * @param fixtureName MOCK_RESULTS key（如 'clear-printed'）
 * @param delayMs 可选响应延迟（S7 竞态测试用：2000/500/50ms）
 * @returns dispose() 移除监听器
 */
export function setupFixtureRegistration(
  page: Page,
  fakeProviderUrl: string,
  fixtureName: string,
  delayMs?: number,
): () => void {
  const handler = async (request: { url(): string; method(): string; postData(): string | null }) => {
    if (!isCreateCaseRequest(request.url(), request.method())) return;

    const postData = request.postData();
    if (!postData) return;

    let body: CaseRequestBody;
    try {
      body = JSON.parse(postData) as CaseRequestBody;
    } catch {
      return; // body 不是 JSON，跳过
    }

    const imageArtifact = body.artifacts?.find((a) => a.type === 'question_image');
    if (!imageArtifact || !imageArtifact.content) return;

    // 注册到假 Provider（fire-and-forget 但 await 完成以保证注册成功）
    try {
      const registerUrl = `${fakeProviderUrl.replace(/\/$/, '')}/__test/register`;
      const res = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: imageArtifact.content,
          fixtureName,
          delayMs,
        }),
      });
      if (!res.ok) {
        // 不抛错——让假 Provider 在 /process 时报 500 暴露问题
        // eslint-disable-next-line no-console
        console.warn(
          `[register-fixture] 注册失败: ${res.status} ${await res.text().catch(() => '')}`,
        );
      }
    } catch (err) {
      // 不抛错——同上，让后续 /process 暴露问题
      // eslint-disable-next-line no-console
      console.warn('[register-fixture] 注册异常:', err);
    }
  };

  // Playwright Request 对象签名兼容
  page.on('request', handler as (request: import('@playwright/test').Request) => void);

  return () => {
    try {
      page.off('request', handler as (request: import('@playwright/test').Request) => void);
    } catch {
      // page 已关闭等场景下忽略
    }
  };
}
