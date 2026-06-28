/**
 * Nana 纸质包路由包装页（只做路由包装）
 *
 * 复用已有 src/app/diagnosis/paper-pack/page.tsx 的 PaperPackContent 组件，
 * 从 session 获取 studentId 传入，统一 /nana 路由入口。
 *
 * P4 措辞合规：复用已有纸质包封面"这周的练习小纸条" ✅
 */
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { PaperPackContent } from "@/app/diagnosis/paper-pack/page";

function NanaPaperPackInner() {
  const { data: session } = useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (session !== undefined) {
      setReady(true);
    }
  }, [session]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">请先登录</p>
      </div>
    );
  }

  return <PaperPackContent studentId={session.user.id} />;
}

export default function NanaPaperPackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      }
    >
      <NanaPaperPackInner />
    </Suspense>
  );
}
