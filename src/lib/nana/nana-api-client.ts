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
