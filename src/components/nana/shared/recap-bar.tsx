/**
 * RecapBar — 首页回顾条组件（纯状态提示，不含链接）
 *
 * 职责：给用户一个状态回顾（收过题/点亮了），不是行动入口。
 * 行动入口由三张 ActionCard 统一承担，避免重复 CTA。
 *
 * 两态分支：
 * - 有点亮（hasLitNodes）："上次你点亮了：X / 你的地图上已经有 N 个光点了 ✦"
 * - 只收过题、没点亮（!hasLitNodes && collectedNodeCount>0）：
 *   "你最近收过题的知识点有 N 个 / 还没做小检查，做完就能点亮它们 ✦"
 *   绝不说"点亮了"（没测过不说点亮，诚实）。
 *
 * 措辞合规（OPS §4）：不出现 诊断/已诊断/薄弱/得分/掌握/失败。
 */

interface RecapBarProps {
  /** 上次点亮的节点名称（无点亮时可传空串） */
  latestNodeName: string;
  /** 已点亮节点总数 */
  totalLitCount: number;
  /** 收过题的知识点数（collected 节点数） */
  collectedNodeCount: number;
  /** 是否有点亮节点（决定用"点亮了"还是"收过题"措辞） */
  hasLitNodes: boolean;
}

export function RecapBar({
  latestNodeName,
  totalLitCount,
  collectedNodeCount,
  hasLitNodes,
}: RecapBarProps) {
  // 分支二：只有 collected、没点亮 → 说"收过题"不说"点亮了"
  if (!hasLitNodes && collectedNodeCount > 0) {
    return (
      <div className="rounded-2xl border border-[#E8E0D4] bg-white/80 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg" aria-hidden="true">
            ✦
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#2C2C2C]">
              你最近收过题的知识点有{" "}
              <span className="font-semibold text-[#D97706]">
                {collectedNodeCount}
              </span>{" "}
              个
            </p>
            <p className="mt-1 text-sm text-[#6B625A]">
              还没做小检查，做完就能点亮它们 ✦
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 分支一：有点亮节点 → "点亮了"措辞，绿色语义不变
  return (
    <div className="rounded-2xl border border-[#E8E0D4] bg-white/80 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg" aria-hidden="true">
          ✦
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#2C2C2C]">
            上次你点亮了：
            <span className="font-semibold text-[#D97706]">
              {latestNodeName}
            </span>
          </p>
          <p className="mt-1 text-sm text-[#6B625A]">
            你的地图上已经有 {totalLitCount} 个光点了 ✦
          </p>
        </div>
      </div>
    </div>
  );
}
