"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

interface PracticeItem {
  itemId: string;
  stem: string;
  role: string;
}

interface PaperPackGroup {
  nodeId: string;
  nodeName: string;
  reason: "frontier" | "gap";
  practiceItems: PracticeItem[];
}

interface AnswerKeyEntry {
  itemId: string;
  answer: string;
  analysis: string | null;
}

interface PaperPackData {
  studentId: string;
  studentName: string;
  generatedAt: string;
  totalItems: number;
  encouragement: string;
  groups: PaperPackGroup[];
  answerKey: AnswerKeyEntry[];
}

const RULES = [
  "✏️ 过程写在题目旁边，别擦",
  "🏷️ 做不出来的贴个标签，不空着",
  "➡️ 卡住了画个箭头，跳到下一题",
];

function PaperPackContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId") ?? "";
  const [data, setData] = useState<PaperPackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) {
      setError("缺少 studentId 参数");
      setLoading(false);
      return;
    }
    fetch(`/api/diagnosis/paper-pack?studentId=${encodeURIComponent(studentId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [studentId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">正在生成练习纸...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">出错了：{error}</p>
      </div>
    );
  }

  if (!data || data.totalItems === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-xl">🌟 {data?.encouragement ?? "这周已经练得很棒了！"}</p>
          <p className="text-muted-foreground">当前没有需要巩固的知识点，休息一周吧。</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 打印控制栏 —— 打印时隐藏 */}
      <div className="print:hidden sticky top-0 z-10 bg-background border-b p-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">📋 纸质包预览</h1>
            <p className="text-sm text-muted-foreground">
              {data.studentName} · {data.totalItems} 题 · {data.groups.length} 个知识点
            </p>
          </div>
          <Button onClick={handlePrint} size="sm">
            打印 / 另存为 PDF
          </Button>
        </div>
      </div>

      {/* ======== 打印内容 ======== */}
      <div className="max-w-4xl mx-auto p-8 print:p-0">
        {/* 封面 */}
        <div className="text-center py-16 print:py-8 page-break-after">
          <p className="text-sm text-muted-foreground mb-4">
            {new Date(data.generatedAt).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="text-3xl font-bold mb-6">
            {data.studentName ? `${data.studentName}，` : ""}这周的练习小纸条 ✨
          </h1>
          <p className="text-lg text-muted-foreground mb-12">{data.encouragement}</p>

          <div className="border rounded-lg p-6 max-w-md mx-auto text-left space-y-2 bg-muted/30">
            <p className="font-semibold text-sm mb-2">📌 三条小规则</p>
            {RULES.map((rule, i) => (
              <p key={i} className="text-sm">{rule}</p>
            ))}
          </div>
        </div>

        {/* 练习区 */}
        {data.groups.map((group, gi) => (
          <div key={group.nodeId} className="mb-12 print:mb-8 page-break-before">
            <div className="border-b pb-2 mb-6">
              <h2 className="text-xl font-bold">
                这周咱们练练这个 → {group.nodeName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {group.reason === "frontier" ? "🎯 新关卡，准备攻克" : "🔄 再巩固一下"} ·{" "}
                {group.practiceItems.length} 道练习
              </p>
            </div>

            {group.practiceItems.map((item, ii) => (
              <div key={item.itemId} className="mb-8 print:mb-6">
                <p className="text-sm text-muted-foreground mb-2">
                  第 {gi + 1}-{ii + 1} 题
                </p>
                <div className="text-base leading-relaxed whitespace-pre-wrap border-l-4 border-primary/30 pl-4 py-2">
                  {item.stem}
                </div>
                {/* 手写空间 */}
                <div className="mt-4 border border-dashed rounded min-h-[120px] print:min-h-[100px] bg-muted/10" />
              </div>
            ))}
          </div>
        ))}

        {/* 答案页（分页） */}
        <div className="page-break-before mt-16 print:mt-8">
          <div className="border-t-2 pt-8">
            <h2 className="text-xl font-bold mb-2">🔒 给大人的答案页</h2>
            <p className="text-sm text-muted-foreground mb-8">（做完再看哦）</p>

            {data.groups.map((group, gi) => (
              <div key={group.nodeId} className="mb-6">
                <h3 className="font-semibold mb-3">{group.nodeName}</h3>
                {group.practiceItems.map((item, ii) => {
                  const key = data.answerKey.find((k) => k.itemId === item.itemId);
                  return (
                    <div key={item.itemId} className="mb-4 pl-4 border-l-2 border-muted">
                      <p className="text-sm text-muted-foreground mb-1">
                        第 {gi + 1}-{ii + 1} 题
                      </p>
                      <p className="font-medium">
                        答案：{key?.answer ?? "（暂无）"}
                      </p>
                      {key?.analysis && (
                        <p className="text-sm text-muted-foreground mt-1">
                          解析：{key.analysis}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 页脚 */}
        <div className="text-center text-xs text-muted-foreground mt-16 print:mt-8 py-4 border-t">
          Nana 诊断练习纸 · 仅供个人学习使用
        </div>
      </div>

      {/* 打印样式 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          .page-break-before {
            page-break-before: always;
          }
          .page-break-after {
            page-break-after: always;
          }
          body {
            font-size: 12pt;
          }
        }
      `}</style>
    </>
  );
}

export default function PaperPackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      }
    >
      <PaperPackContent />
    </Suspense>
  );
}
