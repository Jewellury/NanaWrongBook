/**
 * case 详情缓存 · 单元测试
 *
 * 验证 Stage 2.5 修复（doc/auditlog/stage2.5-followup-rootcause-2026-07-02.md §问题1 根因 B）：
 * 同一 caseId 第二次取命中内存缓存，不再发起网络请求（不重拉 ~1MB base64 题图）。
 * mock fetch（getCase 内部用 fetch），断言调用次数。
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  loadCaseDetail,
  __clearCaseDetailCacheForTests,
} from "@/components/nana/knowledge-map/recent-cases-list";

const CASE_FIXTURE = {
  id: "case-1",
  studentId: "user-1",
  createdAt: "2026-07-02T00:00:00.000Z",
  artifacts: [
    {
      id: "art-1",
      type: "question_image",
      content: "BIG_BASE64_PAYLOAD",
      seq: 0,
      createdAt: "2026-07-02T00:00:00.000Z",
    },
  ],
};

describe("loadCaseDetail — case 详情缓存（Stage 2.5）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearCaseDetailCacheForTests();
  });

  test("首次请求发起 fetch，第二次命中缓存不再请求", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CASE_FIXTURE),
    });

    const first = await loadCaseDetail("case-1");
    const second = await loadCaseDetail("case-1");

    expect(first).toEqual(CASE_FIXTURE);
    expect(second).toEqual(CASE_FIXTURE);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/nana/cases/case-1");
  });

  test("不同 caseId 各自请求一次；回头取已缓存的不再请求", async () => {
    const makeCase = (id: string) => ({
      id,
      studentId: "user-1",
      createdAt: "2026-07-02T00:00:00.000Z",
      artifacts: [],
    });
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            makeCase(url.split("/").pop() as string),
          ),
      }),
    );

    await loadCaseDetail("a");
    await loadCaseDetail("b");
    await loadCaseDetail("a"); // 命中缓存
    await loadCaseDetail("b"); // 命中缓存

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
