/**
 * RecapBar — 首页回顾条组件（有记录态）
 *
 * 三态分支（修断点 2 · DP2 措辞铁律 OPS §4）：
 * - 有点亮（hasLitNodes）：维持现状——"上次你点亮了：X" / "你的地图上已经有 N 个光点了"。
 * - 只收过题、没点亮（!hasLitNodes && collectedNodeCount>0）：换措辞——
 *   "你最近收过题的知识点有 N 个" / "还没做小检查，做完就能点亮它们 ✦"。
 *   绝不说"点亮了"（没测过不说点亮，诚实）。按"知识点数"计数（collectedNodes.length）。
 * - 都没有：调用方不渲染本组件（EmptyHint）。
 *
 * 措辞合规（OPS §4）：不出现 诊断/已诊断/薄弱/得分/掌握/失败。
 */
import Link from "next/link";

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
  // 分支二：只有 collected、没点亮 → 说"收过题"不说"点亮了"（DP2）
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
            <Link
              href="/nana/session"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#D97706] transition-colors hover:text-[#B45309]"
            >
              去做小检查，点亮它们
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 分支一：有点亮节点 → 维持现状（"点亮了"措辞，绿色语义不变）
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
            你的地图上已经有 {totalLitCount} 个光点了
          </p>
          <Link
            href="/nana/session"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#D97706] transition-colors hover:text-[#B45309]"
          >
            去做小检查，点亮它们
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
