/**
 * RecapBar — 首页回顾条组件（有记录态）
 *
 * Props:
 * - latestNodeName: 上次点亮的节点名称（如"函数的定义域"）
 * - totalLitCount: 地图上已点亮的节点总数
 */
import Link from "next/link";

interface RecapBarProps {
  latestNodeName: string;
  totalLitCount: number;
}

export function RecapBar({ latestNodeName, totalLitCount }: RecapBarProps) {
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
            href="/nana/map"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#D97706] transition-colors hover:text-[#B45309]"
          >
            看看我的知识地图
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
