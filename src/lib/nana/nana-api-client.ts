/**
 * Nana API 客户端
 *
 * 封装前端调用 /api/nana/* 和 /api/diagnosis/* 的接口。
 * 遵循上游 api-client.ts 的 fetch 模式。
 */

const NANA_BASE = '/api/nana';
const DIAGNOSIS_BASE = '/api/diagnosis';

export interface ArtifactInput {
  type: string;
  content: string;
  seq?: number;
}

export interface CaseResponse {
  id: string;
  studentId: string;
  createdAt: string;
  artifacts: Array<{
    id: string;
    type: string;
    content: string;
    seq: number;
    createdAt: string;
  }>;
}

/**
 * 创建新 case
 * POST /api/nana/cases
 */
export async function createCase(artifacts: ArtifactInput[]): Promise<CaseResponse> {
  const res = await fetch(`${NANA_BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifacts }),
  });
  if (!res.ok) throw new Error(`createCase 失败: ${res.status}`);
  return res.json();
}

/**
 * 读取指定 case
 * GET /api/nana/cases/:id
 */
export async function getCase(id: string): Promise<CaseResponse> {
  const res = await fetch(`${NANA_BASE}/cases/${id}`);
  if (!res.ok) throw new Error(`getCase 失败: ${res.status}`);
  return res.json();
}

/**
 * 获取知识地图数据
 * GET /api/diagnosis/map?studentId=xxx[&mainlineId=xxx]
 */
export async function getKnowledgeMap(studentId: string, mainlineId?: string) {
  const params = new URLSearchParams({ studentId });
  if (mainlineId) params.set('mainlineId', mainlineId);
  const res = await fetch(`${DIAGNOSIS_BASE}/map?${params}`);
  if (!res.ok) throw new Error(`getKnowledgeMap 失败: ${res.status}`);
  return res.json();
}

// ─── Session API ────────────────────────────────────────

export interface SessionItemResponse {
  itemId: string;
  nodeId: string;
  nodeName: string;
  stem: string;
}

export interface AnswerKeyEntry {
  itemId: string;
  nodeId: string;
  answer: string;
  analysis?: string;
}

export interface CreateSessionItemsResponse {
  sessionId: string;
  studentId: string;
  mainlineId: string;
  items: SessionItemResponse[];
  answerKey: AnswerKeyEntry[];
  itemCount: number;
}

/**
 * 创建新题单
 * POST /api/diagnosis/session-items
 */
export async function createSessionItems(
  studentId: string,
  mainlineId: string
): Promise<CreateSessionItemsResponse> {
  const res = await fetch(`${DIAGNOSIS_BASE}/session-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, mainlineId }),
  });
  if (!res.ok) throw new Error(`createSessionItems 失败: ${res.status}`);
  return res.json();
}

export interface SessionSummary {
  id: string;
  studentId: string;
  kind: string;
  startedAt: string;
}

/**
 * 获取历史 session 列表
 * GET /api/diagnosis/sessions?studentId=xxx
 */
export async function getSessionList(studentId: string): Promise<SessionSummary[]> {
  const params = new URLSearchParams({ studentId });
  const res = await fetch(`${DIAGNOSIS_BASE}/sessions?${params}`);
  if (!res.ok) throw new Error(`getSessionList 失败: ${res.status}`);
  return res.json();
}

export interface SubmitAnswerInput {
  nodeId: string;
  itemId: string;
  correct: boolean;
}

export interface SubmitAnswersResponse {
  sessionId: string;
  nodeStates: { nodeId: string; status: string; masteryProb: number }[];
  learningFrontier: string[];
  stats: { updatedNodes: number; answersRecorded: number };
}

/**
 * 提交答案（学生/大人手动标记 correct 后提交）
 * POST /api/diagnosis/submit-answers
 */
export async function submitAnswers(
  sessionId: string,
  studentId: string,
  mainlineId: string,
  answers: SubmitAnswerInput[]
): Promise<SubmitAnswersResponse> {
  const res = await fetch(`${DIAGNOSIS_BASE}/submit-answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, studentId, mainlineId, answers }),
  });
  if (!res.ok) throw new Error(`submitAnswers 失败: ${res.status}`);
  return res.json();
}

export interface SessionDetailRecord {
  id: string;
  sessionId: string;
  itemId: string;
  nodeId: string;
  correct: boolean;
  durationS?: number;
  createdAt: string;
}

export interface SessionDetail {
  id: string;
  studentId: string;
  kind: string;
  startedAt: string;
  records: SessionDetailRecord[];
}

/**
 * 获取 session 详情（含答题记录）
 * GET /api/diagnosis/sessions/[id]
 */
export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`${DIAGNOSIS_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`getSessionDetail 失败: ${res.status}`);
  return res.json();
}
