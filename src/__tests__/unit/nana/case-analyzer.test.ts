/**
 * case-analyzer lib · 单元测试
 *
 * mock OpenAI SDK 验证一体化 Case Analyzer 逻辑：
 * 1. 成功：正常 JSON → 7 字段解析 + audioStatus = "success"
 * 2. JSON 格式错误：模型返回非法 JSON → throw CaseAnalyzerParseError
 * 3. 清单外 ID：topicId/nodeId 不在白名单 → 过滤掉
 * 4. 低置信候选：confidence < 0.5 → 仍保留（过滤只按白名单，不按置信度）
 * 5. 无音频：未提供 audioBase64 → audioStatus = "skipped"
 * 6. webm/mp4 skipped：不支持格式 → audioStatus = "skipped"
 * 7. 超时：AbortError → throw CaseAnalyzerTimeoutError
 * 8. 失败：API 4xx/5xx → throw CaseAnalyzerError
 *
 * 此外验证：
 * - markdown 代码块包裹的 JSON 能正确提取
 * - Zod 校验缺字段时拒绝
 * - deriveAudioStatus 辅助函数各状态推导
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── mock OpenAI 构造函数和 create 方法 ──────────────
const { mockChatCompletionsCreate } = vi.hoisted(() => ({
  mockChatCompletionsCreate: vi.fn(),
}));

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockChatCompletionsCreate,
        },
      };
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  analyzeCase,
  deriveAudioStatus,
  CaseAnalyzerError,
  CaseAnalyzerTimeoutError,
  CaseAnalyzerParseError,
  type CaseAnalyzerInput,
} from '@/lib/nana/case-analyzer';

// ─── 测试数据 ──────────────────────────────────────────

const MOCK_NODES = [
  { id: 'M1-04', name: '集合的概念' },
  { id: 'M1-05', name: '集合的表示' },
  { id: 'M2a-13', name: '函数单调性' },
];

const MOCK_TOPICS = [
  { id: 'TB-001', name: '集合的概念', chapter: '第一章 集合与常用逻辑用语', section: '1.1 集合的概念' },
  { id: 'TB-010', name: '函数的基本性质', chapter: '第三章 函数的概念与性质', section: '3.2 函数的基本性质' },
];

const MOCK_IMAGE_URL = 'data:image/png;base64,iVBORw0KGgo=';

const VALID_JSON_RESPONSE = {
  transcript: '这道题考的是函数单调性',
  questionSummary: '判断 f(x)=x²-2x 的单调区间',
  textbookTopicCandidates: [
    { topicId: 'TB-010', confidence: 0.85, reason: '题目涉及函数单调性判断' },
  ],
  knowledgeNodeCandidates: [
    { nodeId: 'M2a-13', confidence: 0.85, reason: '题目涉及用定义判断单调性' },
  ],
  initialFeedback: '你很仔细地分析了这个函数',
  possibleMistakeReason: '可能在求导时符号出了差错',
  nextActionSuggestion: '回看 3.2 函数的基本性质，重点检查单调性判断步骤',
};

function mockSuccessResponse(data: unknown, usage?: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(data) } }],
    usage: usage || { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

function makeInput(overrides?: Partial<CaseAnalyzerInput>): CaseAnalyzerInput {
  return {
    imageDataUrl: MOCK_IMAGE_URL,
    nodes: MOCK_NODES,
    textbookTopics: MOCK_TOPICS,
    ...overrides,
  };
}

// ─── 环境变量设置 ──────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VOLCENGINE_API_KEY = 'test-key';
  process.env.VOLCENGINE_BASE_URL = 'https://test.example.com/api/v3';
  process.env.LITE_MODEL_NAME = 'test-lite-model';
  process.env.CASE_ANALYZER_TIMEOUT_MS = '5000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. 成功 ────────────────────────────────────────────

describe('analyzeCase: 成功', () => {
  test('正常 JSON + 支持格式音频 → 7 字段解析 + audioStatus = "success"', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    const result = await analyzeCase(
      makeInput({ audioBase64: 'dGVzdA==', audioFormat: 'audio/wav' }),
    );

    expect(result.transcript).toBe('这道题考的是函数单调性');
    expect(result.questionSummary).toBe('判断 f(x)=x²-2x 的单调区间');
    expect(result.textbookTopicCandidates).toHaveLength(1);
    expect(result.textbookTopicCandidates[0].topicId).toBe('TB-010');
    expect(result.knowledgeNodeCandidates).toHaveLength(1);
    expect(result.knowledgeNodeCandidates[0].nodeId).toBe('M2a-13');
    expect(result.initialFeedback).toBe('你很仔细地分析了这个函数');
    expect(result.possibleMistakeReason).toBe('可能在求导时符号出了差错');
    expect(result.nextActionSuggestion).toBe('回看 3.2 函数的基本性质，重点检查单调性判断步骤');
    expect(result.audioStatus).toBe('success');
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
  });

  test('markdown 代码块包裹的 JSON → 正确提取', async () => {
    const wrappedContent = '```json\n' + JSON.stringify(VALID_JSON_RESPONSE) + '\n```';
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: wrappedContent } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });

    const result = await analyzeCase(makeInput());
    expect(result.questionSummary).toBe('判断 f(x)=x²-2x 的单调区间');
    expect(result.audioStatus).toBe('skipped');
  });

  test('空候选数组 → 合法返回', async () => {
    const emptyCandidates = {
      ...VALID_JSON_RESPONSE,
      textbookTopicCandidates: [],
      knowledgeNodeCandidates: [],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(emptyCandidates));

    const result = await analyzeCase(makeInput());
    expect(result.textbookTopicCandidates).toHaveLength(0);
    expect(result.knowledgeNodeCandidates).toHaveLength(0);
  });
});

// ─── 2. JSON 格式错误 ────────────────────────────────────

describe('analyzeCase: JSON 格式错误', () => {
  test('非 JSON 字符串 → throw CaseAnalyzerParseError', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '这不是JSON' } }],
      usage: null,
    });

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerParseError);
  });

  test('JSON 缺少必需字段 → throw CaseAnalyzerParseError', async () => {
    const missingField = { transcript: '', questionSummary: 'test' };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(missingField));

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerParseError);
  });

  test('空返回 → throw CaseAnalyzerParseError', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
      usage: null,
    });

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerParseError);
  });

  test('confidence 超出 0-1 → throw CaseAnalyzerParseError', async () => {
    const badConfidence = {
      ...VALID_JSON_RESPONSE,
      textbookTopicCandidates: [
        { topicId: 'TB-010', confidence: 1.5, reason: '超范围' },
      ],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(badConfidence));

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerParseError);
  });
});

// ─── 3. 清单外 ID 过滤 ──────────────────────────────────

describe('analyzeCase: 清单外 ID 过滤', () => {
  test('清单外 topicId → 过滤掉，保留清单内的', async () => {
    const withInvalidTopic = {
      ...VALID_JSON_RESPONSE,
      textbookTopicCandidates: [
        { topicId: 'TB-010', confidence: 0.85, reason: '合法' },
        { topicId: 'TB-999', confidence: 0.7, reason: '清单外' },
      ],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(withInvalidTopic));

    const result = await analyzeCase(makeInput());
    expect(result.textbookTopicCandidates).toHaveLength(1);
    expect(result.textbookTopicCandidates[0].topicId).toBe('TB-010');
  });

  test('清单外 nodeId → 过滤掉，保留清单内的', async () => {
    const withInvalidNode = {
      ...VALID_JSON_RESPONSE,
      knowledgeNodeCandidates: [
        { nodeId: 'M2a-13', confidence: 0.85, reason: '合法' },
        { nodeId: 'FAKE-01', confidence: 0.6, reason: '清单外' },
      ],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(withInvalidNode));

    const result = await analyzeCase(makeInput());
    expect(result.knowledgeNodeCandidates).toHaveLength(1);
    expect(result.knowledgeNodeCandidates[0].nodeId).toBe('M2a-13');
  });

  test('全部清单外 → 空数组', async () => {
    const allInvalid = {
      ...VALID_JSON_RESPONSE,
      textbookTopicCandidates: [
        { topicId: 'TB-XXX', confidence: 0.8, reason: '清单外' },
      ],
      knowledgeNodeCandidates: [
        { nodeId: 'FAKE-01', confidence: 0.8, reason: '清单外' },
      ],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(allInvalid));

    const result = await analyzeCase(makeInput());
    expect(result.textbookTopicCandidates).toHaveLength(0);
    expect(result.knowledgeNodeCandidates).toHaveLength(0);
  });
});

// ─── 4. 低置信候选 ──────────────────────────────────────

describe('analyzeCase: 低置信候选', () => {
  test('confidence < 0.5 → 仍保留（过滤只按白名单，不按置信度）', async () => {
    const lowConfidence = {
      ...VALID_JSON_RESPONSE,
      textbookTopicCandidates: [
        { topicId: 'TB-010', confidence: 0.2, reason: '低置信但合法' },
      ],
      knowledgeNodeCandidates: [
        { nodeId: 'M2a-13', confidence: 0.1, reason: '低置信但合法' },
      ],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(lowConfidence));

    const result = await analyzeCase(makeInput());
    expect(result.textbookTopicCandidates).toHaveLength(1);
    expect(result.textbookTopicCandidates[0].confidence).toBe(0.2);
    expect(result.knowledgeNodeCandidates).toHaveLength(1);
    expect(result.knowledgeNodeCandidates[0].confidence).toBe(0.1);
  });

  test('confidence = 0 → 保留（边界值）', async () => {
    const zeroConfidence = {
      ...VALID_JSON_RESPONSE,
      textbookTopicCandidates: [
        { topicId: 'TB-010', confidence: 0, reason: '零置信' },
      ],
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(zeroConfidence));

    const result = await analyzeCase(makeInput());
    expect(result.textbookTopicCandidates).toHaveLength(1);
    expect(result.textbookTopicCandidates[0].confidence).toBe(0);
  });
});

// ─── 5. 无音频 ──────────────────────────────────────────

describe('analyzeCase: 无音频', () => {
  test('未提供 audioBase64 → audioStatus = "skipped"', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    const result = await analyzeCase(makeInput());
    expect(result.audioStatus).toBe('skipped');
    expect(result.transcript).toBe('这道题考的是函数单调性');
  });

  test('audioBase64 为空字符串 → audioStatus = "skipped"', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    const result = await analyzeCase(
      makeInput({ audioBase64: '', audioFormat: 'audio/wav' }),
    );
    expect(result.audioStatus).toBe('skipped');
  });
});

// ─── 6. webm/mp4 skipped ────────────────────────────────

describe('analyzeCase: webm/mp4 skipped', () => {
  test('webm 格式 → audioStatus = "skipped"（不发送音频）', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    const result = await analyzeCase(
      makeInput({ audioBase64: 'dGVzdA==', audioFormat: 'audio/webm' }),
    );
    expect(result.audioStatus).toBe('skipped');

    // 验证 API 调用中不包含 input_audio
    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    const audioContent = callArg.messages[0].content.find(
      (c: { type: string }) => c.type === 'input_audio',
    );
    expect(audioContent).toBeUndefined();
  });

  test('mp4 格式 → audioStatus = "skipped"（不发送音频）', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    const result = await analyzeCase(
      makeInput({ audioBase64: 'dGVzdA==', audioFormat: 'audio/mp4' }),
    );
    expect(result.audioStatus).toBe('skipped');
  });
});

// ─── 7. 超时 ────────────────────────────────────────────

describe('analyzeCase: 超时', () => {
  test('AbortError → throw CaseAnalyzerTimeoutError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockChatCompletionsCreate.mockRejectedValueOnce(abortError);

    await expect(
      analyzeCase(makeInput({ audioBase64: 'dGVzdA==', audioFormat: 'audio/wav' })),
    ).rejects.toBeInstanceOf(CaseAnalyzerTimeoutError);
  });
});

// ─── 8. 失败 ────────────────────────────────────────────

describe('analyzeCase: 失败', () => {
  test('API 4xx → throw CaseAnalyzerError', async () => {
    const apiError = Object.assign(new Error('Bad request'), {
      status: 400,
      body: { error: { message: 'Invalid image' } },
    });
    mockChatCompletionsCreate.mockRejectedValueOnce(apiError);

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerError);
  });

  test('API 5xx → throw CaseAnalyzerError', async () => {
    const apiError = Object.assign(new Error('Internal error'), { status: 500 });
    mockChatCompletionsCreate.mockRejectedValueOnce(apiError);

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerError);
  });

  test('网络错误 → throw CaseAnalyzerError', async () => {
    mockChatCompletionsCreate.mockRejectedValueOnce(new Error('Network error'));

    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerError);
  });

  test('未设置 VOLCENGINE_API_KEY → throw CaseAnalyzerError', async () => {
    delete process.env.VOLCENGINE_API_KEY;
    await expect(analyzeCase(makeInput())).rejects.toBeInstanceOf(CaseAnalyzerError);
  });
});

// ─── 输入校验 ──────────────────────────────────────────

describe('analyzeCase: 输入校验', () => {
  test('题图为空 → throw CaseAnalyzerError', async () => {
    await expect(analyzeCase(makeInput({ imageDataUrl: '' }))).rejects.toBeInstanceOf(
      CaseAnalyzerError,
    );
  });

  test('节点列表为空 → throw CaseAnalyzerError', async () => {
    await expect(analyzeCase(makeInput({ nodes: [] }))).rejects.toBeInstanceOf(
      CaseAnalyzerError,
    );
  });

  test('课本章节列表为空 → throw CaseAnalyzerError', async () => {
    await expect(analyzeCase(makeInput({ textbookTopics: [] }))).rejects.toBeInstanceOf(
      CaseAnalyzerError,
    );
  });
});

// ─── API 调用参数验证 ──────────────────────────────────

describe('analyzeCase: API 调用参数', () => {
  test('消息包含 image_url 类型内容', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    await analyzeCase(makeInput());

    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    const imageContent = callArg.messages[0].content.find(
      (c: { type: string }) => c.type === 'image_url',
    );
    expect(imageContent).toBeDefined();
    expect(imageContent.image_url.url).toBe(MOCK_IMAGE_URL);
  });

  test('有音频时消息包含 input_audio 类型内容', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    await analyzeCase(
      makeInput({ audioBase64: 'dGVzdA==', audioFormat: 'audio/wav' }),
    );

    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    const audioContent = callArg.messages[0].content.find(
      (c: { type: string }) => c.type === 'input_audio',
    );
    expect(audioContent).toBeDefined();
    expect(audioContent.input_audio.data).toBe('dGVzdA==');
    expect(audioContent.input_audio.format).toBe('wav');
  });

  test('提示词包含课本章节清单和知识点清单', async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    await analyzeCase(makeInput());

    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    const textContent = callArg.messages[0].content.find(
      (c: { type: string }) => c.type === 'text',
    );
    expect(textContent.text).toContain('TB-001');
    expect(textContent.text).toContain('TB-010');
    expect(textContent.text).toContain('M1-04');
    expect(textContent.text).toContain('M2a-13');
  });

  test('调用模型来自 Lite env（LITE_MODEL_NAME），不使用 Pro', async () => {
    // 同时设置 LITE 和 PRO env，验证实际使用的是 LITE
    process.env.LITE_MODEL_NAME = 'lite-model-assert';
    process.env.PRO_MODEL_NAME = 'pro-model-should-not-be-used';
    mockChatCompletionsCreate.mockResolvedValueOnce(mockSuccessResponse(VALID_JSON_RESPONSE));

    await analyzeCase(makeInput());

    const callArg = mockChatCompletionsCreate.mock.calls[0][0];
    expect(callArg.model).toBe('lite-model-assert');
    expect(callArg.model).not.toBe('pro-model-should-not-be-used');
  });
});

// ─── deriveAudioStatus 辅助函数 ────────────────────────

describe('deriveAudioStatus', () => {
  test('未提供音频 → "skipped"', () => {
    expect(deriveAudioStatus(false, false)).toBe('skipped');
  });

  test('格式不支持 → "skipped"', () => {
    expect(deriveAudioStatus(true, false)).toBe('skipped');
  });

  test('无错误 → "success"', () => {
    expect(deriveAudioStatus(true, true)).toBe('success');
  });

  test('CaseAnalyzerTimeoutError → "timeout"', () => {
    const err = new CaseAnalyzerTimeoutError();
    expect(deriveAudioStatus(true, true, err)).toBe('timeout');
  });

  test('其他错误 → "failed"', () => {
    const err = new CaseAnalyzerError('test');
    expect(deriveAudioStatus(true, true, err)).toBe('failed');
  });

  test('普通 Error → "failed"', () => {
    const err = new Error('network');
    expect(deriveAudioStatus(true, true, err)).toBe('failed');
  });
});
