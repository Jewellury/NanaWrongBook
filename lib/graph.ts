/**
 * 知识图谱内存模块
 *
 * 应用启动时加载全图到内存，所有遍历在内存完成，不写递归 SQL。
 * 节点预计 <400，边 <1000，毫秒级加载。
 *
 * 提供两种构造方式：
 * - fromData(nodes, edges, mainlineNodes?)：从内存数组构造（测试友好，不依赖数据库）
 * - load()：从 Prisma 加载全量数据（生产环境用）
 */

import { PrismaClient } from '@prisma/client';

// ---- 类型定义 ----

export interface GraphNode {
  id: string;
  name: string;
  layer: string;
  tier: string | null;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: string; // "prerequisite" | "tool"
}

// ---- 环检测用 ----

const WHITE = 0; // 未访问
const GRAY = 1;  // 正在栈中
const BLACK = 2; // 已出栈

// ---- 图谱类 ----

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode>;

  // prerequisite 边专用（图遍历 / 祖先传播 / 环检测只走这套）
  private prereqOutEdges: Map<string, string[]>; // nodeId → 直接后继（仅 prerequisite）
  private prereqInEdges: Map<string, string[]>;  // nodeId → 直接前驱（仅 prerequisite）

  // 全量边（含 tool，供 getStats / 讲解引用）
  private allOutCount: number;

  // 主线-节点映射
  private mainlineNodes: Map<string, Set<string>>; // mainlineId → nodeId[]

  private constructor() {
    this.nodes = new Map();
    this.prereqOutEdges = new Map();
    this.prereqInEdges = new Map();
    this.allOutCount = 0;
    this.mainlineNodes = new Map();
  }

  // ========== 构造方法 ==========

  /**
   * 从内存数组直接构造图谱（测试友好，不依赖数据库）
   *
   * @param nodes        节点列表
   * @param edges        边列表（含 prerequisite 和 tool）
   * @param mainlineNodes 可选的主线-节点映射 { mainlineId: [nodeId, ...] }
   */
  static fromData(
    nodes: GraphNode[],
    edges: GraphEdge[],
    mainlineNodes?: Record<string, string[]>,
  ): KnowledgeGraph {
    const graph = new KnowledgeGraph();

    for (const n of nodes) {
      graph.nodes.set(n.id, { ...n });
      graph.prereqOutEdges.set(n.id, []);
      graph.prereqInEdges.set(n.id, []);
    }

    for (const e of edges) {
      // 防御悬空边
      if (!graph.nodes.has(e.sourceId) || !graph.nodes.has(e.targetId)) continue;

      // tool 边计入总数但不参与图遍历（BKT 祖先传播不能走弱工具边）
      if (e.type === 'tool') {
        graph.allOutCount++;
        continue;
      }

      // prerequisite 边：入遍历邻接表
      if (e.type === 'prerequisite') {
        graph.prereqOutEdges.get(e.sourceId)!.push(e.targetId);
        graph.prereqInEdges.get(e.targetId)!.push(e.sourceId);
        graph.allOutCount++;
      }
    }

    // 加载主线-节点映射
    if (mainlineNodes) {
      for (const [mlId, nodeIds] of Object.entries(mainlineNodes)) {
        graph.mainlineNodes.set(mlId, new Set(nodeIds));
      }
    }

    // 检测环（只走 prerequisite 边，tool 边不构成诊断意义上的环）
    graph.detectCycles();

    return graph;
  }

  /**
   * 从 Prisma 数据库加载全量图谱（生产环境用）
   */
  static async load(prisma?: PrismaClient): Promise<KnowledgeGraph> {
    const p = prisma ?? new PrismaClient();
    const shouldDisconnect = !prisma;

    try {
      // 加载节点
      const nodeRows = await p.knowledgeNode.findMany({
        select: { id: true, name: true, layer: true, tier: true },
      });

      // 加载所有边（prerequisite + tool）
      const edgeRows = await p.knowledgeEdge.findMany({
        select: { sourceId: true, targetId: true, type: true },
      });

      // 加载主线-节点关联
      const nmRows = await p.nodeMainline.findMany({
        select: { nodeId: true, mainlineId: true },
      });

      const nodes: GraphNode[] = nodeRows.map((r) => ({
        id: r.id,
        name: r.name,
        layer: r.layer,
        tier: r.tier,
      }));

      const edges: GraphEdge[] = edgeRows.map((r) => ({
        sourceId: r.sourceId,
        targetId: r.targetId,
        type: r.type,
      }));

      // 组装主线-节点映射
      const mlMap: Record<string, string[]> = {};
      for (const row of nmRows) {
        if (!mlMap[row.mainlineId]) mlMap[row.mainlineId] = [];
        mlMap[row.mainlineId].push(row.nodeId);
      }

      return KnowledgeGraph.fromData(nodes, edges, mlMap);
    } finally {
      if (shouldDisconnect) await p.$disconnect();
    }
  }

  // ========== 查询方法 ==========

  /**
   * 获取直接前置节点列表（仅 prerequisite 边，反向一步）
   */
  prereqsOf(nodeId: string): GraphNode[] {
    const inList = this.prereqInEdges.get(nodeId);
    if (!inList) return [];
    return inList.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * 递归获取全部前置节点（仅 prerequisite 边，反向 BFS 闭包）
   */
  allPrereqsOf(nodeId: string): GraphNode[] {
    const visited = new Set<string>();
    const queue = [nodeId];
    const result: GraphNode[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const inList = this.prereqInEdges.get(current);
      if (!inList) continue;

      for (const preId of inList) {
        if (visited.has(preId)) continue;
        visited.add(preId);
        const node = this.nodes.get(preId);
        if (node) {
          result.push(node);
          queue.push(preId);
        }
      }
    }

    return result;
  }

  /**
   * 获取直接依赖当前节点的节点列表（仅 prerequisite 边，正向一步）
   */
  dependentsOf(nodeId: string): GraphNode[] {
    const outList = this.prereqOutEdges.get(nodeId);
    if (!outList) return [];
    return outList.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * 获取某条主线及其全部前置节点组成的子图
   *
   * 算法：
   * 1. 找到该主线下的所有节点
   * 2. 对每个节点递归收集全部前置（仅 prerequisite 边）
   * 3. 去重返回
   */
  mainlineSubgraph(mainlineId: string): GraphNode[] {
    const mlNodeIds = this.mainlineNodes.get(mainlineId);
    if (!mlNodeIds || mlNodeIds.size === 0) {
      console.warn(
        `[KnowledgeGraph] mainlineSubgraph("${mainlineId}") — 该主线下无节点（可能未加载 NodeMainline 数据）`
      );
      return [];
    }

    const resultSet = new Set<string>();

    for (const nodeId of mlNodeIds) {
      resultSet.add(nodeId);
      const prereqs = this.allPrereqsOf(nodeId);
      for (const p of prereqs) {
        resultSet.add(p.id);
      }
    }

    return Array.from(resultSet).map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  // ========== 环检测 ==========

  /**
   * 检测图中是否有环（DFS 三色标记法，仅 prerequisite 边）
   * @returns true 表示有环，false 表示无环
   */
  detectCycles(): boolean {
    const color = new Map<string, number>();
    for (const nodeId of this.nodes.keys()) {
      color.set(nodeId, WHITE);
    }

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      const outList = this.prereqOutEdges.get(nodeId);
      if (outList) {
        for (const nextId of outList) {
          const c = color.get(nextId);
          if (c === GRAY) {
            console.warn(`[KnowledgeGraph] ⚠️  检测到环：涉及节点 "${nodeId}" → "${nextId}"`);
            return true;
          }
          if (c === WHITE) {
            if (dfs(nextId)) return true;
          }
        }
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (color.get(nodeId) === WHITE) {
        if (dfs(nodeId)) return true;
      }
    }

    return false;
  }

  // ========== 工具方法 ==========

  /** 获取所有节点 */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /** 通过 ID 获取节点 */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** 获取主线下所属的节点 ID 集合 */
  getMainlineNodeIds(mainlineId: string): string[] {
    const s = this.mainlineNodes.get(mainlineId);
    return s ? Array.from(s) : [];
  }

  /** 获取统计信息 */
  getStats(): { nodeCount: number; edgeCount: number } {
    let prereqCount = 0;
    for (const list of this.prereqOutEdges.values()) {
      prereqCount += list.length;
    }
    return { nodeCount: this.nodes.size, edgeCount: this.allOutCount };
  }
}
