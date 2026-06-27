/**
 * ActionCard — 首页行动卡组件
 *
 * Props:
 * - title: 卡片标题（如"拍一下这道题"）
 * - description: 描述文案（如"把刚卡住的那道拍进来"）
 * - icon: Lucide 图标组件引用
 * - href: 点击跳转链接
 * - iconBgClass: 图标背景色 Tailwind class（如 "bg-green-100"）
 * - iconColorClass: 图标颜色 Tailwind class（如 "text-green-600"）
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface ActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  iconBgClass?: string;
  iconColorClass?: string;
}

export function ActionCard({
  title,
  description,
  icon: Icon,
  href,
  iconBgClass = "bg-green-100",
  iconColorClass = "text-green-600",
}: ActionCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm transition-shadow hover:shadow-md active:scale-[0.98]"
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}
        >
          <Icon className={`size-6 ${iconColorClass}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[#2C2C2C]">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#6B625A]">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}
