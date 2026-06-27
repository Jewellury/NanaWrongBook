/**
 * Nana 段级 Layout（服务端组件）
 *
 * 鉴权守卫：未登录用户重定向到 /login
 * 背景色：bg-[#FBF7F0]（设计基底的奶油暖白色 --bg）
 * 无额外导航栏——首页设计极简，只有行动卡 + recap bar
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function NanaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="nana-layout min-h-screen bg-[#FBF7F0]">{children}</div>
  );
}
