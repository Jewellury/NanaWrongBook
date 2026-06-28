/**
 * Nana Session API 客户端 · 单元测试
 *
 * mock fetch 验证 createSessionItems / getSessionList / submitAnswers / getSessionDetail 的行为。
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  createSessionItems,
  getSessionList,
  submitAnswers,
  getSessionDetail,
} from "@/lib/nana/nana-api-client";

describe("nana-api-client / session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSessionItems", () => {
    test("发送 POST 请求并返回题单数据", async () => {
      const mockResponse = {
        sessionId: "sess-001",
        studentId: "user-1",
        mainlineId: "M2a",
        items: [
          { itemId: "item-1", nodeId: "M2a-03", nodeName: "求函数定义域", stem: "求定义域" },
        ],
        answerKey: [
          { itemId: "item-1", nodeId: "M2a-03", answer: "x ≥ 1", analysis: "" },
        ],
        itemCount: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await createSessionItems("user-1", "M2a");

      expect(mockFetch).toHaveBeenCalledWith("/api/diagnosis/session-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: "user-1", mainlineId: "M2a" }),
      });
      expect(result.sessionId).toBe("sess-001");
      expect(result.items).toHaveLength(1);
      expect(result.answerKey).toHaveLength(1);
    });

    test("请求失败时抛出错误", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      await expect(createSessionItems("u", "M2a")).rejects.toThrow(
        "createSessionItems 失败: 400"
      );
    });
  });

  describe("getSessionList", () => {
    test("发送 GET 请求并返回列表", async () => {
      const mockResponse = [
        { id: "sess-1", studentId: "user-1", kind: "weekend", startedAt: "2026-06-28T00:00:00Z" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSessionList("user-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/diagnosis/sessions?studentId=user-1"
      );
      expect(result).toHaveLength(1);
    });

    test("请求失败时抛出错误", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(getSessionList("u")).rejects.toThrow("getSessionList 失败: 500");
    });
  });

  describe("submitAnswers", () => {
    test("发送 POST 请求并返回结果", async () => {
      const mockResponse = {
        sessionId: "sess-001",
        nodeStates: [
          { nodeId: "M2a-03", status: "stable", masteryProb: 0.95 },
        ],
        learningFrontier: ["M2a-04"],
        stats: { updatedNodes: 5, answersRecorded: 3 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const answers = [
        { nodeId: "M2a-03", itemId: "item-1", correct: true },
      ];
      const result = await submitAnswers("sess-001", "user-1", "M2a", answers);

      expect(mockFetch).toHaveBeenCalledWith("/api/diagnosis/submit-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-001",
          studentId: "user-1",
          mainlineId: "M2a",
          answers,
        }),
      });
      expect(result.stats.answersRecorded).toBe(3);
    });
  });

  describe("getSessionDetail", () => {
    test("发送 GET 请求并返回详情", async () => {
      const mockResponse = {
        id: "sess-001",
        studentId: "user-1",
        kind: "weekend",
        startedAt: "2026-06-28T00:00:00Z",
        records: [
          { id: "rec-1", sessionId: "sess-001", itemId: "item-1", nodeId: "M2a-03", correct: true, createdAt: "2026-06-28T00:00:00Z" },
        ],
        errors: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSessionDetail("sess-001");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/diagnosis/sessions/sess-001"
      );
      expect(result.records).toHaveLength(1);
      expect(result.records[0].correct).toBe(true);
    });

    test("请求失败时抛出错误", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      await expect(getSessionDetail("nonexistent")).rejects.toThrow(
        "getSessionDetail 失败: 404"
      );
    });
  });
});
