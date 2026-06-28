/**
 * Session 答题流程页
 *
 * 三步流程：答题 → 核对一下 → 提交
 *
 * 首次加载时从 sessionStorage 读取题单数据（由列表页创建 session 时存入）。
 * 如果无数据（如直接访问 URL 或刷新丢失），提示返回列表页重新开始。
 */
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SessionFlow } from "@/components/nana/session/session-flow";

interface StoredSessionData {
  items: Array<{ itemId: string; nodeId: string; stem: string; nodeName: string }>;
  answerKey: Array<{ itemId: string; nodeId: string; answer: string; analysis?: string }>;
  studentId: string;
  mainlineId: string;
}

export default function SessionDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [sessionData, setSessionData] = useState<StoredSessionData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;

    // 从 sessionStorage 读取题单数据
    const stored = sessionStorage.getItem(`session_${id}`);
    if (stored) {
      try {
        const parsed: StoredSessionData = JSON.parse(stored);
        setSessionData(parsed);
      } catch {
        // 解析失败
      }
    }
    setReady(true);
  }, [id]);

  // 没有数据 → 提示返回
  if (ready && !sessionData) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-center text-[#8C857B]">
            这道检查还没有创建，
            <br />
            请先返回列表页重新开始。
          </p>
          <Link
            href="/nana/session"
            className="rounded-full bg-[#5E8868] px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
          >
            回到检查列表
          </Link>
        </div>
      </div>
    );
  }

  // 等待 sessionData 加载
  if (!ready || !sessionData) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        <div className="flex flex-1 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-[#7FA886] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-[#FBF7F0] px-5 py-8">
      {/* 顶部栏 */}
      <div className="mb-4">
        <Link
          href="/nana/session"
          className="mb-4 inline-flex items-center gap-1 text-sm text-[#8C857B] hover:text-[#403A33]"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-[#2C2C2C]">周末小检查</h1>
          <span className="text-xs text-[#B4ADA3]">随时可以先歇会儿</span>
        </div>
      </div>

      {/* 流程主体 */}
      <SessionFlow
        studentId={sessionData.studentId}
        mainlineId={sessionData.mainlineId}
        sessionId={id}
        initialItems={sessionData.items}
        initialAnswerKey={sessionData.answerKey}
      />
    </div>
  );
}
