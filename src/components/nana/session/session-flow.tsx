/**
 * SessionFlow — 答题流程编排
 *
 * 三步流程：
 *  1. 答题中（answering）：逐题展示 → 作答或跳过
 *  2. 核对一下（reviewing）：逐题对照 answerKey → 手动标记 correct
 *  3. 提交（submitting）：POST /api/diagnosis/submit-answers → 跳转报告页
 *
 * 状态管理：
 * - items 来自 session-items API
 * - questionStates 跟踪每道题的作答/跳过/核对状态
 * - step 控制当前处于哪个阶段
 */
"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createSessionItems,
  submitAnswers,
  CreateSessionItemsResponse,
  AnswerKeyEntry,
  SessionItemResponse,
} from "@/lib/nana/nana-api-client";
import { QuestionCard } from "./question-card";
import { ReviewStep } from "./review-step";

type FlowStep = "loading" | "answering" | "reviewing" | "submitting" | "done";

interface QuestionState {
  itemId: string;
  nodeId: string;
  stem: string;
  nodeName?: string;
  answerStatus: "pending" | "answered" | "skipped";
  reviewStatus?: "pending" | "passed" | "stuck";
}

interface SessionFlowProps {
  studentId: string;
  mainlineId?: string;
  /** 预加载的题单数据（由父页面从 sessionStorage 提供），
   *  传入后跳过 API 调用直接进入答题 */
  initialItems?: SessionItemResponse[];
  initialAnswerKey?: AnswerKeyEntry[];
  sessionId?: string;
}

export function SessionFlow({
  studentId,
  mainlineId = "M2a",
  initialItems,
  initialAnswerKey,
  sessionId: propSessionId,
}: SessionFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<FlowStep>(
    initialItems ? "answering" : "loading"
  );
  const [sessionId, setSessionId] = useState<string | null>(
    propSessionId ?? null
  );
  const [items, setItems] = useState<SessionItemResponse[]>(initialItems ?? []);
  const [answerKey, setAnswerKey] = useState<AnswerKeyEntry[]>(
    initialAnswerKey ?? []
  );
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ─── 初始化：创建 session 并获取题单 ───
  const initSession = useCallback(async () => {
    setError(null);
    try {
      const data: CreateSessionItemsResponse = await createSessionItems(studentId, mainlineId);
      setSessionId(data.sessionId);
      setItems(data.items);
      setAnswerKey(data.answerKey);
      setQuestionStates(
        data.items.map((item) => ({
          itemId: item.itemId,
          nodeId: item.nodeId,
          stem: item.stem,
          nodeName: item.nodeName,
          answerStatus: "pending",
          reviewStatus: "pending",
        }))
      );
      setCurrentIndex(0);
      setStep("answering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建题单失败");
    }
  }, [studentId, mainlineId]);

  // 首次挂载时初始化：
  // - 有预加载数据 → 直接构建 questionStates
  // - 无预加载数据 → 调用 API 创建 session
  useEffect(() => {
    if (initialItems) {
      setQuestionStates(
        initialItems.map((item) => ({
          itemId: item.itemId,
          nodeId: item.nodeId,
          stem: item.stem,
          nodeName: item.nodeName,
          answerStatus: "pending",
          reviewStatus: "pending",
        }))
      );
    } else {
      initSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 进度点计算 ───
  const getProgressDots = (phase: "answer" | "review") => {
    if (phase === "answer") {
      return questionStates.map((qs, i) => {
        if (i < currentIndex) return "done" as const;
        if (i === currentIndex) return "current" as const;
        return "pending" as const;
      });
    } else {
      return questionStates.map((qs, i) => {
        if (qs.reviewStatus !== "pending") return "done" as const;
        if (i === currentIndex) return "current" as const;
        return "pending" as const;
      });
    }
  };

  // ─── 答题阶段 ───
  const handleAnswer = (answer: string) => {
    setQuestionStates((prev) => {
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], answerStatus: "answered" };
      return next;
    });
    advanceToNextQuestion();
  };

  const handleSkip = () => {
    setQuestionStates((prev) => {
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], answerStatus: "skipped" };
      return next;
    });
    // 跳过后不自动推进，等待用户点 "下一道"
  };

  const handleNextAfterSkip = () => {
    advanceToNextQuestion();
  };

  const advanceToNextQuestion = () => {
    if (currentIndex < questionStates.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // 所有题已答完 → 进入核对阶段
      setCurrentIndex(0);
      setStep("reviewing");
    }
  };

  // ─── 核对阶段 ───
  const handleReviewMark = (correct: boolean) => {
    setQuestionStates((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        ...next[currentIndex],
        reviewStatus: correct ? "passed" : "stuck",
      };
      return next;
    });

    // 前进到下一道
    if (currentIndex < questionStates.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // 全部标记完 → 提交
      handleSubmitAll();
    }
  };

  // ─── 提交阶段 ───
  const handleSubmitAll = async () => {
    if (!sessionId) return;
    setStep("submitting");

    try {
      // 构建 answers 数组：只提交标记为 passed 或 stuck 的（跳过的题不提交）
      const answers = questionStates
        .filter((qs) => qs.reviewStatus === "passed" || qs.reviewStatus === "stuck")
        .map((qs) => ({
          nodeId: qs.nodeId,
          itemId: qs.itemId,
          correct: qs.reviewStatus === "passed",
        }));

      await submitAnswers(sessionId, studentId, mainlineId, answers);

      setStep("done");

      // 跳转到报告页
      router.push(`/nana/session/${sessionId}/report`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
      setStep("reviewing");
    }
  };

  // ─── 渲染 ───
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-center text-[#B35C4A]">{error}</p>
        <button
          onClick={() => {
            setError(null);
            initSession();
          }}
          className="rounded-full bg-[#5E8868] px-6 py-3 text-sm font-medium text-white shadow-md"
        >
          再试一次
        </button>
      </div>
    );
  }

  if (step === "loading" || step === "submitting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <div className="size-8 animate-spin rounded-full border-2 border-[#7FA886] border-t-transparent" />
        <p className="text-sm text-[#8C857B]">
          {step === "loading" ? "准备题目中…" : "提交中…"}
        </p>
      </div>
    );
  }

  if (questionStates.length === 0) {
    return null;
  }

  const currentQuestion = questionStates[currentIndex];

  return (
    <div className="flex flex-1 flex-col">
      {step === "answering" && currentQuestion && (
        <QuestionCard
          stem={currentQuestion.stem}
          questionIndex={currentIndex}
          totalQuestions={questionStates.length}
          progressDots={getProgressDots("answer")}
          isSkipped={currentQuestion.answerStatus === "skipped"}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
          onNext={handleNextAfterSkip}
        />
      )}

      {step === "reviewing" && currentQuestion && (
        <ReviewStep
          stem={currentQuestion.stem}
          answerKey={
            answerKey.find((ak) => ak.itemId === currentQuestion.itemId)?.answer ??
            ""
          }
          nodeName={currentQuestion.nodeName}
          reviewIndex={currentIndex}
          totalReviews={questionStates.length}
          progressDots={getProgressDots("review")}
          onMark={handleReviewMark}
        />
      )}

      {step === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-lg text-[#403A33]">已完成提交 ✅</p>
          <p className="text-sm text-[#8C857B]">正在跳转到报告页…</p>
        </div>
      )}
    </div>
  );
}
