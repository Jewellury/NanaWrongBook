/**
 * QuestionImageViewer — 题图查看器（固定不可滚动）
 *
 * 展示题目的数学题面卡片：
 * - 白色卡片背景，左侧金色竖条（mockup 风格）
 * - 题号 + 题目内容
 * - 固定在上半屏（父组件控制高度）
 *
 * Props:
 * - stem: 题面文本（支持 \n 换行）
 * - questionNumber?: 题号（默认 "第 3 题"）
 */

interface QuestionImageViewerProps {
  stem: string;
  questionNumber?: string;
}

export function QuestionImageViewer({
  stem,
  questionNumber = "第 3 题",
}: QuestionImageViewerProps) {
  // 按换行分割题面，保留 (1)/(2) 子题结构
  const lines = stem.split("\n");
  // 第一行是主函数表达式，其余是子题
  const mainLine = lines[0] ?? "";
  const subLines = lines.slice(1);

  return (
    <div className="relative flex h-full w-full items-center justify-center px-5 py-4">
      {/* "题目一直在这儿 ✦" 浮动标签 */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] text-[#A99A82] backdrop-blur-sm">
          题目一直在这儿 ✦
        </span>
      </div>

      {/* 题面卡片 */}
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#FFFDF8] shadow-[0_10px_26px_rgba(90,80,66,0.18)]">
        {/* 左侧金色竖条 */}
        <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-[#F4E7CE]" />

        <div className="flex h-full flex-col justify-center px-6 py-5">
          {/* 题号 */}
          <div className="text-[13px] font-semibold tracking-wider text-[#B4905A]">
            {questionNumber}
          </div>

          {/* 主函数表达式 */}
          <div className="mt-3 font-serif text-[19px] leading-relaxed text-[#2F2A23]">
            {mainLine}
          </div>

          {/* 子题（(1)(2) 等） */}
          {subLines.length > 0 && (
            <div className="mt-4 font-serif text-[16.5px] leading-relaxed text-[#3A352D]">
              {subLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
