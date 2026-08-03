/**
 * fake-provider-server 单元测试
 *
 * TDD 红→绿流程：先写测试，确认实现不存在时全红，再实现至全绿。
 *
 * 验证范围（对应 r3.1 任务 2.1）：
 * 1. 未注册哈希显式 500 + UNREGISTERED_HASH（禁止 fallback）
 * 2. 注册哈希后 /chat/completions 返回 OpenAI 兼容响应（choices[0].message.content = JSON.stringify(7字段)）
 * 3. delayMs 延迟生效（S7 竞态测试依赖）
 * 4. 响应结构严格匹配 case-analyzer.ts Zod schema 期望
 *
 * 运行：DATABASE_URL="file:./data/test/test.db" npm.cmd run test -- src/__tests__/e2e-helpers/fake-provider-server.test.ts --run
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { Server } from 'http';
import { spawn, type ChildProcess } from 'child_process';
import { startFakeProvider, stopFakeProvider, MOCK_RESULTS } from '../../../e2e/helpers/fake-provider-server';
import crypto from 'crypto';

const TEST_FIXTURE_NAME = 'clear-printed';

// 测试辅助：返回 status + 已 parse 的 body（JSON 结构异构，用 any 比 unknown 更实用，避免大量 cast）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postJson(url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

/** 构造与 case-analyzer.ts 一致的 OpenAI chat completions 请求体 */
function buildChatRequest(imageDataUrl: string) {
  return {
    model: 'fake-model',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'system prompt' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: 2048,
  };
}

describe('fake-provider-server', () => {
  let server: Server | null = null;
  let baseUrl = '';

  afterEach(async () => {
    if (server) {
      await stopFakeProvider(server);
      server = null;
    }
  });

  it('启动后监听动态端口（避免 CI 端口冲突）', async () => {
    const started = await startFakeProvider(0); // 0 = 随机端口
    server = started.server;
    expect(started.port).toBeGreaterThan(0);
    baseUrl = `http://127.0.0.1:${started.port}`;
  });

  it('未注册哈希 /chat/completions 返回 500 + UNREGISTERED_HASH（禁止 fallback）', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const dataUrl = 'data:image/jpeg;base64,UNREGISTERED_CONTENT';
    const res = await postJson(`${baseUrl}/chat/completions`, buildChatRequest(dataUrl));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('UNREGISTERED_HASH');
    expect(res.body.hash).toBeTruthy();
    expect(res.body.message).toContain('未注册');
  });

  it('注册哈希后返回 200 + ok + hash（动态注册端点）', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const dataUrl = 'data:image/jpeg;base64,REGISTERED_CONTENT';
    const expectedHash = crypto.createHash('sha256').update(dataUrl).digest('hex');

    const res = await postJson(`${baseUrl}/__test/register`, {
      dataUrl,
      fixtureName: TEST_FIXTURE_NAME,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.hash).toBe(expectedHash);
  });

  it('已注册哈希 /chat/completions 返回 OpenAI 兼容响应（choices[0].message.content = 7字段 JSON 字符串）', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const dataUrl = 'data:image/jpeg;base64,HAPPY_PATH_IMAGE';
    await postJson(`${baseUrl}/__test/register`, {
      dataUrl,
      fixtureName: TEST_FIXTURE_NAME,
    });

    const res = await postJson(`${baseUrl}/chat/completions`, buildChatRequest(dataUrl));

    expect(res.status).toBe(200);
    expect(res.body.object).toBe('chat.completion');
    expect(res.body.choices).toHaveLength(1);
    expect(res.body.choices[0].message.role).toBe('assistant');
    expect(res.body.choices[0].finish_reason).toBe('stop');
    expect(res.body.usage).toBeTruthy();

    // content 必须是 JSON 字符串（case-analyzer.ts 用 JSON.parse 解析）
    const contentStr = res.body.choices[0].message.content;
    expect(typeof contentStr).toBe('string');
    const parsed = JSON.parse(contentStr);

    // 7 字段完整（对应 case-analyzer.ts Zod schema）
    const expected = MOCK_RESULTS[TEST_FIXTURE_NAME];
    expect(parsed.transcript).toBe(expected.transcript);
    expect(parsed.questionSummary).toBe(expected.questionSummary);
    expect(parsed.textbookTopicCandidates).toEqual(expected.textbookTopicCandidates);
    expect(parsed.knowledgeNodeCandidates).toEqual(expected.knowledgeNodeCandidates);
    expect(parsed.initialFeedback).toBe(expected.initialFeedback);
    expect(parsed.possibleMistakeReason).toBe(expected.possibleMistakeReason);
    expect(parsed.nextActionSuggestion).toBe(expected.nextActionSuggestion);
  });

  it('delayMs 延迟生效（S7 竞态测试依赖）', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const dataUrl = 'data:image/jpeg;base64,DELAYED_IMAGE';
    await postJson(`${baseUrl}/__test/register`, {
      dataUrl,
      fixtureName: TEST_FIXTURE_NAME,
      delayMs: 300,
    });

    const start = Date.now();
    const res = await postJson(`${baseUrl}/chat/completions`, buildChatRequest(dataUrl));
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // 至少 300ms（允许 +200ms 网络和处理抖动；不断言上限避免 CI 慢机误报）
    expect(elapsed).toBeGreaterThanOrEqual(290);
  });

  it('未提供 delayMs 时立即响应（默认 <100ms 性能档）', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const dataUrl = 'data:image/jpeg;base64,FAST_IMAGE';
    await postJson(`${baseUrl}/__test/register`, {
      dataUrl,
      fixtureName: TEST_FIXTURE_NAME,
    });

    const start = Date.now();
    const res = await postJson(`${baseUrl}/chat/completions`, buildChatRequest(dataUrl));
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // 默认无延迟，应快速返回；不断言硬上限避免 CI 慢机误报
    expect(elapsed).toBeLessThan(1000);
  });

  it('MOCK_RESULTS 包含 6 个 fixture（r3.1 素材组 A+B）', () => {
    expect(Object.keys(MOCK_RESULTS).sort()).toEqual([
      'clear-printed',
      'function-graph',
      'inequality',
      'set-theory',
      'tilted-partial',
      'with-handwriting',
    ]);
  });

  it('每个 mock 都包含 7 字段（Zod schema 校验通过）', () => {
    for (const mock of Object.values(MOCK_RESULTS)) {
      expect(mock.transcript).toBeDefined();
      expect(mock.questionSummary).toBeDefined();
      expect(Array.isArray(mock.textbookTopicCandidates)).toBe(true);
      expect(Array.isArray(mock.knowledgeNodeCandidates)).toBe(true);
      expect(mock.initialFeedback).toBeDefined();
      expect(mock.possibleMistakeReason).toBeDefined();
      expect(mock.nextActionSuggestion).toBeDefined();
    }
  });

  it('tilted-partial mock 验证 CL-08 降级路径（空候选 + 空 possibleMistakeReason）', () => {
    const mock = MOCK_RESULTS['tilted-partial'];
    expect(mock.textbookTopicCandidates).toEqual([]);
    expect(mock.knowledgeNodeCandidates).toEqual([]);
    expect(mock.possibleMistakeReason).toBe('');
  });

  it('未知路径返回 404', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const res = await fetch(`${baseUrl}/unknown-path`);
    expect(res.status).toBe(404);
  });

  it('GET /chat/completions 返回 404（只接受 POST）', async () => {
    const started = await startFakeProvider(0);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;

    const res = await fetch(`${baseUrl}/chat/completions`);
    expect(res.status).toBe(404);
  });
});

/**
 * 独立脚本启动烟雾测试（任务 E 补强，2026-07-27）
 *
 * 背景：PR #3 CI 实测 `npx tsx -e "import(...)"` 模式下报 `m.startFakeProvider is not a function`，
 *      源码 e2e/helpers/fake-provider-server.ts:212 确实 export 了该函数——tsx `-e` 模式对 `.ts` 文件
 *      dynamic import 行为不稳定。换独立脚本 scripts/start-fake-provider.ts 后正常文件加载路径稳定。
 *
 * 本测试用 child_process.spawn 启动真实的 `npx tsx scripts/start-fake-provider.ts` 子进程，
 * 验证独立启动路径在重构后始终可用。CI 启动方式（nohup + 后台）由 e2e-test job 实测覆盖，
 * 此处单测聚焦"独立脚本能起、能响应、能优雅退出"。
 *
 * 关联：doc/plan/nana-test-framework-ci-fix-plan.md §2 任务 E
 */
describe('独立脚本启动烟雾测试（防御 PR #3 tsx -e bug 重现）', () => {
  // Win32 上 npx 是 .cmd 文件，需要用 npx.cmd 显式指定
  // Linux/CI 上 npx 是普通可执行文件
  const NPM_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // 端口 3998 避开 CI 用的 3999 和 startFakeProvider(0) 动态分配范围
  const SMOKE_PORT = 3998;
  let child: ChildProcess | null = null;

  afterEach(async () => {
    if (child && !child.killed) {
      child.kill('SIGTERM');
      // 给 3s 让进程优雅退出，超时强杀兜底（避免残留进程占用端口）
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try { child?.kill('SIGKILL'); } catch { /* already exited */ }
          resolve();
        }, 3000);
        child?.once('exit', () => { clearTimeout(t); resolve(); });
      });
      child = null;
    }
  });

  /**
   * 轮询 URL 直到拿到预期 status 或超时。
   * tsx 首次编译 + server.listen 在 Windows/CI 上可能要 5-10s。
   */
  async function pollUntilReady(url: string, expectedStatus: number, timeoutMs = 20000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.status === expectedStatus) return true;
      } catch {
        // server 还没起来，继续轮询
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  function spawnProvider(port: number): ChildProcess {
    return spawn(
      NPM_CMD,
      ['tsx', 'scripts/start-fake-provider.ts'],
      {
        env: { ...process.env, FAKE_PROVIDER_PORT: String(port), VOLCENGINE_API_KEY: 'fake' },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Windows 上 npx 是 npx.cmd（batch 文件），Node.js spawn 不加 shell:true 会抛 EINVAL
        // Linux/CI 上 npx 是普通可执行文件，shell:false 更安全（避免参数转义问题）
        shell: process.platform === 'win32',
      },
    );
  }

  it('独立脚本启动后端口响应 HTTP 404（CI 启动路径验证）', async () => {
    child = spawnProvider(SMOKE_PORT);

    // 等 stdout 输出 listening 日志（与脚本 main() 内 console.log 对应）
    const stdoutChunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

    const ready = await pollUntilReady(`http://127.0.0.1:${SMOKE_PORT}/`, 404);
    expect(ready).toBe(true);

    const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
    expect(stdout).toContain(`listening on ${SMOKE_PORT}`);
  }, 25000);

  it('独立脚本启动后 /__test/register 端到端响应 400 MISSING_DATA_URL（端到端走通验证）', async () => {
    child = spawnProvider(SMOKE_PORT);
    const ready = await pollUntilReady(`http://127.0.0.1:${SMOKE_PORT}/`, 404);
    expect(ready).toBe(true);

    // 空 body 触发 sendJson(res, 400, { error: 'MISSING_DATA_URL' })
    const res = await postJson(`http://127.0.0.1:${SMOKE_PORT}/__test/register`, {});
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('MISSING_DATA_URL');
  }, 25000);

  // Windows 上 child.kill('SIGTERM') 等同 TerminateProcess，不会触发 node 的 signal handler
  // 该测试仅在非 win32 平台（含 Linux CI）验证 SIGTERM 优雅退出路径
  it.skipIf(process.platform === 'win32')(
    '收到 SIGTERM 优雅退出（CI Stop step 行为验证）',
    async () => {
      child = spawnProvider(SMOKE_PORT);
      const ready = await pollUntilReady(`http://127.0.0.1:${SMOKE_PORT}/`, 404);
      expect(ready).toBe(true);

      const stdoutChunks: Buffer[] = [];
      child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

      // 发 SIGTERM，等脚本里的 shutdown handler 调 process.exit(0)
      const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        child!.once('exit', (code, signal) => resolve({ code, signal }));
      });
      child.kill('SIGTERM');
      const result = await Promise.race([
        exitPromise,
        new Promise<{ code: number | null; signal: string | null }>((resolve) =>
          setTimeout(() => resolve({ code: -1, signal: 'TIMEOUT' }), 8000),
        ),
      ]);

      expect(result.signal).not.toBe('TIMEOUT');
      // 优雅退出：脚本 shutdown handler 调 process.exit(0)
      expect(result.code).toBe(0);

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      expect(stdout).toContain('received SIGTERM, shutting down...');
      expect(stdout).toContain('fake-provider stopped cleanly');
    },
    30000,
  );
});
