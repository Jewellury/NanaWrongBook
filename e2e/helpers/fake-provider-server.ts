/**
 * 本地假豆包 Provider 服务器（r3.1 任务 2.1）
 *
 * 目的：在 CI 中替代真实火山方舟豆包 API，让真实 /process route handler 完整执行，
 *      真实 case-analyzer.ts 调用假 Provider URL，真实 Prisma 事务落库。
 *
 * 设计要点（r3.1 §3 任务 2.1）：
 * - 动态注册方案：测试运行时通过 POST /__test/register 写入 "压缩后 data URL 的 SHA-256 → mock" 映射
 * - 严格模拟 OpenAI chat completions 响应格式
 * - 未注册哈希显式 HTTP 500 + UNREGISTERED_HASH，**禁止 fallback**（避免假绿灯）
 * - delayMs 可控（S7 竞态测试：2000/500/50ms 不同延迟）
 * - 不预计算 fixture 文件哈希（前端 processImageFile 会压缩重新编码）
 *
 * 使用：
 *   const { server, port } = await startFakeProvider(0); // 0 = OS 分配端口
 *   // ... 注册 + 测试 ...
 *   await stopFakeProvider(server);
 *
 * 关联：case-analyzer.ts 用 OpenAI SDK client.chat.completions.create() 调用此服务器，
 *      响应格式必须严格匹配 OpenAI ChatCompletion（choices[0].message.content = JSON 字符串）。
 */

import http, { type Server, type IncomingMessage, type ServerResponse } from 'http';
import crypto from 'crypto';

// ─── Mock 响应数据（r3.1 §3 任务 2.1 + §7.2 MOCK_RESULTS）──────────────
// 严格匹配 case-analyzer.ts Zod schema 的 7 字段（transcript / questionSummary /
// textbookTopicCandidates / knowledgeNodeCandidates / initialFeedback /
// possibleMistakeReason / nextActionSuggestion）

export interface MockResult {
  transcript: string;
  questionSummary: string;
  textbookTopicCandidates: Array<{ topicId: string; confidence: number; reason: string }>;
  knowledgeNodeCandidates: Array<{ nodeId: string; confidence: number; reason: string }>;
  initialFeedback: string;
  possibleMistakeReason: string;
  nextActionSuggestion: string;
}

export const MOCK_RESULTS: Record<string, MockResult> = {
  // ─── 素材组 A（图像质量与降级，统一 TB-010）──────────────────
  'clear-printed': {
    transcript: '这道题是判断函数单调性的',
    questionSummary: '判断 f(x)=x²-2x 在 [0,3] 上的单调性',
    textbookTopicCandidates: [
      { topicId: 'TB-010', confidence: 0.85, reason: '函数单调性判断' },
    ],
    knowledgeNodeCandidates: [
      { nodeId: 'M2a-13', confidence: 0.8, reason: '用定义判断单调性' },
    ],
    initialFeedback: '你很仔细，推导过程写得很完整',
    possibleMistakeReason: '可能在符号变换时出了差错',
    nextActionSuggestion: '回看 3.2 函数的基本性质，重点检查移项后的符号',
  },
  'with-handwriting': {
    transcript: '我先用导数算的，然后代入端点值比较',
    questionSummary: '利用导数判断函数单调性',
    textbookTopicCandidates: [
      { topicId: 'TB-010', confidence: 0.75, reason: '导数与单调性' },
    ],
    knowledgeNodeCandidates: [
      { nodeId: 'M2a-13', confidence: 0.7, reason: '导数应用' },
    ],
    initialFeedback: '思路很清晰，知道用导数来分析',
    possibleMistakeReason: '可能在计算导数时漏了系数',
    nextActionSuggestion: '回看 3.3 节相关内容，检查求导过程',
  },
  'tilted-partial': {
    // CL-08 降级路径：空候选触发 textbookTopicId=null + 无 vlm tag
    transcript: '',
    questionSummary: '图片不太完整，能看到部分函数内容',
    textbookTopicCandidates: [],
    knowledgeNodeCandidates: [],
    initialFeedback: '这道题拍得有点斜，不过没关系，先帮你收着',
    possibleMistakeReason: '', // 空 → 隐藏区块
    nextActionSuggestion: '下次拍照时尽量把题目拍完整，方便 AI 更好地帮你整理',
  },
  // ─── 素材组 B（跨章节分类，各自映射正确章节）──────────────────
  'set-theory': {
    transcript: '这道题是求集合的交集和并集',
    questionSummary: '已知集合 A 和 B，求 A∩B 和 A∪B',
    textbookTopicCandidates: [
      { topicId: 'TB-003', confidence: 0.88, reason: '集合的基本运算' },
    ],
    knowledgeNodeCandidates: [
      { nodeId: 'M1a-01', confidence: 0.85, reason: '集合运算' },
    ],
    initialFeedback: '集合运算做得很清楚',
    possibleMistakeReason: '可能在求补集时漏了全集',
    nextActionSuggestion: '回看 1.3 集合的基本运算',
  },
  'inequality': {
    transcript: '解一元二次不等式，先因式分解',
    questionSummary: '解不等式 x²-5x+6>0',
    textbookTopicCandidates: [
      { topicId: 'TB-008', confidence: 0.86, reason: '一元二次不等式' },
    ],
    knowledgeNodeCandidates: [
      { nodeId: 'M2a-05', confidence: 0.82, reason: '一元二次不等式解法' },
    ],
    initialFeedback: '思路正确，先因式分解再判断',
    possibleMistakeReason: '可能开口方向判断反了',
    nextActionSuggestion: '回看 2.3 一元二次不等式',
  },
  'function-graph': {
    transcript: '看函数图象判断单调区间',
    questionSummary: '根据函数图象判断单调递增和递减区间',
    textbookTopicCandidates: [
      { topicId: 'TB-010', confidence: 0.84, reason: '函数的基本性质' },
    ],
    knowledgeNodeCandidates: [
      { nodeId: 'M2a-13', confidence: 0.79, reason: '图象法判断单调性' },
    ],
    initialFeedback: '从图象读单调性做得不错',
    possibleMistakeReason: '',
    nextActionSuggestion: '回看 3.2 节相关练习',
  },
};

// ─── 动态注册表（运行时由 /__test/register 写入）──────────────────
//
// r3.1 关键修正：不预计算 fixture 文件哈希
// 前端 processImageFile() 会通过 Canvas 压缩重新编码（maxWidth 1280 / quality 0.7），
// fixture 原始 data URL ≠ 压缩后 data URL ≠ Provider 收到的 image_url.url
// 因此改为运行时动态注册，由测试通过控制端点写入映射

interface RegisteredEntry {
  mock: MockResult;
  delayMs?: number;
}

// 每次启动一个新服务器使用独立的注册表，避免并发测试串扰
function createRegistrationStore() {
  const registeredHashes = new Map<string, RegisteredEntry>();
  return {
    get: (hash: string) => registeredHashes.get(hash),
    set: (hash: string, entry: RegisteredEntry) => registeredHashes.set(hash, entry),
    clear: () => registeredHashes.clear(),
    size: () => registeredHashes.size,
  };
}

export interface FakeProviderStore {
  get: (hash: string) => RegisteredEntry | undefined;
  set: (hash: string, entry: RegisteredEntry) => void;
  clear: () => void;
  size: () => number;
}

// ─── 请求体读取辅助 ──────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// ─── 从 chat completions 请求体提取 image_url.url ───────────────
//
// case-analyzer.ts 构造的请求体：
//   { messages: [{ role: 'user', content: [
//     { type: 'text', text: prompt },
//     { type: 'image_url', image_url: { url: imageDataUrl } },
//     ...可选 input_audio
//   ]}]}

function extractImageUrl(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const root = parsed as { messages?: Array<{ content?: unknown }> };
  const firstMsg = root.messages?.[0];
  if (!firstMsg || !Array.isArray(firstMsg.content)) return '';
  for (const part of firstMsg.content) {
    if (
      part &&
      typeof part === 'object' &&
      (part as { type?: string }).type === 'image_url'
    ) {
      const imageUrl = (part as { image_url?: { url?: string } }).image_url;
      return imageUrl?.url ?? '';
    }
  }
  return '';
}

// ─── 启动 / 停止 ──────────────────────────────────────────

export interface StartedFakeProvider {
  server: Server;
  port: number;
  store: FakeProviderStore;
}

/**
 * 启动假 Provider。
 *
 * @param port 监听端口；传 0 由 OS 分配随机端口（推荐，避免并发测试冲突）
 * @returns server + 实际端口 + 独立注册表（同进程多次启动互不干扰）
 */
export function startFakeProvider(port = 0): Promise<StartedFakeProvider> {
  return new Promise((resolve, reject) => {
    const store = createRegistrationStore();

    const server = http.createServer(async (req, res) => {
      try {
        // ─── 测试控制端点：注册压缩后 data URL 的哈希 → mock 响应 ───
        if (req.url === '/__test/register' && req.method === 'POST') {
          const bodyText = await readBody(req);
          let payload: { dataUrl?: string; fixtureName?: string; delayMs?: number };
          try {
            payload = JSON.parse(bodyText);
          } catch {
            sendJson(res, 400, { error: 'INVALID_JSON', message: 'register body 非合法 JSON' });
            return;
          }
          const { dataUrl, fixtureName, delayMs } = payload;
          if (!dataUrl || typeof dataUrl !== 'string') {
            sendJson(res, 400, { error: 'MISSING_DATA_URL', message: 'dataUrl 必填' });
            return;
          }
          if (!fixtureName || !MOCK_RESULTS[fixtureName]) {
            sendJson(res, 400, {
              error: 'UNKNOWN_FIXTURE',
              message: `fixtureName 必须是 ${Object.keys(MOCK_RESULTS).join('/')} 之一`,
            });
            return;
          }
          const hash = crypto.createHash('sha256').update(dataUrl).digest('hex');
          const entry: RegisteredEntry = { mock: MOCK_RESULTS[fixtureName] };
          if (typeof delayMs === 'number' && delayMs > 0) entry.delayMs = delayMs;
          store.set(hash, entry);
          sendJson(res, 200, { ok: true, hash });
          return;
        }

        // ─── OpenAI 兼容接口 ───
        if (req.url === '/chat/completions' && req.method === 'POST') {
          const bodyText = await readBody(req);
          let parsed: unknown;
          try {
            parsed = JSON.parse(bodyText);
          } catch {
            sendJson(res, 400, { error: 'INVALID_JSON', message: 'chat completions body 非合法 JSON' });
            return;
          }

          const imageUrl = extractImageUrl(parsed);
          if (!imageUrl) {
            sendJson(res, 400, {
              error: 'NO_IMAGE_URL',
              message: '请求体未找到 image_url.url',
            });
            return;
          }

          const hash = crypto.createHash('sha256').update(imageUrl).digest('hex');
          const entry = store.get(hash);

          // r3.1 关键修正：未注册哈希显式报错，禁止 fallback
          if (!entry) {
            sendJson(res, 500, {
              error: 'UNREGISTERED_HASH',
              hash,
              message:
                '此题图哈希未注册。请检查 Playwright 是否拦截了 POST /api/nana/cases 并调用了 /__test/register',
              hint: '若 S7 竞态测试失败，请检查 setupFixtureRegistration 是否正确提取了 artifacts[].content',
            });
            return;
          }

          // 可选延迟（S7 竞态测试用）
          const delay = entry.delayMs ?? 0;
          setTimeout(() => {
            // 严格模拟 OpenAI chat completion 响应格式
            // case-analyzer.ts 用 response.choices[0].message.content 提取
            // content 必须是 JSON 字符串（会被 JSON.parse + Zod 校验）
            const response = {
              id: 'chatcmpl-fake-' + Date.now(),
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: 'fake-doubao-lite',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: JSON.stringify(entry.mock),
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            };
            sendJson(res, 200, response);
          }, delay);
          return;
        }

        // ─── 未知路径 ───
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND', path: req.url }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: 'INTERNAL', message });
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, port: actualPort, store });
    });
  });
}

export function stopFakeProvider(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
