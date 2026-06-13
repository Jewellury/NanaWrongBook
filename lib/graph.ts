/**
 * 知识图谱内存模块
 *
 * 应用启动时加载全图到内存，所有遍历在内存完成，不写递归 SQL。
 * 节点预计 <400，边 <1000，毫秒级加载。
 *
 * 提供两种构造方式：
 * - fromData(nodes, edges)：从内存数组构造（测试友好，不依赖数据库）
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
  private outEdges: Map<string, string[]>; // nodeId → 直接后继（target 方向）
  private inEdges: Map<string, string[]>;  // nodeId → 直接前驱（source 方向）

  private constructor() {
    this.nodes = new Map();
    this.outEdges = new Map();
    this.inEdges = new Map();
  }

  // ========== 构造方法 ==========

  /**
   * 从内存数组直接构造图谱（测试友好，不依赖数据库）
   */
  static fromData(nodes: GraphNode[], edges: GraphEdge[]): KnowledgeGraph {
    const graph = new KnowledgeGraph();

    for (const n of nodes) {
      graph.nodes.set(n.id, { ...n });
      graph.outEdges.set(n.id, []);
      graph.inEdges.set(n.id, []);
    }

    for (const e of edges) {
      // 只加载 prerequisite 类型的边（tool 类用在讲解环节，不参与图谱遍历）
      if (e.type !== 'prerequisite' && e.type !== 'tool') continue;
      // 确保源和目标节点都存在（防御悬空边）
      if (!graph.nodes.has(e.sourceId) || !graph.nodes.has(e.targetId)) continue;

      graph.outEdges.get(e.sourceId)!.push(e.targetId);
      graph.inEdges.get(e.targetId)!.push(e.sourceId);
    }

    // 检测环
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

      // 加载 prerequisite 边（tool 边也加载，供讲解引用）
      const edgeRows = await p.knowledgeEdge.findMany({
        select: { sourceId: true, targetId: true, type: true },
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

      return KnowledgeGraph.fromData(nodes, edges);
    } finally {
      if (shouldDisconnect) await p.$disconnect();
    }
  }

  // ========== 查询方法 ==========

  /**
   * 获取直接前置节点列表（沿边反向一步）
   */
  prereqsOf(nodeId: string): GraphNode[] {
    const inList = this.inEdges.get(nodeId);
    if (!inList) return [];
    return inList.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * 递归获取全部前置节点（沿边反向 BFS 闭包）
   */
  allPrereqsOf(nodeId: string): GraphNode[] {
    const visited = new Set<string>();
    const queue = [nodeId];
    const result: GraphNode[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const inList = this.inEdges.get(current);
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
   * 获取直接依赖当前节点的节点列表（沿边正向一步）
   */
  dependentsOf(nodeId: string): GraphNode[] {
    const outList = this.outEdges.get(nodeId);
    if (!outList) return [];
    return outList.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * 获取某条主线及其全部前置节点组成的子图
   *
   * 算法：
   * 1. 找到该主线下的所有节点
   * 2. 对每个节点递归收集全部前置
   * 3. 去重返回
   */
  mainlineSubgraph(mainlineId: string): GraphNode[] {
    // 收集该主线下的节点 ID（需要外部传入，或由 load 时附加主线和节点的映射）
    // 当前实现：遍历所有节点，通过 NodeMainline 表已知信息不便在纯内存图获取
    // 因此该方法需要额外的主线-节点映射。返回空数组提示调用方自行组装。
    //
    // TODO: 在后续迭代中为 KnowledgeGraph 增加 mainlineNodes 映射
    console.warn(
      `[KnowledgeGraph] mainlineSubgraph("${mainlineId}") 暂未实现——图谱当前不持有主线-节点映射。` +
      '后续迭代中补充 NodeMainline 数据加载。'
    );
    return [];
  }

  // ========== 环检测 ==========

  /**
   * 检测图中是否有环（DFS 三色标记法）
   * @returns true 表示有环，false 表示无环
   */
  detectCycles(): boolean {
    const color = new Map<string, number>();
    for (const nodeId of this.nodes.keys()) {
      color.set(nodeId, WHITE);
    }

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      const outList = this.outEdges.get(nodeId);
      if (outList) {
        for (const nextId of outList) {
          const c = color.get(nextId);
          if (c === GRAY) {
            // 发现环：沿当前节点 -> nextId 回到栈中的节点
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

  /** 获取节点通过 ID */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** 获取统计信息 */
  getStats(): { nodeCount: number; edgeCount: number } {
    let edgeCount = 0;
    for (const list of this.outEdges.values()) {
      edgeCount += list.length;
    }
    return { nodeCount: this.nodes.size, edgeCount };
  }
}
