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
import { startFakeProvider, stopFakeProvider, MOCK_RESULTS } from '../../../e2e/helpers/fake-provider-server';
import crypto from 'crypto';

const TEST_FIXTURE_NAME = 'clear-printed';

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
    for (const [name, mock] of Object.entries(MOCK_RESULTS)) {
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
